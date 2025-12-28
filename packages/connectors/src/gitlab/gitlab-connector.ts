import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
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
  type GitLabConnectorConfig,
  type GitLabSyncOptions,
  type GitLabMergeRequest,
  type GitLabIssue,
  type GitLabProject,
  type GitLabFileChange,
  type GitLabWebhookPayload,
  GitLabConnectorConfigSchema,
  GitLabSyncOptionsSchema,
  GITLAB_CONNECTOR_METADATA
} from './types.js';

/**
 * GitLab Connector Implementation
 *
 * Full-featured connector for GitLab with:
 * - Token/OAuth authentication
 * - REST API client (axios-based, no official SDK)
 * - Merge request and issue sync
 * - Webhook processing
 * - Pagination support
 * - Rate limiting awareness
 *
 * @module @gwi/connectors/gitlab
 */
export class GitLabConnector extends BaseConnector implements IConnector {
  readonly name = 'gitlab';
  readonly version = '1.0.0';
  readonly configSchema = GitLabConnectorConfigSchema as any;

  private client: AxiosInstance | null = null;
  private config: GitLabConnectorConfig | null = null;

  constructor(logger?: ILogger, metrics?: IMetrics) {
    super(logger, metrics);
  }

  // ============================================================================
  // IConnector Implementation
  // ============================================================================

  /**
   * Authenticate with GitLab API
   *
   * Supports:
   * - Personal Access Token (PAT)
   * - OAuth 2.0
   */
  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    try {
      // Validate configuration
      const glConfig = GitLabConnectorConfigSchema.parse(config) as GitLabConnectorConfig;
      this.config = glConfig;

      // Determine authentication headers based on auth type
      const authHeaders: Record<string, string> = {};

      switch (glConfig.auth.type) {
        case 'bearer':
          // GitLab uses PRIVATE-TOKEN header for PAT
          authHeaders['PRIVATE-TOKEN'] = glConfig.auth.token;
          break;

        case 'oauth2':
          if (!glConfig.auth.accessToken) {
            throw new AuthenticationError('OAuth requires accessToken', this.name);
          }
          // OAuth uses standard Authorization header
          authHeaders['Authorization'] = `Bearer ${glConfig.auth.accessToken}`;
          break;

        default:
          throw new AuthenticationError(`Unknown auth type`, this.name);
      }

      // Create axios instance
      this.client = axios.create({
        baseURL: glConfig.baseUrl || 'https://gitlab.com/api/v4',
        timeout: glConfig.timeout ?? 30000,
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
          ...glConfig.headers
        }
      });

      // Verify authentication by fetching current user
      const { data: user } = await this.client.get('/user');

      this.logger.info('GitLab authentication successful', {
        tenantId: glConfig.tenantId,
        username: user.username,
        authType: glConfig.auth.type
      });

      return {
        success: true,
        token: glConfig.auth.type === 'bearer' ? glConfig.auth.token : undefined,
        metadata: {
          username: user.username,
          id: user.id,
          name: user.name,
          authType: glConfig.auth.type
        }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(
          `Invalid GitLab configuration: ${error.message}`,
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
      throw new AuthenticationError(`GitLab authentication failed: ${message}`, this.name);
    }
  }

  /**
   * Check GitLab API health
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
      await this.client.get('/version');
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

    // Check 2: Authentication validity
    const authStart = Date.now();
    try {
      if (this.client) {
        await this.client.get('/user');
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

    // Check 3: Rate limit status (if available in headers from previous request)
    const rateLimitStart = Date.now();
    try {
      if (this.client) {
        const response = await this.client.get('/projects', { params: { per_page: 1 } });
        const remaining = response.headers['ratelimit-remaining'];
        const limit = response.headers['ratelimit-limit'];

        if (remaining && limit) {
          const percentUsed = ((Number(limit) - Number(remaining)) / Number(limit)) * 100;
          checks.push({
            name: 'rate_limit',
            status: percentUsed > 90 ? 'warn' : 'pass',
            durationMs: Date.now() - rateLimitStart,
            error: percentUsed > 90 ? `${percentUsed.toFixed(1)}% of rate limit used` : undefined
          });
        } else {
          checks.push({
            name: 'rate_limit',
            status: 'pass',
            durationMs: Date.now() - rateLimitStart
          });
        }
      }
    } catch (error) {
      checks.push({
        name: 'rate_limit',
        status: 'fail',
        durationMs: Date.now() - rateLimitStart,
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
   * Sync data from GitLab
   *
   * Supports:
   * - Projects
   * - Merge requests
   * - Issues
   * - Commits
   * - File changes
   */
  async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
    if (!this.client || !this.config) {
      throw new ConnectorError('Not authenticated. Call authenticate() first.', this.name);
    }

