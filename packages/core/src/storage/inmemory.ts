/**
 * In-Memory Storage Implementations
 *
 * TEMPORARY: These are placeholder implementations for development and testing.
 * They will be replaced with Firestore-backed implementations in a later phase.
 *
 * DO NOT USE IN PRODUCTION - data is lost on restart.
 *
 * @module @gwi/core/storage
 */

import type {
  Run,
  RunStep,
  RunType,
  RunStatus,
  RunResult,
  RunStore,
  Tenant,
  TenantRepo,
  TenantConnectorConfig,
  TenantStore,
  SaaSRun,
  User,
  UserStore,
  Membership,
  MembershipStore,
  InstanceStore,
  ScheduleStore,
  WorkflowInstance,
  WorkflowSchedule,
  // Phase 14 types
  Signal,
  SignalSource,
  SignalStatus,
  SignalStore,
  WorkItem,
  WorkItemStatus,
  WorkItemType,
  WorkItemStore,
  PRCandidate,
  PRCandidateStatus,
  PRCandidateStore,
  CandidateApproval,
} from './interfaces.js';
import { generateInstanceId, generateScheduleId } from '../templates/index.js';

// =============================================================================
// Helper Functions
// =============================================================================

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

function now(): Date {
  return new Date();
}

// =============================================================================
// In-Memory Run Store
// =============================================================================

/**
 * TEMPORARY: In-memory RunStore implementation
 *
 * This stores runs in a Map and loses data on restart.
 * Will be replaced with Firestore implementation.
 */
export class InMemoryRunStore implements RunStore {
  private runs = new Map<string, Run>();
  private steps = new Map<string, RunStep[]>();

  async createRun(prId: string, prUrl: string, type: RunType): Promise<Run> {
    const run: Run = {
      id: generateId('run'),
      prId,
      prUrl,
      type,
      status: 'pending',
      steps: [],
      createdAt: now(),
      updatedAt: now(),
    };
    this.runs.set(run.id, run);
    this.steps.set(run.id, []);
    return run;
  }

  async getRun(runId: string): Promise<Run | null> {
    return this.runs.get(runId) ?? null;
  }

  async getLatestRun(prId: string): Promise<Run | null> {
    let latest: Run | null = null;
    for (const run of this.runs.values()) {
      if (run.prId === prId) {
        if (!latest || run.createdAt > latest.createdAt) {
          latest = run;
        }
      }
    }
    return latest;
  }

  async listRuns(prId: string, limit = 20): Promise<Run[]> {
    const runs: Run[] = [];
    for (const run of this.runs.values()) {
      if (run.prId === prId) {
        runs.push(run);
      }
    }
    runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return runs.slice(0, limit);
  }

  async updateRunStatus(runId: string, status: RunStatus): Promise<void> {
    const run = this.runs.get(runId);
    if (run) {
      run.status = status;
      run.updatedAt = now();
    }
  }

  async addStep(runId: string, agent: string): Promise<RunStep> {
    const step: RunStep = {
      id: generateId('step'),
      runId,
      agent,
      status: 'pending',
    };
    const steps = this.steps.get(runId) ?? [];
    steps.push(step);
    this.steps.set(runId, steps);

    const run = this.runs.get(runId);
    if (run) {
      run.steps = steps;
      run.currentStep = step.id;
      run.updatedAt = now();
    }
    return step;
  }

  async updateStep(runId: string, stepId: string, update: Partial<RunStep>): Promise<void> {
    const steps = this.steps.get(runId) ?? [];
    const step = steps.find(s => s.id === stepId);
    if (step) {
      Object.assign(step, update);
      const run = this.runs.get(runId);
      if (run) {
        run.steps = steps;
        run.updatedAt = now();
      }
    }
  }

  async getSteps(runId: string): Promise<RunStep[]> {
    return this.steps.get(runId) ?? [];
  }

