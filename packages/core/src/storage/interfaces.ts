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
 *
 * States:
 * - pending: Run created but not yet started
 * - running: Actively executing steps
 * - awaiting_approval: Paused waiting for user approval (C3)
 * - waiting_external: Paused waiting for external event (C3)
 * - completed: All steps finished successfully
 * - failed: Run failed due to error
 * - cancelled: Run was cancelled by user/system
 */
export type RunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'waiting_external'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Step status
 *
 * States:
 * - pending: Step not yet started
 * - running: Step is executing
 * - blocked: Step waiting for approval gate (C3)
 * - waiting: Step waiting for external event (C3)
 * - completed: Step finished successfully
 * - failed: Step failed
 * - skipped: Step was skipped (condition not met)
 */
export type StepStatus =
  | 'pending'
  | 'running'
  | 'blocked'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'skipped';

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
 * Cancellation initiator type (A2.s4)
 */
export type CancellationInitiator = 'user' | 'system' | 'timeout' | 'policy';

/**
 * Cancellation details for run (A2.s4)
 */
export interface RunCancellation {
  /** Who initiated cancellation */
  initiator: CancellationInitiator;
  /** Human-readable reason */
  reason: string;
  /** User ID if user-initiated */
  userId?: string;
  /** When cancellation was requested */
  requestedAt: Date;
  /** When cancellation was completed */
  completedAt?: Date;
  /** Step that was running when cancelled */
  interruptedStep?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Compensation action result (A2.s4)
 */
export interface CompensationLogEntry {
  /** Action ID */
  actionId: string;
  /** Description of the compensation */
  description: string;
  /** Whether compensation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** When executed */
  executedAt: Date;
}

/**
 * Step checkpoint for resume (A2.s5)
 */
export interface StepCheckpoint {
  /** Step ID */
  stepId: string;
  /** Agent that executed this step */
  agent: string;
  /** Step completion status */
  status: StepStatus;
  /** Step input (for replay/validation) */
  input?: unknown;
  /** Step output (for resume context) */
  output?: unknown;
  /** Error if failed */
  error?: string;
  /** When the checkpoint was created */
  timestamp: Date;
  /** Whether this step can be safely skipped on resume */
  resumable: boolean;
  /** Whether this step is idempotent (can be safely replayed) */
  idempotent: boolean;
  /** Tokens used by this step */
  tokensUsed?: { input: number; output: number };
  /** Step duration in milliseconds */
  durationMs?: number;
}

/**
 * A multi-agent run (pipeline execution)
 */
export interface Run {
  id: string;
  /** Schema version for migration support */
  schemaVersion?: number;
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
  /** A2.s4: Cancellation details (populated when status = 'cancelled') */
  cancellation?: RunCancellation;
  /** A2.s4: Log of compensation actions executed on cancellation */
  compensationLog?: CompensationLogEntry[];
  /** A2.s5: Checkpoints for resume support */
  checkpoints?: StepCheckpoint[];
  /** A2.s5: Step ID that this run was resumed from (if resumed) */
  resumedFrom?: string;
  /** A2.s5: Number of times this run has been resumed */
  resumeCount?: number;
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
export type TenantStatus = 'active' | 'suspended' | 'deactivated' | 'paused';

/**
 * Tenant (GitHub org installation)
 */
export interface Tenant {
  id: string;                    // e.g., "gh-org-12345678"
  /** Schema version for migration support */
  schemaVersion?: number;
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

  // Phase 12: Policy-as-Code
  policy?: TenantPolicy;

