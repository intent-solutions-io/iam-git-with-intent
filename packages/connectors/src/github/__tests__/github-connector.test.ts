import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubConnector } from '../github-connector.js';
import { GITHUB_CONNECTOR_METADATA } from '../types.js';
import type { SyncOptions, WebhookEvent } from '../../interfaces/types.js';
import { ConsoleLogger, NoOpMetrics } from '../../core/base-connector.js';

// Mock Octokit
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    rest: {
      users: {
        getAuthenticated: vi.fn().mockResolvedValue({
          data: { login: 'test-user', id: 123, type: 'User' }
        })
      },
      rateLimit: {
        get: vi.fn().mockResolvedValue({
          data: { rate: { remaining: 4500, limit: 5000, reset: Date.now() + 3600 } }
        })
      },
      pulls: {
        get: vi.fn().mockResolvedValue({
          data: {
            id: 1,
            node_id: 'PR_1',
            number: 42,
            title: 'Test PR',
            body: 'Test body',
            state: 'open',
            locked: false,
            draft: false,
            merged: false,
            mergeable: true,
            mergeable_state: 'clean',
            head: { ref: 'feature', sha: 'abc123', repo: { full_name: 'owner/repo' } },
            base: { ref: 'main', sha: 'def456', repo: { full_name: 'owner/repo' } },
            user: { login: 'test-user', id: 123 },
            labels: [],
            assignees: [],
            requested_reviewers: [],
            additions: 10,
            deletions: 5,
            changed_files: 2,
            commits: 1,
            comments: 0,
            review_comments: 0,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            closed_at: null,
            merged_at: null,
            merged_by: null
          }
        }),
        list: vi.fn().mockResolvedValue({
          data: []
        }),
        listFiles: vi.fn().mockResolvedValue({
          data: [
            {
              sha: 'file123',
              filename: 'src/test.ts',
              status: 'modified',
              additions: 10,
              deletions: 5,
              changes: 15,
              patch: '@@ -1,5 +1,10 @@',
              contents_url: 'https://api.github.com/repos/owner/repo/contents/src/test.ts'
            }
          ]
        })
      },
      issues: {
        get: vi.fn().mockResolvedValue({
          data: {
            id: 1,
            node_id: 'I_1',
            number: 1,
            title: 'Test Issue',
            body: 'Test body',
            state: 'open',
            state_reason: null,
            locked: false,
            user: { login: 'test-user', id: 123 },
            labels: [],
            assignees: [],
            milestone: null,
            comments: 0,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            closed_at: null
          }
        }),
        listForRepo: vi.fn().mockResolvedValue({
          data: []
        }),
        createComment: vi.fn().mockResolvedValue({
          data: { id: 999 }
        }),
        addLabels: vi.fn().mockResolvedValue({
          data: []
        })
      },
      repos: {
        getContent: vi.fn().mockResolvedValue({
          data: {
            type: 'file',
            content: Buffer.from('file content').toString('base64'),
            encoding: 'base64'
          }
        })
      }
    },
    paginate: {
      iterator: vi.fn().mockImplementation(() => ({
        async *[Symbol.asyncIterator]() {
          yield { data: [] };
        }
      }))
    },
    graphql: vi.fn().mockResolvedValue({})
  }))
}));

