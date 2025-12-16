/**
 * Git With Intent API Client
 *
 * TypeScript SDK for interacting with the GWI API.
 * Supports Node.js and browser environments with full type safety.
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
 * // List your tenants
 * const { tenants } = await client.tenants.list();
 *
 * // Start a run
 * const run = await client.runs.start('tenant-123', {
 *   repoUrl: 'https://github.com/owner/repo',
 *   runType: 'AUTOPILOT',
 *   prNumber: 42
 * });
 * ```
 *
 * @module @gwi/sdk/client
 */

import type {
  GWIClientConfig,
  AuthConfig,
  GWIApiError,
  ApiErrorResponse,
  HealthResponse,
  MetricsResponse,
  SignupRequest,
  SignupResponse,
  MeResponse,
  CreateTenantRequest,
  ListTenantsResponse,
  UpdateSettingsRequest,
  ConnectRepoRequest,
  RepoResponse,
  ListReposResponse,
  InviteMemberRequest,
  InviteResponse,
  ListInvitesResponse,
  ListMembersResponse,
  AcceptInviteResponse,
  StartRunRequest,
  RunResponse,
  ListRunsResponse,
  RunStatusResponse,
  StartWorkflowRequest,
  WorkflowResponse,
  ListWorkflowsResponse,
  WorkflowStatusResponse,
  ApproveWorkflowResponse,
  Tenant,
} from './types.js';

// =============================================================================
// HTTP Client
// =============================================================================

/**
 * Internal HTTP client for making API requests
 */
class HttpClient {
  private baseUrl: string;
  private auth?: AuthConfig;
  private timeout: number;
  private fetchImpl: typeof fetch;

  constructor(config: GWIClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.auth = config.auth;
    this.timeout = config.timeout ?? 30000;
    this.fetchImpl = config.fetch ?? globalThis.fetch;

    if (!this.fetchImpl) {
      throw new Error('fetch is not available. Please provide a fetch implementation or use a polyfill.');
    }
  }

  /**
   * Build headers for the request
   */
  private buildHeaders(customHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': '@gwi/sdk/0.1.0',
      ...customHeaders,
    };

    // Add authentication headers
    if (this.auth) {
      if (this.auth.bearerToken) {
        headers['Authorization'] = `Bearer ${this.auth.bearerToken}`;
      }

      if (this.auth.apiKey) {
        headers['X-API-Key'] = this.auth.apiKey;
      }

      // Development-only headers
      if (this.auth.debugUserId) {
        headers['X-Debug-User'] = this.auth.debugUserId;
      }

      if (this.auth.debugRole) {
        headers['X-Debug-Role'] = this.auth.debugRole;
      }
    }

    return headers;
  }

  /**
   * Make an HTTP request with timeout and error handling
   */
  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      query?: Record<string, string | number | boolean | undefined>;
    } = {}
  ): Promise<T> {
    const { body, headers: customHeaders, query } = options;

    // Build URL with query parameters
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    // Build request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: this.buildHeaders(customHeaders),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle non-2xx responses
      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle timeout
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError: Partial<GWIApiError> = new Error(`Request timeout after ${this.timeout}ms`);
        timeoutError.name = 'GWIApiError';
        (timeoutError as GWIApiError).status = 408;
        (timeoutError as GWIApiError).code = 'TIMEOUT';
        throw timeoutError as GWIApiError;
      }

      // Re-throw GWIApiError
      if ((error as GWIApiError).name === 'GWIApiError') {
        throw error;
      }

      // Wrap other errors
      const wrappedError: Partial<GWIApiError> = new Error(
        error instanceof Error ? error.message : 'Network request failed'
      );
      wrappedError.name = 'GWIApiError';
      (wrappedError as GWIApiError).status = 0;
      (wrappedError as GWIApiError).code = 'NETWORK_ERROR';
      throw wrappedError as GWIApiError;
    }
  }

  /**
   * Handle error responses from the API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: ApiErrorResponse;
    try {
      errorData = await response.json() as ApiErrorResponse;
    } catch {
      errorData = {
        error: 'UNKNOWN_ERROR',
        message: response.statusText || 'Unknown error occurred',
      };
    }

    const error: Partial<GWIApiError> = new Error(
      errorData.message || errorData.error || 'API request failed'
    );
    error.name = 'GWIApiError';
    (error as GWIApiError).status = response.status;
    (error as GWIApiError).code = errorData.error;
    (error as GWIApiError).details = errorData.details;

    throw error as GWIApiError;
  }

  /**
   * Update authentication configuration
   */
  setAuth(auth: AuthConfig): void {
    this.auth = auth;
  }

  /**
   * Clear authentication
   */
  clearAuth(): void {
    this.auth = undefined;
  }
}

