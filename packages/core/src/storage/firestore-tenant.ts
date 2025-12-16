/**
 * Firestore Tenant Store Implementation
 *
 * Production-ready TenantStore backed by Google Firestore.
 * Manages tenants, their repos, and runs with proper multi-tenant isolation.
 *
 * Collection Structure:
 * - gwi_tenants/{tenantId}
 *   - repos/{repoId}
 * - gwi_runs/{runId}  (top-level for cross-tenant queries, indexed by tenantId)
 *
 * @module @gwi/core/storage/firestore
 */

import type { Firestore, DocumentReference, Query, CollectionReference } from 'firebase-admin/firestore';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type {
  Tenant,
  TenantRepo,
  TenantStore,
  SaaSRun,
  RunType,
  RunStatus,
} from './interfaces.js';
import {
  getFirestoreClient,
  COLLECTIONS,
  timestampToDate,
  dateToTimestamp,
  generateFirestoreId,
} from './firestore-client.js';

// =============================================================================
// Firestore Document Types (with Timestamps)
// =============================================================================

interface TenantDoc {
  id: string;
  githubOrgId: number;
  githubOrgLogin: string;
  displayName: string;
  installationId: number;
  installedAt: Timestamp;
  installedBy: string;
  status: string;  // Phase 11: tenant status
  plan: string;
  planLimits: {
    runsPerMonth: number;
    reposMax: number;
    membersMax: number;
  };
  settings: {
    defaultRiskMode: string;
    defaultTriageModel: string;
    defaultCodeModel: string;
    complexityThreshold: number;
    autoRunOnConflict: boolean;
    autoRunOnPrOpen: boolean;
  };
  runsThisMonth: number;
  lastRunAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface RepoDoc {
  id: string;
  tenantId: string;
  githubRepoId: number;
  githubFullName: string;
  displayName: string;
  enabled: boolean;
  lastSyncAt?: Timestamp;
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
  addedAt: Timestamp;
  updatedAt: Timestamp;
}

interface RunDoc {
  id: string;
  tenantId: string;
  repoId: string;
  prId: string;
  prUrl: string;
  type: string;
  status: string;
  currentStep?: string;
  steps: Array<{
    id: string;
    runId: string;
    agent: string;
    status: string;
    input?: unknown;
    output?: unknown;
    error?: string;
    startedAt?: Timestamp;
    completedAt?: Timestamp;
    durationMs?: number;
    tokensUsed?: { input: number; output: number };
  }>;
  result?: unknown;
  error?: string;
  trigger: {
    source: string;
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  durationMs?: number;
}

// =============================================================================
// Conversion Functions
// =============================================================================

function tenantDocToModel(doc: TenantDoc): Tenant {
  return {
    id: doc.id,
    githubOrgId: doc.githubOrgId,
    githubOrgLogin: doc.githubOrgLogin,
    displayName: doc.displayName,
    installationId: doc.installationId,
    installedAt: timestampToDate(doc.installedAt)!,
    installedBy: doc.installedBy,
    status: (doc.status || 'active') as Tenant['status'],  // Phase 11: default to active for backward compatibility
    plan: doc.plan as Tenant['plan'],
    planLimits: doc.planLimits,
    settings: doc.settings as Tenant['settings'],
    runsThisMonth: doc.runsThisMonth,
    lastRunAt: timestampToDate(doc.lastRunAt),
    createdAt: timestampToDate(doc.createdAt)!,
    updatedAt: timestampToDate(doc.updatedAt)!,
  };
}

function tenantModelToDoc(tenant: Tenant): TenantDoc {
  return {
    id: tenant.id,
    githubOrgId: tenant.githubOrgId,
    githubOrgLogin: tenant.githubOrgLogin,
    displayName: tenant.displayName,
    installationId: tenant.installationId,
    installedAt: dateToTimestamp(tenant.installedAt)!,
    installedBy: tenant.installedBy,
    status: tenant.status,  // Phase 11: tenant status
    plan: tenant.plan,
    planLimits: tenant.planLimits,
    settings: tenant.settings,
    runsThisMonth: tenant.runsThisMonth,
    lastRunAt: dateToTimestamp(tenant.lastRunAt),
    createdAt: dateToTimestamp(tenant.createdAt)!,
    updatedAt: dateToTimestamp(tenant.updatedAt)!,
  };
}

function repoDocToModel(doc: RepoDoc): TenantRepo {
  return {
    id: doc.id,
    tenantId: doc.tenantId,
    githubRepoId: doc.githubRepoId,
    githubFullName: doc.githubFullName,
    displayName: doc.displayName,
    enabled: doc.enabled,
    lastSyncAt: timestampToDate(doc.lastSyncAt),
    settings: doc.settings as TenantRepo['settings'],
    totalRuns: doc.totalRuns,
    successfulRuns: doc.successfulRuns,
    failedRuns: doc.failedRuns,
    lastRunId: doc.lastRunId,
    addedAt: timestampToDate(doc.addedAt)!,
    updatedAt: timestampToDate(doc.updatedAt)!,
  };
}

function repoModelToDoc(repo: TenantRepo): RepoDoc {
  return {
    id: repo.id,
    tenantId: repo.tenantId,
    githubRepoId: repo.githubRepoId,
    githubFullName: repo.githubFullName,
    displayName: repo.displayName,
    enabled: repo.enabled,
    lastSyncAt: dateToTimestamp(repo.lastSyncAt),
    settings: repo.settings,
    totalRuns: repo.totalRuns,
    successfulRuns: repo.successfulRuns,
    failedRuns: repo.failedRuns,
    lastRunId: repo.lastRunId,
    addedAt: dateToTimestamp(repo.addedAt)!,
    updatedAt: dateToTimestamp(repo.updatedAt)!,
  };
}

function runDocToModel(doc: RunDoc): SaaSRun {
  return {
    id: doc.id,
    tenantId: doc.tenantId,
    repoId: doc.repoId,
    prId: doc.prId,
    prUrl: doc.prUrl,
    type: doc.type as RunType,
    status: doc.status as RunStatus,
    currentStep: doc.currentStep,
    steps: doc.steps.map(step => ({
      ...step,
      status: step.status as SaaSRun['steps'][0]['status'],
      startedAt: timestampToDate(step.startedAt),
      completedAt: timestampToDate(step.completedAt),
    })),
    result: doc.result,
    error: doc.error,
    trigger: doc.trigger as SaaSRun['trigger'],
    a2aCorrelationId: doc.a2aCorrelationId,
    tokensUsed: doc.tokensUsed,
    createdAt: timestampToDate(doc.createdAt)!,
    updatedAt: timestampToDate(doc.updatedAt)!,
    completedAt: timestampToDate(doc.completedAt),
    durationMs: doc.durationMs,
  };
}

function runModelToDoc(run: SaaSRun): RunDoc {
  return {
    id: run.id,
    tenantId: run.tenantId,
    repoId: run.repoId,
    prId: run.prId,
    prUrl: run.prUrl,
    type: run.type,
    status: run.status,
    currentStep: run.currentStep,
    steps: run.steps.map(step => ({
      ...step,
      startedAt: dateToTimestamp(step.startedAt),
      completedAt: dateToTimestamp(step.completedAt),
    })),
    result: run.result,
    error: run.error,
    trigger: run.trigger,
    a2aCorrelationId: run.a2aCorrelationId,
    tokensUsed: run.tokensUsed,
    createdAt: dateToTimestamp(run.createdAt)!,
    updatedAt: dateToTimestamp(run.updatedAt)!,
    completedAt: dateToTimestamp(run.completedAt),
    durationMs: run.durationMs,
  };
}

// =============================================================================
// Firestore Tenant Store Implementation
// =============================================================================

/**
 * Firestore-backed TenantStore implementation
 *
 * Provides production-ready multi-tenant storage with:
 * - Tenant CRUD operations
 * - Repo management within tenants
 * - Run management scoped to tenants
 * - Proper Firestore indexing for queries
 */
export class FirestoreTenantStore implements TenantStore {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreClient();
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private tenantsRef(): CollectionReference {
    return this.db.collection(COLLECTIONS.TENANTS);
  }

