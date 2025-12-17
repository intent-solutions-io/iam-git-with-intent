/**
 * Remote Connector Registry Client
 *
 * Phase 9: HTTP client for remote connector registries.
 *
 * Protocol:
 *   GET /v1/search?q={query}           - Search connectors
 *   GET /v1/connectors/{id}            - Get connector versions
 *   GET /v1/connectors/{id}/{version}  - Get version metadata
 *   GET /v1/connectors/{id}/{version}/tarball   - Download tarball
 *   GET /v1/connectors/{id}/{version}/signature - Download signature
 *
 * @module @gwi/core/connectors/remote-registry
 */

import type { ConnectorManifest, ConnectorCapability } from './manifest.js';

// =============================================================================
// Remote Registry Types
// =============================================================================

/**
 * Connector search entry
 */
export interface ConnectorSearchEntry {
  id: string;
  latestVersion: string;
  displayName: string;
  description: string;
  author: string;
  capabilities: ConnectorCapability[];
  downloads: number;
  updatedAt: string;
}

/**
 * Search result
 */
export interface RegistrySearchResult {
  connectors: ConnectorSearchEntry[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Version metadata
 */
export interface ConnectorVersionInfo {
  id: string;
  version: string;
  manifest: ConnectorManifest;
  tarballUrl: string;
  tarballChecksum: string;
  signatureUrl: string;
  publishedAt: string;
  downloads: number;
}

/**
 * Connector info with all versions
 */
export interface ConnectorInfo {
  id: string;
  displayName: string;
  description: string;
  author: string;
  capabilities: ConnectorCapability[];
  latestVersion: string;
  versions: string[];
  totalDownloads: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Signature file format
 */
export interface SignatureFile {
  version: '1.0';
  keyId: string;
  algorithm: 'ed25519';
  checksum: string;
  signature: string;
  signedAt: string;
}

/**
 * Search options
 */
export interface SearchOptions {
  page?: number;
  pageSize?: number;
  capabilities?: ConnectorCapability[];
}

/**
 * Remote registry error
 */
export class RegistryError extends Error {
  constructor(
    message: string,
    public readonly code: 'NETWORK_ERROR' | 'NOT_FOUND' | 'INVALID_RESPONSE' | 'SERVER_ERROR',
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'RegistryError';
  }
}

// =============================================================================
// Remote Registry Client
// =============================================================================

/**
 * Remote connector registry client
 */
export class RemoteRegistryClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string, options?: { timeout?: number }) {
    // Remove trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = options?.timeout ?? 30000;
  }

  /**
   * Get the registry base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Search for connectors
   */
  async search(query: string, options?: SearchOptions): Promise<RegistrySearchResult> {
    const params = new URLSearchParams({ q: query });

    if (options?.page) params.set('page', String(options.page));
    if (options?.pageSize) params.set('pageSize', String(options.pageSize));
    if (options?.capabilities?.length) {
      params.set('capabilities', options.capabilities.join(','));
    }

    const response = await this.fetch(`/v1/search?${params}`);
    return response as RegistrySearchResult;
  }

  /**
   * Get connector info with all versions
   */
  async getInfo(connectorId: string): Promise<ConnectorInfo> {
    const response = await this.fetch(`/v1/connectors/${encodeURIComponent(connectorId)}`);
    return response as ConnectorInfo;
  }

  /**
   * Get specific version metadata
   */
  async getVersion(connectorId: string, version: string): Promise<ConnectorVersionInfo> {
    const response = await this.fetch(
      `/v1/connectors/${encodeURIComponent(connectorId)}/${encodeURIComponent(version)}`
    );
    return response as ConnectorVersionInfo;
  }

  /**
   * Download tarball as buffer
   */
  async downloadTarball(connectorId: string, version: string): Promise<Buffer> {
    const url = `${this.baseUrl}/v1/connectors/${encodeURIComponent(connectorId)}/${encodeURIComponent(version)}/tarball`;
    return this.fetchBinary(url);
  }

  /**
   * Download signature file
   */
  async downloadSignature(connectorId: string, version: string): Promise<SignatureFile> {
    const response = await this.fetch(
      `/v1/connectors/${encodeURIComponent(connectorId)}/${encodeURIComponent(version)}/signature`
    );
    return response as SignatureFile;
  }

  /**
   * Resolve 'latest' version to actual version
   */
  async resolveVersion(connectorId: string, version: string): Promise<string> {
    if (version === 'latest') {
      const info = await this.getInfo(connectorId);
      return info.latestVersion;
    }
    return version;
  }

  /**
   * Make JSON request
   */
  private async fetch(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'gwi-registry-client/1.0',
        },
      });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        throw new RegistryError(`Not found: ${path}`, 'NOT_FOUND', 404);
      }

      if (!response.ok) {
        throw new RegistryError(
          `Server error: ${response.status} ${response.statusText}`,
          'SERVER_ERROR',
          response.status
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error instanceof RegistryError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new RegistryError('Request timeout', 'NETWORK_ERROR');
      }

      throw new RegistryError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        'NETWORK_ERROR'
      );
    }
  }

  /**
   * Make binary request
   */
  private async fetchBinary(url: string): Promise<Buffer> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/octet-stream',
          'User-Agent': 'gwi-registry-client/1.0',
        },
      });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        throw new RegistryError(`Not found: ${url}`, 'NOT_FOUND', 404);
      }

      if (!response.ok) {
        throw new RegistryError(
          `Server error: ${response.status} ${response.statusText}`,
          'SERVER_ERROR',
          response.status
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      if (error instanceof RegistryError) throw error;

      throw new RegistryError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        'NETWORK_ERROR'
      );
    }
  }
}

// =============================================================================
// Default Registry
// =============================================================================

const DEFAULT_REGISTRY_URL = 'http://localhost:3456';
let defaultRegistryUrl = DEFAULT_REGISTRY_URL;

/**
 * Set the default registry URL
 */
export function setDefaultRegistryUrl(url: string): void {
  defaultRegistryUrl = url;
}

/**
 * Get the default registry URL
 */
export function getDefaultRegistryUrl(): string {
  return process.env.GWI_REGISTRY_URL ?? defaultRegistryUrl;
}

/**
 * Create a remote registry client with default URL
 */
export function createRemoteRegistry(url?: string): RemoteRegistryClient {
  return new RemoteRegistryClient(url ?? getDefaultRegistryUrl());
}
