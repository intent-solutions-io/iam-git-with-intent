import axios, { AxiosInstance } from 'axios';
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
  type LinearConnectorConfig,
  type LinearSyncOptions,
  type LinearIssue,
  type LinearProject,
  type LinearTeam,
  type LinearWebhookPayload,
  LinearConnectorConfigSchema,
  LinearSyncOptionsSchema,
  LINEAR_CONNECTOR_METADATA,
  LINEAR_FRAGMENTS
} from './types.js';

/**
 * Linear Connector - GraphQL API Implementation
 *
 * Full-featured connector for Linear with:
 * - API Key/OAuth authentication
 * - GraphQL API client
 * - Issue and project sync
 * - Webhook processing
 * - Cursor-based pagination
 * - Rate limiting awareness
 *
 * @module @gwi/connectors/linear
 */
export class LinearConnector extends BaseConnector implements IConnector {
  readonly name = 'linear';
  readonly version = '1.0.0';
  readonly configSchema = LinearConnectorConfigSchema as any;

  private client: AxiosInstance | null = null;
  private config: LinearConnectorConfig | null = null;
  private authToken: string | null = null;

  constructor(logger?: ILogger, metrics?: IMetrics) {
    super(logger, metrics);
  }

  // ============================================================================
  // IConnector Implementation
  // ============================================================================

  /**
   * Authenticate with Linear API
   *
   * Supports:
   * - Personal API Key
   * - OAuth 2.0
   */
  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    try {
      // Validate configuration
      const linearConfig = LinearConnectorConfigSchema.parse(config) as LinearConnectorConfig;
      this.config = linearConfig;

      // Extract auth token based on type
      switch (linearConfig.auth.type) {
        case 'bearer':
          this.authToken = linearConfig.auth.token;
          break;

        case 'oauth2':
          if (!linearConfig.auth.accessToken) {
            throw new AuthenticationError('OAuth requires accessToken', this.name);
          }
          this.authToken = linearConfig.auth.accessToken;
          break;

        default:
          throw new AuthenticationError('Unknown auth type', this.name);
      }

      // Create axios client
      const baseUrl = linearConfig.baseUrl ?? 'https://api.linear.app/graphql';
      this.client = axios.create({
        baseURL: baseUrl,
        timeout: linearConfig.timeout ?? 30000,
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json',
          ...linearConfig.headers
        }
      });

      // Verify authentication by fetching viewer (authenticated user)
      const viewerQuery = `
        query {
          viewer {
            id
            name
            email
          }
        }
      `;

      const response = await this.graphql<{ viewer: { id: string; name: string; email: string } }>(
        viewerQuery
      );

      this.logger.info('Linear authentication successful', {
        tenantId: linearConfig.tenantId,
        userId: response.viewer.id,
        userName: response.viewer.name,
        authType: linearConfig.auth.type
      });

      return {
        success: true,
        token: this.authToken,
        metadata: {
          userId: response.viewer.id,
          userName: response.viewer.name,
          email: response.viewer.email,
          authType: linearConfig.auth.type
        }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(
          `Invalid Linear configuration: ${error.message}`,
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
      throw new AuthenticationError(`Linear authentication failed: ${message}`, this.name);
    }
  }