  private tenantDoc(tenantId: string): DocumentReference {
    return this.tenantsRef().doc(tenantId);
  }

  private reposRef(tenantId: string): CollectionReference {
    return this.tenantDoc(tenantId).collection(COLLECTIONS.REPOS);
  }

  private repoDoc(tenantId: string, repoId: string): DocumentReference {
    return this.reposRef(tenantId).doc(repoId);
  }

  private runsRef(): CollectionReference {
    return this.db.collection(COLLECTIONS.RUNS);
  }

  private runDoc(runId: string): DocumentReference {
    return this.runsRef().doc(runId);
  }

  // ---------------------------------------------------------------------------
  // Tenant CRUD
  // ---------------------------------------------------------------------------

  async createTenant(tenant: Omit<Tenant, 'createdAt' | 'updatedAt'>): Promise<Tenant> {
    const now = new Date();
    const fullTenant: Tenant = {
      ...tenant,
      createdAt: now,
      updatedAt: now,
    };

    const doc = tenantModelToDoc(fullTenant);
    await this.tenantDoc(tenant.id).set(doc);

    return fullTenant;
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const snapshot = await this.tenantDoc(tenantId).get();

    if (!snapshot.exists) {
      return null;
    }

    return tenantDocToModel(snapshot.data() as TenantDoc);
  }

