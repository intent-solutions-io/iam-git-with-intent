/**
 * SDK-specific types for the Git With Intent API Client
 *
 * These types define request/response shapes for API operations.
 * Core domain types are imported from @gwi/core.
 * Gateway API types are auto-generated from OpenAPI specification.
 *
 * @module @gwi/sdk/types
 */

// =============================================================================
// Generated Gateway API Types
// =============================================================================

/**
 * Re-export generated types from OpenAPI specification
 * These types are automatically generated from apps/gateway/openapi.yaml
 *
 * To regenerate: npm run generate:sdk-types (in packages/sdk)
 */
export type { paths, components, operations } from './generated/gateway-types.js';

// Import with aliases for internal use in type helpers below
import type {
  components as GatewayComponents,
  operations as GatewayOperations,
} from './generated/gateway-types.js';

// =============================================================================
// Core Domain Types
// =============================================================================

// Re-export core types that users will need
export type {
  Tenant,
  TenantSettings,
  TenantRepo,
  RepoSettings,
  User,
  UserPreferences,
  Membership,
  SaaSRun,
  RunType,
  RunStatus,
  RunStep,
  StepStatus,
  RiskMode,
  PlanTier,
  TenantRole,
  MembershipStatus,
} from '@gwi/core';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Authentication configuration for the SDK
 */
export interface AuthConfig {
  /** API key for service-to-service authentication */
  apiKey?: string;
  /** Bearer token for user authentication (JWT from Firebase Auth) */
  bearerToken?: string;
  /** Development-only: User ID for X-Debug-User header */
  debugUserId?: string;
  /** Development-only: Role for X-Debug-Role header */
  debugRole?: 'owner' | 'admin' | 'member';
}

/**
 * SDK client configuration
 */
export interface GWIClientConfig {
  /** Base URL of the GWI API (e.g., https://api.gitwithintent.com) */
  baseUrl: string;
  /** Authentication configuration */
  auth?: AuthConfig;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Custom fetch implementation (useful for testing or custom environments) */
  fetch?: typeof fetch;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
  hint?: string;
}

/**
 * API error class with structured error information
 */
export class GWIApiError extends Error {
  /** HTTP status code */
  status: number;
  /** Error code from the API */
  code: string;
  /** Additional error details */
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'GWIApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// =============================================================================
// Health & Metrics
// =============================================================================

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'down';
  app: string;
  version: string;
  env: string;
  storeBackend: string;
  timestamp: string;
}

/**
 * Metrics response
 */
export interface MetricsResponse {
  app: string;
  version: string;
  env: string;
  uptimeMs: number;
  uptimeHuman: string;
  requests: {
    total: number;
    byPath: Record<string, number>;
    byStatus: Record<string, number>;
  };
  errors: {
    total: number;
    rate: string;
  };
  latency: {
    avgMs: number;
    totalMs: number;
  };
  timestamp: string;
}

// =============================================================================
// User & Authentication
// =============================================================================

/**
 * User signup request
 */
export interface SignupRequest {
  email: string;
  displayName: string;
  githubLogin?: string;
  githubUserId?: number;
  githubAvatarUrl?: string;
}

/**
 * User signup response
 */
export interface SignupResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    githubUserId: number;
    githubLogin: string;
    githubAvatarUrl?: string;
    createdAt: string;
    updatedAt: string;
  };
  message: string;
}

/**
 * Current user info response
 */
export interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    githubUserId: number;
    githubLogin: string;
    githubAvatarUrl?: string;
    preferences: {
      defaultTenantId?: string;
      notificationsEnabled: boolean;
      theme: 'light' | 'dark' | 'system';
    };
    createdAt: string;
    lastLoginAt: string;
    updatedAt: string;
  };
  memberships: Array<{
    id: string;
    tenantId: string;
    role: string;
    status: string;
  }>;
}

// =============================================================================
// Tenants
// =============================================================================

/**
 * Create tenant request
 */
export interface CreateTenantRequest {
  displayName: string;
  githubOrgLogin?: string;
  githubOrgId?: number;
}

/**
 * Tenant with user's role
 */
