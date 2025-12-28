import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LinearConnector } from '../linear-connector.js';
import { LINEAR_CONNECTOR_METADATA } from '../types.js';
import type { SyncOptions, WebhookEvent } from '../../interfaces/types.js';
import { ConsoleLogger, NoOpMetrics } from '../../core/base-connector.js';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as any;

describe('LinearConnector', () => {
  let connector: LinearConnector;
  let logger: ConsoleLogger;
  let metrics: NoOpMetrics;
  let mockClient: any;

  beforeEach(() => {
    logger = new ConsoleLogger({ test: true });
    metrics = new NoOpMetrics();
    connector = new LinearConnector(logger, metrics);

    // Mock axios client
    mockClient = {
      post: vi.fn()
    };

    mockedAxios.create = vi.fn().mockReturnValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('metadata', () => {
    it('should return correct connector name', () => {
      expect(connector.name).toBe('linear');
    });

    it('should return correct version', () => {
      expect(connector.version).toBe('1.0.0');
    });

    it('should return full metadata', () => {
      const metadata = connector.getMetadata();
      expect(metadata.name).toBe('linear');
      expect(metadata.recordTypes).toContain('issue');
      expect(metadata.recordTypes).toContain('project');
      expect(metadata.authMethods).toContain('bearer');
      expect(metadata.authMethods).toContain('oauth2');
      expect(metadata.supportsWebhooks).toBe(true);
      expect(metadata.supportsIncremental).toBe(true);
    });
  });

  describe('authenticate', () => {
    it('should authenticate with API key (bearer)', async () => {
      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'bearer' as const,
          token: 'lin_api_test123'
        }
      };

      mockClient.post.mockResolvedValueOnce({
        data: {
          data: {
            viewer: {
              id: 'user-123',
              name: 'Test User',
              email: 'test@example.com'
            }
          }
        }
      });

      const result = await connector.authenticate(config);

      expect(result.success).toBe(true);
      expect(result.metadata?.userId).toBe('user-123');
      expect(result.metadata?.userName).toBe('Test User');
      expect(result.metadata?.authType).toBe('bearer');
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer lin_api_test123'
          })
        })
      );
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

      mockClient.post.mockResolvedValueOnce({
        data: {
          data: {
            viewer: {
              id: 'user-123',
              name: 'Test User',
              email: 'test@example.com'
            }
          }
        }
      });

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

    it('should throw on GraphQL error', async () => {
      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'bearer' as const,
          token: 'invalid-token'
        }
      };

      mockClient.post.mockResolvedValueOnce({
        data: {
          errors: [{ message: 'Authentication failed' }]
        }
      });

      await expect(connector.authenticate(config)).rejects.toThrow();
    });
  });

  describe('healthCheck', () => {
    beforeEach(async () => {
      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'bearer' as const,
          token: 'lin_api_test123'
        }
      };

      mockClient.post.mockResolvedValueOnce({
        data: {
          data: {
            viewer: {
              id: 'user-123',
              name: 'Test User',
              email: 'test@example.com'
            }
          }
        }
      });

      await connector.authenticate(config);
    });

    it('should return healthy status when all checks pass', async () => {
      mockClient.post
        .mockResolvedValueOnce({
          data: { data: { viewer: { id: 'user-123' } } }
        })
        .mockResolvedValueOnce({
          data: { data: { rateLimitStatus: { remaining: 5000, limit: 6000, reset: Date.now() + 3600 } } }
        })
        .mockResolvedValueOnce({
          data: { data: { viewer: { id: 'user-123', name: 'Test User' } } }
        });

      const health = await connector.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.connector).toBe('linear');
      expect(health.checks).toHaveLength(3);
      expect(health.checks[0].name).toBe('api_connectivity');
      expect(health.checks[0].status).toBe('pass');
    });

    it('should return unhealthy status when connectivity fails', async () => {
      mockClient.post.mockRejectedValueOnce(new Error('Network error'));

      const health = await connector.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.checks[0].status).toBe('fail');
      expect(health.checks[0].error).toContain('Network error');
    });

    it('should warn on high rate limit usage', async () => {
      mockClient.post
        .mockResolvedValueOnce({
          data: { data: { viewer: { id: 'user-123' } } }
        })
        .mockResolvedValueOnce({
          data: { data: { rateLimitStatus: { remaining: 100, limit: 6000, reset: Date.now() + 3600 } } }
        })
        .mockResolvedValueOnce({
          data: { data: { viewer: { id: 'user-123', name: 'Test User' } } }
        });

      const health = await connector.healthCheck();

      expect(health.checks[1].status).toBe('warn');
      expect(health.checks[1].error).toContain('% of rate limit used');
    });
  });

  describe('sync', () => {
    beforeEach(async () => {
      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'bearer' as const,
          token: 'lin_api_test123'
        }
      };

      mockClient.post.mockResolvedValueOnce({
        data: {
          data: {
            viewer: {
              id: 'user-123',
              name: 'Test User',
              email: 'test@example.com'
            }
          }
        }
      });

      await connector.authenticate(config);
    });

    it('should sync issues', async () => {
      const mockIssue = {
        id: 'issue-1',
        identifier: 'ENG-123',
        title: 'Test Issue',
        description: 'Test description',
        priority: 2,
        priorityLabel: 'High',
        state: { id: 'state-1', name: 'In Progress', type: 'started' },
        team: { id: 'team-1', name: 'Engineering', key: 'ENG' },
        assignee: { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
        creator: { id: 'user-2', name: 'Jane Doe', email: 'jane@example.com' },
        labels: { nodes: [{ id: 'label-1', name: 'bug', color: '#ff0000' }] },
        project: null,
        cycle: null,
        estimate: 3,
        url: 'https://linear.app/team/issue/ENG-123',
        branchName: 'eng-123-test-issue',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        completedAt: null,
        canceledAt: null,
        archivedAt: null,
        dueDate: null,
        startedAt: '2024-01-01T12:00:00Z',
        parent: null,
        children: { nodes: [] },
        comments: { nodes: [] },
        attachments: { nodes: [] }
      };

      mockClient.post.mockResolvedValueOnce({
        data: {
          data: {
            issues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [mockIssue]
            }
          }
        }
      });

      const options: SyncOptions = {
        recordTypes: ['issue'],
        teams: ['ENG']
      };

      const records = [];
      for await (const record of connector.sync(options)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('issue');
      expect(records[0].id).toBe('linear:issue:ENG-123');
      expect(records[0].data.title).toBe('Test Issue');
      expect(records[0].data.identifier).toBe('ENG-123');
    });

    it('should sync projects', async () => {
      const mockProject = {
        id: 'project-1',
        name: 'Test Project',
        description: 'Test description',
        slugId: 'test-project',
        state: 'started',
        lead: { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
        teams: { nodes: [{ id: 'team-1', name: 'Engineering', key: 'ENG' }] },
        targetDate: '2024-12-31',
        startDate: '2024-01-01',
        url: 'https://linear.app/team/project/test-project',
        progress: 0.5,
        issues: { nodes: [{ id: 'issue-1' }, { id: 'issue-2' }] },
        completedAt: null,
        canceledAt: null,
        archivedAt: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z'
      };

      mockClient.post.mockResolvedValueOnce({
        data: {
          data: {
            projects: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [mockProject]
            }
          }
        }
      });

      const options: SyncOptions = {
        recordTypes: ['project']
      };

      const records = [];
      for await (const record of connector.sync(options)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('project');
      expect(records[0].id).toBe('linear:project:test-project');
      expect(records[0].data.name).toBe('Test Project');
    });

    it('should sync teams', async () => {
      const mockTeam = {
        id: 'team-1',
        name: 'Engineering',
        key: 'ENG',
        description: 'Engineering team',
        private: false,
        issues: { nodes: [{ id: 'issue-1' }, { id: 'issue-2' }] },
        cyclesEnabled: true,
        triageEnabled: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        archivedAt: null
      };

      mockClient.post.mockResolvedValueOnce({
        data: {
          data: {
            teams: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [mockTeam]
            }
          }
        }
      });

      const options: SyncOptions = {
        recordTypes: ['team']
      };

      const records = [];
      for await (const record of connector.sync(options)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('team');
      expect(records[0].id).toBe('linear:team:ENG');
      expect(records[0].data.name).toBe('Engineering');
    });

    it('should handle pagination', async () => {
      mockClient.post
        .mockResolvedValueOnce({
          data: {
            data: {
              issues: {
                pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
                nodes: [
                  {
                    id: 'issue-1',
                    identifier: 'ENG-1',
                    title: 'Issue 1',
                    description: null,
                    priority: 0,
                    priorityLabel: 'None',
                    state: { id: 's1', name: 'Backlog', type: 'backlog' },
                    team: { id: 't1', name: 'Engineering', key: 'ENG' },
                    assignee: null,
                    creator: { id: 'u1', name: 'User', email: 'user@example.com' },
                    labels: { nodes: [] },
                    project: null,
                    cycle: null,
                    estimate: null,
                    url: 'https://linear.app/team/issue/ENG-1',
                    branchName: 'eng-1',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z',
                    completedAt: null,
                    canceledAt: null,
                    archivedAt: null,
                    dueDate: null,
                    startedAt: null,
                    parent: null,
                    children: { nodes: [] },
                    comments: { nodes: [] },
                    attachments: { nodes: [] }
                  }
                ]
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            data: {
              issues: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    id: 'issue-2',
                    identifier: 'ENG-2',
                    title: 'Issue 2',
                    description: null,
                    priority: 0,
                    priorityLabel: 'None',
                    state: { id: 's1', name: 'Backlog', type: 'backlog' },
                    team: { id: 't1', name: 'Engineering', key: 'ENG' },
                    assignee: null,
                    creator: { id: 'u1', name: 'User', email: 'user@example.com' },
                    labels: { nodes: [] },
                    project: null,
                    cycle: null,
                    estimate: null,
                    url: 'https://linear.app/team/issue/ENG-2',
                    branchName: 'eng-2',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z',
                    completedAt: null,
                    canceledAt: null,
                    archivedAt: null,
                    dueDate: null,
                    startedAt: null,
                    parent: null,
                    children: { nodes: [] },
                    comments: { nodes: [] },
                    attachments: { nodes: [] }
                  }
                ]
              }
            }
          }
        });

      const options: SyncOptions = {
        recordTypes: ['issue']
      };

      const records = [];
      for await (const record of connector.sync(options)) {
        records.push(record);
      }

      expect(records).toHaveLength(2);
      expect(records[0].data.identifier).toBe('ENG-1');
      expect(records[1].data.identifier).toBe('ENG-2');
    });

    it('should respect limit option', async () => {
      mockClient.post.mockResolvedValueOnce({
        data: {
          data: {
            issues: {
              pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
              nodes: Array(50).fill(null).map((_, i) => ({
                id: `issue-${i}`,
                identifier: `ENG-${i}`,
                title: `Issue ${i}`,
                description: null,
                priority: 0,
                priorityLabel: 'None',
                state: { id: 's1', name: 'Backlog', type: 'backlog' },
                team: { id: 't1', name: 'Engineering', key: 'ENG' },
                assignee: null,
                creator: { id: 'u1', name: 'User', email: 'user@example.com' },
                labels: { nodes: [] },
                project: null,
                cycle: null,
                estimate: null,
                url: `https://linear.app/team/issue/ENG-${i}`,
                branchName: `eng-${i}`,
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                completedAt: null,
                canceledAt: null,
                archivedAt: null,
                dueDate: null,
                startedAt: null,
                parent: null,
                children: { nodes: [] },
                comments: { nodes: [] },
                attachments: { nodes: [] }
              }))
            }
          }
        }
      });

      const options: SyncOptions = {
        recordTypes: ['issue'],
        limit: 10
      };

      const records = [];
      for await (const record of connector.sync(options)) {
        records.push(record);
      }

      expect(records).toHaveLength(10);
    });
  });

  describe('processWebhook', () => {
    it('should process Issue webhook', async () => {
      const event: WebhookEvent = {
        id: 'webhook-1',
        type: 'Issue',
        payload: {
          action: 'create',
          type: 'Issue',
          data: {
            id: 'issue-1',
            identifier: 'ENG-123',
            title: 'New Issue'
          },
          createdAt: '2024-01-01T00:00:00Z',
          url: 'https://linear.app/team/issue/ENG-123',
          webhookId: 'webhook-1',
          organizationId: 'org-1'
        },
        timestamp: '2024-01-01T00:00:00Z'
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.metadata?.eventType).toBe('Issue');
      expect(result.metadata?.action).toBe('create');
    });

    it('should process Project webhook', async () => {
      const event: WebhookEvent = {
        id: 'webhook-2',
        type: 'Project',
        payload: {
          action: 'update',
          type: 'Project',
          data: {
            id: 'project-1',
            name: 'Updated Project'
          },
          createdAt: '2024-01-01T00:00:00Z',
          url: 'https://linear.app/team/project/updated-project',
          webhookId: 'webhook-2',
          organizationId: 'org-1'
        },
        timestamp: '2024-01-01T00:00:00Z'
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.metadata?.eventType).toBe('Project');
    });
  });

  describe('Linear-specific methods', () => {
    beforeEach(async () => {
      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'bearer' as const,
          token: 'lin_api_test123'
        }
      };

      mockClient.post.mockResolvedValueOnce({
        data: {
          data: {
            viewer: {
              id: 'user-123',
              name: 'Test User',
              email: 'test@example.com'
            }
          }
        }
      });

      await connector.authenticate(config);
    });

    it('should get issue by ID', async () => {
      mockClient.post.mockResolvedValueOnce({
        data: {
          data: {
            issue: {
              id: 'issue-1',
              identifier: 'ENG-123',
              title: 'Test Issue',
              description: 'Test description',
              priority: 2,
              priorityLabel: 'High',
              state: { id: 'state-1', name: 'In Progress', type: 'started' },
              team: { id: 'team-1', name: 'Engineering', key: 'ENG' },
              assignee: { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
              creator: { id: 'user-2', name: 'Jane Doe', email: 'jane@example.com' },
              labels: { nodes: [] },
              project: null,
              cycle: null,
              estimate: 3,
              url: 'https://linear.app/team/issue/ENG-123',
              branchName: 'eng-123-test-issue',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-02T00:00:00Z',
              completedAt: null,
              canceledAt: null,
              archivedAt: null,
              dueDate: null,
              startedAt: '2024-01-01T12:00:00Z',
              parent: null,
              children: { nodes: [] },
              comments: { nodes: [] },
              attachments: { nodes: [] }
            }
          }
        }
      });

      const issue = await connector.getIssue('issue-1');

      expect(issue.id).toBe('issue-1');
      expect(issue.identifier).toBe('ENG-123');
      expect(issue.title).toBe('Test Issue');
    });

    it('should create issue', async () => {
      mockClient.post.mockResolvedValueOnce({
        data: {
          data: {
            issueCreate: {
              success: true,
              issue: { id: 'new-issue-1' }
            }
          }
        }
      });

      const issueId = await connector.createIssue({
        teamId: 'team-1',
        title: 'New Issue',
        description: 'New description',
        priority: 2
      });

      expect(issueId).toBe('new-issue-1');
    });

    it('should update issue', async () => {
      mockClient.post.mockResolvedValueOnce({
        data: {
          data: {
            issueUpdate: {
              success: true
            }
          }
        }
      });

      await expect(connector.updateIssue('issue-1', {
        title: 'Updated Title',
        priority: 3
      })).resolves.toBeUndefined();
    });

    it('should add comment to issue', async () => {
      mockClient.post.mockResolvedValueOnce({
        data: {
          data: {
            commentCreate: {
              success: true,
              comment: { id: 'comment-1' }
            }
          }
        }
      });

      const commentId = await connector.addComment('issue-1', 'Test comment');

      expect(commentId).toBe('comment-1');
    });
  });
});