  async updateTenant(tenantId: string, update: Partial<Tenant>): Promise<Tenant> {
    const existing = await this.getTenant(tenantId);
    if (!existing) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const updated: Tenant = {
      ...existing,
      ...update,
      id: existing.id, // Never change ID
      createdAt: existing.createdAt, // Never change createdAt
      updatedAt: new Date(),
    };

    const doc = tenantModelToDoc(updated);
    await this.tenantDoc(tenantId).set(doc, { merge: true });

    return updated;
  }

  async deleteTenant(tenantId: string): Promise<void> {
    // Delete all repos first
    const reposSnapshot = await this.reposRef(tenantId).get();
    const batch = this.db.batch();

    for (const doc of reposSnapshot.docs) {
      batch.delete(doc.ref);
    }

    // Delete all runs for this tenant
    const runsSnapshot = await this.runsRef()
      .where('tenantId', '==', tenantId)
      .get();

    for (const doc of runsSnapshot.docs) {
      batch.delete(doc.ref);
    }

    // Delete the tenant document
    batch.delete(this.tenantDoc(tenantId));

    await batch.commit();
  }

  // ---------------------------------------------------------------------------
  // Repo Management
  // ---------------------------------------------------------------------------

  async addRepo(
    tenantId: string,
    repo: Omit<TenantRepo, 'addedAt' | 'updatedAt'>
  ): Promise<TenantRepo> {
    const now = new Date();
    const fullRepo: TenantRepo = {
      ...repo,
      addedAt: now,
      updatedAt: now,
    };

    const doc = repoModelToDoc(fullRepo);
    await this.repoDoc(tenantId, repo.id).set(doc);

    return fullRepo;
  }

  async getRepo(tenantId: string, repoId: string): Promise<TenantRepo | null> {
    const snapshot = await this.repoDoc(tenantId, repoId).get();

    if (!snapshot.exists) {
      return null;
    }

    return repoDocToModel(snapshot.data() as RepoDoc);
  }

  async listRepos(
    tenantId: string,
    filter?: { enabled?: boolean }
  ): Promise<TenantRepo[]> {
    let query: Query = this.reposRef(tenantId);

    if (filter?.enabled !== undefined) {
      query = query.where('enabled', '==', filter.enabled);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => repoDocToModel(doc.data() as RepoDoc));
  }

