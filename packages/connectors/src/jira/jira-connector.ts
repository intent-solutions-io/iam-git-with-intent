import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import type { IConnector } from '../interfaces/IConnector.js';
import type {
  ConnectorConfig,
  AuthResult,
  HealthStatus,
  SyncOptions,
  ConnectorRecord,
  WebhookEvent,
  WebhookResult,
  ConnectorMetadata
} from '../interfaces/types.js';
import { BaseConnector, type ILogger, type IMetrics } from '../core/base-connector.js';
import { AuthenticationError, ConnectorError, ValidationError } from '../errors/index.js';
import {
  type JiraConnectorConfig,
  type JiraSyncOptions,
  type JiraIssue,
  type JiraProject,
  type JiraSprint,
  type JiraBoard,
  type JiraComment,
  type JiraTransition,
  type JiraWebhookPayload,
  JiraConnectorConfigSchema,
  JiraSyncOptionsSchema,
  JIRA_CONNECTOR_METADATA
} from './types.js';

/**
 * Jira Cloud Connector
 *
 * Full-featured connector for Jira Cloud with:
 * - API token/OAuth authentication
 * - REST API v3 client
 * - Issue, project, sprint, and board sync
 * - Webhook processing
 * - JQL query support
 * - Pagination support
 * - Rate limiting awareness
 *
 * @module @gwi/connectors/jira
 */
export class JiraConnector extends BaseConnector implements IConnector {
  readonly name = 'jira';
  readonly version = '1.0.0';
  // Cast to any because Jira has custom auth types (api_token) beyond base framework
  readonly configSchema = JiraConnectorConfigSchema as any;

  private client: AxiosInstance | null = null;
  private config: JiraConnectorConfig | null = null;
  private baseUrl: string = '';

  constructor(logger?: ILogger, metrics?: IMetrics) {
    super(logger, metrics);
  }

  // ============================================================================
  // IConnector Implementation
  // ============================================================================

  /**
   * Authenticate with Jira Cloud API
   *
   * Supports:
   * - API Token (email + API token)
   * - OAuth 2.0 (3LO)
   * - Basic Auth (email + password - not recommended)
   */
  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    try {
      // Validate configuration
      const jiraConfig = JiraConnectorConfigSchema.parse(config) as JiraConnectorConfig;
      this.config = jiraConfig;
      this.baseUrl = `https://${jiraConfig.domain}.atlassian.net/rest/api/3`;

      // Build authentication header
      let authHeader: string;

      switch (jiraConfig.auth.type) {
        case 'basic':
          // Basic auth: base64(email:password)
          authHeader = `Basic ${Buffer.from(
            `${jiraConfig.auth.email}:${jiraConfig.auth.password}`
          ).toString('base64')}`;
          break;

        case 'api_token':
          // API token auth: base64(email:apiToken)
          authHeader = `Basic ${Buffer.from(
            `${jiraConfig.auth.email}:${jiraConfig.auth.apiToken}`
          ).toString('base64')}`;
          break;

        case 'oauth2':
          if (!jiraConfig.auth.accessToken) {
            throw new AuthenticationError('OAuth requires accessToken', this.name);
          }
          authHeader = `Bearer ${jiraConfig.auth.accessToken}`;
          break;

        default:
          throw new AuthenticationError(`Unknown auth type`, this.name);
      }

      // Create axios client
      this.client = axios.create({
        baseURL: this.baseUrl,
        timeout: jiraConfig.timeout ?? 30000,
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...jiraConfig.headers
        }
      });

      // Verify authentication by fetching current user
      const { data: currentUser } = await this.client.get('/myself');

      this.logger.info('Jira authentication successful', {
        tenantId: jiraConfig.tenantId,
        accountId: currentUser.accountId,
        displayName: currentUser.displayName,
        authType: jiraConfig.auth.type
      });

      return {
        success: true,
        token: jiraConfig.auth.type === 'api_token' ? jiraConfig.auth.apiToken : undefined,
        metadata: {
          accountId: currentUser.accountId,
          displayName: currentUser.displayName,
          emailAddress: currentUser.emailAddress,
          authType: jiraConfig.auth.type
        }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(
          `Invalid Jira configuration: ${error.message}`,
          this.name,
          error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        );
      }

