/**
 * Phase 29: Marketplace Storage
 *
 * Firestore storage for connector marketplace catalog.
 *
 * Collections:
 * - gwi_marketplace_connectors: Published connector metadata
 * - gwi_marketplace_versions: Version-specific metadata
 * - gwi_connector_installations: Tenant installations (subcollection under tenants)
 *
 * @module @gwi/core/marketplace/storage
 */

import { FieldValue, type Firestore, Timestamp } from 'firebase-admin/firestore';
import { getFirestoreClient, timestampToDate } from '../storage/firestore-client.js';
import type {
  PublishedConnector,
  ConnectorVersion,
  ConnectorInstallation,
  MarketplaceSearchOptions,
  MarketplaceSearchResult,
  PendingInstallRequestRecord,
  Publisher,
  PublisherKey,
} from './types.js';

// =============================================================================
// Collection Names
// =============================================================================

export const MARKETPLACE_COLLECTIONS = {
  /** Published connectors catalog */
  CONNECTORS: 'gwi_marketplace_connectors',
  /** Connector versions */
  VERSIONS: 'gwi_marketplace_versions',
  /** Tenant installations (under gwi_tenants/{tenantId}/connector_installs) */
  INSTALLATIONS: 'connector_installs',
  /** Pending install requests (under gwi_tenants/{tenantId}/install_requests) */
  INSTALL_REQUESTS: 'install_requests',
  /** Publishers registry */
  PUBLISHERS: 'gwi_marketplace_publishers',
} as const;

// =============================================================================
// Marketplace Store Interface
// =============================================================================

export interface MarketplaceStore {
  // Connector catalog
  getConnector(connectorId: string): Promise<PublishedConnector | null>;
  listConnectors(options?: MarketplaceSearchOptions): Promise<MarketplaceSearchResult>;
  searchConnectors(query: string, options?: MarketplaceSearchOptions): Promise<MarketplaceSearchResult>;
  createConnector(connector: PublishedConnector): Promise<void>;
  updateConnector(connectorId: string, updates: Partial<PublishedConnector>): Promise<void>;
  deleteConnector(connectorId: string): Promise<void>;
  incrementDownloads(connectorId: string): Promise<void>;

  // Versions
  getVersion(connectorId: string, version: string): Promise<ConnectorVersion | null>;
  listVersions(connectorId: string): Promise<ConnectorVersion[]>;
  createVersion(version: ConnectorVersion): Promise<void>;
  deprecateVersion(connectorId: string, version: string, reason: string): Promise<void>;
  incrementVersionDownloads(connectorId: string, version: string): Promise<void>;

  // Installations (tenant-scoped)
  getInstallation(tenantId: string, connectorId: string): Promise<ConnectorInstallation | null>;
  listInstallations(tenantId: string): Promise<ConnectorInstallation[]>;
  createInstallation(installation: ConnectorInstallation): Promise<void>;
  updateInstallation(
    tenantId: string,
    connectorId: string,
    updates: Partial<ConnectorInstallation>
  ): Promise<void>;
  deleteInstallation(tenantId: string, connectorId: string): Promise<void>;

  // Pending install requests (Phase 30 fixup: Firestore persistence)
  getInstallRequest(tenantId: string, requestId: string): Promise<PendingInstallRequestRecord | null>;
  getInstallRequestByIdempotencyKey(tenantId: string, key: string): Promise<PendingInstallRequestRecord | null>;
  listPendingInstallRequests(tenantId: string): Promise<PendingInstallRequestRecord[]>;
  createInstallRequest(request: PendingInstallRequestRecord): Promise<void>;
  updateInstallRequest(
    tenantId: string,
    requestId: string,
    updates: Partial<PendingInstallRequestRecord>
  ): Promise<void>;
  deleteInstallRequest(tenantId: string, requestId: string): Promise<void>;