  async completeRun(runId: string, result: RunResult): Promise<void> {
    const run = this.runs.get(runId);
    if (run) {
      run.status = 'completed';
      run.result = result;
      run.completedAt = now();
      run.updatedAt = now();
      run.durationMs = run.completedAt.getTime() - run.createdAt.getTime();
    }
  }

  async failRun(runId: string, error: string): Promise<void> {
    const run = this.runs.get(runId);
    if (run) {
      run.status = 'failed';
      run.error = error;
      run.completedAt = now();
      run.updatedAt = now();
      run.durationMs = run.completedAt.getTime() - run.createdAt.getTime();
    }
  }

  async cancelRun(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (run) {
      run.status = 'cancelled';
      run.completedAt = now();
      run.updatedAt = now();
      run.durationMs = run.completedAt.getTime() - run.createdAt.getTime();
    }
  }
}

// =============================================================================
// In-Memory Tenant Store
// =============================================================================

/**
 * TEMPORARY: In-memory TenantStore implementation
 *
 * This stores tenants, repos, and runs in Maps and loses data on restart.
 * Will be replaced with Firestore implementation.
 */
export class InMemoryTenantStore implements TenantStore {
  private tenants = new Map<string, Tenant>();
  private repos = new Map<string, TenantRepo[]>();
  private runs = new Map<string, SaaSRun[]>();
  private connectorConfigs = new Map<string, TenantConnectorConfig[]>();

  // Tenant CRUD
  async createTenant(tenant: Omit<Tenant, 'createdAt' | 'updatedAt'>): Promise<Tenant> {
    const fullTenant: Tenant = {
      ...tenant,
      createdAt: now(),
      updatedAt: now(),
    };
    this.tenants.set(tenant.id, fullTenant);
    this.repos.set(tenant.id, []);
    this.runs.set(tenant.id, []);
    return fullTenant;
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.tenants.get(tenantId) ?? null;
  }