export interface TenantWithRole {
  tenant: {
    id: string;
    displayName: string;
    githubOrgLogin: string;
    githubOrgId: number;
    plan: string;
    status: string;
    runsThisMonth: number;
    createdAt: string;
    updatedAt: string;
  };
  role: string;
  joinedAt: string;
}

/**
 * List tenants response
 */
export interface ListTenantsResponse {
  tenants: TenantWithRole[];
  count: number;
}

/**
 * Update tenant settings request
 */
export interface UpdateSettingsRequest {
  defaultRiskMode?: 'comment_only' | 'suggest_patch' | 'auto_patch' | 'auto_push';
  defaultTriageModel?: string;
  defaultCodeModel?: string;
  complexityThreshold?: number;
  autoRunOnConflict?: boolean;
  autoRunOnPrOpen?: boolean;
}

// =============================================================================
// Repositories
// =============================================================================

/**
 * Connect repository request
 */
export interface ConnectRepoRequest {
  repoUrl: string;
  displayName?: string;
  settings?: {
    autoTriage?: boolean;
    autoReview?: boolean;
    autoResolve?: boolean;
  };
}

/**
 * Repository response
 */
export interface RepoResponse {
  id: string;
  tenantId: string;
  githubRepoId: number;
  githubFullName: string;
  displayName: string;
  enabled: boolean;
  lastSyncAt?: string;
  settings: {
    riskModeOverride?: string;
    autoTriage: boolean;
    autoReview: boolean;
    autoResolve: boolean;
    branchPatterns?: string[];
  };
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  lastRunId?: string;
  addedAt: string;
  updatedAt: string;
}

/**
 * List repositories response
 */
export interface ListReposResponse {
  repos: RepoResponse[];
}

// =============================================================================
// Members & Invites
// =============================================================================

/**
 * Invite member request
 */
export interface InviteMemberRequest {
  email: string;
  role?: 'admin' | 'member';
}

/**
 * Invite response
 */
export interface InviteResponse {
  invite: {
    id: string;
    email: string;
    role: string;
    status: string;
    invitedAt: string;
    inviteToken?: string;
  };
  message: string;
}

/**
 * List invites response
 */
export interface ListInvitesResponse {
  invites: Array<{
    id: string;
    role: string;
    status: string;
    invitedBy?: string;
    invitedAt?: string;
  }>;
}

/**
 * Member info
 */
export interface MemberInfo {
  userId: string;
  role: string;
  joinedAt: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
}

/**
 * List members response
 */
export interface ListMembersResponse {
  members: MemberInfo[];
}

/**
 * Accept invite response
 */
export interface AcceptInviteResponse {
  membership: {
    tenantId: string;
    role: string;
  };
  message: string;
}

// =============================================================================
// Runs
// =============================================================================

/**
 * Start run request
 */
export interface StartRunRequest {
  repoUrl: string;
  runType: 'TRIAGE' | 'PLAN' | 'RESOLVE' | 'REVIEW' | 'AUTOPILOT';
  prNumber?: number;
  issueNumber?: number;
  riskMode?: 'comment_only' | 'suggest_patch' | 'auto_patch' | 'auto_push';
  metadata?: Record<string, unknown>;
}

/**
 * Run response (single run)
 */
export interface RunResponse {
  runId: string;
  status: string;
  message?: string;
  prUrl?: string;
  estimatedDurationMs?: number;
}

/**
 * List runs response
 */
export interface ListRunsResponse {
  runs: Array<{
    id: string;
    tenantId: string;
    repoId: string;
    type: string;
    status: string;
    prUrl: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
  }>;
}

/**
 * Detailed run status
 */
export interface RunStatusResponse {
  id: string;
  tenantId: string;
  repoId: string;
  prUrl: string;
  type: string;
  status: string;
  currentStep?: string;
  steps: Array<{
    id: string;
    agent: string;
    status: string;
    input?: unknown;
    output?: unknown;
    error?: string;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
  }>;
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  durationMs?: number;
}

// =============================================================================
// Workflows
// =============================================================================

/**
 * Start workflow request
 */
export interface StartWorkflowRequest {
  workflowType: 'issue-to-code' | 'pr-resolve' | 'pr-review' | 'test-gen' | 'docs-update';
  input: Record<string, unknown>;
}

/**
 * Workflow response
 */