// =============================================================================
// API Namespaces
// =============================================================================

/**
 * Tenant management methods
 */
class TenantsAPI {
  constructor(private http: HttpClient) {}

  /**
   * List all tenants for the current user
   *
   * @returns List of tenants with user's role
   *
   * @example
   * ```typescript
   * const { tenants } = await client.tenants.list();
   * console.log(`You have access to ${tenants.length} tenants`);
   * ```
   */
  async list(): Promise<ListTenantsResponse> {
    return this.http.request<ListTenantsResponse>('GET', '/tenants');
  }

  /**
   * Get a specific tenant by ID
   *
   * @param tenantId - Tenant ID
   * @returns Tenant details
   *
   * @example
   * ```typescript
   * const tenant = await client.tenants.get('tenant-123');
   * console.log(`Plan: ${tenant.plan}, Runs: ${tenant.runsThisMonth}`);
   * ```
   */
  async get(tenantId: string): Promise<Tenant> {
    return this.http.request<Tenant>('GET', `/tenants/${tenantId}`);
  }

  /**
   * Create a new tenant (workspace)
   *
   * @param request - Tenant creation parameters
   * @returns Created tenant
   *
   * @example
   * ```typescript
   * const { tenant } = await client.tenants.create({
   *   displayName: 'My Team',
   *   githubOrgLogin: 'my-org'
   * });
   * ```
   */
  async create(request: CreateTenantRequest): Promise<{ tenant: Tenant; message: string }> {
    return this.http.request('POST', '/tenants', { body: request });
  }

  /**
   * Update tenant settings
   *
   * @param tenantId - Tenant ID
   * @param settings - Settings to update
   * @returns Updated tenant
   *
   * @example
   * ```typescript
   * const tenant = await client.tenants.updateSettings('tenant-123', {
   *   defaultRiskMode: 'auto_patch',
   *   autoRunOnConflict: true
   * });
   * ```
   */
  async updateSettings(tenantId: string, settings: UpdateSettingsRequest): Promise<Tenant> {
    return this.http.request<Tenant>('POST', `/tenants/${tenantId}/settings`, {
      body: settings,
    });
  }
}

/**
 * Repository management methods
 */
class RepositoriesAPI {
  constructor(private http: HttpClient) {}

  /**
   * List all repositories for a tenant
   *
   * @param tenantId - Tenant ID
   * @param options - Filter options
   * @returns List of repositories
   *
   * @example
   * ```typescript
   * const { repos } = await client.repos.list('tenant-123', { enabled: true });
   * ```
   */
  async list(
    tenantId: string,
    options?: { enabled?: boolean }
  ): Promise<ListReposResponse> {
    return this.http.request<ListReposResponse>('GET', `/tenants/${tenantId}/repos`, {
      query: options,
    });
  }

  /**
   * Connect a repository to a tenant
   *
   * @param tenantId - Tenant ID
   * @param request - Repository connection parameters
   * @returns Connected repository
   *
   * @example
   * ```typescript
   * const repo = await client.repos.connect('tenant-123', {
   *   repoUrl: 'https://github.com/owner/repo',
   *   settings: {
   *     autoTriage: true,
   *     autoReview: true
   *   }
   * });
   * ```
   */
  async connect(tenantId: string, request: ConnectRepoRequest): Promise<RepoResponse> {
    return this.http.request<RepoResponse>('POST', `/tenants/${tenantId}/repos:connect`, {
      body: request,
    });
  }