  async updateTenant(tenantId: string, update: Partial<Tenant>): Promise<Tenant> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }
    const updated = { ...tenant, ...update, updatedAt: now() };
    this.tenants.set(tenantId, updated);
    return updated;
  }

  async deleteTenant(tenantId: string): Promise<void> {
    this.tenants.delete(tenantId);
    this.repos.delete(tenantId);
    this.runs.delete(tenantId);
  }

  // Repo management
  async addRepo(tenantId: string, repo: Omit<TenantRepo, 'addedAt' | 'updatedAt'>): Promise<TenantRepo> {
    const fullRepo: TenantRepo = {
      ...repo,
      addedAt: now(),
      updatedAt: now(),
    };
    const repos = this.repos.get(tenantId) ?? [];
    repos.push(fullRepo);
    this.repos.set(tenantId, repos);
    return fullRepo;
  }

  async getRepo(tenantId: string, repoId: string): Promise<TenantRepo | null> {
    const repos = this.repos.get(tenantId) ?? [];
    return repos.find(r => r.id === repoId) ?? null;
  }

  async listRepos(tenantId: string, filter?: { enabled?: boolean }): Promise<TenantRepo[]> {
    let repos = this.repos.get(tenantId) ?? [];
    if (filter?.enabled !== undefined) {
      repos = repos.filter(r => r.enabled === filter.enabled);
    }
    return repos;
  }

  async updateRepo(tenantId: string, repoId: string, update: Partial<TenantRepo>): Promise<TenantRepo> {
    const repos = this.repos.get(tenantId) ?? [];
    const index = repos.findIndex(r => r.id === repoId);
    if (index === -1) {
      throw new Error(`Repo not found: ${repoId}`);
    }
    const updated = { ...repos[index], ...update, updatedAt: now() };
    repos[index] = updated;
    this.repos.set(tenantId, repos);
    return updated;
  }

  async removeRepo(tenantId: string, repoId: string): Promise<void> {
    const repos = this.repos.get(tenantId) ?? [];
    const filtered = repos.filter(r => r.id !== repoId);
    this.repos.set(tenantId, filtered);
  }

  // Run management
  async createRun(tenantId: string, run: Omit<SaaSRun, 'id' | 'createdAt' | 'updatedAt'>): Promise<SaaSRun> {
    const fullRun: SaaSRun = {
      ...run,
      id: generateId('run'),
      createdAt: now(),
      updatedAt: now(),
    };
    const runs = this.runs.get(tenantId) ?? [];
    runs.push(fullRun);
    this.runs.set(tenantId, runs);
    return fullRun;
  }

  async getRun(tenantId: string, runId: string): Promise<SaaSRun | null> {
    const runs = this.runs.get(tenantId) ?? [];
    return runs.find(r => r.id === runId) ?? null;
  }

  async listRuns(
    tenantId: string,
    filter?: { repoId?: string; type?: RunType; status?: RunStatus; limit?: number }
  ): Promise<SaaSRun[]> {
    let runs = this.runs.get(tenantId) ?? [];

    if (filter?.repoId) {
      runs = runs.filter(r => r.repoId === filter.repoId);
    }
    if (filter?.type) {
      runs = runs.filter(r => r.type === filter.type);
    }
    if (filter?.status) {
      runs = runs.filter(r => r.status === filter.status);
    }

    runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const limit = filter?.limit ?? 20;
    return runs.slice(0, limit);
  }

  async updateRun(tenantId: string, runId: string, update: Partial<SaaSRun>): Promise<SaaSRun> {
    const runs = this.runs.get(tenantId) ?? [];
    const index = runs.findIndex(r => r.id === runId);
    if (index === -1) {
      throw new Error(`Run not found: ${runId}`);
    }
    const updated = { ...runs[index], ...update, updatedAt: now() };
    runs[index] = updated;
    this.runs.set(tenantId, runs);
    return updated;
  }

  async countRuns(tenantId: string, sinceDate?: string): Promise<number> {
    const runs = this.runs.get(tenantId) ?? [];
    if (!sinceDate) {
      return runs.length;
    }
    const since = new Date(sinceDate);
    return runs.filter(r => r.createdAt >= since).length;
  }

  // Phase 12: Connector Config management
  async getConnectorConfig(tenantId: string, connectorId: string): Promise<TenantConnectorConfig | null> {
    const configs = this.connectorConfigs.get(tenantId) ?? [];
    return configs.find(c => c.connectorId === connectorId) ?? null;
  }

  async setConnectorConfig(tenantId: string, config: TenantConnectorConfig): Promise<TenantConnectorConfig> {
    const configs = this.connectorConfigs.get(tenantId) ?? [];
    const index = configs.findIndex(c => c.connectorId === config.connectorId);

    const fullConfig: TenantConnectorConfig = {
      ...config,
      tenantId,
      updatedAt: now(),
    };

    if (index === -1) {
      configs.push(fullConfig);
    } else {
      configs[index] = fullConfig;
    }

    this.connectorConfigs.set(tenantId, configs);
    return fullConfig;
  }

  async listConnectorConfigs(tenantId: string): Promise<TenantConnectorConfig[]> {
    return this.connectorConfigs.get(tenantId) ?? [];
  }

  async deleteConnectorConfig(tenantId: string, connectorId: string): Promise<void> {
    const configs = this.connectorConfigs.get(tenantId) ?? [];
    const filtered = configs.filter(c => c.connectorId !== connectorId);
    this.connectorConfigs.set(tenantId, filtered);
  }
}

// =============================================================================
// In-Memory User Store
// =============================================================================

/**
 * TEMPORARY: In-memory UserStore implementation
 */
export class InMemoryUserStore implements UserStore {
  private users = new Map<string, User>();
  private byGitHubId = new Map<number, string>();
  private byEmail = new Map<string, string>();

