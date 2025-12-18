/**
 * Security Types and Utilities for Git With Intent
 *
 * Phase 11: Production-ready security model with:
 * - Role-based access control (RBAC)
 * - Tenant scoping and isolation
 * - Plan-based feature gates
 * - Auth context management
 *
 * @module @gwi/core/security
 */

// =============================================================================
// Role Model
// =============================================================================

/**
 * User roles within a tenant (ordered by privilege level)
 *
 * OWNER: Full access, can delete tenant, manage billing
 * ADMIN: Full operational access, can manage members
 * DEVELOPER: Can trigger runs, view logs, modify repo settings
 * VIEWER: Read-only access to runs and logs
 */
export type Role = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';

/**
 * Role hierarchy for permission checks
 * Higher number = more privileges
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  VIEWER: 0,
  DEVELOPER: 1,
  ADMIN: 2,
  OWNER: 3,
};

/**
 * Check if a role has at least the required privilege level
 */
export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// =============================================================================
// Permission Actions
// =============================================================================

/**
 * Actions that can be performed on resources
 */
export type Action =
  // Tenant actions
  | 'tenant:read'
  | 'tenant:update'
  | 'tenant:delete'
  | 'tenant:billing'
  // Member actions
  | 'member:invite'
  | 'member:remove'
  | 'member:update_role'
  // Repo actions
  | 'repo:read'
  | 'repo:connect'
  | 'repo:disconnect'
  | 'repo:settings'
  // Run actions
  | 'run:read'
  | 'run:create'
  | 'run:cancel'
  // Settings actions
  | 'settings:read'
  | 'settings:update';

/**
 * Permission matrix: which roles can perform which actions
 */
export const PERMISSIONS: Record<Action, Role[]> = {
  // Tenant
  'tenant:read': ['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER'],
  'tenant:update': ['ADMIN', 'OWNER'],
  'tenant:delete': ['OWNER'],
  'tenant:billing': ['OWNER'],
  // Members
  'member:invite': ['ADMIN', 'OWNER'],
  'member:remove': ['ADMIN', 'OWNER'],
  'member:update_role': ['OWNER'],
  // Repos
  'repo:read': ['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER'],
  'repo:connect': ['ADMIN', 'OWNER'],
  'repo:disconnect': ['ADMIN', 'OWNER'],
  'repo:settings': ['DEVELOPER', 'ADMIN', 'OWNER'],
  // Runs
  'run:read': ['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER'],
  'run:create': ['DEVELOPER', 'ADMIN', 'OWNER'],
  'run:cancel': ['DEVELOPER', 'ADMIN', 'OWNER'],
  // Settings
  'settings:read': ['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER'],
  'settings:update': ['ADMIN', 'OWNER'],
};

/**
 * Check if a role can perform an action
 */
export function canPerform(role: Role, action: Action): boolean {
  return PERMISSIONS[action]?.includes(role) ?? false;
}

// =============================================================================
// Auth Context
// =============================================================================

/**
 * Authenticated request context
 */
export interface AuthContext {
  /** Firebase Auth UID */
  userId: string;

  /** User's email (from Firebase Auth) */
  email?: string;

  /** User's display name */
  displayName?: string;

  /** Current tenant ID (if in tenant context) */
  tenantId?: string;

  /** User's role in the current tenant */
  role?: Role;

  /** Is this a service account (Cloud Run)? */
  isServiceAccount: boolean;

  /** Token expiration time */
  expiresAt?: Date;
}

/**
 * Create an unauthenticated context
 */
export function createAnonymousContext(): AuthContext {
  return {
    userId: 'anonymous',
    isServiceAccount: false,
  };
}

/**
 * Create a service account context (for Cloud Run services)
 */
export function createServiceAccountContext(serviceId: string): AuthContext {
  return {
    userId: serviceId,
    isServiceAccount: true,
  };
}

// =============================================================================
// Plan and Billing Types
// =============================================================================

/**
 * Available plan tiers
 */
export type PlanId = 'free' | 'pro' | 'enterprise';

/**
 * Plan configuration with limits and features
 */
export interface PlanConfig {
  id: PlanId;
  name: string;
  description: string;

  /** Resource limits */
  limits: {
    /** Max runs per month */
    maxMonthlyRuns: number;
    /** Max connected repos */
    maxRepos: number;
    /** Max team members */
    maxMembers: number;
    /** Max concurrent runs */
    maxConcurrentRuns: number;
  };

