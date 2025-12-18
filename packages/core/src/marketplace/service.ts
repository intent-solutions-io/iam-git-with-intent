/**
 * Phase 29: Marketplace Service
 * Phase 30 fixup: Publisher key registry for signature verification
 *
 * Business logic for connector marketplace operations.
 * Handles publishing, installation, and policy integration.
 *
 * @module @gwi/core/marketplace/service
 */

import { randomUUID, createHash, createVerify } from 'node:crypto';
import type { ConnectorManifest } from '../connectors/manifest.js';
import type { SignatureFile } from '../connectors/signature.js';
import { verifySignature, loadTrustedKeys, type TrustedKeysConfig } from '../connectors/signature.js';
import type {
  PublishedConnector,
  ConnectorVersion,
  ConnectorInstallation,
  PublishRequest,
  InstallRequest,
  MarketplaceSearchOptions,
  MarketplaceSearchResult,
  Publisher,
  PublisherKey,
} from './types.js';
import { getMarketplaceStore, type MarketplaceStore } from './storage.js';

// =============================================================================
// Marketplace Service
// =============================================================================

export interface MarketplaceServiceConfig {
  /** Storage backend */
  store?: MarketplaceStore;
  /** Trusted keys config (fallback for legacy verification) */
  trustedKeys?: TrustedKeysConfig;
  /** GCS bucket for tarballs */
  tarballBucket?: string;
  /** Registry URL for download links */
  registryUrl?: string;
  /** Use publisher registry for key verification (Phase 30) */
  usePublisherRegistry?: boolean;
}

export class MarketplaceService {
  private store: MarketplaceStore;
  private trustedKeys?: TrustedKeysConfig;
  private registryUrl: string;
  private usePublisherRegistry: boolean;

  constructor(config?: MarketplaceServiceConfig) {
    this.store = config?.store ?? getMarketplaceStore();
    this.trustedKeys = config?.trustedKeys;
    this.registryUrl = config?.registryUrl ?? process.env.GWI_REGISTRY_URL ?? 'https://registry.gitwithintent.com';
    this.usePublisherRegistry = config?.usePublisherRegistry ?? true;
  }

  // ===========================================================================
  // Publisher Registry Operations (Phase 30 fixup)
  // ===========================================================================

  /**
   * Get publisher by ID
   */
  async getPublisher(publisherId: string): Promise<Publisher | null> {
    return this.store.getPublisher(publisherId);
  }

  /**
   * Register a new publisher
   */
  async registerPublisher(
    id: string,
    displayName: string,
    email: string,
    publicKey: string
  ): Promise<Publisher> {
    const now = new Date().toISOString();

    // Compute key fingerprint
    const fingerprint = createHash('sha256').update(publicKey).digest('hex');
    const keyId = `${id}:${fingerprint.slice(0, 8)}`;

    const key: PublisherKey = {
      keyId,
      publicKey,
      status: 'active',
      fingerprint,
      createdAt: now,
    };

    const publisher: Publisher = {
      id,
      displayName,
      email,
      verified: false,
      publicKeys: [key],
      revokedKeys: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    await this.store.createPublisher(publisher);
    return publisher;
  }

  /**
   * Add a new key to publisher
   */
  async addPublisherKey(publisherId: string, publicKey: string): Promise<PublisherKey> {
    const publisher = await this.store.getPublisher(publisherId);
    if (!publisher) {
      throw new Error(`Publisher ${publisherId} not found`);
    }

    const now = new Date().toISOString();
    const fingerprint = createHash('sha256').update(publicKey).digest('hex');
    const keyId = `${publisherId}:${fingerprint.slice(0, 8)}`;

    const key: PublisherKey = {
      keyId,
      publicKey,
      status: 'active',
      fingerprint,
      createdAt: now,
    };

    await this.store.addPublisherKey(publisherId, key);
    return key;
  }

  /**
   * Revoke a publisher key
   */
  async revokePublisherKey(publisherId: string, keyId: string, reason: string): Promise<void> {
    await this.store.revokePublisherKey(publisherId, keyId, reason);
  }

  /**
   * Verify signature using publisher registry
   */
  async verifySignatureWithRegistry(
    data: string,
    signature: SignatureFile
  ): Promise<{ valid: boolean; error?: string; publisher?: Publisher }> {
    // Look up publisher by key ID
    const publisher = await this.store.getPublisherByKeyId(signature.keyId);
    if (!publisher) {
      return { valid: false, error: `Key ${signature.keyId} not found in publisher registry` };
    }

    // Check publisher status
    if (publisher.status !== 'active') {
      return { valid: false, error: `Publisher ${publisher.id} is ${publisher.status}` };
    }

    // Find the key
    const key = publisher.publicKeys.find((k) => k.keyId === signature.keyId);
    if (!key) {
      // Check if it was revoked
      const revokedKey = publisher.revokedKeys.find((k) => k.keyId === signature.keyId);
      if (revokedKey) {
        return {
          valid: false,
          error: `Key ${signature.keyId} was revoked: ${revokedKey.revocationReason}`,
        };
      }
      return { valid: false, error: `Key ${signature.keyId} not found` };
    }

    // Check key status
    if (key.status !== 'active') {
      return { valid: false, error: `Key ${signature.keyId} is ${key.status}` };
    }

    // Check expiration
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return { valid: false, error: `Key ${signature.keyId} has expired` };
    }

    // Verify Ed25519 signature
    try {
      const verify = createVerify('ed25519');
      verify.update(data);
      const signatureBuffer = Buffer.from(signature.signature, 'base64');
      const publicKeyBuffer = Buffer.from(key.publicKey, 'base64');

      // Ed25519 public key in DER format
      const publicKeyDer = Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'), // Ed25519 DER prefix
        publicKeyBuffer,
      ]);