  /**
   * Check Linear API health
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

      const query = `
        query {
          viewer {
            id
          }
        }
      `;

      await this.graphql(query);
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

    // Check 2: Rate limit status
    const rateLimitStart = Date.now();
    try {
      if (this.client) {
        const query = `
          query {
            rateLimitStatus {
              remaining
              limit
              reset
            }
          }
        `;

        const response = await this.graphql<{
          rateLimitStatus?: { remaining: number; limit: number; reset: number }
        }>(query);

        if (response.rateLimitStatus) {
          const { remaining, limit } = response.rateLimitStatus;
          const percentUsed = ((limit - remaining) / limit) * 100;

          checks.push({
            name: 'rate_limit',
            status: percentUsed > 90 ? 'warn' : 'pass',
            durationMs: Date.now() - rateLimitStart,
            error: percentUsed > 90 ? `${percentUsed.toFixed(1)}% of rate limit used` : undefined
          });
        } else {
          // Rate limit info not available (older API version)
          checks.push({
            name: 'rate_limit',
            status: 'pass',
            durationMs: Date.now() - rateLimitStart
          });
        }
      }
    } catch (error) {
      // Rate limit query might not be supported
      checks.push({
        name: 'rate_limit',
        status: 'pass',
        durationMs: Date.now() - rateLimitStart
      });
    }

    // Check 3: Authentication validity
    const authStart = Date.now();
    try {
      if (this.client) {
        const query = `
          query {
            viewer {
              id
              name
            }
          }
        `;

        await this.graphql(query);
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
   * Sync data from Linear
   *
   * Supports:
   * - Issues
   * - Projects
   * - Teams
   * - Cycles
   */
  async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
    if (!this.client || !this.config) {
      throw new ConnectorError('Not authenticated. Call authenticate() first.', this.name);
    }

    // Parse Linear-specific options
    const linearOptions = LinearSyncOptionsSchema.parse(options) as LinearSyncOptions;

    await this.onBeforeSync(options);

    let recordsProcessed = 0;
    const errors: Error[] = [];

    try {
      // Default to issue sync if no types specified
      const recordTypes = linearOptions.recordTypes ?? ['issue'];

      // Sync issues
      if (recordTypes.includes('issue')) {
        yield* this.syncIssues(linearOptions);
        recordsProcessed++;
      }

      // Sync projects
      if (recordTypes.includes('project')) {
        yield* this.syncProjects(linearOptions);
        recordsProcessed++;
      }

      // Sync teams
      if (recordTypes.includes('team')) {
        yield* this.syncTeams(linearOptions);
        recordsProcessed++;
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
   * Process incoming Linear webhook
   */
  async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
    const startTime = Date.now();

    try {
      // Parse payload
      const payload = event.payload as LinearWebhookPayload;

      this.logger.info('Processing Linear webhook', {
        eventId: event.id,
        eventType: event.type,
        action: payload.action,
        webhookId: payload.webhookId
      });

      let recordsProcessed = 0;

      // Handle different event types
      switch (payload.type) {
        case 'Issue':
          recordsProcessed = 1;
          break;

        case 'Project':
          recordsProcessed = 1;
          break;

        case 'Comment':
          recordsProcessed = 1;
          break;

        case 'IssueLabel':
          recordsProcessed = 1;
          break;

        case 'Cycle':
          recordsProcessed = 1;
          break;

        default:
          this.logger.debug('Unhandled webhook event type', { type: payload.type });
      }

      return {
        success: true,
        durationMs: Date.now() - startTime,
        recordsProcessed,
        metadata: {
          eventType: payload.type,
          action: payload.action,
          webhookId: payload.webhookId
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
      name: LINEAR_CONNECTOR_METADATA.name,
      version: this.version,
      recordTypes: [...LINEAR_CONNECTOR_METADATA.recordTypes],
      authMethods: [...LINEAR_CONNECTOR_METADATA.authMethods],
      supportsIncremental: LINEAR_CONNECTOR_METADATA.supportsIncremental,
      supportsWebhooks: LINEAR_CONNECTOR_METADATA.supportsWebhooks,
      rateLimits: { ...LINEAR_CONNECTOR_METADATA.rateLimits },
      capabilities: [...LINEAR_CONNECTOR_METADATA.capabilities],
      documentationUrl: LINEAR_CONNECTOR_METADATA.documentationUrl
    };
  }

  // ============================================================================
  // Linear-Specific Methods
  // ============================================================================

  /**
   * Get issue details
   */
  async getIssue(issueId: string): Promise<LinearIssue> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const query = `
      ${LINEAR_FRAGMENTS.user}
      ${LINEAR_FRAGMENTS.team}
      ${LINEAR_FRAGMENTS.label}
      ${LINEAR_FRAGMENTS.state}
      ${LINEAR_FRAGMENTS.project}
      ${LINEAR_FRAGMENTS.cycle}

      query($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          description
          priority
          priorityLabel
          state { ...StateFragment }
          team { ...TeamFragment }
          assignee { ...UserFragment }
          creator { ...UserFragment }
          labels { nodes { ...LabelFragment } }
          project { ...ProjectFragment }
          cycle { ...CycleFragment }
          estimate
          url
          branchName
          createdAt
          updatedAt
          completedAt
          canceledAt
          archivedAt
          dueDate
          startedAt
          parent { id }
          children { nodes { id } }
          comments { nodes { id } }
          attachments { nodes { id } }
        }
      }
    `;

    const response = await this.graphql<{ issue: any }>(query, { id: issueId });
    return this.mapIssue(response.issue);
  }

  /**
   * Get project details
   */
  async getProject(projectId: string): Promise<LinearProject> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const query = `
      ${LINEAR_FRAGMENTS.user}
      ${LINEAR_FRAGMENTS.team}

      query($id: String!) {
        project(id: $id) {
          id
          name
          description
          slugId
          state
          lead { ...UserFragment }
          teams { nodes { ...TeamFragment } }
          targetDate
          startDate
          url
          progress
          issues { nodes { id } }
          completedAt
          canceledAt
          archivedAt
          createdAt
          updatedAt
        }
      }
    `;

    const response = await this.graphql<{ project: any }>(query, { id: projectId });
    return this.mapProject(response.project);
  }

  /**
   * Create a new issue
   */
  async createIssue(input: {
    teamId: string;
    title: string;
    description?: string;
    priority?: number;
    assigneeId?: string;
    labelIds?: string[];
    projectId?: string;
  }): Promise<string> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const mutation = `
      mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
          }
        }
      }
    `;

    const response = await this.graphql<{
      issueCreate: { success: boolean; issue: { id: string } }
    }>(mutation, { input });

    if (!response.issueCreate.success) {
      throw new ConnectorError('Failed to create issue', this.name);
    }

    return response.issueCreate.issue.id;
  }