    // Parse GitLab-specific options
    const glOptions = GitLabSyncOptionsSchema.parse(options) as GitLabSyncOptions;

    await this.onBeforeSync(options);

    let recordsProcessed = 0;
    const errors: Error[] = [];

    try {
      // Default to merge_request sync if no types specified
      const recordTypes = glOptions.recordTypes ?? ['merge_request'];

      for (const project of glOptions.projects ?? []) {
        // Encode project path for URL
        const encodedProject = encodeURIComponent(project);

        // Sync merge requests
        if (recordTypes.includes('merge_request')) {
          yield* this.syncMergeRequests(encodedProject, glOptions);
          recordsProcessed++;
        }

        // Sync issues
        if (recordTypes.includes('issue')) {
          yield* this.syncIssues(encodedProject, glOptions);
          recordsProcessed++;
        }

        // Sync project details
        if (recordTypes.includes('project')) {
          const projectRecord = await this.getProject(encodedProject);
          yield {
            id: `gitlab:project:${projectRecord.id}`,
            type: 'project',
            source: this.name,
            createdAt: projectRecord.createdAt,
            updatedAt: projectRecord.updatedAt,
            data: projectRecord
          };
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
   * Process incoming GitLab webhook
   */
  async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
    const startTime = Date.now();

    try {
      // Parse payload
      const payload = event.payload as GitLabWebhookPayload;

      this.logger.info('Processing GitLab webhook', {
        eventId: event.id,
        eventType: event.type,
        objectKind: payload.object_kind,
        project: payload.project?.path_with_namespace
      });

      // Handle different event types
      let recordsProcessed = 0;

      switch (payload.object_kind) {
        case 'merge_request':
          if (payload.merge_request || payload.object_attributes) {
            recordsProcessed = 1;
          }
          break;

        case 'push':
          if (payload.commits) {
            recordsProcessed = payload.commits.length;
          }
          break;

        case 'issue':
          if (payload.issue || payload.object_attributes) {
            recordsProcessed = 1;
          }
          break;

        case 'note':
          if (payload.object_attributes) {
            recordsProcessed = 1;
          }
          break;

        case 'pipeline':
        case 'job':
          recordsProcessed = 1;
          break;

        default:
          this.logger.debug('Unhandled webhook event type', { type: payload.object_kind });
      }

      return {
        success: true,
        durationMs: Date.now() - startTime,
        recordsProcessed,
        metadata: {
          eventType: payload.object_kind,
          action: payload.object_attributes?.action,
          project: payload.project?.path_with_namespace
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
      name: GITLAB_CONNECTOR_METADATA.name,
      version: this.version,
      recordTypes: [...GITLAB_CONNECTOR_METADATA.recordTypes],
      authMethods: [...GITLAB_CONNECTOR_METADATA.authMethods],
      supportsIncremental: GITLAB_CONNECTOR_METADATA.supportsIncremental,
      supportsWebhooks: GITLAB_CONNECTOR_METADATA.supportsWebhooks,
      rateLimits: { ...GITLAB_CONNECTOR_METADATA.rateLimits },
      capabilities: [...GITLAB_CONNECTOR_METADATA.capabilities],
      documentationUrl: GITLAB_CONNECTOR_METADATA.documentationUrl
    };
  }

  // ============================================================================
  // GitLab-Specific Methods
  // ============================================================================

  /**
   * Get project details
   */
  async getProject(projectId: string): Promise<GitLabProject> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.get(`/projects/${projectId}`)
    );

    return this.mapProject(data);
  }

  /**
   * Get merge request details
   */
  async getMergeRequest(projectId: string, mrIid: number): Promise<GitLabMergeRequest> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.get(`/projects/${projectId}/merge_requests/${mrIid}`)
    );

    return this.mapMergeRequest(data);
  }