  // Usage
  runsThisMonth: number;
  lastRunAt?: Date;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Phase 12: Tenant policy wrapper
 * Stores the PolicyDocument plus metadata
 */
export interface TenantPolicy {
  /** The policy document itself */
  document: unknown; // PolicyDocument from tenancy module
  /** Version number (incremented on each update) */
  version: number;
  /** Last updated timestamp */
  updatedAt: Date;
  /** Who last updated the policy */
  updatedBy: string;
  /** Validation status */
  valid: boolean;
  /** Validation errors if any */
  validationErrors?: string[];
}

/**
 * Phase 12: Tenant connector configuration
 * Stored tenant-scoped configuration for each connector
 */
export interface TenantConnectorConfig {
  /** Connector ID */
  connectorId: string;
  /** Tenant ID */
  tenantId: string;
  /** Whether this connector is enabled */
  enabled: boolean;
  /** Base URL override (if applicable) */
  baseUrl?: string;
  /** Timeout settings */
  timeouts: {
    connectMs: number;
    readMs: number;
  };
  /** Rate limit settings */
  rateLimit?: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
  };
  /** Secret references (NOT raw secrets) */
  secretRefs: Record<string, string>;
  /** Additional connector-specific config */
  config: Record<string, unknown>;
  /** Last updated */
  updatedAt: Date;
  /** Updated by */
  updatedBy: string;
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
 * Automation trigger approval modes
 *
 * - 'always': Always require approval before creating PR
 * - 'never': Full YOLO - auto-create PR immediately (no approval)
 * - 'smart': Auto-approve if complexity < threshold, else require approval
 */
export type AutomationApprovalMode = 'always' | 'never' | 'smart';

/**
 * Automation triggers configuration
 *
 * Configures when issue-to-code workflows run automatically.
 * Supports labels, comment commands, and keywords as triggers.
 */
export interface AutomationTriggers {
  // ============ Trigger Sources ============

  /** Labels that trigger automation (e.g., ['automate', 'gwi', 'ai-fix']) */
  labels?: string[];

  /** Comment commands that trigger automation (e.g., ['/gwi generate', '/gwi code']) */
  commentCommands?: string[];

  /** Keywords in issue title that trigger automation (e.g., ['[AUTO]', '[GWI]']) */
  titleKeywords?: string[];

  /** Keywords in issue body that trigger automation (e.g., ['@gwi', 'auto-implement']) */
  bodyKeywords?: string[];

  // ============ Approval Mode ============

  /** Approval mode for generated code */
  approvalMode: AutomationApprovalMode;

  /**
   * Complexity threshold for 'smart' approval mode.
   * If complexity >= threshold, require approval. Otherwise auto-approve.
   * Default: 4
   */
  smartThreshold?: number;

  // ============ Safety Limits ============

  /** Maximum automation runs per day per repo (rate limit). Default: 10 */
  maxAutoRunsPerDay?: number;

  /** Regex patterns to exclude from automation (never auto-trigger) */
  excludePatterns?: string[];

  /** Whether automation is enabled for this repo */
  enabled?: boolean;
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

