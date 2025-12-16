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
  TenantStore,
  SaaSRun,
  User,
  UserStore,
  Membership,
  MembershipStore,
} from './interfaces.js';

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

  async createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    const fullUser: User = {
      ...user,
      createdAt: now(),
      lastLoginAt: now(),
      updatedAt: now(),
    };
    this.users.set(user.id, fullUser);
    this.byGitHubId.set(user.githubUserId, user.id);
    return fullUser;
  }

  async getUser(userId: string): Promise<User | null> {
    return this.users.get(userId) ?? null;
  }

  async getUserByGitHubId(githubUserId: number): Promise<User | null> {
    const userId = this.byGitHubId.get(githubUserId);
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