      const isValid = verify.verify(
        { key: publicKeyDer, format: 'der', type: 'spki' },
        signatureBuffer
      );

      if (isValid) {
        return { valid: true, publisher };
      } else {
        return { valid: false, error: 'Signature verification failed' };
      }
    } catch (err) {
      return {
        valid: false,
        error: `Signature verification error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ===========================================================================
  // Catalog Operations
  // ===========================================================================

  /**
   * Get connector by ID
   */
  async getConnector(connectorId: string): Promise<PublishedConnector | null> {
    return this.store.getConnector(connectorId);
  }

  /**
   * List connectors in catalog
   */
  async listConnectors(options?: MarketplaceSearchOptions): Promise<MarketplaceSearchResult> {
    return this.store.listConnectors(options);
  }

  /**
   * Search connectors
   */
  async searchConnectors(
    query: string,
    options?: MarketplaceSearchOptions
  ): Promise<MarketplaceSearchResult> {
    return this.store.searchConnectors(query, options);
  }

  /**
   * Get connector with all versions
   */
  async getConnectorWithVersions(connectorId: string): Promise<{
    connector: PublishedConnector;
    versions: ConnectorVersion[];
  } | null> {
    const connector = await this.store.getConnector(connectorId);
    if (!connector) return null;

    const versions = await this.store.listVersions(connectorId);
    return { connector, versions };
  }

  /**
   * Get specific version
   */
  async getVersion(connectorId: string, version: string): Promise<ConnectorVersion | null> {
    // Handle 'latest' alias
    if (version === 'latest') {
      const connector = await this.store.getConnector(connectorId);
      if (!connector) return null;
      version = connector.latestVersion;
    }
    return this.store.getVersion(connectorId, version);
  }

  // ===========================================================================
  // Publishing Operations
  // ===========================================================================

  /**
   * Publish a new connector or version
   */
  async publish(
    request: PublishRequest,
    signature: SignatureFile,
    publishedBy: string
  ): Promise<{ success: boolean; error?: string; version?: ConnectorVersion }> {
    // Verify signature using publisher registry (Phase 30) or fallback to trusted keys
    let verifyResult: { valid: boolean; error?: string; publisher?: Publisher };

    if (this.usePublisherRegistry) {
      // Use publisher registry for signature verification
      verifyResult = await this.verifySignatureWithRegistry(request.tarballChecksum, signature);
    } else {
      // Fallback to file-based trusted keys
      if (!this.trustedKeys) {
        this.trustedKeys = await loadTrustedKeys();
      }
      const legacyResult = await verifySignature(
        request.tarballChecksum,
        signature,
        this.trustedKeys
      );
      verifyResult = {
        valid: legacyResult.valid,
        error: legacyResult.valid ? undefined : `${legacyResult.error} - ${legacyResult.message}`,
      };
    }

    if (!verifyResult.valid) {
      return {
        success: false,
        error: `Signature verification failed: ${verifyResult.error}`,
      };
    }

    // Check if connector exists
    const existingConnector = await this.store.getConnector(request.connectorId);

    // Build version metadata
    const now = new Date().toISOString();
    const version: ConnectorVersion = {
      connectorId: request.connectorId,
      version: request.version,
      manifest: request.manifest,
      tarballUrl: `${this.registryUrl}/v1/connectors/${request.connectorId}/${request.version}/tarball`,
      tarballChecksum: request.tarballChecksum,
      tarballSize: 0, // Would be set from actual tarball
      signatureUrl: `${this.registryUrl}/v1/connectors/${request.connectorId}/${request.version}/signature`,
      signingKeyId: signature.keyId,
      changelog: request.changelog,
      releaseNotes: request.releaseNotes,
      downloads: 0,
      prerelease: request.prerelease,
      deprecated: false,
      minGwiVersion: request.manifest.minCoreVersion,
      publishedAt: now,
      publishedBy,
    };

    // Create version
    await this.store.createVersion(version);

    if (existingConnector) {
      // Update existing connector
      const versions = [...existingConnector.versions, request.version];
      const latestVersion = request.prerelease
        ? existingConnector.latestVersion
        : request.version;

      await this.store.updateConnector(request.connectorId, {
        versions,
        latestVersion,
        updatedAt: now,
      });
    } else {
      // Create new connector
      const connector: PublishedConnector = {
        id: request.connectorId,
        displayName: request.manifest.displayName,
        description: request.manifest.description ?? '',
        author: request.manifest.author,
        repositoryUrl: request.manifest.repository,
        documentationUrl: request.manifest.homepage,
        license: request.manifest.license,
        capabilities: request.manifest.capabilities,
        categories: this.inferCategories(request.manifest),
        tags: this.inferTags(request.manifest),
        latestVersion: request.version,
        versions: [request.version],
        totalDownloads: 0,
        verified: false,
        featured: false,
        createdAt: now,
        updatedAt: now,
      };

      await this.store.createConnector(connector);
    }

    return { success: true, version };
  }

  /**
   * Deprecate a version
   */
  async deprecateVersion(
    connectorId: string,
    version: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    const existing = await this.store.getVersion(connectorId, version);
    if (!existing) {
      return { success: false, error: 'Version not found' };
    }

    await this.store.deprecateVersion(connectorId, version, reason);
    return { success: true };
  }

  // ===========================================================================
  // Installation Operations
  // ===========================================================================

  /**
   * Install a connector for a tenant
   */
  async install(
    tenantId: string,
    request: InstallRequest,
    installedBy: string,
    approvalId?: string
  ): Promise<{
    success: boolean;
    installation?: ConnectorInstallation;
    error?: string;
    requiresApproval?: boolean;
  }> {
    // Resolve version
    let versionStr = request.version;
    if (versionStr === 'latest') {
      const connector = await this.store.getConnector(request.connectorId);
      if (!connector) {
        return { success: false, error: 'Connector not found' };
      }
      versionStr = connector.latestVersion;
    }

    // Get version details
    const version = await this.store.getVersion(request.connectorId, versionStr);
    if (!version) {
      return { success: false, error: `Version ${versionStr} not found` };
    }

    if (version.deprecated) {
      return {
        success: false,
        error: `Version ${versionStr} is deprecated: ${version.deprecationReason}`,
      };
    }

    // Check for existing installation
    const existing = await this.store.getInstallation(tenantId, request.connectorId);
    if (existing && existing.status === 'installed') {
      return {
        success: false,
        error: `Connector ${request.connectorId} is already installed (version ${existing.version})`,
      };
    }

    // Create installation record
    const now = new Date().toISOString();
    const installation: ConnectorInstallation = {
      id: randomUUID(),
      tenantId,
      connectorId: request.connectorId,
      version: versionStr,
      status: 'installing',
      config: request.config,
      approvalId,
      installedBy,
      installedAt: now,
    };

    await this.store.createInstallation(installation);

    // Track download
    await this.store.incrementDownloads(request.connectorId);
    await this.store.incrementVersionDownloads(request.connectorId, versionStr);

    // Mark as installed (actual download would happen client-side)
    installation.status = 'installed';
    await this.store.updateInstallation(tenantId, request.connectorId, {
      status: 'installed',
    });

    return { success: true, installation };
  }

  /**
   * Uninstall a connector
   */
  async uninstall(
    tenantId: string,
    connectorId: string
  ): Promise<{ success: boolean; error?: string }> {
    const existing = await this.store.getInstallation(tenantId, connectorId);
    if (!existing) {
      return { success: false, error: 'Connector is not installed' };
    }

    await this.store.updateInstallation(tenantId, connectorId, {
      status: 'uninstalling',
    });

    // Actual uninstall would happen client-side
    await this.store.deleteInstallation(tenantId, connectorId);

    return { success: true };
  }

  /**
   * Update to a new version
   */
  async upgrade(
    tenantId: string,
    connectorId: string,
    targetVersion: string
  ): Promise<{
    success: boolean;
    installation?: ConnectorInstallation;
    error?: string;
  }> {
    const existing = await this.store.getInstallation(tenantId, connectorId);
    if (!existing || existing.status !== 'installed') {
      return { success: false, error: 'Connector is not installed' };
    }

    // Resolve target version
    if (targetVersion === 'latest') {
      const connector = await this.store.getConnector(connectorId);
      if (!connector) {
        return { success: false, error: 'Connector not found' };
      }
      targetVersion = connector.latestVersion;
    }

    // Check if already at target version
    if (existing.version === targetVersion) {
      return { success: false, error: `Already at version ${targetVersion}` };
    }

    // Verify version exists
    const version = await this.store.getVersion(connectorId, targetVersion);
    if (!version) {
      return { success: false, error: `Version ${targetVersion} not found` };
    }

    // Update installation
    await this.store.updateInstallation(tenantId, connectorId, {
      version: targetVersion,
      installedAt: new Date().toISOString(),
    });

    // Track download
    await this.store.incrementVersionDownloads(connectorId, targetVersion);

    const updated = await this.store.getInstallation(tenantId, connectorId);
    return { success: true, installation: updated ?? undefined };
  }

  /**
   * List tenant's installed connectors
   */
  async listInstallations(tenantId: string): Promise<ConnectorInstallation[]> {
    return this.store.listInstallations(tenantId);
  }

  /**
   * Get installation status
   */
  async getInstallation(
    tenantId: string,
    connectorId: string
  ): Promise<ConnectorInstallation | null> {
    return this.store.getInstallation(tenantId, connectorId);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private inferCategories(manifest: ConnectorManifest): string[] {
    const categories: string[] = [];
    const caps = manifest.capabilities;

    if (caps.includes('vcs')) {
      categories.push('version-control');
    }
    if (caps.includes('ci-cd')) {
      categories.push('ci-cd');
    }
    if (caps.includes('monitoring')) {
      categories.push('monitoring');
    }
    if (caps.includes('issue-tracking')) {
      categories.push('project-management');
    }
    if (caps.includes('data-integration')) {
      categories.push('data');
    }
    if (caps.includes('messaging')) {
      categories.push('communication');
    }
    if (caps.includes('cloud') || caps.includes('database')) {
      categories.push('infrastructure');
    }
    if (caps.includes('auth')) {
      categories.push('security');
    }

    return categories.length > 0 ? categories : ['other'];
  }

  private inferTags(manifest: ConnectorManifest): string[] {
    const tags: string[] = [];

    // Add capability-based tags
    for (const cap of manifest.capabilities) {
      tags.push(cap);
    }

    // Add keywords from manifest
    if (manifest.keywords) {
      tags.push(...manifest.keywords);
    }

    return tags;
  }
}

// =============================================================================
// Singleton
// =============================================================================

let marketplaceServiceInstance: MarketplaceService | null = null;

export function getMarketplaceService(): MarketplaceService {
  if (!marketplaceServiceInstance) {
    marketplaceServiceInstance = new MarketplaceService();
  }
  return marketplaceServiceInstance;
}

export function resetMarketplaceService(): void {
  marketplaceServiceInstance = null;
}