  /** Issue-to-code automation triggers configuration */
  automationTriggers?: AutomationTriggers;
}

/**
 * User profile
 */
export interface User {
  id: string;                    // Firebase Auth UID
  /** Schema version for migration support */
  schemaVersion?: number;
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
  /** Schema version for migration support */
  schemaVersion?: number;
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
    source: 'ui' | 'cli' | 'webhook' | 'scheduled' | 'api';
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
  /** Phase 11: Approval status for runs with destructive actions */
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  /** Phase 11: If approval is required, reason why */
  approvalReason?: string;
  /** Phase 11: Proposed changes summary */
  proposedChanges?: ProposedChange[];
  /** B2: Last heartbeat timestamp for orphan detection */
  lastHeartbeatAt?: Date;
  /** B2: Instance ID that owns this run (for orphan detection) */
  ownerId?: string;
}

/**
 * Phase 11: Proposed change (for approval workflow)
 */
export interface ProposedChange {
  file: string;
  action: 'create' | 'modify' | 'delete';
  diff?: string;
  summary?: string;
}

// =============================================================================
// Phase 11: Approval and Audit Types
// =============================================================================

/**
 * Approval decision
 */
export type ApprovalDecision = 'approved' | 'rejected';

/**
 * Run approval record (Phase 11)
 *
 * Stored separately from RunApprovalRecord in capabilities (which is Zod schema).
 * This is the persistence interface for approval decisions.
 */
export interface RunApproval {
  id: string;
  runId: string;
  tenantId: string;
  decision: ApprovalDecision;
  decidedBy: string;         // userId who approved/rejected
  decidedAt: Date;
  reason?: string;           // Optional comment from approver
  proposedChangesSnapshot?: ProposedChange[];  // Snapshot at time of approval
}

/**
 * Audit event type
 */
export type AuditEventType =
  | 'run_started'
  | 'run_completed'
  | 'run_failed'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_rejected'
  | 'github_comment_posted'
  | 'branch_created'
  | 'commit_pushed'
  | 'pr_created'
  | 'pr_updated';

/**
 * Audit event (Phase 11)
 *
 * Immutable audit trail for all run actions.
 */
export interface AuditEvent {
  id: string;
  runId: string;
  tenantId: string;
  eventType: AuditEventType;
  timestamp: Date;
  actor?: string;            // userId or 'system' or 'webhook'
  details: Record<string, unknown>;
  /** Intent Receipt fields for audit trail and GitHub comments */
  intent?: string;
  changeSummary?: string;
  scope?: string;
  policyApproval?: string;
  evidenceText?: string;
  /** @deprecated Legacy 5W fields - use Intent Receipt fields */
  who?: string;
  what?: string;
  when?: string;
  where?: string;
  why?: string;
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
   * Cancel a run (A2.s4: enhanced with cancellation details)
   *
   * @param runId - Run to cancel
   * @param cancellation - Optional cancellation details for audit trail
   * @param compensationLog - Optional log of compensation actions executed
   */
  cancelRun(
    runId: string,
    cancellation?: Omit<RunCancellation, 'completedAt'>,
    compensationLog?: CompensationLogEntry[]
  ): Promise<void>;
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
  countRuns(tenantId: string, sinceDate?: string): Promise<number>;

  /**
   * Count in-flight runs (pending + running) for concurrency limiting
   * Phase A6: Concurrency caps
   */
  countInFlightRuns(tenantId: string): Promise<number>;

  /**
   * Update heartbeat timestamp for a running run
   * B2: Durability - allows orphan detection
   */
  updateRunHeartbeat(tenantId: string, runId: string, ownerId: string): Promise<void>;

  /**
   * List orphaned runs (stale heartbeat, non-terminal status)
   * B2: Recovery - finds runs that need to be recovered or failed
   * @param staleThresholdMs - Runs with heartbeat older than this are considered orphaned
   */
  listOrphanedRuns(staleThresholdMs?: number): Promise<SaaSRun[]>;

  /**
   * List in-flight runs for a specific owner
   * B2: Recovery - allows instance to find its own runs on restart
   */
  listInFlightRunsByOwner(ownerId: string): Promise<SaaSRun[]>;

