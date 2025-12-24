/**
 * @gwi/sdk - TypeScript SDK for the Git With Intent API
 *
 * A comprehensive, type-safe client library for interacting with the
 * Git With Intent platform. Works in both Node.js and browser environments.
 *
 * @example
 * ```typescript
 * import { GWIClient } from '@gwi/sdk';
 *
 * const client = new GWIClient({
 *   baseUrl: 'https://api.gitwithintent.com',
 *   auth: {
 *     bearerToken: 'your-firebase-jwt-token'
 *   }
 * });
 *
 * // List tenants
 * const { tenants } = await client.tenants.list();
 *
 * // Start a run
 * const run = await client.runs.start('tenant-123', {
 *   repoUrl: 'https://github.com/owner/repo',
 *   runType: 'AUTOPILOT',
 *   prNumber: 42
 * });
 *
 * // Monitor workflow
 * const workflow = await client.workflows.get('tenant-123', 'wf-xyz');
 * if (workflow.status === 'waiting_approval') {
 *   await client.workflows.approve('tenant-123', 'wf-xyz', true);
 * }
 * ```
 *
 * @module @gwi/sdk
 */

// Main client export
export { GWIClient } from './client.js';

// Export all types
export type {
  // Configuration
  GWIClientConfig,
  AuthConfig,

  // Error types
  ApiErrorResponse,

  // Health & Metrics
  HealthResponse,
  MetricsResponse,

  // User & Auth
  SignupRequest,
  SignupResponse,
  MeResponse,

  // Tenants
  CreateTenantRequest,
  TenantWithRole,
  ListTenantsResponse,
  UpdateSettingsRequest,

  // Repositories
  ConnectRepoRequest,
  RepoResponse,
  ListReposResponse,

  // Members & Invites
  InviteMemberRequest,
  InviteResponse,
  ListInvitesResponse,
  MemberInfo,
  ListMembersResponse,
  AcceptInviteResponse,

  // Runs
  StartRunRequest,
  RunResponse,
  ListRunsResponse,
  RunStatusResponse,

  // Workflows
  StartWorkflowRequest,
  WorkflowResponse,
  ListWorkflowsResponse,
  WorkflowStatusResponse,
  ApproveWorkflowRequest,
  ApproveWorkflowResponse,

  // Gateway API Types (auto-generated from OpenAPI)
  paths,
  components,
  operations,

  // Gateway API Type Helpers
  RequestBody,
  SuccessResponse,
  ErrorResponse,
  PathParams,
  QueryParams,

  // Convenience Aliases
  SearchConnectorsParams,
  SearchConnectorsResponse,
  GetConnectorParams,
  GetConnectorResponse,
  PublishConnectorRequest,
  PublishConnectorResponse,
  ScimUser,
  ScimGroup,
  SsoAuthResponse,
} from './types.js';

// Export error class
export { GWIApiError } from './types.js';

// Re-export commonly used core types for convenience
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