      if (error instanceof AuthenticationError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new AuthenticationError(`Jira authentication failed: ${message}`, this.name);
    }
  }

  /**
   * Check Jira API health
   */
  async healthCheck(): Promise<HealthStatus> {
    const checks: Array<{
      name: string;
      status: 'pass' | 'fail' | 'warn';
      durationMs: number;
      error?: string;
    }> = [];

    // Check 1: API connectivity
    const apiStart = Date.now();
    try {
      if (!this.client) {
        throw new Error('Not authenticated');
      }
      await this.client.get('/myself');
      checks.push({
        name: 'api_connectivity',
        status: 'pass',
        durationMs: Date.now() - apiStart
      });
    } catch (error) {
      checks.push({
        name: 'api_connectivity',
        status: 'fail',
        durationMs: Date.now() - apiStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Check 2: Server info
    const serverStart = Date.now();
    try {
      if (this.client) {
        await this.client.get('/serverInfo');
        checks.push({
          name: 'server_info',
          status: 'pass',
          durationMs: Date.now() - serverStart
        });
      }
    } catch (error) {
      checks.push({
        name: 'server_info',
        status: 'fail',
        durationMs: Date.now() - serverStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Check 3: Authentication validity
    const authStart = Date.now();
    try {
      if (this.client) {
        await this.client.get('/myself');
        checks.push({
          name: 'authentication',
          status: 'pass',
          durationMs: Date.now() - authStart
        });
      }
    } catch (error) {
      checks.push({
        name: 'authentication',
        status: 'fail',
        durationMs: Date.now() - authStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const healthy = checks.every(c => c.status !== 'fail');

    return {
      healthy,
      timestamp: new Date().toISOString(),
      connector: this.name,
      checks
    };
  }

  /**
   * Sync data from Jira
   *
   * Supports:
   * - Issues (with JQL filtering)
   * - Projects
   * - Sprints
   * - Boards
   * - Users
   */
  async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
    if (!this.client || !this.config) {
      throw new ConnectorError('Not authenticated. Call authenticate() first.', this.name);
    }

    // Parse Jira-specific options
    const jiraOptions = JiraSyncOptionsSchema.parse(options) as JiraSyncOptions;

    await this.onBeforeSync(options);

    let recordsProcessed = 0;
    const errors: Error[] = [];

    try {
      // Default to issue sync if no types specified
      const recordTypes = jiraOptions.recordTypes ?? ['issue'];

      // Sync projects first if requested
      if (recordTypes.includes('project')) {
        for await (const record of this.syncProjects(jiraOptions)) {
          yield record;
          recordsProcessed++;
        }
      }

      // Sync issues
      if (recordTypes.includes('issue')) {
        for await (const record of this.syncIssues(jiraOptions)) {
          yield record;
          recordsProcessed++;
        }
      }

      // Sync boards
      if (recordTypes.includes('board')) {
        for await (const record of this.syncBoards(jiraOptions)) {
          yield record;
          recordsProcessed++;
        }
      }

      // Sync sprints
      if (recordTypes.includes('sprint')) {
        for await (const record of this.syncSprints(jiraOptions)) {
          yield record;
          recordsProcessed++;
        }
      }

      await this.onAfterSync({
        cursor: null,
        recordsProcessed,
        errors
      });
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
      await this.onError(errors[0]);
      throw error;
    }
  }

  /**
   * Process incoming Jira webhook
   */
  async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
    const startTime = Date.now();

    try {
      // Parse payload
      const payload = event.payload as JiraWebhookPayload;

      this.logger.info('Processing Jira webhook', {
        eventId: event.id,
        eventType: event.type,
        webhookEvent: payload.webhookEvent,
        issueKey: payload.issue?.key
      });

      // Handle different event types
      let recordsProcessed = 0;

      switch (payload.webhookEvent) {
        case 'jira:issue_created':
        case 'jira:issue_updated':
        case 'jira:issue_deleted':
          if (payload.issue) {
            recordsProcessed = 1;
          }
          break;

        case 'comment_created':
        case 'comment_updated':
        case 'comment_deleted':
          if (payload.comment) {
            recordsProcessed = 1;
          }
          break;

        case 'worklog_created':
        case 'worklog_updated':
        case 'worklog_deleted':
          if (payload.worklog) {
            recordsProcessed = 1;
          }
          break;

        case 'project_created':
        case 'project_updated':
        case 'project_deleted':
        case 'sprint_created':
        case 'sprint_updated':
        case 'sprint_closed':
        case 'sprint_deleted':
        case 'sprint_started':
          recordsProcessed = 1;
          break;

        default:
          this.logger.debug('Unhandled webhook event type', { type: payload.webhookEvent });
      }

      return {
        success: true,
        durationMs: Date.now() - startTime,
        recordsProcessed,
        metadata: {
          webhookEvent: payload.webhookEvent,
          issueKey: payload.issue?.key,
          user: payload.user?.displayName
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error('Webhook processing failed', {
        eventId: event.id,
        error: message
      });

      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: message
      };
    }
  }

  /**
   * Get connector metadata
   */
  getMetadata(): ConnectorMetadata {
    return {
      name: JIRA_CONNECTOR_METADATA.name,
      version: this.version,
      recordTypes: [...JIRA_CONNECTOR_METADATA.recordTypes],
      authMethods: [...JIRA_CONNECTOR_METADATA.authMethods],
      supportsIncremental: JIRA_CONNECTOR_METADATA.supportsIncremental,
      supportsWebhooks: JIRA_CONNECTOR_METADATA.supportsWebhooks,
      rateLimits: { ...JIRA_CONNECTOR_METADATA.rateLimits },
      capabilities: [...JIRA_CONNECTOR_METADATA.capabilities],
      documentationUrl: JIRA_CONNECTOR_METADATA.documentationUrl
    };
  }

  // ============================================================================
  // Jira-Specific Methods
  // ============================================================================

  /**
   * Get issue details
   */
  async getIssue(issueIdOrKey: string, options?: { expand?: string[]; fields?: string[] }): Promise<JiraIssue> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const params: Record<string, string> = {};
    if (options?.expand) {
      params.expand = options.expand.join(',');
    }
    if (options?.fields) {
      params.fields = options.fields.join(',');
    }

    const { data } = await this.retryRequest(() =>
      this.client!.get(`/issue/${issueIdOrKey}`, { params })
    );

    return data as JiraIssue;
  }

  /**
   * Get project details
   */
  async getProject(projectIdOrKey: string): Promise<JiraProject> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.get(`/project/${projectIdOrKey}`)
    );

    return data as JiraProject;
  }

  /**
   * Create a new issue
   */
  async createIssue(issue: {
    projectKey: string;
    summary: string;
    description?: string;
    issuetype: string;
    priority?: string;
    assignee?: string;
    labels?: string[];
    [key: string]: any;
  }): Promise<JiraIssue> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.post('/issue', {
        fields: {
          project: { key: issue.projectKey },
          summary: issue.summary,
          description: issue.description,
          issuetype: { name: issue.issuetype },
          ...(issue.priority && { priority: { name: issue.priority } }),
          ...(issue.assignee && { assignee: { accountId: issue.assignee } }),
          ...(issue.labels && { labels: issue.labels })
        }
      })
    );

    // Fetch full issue details
    return this.getIssue(data.key);
  }

  /**
   * Update an issue
   */
  async updateIssue(
    issueIdOrKey: string,
    update: {
      summary?: string;
      description?: string;
      assignee?: string;
      labels?: string[];
      [key: string]: any;
    }
  ): Promise<void> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    await this.retryRequest(() =>
      this.client!.put(`/issue/${issueIdOrKey}`, {
        fields: update
      })
    );
  }

  /**
   * Add a comment to an issue
   */
  async addComment(issueIdOrKey: string, body: string): Promise<JiraComment> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.post(`/issue/${issueIdOrKey}/comment`, {
        body
      })
    );

    return data as JiraComment;
  }

  /**
   * Get available transitions for an issue
   */
  async getTransitions(issueIdOrKey: string): Promise<JiraTransition[]> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.get(`/issue/${issueIdOrKey}/transitions`)
    );

    return data.transitions as JiraTransition[];
  }

  /**
   * Transition an issue to a new status
   */
  async transition(issueIdOrKey: string, transitionId: string, comment?: string): Promise<void> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    await this.retryRequest(() =>
      this.client!.post(`/issue/${issueIdOrKey}/transitions`, {
        transition: { id: transitionId },
        ...(comment && {
          update: {
            comment: [{ add: { body: comment } }]
          }
        })
      })
    );
  }

  /**
   * Search issues using JQL
   */
  async searchIssues(jql: string, options?: {
    startAt?: number;
    maxResults?: number;
    fields?: string[];
    expand?: string[];
  }): Promise<{ issues: JiraIssue[]; total: number; startAt: number; maxResults: number }> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.post('/search', {
        jql,
        startAt: options?.startAt ?? 0,
        maxResults: options?.maxResults ?? 50,
        fields: options?.fields ?? ['*all'],
        expand: options?.expand ?? []
      })
    );

    return {
      issues: data.issues as JiraIssue[],
      total: data.total,
      startAt: data.startAt,
      maxResults: data.maxResults
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Sync projects from Jira
   */
  private async *syncProjects(options: JiraSyncOptions): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    let startAt = 0;
    const maxResults = 50;
    let hasMore = true;

    while (hasMore) {
      const { data } = await this.retryRequest(() =>
        this.client!.get('/project/search', {
          params: { startAt, maxResults }
        })
      );

      for (const project of data.values) {
        // Filter by project keys if specified
        if (options.projects && !options.projects.includes(project.key)) {
          continue;
        }

        yield {
          id: `jira:project:${project.id}`,
          type: 'project',
          source: this.name,
          createdAt: new Date().toISOString(), // Jira doesn't provide created date in list
          updatedAt: new Date().toISOString(),
          data: project as JiraProject
        };

        // Respect limit if set
        if (options.limit && startAt + data.values.indexOf(project) >= options.limit - 1) {
          return;
        }
      }

      startAt += maxResults;
      hasMore = data.isLast === false;
    }
  }

  /**
   * Sync issues from Jira
   */
  private async *syncIssues(options: JiraSyncOptions): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    // Build JQL query
    let jql = options.jql || 'ORDER BY updated DESC';

    if (options.projects && options.projects.length > 0) {
      const projectFilter = `project IN (${options.projects.join(',')})`;
      jql = options.jql ? `${projectFilter} AND (${options.jql})` : projectFilter;
    }

    if (options.since) {
      const sinceFilter = `updated >= '${options.since}'`;
      jql = jql.includes('ORDER BY')
        ? jql.replace('ORDER BY', `AND ${sinceFilter} ORDER BY`)
        : `${jql} AND ${sinceFilter}`;
    }

    let startAt = 0;
    const maxResults = 50;
    let hasMore = true;

    while (hasMore) {
      const result = await this.searchIssues(jql, {
        startAt,
        maxResults,
        fields: options.fields,
        expand: options.expand
      });

      for (const issue of result.issues) {
        yield {
          id: `jira:issue:${issue.id}`,
          type: 'issue',
          source: this.name,
          createdAt: issue.fields.created,
          updatedAt: issue.fields.updated,
          data: issue
        };

        // Respect limit if set
        if (options.limit && startAt + result.issues.indexOf(issue) >= options.limit - 1) {
          return;
        }
      }

      startAt += maxResults;
      hasMore = startAt < result.total;
    }
  }

  /**
   * Sync boards from Jira
   */
  private async *syncBoards(options: JiraSyncOptions): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    let startAt = 0;
    const maxResults = 50;
    let hasMore = true;

    while (hasMore) {
      const { data } = await this.retryRequest(() =>
        this.client!.get('/board', {
          params: { startAt, maxResults }
        })
      );

      for (const board of data.values) {
        // Filter by project if specified
        if (options.projects && !options.projects.includes(board.location.projectKey)) {
          continue;
        }

        yield {
          id: `jira:board:${board.id}`,
          type: 'board',
          source: this.name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          data: board as JiraBoard
        };

        // Respect limit if set
        if (options.limit && startAt + data.values.indexOf(board) >= options.limit - 1) {
          return;
        }
      }

      startAt += maxResults;
      hasMore = data.isLast === false;
    }
  }

  /**
   * Sync sprints from boards
   */
  private async *syncSprints(options: JiraSyncOptions): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    // First, get all boards
    const boards: JiraBoard[] = [];
    for await (const record of this.syncBoards(options)) {
      boards.push(record.data as JiraBoard);
    }

    // Then, get sprints for each board
    for (const board of boards) {
      let startAt = 0;
      const maxResults = 50;
      let hasMore = true;

      while (hasMore) {
        const { data } = await this.retryRequest(() =>
          this.client!.get(`/board/${board.id}/sprint`, {
            params: { startAt, maxResults }
          })
        );

        for (const sprint of data.values) {
          yield {
            id: `jira:sprint:${sprint.id}`,
            type: 'sprint',
            source: this.name,
            createdAt: sprint.startDate || new Date().toISOString(),
            updatedAt: sprint.completeDate || new Date().toISOString(),
            data: sprint as JiraSprint
          };

          // Respect limit if set
          if (options.limit && startAt + data.values.indexOf(sprint) >= options.limit - 1) {
            return;
          }
        }

        startAt += maxResults;
        hasMore = data.isLast === false;
      }
    }
  }
}