  // Phase 12: Connector Config management
  getConnectorConfig(tenantId: string, connectorId: string): Promise<TenantConnectorConfig | null>;
  setConnectorConfig(tenantId: string, config: TenantConnectorConfig): Promise<TenantConnectorConfig>;
  listConnectorConfigs(tenantId: string): Promise<TenantConnectorConfig[]>;
  deleteConnectorConfig(tenantId: string, connectorId: string): Promise<void>;
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

/**
 * Store for approval records (Phase 11)
 */
export interface ApprovalStore {
  createApproval(approval: Omit<RunApproval, 'id'>): Promise<RunApproval>;
  getApproval(approvalId: string): Promise<RunApproval | null>;
  getApprovalByRunId(runId: string): Promise<RunApproval | null>;
  listApprovals(tenantId: string, filter?: {
    runId?: string;
    decision?: ApprovalDecision;
    limit?: number;
  }): Promise<RunApproval[]>;
}

/**
 * Store for audit events (Phase 11)
 */
export interface AuditStore {
  createEvent(event: Omit<AuditEvent, 'id'>): Promise<AuditEvent>;
  getEvent(eventId: string): Promise<AuditEvent | null>;
  listEvents(runId: string, filter?: {
    eventType?: AuditEventType;
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]>;
  listTenantEvents(tenantId: string, filter?: {
    eventType?: AuditEventType;
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]>;
}

// =============================================================================
// Phase 13: Instance and Schedule Types
// =============================================================================

/**
 * Connector binding for an instance (Phase 13)
 */
export interface ConnectorBinding {
  /** Connector requirement ID from template */
  requirementId: string;
  /** Bound connector config ID */
  connectorConfigId: string;
}

/**
 * Workflow Instance - tenant-configured deployment of a template (Phase 13)
 */
export interface WorkflowInstance {
  /** Unique instance ID */
  id: string;
  /** Schema version for migration support */
  schemaVersion?: number;
  /** Tenant ID */
  tenantId: string;
  /** Reference to template (id@version) */
  templateRef: string;
  /** Instance display name */
  name: string;
  /** Instance description */
  description?: string;
  /** Configured input values */
  configuredInputs: Record<string, unknown>;
  /** Connector bindings */
  connectorBindings: ConnectorBinding[];
  /** Whether instance is enabled */
  enabled: boolean;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Created by user ID */
  createdBy: string;
  /** Last run timestamp */
  lastRunAt?: Date;
  /** Total run count */
  runCount: number;
}

/**
 * Schedule for automated instance execution (Phase 13)
 */
export interface WorkflowSchedule {
  /** Unique schedule ID */
  id: string;
  /** Schema version for migration support */
  schemaVersion?: number;
  /** Instance ID */
  instanceId: string;
  /** Tenant ID (denormalized for queries) */
  tenantId: string;
  /** Cron expression (standard 5-field) */
  cronExpression: string;
  /** Timezone (IANA format) */
  timezone: string;
  /** Whether schedule is enabled */
  enabled: boolean;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Last trigger timestamp */
  lastTriggeredAt?: Date;
  /** Next scheduled trigger */
  nextTriggerAt?: Date;
  /** Created by user ID */
  createdBy: string;
}

/**
 * Store for workflow instances (Phase 13)
 */
export interface InstanceStore {
  createInstance(instance: Omit<WorkflowInstance, 'id' | 'createdAt' | 'updatedAt' | 'runCount'>): Promise<WorkflowInstance>;
  getInstance(instanceId: string): Promise<WorkflowInstance | null>;
  listInstances(tenantId: string, filter?: {
    templateRef?: string;
    enabled?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<WorkflowInstance[]>;
  updateInstance(instanceId: string, update: Partial<Pick<WorkflowInstance, 'name' | 'description' | 'configuredInputs' | 'connectorBindings' | 'enabled'>>): Promise<WorkflowInstance>;
  deleteInstance(instanceId: string): Promise<void>;
  incrementRunCount(instanceId: string): Promise<void>;
  updateLastRun(instanceId: string, runAt: Date): Promise<void>;
}

/**
 * Store for workflow schedules (Phase 13)
 */
export interface ScheduleStore {
  createSchedule(schedule: Omit<WorkflowSchedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkflowSchedule>;
  getSchedule(scheduleId: string): Promise<WorkflowSchedule | null>;
  listSchedules(instanceId: string): Promise<WorkflowSchedule[]>;
  listTenantSchedules(tenantId: string, filter?: {
    enabled?: boolean;
    limit?: number;
  }): Promise<WorkflowSchedule[]>;
  listDueSchedules(beforeTime: Date): Promise<WorkflowSchedule[]>;
  updateSchedule(scheduleId: string, update: Partial<Pick<WorkflowSchedule, 'cronExpression' | 'timezone' | 'enabled'>>): Promise<WorkflowSchedule>;
  updateLastTriggered(scheduleId: string, triggeredAt: Date, nextTriggerAt: Date): Promise<void>;
  deleteSchedule(scheduleId: string): Promise<void>;
}

// =============================================================================
// Phase 14: Signal and PR Queue Types
// =============================================================================

/**
 * Signal source types (Phase 14)
 */
export type SignalSource = 'github_issue' | 'github_pr' | 'github_comment' | 'webhook' | 'scheduled' | 'manual' | 'api';

/**
 * Signal status (Phase 14)
 */
export type SignalStatus = 'pending' | 'processed' | 'ignored' | 'failed';

/**
 * Signal - raw event captured from external sources (Phase 14)
 *
 * Signals represent inbound events that may trigger work items.
 * They are normalized and deduplicated before becoming work items.
 */
export interface Signal {
  /** Unique signal ID */
  id: string;
  /** Schema version for migration support */
  schemaVersion?: number;
  /** Tenant ID */
  tenantId: string;
  /** Signal source type */
  source: SignalSource;
  /** External ID from source (e.g., GitHub delivery ID) */
  externalId: string;
  /** When the signal occurred at source */
  occurredAt: Date;
  /** When we received the signal */
  receivedAt: Date;
  /** Signal status */
  status: SignalStatus;
  /** Raw payload from source */
  payload: Record<string, unknown>;
  /** Extracted context */
  context: SignalContext;
  /** Processing metadata */
  processingMeta?: {
    processedAt?: Date;
    workItemId?: string;
    ignoredReason?: string;
    errorMessage?: string;
  };
}

/**
 * Extracted context from signal payload (Phase 14)
 */
export interface SignalContext {
  /** Repository (if applicable) */
  repo?: {
    owner: string;
    name: string;
    fullName: string;
    id?: number;
  };
  /** PR/Issue number */
  resourceNumber?: number;
  /** Resource type */
  resourceType?: 'issue' | 'pr' | 'comment' | 'commit';
  /** Resource URL */
  resourceUrl?: string;
  /** Actor who triggered the signal */
  actor?: string;
  /** Action type from webhook */
  action?: string;
  /** Title (if applicable) */
  title?: string;
  /** Body/description (if applicable) */
  body?: string;
  /** Labels (if applicable) */
  labels?: string[];
}

/**
 * Work item status (Phase 14)
 */
export type WorkItemStatus = 'queued' | 'in_progress' | 'awaiting_approval' | 'approved' | 'rejected' | 'completed' | 'dismissed';

/**
 * Work item type (Phase 14)
 */
export type WorkItemType = 'issue_to_code' | 'pr_review' | 'pr_resolve' | 'docs_update' | 'test_gen' | 'custom';

/**
 * Work Item - normalized, scored unit of work (Phase 14)
 *
 * Work items are created from signals after deduplication and scoring.
 * They appear in the tenant's PR queue for review and approval.
 */
export interface WorkItem {
  /** Unique work item ID */
  id: string;
  /** Schema version for migration support */
  schemaVersion?: number;
  /** Tenant ID */
  tenantId: string;
  /** Work item type */
  type: WorkItemType;
  /** Display title */
  title: string;
  /** Summary description */
  summary: string;
  /** Current status */
  status: WorkItemStatus;
  /** Deduplication key (for preventing duplicates) */
  dedupeKey: string;
  /** Priority score (0-100, higher = more important) */
  score: number;
  /** Score breakdown (for explainability) */
  scoreBreakdown: ScoreBreakdown;
  /** Source signal IDs (can be multiple if deduplicated) */
  signalIds: string[];
  /** Evidence links */
  evidence: WorkItemEvidence;
  /** Repository context */
  repo?: {
    owner: string;
    name: string;
    fullName: string;
  };
  /** Resource reference (issue/PR number) */
  resourceNumber?: number;
  /** Resource URL */
  resourceUrl?: string;
  /** Assigned to user ID (if claimed) */
  assignedTo?: string;
  /** PR candidate ID (if generated) */
  candidateId?: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Processing deadline (optional) */
  dueAt?: Date;
}

/**
 * Score breakdown for explainability (Phase 14)
 */
export interface ScoreBreakdown {
  /** Base score from signal type */
  baseScore: number;
  /** Modifiers applied */
  modifiers: ScoreModifier[];
  /** Final calculated score */
  finalScore: number;
  /** Human-readable explanation */
  explanation: string;
}

/**
 * Score modifier (Phase 14)
 */
export interface ScoreModifier {
  /** Modifier name */
  name: string;
  /** Modifier value (positive or negative) */
  value: number;
  /** Reason for modifier */
  reason: string;
}

/**
 * Work item evidence links (Phase 14)
 */
export interface WorkItemEvidence {
  /** Source URLs */
  sourceUrls: string[];
  /** Related PRs */
  relatedPRs?: string[];
  /** Related issues */
  relatedIssues?: string[];
  /** Files involved */
  files?: string[];
  /** Additional context */
  additionalContext?: Record<string, unknown>;
}

/**
 * PR Candidate status (Phase 14)
 */
export type PRCandidateStatus = 'draft' | 'ready' | 'approved' | 'rejected' | 'applied' | 'failed';

/**
 * PR Candidate - generated plan/patch for a work item (Phase 14)
 *
 * Candidates are generated from approved work items and contain
 * the plan and optional patch for creating a PR.
 */
export interface PRCandidate {
  /** Unique candidate ID */
  id: string;
  /** Schema version for migration support */
  schemaVersion?: number;
  /** Work item ID */
  workItemId: string;
  /** Tenant ID */
  tenantId: string;
  /** Current status */
  status: PRCandidateStatus;
  /** Generated plan */
  plan: CandidatePlan;
  /** Generated patchset (if available) */
  patchset?: CandidatePatchset;
  /** Risk assessment */
  risk: CandidateRisk;
  /** Confidence score (0-100) */
  confidence: number;
  /** Required approvals count */
  requiredApprovals: number;
  /** Current approvals */
  approvals: CandidateApproval[];
  /** Intent Receipt for this candidate */
  intentReceipt: CandidateIntentReceipt;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Applied timestamp (if status = applied) */
  appliedAt?: Date;
  /** Resulting PR URL (if applied) */
  resultingPRUrl?: string;
  /** Run ID (if executed) */
  runId?: string;
}

/**
 * Candidate plan (Phase 14)
 */
export interface CandidatePlan {
  /** Plan summary */
  summary: string;
  /** Detailed steps */
  steps: CandidatePlanStep[];
  /** Estimated complexity (1-5) */
  complexity: number;
  /** Files to be affected */
  affectedFiles: string[];
  /** Estimated time to implement (minutes) */
  estimatedMinutes?: number;
}

/**
 * Candidate plan step (Phase 14)
 */
export interface CandidatePlanStep {
  /** Step number */
  order: number;
  /** Step description */
  description: string;
  /** Files involved */
  files?: string[];
  /** Action type */
  action: 'create' | 'modify' | 'delete' | 'review' | 'test';
}

/**
 * Candidate patchset (Phase 14)
 */
export interface CandidatePatchset {
  /** Branch name for the patch */
  branchName: string;
  /** Base commit SHA */
  baseCommit: string;
  /** File changes */
  changes: PatchChange[];
  /** Commit message */
  commitMessage: string;
}

/**
 * Patch change (Phase 14)
 */
export interface PatchChange {
  /** File path */
  file: string;
  /** Change type */
  action: 'create' | 'modify' | 'delete';
  /** Content (for create/modify) */
  content?: string;
  /** Diff (for display) */
  diff?: string;
}

/**
 * Candidate risk assessment (Phase 14)
 */
export interface CandidateRisk {
  /** Risk level */
  level: 'low' | 'medium' | 'high' | 'critical';
  /** Risk score (0-100) */
  score: number;
  /** Risk factors */
  factors: RiskFactor[];
  /** Mitigation suggestions */
  mitigations?: string[];
}

/**
 * Risk factor (Phase 14)
 */
export interface RiskFactor {
  /** Factor name */
  name: string;
  /** Severity (1-5) */
  severity: number;
  /** Description */
  description: string;
}

/**
 * Candidate approval record (Phase 14)
 */
export interface CandidateApproval {
  /** Approver user ID */
  userId: string;
  /** Decision */
  decision: 'approved' | 'rejected' | 'changes_requested';
  /** Comment */
  comment?: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Intent Receipt for a PR candidate (Phase 14)
 */
export interface CandidateIntentReceipt {
  /** Intent: What action is proposed */
  intent: string;
  /** Change Summary: Brief description of changes */
  changeSummary: string;
  /** Actor: Who/what triggered this */
  actor: string;
  /** When: Timestamp */
  when: string;
  /** Scope: Resources affected */
  scope: string;
  /** Policy/Approval: Policy status */
  policyApproval: string;
  /** Evidence: Supporting context */
  evidence: string;
}

/**
 * Store for signals (Phase 14)
 */
export interface SignalStore {
  /** Create a new signal */
  createSignal(signal: Omit<Signal, 'id' | 'receivedAt'>): Promise<Signal>;
  /** Get signal by ID */
  getSignal(signalId: string): Promise<Signal | null>;
  /** Get signal by external ID (for deduplication) */
  getSignalByExternalId(tenantId: string, source: SignalSource, externalId: string): Promise<Signal | null>;
  /** List signals for a tenant */
  listSignals(tenantId: string, filter?: {
    source?: SignalSource;
    status?: SignalStatus;
    since?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Signal[]>;
  /** Update signal status */
  updateSignal(signalId: string, update: Partial<Pick<Signal, 'status' | 'processingMeta'>>): Promise<Signal>;
  /** List pending signals for processing */
  listPendingSignals(tenantId: string, limit?: number): Promise<Signal[]>;
}

/**
 * Store for work items (Phase 14)
 */
export interface WorkItemStore {
  /** Create a new work item */
  createWorkItem(item: Omit<WorkItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkItem>;
  /** Get work item by ID */
  getWorkItem(itemId: string): Promise<WorkItem | null>;
  /** Get work item by dedupe key (for deduplication) */
  getWorkItemByDedupeKey(tenantId: string, dedupeKey: string): Promise<WorkItem | null>;
  /** List work items (PR queue) */
  listWorkItems(tenantId: string, filter?: {
    status?: WorkItemStatus | WorkItemStatus[];
    type?: WorkItemType;
    repo?: string;
    assignedTo?: string;
    minScore?: number;
    limit?: number;
    offset?: number;
  }): Promise<WorkItem[]>;
  /** Update work item */
  updateWorkItem(itemId: string, update: Partial<Pick<WorkItem, 'status' | 'assignedTo' | 'candidateId' | 'score' | 'scoreBreakdown'>>): Promise<WorkItem>;
  /** Add signal to existing work item (dedup merge) */
  addSignalToWorkItem(itemId: string, signalId: string): Promise<WorkItem>;
  /** Count work items by status */
  countWorkItems(tenantId: string, status?: WorkItemStatus | WorkItemStatus[]): Promise<number>;
  /** Get queue statistics */
  getQueueStats(tenantId: string): Promise<{
    total: number;
    byStatus: Record<WorkItemStatus, number>;
    byType: Record<WorkItemType, number>;
    avgScore: number;
  }>;
}

/**
 * Store for PR candidates (Phase 14)
 */
export interface PRCandidateStore {
  /** Create a new PR candidate */
  createCandidate(candidate: Omit<PRCandidate, 'id' | 'createdAt' | 'updatedAt' | 'approvals'>): Promise<PRCandidate>;
  /** Get candidate by ID */
  getCandidate(candidateId: string): Promise<PRCandidate | null>;
  /** Get candidate by work item ID */
  getCandidateByWorkItemId(workItemId: string): Promise<PRCandidate | null>;
  /** List candidates for a tenant */
  listCandidates(tenantId: string, filter?: {
    status?: PRCandidateStatus | PRCandidateStatus[];
    workItemId?: string;
    limit?: number;
    offset?: number;
  }): Promise<PRCandidate[]>;
  /** Update candidate (Phase 19: expanded to support plan/risk updates) */
  updateCandidate(candidateId: string, update: Partial<Pick<PRCandidate, 'status' | 'patchset' | 'resultingPRUrl' | 'runId' | 'appliedAt' | 'plan' | 'risk' | 'confidence' | 'intentReceipt'>>): Promise<PRCandidate>;
  /** Add approval to candidate */
  addApproval(candidateId: string, approval: CandidateApproval): Promise<PRCandidate>;
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
   * Create an instance store (Phase 13: Workflow Catalog)
   */
  createInstanceStore?(): InstanceStore;

  /**
   * Create a schedule store (Phase 13: Workflow Catalog)
   */
  createScheduleStore?(): ScheduleStore;

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