  async createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    const fullUser: User = {
      ...user,
      createdAt: now(),
      lastLoginAt: now(),
      updatedAt: now(),
    };
    this.users.set(user.id, fullUser);
    this.byGitHubId.set(user.githubUserId, user.id);
    this.byEmail.set(user.email, user.id);
    return fullUser;
  }

  async getUser(userId: string): Promise<User | null> {
    return this.users.get(userId) ?? null;
  }

  async getUserByGitHubId(githubUserId: number): Promise<User | null> {
    const userId = this.byGitHubId.get(githubUserId);
    return userId ? this.users.get(userId) ?? null : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const userId = this.byEmail.get(email);
    return userId ? this.users.get(userId) ?? null : null;
  }

  async updateUser(userId: string, update: Partial<User>): Promise<User> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    const updated = { ...user, ...update, updatedAt: now() };
    this.users.set(userId, updated);
    return updated;
  }

  async deleteUser(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      this.byGitHubId.delete(user.githubUserId);
      this.byEmail.delete(user.email);
      this.users.delete(userId);
    }
  }
}

// =============================================================================
// In-Memory Membership Store
// =============================================================================

/**
 * TEMPORARY: In-memory MembershipStore implementation
 */
export class InMemoryMembershipStore implements MembershipStore {
  private memberships = new Map<string, Membership>();

  async createMembership(membership: Omit<Membership, 'createdAt' | 'updatedAt'>): Promise<Membership> {
    const fullMembership: Membership = {
      ...membership,
      createdAt: now(),
      updatedAt: now(),
    };
    this.memberships.set(membership.id, fullMembership);
    return fullMembership;
  }

  async getMembership(userId: string, tenantId: string): Promise<Membership | null> {
    for (const m of this.memberships.values()) {
      if (m.userId === userId && m.tenantId === tenantId) {
        return m;
      }
    }
    return null;
  }

  async listUserMemberships(userId: string): Promise<Membership[]> {
    return Array.from(this.memberships.values()).filter(m => m.userId === userId);
  }

  async listTenantMembers(tenantId: string): Promise<Membership[]> {
    return Array.from(this.memberships.values()).filter(m => m.tenantId === tenantId);
  }

  async updateMembership(membershipId: string, update: Partial<Membership>): Promise<Membership> {
    const membership = this.memberships.get(membershipId);
    if (!membership) {
      throw new Error(`Membership not found: ${membershipId}`);
    }
    const updated = { ...membership, ...update, updatedAt: now() };
    this.memberships.set(membershipId, updated);
    return updated;
  }

  async deleteMembership(membershipId: string): Promise<void> {
    this.memberships.delete(membershipId);
  }
}

// =============================================================================
// In-Memory Instance Store (Phase 13)
// =============================================================================

/**
 * TEMPORARY: In-memory InstanceStore implementation
 */
export class InMemoryInstanceStore implements InstanceStore {
  private instances = new Map<string, WorkflowInstance>();

  async createInstance(instance: Omit<WorkflowInstance, 'id' | 'createdAt' | 'updatedAt' | 'runCount'>): Promise<WorkflowInstance> {
    const fullInstance: WorkflowInstance = {
      ...instance,
      id: generateInstanceId(),
      createdAt: now(),
      updatedAt: now(),
      runCount: 0,
    };
    this.instances.set(fullInstance.id, fullInstance);
    return fullInstance;
  }

  async getInstance(instanceId: string): Promise<WorkflowInstance | null> {
    return this.instances.get(instanceId) ?? null;
  }

  async listInstances(tenantId: string, filter?: {
    templateRef?: string;
    enabled?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<WorkflowInstance[]> {
    let results = Array.from(this.instances.values()).filter(i => i.tenantId === tenantId);

    if (filter?.templateRef) {
      results = results.filter(i => i.templateRef === filter.templateRef);
    }
    if (filter?.enabled !== undefined) {
      results = results.filter(i => i.enabled === filter.enabled);
    }

    // Sort by creation time descending
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async updateInstance(instanceId: string, update: Partial<Pick<WorkflowInstance, 'name' | 'description' | 'configuredInputs' | 'connectorBindings' | 'enabled'>>): Promise<WorkflowInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }
    const updated = { ...instance, ...update, updatedAt: now() };
    this.instances.set(instanceId, updated);
    return updated;
  }

  async deleteInstance(instanceId: string): Promise<void> {
    this.instances.delete(instanceId);
  }

  async incrementRunCount(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.runCount += 1;
      instance.updatedAt = now();
    }
  }

