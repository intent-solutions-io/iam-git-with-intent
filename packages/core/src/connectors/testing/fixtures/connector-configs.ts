/**
 * Connector Configuration Fixtures
 *
 * Sample connector configurations for testing.
 *
 * @module @gwi/core/connectors/testing/fixtures
 */

/**
 * GitHub connector configuration
 */
export const githubConnectorConfig = {
  id: 'github',
  version: '1.0.0',
  displayName: 'GitHub',
  auth: {
    type: 'token' as const,
    token: 'ghp_test1234567890abcdefghijklmnopqrstuvwxyz',
  },
  baseUrl: 'https://api.github.com',
  rateLimits: {
    core: 5000,
    search: 30,
    graphql: 5000,
  },
};

/**
 * GitLab connector configuration
 */
export const gitlabConnectorConfig = {
  id: 'gitlab',
  version: '1.0.0',
  displayName: 'GitLab',
  auth: {
    type: 'token' as const,
    token: 'glpat-test1234567890abcdefghij',
  },
  baseUrl: 'https://gitlab.com/api/v4',
  rateLimits: {
    authenticated: 2000,
  },
};

/**
 * Jira connector configuration
 */
export const jiraConnectorConfig = {
  id: 'jira',
  version: '1.0.0',
  displayName: 'Jira',
  auth: {
    type: 'basic' as const,
    email: 'test@example.com',
    apiToken: 'ATATT3xFfGF0test1234567890abcdefghij',
  },
  baseUrl: 'https://example.atlassian.net',
  cloudId: 'aaaabbbb-1111-2222-3333-ccccddddeeee',
};

/**
 * Slack connector configuration
 */
export const slackConnectorConfig = {
  id: 'slack',
  version: '1.0.0',
  displayName: 'Slack',
  auth: {
    type: 'oauth' as const,
    accessToken: 'xoxb-test-1234567890-1234567890123-abcdefghijklmnopqrstuvwx',
    tokenType: 'Bot',
    scope: 'channels:read,chat:write,users:read',
  },
  teamId: 'T01234567',
  teamName: 'Test Workspace',
};

/**
 * Linear connector configuration
 */
export const linearConnectorConfig = {
  id: 'linear',
  version: '1.0.0',
  displayName: 'Linear',
  auth: {
    type: 'token' as const,
    token: 'test_linear_token_fake_00000000',
  },
  baseUrl: 'https://api.linear.app/graphql',
  organizationId: 'org_test123456',
};

/**
 * Notion connector configuration
 */
export const notionConnectorConfig = {
  id: 'notion',
  version: '1.0.0',
  displayName: 'Notion',
  auth: {
    type: 'token' as const,
    token: 'secret_test1234567890abcdefghijklmnopqrstuvwxyz',
  },
  baseUrl: 'https://api.notion.com/v1',
  notionVersion: '2022-06-28',
};

/**
 * Airbyte connector configuration
 */
export const airbyteConnectorConfig = {
  id: 'airbyte',
  version: '1.0.0',
  displayName: 'Airbyte',
  auth: {
    type: 'token' as const,
    token: 'airbyte_api_token_test123456',
  },
  baseUrl: 'https://api.airbyte.com/v1',
  workspaceId: '550e8400-e29b-41d4-a716-446655440000',
};

/**
 * Webhook receiver configuration (GitHub)
 */
export const githubWebhookConfig = {
  id: 'github-webhook',
  version: '1.0.0',
  displayName: 'GitHub Webhook',
  secret: 'webhook_secret_test_1234567890abcdefghij',
  events: [
    'pull_request',
    'pull_request_review',
    'issue_comment',
    'push',
    'check_run',
  ],
  url: 'https://example.com/webhooks/github',
  active: true,
};

/**
 * Webhook receiver configuration (GitLab)
 */
export const gitlabWebhookConfig = {
  id: 'gitlab-webhook',
  version: '1.0.0',
  displayName: 'GitLab Webhook',
  token: 'webhook_token_test_1234567890abcdefghij',
  events: [
    'merge_request',
    'push',
    'note',
    'pipeline',
  ],
  url: 'https://example.com/webhooks/gitlab',
  enableSslVerification: true,
};

/**
 * OAuth application configuration (GitHub)
 */
export const githubOAuthConfig = {
  clientId: 'Iv1.test1234567890abcd',
  clientSecret: 'test_client_secret_1234567890abcdefghijklmnop',
  redirectUri: 'https://example.com/oauth/callback',
  scopes: ['repo', 'read:user', 'user:email'],
  authorizeUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
};

/**
 * OAuth application configuration (GitLab)
 */
export const gitlabOAuthConfig = {
  clientId: 'test1234567890abcdefghijklmnopqrstuvwxyz1234567890',
  clientSecret: 'test_client_secret_1234567890abcdefghijklmnopqrstuvwxyz',
  redirectUri: 'https://example.com/oauth/callback',
  scopes: ['api', 'read_user', 'read_repository', 'write_repository'],
  authorizeUrl: 'https://gitlab.com/oauth/authorize',
  tokenUrl: 'https://gitlab.com/oauth/token',
};

/**
 * Rate limit configuration
 */
export const rateLimitConfig = {
  maxRequestsPerSecond: 10,
  maxBurstSize: 20,
  retryAfterMs: 60000,
  maxRetries: 3,
  backoffMultiplier: 2,
};

/**
 * Retry configuration
 */
export const retryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'],
};

/**
 * Pagination configuration
 */
export const paginationConfig = {
  defaultPageSize: 100,
  maxPageSize: 100,
  strategy: 'cursor' as const,
  cursorField: 'next_cursor',
  hasMoreField: 'has_more',
};

/**
 * Timeout configuration
 */
export const timeoutConfig = {
  connectionTimeoutMs: 5000,
  requestTimeoutMs: 30000,
  idleTimeoutMs: 60000,
};
