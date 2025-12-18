/**
 * Phase 29: Marketplace Service
 *
 * Business logic for connector marketplace operations.
 * Handles publishing, installation, and policy integration.
 *
 * @module @gwi/core/marketplace/service
 */

import { randomUUID } from 'node:crypto';
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
} from './types.js';
import { getMarketplaceStore, type MarketplaceStore } from './storage.js';

// =============================================================================
// Marketplace Service
// =============================================================================

export interface MarketplaceServiceConfig {
  /** Storage backend */
  store?: MarketplaceStore;
  /** Trusted keys config */
  trustedKeys?: TrustedKeysConfig;
  /** GCS bucket for tarballs */
  tarballBucket?: string;
  /** Registry URL for download links */
  registryUrl?: string;
}

export class MarketplaceService {
  private store: MarketplaceStore;
  private trustedKeys?: TrustedKeysConfig;
  private registryUrl: string;

  constructor(config?: MarketplaceServiceConfig) {
    this.store = config?.store ?? getMarketplaceStore();
    this.trustedKeys = config?.trustedKeys;
    this.registryUrl = config?.registryUrl ?? process.env.GWI_REGISTRY_URL ?? 'https://registry.gitwithintent.com';
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
    // Load trusted keys if not already loaded
    if (!this.trustedKeys) {
      this.trustedKeys = await loadTrustedKeys();
    }

    // Verify signature
    const verifyResult = await verifySignature(
      request.tarballChecksum,
      signature,
      this.trustedKeys
    );

    if (!verifyResult.valid) {
      return {
        success: false,
        error: `Signature verification failed: ${verifyResult.error} - ${verifyResult.message}`,
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