  /**
   * Get merge request changes (file diffs)
   */
  async getMergeRequestChanges(projectId: string, mrIid: number): Promise<GitLabFileChange[]> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.get(`/projects/${projectId}/merge_requests/${mrIid}/changes`)
    );

    return data.changes || [];
  }

  /**
   * Get issue details
   */
  async getIssue(projectId: string, issueIid: number): Promise<GitLabIssue> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.get(`/projects/${projectId}/issues/${issueIid}`)
    );

    return this.mapIssue(data);
  }

  /**
   * Create a comment (note) on an issue or MR
   */
  async createComment(projectId: string, resourceType: 'issues' | 'merge_requests', resourceIid: number, body: string): Promise<number> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.post(`/projects/${projectId}/${resourceType}/${resourceIid}/notes`, {
        body
      })
    );

    return data.id;
  }

  /**
   * Add labels to an issue or MR
   */
  async addLabels(projectId: string, resourceType: 'issues' | 'merge_requests', resourceIid: number, labels: string[]): Promise<void> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    await this.retryRequest(() =>
      this.client!.put(`/projects/${projectId}/${resourceType}/${resourceIid}`, {
        add_labels: labels.join(',')
      })
    );
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Sync merge requests from a project
   */
  private async *syncMergeRequests(
    projectId: string,
    options: GitLabSyncOptions
  ): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    const params: Record<string, any> = {
      per_page: 100,
      order_by: options.orderBy ?? 'updated_at',
      sort: options.sort ?? 'desc'
    };

    if (options.state && options.state !== 'all') {
      params.state = options.state;
    }

    if (options.updatedAfter) {
      params.updated_after = options.updatedAfter;
    }

    if (options.createdAfter) {
      params.created_after = options.createdAfter;
    }

    if (options.scope) {
      params.scope = options.scope;
    }

    if (options.labels && options.labels.length > 0) {
      params.labels = options.labels.join(',');
    }

    // Use pagination to get all MRs
    let page = 1;
    let hasMore = true;
    let count = 0;

    while (hasMore) {
      const response: AxiosResponse = await this.retryRequest(() =>
        this.client!.get(`/projects/${projectId}/merge_requests`, {
          params: { ...params, page }
        })
      );

      const mrs = response.data;

      if (!mrs || mrs.length === 0) {
        break;
      }

      for (const mr of mrs) {
        const mappedMR = this.mapMergeRequest(mr);

        // Get changes if requested
        let changes: GitLabFileChange[] | undefined;
        if (options.includeChanges) {
          changes = await this.getMergeRequestChanges(projectId, mr.iid);
        }

        yield {
          id: `gitlab:mr:${projectId}!${mr.iid}`,
          type: 'merge_request',
          source: this.name,
          createdAt: mr.created_at,
          updatedAt: mr.updated_at,
          data: {
            ...mappedMR,
            changes
          }
        };

        count++;

        // Respect limit if set
        if (options.limit && count >= options.limit) {
          return;
        }
      }

      // Check for more pages using GitLab's pagination headers
      const nextPage = response.headers['x-next-page'];
      if (!nextPage || nextPage === '') {
        hasMore = false;
      } else {
        page = Number(nextPage);
      }
    }
  }

  /**
   * Sync issues from a project
   */
  private async *syncIssues(
    projectId: string,
    options: GitLabSyncOptions
  ): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    const params: Record<string, any> = {
      per_page: 100,
      order_by: options.orderBy ?? 'updated_at',
      sort: options.sort ?? 'desc'
    };

    if (options.state && options.state !== 'all') {
      params.state = options.state === 'merged' ? 'opened' : options.state;
    }

    if (options.updatedAfter) {
      params.updated_after = options.updatedAfter;
    }

    if (options.createdAfter) {
      params.created_after = options.createdAfter;
    }

    if (options.scope) {
      params.scope = options.scope;
    }

    if (options.labels && options.labels.length > 0) {
      params.labels = options.labels.join(',');
    }

    let page = 1;
    let hasMore = true;
    let count = 0;

    while (hasMore) {
      const response: AxiosResponse = await this.retryRequest(() =>
        this.client!.get(`/projects/${projectId}/issues`, {
          params: { ...params, page }
        })
      );

      const issues = response.data;

      if (!issues || issues.length === 0) {
        break;
      }

      for (const issue of issues) {
        yield {
          id: `gitlab:issue:${projectId}#${issue.iid}`,
          type: 'issue',
          source: this.name,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          data: this.mapIssue(issue)
        };

        count++;

        // Respect limit if set
        if (options.limit && count >= options.limit) {
          return;
        }
      }

      // Check for more pages
      const nextPage = response.headers['x-next-page'];
      if (!nextPage || nextPage === '') {
        hasMore = false;
      } else {
        page = Number(nextPage);
      }
    }
  }

  /**
   * Map GitLab API project response to our type
   */
  private mapProject(project: any): GitLabProject {
    return {
      id: project.id,
      name: project.name,
      nameWithNamespace: project.name_with_namespace,
      path: project.path,
      pathWithNamespace: project.path_with_namespace,
      description: project.description,
      visibility: project.visibility,
      archived: project.archived ?? false,
      defaultBranch: project.default_branch,
      emptyRepo: project.empty_repo ?? false,
      namespace: {
        id: project.namespace.id,
        name: project.namespace.name,
        path: project.namespace.path,
        kind: project.namespace.kind
      },
      owner: project.owner ? {
        id: project.owner.id,
        username: project.owner.username,
        name: project.owner.name
      } : null,
      forkedFromProject: project.forked_from_project ? {
        id: project.forked_from_project.id,
        name: project.forked_from_project.name,
        pathWithNamespace: project.forked_from_project.path_with_namespace
      } : null,
      topics: project.topics ?? [],
      lastActivityAt: project.last_activity_at,
      createdAt: project.created_at,
      updatedAt: project.updated_at
    };
  }

  /**
   * Map GitLab API MR response to our type
   */
  private mapMergeRequest(mr: any): GitLabMergeRequest {
    return {
      id: mr.id,
      iid: mr.iid,
      projectId: mr.project_id,
      title: mr.title,
      description: mr.description,
      state: mr.state,
      mergedBy: mr.merged_by ? {
        id: mr.merged_by.id,
        username: mr.merged_by.username,
        name: mr.merged_by.name
      } : null,
      mergedAt: mr.merged_at,
      closedBy: mr.closed_by ? {
        id: mr.closed_by.id,
        username: mr.closed_by.username,
        name: mr.closed_by.name
      } : null,
      closedAt: mr.closed_at,
      targetBranch: mr.target_branch,
      sourceBranch: mr.source_branch,
      author: {
        id: mr.author.id,
        username: mr.author.username,
        name: mr.author.name
      },
      assignees: (mr.assignees ?? []).map((a: any) => ({
        id: a.id,
        username: a.username,
        name: a.name
      })),
      reviewers: (mr.reviewers ?? []).map((r: any) => ({
        id: r.id,
        username: r.username,
        name: r.name
      })),
      labels: mr.labels ?? [],
      milestone: mr.milestone ? {
        id: mr.milestone.id,
        iid: mr.milestone.iid,
        title: mr.milestone.title
      } : null,
      draft: mr.draft ?? false,
      workInProgress: mr.work_in_progress ?? false,
      mergeWhenPipelineSucceeds: mr.merge_when_pipeline_succeeds ?? false,
      mergeStatus: mr.merge_status ?? 'unchecked',
      sha: mr.sha,
      mergeCommitSha: mr.merge_commit_sha,
      squashCommitSha: mr.squash_commit_sha,
      diffRefs: {
        baseSha: mr.diff_refs?.base_sha ?? '',
        headSha: mr.diff_refs?.head_sha ?? '',
        startSha: mr.diff_refs?.start_sha ?? ''
      },
      userNotesCount: mr.user_notes_count ?? 0,
      changesCount: mr.changes_count ?? '0',
      shouldRemoveSourceBranch: mr.should_remove_source_branch,
      forceRemoveSourceBranch: mr.force_remove_source_branch ?? false,
      createdAt: mr.created_at,
      updatedAt: mr.updated_at
    };
  }

  /**
   * Map GitLab API issue response to our type
   */
  private mapIssue(issue: any): GitLabIssue {
    return {
      id: issue.id,
      iid: issue.iid,
      projectId: issue.project_id,
      title: issue.title,
      description: issue.description,
      state: issue.state,
      type: issue.type ?? 'issue',
      author: {
        id: issue.author.id,
        username: issue.author.username,
        name: issue.author.name
      },
      assignees: (issue.assignees ?? []).map((a: any) => ({
        id: a.id,
        username: a.username,
        name: a.name
      })),
      labels: issue.labels ?? [],
      milestone: issue.milestone ? {
        id: issue.milestone.id,
        iid: issue.milestone.iid,
        title: issue.milestone.title
      } : null,
      dueDate: issue.due_date,
      confidential: issue.confidential ?? false,
      discussionLocked: issue.discussion_locked ?? false,
      userNotesCount: issue.user_notes_count ?? 0,
      weight: issue.weight,
      epicIid: issue.epic_iid,
      closedBy: issue.closed_by ? {
        id: issue.closed_by.id,
        username: issue.closed_by.username,
        name: issue.closed_by.name
      } : null,
      closedAt: issue.closed_at,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at
    };
  }
}
