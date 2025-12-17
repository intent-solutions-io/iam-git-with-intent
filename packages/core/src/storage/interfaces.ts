/**
 * Storage Interfaces for Git With Intent
 *
 * These interfaces define the contract for all persistence operations.
 * Implementations can use SQLite, Turso, PostgreSQL, or Firestore.
 *
 * The default implementation uses SQLite for maximum portability.
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * PR metadata and state
 */
export interface PRMetadata {
  id: string;
  url: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  state: 'open' | 'closed' | 'merged';
  mergeable: boolean | null;
  mergeableState: string | null;
  hasConflicts: boolean;
  filesChanged: number;
  additions: number;
  deletions: number;
  createdAt: Date;
  updatedAt: Date;
  fetchedAt: Date;
}

/**
 * Filter for listing PRs
 */
export interface PRFilter {
  owner?: string;
  repo?: string;
  state?: 'open' | 'closed' | 'merged';
  hasConflicts?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Conflict information for a single file
 */
export interface ConflictInfo {
  file: string;
  baseContent: string;
  oursContent: string;
  theirsContent: string;
  conflictMarkers: string;
  complexity: number;
}

/**
 * Multi-agent run types
 */
export type RunType = 'triage' | 'plan' | 'resolve' | 'review' | 'autopilot';

/**
 * Run status
 */
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Step status
 */
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * A single step in a multi-agent run
 */
export interface RunStep {
  id: string;
  runId: string;
  agent: string;
  status: StepStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  tokensUsed?: { input: number; output: number };
}

/**
 * A multi-agent run (pipeline execution)
 */
export interface Run {
  id: string;
  prId: string;
  prUrl: string;
  type: RunType;
  status: RunStatus;
  currentStep?: string;
  steps: RunStep[];
  result?: unknown;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  durationMs?: number;
}

/**
 * Run result summary
 */
export interface RunResult {
  success: boolean;
  summary?: string;
  changes?: Array<{ file: string; action: string }>;
  warnings?: string[];
  humanReviewRequired?: boolean;
}

// =============================================================================
// SaaS Multi-Tenant Types (Phase 2)
// =============================================================================

/**
 * User roles within a tenant
 */
export type TenantRole = 'owner' | 'admin' | 'member';

/**
 * Membership status
 */
export type MembershipStatus = 'active' | 'invited' | 'suspended';

/**
 * Plan tiers
 */
export type PlanTier = 'free' | 'team' | 'pro' | 'enterprise';

/**
 * Risk mode for run execution
 */
export type RiskMode = 'comment_only' | 'suggest_patch' | 'auto_patch' | 'auto_push';

/**
 * Tenant status
 */
export type TenantStatus = 'active' | 'suspended' | 'deactivated';

/**
 * Tenant (GitHub org installation)
 */
export interface Tenant {
  id: string;                    // e.g., "gh-org-12345678"
  githubOrgId: number;
  githubOrgLogin: string;
  displayName: string;

  // GitHub App Installation
  installationId: number;
  installedAt: Date;
  installedBy: string;           // userId

  // Status (Phase 11: for suspension/deactivation)
  status: TenantStatus;

  // Plan
  plan: PlanTier;
  planLimits: {
    runsPerMonth: number;
    reposMax: number;
    membersMax: number;
  };

  // Settings
  settings: TenantSettings;

  // Usage
  runsThisMonth: number;
  lastRunAt?: Date;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Tenant settings
 */
export interface TenantSettings {
  defaultRiskMode: RiskMode;
  defaultTriageModel: string;
  defaultCodeModel: string;
  complexityThreshold: number;   // 1-5, for model escalation
  autoRunOnConflict: boolean;
  autoRunOnPrOpen: boolean;
}

/**
 * Connected repository
 */
export interface TenantRepo {
  id: string;                    // e.g., "gh-repo-987654321"
  tenantId: string;
  githubRepoId: number;
  githubFullName: string;        // e.g., "org/repo-name"
  displayName: string;

  // Status
  enabled: boolean;
  lastSyncAt?: Date;

  // Settings (override tenant defaults)
  settings: RepoSettings;

  // Stats
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  lastRunId?: string;