  /**
   * Remove a repository from a tenant
   *
   * @param tenantId - Tenant ID
   * @param repoId - Repository ID
   *
   * @example
   * ```typescript
   * await client.repos.remove('tenant-123', 'gh-repo-owner-repo');
   * ```
   */
  async remove(tenantId: string, repoId: string): Promise<void> {
    return this.http.request<void>('DELETE', `/tenants/${tenantId}/repos/${repoId}`);
  }
}

/**
 * Member and invite management methods
 */
class MembersAPI {
  constructor(private http: HttpClient) {}

  /**
   * List all members of a tenant
   *
   * @param tenantId - Tenant ID
   * @returns List of members
   *
   * @example
   * ```typescript
   * const { members } = await client.members.list('tenant-123');
   * ```
   */
  async list(tenantId: string): Promise<ListMembersResponse> {
    return this.http.request<ListMembersResponse>('GET', `/tenants/${tenantId}/members`);
  }

  /**
   * List pending invitations for a tenant
   *
   * @param tenantId - Tenant ID
   * @returns List of pending invites
   *
   * @example
   * ```typescript
   * const { invites } = await client.members.listInvites('tenant-123');
   * ```
   */
  async listInvites(tenantId: string): Promise<ListInvitesResponse> {
    return this.http.request<ListInvitesResponse>('GET', `/tenants/${tenantId}/invites`);
  }

  /**
   * Invite a new member to a tenant
   *
   * @param tenantId - Tenant ID
   * @param request - Invite parameters
   * @returns Created invite
   *
   * @example
   * ```typescript
   * const { invite } = await client.members.invite('tenant-123', {
   *   email: 'user@example.com',
   *   role: 'admin'
   * });
   * ```
   */
  async invite(tenantId: string, request: InviteMemberRequest): Promise<InviteResponse> {
    return this.http.request<InviteResponse>('POST', `/tenants/${tenantId}/invites`, {
      body: request,
    });
  }

  /**
   * Accept an invitation
   *
   * @param inviteToken - Invitation token
   * @returns Accepted membership
   *
   * @example
   * ```typescript
   * const { membership } = await client.members.acceptInvite('inv-xyz123');
   * ```
   */
  async acceptInvite(inviteToken: string): Promise<AcceptInviteResponse> {
    return this.http.request<AcceptInviteResponse>('POST', `/invites/${inviteToken}/accept`);
  }

  /**
   * Cancel a pending invitation
   *
   * @param tenantId - Tenant ID
   * @param inviteId - Invite ID
   *
   * @example
   * ```typescript
   * await client.members.cancelInvite('tenant-123', 'pending_inv-xyz');
   * ```
   */
  async cancelInvite(tenantId: string, inviteId: string): Promise<void> {
    return this.http.request<void>('DELETE', `/tenants/${tenantId}/invites/${inviteId}`);
  }
}

/**
 * Run management methods
 */
class RunsAPI {
  constructor(private http: HttpClient) {}

  /**
   * Start a new run
   *
   * @param tenantId - Tenant ID
   * @param request - Run parameters
   * @returns Started run
   *
   * @example
   * ```typescript
   * const run = await client.runs.start('tenant-123', {
   *   repoUrl: 'https://github.com/owner/repo',
   *   runType: 'AUTOPILOT',
   *   prNumber: 42,
   *   riskMode: 'suggest_patch'
   * });
   * console.log(`Run started: ${run.runId}`);
   * ```
   */
  async start(tenantId: string, request: StartRunRequest): Promise<RunResponse> {
    return this.http.request<RunResponse>('POST', `/tenants/${tenantId}/runs`, {
      body: request,
    });
  }

  /**
   * Get run status
   *
   * @param tenantId - Tenant ID
   * @param runId - Run ID
   * @returns Run details with steps
   *
   * @example
   * ```typescript
   * const run = await client.runs.get('tenant-123', 'run-xyz');
   * console.log(`Status: ${run.status}, Steps: ${run.steps.length}`);
   * ```
   */
  async get(tenantId: string, runId: string): Promise<RunStatusResponse> {
    return this.http.request<RunStatusResponse>('GET', `/tenants/${tenantId}/runs/${runId}`);
  }

