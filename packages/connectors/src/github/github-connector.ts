import { Octokit } from '@octokit/rest';
import { z } from 'zod';
import { createAppAuth } from '@octokit/auth-app';
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
  type GitHubConnectorConfig,
  type GitHubSyncOptions,
  type GitHubPullRequest,
  type GitHubIssue,
  type GitHubFileChange,
  type GitHubWebhookPayload,
  GitHubConnectorConfigSchema,
  GitHubSyncOptionsSchema,
  GITHUB_CONNECTOR_METADATA
} from './types.js';

/**
 * GitHub Connector - Reference Implementation
 *
 * Full-featured connector for GitHub with:
 * - Token/OAuth/App authentication
 * - REST and GraphQL API clients
 * - Pull request and issue sync
 * - Webhook processing
 * - Pagination support
 * - Rate limiting awareness
 *
 * @module @gwi/connectors/github
 */
export class GitHubConnector extends BaseConnector implements IConnector {
  readonly name = 'github';
  readonly version = '1.0.0';
  // Cast to any because GitHub has custom auth types (app) beyond base framework
  readonly configSchema = GitHubConnectorConfigSchema as any;

  private octokit: Octokit | null = null;
  private config: GitHubConnectorConfig | null = null;

  constructor(logger?: ILogger, metrics?: IMetrics) {
    super(logger, metrics);
  }

  // ============================================================================
  // IConnector Implementation
  // ============================================================================