  async updateLastRun(instanceId: string, runAt: Date): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.lastRunAt = runAt;
      instance.updatedAt = now();
    }
  }
}

// =============================================================================
// In-Memory Schedule Store (Phase 13)
// =============================================================================

/**
 * TEMPORARY: In-memory ScheduleStore implementation
 */
export class InMemoryScheduleStore implements ScheduleStore {
  private schedules = new Map<string, WorkflowSchedule>();

  async createSchedule(schedule: Omit<WorkflowSchedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkflowSchedule> {
    const fullSchedule: WorkflowSchedule = {
      ...schedule,
      id: generateScheduleId(),
      createdAt: now(),
      updatedAt: now(),
    };
    this.schedules.set(fullSchedule.id, fullSchedule);
    return fullSchedule;
  }

  async getSchedule(scheduleId: string): Promise<WorkflowSchedule | null> {
    return this.schedules.get(scheduleId) ?? null;
  }

  async listSchedules(instanceId: string): Promise<WorkflowSchedule[]> {
    return Array.from(this.schedules.values())
      .filter(s => s.instanceId === instanceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listTenantSchedules(tenantId: string, filter?: {
    enabled?: boolean;
    limit?: number;
  }): Promise<WorkflowSchedule[]> {
    let results = Array.from(this.schedules.values()).filter(s => s.tenantId === tenantId);

    if (filter?.enabled !== undefined) {
      results = results.filter(s => s.enabled === filter.enabled);
    }

    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async listDueSchedules(beforeTime: Date): Promise<WorkflowSchedule[]> {
    return Array.from(this.schedules.values())
      .filter(s => s.enabled && s.nextTriggerAt && s.nextTriggerAt <= beforeTime);
  }

  async updateSchedule(scheduleId: string, update: Partial<Pick<WorkflowSchedule, 'cronExpression' | 'timezone' | 'enabled'>>): Promise<WorkflowSchedule> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }
    const updated = { ...schedule, ...update, updatedAt: now() };
    this.schedules.set(scheduleId, updated);
    return updated;
  }

  async updateLastTriggered(scheduleId: string, triggeredAt: Date, nextTriggerAt: Date): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (schedule) {
      schedule.lastTriggeredAt = triggeredAt;
      schedule.nextTriggerAt = nextTriggerAt;
      schedule.updatedAt = now();
    }
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    this.schedules.delete(scheduleId);
  }
}

// =============================================================================
// In-Memory Signal Store (Phase 14)
// =============================================================================

/**
 * TEMPORARY: In-memory SignalStore implementation
 */
export class InMemorySignalStore implements SignalStore {
  private signals = new Map<string, Signal>();
  private byExternalId = new Map<string, string>(); // "tenantId:source:externalId" -> signalId

  async createSignal(signal: Omit<Signal, 'id' | 'receivedAt'>): Promise<Signal> {
    const fullSignal: Signal = {
      ...signal,
      id: generateId('sig'),
      receivedAt: now(),
    };
    this.signals.set(fullSignal.id, fullSignal);

    // Index by external ID for deduplication
    const externalKey = `${signal.tenantId}:${signal.source}:${signal.externalId}`;
    this.byExternalId.set(externalKey, fullSignal.id);

    return fullSignal;
  }

  async getSignal(signalId: string): Promise<Signal | null> {
    return this.signals.get(signalId) ?? null;
  }

  async getSignalByExternalId(tenantId: string, source: SignalSource, externalId: string): Promise<Signal | null> {
    const key = `${tenantId}:${source}:${externalId}`;
    const signalId = this.byExternalId.get(key);
    return signalId ? this.signals.get(signalId) ?? null : null;
  }