  /**
   * List runs for a tenant
   *
   * @param tenantId - Tenant ID
   * @param options - Filter options
   * @returns List of runs
   *
   * @example
   * ```typescript
   * const { runs } = await client.runs.list('tenant-123', { limit: 10 });
   * ```
   */
  async list(
    tenantId: string,
    options?: { limit?: number }
  ): Promise<ListRunsResponse> {
    return this.http.request<ListRunsResponse>('GET', `/tenants/${tenantId}/runs`, {
      query: options,
    });
  }

  /**
   * Cancel a running run
   *
   * @param tenantId - Tenant ID
   * @param runId - Run ID
   *
   * @example
   * ```typescript
   * await client.runs.cancel('tenant-123', 'run-xyz');
   * ```
   */
  async cancel(tenantId: string, runId: string): Promise<void> {
    return this.http.request<void>('POST', `/tenants/${tenantId}/runs/${runId}/cancel`);
  }
}

/**
 * Workflow management methods
 */
class WorkflowsAPI {
  constructor(private http: HttpClient) {}

  /**
   * Start a new workflow
   *
   * @param tenantId - Tenant ID
   * @param request - Workflow parameters
   * @returns Started workflow
   *
   * @example
   * ```typescript
   * const workflow = await client.workflows.start('tenant-123', {
   *   workflowType: 'issue-to-code',
   *   input: {
   *     issueUrl: 'https://github.com/owner/repo/issues/123',
   *     targetBranch: 'main'
   *   }
   * });
   * ```
   */
  async start(tenantId: string, request: StartWorkflowRequest): Promise<WorkflowResponse> {
    return this.http.request<WorkflowResponse>('POST', `/tenants/${tenantId}/workflows`, {
      body: request,
    });
  }

  /**
   * Get workflow status
   *
   * @param tenantId - Tenant ID
   * @param workflowId - Workflow ID
   * @returns Workflow details with steps
   *
   * @example
   * ```typescript
   * const workflow = await client.workflows.get('tenant-123', 'wf-xyz');
   * console.log(`Status: ${workflow.status}`);
   * ```
   */
  async get(tenantId: string, workflowId: string): Promise<WorkflowStatusResponse> {
    return this.http.request<WorkflowStatusResponse>(
      'GET',
      `/tenants/${tenantId}/workflows/${workflowId}`
    );
  }

  /**
   * List workflows for a tenant
   *
   * @param tenantId - Tenant ID
   * @param options - Filter options
   * @returns List of workflows
   *
   * @example
   * ```typescript
   * const { workflows } = await client.workflows.list('tenant-123', {
   *   status: 'running'
   * });
   * ```
   */
  async list(
    tenantId: string,
    options?: { status?: string }
  ): Promise<ListWorkflowsResponse> {
    return this.http.request<ListWorkflowsResponse>('GET', `/tenants/${tenantId}/workflows`, {
      query: options,
    });
  }

  /**
   * Approve or reject a workflow waiting for human approval
   *
   * @param tenantId - Tenant ID
   * @param workflowId - Workflow ID
   * @param approved - Whether to approve (true) or reject (false)
   * @returns Updated workflow
   *
   * @example
   * ```typescript
   * const result = await client.workflows.approve('tenant-123', 'wf-xyz', true);
   * console.log(`Workflow ${result.status}`);
   * ```
   */
  async approve(
    tenantId: string,
    workflowId: string,
    approved: boolean
  ): Promise<ApproveWorkflowResponse> {
    return this.http.request<ApproveWorkflowResponse>(
      'POST',
      `/tenants/${tenantId}/workflows/${workflowId}/approve`,
      { body: { approved } }
    );
  }

  /**
   * Reject a workflow (convenience method)
   *
   * @param tenantId - Tenant ID
   * @param workflowId - Workflow ID
   * @returns Updated workflow
   *
   * @example
   * ```typescript
   * await client.workflows.reject('tenant-123', 'wf-xyz');
   * ```
   */
  async reject(tenantId: string, workflowId: string): Promise<ApproveWorkflowResponse> {
    return this.approve(tenantId, workflowId, false);
  }
}

/**
 * User management methods
 */
