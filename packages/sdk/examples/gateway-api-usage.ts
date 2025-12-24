/**
 * Example: Using Auto-Generated Gateway API Types
 *
 * This example demonstrates how to use the auto-generated types
 * from the OpenAPI specification with the SDK.
 */

import type {
  // Generated types from OpenAPI
  paths,
  components,
  operations,
  // Type helpers
  RequestBody,
  SuccessResponse,
  PathParams,
  QueryParams,
  // Convenience aliases
  SearchConnectorsParams,
  SearchConnectorsResponse,
  PublishConnectorRequest,
  ScimUser,
} from '../src/index.js';

// =============================================================================
// Example 1: Using convenience type aliases
// =============================================================================

async function searchConnectors(params: SearchConnectorsParams): Promise<SearchConnectorsResponse> {
  // Type-safe search parameters
  const searchParams: SearchConnectorsParams = {
    q: 'github',
    capabilities: 'auth,cloud',
    page: 1,
    pageSize: 20,
    sortBy: 'downloads',
    sortOrder: 'desc',
  };

  // In real code, you'd call the API here
  // const response = await fetch(...);
  // return response.json() as SearchConnectorsResponse;

  // Mock response for example
  return {
    connectors: [],
    total: 0,
    page: 1,
    pageSize: 20,
  };
}

// =============================================================================
// Example 2: Using type helper utilities
// =============================================================================

// Extract request body type from publishFull operation
type MyPublishRequest = RequestBody<'publishFull'>;

// Extract response type from searchConnectors operation
type MySearchResponse = SuccessResponse<'searchConnectors'>;

// Extract path parameters from getConnector operation
type MyConnectorParams = PathParams<'getConnector'>;

// Extract query parameters
type MyQueryParams = QueryParams<'searchConnectors'>;

async function publishConnector(request: PublishConnectorRequest): Promise<void> {
  // Fully typed publish request
  const publishReq: PublishConnectorRequest = {
    manifest: {
      id: 'my-connector',
      version: '1.0.0',
      displayName: 'My Awesome Connector',
      description: 'A connector for doing awesome things',
      author: 'Me',
      capabilities: ['auth', 'cloud'],
    },
    tarball: Buffer.from('tarball-content').toString('base64'),
    signature: {
      version: 1,
      keyId: 'key-123',
      algorithm: 'ed25519',
      signature: 'signature-data-here',
      checksum: '0123456789abcdef'.repeat(4), // SHA256 hex (64 chars) - dummy data
      signedAt: new Date().toISOString(),
    },
  };

  // In real code, POST to /v1/publish
  console.log('Publishing connector:', publishReq.manifest.id);
}

// =============================================================================
// Example 3: Using component schemas directly
// =============================================================================

function processUser(user: ScimUser): void {
  console.log(`Processing SCIM user: ${user.userName}`);

  // TypeScript knows the structure from OpenAPI spec
  if (user.emails && user.emails.length > 0) {
    const primaryEmail = user.emails.find((e) => e.primary);
    console.log(`Primary email: ${primaryEmail?.value}`);
  }

  // Active status
  console.log(`Active: ${user.active ?? true}`);
}

// =============================================================================
// Example 4: Using paths type for route-level types
// =============================================================================

// Get the full path definition
type SearchPath = paths['/v1/search'];

// Access specific HTTP methods
type SearchGetOperation = paths['/v1/search']['get'];

// =============================================================================
// Example 5: Using operations type
// =============================================================================

// Access operation by operationId
type SearchOp = operations['searchConnectors'];
type GetConnectorOp = operations['getConnector'];
type PublishOp = operations['publishFull'];

// Extract parameters from operation
type SearchParameters = SearchOp['parameters'];

// =============================================================================
// Example 6: Working with component schemas
// =============================================================================

// Access schemas directly
type ErrorSchema = components['schemas']['Error'];
type ConnectorManifest = components['schemas']['ConnectorManifest'];
type SignatureFile = components['schemas']['SignatureFile'];

function handleError(error: ErrorSchema): void {
  console.error(`Error: ${error.error}`);
  if (error.message) {
    console.error(`Message: ${error.message}`);
  }
  if (error.details) {
    console.error('Details:', error.details);
  }
}

// =============================================================================
// Example 7: Type-safe API client wrapper
// =============================================================================

class GatewayClient {
  constructor(private baseUrl: string) {}

  async search(params: SearchConnectorsParams): Promise<SearchConnectorsResponse> {
    const queryString = new URLSearchParams(params as Record<string, string>).toString();
    const response = await fetch(`${this.baseUrl}/v1/search?${queryString}`);

    if (!response.ok) {
      const error: ErrorSchema = await response.json();
      throw new Error(error.message || error.error);
    }

    return response.json() as Promise<SearchConnectorsResponse>;
  }

  async getConnector(id: string): Promise<SuccessResponse<'getConnector'>> {
    const response = await fetch(`${this.baseUrl}/v1/connectors/${id}`);

    if (!response.ok) {
      const error: ErrorSchema = await response.json();
      throw new Error(error.message || error.error);
    }

    return response.json() as Promise<SuccessResponse<'getConnector'>>;
  }

  async publish(request: PublishConnectorRequest): Promise<SuccessResponse<'publishFull'>> {
    const response = await fetch(`${this.baseUrl}/v1/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error: ErrorSchema = await response.json();
      throw new Error(error.message || error.error);
    }

    return response.json() as Promise<SuccessResponse<'publishFull'>>;
  }
}

// =============================================================================
// Usage
// =============================================================================

async function main() {
  const client = new GatewayClient('https://gateway.gitwithintent.com');

  // Search for connectors
  const results = await client.search({
    q: 'github',
    capabilities: 'auth',
    pageSize: 10,
  });

  console.log(`Found ${results.total} connectors`);

  // Get specific connector
  if (results.connectors && results.connectors.length > 0) {
    const firstConnector = results.connectors[0];
    if (firstConnector.id) {
      const details = await client.getConnector(firstConnector.id);
      console.log(`Connector: ${details.displayName}`);
    }
  }
}

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { searchConnectors, publishConnector, processUser, handleError, GatewayClient };