  // Publishers (Phase 30 fixup: Key registry)
  getPublisher(publisherId: string): Promise<Publisher | null>;
  getPublisherByKeyId(keyId: string): Promise<Publisher | null>;
  listPublishers(): Promise<Publisher[]>;
  createPublisher(publisher: Publisher): Promise<void>;
  updatePublisher(publisherId: string, updates: Partial<Publisher>): Promise<void>;
  addPublisherKey(publisherId: string, key: PublisherKey): Promise<void>;
  revokePublisherKey(publisherId: string, keyId: string, reason: string): Promise<void>;
}

// =============================================================================
// Firestore Marketplace Store
// =============================================================================

export class FirestoreMarketplaceStore implements MarketplaceStore {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreClient();
  }

  // ===========================================================================
  // Connector Catalog
  // ===========================================================================

  async getConnector(connectorId: string): Promise<PublishedConnector | null> {
    const doc = await this.db
      .collection(MARKETPLACE_COLLECTIONS.CONNECTORS)
      .doc(connectorId)
      .get();

    if (!doc.exists) return null;
    return this.connectorFromFirestore(doc.data()!);
  }

  async listConnectors(options?: MarketplaceSearchOptions): Promise<MarketplaceSearchResult> {
    let query = this.db.collection(MARKETPLACE_COLLECTIONS.CONNECTORS) as FirebaseFirestore.Query;

    // Apply filters
    if (options?.verified !== undefined) {
      query = query.where('verified', '==', options.verified);
    }
    if (options?.featured) {
      query = query.where('featured', '==', true);
    }
    if (options?.categories?.length) {
      query = query.where('categories', 'array-contains-any', options.categories.slice(0, 10));
    }

    // Apply sorting
    const sortBy = options?.sortBy || 'downloads';
    const sortOrder = options?.sortOrder || 'desc';
    query = query.orderBy(sortBy === 'name' ? 'displayName' : sortBy, sortOrder);

    // Pagination
    const page = options?.page || 1;
    const pageSize = Math.min(options?.pageSize || 20, 50);
    const offset = (page - 1) * pageSize;

    if (offset > 0) {
      query = query.offset(offset);
    }
    query = query.limit(pageSize + 1);

    const snapshot = await query.get();
    const connectors = snapshot.docs.slice(0, pageSize).map((doc) =>
      this.connectorFromFirestore(doc.data())
    );

    return {
      connectors,
      total: -1, // Would need a separate count query
      page,
      pageSize,
      hasMore: snapshot.docs.length > pageSize,
    };
  }

  async searchConnectors(
    searchQuery: string,
    options?: MarketplaceSearchOptions
  ): Promise<MarketplaceSearchResult> {
    // For now, use simple prefix search on displayName
    // In production, would use Algolia/Typesense/ElasticSearch
    const query = searchQuery.toLowerCase();

    const firestoreQuery = this.db
      .collection(MARKETPLACE_COLLECTIONS.CONNECTORS)
      .orderBy('displayName')
      .startAt(query)
      .endAt(query + '\uf8ff')
      .limit(50);

    const snapshot = await firestoreQuery.get();
    let connectors = snapshot.docs.map((doc) => this.connectorFromFirestore(doc.data()));

    // Apply additional filters client-side
    if (options?.capabilities?.length) {
      connectors = connectors.filter((c) =>
        options.capabilities!.some((cap) => c.capabilities.includes(cap))
      );
    }
    if (options?.tags?.length) {
      connectors = connectors.filter((c) =>
        options.tags!.some((tag) => c.tags.includes(tag))
      );
    }

    // Pagination
    const page = options?.page || 1;
    const pageSize = Math.min(options?.pageSize || 20, 50);
    const start = (page - 1) * pageSize;
    const paged = connectors.slice(start, start + pageSize);

    return {
      connectors: paged,
      total: connectors.length,
      page,
      pageSize,
      hasMore: start + pageSize < connectors.length,
    };
  }

  async createConnector(connector: PublishedConnector): Promise<void> {
    await this.db
      .collection(MARKETPLACE_COLLECTIONS.CONNECTORS)
      .doc(connector.id)
      .set(this.connectorToFirestore(connector));
  }

  async updateConnector(
    connectorId: string,
    updates: Partial<PublishedConnector>
  ): Promise<void> {
    const firestoreUpdates: Record<string, unknown> = {
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    };

    await this.db
      .collection(MARKETPLACE_COLLECTIONS.CONNECTORS)
      .doc(connectorId)
      .update(firestoreUpdates);
  }

  async deleteConnector(connectorId: string): Promise<void> {
    await this.db
      .collection(MARKETPLACE_COLLECTIONS.CONNECTORS)
      .doc(connectorId)
      .delete();
  }

  async incrementDownloads(connectorId: string): Promise<void> {
    await this.db
      .collection(MARKETPLACE_COLLECTIONS.CONNECTORS)
      .doc(connectorId)
      .update({
        totalDownloads: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
  }

  // ===========================================================================
  // Versions
  // ===========================================================================

  async getVersion(connectorId: string, version: string): Promise<ConnectorVersion | null> {
    const docId = `${connectorId}@${version}`;
    const doc = await this.db
      .collection(MARKETPLACE_COLLECTIONS.VERSIONS)
      .doc(docId)
      .get();

    if (!doc.exists) return null;
    return this.versionFromFirestore(doc.data()!);
  }

  async listVersions(connectorId: string): Promise<ConnectorVersion[]> {
    const snapshot = await this.db
      .collection(MARKETPLACE_COLLECTIONS.VERSIONS)
      .where('connectorId', '==', connectorId)
      .orderBy('publishedAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => this.versionFromFirestore(doc.data()));
  }

  async createVersion(version: ConnectorVersion): Promise<void> {
    const docId = `${version.connectorId}@${version.version}`;
    await this.db
      .collection(MARKETPLACE_COLLECTIONS.VERSIONS)
      .doc(docId)
      .set(this.versionToFirestore(version));
  }

  async deprecateVersion(
    connectorId: string,
    version: string,
    reason: string
  ): Promise<void> {
    const docId = `${connectorId}@${version}`;
    await this.db
      .collection(MARKETPLACE_COLLECTIONS.VERSIONS)
      .doc(docId)
      .update({
        deprecated: true,
        deprecationReason: reason,
      });
  }

  async incrementVersionDownloads(connectorId: string, version: string): Promise<void> {
    const docId = `${connectorId}@${version}`;
    await this.db
      .collection(MARKETPLACE_COLLECTIONS.VERSIONS)
      .doc(docId)
      .update({
        downloads: FieldValue.increment(1),
      });
  }

  // ===========================================================================
  // Installations
  // ===========================================================================

  async getInstallation(
    tenantId: string,
    connectorId: string
  ): Promise<ConnectorInstallation | null> {
    const doc = await this.db
      .collection('gwi_tenants')
      .doc(tenantId)
      .collection(MARKETPLACE_COLLECTIONS.INSTALLATIONS)
      .doc(connectorId)
      .get();

    if (!doc.exists) return null;
    return this.installationFromFirestore(doc.data()!);
  }

  async listInstallations(tenantId: string): Promise<ConnectorInstallation[]> {
    const snapshot = await this.db
      .collection('gwi_tenants')
      .doc(tenantId)
      .collection(MARKETPLACE_COLLECTIONS.INSTALLATIONS)
      .orderBy('installedAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => this.installationFromFirestore(doc.data()));
  }

  async createInstallation(installation: ConnectorInstallation): Promise<void> {
    await this.db
      .collection('gwi_tenants')
      .doc(installation.tenantId)
      .collection(MARKETPLACE_COLLECTIONS.INSTALLATIONS)
      .doc(installation.connectorId)
      .set(this.installationToFirestore(installation));
  }

  async updateInstallation(
    tenantId: string,
    connectorId: string,
    updates: Partial<ConnectorInstallation>
  ): Promise<void> {
    await this.db
      .collection('gwi_tenants')
      .doc(tenantId)
      .collection(MARKETPLACE_COLLECTIONS.INSTALLATIONS)
      .doc(connectorId)
      .update(updates);
  }

  async deleteInstallation(tenantId: string, connectorId: string): Promise<void> {
    await this.db
      .collection('gwi_tenants')
      .doc(tenantId)
      .collection(MARKETPLACE_COLLECTIONS.INSTALLATIONS)
      .doc(connectorId)
      .delete();
  }

  // ===========================================================================
  // Pending Install Requests (Phase 30 fixup)
  // ===========================================================================

  async getInstallRequest(
    tenantId: string,
    requestId: string
  ): Promise<PendingInstallRequestRecord | null> {
    const doc = await this.db
      .collection('gwi_tenants')
      .doc(tenantId)
      .collection(MARKETPLACE_COLLECTIONS.INSTALL_REQUESTS)
      .doc(requestId)
      .get();

    if (!doc.exists) return null;
    return this.installRequestFromFirestore(doc.data()!);
  }

  async getInstallRequestByIdempotencyKey(
    tenantId: string,
    key: string
  ): Promise<PendingInstallRequestRecord | null> {
    const snapshot = await this.db
      .collection('gwi_tenants')
      .doc(tenantId)
      .collection(MARKETPLACE_COLLECTIONS.INSTALL_REQUESTS)
      .where('idempotencyKey', '==', key)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return this.installRequestFromFirestore(snapshot.docs[0].data());
  }

  async listPendingInstallRequests(tenantId: string): Promise<PendingInstallRequestRecord[]> {
    const snapshot = await this.db
      .collection('gwi_tenants')
      .doc(tenantId)
      .collection(MARKETPLACE_COLLECTIONS.INSTALL_REQUESTS)
      .where('status', '==', 'pending')
      .orderBy('requestedAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => this.installRequestFromFirestore(doc.data()));
  }

  async createInstallRequest(request: PendingInstallRequestRecord): Promise<void> {
    await this.db
      .collection('gwi_tenants')
      .doc(request.tenantId)
      .collection(MARKETPLACE_COLLECTIONS.INSTALL_REQUESTS)
      .doc(request.id)
      .set(this.installRequestToFirestore(request));
  }

  async updateInstallRequest(
    tenantId: string,
    requestId: string,
    updates: Partial<PendingInstallRequestRecord>
  ): Promise<void> {
    const firestoreUpdates: Record<string, unknown> = {
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    };

    await this.db
      .collection('gwi_tenants')
      .doc(tenantId)
      .collection(MARKETPLACE_COLLECTIONS.INSTALL_REQUESTS)
      .doc(requestId)
      .update(firestoreUpdates);
  }

  async deleteInstallRequest(tenantId: string, requestId: string): Promise<void> {
    await this.db
      .collection('gwi_tenants')
      .doc(tenantId)
      .collection(MARKETPLACE_COLLECTIONS.INSTALL_REQUESTS)
      .doc(requestId)
      .delete();
  }

  // ===========================================================================
  // Publishers (Phase 30 fixup: Key registry)
  // ===========================================================================

  async getPublisher(publisherId: string): Promise<Publisher | null> {
    const doc = await this.db
      .collection(MARKETPLACE_COLLECTIONS.PUBLISHERS)
      .doc(publisherId)
      .get();

    if (!doc.exists) return null;
    return this.publisherFromFirestore(doc.data()!);
  }

  async getPublisherByKeyId(keyId: string): Promise<Publisher | null> {
    // Search through all publishers for the key ID
    // Note: In production, consider a separate index collection for key lookups
    const snapshot = await this.db
      .collection(MARKETPLACE_COLLECTIONS.PUBLISHERS)
      .get();

    for (const doc of snapshot.docs) {
      const publisher = this.publisherFromFirestore(doc.data());
      const hasKey = publisher.publicKeys.some((k) => k.keyId === keyId);
      if (hasKey) return publisher;
    }
    return null;
  }

  async listPublishers(): Promise<Publisher[]> {
    const snapshot = await this.db
      .collection(MARKETPLACE_COLLECTIONS.PUBLISHERS)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => this.publisherFromFirestore(doc.data()));
  }

  async createPublisher(publisher: Publisher): Promise<void> {
    await this.db
      .collection(MARKETPLACE_COLLECTIONS.PUBLISHERS)
      .doc(publisher.id)
      .set(this.publisherToFirestore(publisher));
  }

  async updatePublisher(publisherId: string, updates: Partial<Publisher>): Promise<void> {
    const firestoreUpdates: Record<string, unknown> = {
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    };

    await this.db
      .collection(MARKETPLACE_COLLECTIONS.PUBLISHERS)
      .doc(publisherId)
      .update(firestoreUpdates);
  }

  async addPublisherKey(publisherId: string, key: PublisherKey): Promise<void> {
    await this.db
      .collection(MARKETPLACE_COLLECTIONS.PUBLISHERS)
      .doc(publisherId)
      .update({
        publicKeys: FieldValue.arrayUnion(key),
        updatedAt: FieldValue.serverTimestamp(),
      });
  }

  async revokePublisherKey(publisherId: string, keyId: string, reason: string): Promise<void> {
    const publisher = await this.getPublisher(publisherId);
    if (!publisher) throw new Error(`Publisher ${publisherId} not found`);

    const keyIndex = publisher.publicKeys.findIndex((k) => k.keyId === keyId);
    if (keyIndex === -1) throw new Error(`Key ${keyId} not found`);

    const key = publisher.publicKeys[keyIndex];
    const revokedKey: PublisherKey = {
      ...key,
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      revocationReason: reason,
    };

    // Remove from publicKeys, add to revokedKeys
    const newPublicKeys = publisher.publicKeys.filter((k) => k.keyId !== keyId);

    await this.db
      .collection(MARKETPLACE_COLLECTIONS.PUBLISHERS)
      .doc(publisherId)
      .update({
        publicKeys: newPublicKeys,
        revokedKeys: FieldValue.arrayUnion(revokedKey),
        updatedAt: FieldValue.serverTimestamp(),
      });
  }

  // ===========================================================================
  // Firestore Converters
  // ===========================================================================

  private connectorToFirestore(connector: PublishedConnector): Record<string, unknown> {
    return {
      ...connector,
      createdAt: Timestamp.fromDate(new Date(connector.createdAt)),
      updatedAt: Timestamp.fromDate(new Date(connector.updatedAt)),
    };
  }

  private connectorFromFirestore(data: Record<string, unknown>): PublishedConnector {
    return {
      ...data,
      createdAt: timestampToDate(data.createdAt as Timestamp)?.toISOString() ?? new Date().toISOString(),
      updatedAt: timestampToDate(data.updatedAt as Timestamp)?.toISOString() ?? new Date().toISOString(),
    } as PublishedConnector;
  }

  private versionToFirestore(version: ConnectorVersion): Record<string, unknown> {
    return {
      ...version,
      publishedAt: Timestamp.fromDate(new Date(version.publishedAt)),
    };
  }

  private versionFromFirestore(data: Record<string, unknown>): ConnectorVersion {
    return {
      ...data,
      publishedAt: timestampToDate(data.publishedAt as Timestamp)?.toISOString() ?? new Date().toISOString(),
    } as ConnectorVersion;
  }

  private installationToFirestore(installation: ConnectorInstallation): Record<string, unknown> {
    return {
      ...installation,
      installedAt: Timestamp.fromDate(new Date(installation.installedAt)),
      lastUsedAt: installation.lastUsedAt
        ? Timestamp.fromDate(new Date(installation.lastUsedAt))
        : null,
    };
  }

  private installationFromFirestore(data: Record<string, unknown>): ConnectorInstallation {
    return {
      ...data,
      installedAt: timestampToDate(data.installedAt as Timestamp)?.toISOString() ?? new Date().toISOString(),
      lastUsedAt: data.lastUsedAt ? timestampToDate(data.lastUsedAt as Timestamp)?.toISOString() : undefined,
    } as ConnectorInstallation;
  }

  private installRequestToFirestore(request: PendingInstallRequestRecord): Record<string, unknown> {
    return {
      ...request,
      requestedAt: Timestamp.fromDate(new Date(request.requestedAt)),
      expiresAt: Timestamp.fromDate(new Date(request.expiresAt)),
      createdAt: Timestamp.fromDate(new Date(request.createdAt)),
      updatedAt: Timestamp.fromDate(new Date(request.updatedAt)),
    };
  }

  private installRequestFromFirestore(data: Record<string, unknown>): PendingInstallRequestRecord {
    return {
      ...data,
      requestedAt: timestampToDate(data.requestedAt as Timestamp)?.toISOString() ?? new Date().toISOString(),
      expiresAt: timestampToDate(data.expiresAt as Timestamp)?.toISOString() ?? new Date().toISOString(),
      createdAt: timestampToDate(data.createdAt as Timestamp)?.toISOString() ?? new Date().toISOString(),
      updatedAt: timestampToDate(data.updatedAt as Timestamp)?.toISOString() ?? new Date().toISOString(),
    } as PendingInstallRequestRecord;
  }

  private publisherToFirestore(publisher: Publisher): Record<string, unknown> {
    return {
      ...publisher,
      createdAt: Timestamp.fromDate(new Date(publisher.createdAt)),
      updatedAt: Timestamp.fromDate(new Date(publisher.updatedAt)),
      verifiedAt: publisher.verifiedAt ? Timestamp.fromDate(new Date(publisher.verifiedAt)) : null,
    };
  }

  private publisherFromFirestore(data: Record<string, unknown>): Publisher {
    return {
      ...data,
      createdAt: timestampToDate(data.createdAt as Timestamp)?.toISOString() ?? new Date().toISOString(),
      updatedAt: timestampToDate(data.updatedAt as Timestamp)?.toISOString() ?? new Date().toISOString(),
      verifiedAt: data.verifiedAt ? timestampToDate(data.verifiedAt as Timestamp)?.toISOString() : undefined,
    } as Publisher;
  }
}

// =============================================================================
// In-Memory Store (Development/Testing)
// =============================================================================

export class InMemoryMarketplaceStore implements MarketplaceStore {
  private connectors = new Map<string, PublishedConnector>();
  private versions = new Map<string, ConnectorVersion>();
  private installations = new Map<string, Map<string, ConnectorInstallation>>();
  private installRequests = new Map<string, Map<string, PendingInstallRequestRecord>>();
  private installRequestsByIdempotency = new Map<string, PendingInstallRequestRecord>();
  private publishers = new Map<string, Publisher>();

  async getConnector(connectorId: string): Promise<PublishedConnector | null> {
    return this.connectors.get(connectorId) ?? null;
  }

  async listConnectors(options?: MarketplaceSearchOptions): Promise<MarketplaceSearchResult> {
    let connectors = Array.from(this.connectors.values());

    // Apply filters
    if (options?.verified !== undefined) {
      connectors = connectors.filter((c) => c.verified === options.verified);
    }
    if (options?.featured) {
      connectors = connectors.filter((c) => c.featured);
    }
    if (options?.categories?.length) {
      connectors = connectors.filter((c) =>
        options.categories!.some((cat) => c.categories.includes(cat))
      );
    }

    // Sort
    const sortBy = options?.sortBy || 'downloads';
    const sortOrder = options?.sortOrder || 'desc';
    connectors.sort((a, b) => {
      let aVal: unknown, bVal: unknown;
      if (sortBy === 'name') {
        aVal = a.displayName;
        bVal = b.displayName;
      } else if (sortBy === 'updated') {
        aVal = a.updatedAt;
        bVal = b.updatedAt;
      } else {
        aVal = a.totalDownloads;
        bVal = b.totalDownloads;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    // Pagination
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const start = (page - 1) * pageSize;
    const paged = connectors.slice(start, start + pageSize);

    return {
      connectors: paged,
      total: connectors.length,
      page,
      pageSize,
      hasMore: start + pageSize < connectors.length,
    };
  }

  async searchConnectors(
    query: string,
    options?: MarketplaceSearchOptions
  ): Promise<MarketplaceSearchResult> {
    const lowerQuery = query.toLowerCase();
    let connectors = Array.from(this.connectors.values()).filter(
      (c) =>
        c.displayName.toLowerCase().includes(lowerQuery) ||
        c.description.toLowerCase().includes(lowerQuery) ||
        c.tags.some((t) => t.toLowerCase().includes(lowerQuery))
    );

    // Apply same filters as listConnectors
    if (options?.capabilities?.length) {
      connectors = connectors.filter((c) =>
        options.capabilities!.some((cap) => c.capabilities.includes(cap))
      );
    }

    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const start = (page - 1) * pageSize;
    const paged = connectors.slice(start, start + pageSize);

    return {
      connectors: paged,
      total: connectors.length,
      page,
      pageSize,
      hasMore: start + pageSize < connectors.length,
    };
  }

  async createConnector(connector: PublishedConnector): Promise<void> {
    this.connectors.set(connector.id, connector);
  }

  async updateConnector(
    connectorId: string,
    updates: Partial<PublishedConnector>
  ): Promise<void> {
    const existing = this.connectors.get(connectorId);
    if (existing) {
      this.connectors.set(connectorId, {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async deleteConnector(connectorId: string): Promise<void> {
    this.connectors.delete(connectorId);
  }

  async incrementDownloads(connectorId: string): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (connector) {
      connector.totalDownloads++;
    }
  }

  async getVersion(connectorId: string, version: string): Promise<ConnectorVersion | null> {
    return this.versions.get(`${connectorId}@${version}`) ?? null;
  }

  async listVersions(connectorId: string): Promise<ConnectorVersion[]> {
    return Array.from(this.versions.values())
      .filter((v) => v.connectorId === connectorId)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  async createVersion(version: ConnectorVersion): Promise<void> {
    this.versions.set(`${version.connectorId}@${version.version}`, version);
  }

  async deprecateVersion(
    connectorId: string,
    version: string,
    reason: string
  ): Promise<void> {
    const v = this.versions.get(`${connectorId}@${version}`);
    if (v) {
      v.deprecated = true;
      v.deprecationReason = reason;
    }
  }

  async incrementVersionDownloads(connectorId: string, version: string): Promise<void> {
    const v = this.versions.get(`${connectorId}@${version}`);
    if (v) {
      v.downloads++;
    }
  }

  async getInstallation(
    tenantId: string,
    connectorId: string
  ): Promise<ConnectorInstallation | null> {
    return this.installations.get(tenantId)?.get(connectorId) ?? null;
  }

  async listInstallations(tenantId: string): Promise<ConnectorInstallation[]> {
    const tenantInstalls = this.installations.get(tenantId);
    return tenantInstalls ? Array.from(tenantInstalls.values()) : [];
  }

  async createInstallation(installation: ConnectorInstallation): Promise<void> {
    if (!this.installations.has(installation.tenantId)) {
      this.installations.set(installation.tenantId, new Map());
    }
    this.installations.get(installation.tenantId)!.set(installation.connectorId, installation);
  }

  async updateInstallation(
    tenantId: string,
    connectorId: string,
    updates: Partial<ConnectorInstallation>
  ): Promise<void> {
    const installation = this.installations.get(tenantId)?.get(connectorId);
    if (installation) {
      Object.assign(installation, updates);
    }
  }

  async deleteInstallation(tenantId: string, connectorId: string): Promise<void> {
    this.installations.get(tenantId)?.delete(connectorId);
  }

  // ===========================================================================
  // Pending Install Requests (Phase 30 fixup)
  // ===========================================================================

  async getInstallRequest(
    tenantId: string,
    requestId: string
  ): Promise<PendingInstallRequestRecord | null> {
    return this.installRequests.get(tenantId)?.get(requestId) ?? null;
  }

  async getInstallRequestByIdempotencyKey(
    tenantId: string,
    key: string
  ): Promise<PendingInstallRequestRecord | null> {
    const compoundKey = `${tenantId}:${key}`;
    return this.installRequestsByIdempotency.get(compoundKey) ?? null;
  }

  async listPendingInstallRequests(tenantId: string): Promise<PendingInstallRequestRecord[]> {
    const requests = this.installRequests.get(tenantId);
    if (!requests) return [];
    return Array.from(requests.values())
      .filter((r) => r.status === 'pending')
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }

  async createInstallRequest(request: PendingInstallRequestRecord): Promise<void> {
    if (!this.installRequests.has(request.tenantId)) {
      this.installRequests.set(request.tenantId, new Map());
    }
    this.installRequests.get(request.tenantId)!.set(request.id, request);

    // Index by idempotency key
    const compoundKey = `${request.tenantId}:${request.idempotencyKey}`;
    this.installRequestsByIdempotency.set(compoundKey, request);
  }

  async updateInstallRequest(
    tenantId: string,
    requestId: string,
    updates: Partial<PendingInstallRequestRecord>
  ): Promise<void> {
    const request = this.installRequests.get(tenantId)?.get(requestId);
    if (request) {
      Object.assign(request, updates, { updatedAt: new Date().toISOString() });
    }
  }

  async deleteInstallRequest(tenantId: string, requestId: string): Promise<void> {
    const request = this.installRequests.get(tenantId)?.get(requestId);
    if (request) {
      const compoundKey = `${tenantId}:${request.idempotencyKey}`;
      this.installRequestsByIdempotency.delete(compoundKey);
    }
    this.installRequests.get(tenantId)?.delete(requestId);
  }

  // ===========================================================================
  // Publishers (Phase 30 fixup: Key registry)
  // ===========================================================================

  async getPublisher(publisherId: string): Promise<Publisher | null> {
    return this.publishers.get(publisherId) ?? null;
  }

  async getPublisherByKeyId(keyId: string): Promise<Publisher | null> {
    for (const publisher of this.publishers.values()) {
      if (publisher.publicKeys.some((k) => k.keyId === keyId)) {
        return publisher;
      }
    }
    return null;
  }

  async listPublishers(): Promise<Publisher[]> {
    return Array.from(this.publishers.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createPublisher(publisher: Publisher): Promise<void> {
    this.publishers.set(publisher.id, publisher);
  }

  async updatePublisher(publisherId: string, updates: Partial<Publisher>): Promise<void> {
    const publisher = this.publishers.get(publisherId);
    if (publisher) {
      Object.assign(publisher, updates, { updatedAt: new Date().toISOString() });
    }
  }

  async addPublisherKey(publisherId: string, key: PublisherKey): Promise<void> {
    const publisher = this.publishers.get(publisherId);
    if (publisher) {
      publisher.publicKeys.push(key);
      publisher.updatedAt = new Date().toISOString();
    }
  }

  async revokePublisherKey(publisherId: string, keyId: string, reason: string): Promise<void> {
    const publisher = this.publishers.get(publisherId);
    if (!publisher) throw new Error(`Publisher ${publisherId} not found`);

    const keyIndex = publisher.publicKeys.findIndex((k) => k.keyId === keyId);
    if (keyIndex === -1) throw new Error(`Key ${keyId} not found`);

    const key = publisher.publicKeys[keyIndex];
    const revokedKey: PublisherKey = {
      ...key,
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      revocationReason: reason,
    };

    // Remove from publicKeys, add to revokedKeys
    publisher.publicKeys.splice(keyIndex, 1);
    publisher.revokedKeys.push(revokedKey);
    publisher.updatedAt = new Date().toISOString();
  }

  // Test helpers
  clear(): void {
    this.connectors.clear();
    this.versions.clear();
    this.installations.clear();
    this.installRequests.clear();
    this.installRequestsByIdempotency.clear();
    this.publishers.clear();
  }
}

// =============================================================================
// Singleton Access
// =============================================================================

let marketplaceStoreInstance: MarketplaceStore | null = null;

export function getMarketplaceStore(): MarketplaceStore {
  if (!marketplaceStoreInstance) {
    const backend = process.env.GWI_STORE_BACKEND;
    if (backend === 'firestore') {
      marketplaceStoreInstance = new FirestoreMarketplaceStore();
    } else {
      marketplaceStoreInstance = new InMemoryMarketplaceStore();
    }
  }
  return marketplaceStoreInstance;
}

export function setMarketplaceStore(store: MarketplaceStore): void {
  marketplaceStoreInstance = store;
}

export function resetMarketplaceStore(): void {
  marketplaceStoreInstance = null;
}