  // Timestamps
  addedAt: Date;
  updatedAt: Date;
}

/**
 * Repository settings (can override tenant defaults)
 */
export interface RepoSettings {
  riskModeOverride?: RiskMode;
  autoTriage: boolean;
  autoReview: boolean;
  autoResolve: boolean;
  branchPatterns?: string[];
}

/**
 * User profile
 */
export interface User {
  id: string;                    // Firebase Auth UID
  githubUserId: number;
  githubLogin: string;
  githubAvatarUrl?: string;
  displayName: string;
  email: string;

  // Preferences
  preferences: UserPreferences;

  // Timestamps
  createdAt: Date;
  lastLoginAt: Date;
  updatedAt: Date;
}

/**
 * User preferences
 */
export interface UserPreferences {
  defaultTenantId?: string;
  notificationsEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
}

/**
 * User-Tenant membership
 */
export interface Membership {
  id: string;                    // e.g., "user123_gh-org-456"
  userId: string;
  tenantId: string;
  role: TenantRole;
  githubRole?: string;
  status: MembershipStatus;
  invitedBy?: string;
  invitedAt?: Date;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * SaaS Run (extends base Run with tenant context)
 */
export interface SaaSRun extends Run {
  tenantId: string;
  repoId: string;
  trigger: {
    source: 'ui' | 'cli' | 'webhook' | 'scheduled';
    userId?: string;
    webhookEventId?: string;
    commandText?: string;
  };
  a2aCorrelationId?: string;
  tokensUsed?: {
    triage: number;
    plan: number;
    code: number;
    review: number;
    total: number;
  };
}

// =============================================================================
// Storage Interfaces
// =============================================================================

/**
 * Store for PR metadata and conflict data
 */
export interface PRStore {
  /**
   * Save or update a PR
   */
  savePR(pr: PRMetadata): Promise<void>;

  /**
   * Get a PR by its internal ID
   */
  getPR(id: string): Promise<PRMetadata | null>;

  /**
   * Get a PR by its GitHub URL
   */
  getPRByUrl(url: string): Promise<PRMetadata | null>;

  /**
   * List PRs with optional filtering
   */
  listPRs(filter?: PRFilter): Promise<PRMetadata[]>;

  /**
   * Delete a PR and all associated data
   */
  deletePR(id: string): Promise<void>;

  /**
   * Save conflict information for a PR
   */
  saveConflicts(prId: string, conflicts: ConflictInfo[]): Promise<void>;

  /**
   * Get conflict information for a PR
   */
  getConflicts(prId: string): Promise<ConflictInfo[]>;
}

/**
 * Store for multi-agent run tracking
 */
export interface RunStore {
  /**
   * Create a new run
   */
  createRun(prId: string, prUrl: string, type: RunType): Promise<Run>;

  /**
   * Get a run by ID
   */
  getRun(runId: string): Promise<Run | null>;

  /**
   * Get the latest run for a PR
   */
  getLatestRun(prId: string): Promise<Run | null>;

  /**
   * List all runs for a PR
   */
  listRuns(prId: string, limit?: number): Promise<Run[]>;

  /**
   * Update run status
   */
  updateRunStatus(runId: string, status: RunStatus): Promise<void>;

  /**
   * Add a step to a run
   */
  addStep(runId: string, agent: string): Promise<RunStep>;

  /**
   * Update a step
   */
  updateStep(runId: string, stepId: string, update: Partial<RunStep>): Promise<void>;

  /**
   * Get all steps for a run
   */
  getSteps(runId: string): Promise<RunStep[]>;

  /**
   * Complete a run successfully
   */
  completeRun(runId: string, result: RunResult): Promise<void>;

  /**
   * Fail a run
   */
  failRun(runId: string, error: string): Promise<void>;

  /**
   * Cancel a run
   */
  cancelRun(runId: string): Promise<void>;
}

/**
 * Store for user/project settings
 */
export interface SettingsStore {
  /**
   * Get a setting value
   */
  get<T>(key: string, defaultValue?: T): Promise<T | null>;

  /**
   * Set a setting value
   */
  set<T>(key: string, value: T): Promise<void>;

  /**
   * Delete a setting
   */
  delete(key: string): Promise<void>;