  async updateRepo(
    tenantId: string,
    repoId: string,
    update: Partial<TenantRepo>
  ): Promise<TenantRepo> {
    const existing = await this.getRepo(tenantId, repoId);
    if (!existing) {
      throw new Error(`Repo not found: ${repoId}`);
    }

    const updated: TenantRepo = {
      ...existing,
      ...update,
      id: existing.id, // Never change ID
      tenantId: existing.tenantId, // Never change tenantId
      addedAt: existing.addedAt, // Never change addedAt
      updatedAt: new Date(),
    };

    const doc = repoModelToDoc(updated);
    await this.repoDoc(tenantId, repoId).set(doc, { merge: true });

    return updated;
  }

  async removeRepo(tenantId: string, repoId: string): Promise<void> {
    await this.repoDoc(tenantId, repoId).delete();
  }

  // ---------------------------------------------------------------------------
  // Run Management
  // ---------------------------------------------------------------------------

  async createRun(
    tenantId: string,
    run: Omit<SaaSRun, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<SaaSRun> {
    const now = new Date();
    const runId = generateFirestoreId('run');

    const fullRun: SaaSRun = {
      ...run,
      id: runId,
      tenantId, // Ensure tenantId is set
      createdAt: now,
      updatedAt: now,
    };

    const doc = runModelToDoc(fullRun);
    await this.runDoc(runId).set(doc);

    // Update tenant's run count
    await this.tenantDoc(tenantId).update({
      runsThisMonth: FieldValue.increment(1),
      lastRunAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Update repo's run count
    if (run.repoId) {
      await this.repoDoc(tenantId, run.repoId).update({
        totalRuns: FieldValue.increment(1),
        lastRunId: runId,
        updatedAt: Timestamp.now(),
      });
    }

    return fullRun;
  }

  async getRun(tenantId: string, runId: string): Promise<SaaSRun | null> {
    const snapshot = await this.runDoc(runId).get();

    if (!snapshot.exists) {
      return null;
    }

    const run = runDocToModel(snapshot.data() as RunDoc);

    // Verify tenant ownership
    if (run.tenantId !== tenantId) {
      return null; // Don't expose runs from other tenants
    }

    return run;
  }

  async listRuns(
    tenantId: string,
    filter?: {
      repoId?: string;
      type?: RunType;
      status?: RunStatus;
      limit?: number;
    }
  ): Promise<SaaSRun[]> {
    let query: Query = this.runsRef().where('tenantId', '==', tenantId);

    if (filter?.repoId) {
      query = query.where('repoId', '==', filter.repoId);
    }
    if (filter?.type) {
      query = query.where('type', '==', filter.type);
    }
    if (filter?.status) {
      query = query.where('status', '==', filter.status);
    }

    query = query.orderBy('createdAt', 'desc');

    const limit = filter?.limit ?? 20;
    query = query.limit(limit);

    const snapshot = await query.get();
    return snapshot.docs.map(doc => runDocToModel(doc.data() as RunDoc));
  }

  async updateRun(
    tenantId: string,
    runId: string,
    update: Partial<SaaSRun>
  ): Promise<SaaSRun> {
    const existing = await this.getRun(tenantId, runId);
    if (!existing) {
      throw new Error(`Run not found: ${runId}`);
    }

    const updated: SaaSRun = {
      ...existing,
      ...update,
      id: existing.id, // Never change ID
      tenantId: existing.tenantId, // Never change tenantId
      createdAt: existing.createdAt, // Never change createdAt
      updatedAt: new Date(),
    };

    // Calculate duration if completing
    if (
      (update.status === 'completed' || update.status === 'failed' || update.status === 'cancelled') &&
      !updated.completedAt
    ) {
      updated.completedAt = new Date();
      updated.durationMs = updated.completedAt.getTime() - updated.createdAt.getTime();
    }

    const doc = runModelToDoc(updated);
    await this.runDoc(runId).set(doc, { merge: true });

    // Update repo stats on completion
    if (update.status === 'completed' && existing.repoId) {
      await this.repoDoc(tenantId, existing.repoId).update({
        successfulRuns: FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });
    } else if (update.status === 'failed' && existing.repoId) {
      await this.repoDoc(tenantId, existing.repoId).update({
        failedRuns: FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });
    }

    return updated;
  }
}