  /**
   * Update an existing issue
   */
  async updateIssue(issueId: string, input: {
    title?: string;
    description?: string;
    priority?: number;
    stateId?: string;
    assigneeId?: string;
    labelIds?: string[];
  }): Promise<void> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const mutation = `
      mutation($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
        }
      }
    `;

    const response = await this.graphql<{ issueUpdate: { success: boolean } }>(
      mutation,
      { id: issueId, input }
    );

    if (!response.issueUpdate.success) {
      throw new ConnectorError('Failed to update issue', this.name);
    }
  }

  /**
   * Add a comment to an issue
   */
  async addComment(issueId: string, body: string): Promise<string> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const mutation = `
      mutation($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment {
            id
          }
        }
      }
    `;

    const response = await this.graphql<{
      commentCreate: { success: boolean; comment: { id: string } }
    }>(mutation, { input: { issueId, body } });

    if (!response.commentCreate.success) {
      throw new ConnectorError('Failed to create comment', this.name);
    }

    return response.commentCreate.comment.id;
  }

  // ============================================================================
  // GraphQL Methods
  // ============================================================================

  /**
   * Execute a GraphQL query or mutation
   */
  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    return this.retryRequest(async () => {
      const response = await this.client!.post('', {
        query,
        variables
      });

      if (response.data.errors) {
        const errorMsg = response.data.errors.map((e: any) => e.message).join(', ');
        throw new ConnectorError(`GraphQL error: ${errorMsg}`, this.name);
      }

      return response.data.data as T;
    });
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Sync issues from Linear
   */
  private async *syncIssues(options: LinearSyncOptions): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    const query = `
      ${LINEAR_FRAGMENTS.user}
      ${LINEAR_FRAGMENTS.team}
      ${LINEAR_FRAGMENTS.label}
      ${LINEAR_FRAGMENTS.state}
      ${LINEAR_FRAGMENTS.project}
      ${LINEAR_FRAGMENTS.cycle}

      query($first: Int!, $after: String, $filter: IssueFilter) {
        issues(first: $first, after: $after, filter: $filter) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            identifier
            title
            description
            priority
            priorityLabel
            state { ...StateFragment }
            team { ...TeamFragment }
            assignee { ...UserFragment }
            creator { ...UserFragment }
            labels { nodes { ...LabelFragment } }
            project { ...ProjectFragment }
            cycle { ...CycleFragment }
            estimate
            url
            branchName
            createdAt
            updatedAt
            completedAt
            canceledAt
            archivedAt
            dueDate
            startedAt
            parent { id }
            children { nodes { id } }
            comments { nodes { id } }
            attachments { nodes { id } }
          }
        }
      }
    `;

    // Build filter
    const filter: any = {};
    if (options.teams?.length) {
      filter.team = { key: { in: options.teams } };
    }
    if (options.states?.length) {
      filter.state = { name: { in: options.states } };
    }
    if (options.projectIds?.length) {
      filter.project = { id: { in: options.projectIds } };
    }
    if (options.assigneeIds?.length) {
      filter.assignee = { id: { in: options.assigneeIds } };
    }
    if (options.since) {
      filter.updatedAt = { gte: options.since };
    }

    let hasNextPage = true;
    let cursor: string | null = null;
    let count = 0;

    while (hasNextPage) {
      const response: {
        issues: {
          pageInfo: { hasNextPage: boolean; endCursor: string };
          nodes: any[];
        }
      } = await this.graphql<{
        issues: {
          pageInfo: { hasNextPage: boolean; endCursor: string };
          nodes: any[];
        }
      }>(query, {
        first: 50,
        after: cursor,
        filter: Object.keys(filter).length > 0 ? filter : undefined
      });

      for (const issue of response.issues.nodes) {
        const mappedIssue = this.mapIssue(issue);

        yield {
          id: `linear:issue:${issue.identifier}`,
          type: 'issue',
          source: this.name,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          data: mappedIssue
        };

        count++;
        if (options.limit && count >= options.limit) {
          return;
        }
      }

      hasNextPage = response.issues.pageInfo.hasNextPage;
      cursor = response.issues.pageInfo.endCursor;
    }
  }

  /**
   * Sync projects from Linear
   */
  private async *syncProjects(options: LinearSyncOptions): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    const query = `
      ${LINEAR_FRAGMENTS.user}
      ${LINEAR_FRAGMENTS.team}

      query($first: Int!, $after: String) {
        projects(first: $first, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            name
            description
            slugId
            state
            lead { ...UserFragment }
            teams { nodes { ...TeamFragment } }
            targetDate
            startDate
            url
            progress
            issues { nodes { id } }
            completedAt
            canceledAt
            archivedAt
            createdAt
            updatedAt
          }
        }
      }
    `;

    let hasNextPage = true;
    let cursor: string | null = null;
    let count = 0;

    while (hasNextPage) {
      const response: {
        projects: {
          pageInfo: { hasNextPage: boolean; endCursor: string };
          nodes: any[];
        }
      } = await this.graphql<{
        projects: {
          pageInfo: { hasNextPage: boolean; endCursor: string };
          nodes: any[];
        }
      }>(query, {
        first: 50,
        after: cursor
      });

      for (const project of response.projects.nodes) {
        const mappedProject = this.mapProject(project);

        yield {
          id: `linear:project:${project.slugId}`,
          type: 'project',
          source: this.name,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          data: mappedProject
        };

        count++;
        if (options.limit && count >= options.limit) {
          return;
        }
      }

      hasNextPage = response.projects.pageInfo.hasNextPage;
      cursor = response.projects.pageInfo.endCursor;
    }
  }

  /**
   * Sync teams from Linear
   */
  private async *syncTeams(options: LinearSyncOptions): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    const query = `
      query($first: Int!, $after: String) {
        teams(first: $first, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            name
            key
            description
            private
            issues { nodes { id } }
            cyclesEnabled
            triageEnabled
            createdAt
            updatedAt
            archivedAt
          }
        }
      }
    `;

    let hasNextPage = true;
    let cursor: string | null = null;
    let count = 0;

    while (hasNextPage) {
      const response: {
        teams: {
          pageInfo: { hasNextPage: boolean; endCursor: string };
          nodes: any[];
        }
      } = await this.graphql<{
        teams: {
          pageInfo: { hasNextPage: boolean; endCursor: string };
          nodes: any[];
        }
      }>(query, {
        first: 50,
        after: cursor
      });

      for (const team of response.teams.nodes) {
        const mappedTeam: LinearTeam = {
          id: team.id,
          name: team.name,
          key: team.key,
          description: team.description,
          private: team.private,
          issueCount: team.issues?.nodes?.length ?? 0,
          cyclesEnabled: team.cyclesEnabled,
          triageEnabled: team.triageEnabled,
          createdAt: team.createdAt,
          updatedAt: team.updatedAt,
          archivedAt: team.archivedAt
        };

        yield {
          id: `linear:team:${team.key}`,
          type: 'team',
          source: this.name,
          createdAt: team.createdAt,
          updatedAt: team.updatedAt,
          data: mappedTeam
        };

        count++;
        if (options.limit && count >= options.limit) {
          return;
        }
      }

      hasNextPage = response.teams.pageInfo.hasNextPage;
      cursor = response.teams.pageInfo.endCursor;
    }
  }

  /**
   * Map Linear API issue response to our type
   */
  private mapIssue(issue: any): LinearIssue {
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      priorityLabel: issue.priorityLabel,
      state: {
        id: issue.state.id,
        name: issue.state.name,
        type: issue.state.type
      },
      team: {
        id: issue.team.id,
        name: issue.team.name,
        key: issue.team.key
      },
      assignee: issue.assignee ? {
        id: issue.assignee.id,
        name: issue.assignee.name,
        email: issue.assignee.email
      } : null,
      creator: {
        id: issue.creator.id,
        name: issue.creator.name,
        email: issue.creator.email
      },
      labels: (issue.labels?.nodes ?? []).map((l: any) => ({
        id: l.id,
        name: l.name,
        color: l.color
      })),
      project: issue.project ? {
        id: issue.project.id,
        name: issue.project.name
      } : null,
      cycle: issue.cycle ? {
        id: issue.cycle.id,
        name: issue.cycle.name,
        number: issue.cycle.number
      } : null,
      estimate: issue.estimate,
      url: issue.url,
      branchName: issue.branchName,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      completedAt: issue.completedAt,
      canceledAt: issue.canceledAt,
      archivedAt: issue.archivedAt,
      dueDate: issue.dueDate,
      startedAt: issue.startedAt,
      parentId: issue.parent?.id ?? null,
      subIssueIds: (issue.children?.nodes ?? []).map((c: any) => c.id),
      commentCount: issue.comments?.nodes?.length ?? 0,
      attachmentCount: issue.attachments?.nodes?.length ?? 0
    };
  }

  /**
   * Map Linear API project response to our type
   */
  private mapProject(project: any): LinearProject {
    const issues = project.issues?.nodes ?? [];
    const completedIssues = issues.filter((i: any) => i.completedAt).length;

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      slugId: project.slugId,
      state: project.state,
      lead: project.lead ? {
        id: project.lead.id,
        name: project.lead.name,
        email: project.lead.email
      } : null,
      teams: (project.teams?.nodes ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        key: t.key
      })),
      targetDate: project.targetDate,
      startDate: project.startDate,
      url: project.url,
      progress: project.progress,
      issueCount: issues.length,
      completedIssueCount: completedIssues,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      completedAt: project.completedAt,
      canceledAt: project.canceledAt,
      archivedAt: project.archivedAt
    };
  }
}