  /**
   * List all settings (optionally filtered by prefix)
   */
  list(prefix?: string): Promise<Record<string, unknown>>;
}

/**
 * Store for multi-tenant data (SaaS)
 */
export interface TenantStore {
  // Tenant CRUD
  createTenant(tenant: Omit<Tenant, 'createdAt' | 'updatedAt'>): Promise<Tenant>;
  getTenant(tenantId: string): Promise<Tenant | null>;
  updateTenant(tenantId: string, update: Partial<Tenant>): Promise<Tenant>;
  deleteTenant(tenantId: string): Promise<void>;

  // Repo management
  addRepo(tenantId: string, repo: Omit<TenantRepo, 'addedAt' | 'updatedAt'>): Promise<TenantRepo>;
  getRepo(tenantId: string, repoId: string): Promise<TenantRepo | null>;
  listRepos(tenantId: string, filter?: { enabled?: boolean }): Promise<TenantRepo[]>;
  updateRepo(tenantId: string, repoId: string, update: Partial<TenantRepo>): Promise<TenantRepo>;
  removeRepo(tenantId: string, repoId: string): Promise<void>;

  // Run management (scoped to tenant)
  createRun(tenantId: string, run: Omit<SaaSRun, 'id' | 'createdAt' | 'updatedAt'>): Promise<SaaSRun>;
  getRun(tenantId: string, runId: string): Promise<SaaSRun | null>;
  listRuns(tenantId: string, filter?: {
    repoId?: string;
    type?: RunType;
    status?: RunStatus;
    limit?: number;
  }): Promise<SaaSRun[]>;
  updateRun(tenantId: string, runId: string, update: Partial<SaaSRun>): Promise<SaaSRun>;
}

/**
 * Store for user data
 */
export interface UserStore {
  createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User>;
  getUser(userId: string): Promise<User | null>;
  getUserByGitHubId(githubUserId: number): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUser(userId: string, update: Partial<User>): Promise<User>;
  deleteUser(userId: string): Promise<void>;
}

/**
 * Store for user-tenant memberships
 */
export interface MembershipStore {
  createMembership(membership: Omit<Membership, 'createdAt' | 'updatedAt'>): Promise<Membership>;
  getMembership(userId: string, tenantId: string): Promise<Membership | null>;
  listUserMemberships(userId: string): Promise<Membership[]>;
  listTenantMembers(tenantId: string): Promise<Membership[]>;
  updateMembership(membershipId: string, update: Partial<Membership>): Promise<Membership>;
  deleteMembership(membershipId: string): Promise<void>;
}

// =============================================================================
// Store Factory
// =============================================================================

/**
 * Factory for creating storage instances
 *
 * Usage:
 * ```typescript
 * const factory = createStoreFactory();
 * const prStore = factory.createPRStore();
 * const runStore = factory.createRunStore();
 * ```
 */
export interface StoreFactory {
  /**
   * Create a PR store instance
   */
  createPRStore(): PRStore;

  /**
   * Create a run store instance
   */
  createRunStore(): RunStore;

  /**
   * Create a settings store instance
   */
  createSettingsStore(): SettingsStore;

  /**
   * Create a tenant store instance (SaaS only)
   */
  createTenantStore?(): TenantStore;

  /**
   * Create a user store instance (SaaS only)
   */
  createUserStore?(): UserStore;

  /**
   * Create a membership store instance (SaaS only)
   */
  createMembershipStore?(): MembershipStore;

  /**
   * Close all connections and cleanup
   */
  close(): Promise<void>;
}

// =============================================================================
// Storage Configuration
// =============================================================================

/**
 * Storage backend types
 */
export type StorageType = 'sqlite' | 'turso' | 'postgres' | 'firestore' | 'memory';

/**
 * Storage configuration
 */
export interface StorageConfig {
  type: StorageType;

  // SQLite options
  sqlitePath?: string;

  // Turso options
  tursoUrl?: string;
  tursoAuthToken?: string;

  // PostgreSQL options
  postgresUrl?: string;

  // Firestore options
  firestoreProjectId?: string;
}

/**
 * Get storage configuration from environment
 */
export function getStorageConfig(): StorageConfig {
  const type = (process.env.GWI_STORAGE || 'sqlite') as StorageType;

  return {
    type,
    sqlitePath: process.env.GWI_DB_PATH,
    tursoUrl: process.env.TURSO_URL,
    tursoAuthToken: process.env.TURSO_AUTH_TOKEN,
    postgresUrl: process.env.DATABASE_URL,
    firestoreProjectId: process.env.GCP_PROJECT_ID,
  };
}
