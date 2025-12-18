/**
 * GWI API Client
 *
 * Phase 12: Frontend API client for self-serve onboarding.
 */

import { auth } from './firebase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  // Get current user's ID token for auth
  const user = auth.currentUser;
  const authHeaders: Record<string, string> = {};

  if (user) {
    const token = await user.getIdToken();
    authHeaders['Authorization'] = `Bearer ${token}`;
    // For development, also send debug headers
    if (import.meta.env.DEV) {
      authHeaders['X-Debug-User'] = user.uid;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, error.error || error.message || 'API request failed', error);
  }

  return response.json();
}

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

// =============================================================================
// User / Signup
// =============================================================================

export interface GwiUser {
  id: string;
  email: string;
  displayName: string;
  githubUserId: number;
  githubLogin: string;
  githubAvatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SignupResponse {
  user: GwiUser;
  message: string;
}

export async function signup(data: {
  email: string;
  displayName: string;
  githubLogin?: string;
  githubUserId?: number;
  githubAvatarUrl?: string;
}): Promise<SignupResponse> {
  return apiFetch<SignupResponse>('/signup', { method: 'POST', body: data });
}

export interface MeResponse {
  user: GwiUser;
  memberships: Array<{
    tenantId: string;
    role: string;
    status: string;
  }>;
}

export async function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>('/me');
}

// =============================================================================
// Tenants / Workspaces
// =============================================================================

export interface Tenant {
  id: string;
  displayName: string;
  githubOrgLogin: string;
  plan: string;
  status: string;
  runsThisMonth: number;
  createdAt: string;
}

export interface TenantsResponse {
  tenants: Array<{
    tenant: Tenant;
    role: string;
    joinedAt: string;
  }>;
  count: number;
}

export async function listTenants(): Promise<TenantsResponse> {
  return apiFetch<TenantsResponse>('/tenants');
}

export interface CreateTenantResponse {
  tenant: Tenant;
  message: string;
}

export async function createTenant(data: {
  displayName: string;
  githubOrgLogin?: string;
  githubOrgId?: number;
}): Promise<CreateTenantResponse> {
  return apiFetch<CreateTenantResponse>('/tenants', { method: 'POST', body: data });
}

// =============================================================================
// Member Invites
// =============================================================================

export interface Invite {
  id: string;
  email: string;
  role: string;
  status: string;
  invitedAt: string;
  inviteToken?: string;
}

export interface InvitesResponse {
  invites: Invite[];
}

export async function listInvites(tenantId: string): Promise<InvitesResponse> {
  return apiFetch<InvitesResponse>(`/tenants/${tenantId}/invites`);
}

export interface CreateInviteResponse {
  invite: Invite;
  message: string;
}

export async function createInvite(
  tenantId: string,
  data: { email: string; role?: string }
): Promise<CreateInviteResponse> {
  return apiFetch<CreateInviteResponse>(`/tenants/${tenantId}/invites`, {
    method: 'POST',
    body: data,
  });
}

export interface AcceptInviteResponse {
  membership: {
    tenantId: string;
    role: string;
  };
  message: string;
}

export async function acceptInvite(inviteToken: string): Promise<AcceptInviteResponse> {
  return apiFetch<AcceptInviteResponse>(`/invites/${inviteToken}/accept`, {
    method: 'POST',
  });
}

// =============================================================================
// Members
// =============================================================================

export interface Member {
  userId: string;
  role: string;
  joinedAt: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
}

export interface MembersResponse {
  members: Member[];
}

export async function listMembers(tenantId: string): Promise<MembersResponse> {
  return apiFetch<MembersResponse>(`/tenants/${tenantId}/members`);
}

// =============================================================================
// GitHub Integration
// =============================================================================

/**
 * Get the GitHub App installation URL
 */
export function getGitHubInstallUrl(): string {
  return `${API_BASE_URL}/github/install`;
}

// =============================================================================
// Phase 28: Usage & Billing
// =============================================================================

export interface UsageAggregate {
  tenant_id: string;
  period_start: string;
  period_end: string;
  total_runs: number;
  total_llm_calls: number;
  total_tokens: {
    input: number;
    output: number;
    total: number;
  };
  total_latency_ms: number;
  total_cost_usd: number;
  by_provider: Record<string, { calls: number; tokens: number; cost_usd: number }>;
  by_model: Record<string, { calls: number; tokens: number; cost_usd: number }>;
  updated_at: string;
}

export interface PlanInfo {
  id: string;
  name: string;
  tier: string;
  price_usd: number;
  token_limit: number;
  run_limit: number;
  rate_limit_rpm: number;
  features: string[];
}

export interface PlanUsageStatus {
  plan: PlanInfo;
  token_usage_percent: number;
  run_usage_percent: number;
  soft_limit_reached: boolean;
  hard_limit_reached: boolean;
  tokens_remaining: number;
  runs_remaining: number;
  period_resets_at: string;
}

export interface UsageResponse {
  aggregate: UsageAggregate;
  status: PlanUsageStatus;
}

export async function getUsage(tenantId: string): Promise<UsageResponse> {
  return apiFetch<UsageResponse>(`/tenants/${tenantId}/usage`);
}

export interface Invoice {
  id: string;
  number: string;
  status: string;
  totalInCents: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  paidAt?: string;
  hostedInvoiceUrl?: string;
}

export interface InvoicesResponse {
  invoices: Invoice[];
}

export async function listInvoices(tenantId: string): Promise<InvoicesResponse> {
  return apiFetch<InvoicesResponse>(`/tenants/${tenantId}/invoices`);
}

export interface CheckoutResponse {
  url: string;
  sessionId: string;
}

export async function createCheckoutSession(
  tenantId: string,
  planId: string,
  interval: 'monthly' | 'yearly'
): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>(`/tenants/${tenantId}/checkout`, {
    method: 'POST',
    body: { planId, interval },
  });
}

export interface BillingPortalResponse {
  url: string;
}

export async function createBillingPortalSession(tenantId: string): Promise<BillingPortalResponse> {
  return apiFetch<BillingPortalResponse>(`/tenants/${tenantId}/billing-portal`, {
    method: 'POST',
  });
}