class UserAPI {
  constructor(private http: HttpClient) {}

  /**
   * Get current user information
   *
   * @returns Current user and memberships
   *
   * @example
   * ```typescript
   * const { user, memberships } = await client.user.me();
   * console.log(`Logged in as ${user.displayName}`);
   * ```
   */
  async me(): Promise<MeResponse> {
    return this.http.request<MeResponse>('GET', '/me');
  }

  /**
   * Sign up a new user
   *
   * @param request - Signup parameters
   * @returns Created user
   *
   * @example
   * ```typescript
   * const { user } = await client.user.signup({
   *   email: 'user@example.com',
   *   displayName: 'John Doe',
   *   githubLogin: 'johndoe'
   * });
   * ```
   */
  async signup(request: SignupRequest): Promise<SignupResponse> {
    return this.http.request<SignupResponse>('POST', '/signup', { body: request });
  }
}

// =============================================================================
// Main Client
// =============================================================================

/**
 * Git With Intent API Client
 *
 * Main entry point for the SDK. Provides access to all API operations
 * through namespaced methods.
 *
 * @example
 * ```typescript
 * import { GWIClient } from '@gwi/sdk';
 *
 * const client = new GWIClient({
 *   baseUrl: 'https://api.gitwithintent.com',
 *   auth: {
 *     bearerToken: 'your-jwt-token'
 *   }
 * });
 *
 * // Use the client
 * const { tenants } = await client.tenants.list();
 * ```
 */
export class GWIClient {
  private http: HttpClient;

  /** Tenant management operations */
  public readonly tenants: TenantsAPI;

  /** Repository management operations */
  public readonly repos: RepositoriesAPI;

  /** Member and invite management operations */
  public readonly members: MembersAPI;

  /** Run management operations */
  public readonly runs: RunsAPI;

  /** Workflow management operations */
  public readonly workflows: WorkflowsAPI;

  /** User operations */
  public readonly user: UserAPI;

  /**
   * Create a new GWI API client
   *
   * @param config - Client configuration
   *
   * @example
   * ```typescript
   * // Production usage
   * const client = new GWIClient({
   *   baseUrl: 'https://api.gitwithintent.com',
   *   auth: {
   *     bearerToken: await getFirebaseToken()
   *   }
   * });
   *
   * // Development usage
   * const devClient = new GWIClient({
   *   baseUrl: 'http://localhost:8080',
   *   auth: {
   *     debugUserId: 'user-123',
   *     debugRole: 'owner'
   *   }
   * });
   * ```
   */
  constructor(config: GWIClientConfig) {
    this.http = new HttpClient(config);

    // Initialize API namespaces
    this.tenants = new TenantsAPI(this.http);
    this.repos = new RepositoriesAPI(this.http);
    this.members = new MembersAPI(this.http);
    this.runs = new RunsAPI(this.http);
    this.workflows = new WorkflowsAPI(this.http);
    this.user = new UserAPI(this.http);
  }

  /**
   * Update authentication configuration
   *
   * @param auth - New authentication config
   *
   * @example
   * ```typescript
   * client.setAuth({
   *   bearerToken: await getNewFirebaseToken()
   * });
   * ```
   */
  setAuth(auth: AuthConfig): void {
    this.http.setAuth(auth);
  }

  /**
   * Clear authentication
   *
   * @example
   * ```typescript
   * client.clearAuth();
   * ```
   */
  clearAuth(): void {
    this.http.clearAuth();
  }

  /**
   * Check API health
   *
   * @returns Health status
   *
   * @example
   * ```typescript
   * const health = await client.health();
   * console.log(`API is ${health.status}`);
   * ```
   */
  async health(): Promise<HealthResponse> {
    return this.http.request<HealthResponse>('GET', '/health');
  }

  /**
   * Get API metrics (if enabled)
   *
   * @returns Metrics data
   *
   * @example
   * ```typescript
   * const metrics = await client.metrics();
   * console.log(`Total requests: ${metrics.requests.total}`);
   * ```
   */
  async metrics(): Promise<MetricsResponse> {
    return this.http.request<MetricsResponse>('GET', '/metrics');
  }
}