// TODO(gwi-64f): Vitest 4 mock constructor pattern broken — re-enable after mock migration
describe.skip('GitHubConnector', () => {
  let connector: GitHubConnector;
  let logger: ConsoleLogger;
  let metrics: NoOpMetrics;

  beforeEach(() => {
    logger = new ConsoleLogger({ test: true });
    metrics = new NoOpMetrics();
    connector = new GitHubConnector(logger, metrics);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('metadata', () => {
    it('should return correct connector name', () => {
      expect(connector.name).toBe('github');
    });

    it('should return correct version', () => {
      expect(connector.version).toBe('1.0.0');
    });

    it('should return full metadata', () => {
      const metadata = connector.getMetadata();
      expect(metadata.name).toBe('github');
      expect(metadata.recordTypes).toContain('pull_request');
      expect(metadata.recordTypes).toContain('issue');
      expect(metadata.authMethods).toContain('bearer');
      expect(metadata.authMethods).toContain('oauth2');
      expect(metadata.supportsWebhooks).toBe(true);
      expect(metadata.supportsIncremental).toBe(true);
    });
  });

  describe('authenticate', () => {
    it('should authenticate with bearer token', async () => {
      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'bearer' as const,
          token: 'ghp_test123'
        }
      };

      const result = await connector.authenticate(config);

      expect(result.success).toBe(true);
      expect(result.metadata?.login).toBe('test-user');
      expect(result.metadata?.authType).toBe('bearer');
    });

    it('should authenticate with OAuth', async () => {
      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'oauth2' as const,
          clientId: 'client-id',
          clientSecret: 'client-secret',
          redirectUri: 'https://example.com/callback',
          accessToken: 'access-token-123'
        }
      };

      const result = await connector.authenticate(config);

      expect(result.success).toBe(true);
      expect(result.metadata?.authType).toBe('oauth2');
    });

    it('should throw on missing OAuth access token', async () => {
      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'oauth2' as const,
          clientId: 'client-id',
          clientSecret: 'client-secret',
          redirectUri: 'https://example.com/callback'
        }
      };

      await expect(connector.authenticate(config)).rejects.toThrow('OAuth requires accessToken');
    });

    it('should throw on invalid config', async () => {
      const config = {
        tenantId: '',
        auth: {
          type: 'bearer' as const,
          token: ''
        }
      };

      await expect(connector.authenticate(config)).rejects.toThrow();
    });
  });

  describe('healthCheck', () => {
    it('should pass health check when authenticated', async () => {
      // First authenticate
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'ghp_test123' }
      });

      const health = await connector.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.connector).toBe('github');
      expect(health.checks).toHaveLength(3);
      expect(health.checks.find(c => c.name === 'api_connectivity')?.status).toBe('pass');
      expect(health.checks.find(c => c.name === 'rate_limit')?.status).toBe('pass');
      expect(health.checks.find(c => c.name === 'authentication')?.status).toBe('pass');
    });

    it('should fail health check when not authenticated', async () => {
      const health = await connector.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.checks.find(c => c.name === 'api_connectivity')?.status).toBe('fail');
    });
  });

  describe('getPullRequest', () => {
    it('should get pull request details', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'ghp_test123' }
      });

      const pr = await connector.getPullRequest('owner', 'repo', 42);

      expect(pr.number).toBe(42);
      expect(pr.title).toBe('Test PR');
      expect(pr.state).toBe('open');
      expect(pr.head.ref).toBe('feature');
      expect(pr.base.ref).toBe('main');
    });

    it('should throw when not authenticated', async () => {
      await expect(connector.getPullRequest('owner', 'repo', 42))
        .rejects.toThrow('Not authenticated');
    });
  });

  describe('getIssue', () => {
    it('should get issue details', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'ghp_test123' }
      });

      const issue = await connector.getIssue('owner', 'repo', 1);

      expect(issue.number).toBe(1);
      expect(issue.title).toBe('Test Issue');
      expect(issue.state).toBe('open');
    });
  });

  describe('createComment', () => {
    it('should create a comment', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'ghp_test123' }
      });

      const commentId = await connector.createComment('owner', 'repo', 1, 'Test comment');

      expect(commentId).toBe(999);
    });
  });

  describe('addLabels', () => {
    it('should add labels', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'ghp_test123' }
      });

      await expect(connector.addLabels('owner', 'repo', 1, ['bug', 'priority']))
        .resolves.toBeUndefined();
    });
  });

  describe('getFileContent', () => {
    it('should get file content', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'ghp_test123' }
      });

      const content = await connector.getFileContent('owner', 'repo', 'README.md');

      expect(content).toBe('file content');
    });
  });

  describe('processWebhook', () => {
    it('should process pull_request webhook', async () => {
      const event: WebhookEvent = {
        id: 'webhook-123',
        source: 'github',
        type: 'pull_request',
        timestamp: new Date().toISOString(),
        payload: {
          action: 'opened',
          sender: { login: 'test-user', id: 123 },
          repository: { id: 1, name: 'repo', fullName: 'owner/repo', owner: { login: 'owner', id: 456 } },
          pull_request: {
            id: 1,
            number: 42,
            title: 'Test PR'
          }
        },
        signature: 'sha256=abc123',
        headers: {}
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.metadata?.eventType).toBe('pull_request');
      expect(result.metadata?.action).toBe('opened');
    });

    it('should process push webhook', async () => {
      const event: WebhookEvent = {
        id: 'webhook-456',
        source: 'github',
        type: 'push',
        timestamp: new Date().toISOString(),
        payload: {
          sender: { login: 'test-user', id: 123 },
          repository: { id: 1, name: 'repo', fullName: 'owner/repo', owner: { login: 'owner', id: 456 } },
          ref: 'refs/heads/main',
          commits: [
            { sha: 'abc123', message: 'First commit' },
            { sha: 'def456', message: 'Second commit' }
          ]
        },
        signature: 'sha256=abc123',
        headers: {}
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(2);
    });

    it('should handle unrecognized webhook types', async () => {
      const event: WebhookEvent = {
        id: 'webhook-789',
        source: 'github',
        type: 'unknown_event',
        timestamp: new Date().toISOString(),
        payload: {
          sender: { login: 'test-user', id: 123 },
          repository: { id: 1, name: 'repo', fullName: 'owner/repo', owner: { login: 'owner', id: 456 } }
        },
        signature: 'sha256=abc123',
        headers: {}
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(0);
    });
  });

  describe('sync', () => {
    it('should throw when not authenticated', async () => {
      const options: SyncOptions = {
        types: ['pull_request']
      };

      const iterator = connector.sync(options);
      await expect(iterator.next()).rejects.toThrow('Not authenticated');
    });

    it('should sync with valid options', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'ghp_test123' }
      });

      const options = {
        repositories: ['owner/repo'],
        recordTypes: ['pull_request']
      };

      const iterator = connector.sync(options);
      const result = await iterator.next();

      // Iterator should complete (empty mocked data)
      expect(result.done).toBe(true);
    });
  });

  describe('graphql', () => {
    it('should execute GraphQL query', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'ghp_test123' }
      });

      const query = `
        query {
          viewer {
            login
          }
        }
      `;

      const result = await connector.graphql(query);
      expect(result).toBeDefined();
    });

    it('should throw when not authenticated', async () => {
      await expect(connector.graphql('query { viewer { login } }'))
        .rejects.toThrow('Not authenticated');
    });
  });
});

describe('GITHUB_CONNECTOR_METADATA', () => {
  it('should have correct structure', () => {
    expect(GITHUB_CONNECTOR_METADATA.name).toBe('github');
    expect(GITHUB_CONNECTOR_METADATA.version).toBe('1.0.0');
    expect(GITHUB_CONNECTOR_METADATA.displayName).toBe('GitHub');
    expect(GITHUB_CONNECTOR_METADATA.recordTypes).toContain('pull_request');
    expect(GITHUB_CONNECTOR_METADATA.authMethods).toContain('bearer');
    expect(GITHUB_CONNECTOR_METADATA.supportsWebhooks).toBe(true);
    expect(GITHUB_CONNECTOR_METADATA.rateLimits.requestsPerHour).toBe(5000);
  });
});