  async listSignals(tenantId: string, filter?: {
    source?: SignalSource;
    status?: SignalStatus;
    since?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Signal[]> {
    let results = Array.from(this.signals.values()).filter(s => s.tenantId === tenantId);

    if (filter?.source) {
      results = results.filter(s => s.source === filter.source);
    }
    if (filter?.status) {
      results = results.filter(s => s.status === filter.status);
    }
    if (filter?.since) {
      results = results.filter(s => s.receivedAt >= filter.since!);
    }

    // Sort by received time descending
    results.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async updateSignal(signalId: string, update: Partial<Pick<Signal, 'status' | 'processingMeta'>>): Promise<Signal> {
    const signal = this.signals.get(signalId);
    if (!signal) {
      throw new Error(`Signal not found: ${signalId}`);
    }
    const updated = { ...signal, ...update };
    this.signals.set(signalId, updated);
    return updated;
  }

  async listPendingSignals(tenantId: string, limit = 100): Promise<Signal[]> {
    return this.listSignals(tenantId, { status: 'pending', limit });
  }
}

// =============================================================================
// In-Memory Work Item Store (Phase 14)
// =============================================================================

/**
 * TEMPORARY: In-memory WorkItemStore implementation
 */
export class InMemoryWorkItemStore implements WorkItemStore {
  private items = new Map<string, WorkItem>();
  private byDedupeKey = new Map<string, string>(); // "tenantId:dedupeKey" -> itemId

  async createWorkItem(item: Omit<WorkItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkItem> {
    const fullItem: WorkItem = {
      ...item,
      id: generateId('wi'),
      createdAt: now(),
      updatedAt: now(),
    };
    this.items.set(fullItem.id, fullItem);

    // Index by dedupe key
    const dedupeIndex = `${item.tenantId}:${item.dedupeKey}`;
    this.byDedupeKey.set(dedupeIndex, fullItem.id);

    return fullItem;
  }

  async getWorkItem(itemId: string): Promise<WorkItem | null> {
    return this.items.get(itemId) ?? null;
  }

  async getWorkItemByDedupeKey(tenantId: string, dedupeKey: string): Promise<WorkItem | null> {
    const key = `${tenantId}:${dedupeKey}`;
    const itemId = this.byDedupeKey.get(key);
    return itemId ? this.items.get(itemId) ?? null : null;
  }

  async listWorkItems(tenantId: string, filter?: {
    status?: WorkItemStatus | WorkItemStatus[];
    type?: WorkItemType;
    repo?: string;
    assignedTo?: string;
    minScore?: number;
    limit?: number;
    offset?: number;
  }): Promise<WorkItem[]> {
    let results = Array.from(this.items.values()).filter(i => i.tenantId === tenantId);

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter(i => statuses.includes(i.status));
    }
    if (filter?.type) {
      results = results.filter(i => i.type === filter.type);
    }
    if (filter?.repo) {
      results = results.filter(i => i.repo?.fullName === filter.repo);
    }
    if (filter?.assignedTo) {
      results = results.filter(i => i.assignedTo === filter.assignedTo);
    }
    if (filter?.minScore !== undefined) {
      results = results.filter(i => i.score >= filter.minScore!);
    }

    // Sort by score descending, then by creation time
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async updateWorkItem(itemId: string, update: Partial<Pick<WorkItem, 'status' | 'assignedTo' | 'candidateId' | 'score' | 'scoreBreakdown'>>): Promise<WorkItem> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Work item not found: ${itemId}`);
    }
    const updated = { ...item, ...update, updatedAt: now() };
    this.items.set(itemId, updated);
    return updated;
  }

  async addSignalToWorkItem(itemId: string, signalId: string): Promise<WorkItem> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Work item not found: ${itemId}`);
    }
    if (!item.signalIds.includes(signalId)) {
      item.signalIds.push(signalId);
      item.updatedAt = now();
    }
    return item;
  }

  async countWorkItems(tenantId: string, status?: WorkItemStatus | WorkItemStatus[]): Promise<number> {
    let results = Array.from(this.items.values()).filter(i => i.tenantId === tenantId);
    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      results = results.filter(i => statuses.includes(i.status));
    }
    return results.length;
  }

