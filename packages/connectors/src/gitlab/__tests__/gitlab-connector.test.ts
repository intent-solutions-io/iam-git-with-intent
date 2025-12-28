import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { GitLabConnector } from '../gitlab-connector.js';
import { GITLAB_CONNECTOR_METADATA } from '../types.js';
import type { SyncOptions, WebhookEvent } from '../../interfaces/types.js';
import { ConsoleLogger, NoOpMetrics } from '../../core/base-connector.js';
import { AuthenticationError, ConnectorError } from '../../errors/index.js';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('GitLabConnector', () => {
  let connector: GitLabConnector;
  let logger: ConsoleLogger;
  let metrics: NoOpMetrics;
  let mockAxiosInstance: any;

  beforeEach(() => {
    logger = new ConsoleLogger({ test: true });
    metrics = new NoOpMetrics();
    connector = new GitLabConnector(logger, metrics);

    // Create mock axios instance
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn()
    };

    mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('metadata', () => {
    it('should return correct connector name', () => {
      expect(connector.name).toBe('gitlab');
    });

    it('should return correct version', () => {
      expect(connector.version).toBe('1.0.0');
    });

    it('should return full metadata', () => {
      const metadata = connector.getMetadata();
      expect(metadata.name).toBe('gitlab');
      expect(metadata.recordTypes).toContain('merge_request');
      expect(metadata.recordTypes).toContain('issue');
      expect(metadata.recordTypes).toContain('project');
      expect(metadata.authMethods).toContain('bearer');
      expect(metadata.authMethods).toContain('oauth2');
      expect(metadata.supportsWebhooks).toBe(true);
      expect(metadata.supportsIncremental).toBe(true);
    });

    it('should include correct capabilities', () => {
      const metadata = connector.getMetadata();
      expect(metadata.capabilities).toContain('sync');
      expect(metadata.capabilities).toContain('webhook');
      expect(metadata.capabilities).toContain('write_comments');
      expect(metadata.capabilities).toContain('write_labels');
    });
  });

  describe('authenticate', () => {
    it('should authenticate with bearer token (PAT)', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          id: 123,
          username: 'test-user',
          name: 'Test User'
        }
      });

      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'bearer' as const,
          token: 'glpat-test123'
        }
      };

      const result = await connector.authenticate(config);

      expect(result.success).toBe(true);
      expect(result.token).toBe('glpat-test123');
      expect(result.metadata?.username).toBe('test-user');
      expect(result.metadata?.authType).toBe('bearer');

      // Verify axios was configured with PRIVATE-TOKEN header
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'PRIVATE-TOKEN': 'glpat-test123'
          })
        })
      );
    });

    it('should authenticate with OAuth', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          id: 123,
          username: 'test-user',
          name: 'Test User'
        }
      });

      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'oauth2' as const,
          clientId: 'client-id',
          clientSecret: 'client-secret',
          redirectUri: 'https://example.com/callback',
          accessToken: 'oauth-token-123'
        }
      };

      const result = await connector.authenticate(config);

      expect(result.success).toBe(true);
      expect(result.metadata?.authType).toBe('oauth2');

      // Verify axios was configured with Bearer token
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer oauth-token-123'
          })
        })
      );
    });

    it('should use custom base URL for self-hosted GitLab', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { id: 123, username: 'test-user', name: 'Test User' }
      });

      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'bearer' as const,
          token: 'token'
        },
        baseUrl: 'https://gitlab.example.com/api/v4'
      };

      await connector.authenticate(config);

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://gitlab.example.com/api/v4'
        })
      );
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

      await expect(connector.authenticate(config)).rejects.toThrow(AuthenticationError);
    });

    it('should throw on authentication API error', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('401 Unauthorized'));

      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'bearer' as const,
          token: 'invalid-token'
        }
      };

      await expect(connector.authenticate(config)).rejects.toThrow(AuthenticationError);
    });
  });

  describe('healthCheck', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { id: 123, username: 'test-user', name: 'Test User' }
      });

      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer' as const, token: 'token' }
      });
    });

    it('should return healthy status when all checks pass', async () => {
      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: { version: '16.0.0' } }) // version check
        .mockResolvedValueOnce({ data: { id: 123 } }) // auth check
        .mockResolvedValueOnce({
          data: [],
          headers: {
            'ratelimit-remaining': '95',
            'ratelimit-limit': '100'
          }
        }); // rate limit check

      const health = await connector.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.connector).toBe('gitlab');
      expect(health.checks).toHaveLength(3);
      expect(health.checks[0].name).toBe('api_connectivity');
      expect(health.checks[0].status).toBe('pass');
      expect(health.checks[1].name).toBe('authentication');
      expect(health.checks[1].status).toBe('pass');
      expect(health.checks[2].name).toBe('rate_limit');
      expect(health.checks[2].status).toBe('pass');
    });

    it('should warn on high rate limit usage', async () => {
      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: { version: '16.0.0' } })
        .mockResolvedValueOnce({ data: { id: 123 } })
        .mockResolvedValueOnce({
          data: [],
          headers: {
            'ratelimit-remaining': '5',
            'ratelimit-limit': '100'
          }
        });

      const health = await connector.healthCheck();

      const rateLimitCheck = health.checks.find(c => c.name === 'rate_limit');
      expect(rateLimitCheck?.status).toBe('warn');
      expect(rateLimitCheck?.error).toContain('95.0% of rate limit used');
    });

    it('should return unhealthy when API connectivity fails', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Network error'));

      const health = await connector.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.checks[0].status).toBe('fail');
    });
  });

  describe('getProject', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { id: 123, username: 'test-user', name: 'Test User' }
      });

      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer' as const, token: 'token' }
      });
    });

    it('should fetch and map project details', async () => {
      const mockProject = {
        id: 456,
        name: 'my-project',
        name_with_namespace: 'Group / My Project',
        path: 'my-project',
        path_with_namespace: 'group/my-project',
        description: 'Test project',
        visibility: 'private',
        archived: false,
        default_branch: 'main',
        empty_repo: false,
        namespace: {
          id: 789,
          name: 'Group',
          path: 'group',
          kind: 'group'
        },
        owner: {
          id: 123,
          username: 'owner',
          name: 'Owner Name'
        },
        forked_from_project: null,
        topics: ['typescript', 'api'],
        last_activity_at: '2024-01-15T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z'
      };

      mockAxiosInstance.get.mockResolvedValueOnce({ data: mockProject });

      const project = await connector.getProject('group%2Fmy-project');

      expect(project.id).toBe(456);
      expect(project.name).toBe('my-project');
      expect(project.pathWithNamespace).toBe('group/my-project');
      expect(project.visibility).toBe('private');
      expect(project.namespace.kind).toBe('group');
      expect(project.topics).toEqual(['typescript', 'api']);
    });

    it('should throw when not authenticated', async () => {
      const unauthConnector = new GitLabConnector(logger, metrics);
      await expect(unauthConnector.getProject('123')).rejects.toThrow(ConnectorError);
    });
  });

  describe('getMergeRequest', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { id: 123, username: 'test-user', name: 'Test User' }
      });

      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer' as const, token: 'token' }
      });
    });

    it('should fetch and map merge request details', async () => {
      const mockMR = {
        id: 999,
        iid: 42,
        project_id: 456,
        title: 'Fix bug',
        description: 'This fixes the bug',
        state: 'opened',
        merged_by: null,
        merged_at: null,
        closed_by: null,
        closed_at: null,
        target_branch: 'main',
        source_branch: 'fix-bug',
        author: {
          id: 123,
          username: 'author',
          name: 'Author Name'
        },
        assignees: [],
        reviewers: [],
        labels: ['bug', 'priority'],
        milestone: null,
        draft: false,
        work_in_progress: false,
        merge_when_pipeline_succeeds: false,
        merge_status: 'can_be_merged',
        sha: 'abc123',
        merge_commit_sha: null,
        squash_commit_sha: null,
        diff_refs: {
          base_sha: 'def456',
          head_sha: 'abc123',
          start_sha: 'def456'
        },
        user_notes_count: 5,
        changes_count: '12',
        should_remove_source_branch: true,
        force_remove_source_branch: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z'
      };

      mockAxiosInstance.get.mockResolvedValueOnce({ data: mockMR });

      const mr = await connector.getMergeRequest('group%2Fproject', 42);

      expect(mr.id).toBe(999);
      expect(mr.iid).toBe(42);
      expect(mr.title).toBe('Fix bug');
      expect(mr.state).toBe('opened');
      expect(mr.targetBranch).toBe('main');
      expect(mr.sourceBranch).toBe('fix-bug');
      expect(mr.labels).toEqual(['bug', 'priority']);
      expect(mr.mergeStatus).toBe('can_be_merged');
    });
  });

  describe('getIssue', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { id: 123, username: 'test-user', name: 'Test User' }
      });

      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer' as const, token: 'token' }
      });
    });

    it('should fetch and map issue details', async () => {
      const mockIssue = {
        id: 888,
        iid: 10,
        project_id: 456,
        title: 'Bug report',
        description: 'Something is broken',
        state: 'opened',
        type: 'issue',
        author: {
          id: 123,
          username: 'reporter',
          name: 'Reporter Name'
        },
        assignees: [],
        labels: ['bug'],
        milestone: null,
        due_date: null,
        confidential: false,
        discussion_locked: false,
        user_notes_count: 3,
        weight: null,
        epic_iid: null,
        closed_by: null,
        closed_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-10T00:00:00Z'
      };

      mockAxiosInstance.get.mockResolvedValueOnce({ data: mockIssue });

      const issue = await connector.getIssue('group%2Fproject', 10);

      expect(issue.id).toBe(888);
      expect(issue.iid).toBe(10);
      expect(issue.title).toBe('Bug report');
      expect(issue.state).toBe('opened');
      expect(issue.type).toBe('issue');
      expect(issue.labels).toEqual(['bug']);
    });
  });

  describe('createComment', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { id: 123, username: 'test-user', name: 'Test User' }
      });

      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer' as const, token: 'token' }
      });
    });

    it('should create comment on merge request', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { id: 777 }
      });

      const commentId = await connector.createComment(
        'group%2Fproject',
        'merge_requests',
        42,
        'Looks good!'
      );

      expect(commentId).toBe(777);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/projects/group%2Fproject/merge_requests/42/notes',
        { body: 'Looks good!' }
      );
    });

    it('should create comment on issue', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { id: 888 }
      });

      const commentId = await connector.createComment(
        'group%2Fproject',
        'issues',
        10,
        'Working on this'
      );

      expect(commentId).toBe(888);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/projects/group%2Fproject/issues/10/notes',
        { body: 'Working on this' }
      );
    });
  });

  describe('addLabels', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { id: 123, username: 'test-user', name: 'Test User' }
      });

      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer' as const, token: 'token' }
      });
    });

    it('should add labels to merge request', async () => {
      mockAxiosInstance.put.mockResolvedValueOnce({ data: {} });

      await connector.addLabels('group%2Fproject', 'merge_requests', 42, ['reviewed', 'approved']);

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/projects/group%2Fproject/merge_requests/42',
        { add_labels: 'reviewed,approved' }
      );
    });

    it('should add labels to issue', async () => {
      mockAxiosInstance.put.mockResolvedValueOnce({ data: {} });

      await connector.addLabels('group%2Fproject', 'issues', 10, ['bug', 'critical']);

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/projects/group%2Fproject/issues/10',
        { add_labels: 'bug,critical' }
      );
    });
  });

  describe('sync', () => {
    beforeEach(async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { id: 123, username: 'test-user', name: 'Test User' }
      });

      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer' as const, token: 'token' }
      });
    });

    it('should sync merge requests from projects', async () => {
      const mockMR = {
        id: 1,
        iid: 1,
        project_id: 456,
        title: 'Test MR',
        state: 'opened',
        target_branch: 'main',
        source_branch: 'feature',
        author: { id: 123, username: 'user', name: 'User' },
        assignees: [],
        reviewers: [],
        labels: [],
        diff_refs: { base_sha: 'a', head_sha: 'b', start_sha: 'a' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: [mockMR],
        headers: { 'x-next-page': '' }
      });

      const options: SyncOptions = {
        projects: ['group/project'],
        recordTypes: ['merge_request']
      };

      const records = [];
      for await (const record of connector.sync(options)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('merge_request');
      expect(records[0].id).toBe('gitlab:mr:group%2Fproject!1');
    });

    it('should respect pagination', async () => {
      const mockMR1 = {
        id: 1,
        iid: 1,
        project_id: 456,
        title: 'MR 1',
        state: 'opened',
        target_branch: 'main',
        source_branch: 'feature1',
        author: { id: 123, username: 'user', name: 'User' },
        assignees: [],
        reviewers: [],
        labels: [],
        diff_refs: { base_sha: 'a', head_sha: 'b', start_sha: 'a' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const mockMR2 = {
        ...mockMR1,
        id: 2,
        iid: 2,
        title: 'MR 2',
        source_branch: 'feature2'
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: [mockMR1],
          headers: { 'x-next-page': '2' }
        })
        .mockResolvedValueOnce({
          data: [mockMR2],
          headers: { 'x-next-page': '' }
        });

      const options: SyncOptions = {
        projects: ['group/project'],
        recordTypes: ['merge_request']
      };

      const records = [];
      for await (const record of connector.sync(options)) {
        records.push(record);
      }

      expect(records).toHaveLength(2);
      expect(records[0].data.title).toBe('MR 1');
      expect(records[1].data.title).toBe('MR 2');
    });

    it('should throw when not authenticated', async () => {
      const unauthConnector = new GitLabConnector(logger, metrics);
      const options: SyncOptions = {
        projects: ['group/project']
      };

      await expect(async () => {
        for await (const _record of unauthConnector.sync(options)) {
          // Should not reach here
        }
      }).rejects.toThrow(ConnectorError);
    });
  });

  describe('processWebhook', () => {
    it('should process merge_request webhook', async () => {
      const event: WebhookEvent = {
        id: 'webhook-1',
        source: 'gitlab',
        type: 'merge_request',
        timestamp: new Date().toISOString(),
        signature: 'sig',
        headers: {},
        payload: {
          object_kind: 'merge_request',
          user: {
            id: 123,
            username: 'user',
            name: 'User',
            email: 'user@example.com'
          },
          project: {
            id: 456,
            name: 'project',
            path_with_namespace: 'group/project',
            namespace: 'group'
          },
          object_attributes: {
            id: 789,
            iid: 42,
            title: 'Fix bug',
            state: 'opened',
            action: 'open'
          }
        }
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.metadata?.eventType).toBe('merge_request');
    });

    it('should process push webhook with multiple commits', async () => {
      const event: WebhookEvent = {
        id: 'webhook-2',
        source: 'gitlab',
        type: 'push',
        timestamp: new Date().toISOString(),
        signature: 'sig',
        headers: {},
        payload: {
          object_kind: 'push',
          user: {
            id: 123,
            username: 'user',
            name: 'User',
            email: 'user@example.com'
          },
          project: {
            id: 456,
            name: 'project',
            path_with_namespace: 'group/project',
            namespace: 'group'
          },
          commits: [
            {
              id: 'commit1',
              short_id: 'abc123',
              title: 'Commit 1',
              message: 'Commit 1',
              author_name: 'Author',
              author_email: 'author@example.com',
              authored_date: '2024-01-01T00:00:00Z',
              committer_name: 'Committer',
              committer_email: 'committer@example.com',
              committed_date: '2024-01-01T00:00:00Z',
              parent_ids: []
            },
            {
              id: 'commit2',
              short_id: 'def456',
              title: 'Commit 2',
              message: 'Commit 2',
              author_name: 'Author',
              author_email: 'author@example.com',
              authored_date: '2024-01-01T00:00:00Z',
              committer_name: 'Committer',
              committer_email: 'committer@example.com',
              committed_date: '2024-01-01T00:00:00Z',
              parent_ids: ['commit1']
            }
          ]
        }
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(2);
    });
  });
});