  /** Enabled features */
  features: PlanFeature[];

  /** Price in cents per month (0 = free) */
  priceMonthly: number;
}

/**
 * Feature flags that can be enabled per plan
 */
export type PlanFeature =
  | 'multi-model'           // Use Claude Opus for complex resolutions
  | 'priority-queue'        // Priority run queue
  | 'advanced-analytics'    // Detailed run analytics
  | 'custom-webhooks'       // Custom webhook integrations
  | 'sso'                   // SSO/SAML authentication
  | 'audit-logs'            // Full audit logging
  | 'api-access'            // API access for integrations
  | 'auto-push'             // Auto-push resolved changes
  | 'support-priority';     // Priority support

/**
 * Default plan configurations
 */
export const PLAN_CONFIGS: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Perfect for trying out Git With Intent',
    limits: {
      maxMonthlyRuns: 50,
      maxRepos: 3,
      maxMembers: 3,
      maxConcurrentRuns: 1,
    },
    features: ['api-access'],
    priceMonthly: 0,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'For professional teams',
    limits: {
      maxMonthlyRuns: 500,
      maxRepos: 20,
      maxMembers: 15,
      maxConcurrentRuns: 5,
    },
    features: [
      'multi-model',
      'advanced-analytics',
      'custom-webhooks',
      'api-access',
      'auto-push',
      'audit-logs',
    ],
    priceMonthly: 4900, // $49/month
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations with custom needs',
    limits: {
      maxMonthlyRuns: 10000,
      maxRepos: 200,
      maxMembers: 100,
      maxConcurrentRuns: 20,
    },
    features: [
      'multi-model',
      'priority-queue',
      'advanced-analytics',
      'custom-webhooks',
      'sso',
      'audit-logs',
      'api-access',
      'auto-push',
      'support-priority',
    ],
    priceMonthly: 29900, // $299/month
  },
};

/**
 * Get plan config by ID
 */
export function getPlanConfig(planId: PlanId): PlanConfig {
  return PLAN_CONFIGS[planId] ?? PLAN_CONFIGS.free;
}

/**
 * Check if a plan has a specific feature
 */
export function planHasFeature(planId: PlanId, feature: PlanFeature): boolean {
  const config = getPlanConfig(planId);
  return config.features.includes(feature);
}

// =============================================================================
// Plan Limit Enforcement
// =============================================================================

/**
 * Plan limit check result
 */
export interface PlanLimitCheck {
  allowed: boolean;
  reason?: string;
  currentUsage?: number;
  limit?: number;
}

/**
 * Check if a tenant can create a new run
 */
export function checkRunLimit(
  runsThisMonth: number,
  planId: PlanId
): PlanLimitCheck {
  const config = getPlanConfig(planId);
  const limit = config.limits.maxMonthlyRuns;

  if (runsThisMonth >= limit) {
    return {
      allowed: false,
      reason: `Monthly run limit reached (${limit} runs/month on ${config.name} plan)`,
      currentUsage: runsThisMonth,
      limit,
    };
  }

  return {
    allowed: true,
    currentUsage: runsThisMonth,
    limit,
  };
}

/**
 * Check if a tenant can connect more repos
 */
export function checkRepoLimit(
  currentRepos: number,
  planId: PlanId
): PlanLimitCheck {
  const config = getPlanConfig(planId);
  const limit = config.limits.maxRepos;

  if (currentRepos >= limit) {
    return {
      allowed: false,
      reason: `Repository limit reached (${limit} repos on ${config.name} plan)`,
      currentUsage: currentRepos,
      limit,
    };
  }

  return {
    allowed: true,
    currentUsage: currentRepos,
    limit,
  };
}

/**
 * Check if a tenant can add more members
 */
export function checkMemberLimit(
  currentMembers: number,
  planId: PlanId
): PlanLimitCheck {
  const config = getPlanConfig(planId);
  const limit = config.limits.maxMembers;

  if (currentMembers >= limit) {
    return {
      allowed: false,
      reason: `Member limit reached (${limit} members on ${config.name} plan)`,
      currentUsage: currentMembers,
      limit,
    };
  }

  return {
    allowed: true,
    currentUsage: currentMembers,
    limit,
  };
}

// =============================================================================
// Tenant Membership
// =============================================================================

/**
 * Enhanced membership type with role
 */