  async getQueueStats(tenantId: string): Promise<{
    total: number;
    byStatus: Record<WorkItemStatus, number>;
    byType: Record<WorkItemType, number>;
    avgScore: number;
  }> {
    const items = Array.from(this.items.values()).filter(i => i.tenantId === tenantId);

    const byStatus: Record<WorkItemStatus, number> = {
      queued: 0,
      in_progress: 0,
      awaiting_approval: 0,
      approved: 0,
      rejected: 0,
      completed: 0,
      dismissed: 0,
    };

    const byType: Record<WorkItemType, number> = {
      issue_to_code: 0,
      pr_review: 0,
      pr_resolve: 0,
      docs_update: 0,
      test_gen: 0,
      custom: 0,
    };

    let totalScore = 0;
    for (const item of items) {
      byStatus[item.status]++;
      byType[item.type]++;
      totalScore += item.score;
    }

    return {
      total: items.length,
      byStatus,
      byType,
      avgScore: items.length > 0 ? Math.round(totalScore / items.length) : 0,
    };
  }
}

// =============================================================================
// In-Memory PR Candidate Store (Phase 14)
// =============================================================================

/**
 * TEMPORARY: In-memory PRCandidateStore implementation
 */
export class InMemoryPRCandidateStore implements PRCandidateStore {
  private candidates = new Map<string, PRCandidate>();
  private byWorkItemId = new Map<string, string>(); // workItemId -> candidateId

  async createCandidate(candidate: Omit<PRCandidate, 'id' | 'createdAt' | 'updatedAt' | 'approvals'>): Promise<PRCandidate> {
    const fullCandidate: PRCandidate = {
      ...candidate,
      id: generateId('prc'),
      approvals: [],
      createdAt: now(),
      updatedAt: now(),
    };
    this.candidates.set(fullCandidate.id, fullCandidate);

    // Index by work item ID
    this.byWorkItemId.set(candidate.workItemId, fullCandidate.id);

    return fullCandidate;
  }

  async getCandidate(candidateId: string): Promise<PRCandidate | null> {
    return this.candidates.get(candidateId) ?? null;
  }

  async getCandidateByWorkItemId(workItemId: string): Promise<PRCandidate | null> {
    const candidateId = this.byWorkItemId.get(workItemId);
    return candidateId ? this.candidates.get(candidateId) ?? null : null;
  }

  async listCandidates(tenantId: string, filter?: {
    status?: PRCandidateStatus | PRCandidateStatus[];
    workItemId?: string;
    limit?: number;
    offset?: number;
  }): Promise<PRCandidate[]> {
    let results = Array.from(this.candidates.values()).filter(c => c.tenantId === tenantId);

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter(c => statuses.includes(c.status));
    }
    if (filter?.workItemId) {
      results = results.filter(c => c.workItemId === filter.workItemId);
    }

    // Sort by creation time descending
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async updateCandidate(candidateId: string, update: Partial<Pick<PRCandidate, 'status' | 'patchset' | 'resultingPRUrl' | 'runId' | 'appliedAt' | 'plan' | 'risk' | 'confidence' | 'intentReceipt'>>): Promise<PRCandidate> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      throw new Error(`PR candidate not found: ${candidateId}`);
    }
    const updated = { ...candidate, ...update, updatedAt: now() };
    this.candidates.set(candidateId, updated);
    return updated;
  }

  async addApproval(candidateId: string, approval: CandidateApproval): Promise<PRCandidate> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      throw new Error(`PR candidate not found: ${candidateId}`);
    }
    candidate.approvals.push(approval);
    candidate.updatedAt = now();

    // Check if we have enough approvals
    const approvedCount = candidate.approvals.filter(a => a.decision === 'approved').length;
    if (approvedCount >= candidate.requiredApprovals && candidate.status === 'ready') {
      candidate.status = 'approved';
    }

    // Check if rejected
    if (approval.decision === 'rejected') {
      candidate.status = 'rejected';
    }

    return candidate;
  }
}