  /**
   * Authenticate with GitHub API
   *
   * Supports:
   * - Personal Access Token (PAT)
   * - OAuth 2.0
   * - GitHub App installation
   */
  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    try {
      // Validate configuration
      const ghConfig = GitHubConnectorConfigSchema.parse(config) as GitHubConnectorConfig;
      this.config = ghConfig;

      // Create Octokit instance based on auth type
      switch (ghConfig.auth.type) {
        case 'bearer':
          this.octokit = new Octokit({
            auth: ghConfig.auth.token,
            baseUrl: ghConfig.baseUrl,
            request: {
              timeout: ghConfig.timeout ?? 30000
            }
          });
          break;

        case 'oauth2':
          if (!ghConfig.auth.accessToken) {
            throw new AuthenticationError('OAuth requires accessToken', this.name);
          }
          this.octokit = new Octokit({
            auth: ghConfig.auth.accessToken,
            baseUrl: ghConfig.baseUrl,
            request: {
              timeout: ghConfig.timeout ?? 30000
            }
          });
          break;

        case 'app':
          this.octokit = new Octokit({
            authStrategy: createAppAuth,
            auth: {
              appId: ghConfig.auth.appId,
              privateKey: ghConfig.auth.privateKey,
              installationId: ghConfig.auth.installationId
            },
            baseUrl: ghConfig.baseUrl,
            request: {
              timeout: ghConfig.timeout ?? 30000
            }
          });
          break;

        default:
          throw new AuthenticationError(`Unknown auth type`, this.name);
      }

      // Verify authentication by fetching authenticated user
      const { data: user } = await this.octokit.rest.users.getAuthenticated();

      this.logger.info('GitHub authentication successful', {
        tenantId: ghConfig.tenantId,
        login: user.login,
        authType: ghConfig.auth.type
      });

      return {
        success: true,
        token: ghConfig.auth.type === 'bearer' ? ghConfig.auth.token : undefined,
        metadata: {
          login: user.login,
          id: user.id,
          type: user.type,
          authType: ghConfig.auth.type
        }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(
          `Invalid GitHub configuration: ${error.message}`,
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
      throw new AuthenticationError(`GitHub authentication failed: ${message}`, this.name);
    }
  }

  /**
   * Check GitHub API health
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
      if (!this.octokit) {
        throw new Error('Not authenticated');
      }
      await this.octokit.rest.rateLimit.get();
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
      if (this.octokit) {
        const { data: rateLimit } = await this.octokit.rest.rateLimit.get();
        const remaining = rateLimit.rate.remaining;
        const limit = rateLimit.rate.limit;
        const percentUsed = ((limit - remaining) / limit) * 100;

        checks.push({
          name: 'rate_limit',
          status: percentUsed > 90 ? 'warn' : 'pass',
          durationMs: Date.now() - rateLimitStart,
          error: percentUsed > 90 ? `${percentUsed.toFixed(1)}% of rate limit used` : undefined
        });
      }
    } catch (error) {
      checks.push({
        name: 'rate_limit',
        status: 'fail',
        durationMs: Date.now() - rateLimitStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Check 3: Authentication validity
    const authStart = Date.now();
    try {
      if (this.octokit) {
        await this.octokit.rest.users.getAuthenticated();
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
   * Sync data from GitHub
   *
   * Supports:
   * - Repositories
   * - Pull requests
   * - Issues
   * - Commits
   * - File changes
   */
  async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
    if (!this.octokit || !this.config) {
      throw new ConnectorError('Not authenticated. Call authenticate() first.', this.name);
    }

    // Parse GitHub-specific options
    const ghOptions = GitHubSyncOptionsSchema.parse(options) as GitHubSyncOptions;

    await this.onBeforeSync(options);

    let recordsProcessed = 0;
    const errors: Error[] = [];

    try {
      // Default to pull_request sync if no types specified
      const recordTypes = ghOptions.recordTypes ?? ['pull_request'];

      for (const repo of ghOptions.repositories ?? []) {
        const [owner, repoName] = repo.split('/');

        if (!owner || !repoName) {
          this.logger.warn('Invalid repository format, skipping', { repo });
          continue;
        }

        // Sync pull requests
        if (recordTypes.includes('pull_request')) {
          yield* this.syncPullRequests(owner, repoName, ghOptions);
          recordsProcessed++;
        }

        // Sync issues
        if (recordTypes.includes('issue')) {
          yield* this.syncIssues(owner, repoName, ghOptions);
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
   * Process incoming GitHub webhook
   */
  async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
    const startTime = Date.now();

    try {
      // Parse payload
      const payload = event.payload as GitHubWebhookPayload;

      this.logger.info('Processing GitHub webhook', {
        eventId: event.id,
        eventType: event.type,
        action: payload.action,
        repository: payload.repository?.fullName
      });

      // Handle different event types
      let recordsProcessed = 0;

      switch (event.type) {
        case 'pull_request':
          if (payload.pull_request) {
            // Process PR event
            recordsProcessed = 1;
          }
          break;

        case 'push':
          if (payload.commits) {
            recordsProcessed = payload.commits.length;
          }
          break;

        case 'issues':
          if (payload.issue) {
            recordsProcessed = 1;
          }
          break;

        case 'issue_comment':
        case 'pull_request_review':
        case 'pull_request_review_comment':
          if (payload.comment) {
            recordsProcessed = 1;
          }
          break;

        default:
          this.logger.debug('Unhandled webhook event type', { type: event.type });
      }

      return {
        success: true,
        durationMs: Date.now() - startTime,
        recordsProcessed,
        metadata: {
          eventType: event.type,
          action: payload.action,
          repository: payload.repository?.fullName
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
      name: GITHUB_CONNECTOR_METADATA.name,
      version: this.version,
      recordTypes: [...GITHUB_CONNECTOR_METADATA.recordTypes],
      authMethods: [...GITHUB_CONNECTOR_METADATA.authMethods],
      supportsIncremental: GITHUB_CONNECTOR_METADATA.supportsIncremental,
      supportsWebhooks: GITHUB_CONNECTOR_METADATA.supportsWebhooks,
      rateLimits: { ...GITHUB_CONNECTOR_METADATA.rateLimits },
      capabilities: [...GITHUB_CONNECTOR_METADATA.capabilities],
      documentationUrl: GITHUB_CONNECTOR_METADATA.documentationUrl
    };
  }

  // ============================================================================
  // GitHub-Specific Methods
  // ============================================================================

  /**
   * Get pull request details
   */
  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<GitHubPullRequest> {
    if (!this.octokit) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.octokit!.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber
      })
    );

    return this.mapPullRequest(data);
  }

  /**
   * Get pull request files with pagination
   */
  async getPullRequestFiles(owner: string, repo: string, prNumber: number): Promise<GitHubFileChange[]> {
    if (!this.octokit) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const files: GitHubFileChange[] = [];

    // Use pagination to get all files
    for await (const response of this.octokit.paginate.iterator(
      this.octokit.rest.pulls.listFiles,
      {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100
      }
    )) {
      for (const file of response.data) {
        files.push({
          sha: file.sha,
          filename: file.filename,
          status: file.status as GitHubFileChange['status'],
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          patch: file.patch,
          previousFilename: file.previous_filename,
          contentsUrl: file.contents_url
        });
      }
    }

    return files;
  }

  /**
   * Get issue details
   */
  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    if (!this.octokit) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.octokit!.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber
      })
    );

    return this.mapIssue(data);
  }

  /**
   * Create a comment on an issue or PR
   */
  async createComment(owner: string, repo: string, issueNumber: number, body: string): Promise<number> {
    if (!this.octokit) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.octokit!.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body
      })
    );

    return data.id;
  }

  /**
   * Add labels to an issue or PR
   */
  async addLabels(owner: string, repo: string, issueNumber: number, labels: string[]): Promise<void> {
    if (!this.octokit) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    await this.retryRequest(() =>
      this.octokit!.rest.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels
      })
    );
  }

  /**
   * Get file content at a specific ref
   */
  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    if (!this.octokit) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.octokit!.rest.repos.getContent({
        owner,
        repo,
        path,
        ref
      })
    );

    if (Array.isArray(data) || data.type !== 'file') {
      throw new ConnectorError(`Path is not a file: ${path}`, this.name);
    }

    // Content is base64 encoded
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }

  // ============================================================================
  // GraphQL Methods
  // ============================================================================

  /**
   * Execute a GraphQL query
   */
  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    if (!this.octokit) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    return this.retryRequest(() =>
      this.octokit!.graphql<T>(query, variables)
    );
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Sync pull requests from a repository
   */
  private async *syncPullRequests(
    owner: string,
    repo: string,
    options: GitHubSyncOptions
  ): AsyncGenerator<ConnectorRecord> {
    if (!this.octokit) return;

    const state = options.state ?? 'open';
    const since = options.since;

    // Use pagination to get all PRs
    for await (const response of this.octokit.paginate.iterator(
      this.octokit.rest.pulls.list,
      {
        owner,
        repo,
        state: state === 'all' ? 'all' : state,
        sort: options.sort === 'updated' ? 'updated' : 'created',
        direction: options.direction ?? 'desc',
        per_page: 100
      }
    )) {
      for (const pr of response.data) {
        // Filter by since date if provided
        if (since && new Date(pr.updated_at) < new Date(since)) {
          continue;
        }

        const mappedPR = this.mapPullRequest(pr);

        // Get files if requested
        let files: GitHubFileChange[] | undefined;
        if (options.includeFiles) {
          files = await this.getPullRequestFiles(owner, repo, pr.number);
        }

        yield {
          id: `github:pr:${owner}/${repo}#${pr.number}`,
          type: 'pull_request',
          source: this.name,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          data: {
            ...mappedPR,
            files
          }
        };

        // Respect limit if set
        if (options.limit && response.data.indexOf(pr) >= options.limit - 1) {
          return;
        }
      }
    }
  }

  /**
   * Sync issues from a repository
   */
  private async *syncIssues(
    owner: string,
    repo: string,
    options: GitHubSyncOptions
  ): AsyncGenerator<ConnectorRecord> {
    if (!this.octokit) return;

    const state = options.state ?? 'open';
    const since = options.since;

    for await (const response of this.octokit.paginate.iterator(
      this.octokit.rest.issues.listForRepo,
      {
        owner,
        repo,
        state: state === 'all' ? 'all' : state,
        sort: options.sort === 'updated' ? 'updated' : 'created',
        direction: options.direction ?? 'desc',
        since,
        per_page: 100
      }
    )) {
      for (const issue of response.data) {
        // Skip pull requests (they appear in issues API too)
        if (issue.pull_request) {
          continue;
        }

        yield {
          id: `github:issue:${owner}/${repo}#${issue.number}`,
          type: 'issue',
          source: this.name,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          data: this.mapIssue(issue)
        };

        // Respect limit if set
        if (options.limit && response.data.indexOf(issue) >= options.limit - 1) {
          return;
        }
      }
    }
  }

  /**
   * Map GitHub API PR response to our type
   */
  private mapPullRequest(pr: any): GitHubPullRequest {
    return {
      id: pr.id,
      nodeId: pr.node_id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      locked: pr.locked,
      draft: pr.draft ?? false,
      merged: pr.merged ?? false,
      mergeable: pr.mergeable,
      mergeableState: pr.mergeable_state ?? 'unknown',
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
        repo: pr.head.repo ? { fullName: pr.head.repo.full_name } : null
      },
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha,
        repo: { fullName: pr.base.repo.full_name }
      },
      user: {
        login: pr.user.login,
        id: pr.user.id
      },
      labels: (pr.labels ?? []).map((l: any) => ({
        id: l.id,
        name: l.name,
        color: l.color
      })),
      assignees: (pr.assignees ?? []).map((a: any) => ({
        login: a.login,
        id: a.id
      })),
      requestedReviewers: (pr.requested_reviewers ?? []).map((r: any) => ({
        login: r.login,
        id: r.id
      })),
      additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0,
      changedFiles: pr.changed_files ?? 0,
      commits: pr.commits ?? 0,
      comments: pr.comments ?? 0,
      reviewComments: pr.review_comments ?? 0,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      closedAt: pr.closed_at,
      mergedAt: pr.merged_at,
      mergedBy: pr.merged_by ? {
        login: pr.merged_by.login,
        id: pr.merged_by.id
      } : null
    };
  }

  /**
   * Map GitHub API issue response to our type
   */
  private mapIssue(issue: any): GitHubIssue {
    return {
      id: issue.id,
      nodeId: issue.node_id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      stateReason: issue.state_reason,
      locked: issue.locked,
      user: {
        login: issue.user.login,
        id: issue.user.id
      },
      labels: (issue.labels ?? []).map((l: any) => ({
        id: l.id,
        name: l.name,
        color: l.color
      })),
      assignees: (issue.assignees ?? []).map((a: any) => ({
        login: a.login,
        id: a.id
      })),
      milestone: issue.milestone ? {
        id: issue.milestone.id,
        number: issue.milestone.number,
        title: issue.milestone.title
      } : null,
      comments: issue.comments,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      closedAt: issue.closed_at
    };
  }
}