export interface TenantMembership {
  userId: string;
  tenantId: string;
  role: Role;
  invitedBy?: string;
  invitedAt?: Date;
  acceptedAt?: Date;
  status: 'active' | 'pending' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Rejection Reasons (for state logging)
// =============================================================================

/**
 * Standard rejection reasons for audit logging
 */
export type RejectionReason =
  | 'PLAN_LIMIT_RUNS'
  | 'PLAN_LIMIT_REPOS'
  | 'PLAN_LIMIT_MEMBERS'
  | 'PLAN_FEATURE_DISABLED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'TENANT_SUSPENDED'
  | 'TENANT_NOT_FOUND'
  | 'INVALID_REQUEST';

/**
 * Create a rejection event for logging
 */
export function createRejectionEvent(
  tenantId: string,
  reason: RejectionReason,
  details?: string
): {
  type: 'run_rejected';
  tenantId: string;
  reason: RejectionReason;
  details?: string;
  timestamp: string;
} {
  return {
    type: 'run_rejected',
    tenantId,
    reason,
    details,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// Beta Program (Phase 12)
// =============================================================================

/**
 * Beta access modes
 */
export type BetaAccessMode = 'open' | 'invite_only' | 'closed';

/**
 * Beta program configuration
 */
export interface BetaConfig {
  /** Whether beta signup is enabled */
  enabled: boolean;
  /** Access mode for beta signups */
  accessMode: BetaAccessMode;
  /** List of valid beta invite codes (when accessMode is 'invite_only') */
  validInviteCodes?: string[];
  /** Features enabled for beta users */
  betaFeatures: BetaFeature[];
  /** Max beta users allowed (0 = unlimited) */
  maxBetaUsers: number;
  /** Beta period end date */
  betaEndsAt?: Date;
}

/**
 * Beta-only features
 */
export type BetaFeature =
  | 'early-access'           // Access to beta features before GA
  | 'extended-limits'        // Higher limits during beta
  | 'direct-support'         // Direct access to support channel
  | 'feedback-priority';     // Prioritized feedback handling

/**
 * Default beta configuration
 */
export const DEFAULT_BETA_CONFIG: BetaConfig = {
  enabled: true,
  accessMode: 'invite_only',
  validInviteCodes: ['GWIBETA2025', 'EARLYBIRD', 'FOUNDER50'],
  betaFeatures: ['early-access', 'extended-limits', 'direct-support', 'feedback-priority'],
  maxBetaUsers: 500,
};

/**
 * Validate a beta invite code
 */
export function validateBetaInviteCode(
  code: string,
  config: BetaConfig = DEFAULT_BETA_CONFIG
): { valid: boolean; reason?: string } {
  if (!config.enabled) {
    return { valid: false, reason: 'Beta program is not active' };
  }

  if (config.accessMode === 'open') {
    return { valid: true };
  }

  if (config.accessMode === 'closed') {
    return { valid: false, reason: 'Beta program is closed' };
  }

  // invite_only mode
  if (!config.validInviteCodes?.length) {
    return { valid: false, reason: 'No invite codes configured' };
  }

  const normalizedCode = code.trim().toUpperCase();
  const isValid = config.validInviteCodes.some(
    c => c.toUpperCase() === normalizedCode
  );

  if (!isValid) {
    return { valid: false, reason: 'Invalid invite code' };
  }

  return { valid: true };
}

/**
 * Check if beta signup is allowed
 */
export function canSignupForBeta(
  currentBetaUsers: number,
  config: BetaConfig = DEFAULT_BETA_CONFIG
): { allowed: boolean; reason?: string } {
  if (!config.enabled) {
    return { allowed: false, reason: 'Beta program is not active' };
  }

  if (config.accessMode === 'closed') {
    return { allowed: false, reason: 'Beta program is closed to new signups' };
  }

  if (config.maxBetaUsers > 0 && currentBetaUsers >= config.maxBetaUsers) {
    return { allowed: false, reason: 'Beta is full. Join the waitlist.' };
  }

  if (config.betaEndsAt && new Date() > config.betaEndsAt) {
    return { allowed: false, reason: 'Beta period has ended' };
  }

  return { allowed: true };
}

/**
 * Tenant beta status
 */
export interface TenantBetaStatus {
  /** Whether tenant is a beta participant */
  isBeta: boolean;
  /** When beta access was granted */
  betaGrantedAt?: Date;
  /** Invite code used (for tracking) */
  inviteCode?: string;
  /** Beta features enabled for this tenant */
  betaFeatures: BetaFeature[];
}

// =============================================================================
// Secret Provider (Phase 12)
// =============================================================================

/**
 * Secret reference format: provider://path/to/secret
 * Examples:
 * - env://GITHUB_TOKEN (environment variable)
 * - gcp://projects/my-project/secrets/my-secret/versions/latest
 * - dev://api_key (local dev file)
 */
export type SecretRef = string;

/**
 * Secret provider interface for resolving secret references
 */
export interface SecretProvider {
  /** Provider name for identification */
  readonly name: string;

  /**
   * Get a secret value by reference
   * Returns null if secret not found
   */
  get(ref: SecretRef): Promise<string | null>;

  /**
   * Set/update a secret (admin-only path)
   * May throw if provider is read-only
   */
  set(ref: SecretRef, value: string): Promise<void>;

  /**
   * Check if a secret exists
   */
  exists(ref: SecretRef): Promise<boolean>;

  /**
   * List available secret refs (returns refs, not values)
   */
  list(): Promise<SecretRef[]>;

  /**
   * Delete a secret
   */
  delete(ref: SecretRef): Promise<void>;
}

/**
 * Dev secret provider that stores secrets in local files
 *
 * WARNING: This is for development only. Secrets are stored in plain text.
 * Never use in production.
 *
 * Location: .gwi/secrets/{ref}.secret
 */
export class DevSecretProvider implements SecretProvider {
  readonly name = 'dev';
  private secretsDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.secretsDir = `${baseDir}/.gwi/secrets`;
    console.warn(
      '[DevSecretProvider] WARNING: Using development secret provider. ' +
      'Secrets are stored in plain text. DO NOT USE IN PRODUCTION.'
    );
  }

  async get(ref: SecretRef): Promise<string | null> {
    const path = this.refToPath(ref);
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(path, 'utf-8');
      return content.trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async set(ref: SecretRef, value: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = this.refToPath(ref);
    const dir = path.substring(0, path.lastIndexOf('/'));

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path, value, { mode: 0o600 });

    console.log(`[DevSecretProvider] Secret stored: ${this.redactRef(ref)}`);
  }

  async exists(ref: SecretRef): Promise<boolean> {
    const path = this.refToPath(ref);
    try {
      const fs = await import('fs/promises');
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async list(): Promise<SecretRef[]> {
    try {
      const fs = await import('fs/promises');
      const files = await fs.readdir(this.secretsDir, { recursive: true });
      return files
        .filter((f): f is string => typeof f === 'string' && f.endsWith('.secret'))
        .map(f => `dev://${f.replace('.secret', '')}`);
    } catch {
      return [];
    }
  }

  async delete(ref: SecretRef): Promise<void> {
    const fs = await import('fs/promises');
    const path = this.refToPath(ref);
    await fs.unlink(path);
    console.log(`[DevSecretProvider] Secret deleted: ${this.redactRef(ref)}`);
  }

  private refToPath(ref: SecretRef): string {
    // Handle both formats: "dev://key" and plain "key"
    const key = ref.startsWith('dev://') ? ref.substring(6) : ref;
    return `${this.secretsDir}/${key}.secret`;
  }

  private redactRef(ref: SecretRef): string {
    const key = ref.startsWith('dev://') ? ref.substring(6) : ref;
    return `dev://${key.substring(0, 4)}***`;
  }
}

/**
 * Environment variable secret provider
 *
 * Refs: env://VARIABLE_NAME
 * Read-only: cannot set secrets via this provider
 */
export class EnvSecretProvider implements SecretProvider {
  readonly name = 'env';

  async get(ref: SecretRef): Promise<string | null> {
    const varName = ref.startsWith('env://') ? ref.substring(6) : ref;
    return process.env[varName] ?? null;
  }

  async set(_ref: SecretRef, _value: string): Promise<void> {
    throw new Error('EnvSecretProvider is read-only. Cannot set environment variables.');
  }

  async exists(ref: SecretRef): Promise<boolean> {
    const varName = ref.startsWith('env://') ? ref.substring(6) : ref;
    return varName in process.env;
  }

  async list(): Promise<SecretRef[]> {
    // Only list common secret-like variables, not all env vars
    const secretVars = [
      'GITHUB_TOKEN',
      'ANTHROPIC_API_KEY',
      'GOOGLE_AI_API_KEY',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
    ];
    return secretVars
      .filter(v => v in process.env)
      .map(v => `env://${v}`);
  }

  async delete(_ref: SecretRef): Promise<void> {
    throw new Error('EnvSecretProvider is read-only. Cannot delete environment variables.');
  }
}

/**
 * GCP Secret Manager provider
 *
 * Refs: gcp://projects/{project}/secrets/{name}/versions/{version}
 * Or short form: gcp://{secret-name} (uses default project and latest version)
 */
export class GCPSecretProvider implements SecretProvider {
  readonly name = 'gcp';
  private projectId: string;
  private client: unknown | null = null;

  constructor(projectId?: string) {
    this.projectId = projectId || process.env.GCP_PROJECT_ID || '';
  }

  private async getClient(): Promise<unknown> {
    if (!this.client) {
      try {
        // Dynamic import with type assertion to avoid TS module resolution
        const secretManager = await import('@google-cloud/secret-manager' as string);
        const SecretManagerServiceClient = secretManager.SecretManagerServiceClient;
        this.client = new SecretManagerServiceClient();
      } catch {
        throw new Error(
          'GCP Secret Manager client not available. ' +
          'Install @google-cloud/secret-manager or use DevSecretProvider for development.'
        );
      }
    }
    return this.client;
  }

  async get(ref: SecretRef): Promise<string | null> {
    const secretName = this.parseRef(ref);

    try {
      const client = await this.getClient() as {
        accessSecretVersion: (request: { name: string }) => Promise<[{ payload?: { data?: Uint8Array | string } }]>;
      };
      const [response] = await client.accessSecretVersion({ name: secretName });
      const payload = response.payload?.data;

      if (!payload) {
        return null;
      }

      if (typeof payload === 'string') {
        return payload;
      }
      // Handle Uint8Array (Buffer-like)
      return new TextDecoder().decode(payload);
    } catch (error) {
      const err = error as { code?: number };
      if (err.code === 5) {
        // NOT_FOUND
        return null;
      }
      throw error;
    }
  }

  async set(ref: SecretRef, value: string): Promise<void> {
    const parts = this.parseRefParts(ref);
    const client = await this.getClient() as {
      createSecret: (request: {
        parent: string;
        secretId: string;
        secret: { replication: { automatic: Record<string, never> } };
      }) => Promise<unknown>;
      addSecretVersion: (request: {
        parent: string;
        payload: { data: Uint8Array };
      }) => Promise<unknown>;
    };

    // Create secret if it doesn't exist
    try {
      await client.createSecret({
        parent: `projects/${parts.project}`,
        secretId: parts.secretName,
        secret: {
          replication: {
            automatic: {},
          },
        },
      });
    } catch (error) {
      const err = error as { code?: number };
      // ALREADY_EXISTS is ok
      if (err.code !== 6) {
        throw error;
      }
    }

    // Add new version
    await client.addSecretVersion({
      parent: `projects/${parts.project}/secrets/${parts.secretName}`,
      payload: {
        data: new TextEncoder().encode(value),
      },
    });

    console.log(`[GCPSecretProvider] Secret version added: ${this.redactRef(ref)}`);
  }

  async exists(ref: SecretRef): Promise<boolean> {
    const result = await this.get(ref);
    return result !== null;
  }

  async list(): Promise<SecretRef[]> {
    if (!this.projectId) {
      return [];
    }

    try {
      const client = await this.getClient() as {
        listSecrets: (request: { parent: string }) => Promise<[Array<{ name?: string }>]>;
      };
      const [secrets] = await client.listSecrets({
        parent: `projects/${this.projectId}`,
      });

      return secrets.map(s => {
        const name = s.name?.split('/').pop() || '';
        return `gcp://${name}`;
      });
    } catch {
      return [];
    }
  }

  async delete(ref: SecretRef): Promise<void> {
    const parts = this.parseRefParts(ref);
    const client = await this.getClient() as {
      deleteSecret: (request: { name: string }) => Promise<void>;
    };

    await client.deleteSecret({
      name: `projects/${parts.project}/secrets/${parts.secretName}`,
    });

    console.log(`[GCPSecretProvider] Secret deleted: ${this.redactRef(ref)}`);
  }

  private parseRef(ref: SecretRef): string {
    // Full format: gcp://projects/{project}/secrets/{name}/versions/{version}
    if (ref.includes('/projects/')) {
      return ref.replace('gcp://', '');
    }

    // Short format: gcp://{secret-name}
    const secretName = ref.startsWith('gcp://') ? ref.substring(6) : ref;
    return `projects/${this.projectId}/secrets/${secretName}/versions/latest`;
  }

  private parseRefParts(ref: SecretRef): { project: string; secretName: string; version: string } {
    const fullPath = this.parseRef(ref);
    const parts = fullPath.match(/projects\/([^/]+)\/secrets\/([^/]+)(?:\/versions\/([^/]+))?/);

    if (!parts) {
      throw new Error(`Invalid GCP secret ref: ${ref}`);
    }

    return {
      project: parts[1],
      secretName: parts[2],
      version: parts[3] || 'latest',
    };
  }

  private redactRef(ref: SecretRef): string {
    const parts = this.parseRefParts(ref);
    return `gcp://***/${parts.secretName.substring(0, 4)}***`;
  }
}

/**
 * Composite secret provider that routes to the appropriate provider based on ref prefix
 */
export class CompositeSecretProvider implements SecretProvider {
  readonly name = 'composite';
  private providers: Map<string, SecretProvider>;
  private defaultProvider: SecretProvider;

  constructor(providers: SecretProvider[], defaultProvider?: SecretProvider) {
    this.providers = new Map();
    for (const p of providers) {
      this.providers.set(p.name, p);
    }
    this.defaultProvider = defaultProvider || providers[0];
  }

  private getProviderForRef(ref: SecretRef): SecretProvider {
    // Parse provider prefix: "gcp://..." or "env://..." or "dev://..."
    const match = ref.match(/^([a-z]+):\/\//);
    if (match) {
      const providerName = match[1];
      const provider = this.providers.get(providerName);
      if (provider) {
        return provider;
      }
    }
    return this.defaultProvider;
  }

  async get(ref: SecretRef): Promise<string | null> {
    return this.getProviderForRef(ref).get(ref);
  }

  async set(ref: SecretRef, value: string): Promise<void> {
    return this.getProviderForRef(ref).set(ref, value);
  }

  async exists(ref: SecretRef): Promise<boolean> {
    return this.getProviderForRef(ref).exists(ref);
  }

  async list(): Promise<SecretRef[]> {
    const allRefs: SecretRef[] = [];
    for (const provider of this.providers.values()) {
      const refs = await provider.list();
      allRefs.push(...refs);
    }
    return allRefs;
  }

  async delete(ref: SecretRef): Promise<void> {
    return this.getProviderForRef(ref).delete(ref);
  }
}

// =============================================================================
// Secret Provider Singleton
// =============================================================================

let secretProviderInstance: SecretProvider | null = null;

/**
 * Get the secret provider based on environment
 *
 * Production: GCP Secret Manager (when GCP_PROJECT_ID is set)
 * Development: Dev file-based provider with env fallback
 */
export function getSecretProvider(): SecretProvider {
  if (secretProviderInstance) {
    return secretProviderInstance;
  }

  const isProduction = process.env.NODE_ENV === 'production' ||
    process.env.GWI_STORE_BACKEND === 'firestore';

  if (isProduction && process.env.GCP_PROJECT_ID) {
    // Production: Use GCP Secret Manager with env fallback
    secretProviderInstance = new CompositeSecretProvider([
      new GCPSecretProvider(process.env.GCP_PROJECT_ID),
      new EnvSecretProvider(),
    ]);
  } else {
    // Development: Use dev file provider with env fallback
    secretProviderInstance = new CompositeSecretProvider([
      new DevSecretProvider(),
      new EnvSecretProvider(),
    ], new EnvSecretProvider()); // Default to env for unqualified refs
  }

  return secretProviderInstance;
}

/**
 * Reset secret provider singleton (for testing)
 */
export function resetSecretProvider(): void {
  secretProviderInstance = null;
}

/**
 * Resolve secret refs in a config object
 * Replaces all values that look like secret refs with their actual values
 * IMPORTANT: Never log the output of this function
 */
export async function resolveSecretRefs(
  config: Record<string, unknown>,
  secretRefs: Record<string, string>
): Promise<Record<string, unknown>> {
  const provider = getSecretProvider();
  const resolved: Record<string, unknown> = { ...config };

  for (const [key, ref] of Object.entries(secretRefs)) {
    const value = await provider.get(ref);
    if (value !== null) {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Redact secret values from an object for safe logging
 * Replaces any string values that look like secrets with [REDACTED]
 */
export function redactSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const secretPatterns = [
    /^sk[-_]/i,          // Stripe keys
    /^ghp_/i,            // GitHub PAT
    /^gho_/i,            // GitHub OAuth
    /^whsec_/i,          // Webhook secrets
    /^AIza/i,            // Google API keys
    /^sk-ant-/i,         // Anthropic keys
    /^xoxb-/i,           // Slack bot tokens
    /^xoxp-/i,           // Slack user tokens
  ];

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      const looksLikeSecret = secretPatterns.some(p => p.test(value)) ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('apikey');

      result[key] = looksLikeSecret ? '[REDACTED]' : value;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSecrets(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

// =============================================================================
// Webhook Signature Verification (Phase 15)
// =============================================================================

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Webhook verification result
 */
export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
  signatureType?: 'sha256' | 'sha1';
}

/**
 * Verify GitHub webhook signature (HMAC SHA-256)
 *
 * GitHub sends the signature in the `X-Hub-Signature-256` header
 * Format: sha256=<hex-encoded-signature>
 *
 * @param payload - Raw request body as string or Buffer
 * @param signature - Value of X-Hub-Signature-256 header
 * @param secret - Webhook secret configured in GitHub
 * @returns Verification result
 */
export function verifyGitHubWebhookSignature(
  payload: string | Buffer,
  signature: string | null | undefined,
  secret: string
): WebhookVerificationResult {
  if (!signature) {
    return {
      valid: false,
      error: 'Missing X-Hub-Signature-256 header',
    };
  }

  if (!secret) {
    return {
      valid: false,
      error: 'Webhook secret not configured',
    };
  }

  // Parse signature header
  const [algorithm, receivedSignature] = signature.split('=');

  if (algorithm !== 'sha256') {
    // Also support legacy sha1 for backwards compatibility
    if (algorithm !== 'sha1') {
      return {
        valid: false,
        error: `Unsupported signature algorithm: ${algorithm}`,
      };
    }
  }

  if (!receivedSignature) {
    return {
      valid: false,
      error: 'Malformed signature header',
    };
  }

  // Compute expected signature
  const payloadBuffer = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  const hmac = createHmac(algorithm as 'sha256' | 'sha1', secret);
  hmac.update(payloadBuffer);
  const expectedSignature = hmac.digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  const receivedBuffer = Buffer.from(receivedSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (receivedBuffer.length !== expectedBuffer.length) {
    return {
      valid: false,
      error: 'Signature length mismatch',
    };
  }

  const isValid = timingSafeEqual(receivedBuffer, expectedBuffer);

  return {
    valid: isValid,
    signatureType: algorithm as 'sha256' | 'sha1',
    error: isValid ? undefined : 'Signature verification failed',
  };
}

/**
 * Verify Stripe webhook signature
 *
 * Stripe sends the signature in the `Stripe-Signature` header
 * Format: t=timestamp,v1=signature[,v0=signature]
 *
 * @param payload - Raw request body as string
 * @param signature - Value of Stripe-Signature header
 * @param secret - Webhook secret from Stripe dashboard (whsec_...)
 * @param toleranceSeconds - Max age of webhook in seconds (default: 300 = 5 min)
 * @returns Verification result
 */
export function verifyStripeWebhookSignature(
  payload: string,
  signature: string | null | undefined,
  secret: string,
  toleranceSeconds = 300
): WebhookVerificationResult {
  if (!signature) {
    return {
      valid: false,
      error: 'Missing Stripe-Signature header',
    };
  }

  if (!secret) {
    return {
      valid: false,
      error: 'Webhook secret not configured',
    };
  }

  // Parse Stripe signature header
  const signatureParts: Record<string, string> = {};
  for (const part of signature.split(',')) {
    const [key, value] = part.split('=');
    if (key && value) {
      signatureParts[key] = value;
    }
  }

  const timestamp = signatureParts.t;
  const receivedSignature = signatureParts.v1;

  if (!timestamp || !receivedSignature) {
    return {
      valid: false,
      error: 'Malformed Stripe-Signature header',
    };
  }

  // Check timestamp tolerance
  const timestampInt = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - timestampInt) > toleranceSeconds) {
    return {
      valid: false,
      error: `Webhook timestamp too old (${Math.abs(now - timestampInt)}s > ${toleranceSeconds}s tolerance)`,
    };
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = createHmac('sha256', secret);
  hmac.update(signedPayload);
  const expectedSignature = hmac.digest('hex');

  // Use timing-safe comparison
  const receivedBuffer = Buffer.from(receivedSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (receivedBuffer.length !== expectedBuffer.length) {
    return {
      valid: false,
      error: 'Signature length mismatch',
    };
  }

  const isValid = timingSafeEqual(receivedBuffer, expectedBuffer);

  return {
    valid: isValid,
    signatureType: 'sha256',
    error: isValid ? undefined : 'Signature verification failed',
  };
}

/**
 * Generic HMAC signature verification
 *
 * @param payload - Raw request body
 * @param signature - Expected signature (hex-encoded)
 * @param secret - Signing secret
 * @param algorithm - Hash algorithm (default: sha256)
 * @returns Verification result
 */
export function verifyHmacSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha1' | 'sha512' = 'sha256'
): WebhookVerificationResult {
  if (!signature) {
    return {
      valid: false,
      error: 'Missing signature',
    };
  }

  if (!secret) {
    return {
      valid: false,
      error: 'Secret not configured',
    };
  }

  // Compute expected signature
  const payloadBuffer = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  const hmac = createHmac(algorithm, secret);
  hmac.update(payloadBuffer);
  const expectedSignature = hmac.digest('hex');

  // Use timing-safe comparison
  const receivedBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (receivedBuffer.length !== expectedBuffer.length) {
    return {
      valid: false,
      error: 'Signature length mismatch',
    };
  }

  const isValid = timingSafeEqual(receivedBuffer, expectedBuffer);

  return {
    valid: isValid,
    signatureType: algorithm === 'sha1' ? 'sha1' : 'sha256',
    error: isValid ? undefined : 'Signature verification failed',
  };
}

/**
 * Create HMAC signature for outgoing webhooks
 *
 * @param payload - Request body to sign
 * @param secret - Signing secret
 * @param algorithm - Hash algorithm (default: sha256)
 * @returns Hex-encoded signature
 */
export function createHmacSignature(
  payload: string | Buffer,
  secret: string,
  algorithm: 'sha256' | 'sha1' | 'sha512' = 'sha256'
): string {
  const payloadBuffer = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  const hmac = createHmac(algorithm, secret);
  hmac.update(payloadBuffer);
  return hmac.digest('hex');
}

/**
 * Create GitHub-style signature header value
 *
 * @param payload - Request body to sign
 * @param secret - Signing secret
 * @returns Signature header value (sha256=<signature>)
 */
export function createGitHubSignatureHeader(
  payload: string | Buffer,
  secret: string
): string {
  const signature = createHmacSignature(payload, secret, 'sha256');
  return `sha256=${signature}`;
}

// =============================================================================
// RBAC Enforcement (Phase 24)
// =============================================================================

export {
  // Types
  type RBACRole,
  type RBACAction,
  type RBACContext,
  type RBACCheckResult,
  type RBACAuditEventType,
  type RBACAuditEventData,

  // Role hierarchy
  RBAC_ROLE_HIERARCHY,
  RBAC_PERMISSIONS,

  // Functions
  hasMinimumRBACRole,
  canPerformRBAC,
  requireRole,
  requirePermission,
  requireTenant,
  requireTenantPermission,

  // Middleware
  expressRequireRole,
  expressRequirePermission,
  expressRequireAuth,

  // High-risk actions
  HIGH_RISK_ACTIONS,
  isHighRiskAction,
  enforceHighRiskAction,
} from './rbac.js';

// =============================================================================
// Security Audit (Phase 24)
// =============================================================================

export * from './audit/index.js';

// =============================================================================
// Secrets Posture (Phase 24)
// =============================================================================

export {
  // Patterns
  SECRET_PATTERNS,
  SECRET_KEY_PATTERNS,
  SENSITIVE_ENV_VARS,

  // Types
  type SecretScanResult,
  type SecretFinding,

  // Scanning
  scanForSecrets,
  scanObjectForSecrets,

  // Redaction
  redactSecret,
  redactObjectSecrets,
  redactStringSecrets,

  // Guardrails
  SecretLeakageError,
  assertNoSecrets,
  withRedactedSecrets,

  // Safe utilities
  safeStringify,
  getSafeEnvVars,
} from './secrets.js';