export interface WorkflowResponse {
  workflowId: string;
  status: string;
  currentStep?: string;
  message: string;
}

/**
 * List workflows response
 */
export interface ListWorkflowsResponse {
  workflows: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string;
    completedAt?: string;
  }>;
  count: number;
}

/**
 * Workflow status response
 */
export interface WorkflowStatusResponse {
  id: string;
  type: string;
  status: string;
  steps: Array<{
    agent: string;
    status: string;
    startedAt?: number;
    completedAt?: number;
    error?: string;
  }>;
  output?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/**
 * Approve workflow request
 */
export interface ApproveWorkflowRequest {
  approved: boolean;
}

/**
 * Approve workflow response
 */
export interface ApproveWorkflowResponse {
  workflowId: string;
  status: string;
  message: string;
}

// =============================================================================
// Gateway API Type Helpers
// =============================================================================

/**
 * Helper types for working with generated Gateway API types
 * These provide convenient access to request/response types from operations
 */

/**
 * Extract request body type from an operation
 *
 * @example
 * ```typescript
 * type PublishRequest = RequestBody<'publishFull'>;
 * ```
 */
export type RequestBody<T extends keyof GatewayOperations> =
  GatewayOperations[T] extends { requestBody?: { content: { 'application/json': infer R } } }
    ? R
    : never;

/**
 * Extract successful response type from an operation (200/201 responses)
 *
 * @example
 * ```typescript
 * type SearchResponse = SuccessResponse<'searchConnectors'>;
 * ```
 */
export type SuccessResponse<T extends keyof GatewayOperations> =
  GatewayOperations[T] extends {
    responses: { 200: { content: { 'application/json': infer R } } };
  }
    ? R
    : GatewayOperations[T] extends {
        responses: { 201: { content: { 'application/json': infer R } } };
      }
    ? R
    : never;

/**
 * Extract error response type from an operation (4xx/5xx responses)
 *
 * @example
 * ```typescript
 * type SearchError = ErrorResponse<'searchConnectors'>;
 * ```
 */
export type ErrorResponse<T extends keyof GatewayOperations> =
  GatewayOperations[T] extends {
    responses: { 400: { content: { 'application/json': infer R } } };
  }
    ? R
    : GatewayOperations[T] extends {
        responses: { 500: { content: { 'application/json': infer R } } };
      }
    ? R
    : never;

/**
 * Extract path parameters from an operation
 *
 * @example
 * ```typescript
 * type ConnectorParams = PathParams<'getConnector'>; // { id: string }
 * ```
 */
export type PathParams<T extends keyof GatewayOperations> = GatewayOperations[T] extends {
  parameters: { path?: infer P };
}
  ? P
  : never;

/**
 * Extract query parameters from an operation
 *
 * @example
 * ```typescript
 * type SearchParams = QueryParams<'searchConnectors'>; // { q?: string, page?: number, ... }
 * ```
 */
export type QueryParams<T extends keyof GatewayOperations> = GatewayOperations[T] extends {
  parameters: { query?: infer Q };
}
  ? Q
  : never;

// =============================================================================
// Convenience Type Aliases for Common Operations
// =============================================================================

/**
 * Common Gateway API operation types for easy access
 */

/** Search connectors request parameters */
export type SearchConnectorsParams = QueryParams<'searchConnectors'>;

/** Search connectors response */
export type SearchConnectorsResponse = SuccessResponse<'searchConnectors'>;

/** Get connector path parameters */
export type GetConnectorParams = PathParams<'getConnector'>;

/** Get connector response */
export type GetConnectorResponse = SuccessResponse<'getConnector'>;

/** Publish connector request */
export type PublishConnectorRequest = RequestBody<'publishFull'>;

/** Publish connector response */
export type PublishConnectorResponse = SuccessResponse<'publishFull'>;

/** SCIM user resource */
export type ScimUser = GatewayComponents['schemas']['ScimUser'];

/** SCIM group resource */
export type ScimGroup = GatewayComponents['schemas']['ScimGroup'];

/** SCIM list response */
export type ScimListResponse = GatewayComponents['schemas']['ScimListResponse'];

/** SSO authentication response */
export type SsoAuthResponse = GatewayComponents['schemas']['SsoAuthResponse'];
