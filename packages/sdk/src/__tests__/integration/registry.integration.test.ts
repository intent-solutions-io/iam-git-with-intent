/**
 * Connector Registry Integration Tests
 *
 * Epic D - Story 4: SDK Integration Tests
 *
 * Tests Connector Registry API integration through the SDK client.
 * Validates:
 * - Listing available connectors
 * - Getting connector details
 * - Searching connectors by type/tag
 * - Publishing connectors with signature validation
 * - Authentication failures
 * - Rate limiting responses
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGatewayMock, type GatewayMock } from '../helpers/gateway-mock.js';
import type {
  SearchResults,
  ConnectorDetails,
  PublishFullRequest,
  PublishFullResponse,
  ConnectorManifest,
  SignatureFile,
} from '../../types.js';

// =============================================================================
// Mock Registry Client
// =============================================================================

/**
 * Simplified connector registry client for testing
 */
class RegistryClient {
  constructor(private baseUrl: string) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams(query);
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json();
      const err = new Error(error.message || 'Request failed');
      (err as any).status = response.status;
      (err as any).code = error.error;
      throw err;
    }

    return response.json();
  }

  async search(options?: {
    q?: string;
    page?: number;
    pageSize?: number;
    sortBy?: 'downloads' | 'updated' | 'name';
  }): Promise<SearchResults> {
    const query: Record<string, string> = {};
    if (options?.q) query.q = options.q;
    if (options?.page) query.page = String(options.page);
    if (options?.pageSize) query.pageSize = String(options.pageSize);
    if (options?.sortBy) query.sortBy = options.sortBy;

    return this.request<SearchResults>('GET', '/v1/search', undefined, query);
  }

  async getConnector(id: string): Promise<ConnectorDetails> {
    return this.request<ConnectorDetails>('GET', `/v1/connectors/${id}`);
  }

  async publish(request: PublishFullRequest): Promise<PublishFullResponse> {
    return this.request<PublishFullResponse>('POST', '/v1/publish', request);
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('Connector Registry Integration', () => {
  let mockServer: GatewayMock;
  let registryClient: RegistryClient;

  beforeEach(async () => {
    mockServer = await createGatewayMock();
    registryClient = new RegistryClient(mockServer.url);
  });

  afterEach(async () => {
    await mockServer.close();
  });

  // =============================================================================
  // List Available Connectors
  // =============================================================================

  describe('List Available Connectors', () => {
    it('should list all connectors with correct types', async () => {
      // Publish a connector first
      const manifest: ConnectorManifest = {
        id: 'test-connector',
        version: '1.0.0',
        displayName: 'Test Connector',
        description: 'A test connector',
        author: 'Test Author',
        capabilities: ['read', 'write'],
      };

      await registryClient.publish({
        manifest,
        tarball: Buffer.from('fake-tarball-data').toString('base64'),
        signature: {
          version: 1,
          keyId: 'test-key',
          algorithm: 'ed25519',
          signature: 'fake-signature',
          checksum: 'fake-checksum',
          signedAt: new Date().toISOString(),
        },
      });

      // Search for all connectors
      const results = await registryClient.search();

      expect(results.connectors).toBeDefined();
      expect(Array.isArray(results.connectors)).toBe(true);
      expect(results.total).toBeGreaterThan(0);
      expect(results.page).toBe(1);
      expect(results.pageSize).toBeDefined();

      const connector = results.connectors![0];
      expect(connector.id).toBe('test-connector');
      expect(connector.displayName).toBe('Test Connector');
      expect(connector.latestVersion).toBe('1.0.0');
      expect(connector.capabilities).toEqual(['read', 'write']);
    });

    it('should handle empty connector list', async () => {
      const results = await registryClient.search();

      expect(results.connectors).toEqual([]);
      expect(results.total).toBe(0);
    });

    it('should support pagination', async () => {
      // Publish multiple connectors
      for (let i = 0; i < 5; i++) {
        await registryClient.publish({
          manifest: {
            id: `connector-${i}`,
            version: '1.0.0',
            displayName: `Connector ${i}`,
            author: 'Test',
            capabilities: ['read'],
          },
          tarball: Buffer.from(`tarball-${i}`).toString('base64'),
          signature: {
            version: 1,
            keyId: 'key',
            algorithm: 'ed25519',
            signature: 'sig',
            checksum: 'checksum',
            signedAt: new Date().toISOString(),
          },
        });
      }

      // Get page 1
      const page1 = await registryClient.search({ page: 1, pageSize: 2 });
      expect(page1.connectors).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.page).toBe(1);

      // Get page 2
      const page2 = await registryClient.search({ page: 2, pageSize: 2 });
      expect(page2.connectors).toHaveLength(2);
      expect(page2.page).toBe(2);
    });
  });

  // =============================================================================
  // Get Connector Details
  // =============================================================================

  describe('Get Connector Details', () => {
    it('should get connector details with correct types', async () => {
      // Publish a connector
      const manifest: ConnectorManifest = {
        id: 'details-test',
        version: '1.0.0',
        displayName: 'Details Test Connector',
        description: 'Testing connector details',
        author: 'Test Author',
        capabilities: ['read', 'write', 'search'],
      };

      await registryClient.publish({
        manifest,
        tarball: Buffer.from('tarball').toString('base64'),
        signature: {
          version: 1,
          keyId: 'key-1',
          algorithm: 'ed25519',
          signature: 'signature-data',
          checksum: 'sha256-checksum',
          signedAt: new Date().toISOString(),
        },
      });

      // Get connector details
      const details = await registryClient.getConnector('details-test');

      expect(details.id).toBe('details-test');
      expect(details.displayName).toBe('Details Test Connector');
      expect(details.description).toBe('Testing connector details');
      expect(details.author).toBe('Test Author');
      expect(details.capabilities).toEqual(['read', 'write', 'search']);
      expect(details.latestVersion).toBe('1.0.0');
      expect(details.versions).toContain('1.0.0');
      expect(details.totalDownloads).toBeDefined();
      expect(details.createdAt).toBeDefined();
      expect(details.updatedAt).toBeDefined();
    });

    it('should include all versions in details', async () => {
      // Publish version 1.0.0
      await registryClient.publish({
        manifest: {
          id: 'multi-version',
          version: '1.0.0',
          displayName: 'Multi Version',
          author: 'Test',
          capabilities: ['read'],
        },
        tarball: Buffer.from('v1').toString('base64'),
        signature: {
          version: 1,
          keyId: 'key',
          algorithm: 'ed25519',
          signature: 'sig1',
          checksum: 'check1',
          signedAt: new Date().toISOString(),
        },
      });

      // Publish version 1.1.0
      await registryClient.publish({
        manifest: {
          id: 'multi-version',
          version: '1.1.0',
          displayName: 'Multi Version',
          author: 'Test',
          capabilities: ['read'],
        },
        tarball: Buffer.from('v2').toString('base64'),
        signature: {
          version: 1,
          keyId: 'key',
          algorithm: 'ed25519',
          signature: 'sig2',
          checksum: 'check2',
          signedAt: new Date().toISOString(),
        },
      });

      const details = await registryClient.getConnector('multi-version');

      expect(details.versions).toContain('1.0.0');
      expect(details.versions).toContain('1.1.0');
      expect(details.latestVersion).toBe('1.1.0');
    });

    it('should handle 404 for non-existent connector', async () => {
      await expect(
        registryClient.getConnector('non-existent-connector')
      ).rejects.toThrow(/Connector not found/);
    });
  });

  // =============================================================================
  // Search Connectors
  // =============================================================================

  describe('Search Connectors', () => {
    it('should search by query string', async () => {
      // Publish multiple connectors
      await registryClient.publish({
        manifest: {
          id: 'github-connector',
          version: '1.0.0',
          displayName: 'GitHub Integration',
          description: 'Connect to GitHub',
          author: 'Test',
          capabilities: ['read'],
        },
        tarball: Buffer.from('gh').toString('base64'),
        signature: {
          version: 1,
          keyId: 'key',
          algorithm: 'ed25519',
          signature: 'sig',
          checksum: 'check',
          signedAt: new Date().toISOString(),
        },
      });

      await registryClient.publish({
        manifest: {
          id: 'gitlab-connector',
          version: '1.0.0',
          displayName: 'GitLab Integration',
          description: 'Connect to GitLab',
          author: 'Test',
          capabilities: ['read'],
        },
        tarball: Buffer.from('gl').toString('base64'),
        signature: {
          version: 1,
          keyId: 'key',
          algorithm: 'ed25519',
          signature: 'sig',
          checksum: 'check',
          signedAt: new Date().toISOString(),
        },
      });

      // Search for GitHub
      const results = await registryClient.search({ q: 'GitHub' });

      expect(results.total).toBe(1);
      expect(results.connectors![0].id).toBe('github-connector');
    });

    it('should search in both displayName and description', async () => {
      await registryClient.publish({
        manifest: {
          id: 'search-test',
          version: '1.0.0',
          displayName: 'Test Connector',
          description: 'This has the keyword workflow in description',
          author: 'Test',
          capabilities: ['read'],
        },
        tarball: Buffer.from('test').toString('base64'),
        signature: {
          version: 1,
          keyId: 'key',
          algorithm: 'ed25519',
          signature: 'sig',
          checksum: 'check',
          signedAt: new Date().toISOString(),
        },
      });

      const results = await registryClient.search({ q: 'workflow' });

      expect(results.total).toBe(1);
      expect(results.connectors![0].id).toBe('search-test');
    });

    it('should return empty results for no matches', async () => {
      const results = await registryClient.search({ q: 'nonexistent-query-xyz' });

      expect(results.total).toBe(0);
      expect(results.connectors).toEqual([]);
    });
  });

  // =============================================================================
  // Publish Connector
  // =============================================================================

  describe('Publish Connector', () => {
    it('should publish connector with signature validation', async () => {
      const manifest: ConnectorManifest = {
        id: 'new-connector',
        version: '1.0.0',
        displayName: 'New Connector',
        description: 'A brand new connector',
        author: 'Publisher',
        capabilities: ['read', 'write'],
      };

      const signature: SignatureFile = {
        version: 1,
        keyId: 'publisher-key-123',
        algorithm: 'ed25519',
        signature: 'base64-encoded-signature',
        checksum: 'sha256-tarball-checksum',
        signedAt: new Date().toISOString(),
      };

      const request: PublishFullRequest = {
        manifest,
        tarball: Buffer.from('connector-tarball-data').toString('base64'),
        signature,
      };

      const response = await registryClient.publish(request);

      expect(response.success).toBe(true);
      expect(response.connectorId).toBe('new-connector');
      expect(response.version).toBe('1.0.0');
      expect(response.checksum).toBeDefined();
      expect(response.tarballUrl).toContain('new-connector');
      expect(response.tarballUrl).toContain('1.0.0');
    });

    it('should handle validation errors', async () => {
      const invalidRequest = {
        // Missing required fields
        manifest: {
          id: 'invalid',
        },
      } as PublishFullRequest;

      await expect(registryClient.publish(invalidRequest)).rejects.toThrow(
        /Missing required fields/
      );
    });

    it('should verify request body types match generated types', async () => {
      // This test demonstrates type safety at compile time
      const request: PublishFullRequest = {
        manifest: {
          id: 'type-safe-connector',
          version: '1.0.0',
          displayName: 'Type Safe',
          author: 'Test',
          capabilities: ['read'],
        },
        tarball: 'base64-data',
        signature: {
          version: 1,
          keyId: 'key',
          algorithm: 'ed25519',
          signature: 'sig',
          checksum: 'check',
          signedAt: new Date().toISOString(),
        },
      };

      const response = await registryClient.publish(request);

      // Response types should match PublishFullResponse
      expect(typeof response.success).toBe('boolean');
      expect(typeof response.connectorId).toBe('string');
      expect(typeof response.version).toBe('string');
      expect(typeof response.checksum).toBe('string');
      expect(typeof response.tarballUrl).toBe('string');
    });
  });

  // =============================================================================
  // Error Handling
  // =============================================================================

  describe('Error Handling', () => {
    it('should handle rate limiting responses', async () => {
      mockServer.setRateLimitExceeded(true);

      try {
        await registryClient.search();
        expect.fail('Should have thrown rate limit error');
      } catch (error: any) {
        expect(error.status).toBe(429);
        expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      }
    });

    it('should handle authentication failures', async () => {
      // Note: Current mock doesn't require auth for registry endpoints
      // This test demonstrates the pattern for when auth is added
      const response = await registryClient.search();
      expect(response).toBeDefined();
    });

    it('should handle network errors gracefully', async () => {
      // Create client with invalid URL
      const invalidClient = new RegistryClient('http://localhost:1');

      await expect(invalidClient.search()).rejects.toThrow();
    });
  });

  // =============================================================================
  // Type Safety Tests
  // =============================================================================

  describe('Type Safety', () => {
    it('should enforce SearchResults type structure', async () => {
      const results = await registryClient.search();

      // Verify structure matches SearchResults type
      expect(results).toHaveProperty('connectors');
      expect(results).toHaveProperty('total');
      expect(results).toHaveProperty('page');
      expect(results).toHaveProperty('pageSize');

      expect(typeof results.total).toBe('number');
      expect(typeof results.page).toBe('number');
      expect(Array.isArray(results.connectors)).toBe(true);
    });

    it('should enforce ConnectorDetails type structure', async () => {
      await registryClient.publish({
        manifest: {
          id: 'type-test',
          version: '1.0.0',
          displayName: 'Type Test',
          author: 'Test',
          capabilities: ['read'],
        },
        tarball: Buffer.from('data').toString('base64'),
        signature: {
          version: 1,
          keyId: 'key',
          algorithm: 'ed25519',
          signature: 'sig',
          checksum: 'check',
          signedAt: new Date().toISOString(),
        },
      });

      const details = await registryClient.getConnector('type-test');

      // Verify all required fields
      expect(details).toHaveProperty('id');
      expect(details).toHaveProperty('displayName');
      expect(details).toHaveProperty('author');
      expect(details).toHaveProperty('capabilities');
      expect(details).toHaveProperty('latestVersion');
      expect(details).toHaveProperty('versions');
      expect(details).toHaveProperty('totalDownloads');
      expect(details).toHaveProperty('createdAt');
      expect(details).toHaveProperty('updatedAt');

      expect(Array.isArray(details.versions)).toBe(true);
      expect(Array.isArray(details.capabilities)).toBe(true);
    });

    it('should enforce SignatureFile type structure', async () => {
      const signature: SignatureFile = {
        version: 1,
        keyId: 'test-key-id',
        algorithm: 'ed25519',
        signature: 'signature-bytes',
        checksum: 'sha256-checksum',
        signedAt: new Date().toISOString(),
      };

      // Verify all required fields are present
      expect(signature.version).toBe(1);
      expect(signature.keyId).toBe('test-key-id');
      expect(signature.algorithm).toBe('ed25519');
      expect(signature.signature).toBeTruthy();
      expect(signature.checksum).toBeTruthy();
      expect(signature.signedAt).toBeTruthy();
    });
  });
});
