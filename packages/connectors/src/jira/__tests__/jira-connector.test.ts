import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { JiraConnector } from '../jira-connector.js';
import type { JiraConnectorConfig, JiraIssue, JiraProject } from '../types.js';
import { AuthenticationError, ConnectorError } from '../../errors/index.js';

// Mock axios
vi.mock('axios');

describe('JiraConnector', () => {
  let connector: JiraConnector;
  let mockAxios: {
    get: Mock;
    post: Mock;
    put: Mock;
    delete: Mock;
    create: Mock;
  };

  const mockConfig: JiraConnectorConfig = {
    tenantId: 'test-tenant',
    domain: 'testcompany',
    auth: {
      type: 'api_token',
      email: 'test@example.com',
      apiToken: 'test-token-123'
    }
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create connector
    connector = new JiraConnector();

    // Setup axios mock
    mockAxios = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      create: vi.fn()
    };

    // Mock axios.create to return our mock instance
    (axios.create as Mock).mockReturnValue(mockAxios);
  });

  describe('authenticate', () => {
    it('should authenticate successfully with API token', async () => {
      const mockUser = {
        accountId: 'user-123',
        displayName: 'Test User',
        emailAddress: 'test@example.com'
      };

      mockAxios.get.mockResolvedValueOnce({ data: mockUser });

      const result = await connector.authenticate(mockConfig);

      expect(result.success).toBe(true);
      expect(result.metadata?.accountId).toBe('user-123');
      expect(result.metadata?.displayName).toBe('Test User');
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://testcompany.atlassian.net/rest/api/3',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic'),
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should authenticate successfully with OAuth', async () => {
      const oauthConfig: JiraConnectorConfig = {
        ...mockConfig,
        auth: {
          type: 'oauth2',
          clientId: 'client-123',
          clientSecret: 'secret-123',
          redirectUri: 'https://app.example.com/callback',
          accessToken: 'access-token-123'
        }
      };

      const mockUser = {
        accountId: 'user-456',
        displayName: 'OAuth User',
        emailAddress: 'oauth@example.com'
      };

      mockAxios.get.mockResolvedValueOnce({ data: mockUser });

      const result = await connector.authenticate(oauthConfig);

      expect(result.success).toBe(true);
      expect(result.metadata?.accountId).toBe('user-456');
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer access-token-123'
          })
        })
      );
    });

    it('should throw ValidationError for invalid config', async () => {
      const invalidConfig = {
        tenantId: '',
        domain: 'test',
        auth: { type: 'invalid' }
      };

      await expect(connector.authenticate(invalidConfig as any)).rejects.toThrow();
    });

    it('should throw AuthenticationError on API failure', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Unauthorized'));

      await expect(connector.authenticate(mockConfig)).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError for OAuth without access token', async () => {
      const oauthConfig: JiraConnectorConfig = {
        ...mockConfig,
        auth: {
          type: 'oauth2',
          clientId: 'client-123',
          clientSecret: 'secret-123',
          redirectUri: 'https://app.example.com/callback'
          // Missing accessToken
        }
      };

      await expect(connector.authenticate(oauthConfig)).rejects.toThrow(AuthenticationError);
    });
  });

  describe('healthCheck', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValue({ data: { accountId: 'user-123' } });
      await connector.authenticate(mockConfig);
    });

    it('should return healthy status when all checks pass', async () => {
      mockAxios.get.mockResolvedValue({ data: {} });

      const health = await connector.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.connector).toBe('jira');
      expect(health.checks).toHaveLength(3);
      expect(health.checks.every(c => c.status === 'pass')).toBe(true);
    });

    it('should return unhealthy status when API fails', async () => {
      mockAxios.get.mockRejectedValue(new Error('API Error'));

      const health = await connector.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.checks.some(c => c.status === 'fail')).toBe(true);
    });

    it('should fail if not authenticated', async () => {
      const unauthConnector = new JiraConnector();
      const health = await unauthConnector.healthCheck();

      expect(health.healthy).toBe(false);
    });
  });

  describe('getIssue', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { accountId: 'user-123' } });
      await connector.authenticate(mockConfig);
    });

    it('should fetch issue by key', async () => {
      const mockIssue: JiraIssue = {
        id: '10001',
        key: 'PROJ-123',
        self: 'https://testcompany.atlassian.net/rest/api/3/issue/10001',
        fields: {
          summary: 'Test issue',
          description: 'Description',
          status: {
            id: '1',
            name: 'Open',
            statusCategory: { id: 2, key: 'new', name: 'To Do' }
          },
          issuetype: {
            id: '1',
            name: 'Bug',
            subtask: false,
            iconUrl: 'https://example.com/icon.png'
          },
          project: {
            id: '10000',
            key: 'PROJ',
            name: 'Test Project',
            self: 'https://testcompany.atlassian.net/rest/api/3/project/10000'
          },
          priority: {
            id: '2',
            name: 'High',
            iconUrl: 'https://example.com/priority.png'
          },
          assignee: {
            accountId: 'user-123',
            displayName: 'Test User',
            active: true
          },
          reporter: {
            accountId: 'user-456',
            displayName: 'Reporter',
            active: true
          },
          creator: {
            accountId: 'user-456',
            displayName: 'Creator',
            active: true
          },
          labels: ['bug', 'critical'],
          components: [],
          versions: [],
          fixVersions: [],
          resolution: null,
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-02T00:00:00Z',
          resolutiondate: null,
          duedate: null,
          subtasks: []
        }
      };

      mockAxios.get.mockResolvedValueOnce({ data: mockIssue });

      const issue = await connector.getIssue('PROJ-123');

      expect(issue.key).toBe('PROJ-123');
      expect(issue.fields.summary).toBe('Test issue');
      expect(mockAxios.get).toHaveBeenCalledWith('/issue/PROJ-123', { params: {} });
    });

    it('should fetch issue with expand and fields options', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: {} });

      await connector.getIssue('PROJ-123', {
        expand: ['changelog', 'renderedFields'],
        fields: ['summary', 'status']
      });

      expect(mockAxios.get).toHaveBeenCalledWith('/issue/PROJ-123', {
        params: {
          expand: 'changelog,renderedFields',
          fields: 'summary,status'
        }
      });
    });

    it('should throw ConnectorError if not authenticated', async () => {
      const unauthConnector = new JiraConnector();

      await expect(unauthConnector.getIssue('PROJ-123')).rejects.toThrow(ConnectorError);
    });
  });

  describe('getProject', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { accountId: 'user-123' } });
      await connector.authenticate(mockConfig);
    });

    it('should fetch project by key', async () => {
      const mockProject: JiraProject = {
        id: '10000',
        key: 'PROJ',
        name: 'Test Project',
        description: 'A test project',
        lead: {
          accountId: 'user-123',
          displayName: 'Project Lead'
        },
        projectTypeKey: 'software',
        simplified: false,
        style: 'classic',
        isPrivate: false,
        properties: {},
        self: 'https://testcompany.atlassian.net/rest/api/3/project/10000',
        url: 'https://testcompany.atlassian.net/projects/PROJ'
      };

      mockAxios.get.mockResolvedValueOnce({ data: mockProject });

      const project = await connector.getProject('PROJ');

      expect(project.key).toBe('PROJ');
      expect(project.name).toBe('Test Project');
      expect(mockAxios.get).toHaveBeenCalledWith('/project/PROJ');
    });
  });

  describe('createIssue', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { accountId: 'user-123' } });
      await connector.authenticate(mockConfig);
    });

    it('should create a new issue', async () => {
      const createResponse = { key: 'PROJ-456', id: '10002' };
      const mockIssue = {
        id: '10002',
        key: 'PROJ-456',
        fields: { summary: 'New Issue' }
      };

      mockAxios.post.mockResolvedValueOnce({ data: createResponse });
      mockAxios.get.mockResolvedValueOnce({ data: mockIssue });

      const issue = await connector.createIssue({
        projectKey: 'PROJ',
        summary: 'New Issue',
        description: 'Issue description',
        issuetype: 'Bug',
        priority: 'High',
        labels: ['backend']
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/issue', {
        fields: expect.objectContaining({
          project: { key: 'PROJ' },
          summary: 'New Issue',
          description: 'Issue description',
          issuetype: { name: 'Bug' },
          priority: { name: 'High' },
          labels: ['backend']
        })
      });
      expect(issue.key).toBe('PROJ-456');
    });
  });

  describe('updateIssue', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { accountId: 'user-123' } });
      await connector.authenticate(mockConfig);
    });

    it('should update an issue', async () => {
      mockAxios.put.mockResolvedValueOnce({ data: {} });

      await connector.updateIssue('PROJ-123', {
        summary: 'Updated summary',
        assignee: 'user-456'
      });

      expect(mockAxios.put).toHaveBeenCalledWith('/issue/PROJ-123', {
        fields: {
          summary: 'Updated summary',
          assignee: 'user-456'
        }
      });
    });
  });

  describe('addComment', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { accountId: 'user-123' } });
      await connector.authenticate(mockConfig);
    });

    it('should add a comment to an issue', async () => {
      const mockComment = {
        id: '100',
        body: 'Test comment',
        author: { accountId: 'user-123', displayName: 'Test User' },
        created: '2024-01-01T00:00:00Z'
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockComment });

      const comment = await connector.addComment('PROJ-123', 'Test comment');

      expect(comment.body).toBe('Test comment');
      expect(mockAxios.post).toHaveBeenCalledWith('/issue/PROJ-123/comment', {
        body: 'Test comment'
      });
    });
  });

  describe('transition', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { accountId: 'user-123' } });
      await connector.authenticate(mockConfig);
    });

    it('should transition an issue', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: {} });

      await connector.transition('PROJ-123', '31', 'Moving to Done');

      expect(mockAxios.post).toHaveBeenCalledWith('/issue/PROJ-123/transitions', {
        transition: { id: '31' },
        update: {
          comment: [{ add: { body: 'Moving to Done' } }]
        }
      });
    });

    it('should transition without comment', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: {} });

      await connector.transition('PROJ-123', '31');

      expect(mockAxios.post).toHaveBeenCalledWith('/issue/PROJ-123/transitions', {
        transition: { id: '31' }
      });
    });
  });

  describe('searchIssues', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { accountId: 'user-123' } });
      await connector.authenticate(mockConfig);
    });

    it('should search issues with JQL', async () => {
      const mockResponse = {
        issues: [
          { id: '1', key: 'PROJ-1', fields: { summary: 'Issue 1' } },
          { id: '2', key: 'PROJ-2', fields: { summary: 'Issue 2' } }
        ],
        total: 2,
        startAt: 0,
        maxResults: 50
      };

      mockAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await connector.searchIssues('project = PROJ', {
        maxResults: 10,
        fields: ['summary', 'status']
      });

      expect(result.issues).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockAxios.post).toHaveBeenCalledWith('/search', {
        jql: 'project = PROJ',
        startAt: 0,
        maxResults: 10,
        fields: ['summary', 'status'],
        expand: []
      });
    });
  });

  describe('sync', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { accountId: 'user-123' } });
      await connector.authenticate(mockConfig);
    });

    it('should sync issues', async () => {
      const mockSearchResponse = {
        issues: [
          {
            id: '10001',
            key: 'PROJ-1',
            fields: {
              summary: 'Issue 1',
              created: '2024-01-01T00:00:00Z',
              updated: '2024-01-02T00:00:00Z'
            }
          }
        ],
        total: 1,
        startAt: 0,
        maxResults: 50
      };

      mockAxios.post.mockResolvedValue({ data: mockSearchResponse });

      const records = [];
      for await (const record of connector.sync({
        projects: ['PROJ'],
        recordTypes: ['issue']
      })) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('issue');
      expect(records[0].id).toBe('jira:issue:10001');
    });

    it('should sync projects', async () => {
      const mockProjectsResponse = {
        values: [
          {
            id: '10000',
            key: 'PROJ',
            name: 'Test Project'
          }
        ],
        isLast: true
      };

      mockAxios.get.mockResolvedValue({ data: mockProjectsResponse });

      const records = [];
      for await (const record of connector.sync({
        recordTypes: ['project']
      })) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('project');
      expect(records[0].id).toBe('jira:project:10000');
    });

    it('should throw ConnectorError if not authenticated', async () => {
      const unauthConnector = new JiraConnector();

      await expect(async () => {
        for await (const _ of unauthConnector.sync({})) {
          // Should throw before yielding
        }
      }).rejects.toThrow(ConnectorError);
    });
  });

  describe('processWebhook', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { accountId: 'user-123' } });
      await connector.authenticate(mockConfig);
    });

    it('should process issue_created webhook', async () => {
      const webhookEvent = {
        id: 'webhook-123',
        type: 'jira:issue_created',
        timestamp: '2024-01-01T00:00:00Z',
        payload: {
          webhookEvent: 'jira:issue_created' as const,
          timestamp: Date.now(),
          user: {
            accountId: 'user-123',
            displayName: 'Test User'
          },
          issue: {
            id: '10001',
            key: 'PROJ-123'
          }
        }
      };

      const result = await connector.processWebhook(webhookEvent);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.metadata?.webhookEvent).toBe('jira:issue_created');
      expect(result.metadata?.issueKey).toBe('PROJ-123');
    });

    it('should process comment_created webhook', async () => {
      const webhookEvent = {
        id: 'webhook-456',
        type: 'comment_created',
        timestamp: '2024-01-01T00:00:00Z',
        payload: {
          webhookEvent: 'comment_created' as const,
          timestamp: Date.now(),
          user: {
            accountId: 'user-123',
            displayName: 'Test User'
          },
          comment: {
            id: '100',
            body: 'New comment'
          }
        }
      };

      const result = await connector.processWebhook(webhookEvent);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
    });
  });

  describe('getMetadata', () => {
    it('should return connector metadata', () => {
      const metadata = connector.getMetadata();

      expect(metadata.name).toBe('jira');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.recordTypes).toContain('issue');
      expect(metadata.recordTypes).toContain('project');
      expect(metadata.authMethods).toContain('bearer');
      expect(metadata.authMethods).toContain('oauth2');
      expect(metadata.supportsIncremental).toBe(true);
      expect(metadata.supportsWebhooks).toBe(true);
    });
  });
});
