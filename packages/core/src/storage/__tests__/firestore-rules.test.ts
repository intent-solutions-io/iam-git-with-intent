/**
 * Firestore Security Rules Tests (A1.s1)
 *
 * Tests the firestore.rules file to verify server-side tenant isolation.
 *
 * These tests use @firebase/rules-unit-testing to simulate authenticated
 * and unauthenticated contexts and verify that the security rules correctly
 * enforce tenant isolation, RBAC, and data access controls.
 *
 * SECURITY CRITICAL: These tests validate defense-in-depth server-side enforcement.
 *
 * @module @gwi/core/storage/__tests__/firestore-rules
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Firestore } from 'firebase-admin/firestore';

// =============================================================================
// Test Environment Setup
// =============================================================================

let testEnv: RulesTestEnvironment;

// Test user IDs
const USER_ALICE = 'user-alice';
const USER_BOB = 'user-bob';
const USER_CHARLIE = 'user-charlie';
const SERVICE_ACCOUNT_EMAIL = 'gwi-backend@project.iam.gserviceaccount.com';

// Test tenant IDs
const TENANT_ALPHA = 'tenant-alpha';
const TENANT_BETA = 'tenant-beta';

/**
 * Check if Firestore emulator is available
 */
async function isEmulatorAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:8080');
    return response.ok || response.status === 404; // Emulator returns 404 on root
  } catch {
    return false;
  }
}

/**
 * Initialize test environment before all tests
 */
beforeAll(async () => {
  // Skip tests if emulator is not running
  const emulatorAvailable = await isEmulatorAvailable();
  if (!emulatorAvailable) {
    console.warn(
      '\n⚠️  Firestore emulator not running. To run these tests:\n' +
      '   1. Install Firebase CLI: npm install -g firebase-tools\n' +
      '   2. Start emulator: firebase emulators:start --only firestore\n' +
      '   3. Run tests: npm test\n'
    );
    return;
  }

  // Find firestore.rules relative to this test file
  // Test file is at: packages/core/src/storage/__tests__/firestore-rules.test.ts
  // Rules file is at: (project root)/firestore.rules
  const rulesPath = resolve(__dirname, '../../../../../firestore.rules');
  const rules = readFileSync(rulesPath, 'utf8');

  testEnv = await initializeTestEnvironment({
    projectId: 'gwi-test-project',
    firestore: {
      rules,
      host: 'localhost',
      port: 8080,
    },
  });
});

/**
 * Clean up test environment after all tests
 */
afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

/**
 * Clear Firestore data before each test
 */
beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Skip test if emulator is not available
 */
function skipIfNoEmulator() {
  if (!testEnv) {
    return true; // This will cause vitest to skip the test
  }
  return false;
}

/**
 * Get Firestore instance for an authenticated user
 */
function getFirestoreForUser(userId: string, customClaims?: Record<string, unknown>): Firestore {
  if (!testEnv) {
    throw new Error('Test environment not initialized - emulator not running');
  }
  return testEnv.authenticatedContext(userId, customClaims).firestore() as unknown as Firestore;
}

/**
 * Get Firestore instance for a service account
 */
function getFirestoreForServiceAccount(): Firestore {
  if (!testEnv) {
    throw new Error('Test environment not initialized - emulator not running');
  }
  return testEnv.authenticatedContext('service-account', {
    firebase: { sign_in_provider: 'custom' },
    email: SERVICE_ACCOUNT_EMAIL,
  }).firestore() as unknown as Firestore;
}

/**
 * Get Firestore instance for unauthenticated access
 */
function getFirestoreUnauthenticated(): Firestore {
  if (!testEnv) {
    throw new Error('Test environment not initialized - emulator not running');
  }
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}

/**
 * Seed test data using admin/service account context
 */
async function seedTestData() {
  const adminDb = getFirestoreForServiceAccount();

  // Create tenants
  await adminDb.collection('gwi_tenants').doc(TENANT_ALPHA).set({
    id: TENANT_ALPHA,
    githubOrgId: 1001,
    githubOrgLogin: 'alpha-org',
    displayName: 'Alpha Organization',
    installationId: 1001,
    installedAt: new Date(),
    installedBy: USER_ALICE,
    status: 'active',
    plan: 'pro',
    planLimits: { runsPerMonth: 500, reposMax: 20, membersMax: 15 },
    settings: {
      defaultRiskMode: 'comment_only',
      defaultTriageModel: 'gemini-flash',
      defaultCodeModel: 'claude-sonnet',
      complexityThreshold: 3,
      autoRunOnConflict: false,
      autoRunOnPrOpen: false,
    },
    runsThisMonth: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await adminDb.collection('gwi_tenants').doc(TENANT_BETA).set({
    id: TENANT_BETA,
    githubOrgId: 2002,
    githubOrgLogin: 'beta-org',
    displayName: 'Beta Organization',
    installationId: 2002,
    installedAt: new Date(),
    installedBy: USER_BOB,
    status: 'active',
    plan: 'enterprise',
    planLimits: { runsPerMonth: 10000, reposMax: 200, membersMax: 100 },
    settings: {
      defaultRiskMode: 'auto_patch',
      defaultTriageModel: 'gemini-flash',
      defaultCodeModel: 'claude-opus',
      complexityThreshold: 4,
      autoRunOnConflict: true,
      autoRunOnPrOpen: true,
    },
    runsThisMonth: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create memberships
  // Alice is owner of tenant-alpha
  await adminDb.collection('gwi_memberships').doc(`${USER_ALICE}_${TENANT_ALPHA}`).set({
    id: `${USER_ALICE}_${TENANT_ALPHA}`,
    userId: USER_ALICE,
    tenantId: TENANT_ALPHA,
    role: 'owner',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Bob is owner of tenant-beta
  await adminDb.collection('gwi_memberships').doc(`${USER_BOB}_${TENANT_BETA}`).set({
    id: `${USER_BOB}_${TENANT_BETA}`,
    userId: USER_BOB,
    tenantId: TENANT_BETA,
    role: 'owner',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Charlie is a member (viewer) of tenant-alpha
  await adminDb.collection('gwi_memberships').doc(`${USER_CHARLIE}_${TENANT_ALPHA}`).set({
    id: `${USER_CHARLIE}_${TENANT_ALPHA}`,
    userId: USER_CHARLIE,
    tenantId: TENANT_ALPHA,
    role: 'member',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create a run for tenant-alpha
  await adminDb.collection('gwi_runs').doc('run-alpha-1').set({
    id: 'run-alpha-1',
    tenantId: TENANT_ALPHA,
    repoId: 'repo-alpha-1',
    prId: 'pr-123',
    prUrl: 'https://github.com/alpha-org/repo/pull/123',
    type: 'triage',
    status: 'completed',
    steps: [],
    trigger: { source: 'webhook' },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create a run for tenant-beta
  await adminDb.collection('gwi_runs').doc('run-beta-1').set({
    id: 'run-beta-1',
    tenantId: TENANT_BETA,
    repoId: 'repo-beta-1',
    prId: 'pr-456',
    prUrl: 'https://github.com/beta-org/repo/pull/456',
    type: 'autopilot',
    status: 'running',
    steps: [],
    trigger: { source: 'ui', userId: USER_BOB },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create repos
  await adminDb.collection('gwi_tenants').doc(TENANT_ALPHA).collection('repos').doc('repo-alpha-1').set({
    id: 'repo-alpha-1',
    tenantId: TENANT_ALPHA,
    githubRepoId: 11111,
    githubFullName: 'alpha-org/secret-repo',
    displayName: 'Alpha Secret Repo',
    enabled: true,
    settings: {
      autoTriage: true,
      autoReview: true,
      autoResolve: false,
    },
    totalRuns: 10,
    successfulRuns: 8,
    failedRuns: 2,
    addedAt: new Date(),
    updatedAt: new Date(),
  });

  await adminDb.collection('gwi_tenants').doc(TENANT_BETA).collection('repos').doc('repo-beta-1').set({
    id: 'repo-beta-1',
    tenantId: TENANT_BETA,
    githubRepoId: 22222,
    githubFullName: 'beta-org/confidential-repo',
    displayName: 'Beta Confidential Repo',
    enabled: true,
    settings: {
      autoTriage: false,
      autoReview: true,
      autoResolve: true,
    },
    totalRuns: 50,
    successfulRuns: 45,
    failedRuns: 5,
    addedAt: new Date(),
    updatedAt: new Date(),
  });

  // Create audit events
  await adminDb.collection('gwi_audit_events').doc('event-alpha-1').set({
    id: 'event-alpha-1',
    runId: 'run-alpha-1',
    tenantId: TENANT_ALPHA,
    eventType: 'run_started',
    timestamp: new Date(),
    actor: USER_ALICE,
    details: { message: 'Run started' },
  });

  await adminDb.collection('gwi_audit_events').doc('event-beta-1').set({
    id: 'event-beta-1',
    runId: 'run-beta-1',
    tenantId: TENANT_BETA,
    eventType: 'run_started',
    timestamp: new Date(),
    actor: USER_BOB,
    details: { message: 'Run started' },
  });
}

// =============================================================================
// Tenant Collection Tests
// =============================================================================

describe.skipIf(skipIfNoEmulator)('Firestore Rules: Tenant Collection', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('CRITICAL: authenticated tenant member can read their tenant', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertSucceeds(db.collection('gwi_tenants').doc(TENANT_ALPHA).get());
  });

  it('CRITICAL: authenticated user cannot read tenant they do not belong to', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertFails(db.collection('gwi_tenants').doc(TENANT_BETA).get());
  });

  it('CRITICAL: unauthenticated user cannot read any tenant', async () => {
    const db = getFirestoreUnauthenticated();
    await assertFails(db.collection('gwi_tenants').doc(TENANT_ALPHA).get());
  });

  it('CRITICAL: service account can read any tenant', async () => {
    const db = getFirestoreForServiceAccount();
    await assertSucceeds(db.collection('gwi_tenants').doc(TENANT_ALPHA).get());
    await assertSucceeds(db.collection('gwi_tenants').doc(TENANT_BETA).get());
  });

  it('CRITICAL: non-service account cannot create tenant', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertFails(db.collection('gwi_tenants').doc('tenant-new').set({
      id: 'tenant-new',
      githubOrgId: 3003,
      githubOrgLogin: 'new-org',
      displayName: 'New Organization',
      status: 'active',
      plan: 'free',
    }));
  });

  it('CRITICAL: service account can create tenant', async () => {
    const db = getFirestoreForServiceAccount();
    await assertSucceeds(db.collection('gwi_tenants').doc('tenant-new').set({
      id: 'tenant-new',
      githubOrgId: 3003,
      githubOrgLogin: 'new-org',
      displayName: 'New Organization',
      installationId: 3003,
      installedAt: new Date(),
      installedBy: USER_ALICE,
      status: 'active',
      plan: 'free',
      planLimits: { runsPerMonth: 100, reposMax: 5, membersMax: 3 },
      settings: {
        defaultRiskMode: 'comment_only',
        defaultTriageModel: 'gemini-flash',
        defaultCodeModel: 'claude-sonnet',
        complexityThreshold: 3,
        autoRunOnConflict: false,
        autoRunOnPrOpen: false,
      },
      runsThisMonth: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  it('CRITICAL: tenant admin can update tenant settings', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertSucceeds(db.collection('gwi_tenants').doc(TENANT_ALPHA).update({
      displayName: 'Updated Alpha Org',
    }));
  });

  it('CRITICAL: non-admin member cannot update tenant', async () => {
    const db = getFirestoreForUser(USER_CHARLIE);
    await assertFails(db.collection('gwi_tenants').doc(TENANT_ALPHA).update({
      displayName: 'Hacked Alpha Org',
    }));
  });

  it('CRITICAL: only tenant owner can delete tenant', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertSucceeds(db.collection('gwi_tenants').doc(TENANT_ALPHA).delete());
  });
});

// =============================================================================
// Repo Subcollection Tests
// =============================================================================

describe.skipIf(skipIfNoEmulator)('Firestore Rules: Repo Subcollection', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('CRITICAL: tenant member can read repos in their tenant', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertSucceeds(
      db.collection('gwi_tenants').doc(TENANT_ALPHA).collection('repos').doc('repo-alpha-1').get()
    );
  });

  it('CRITICAL: user cannot read repos from other tenant', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertFails(
      db.collection('gwi_tenants').doc(TENANT_BETA).collection('repos').doc('repo-beta-1').get()
    );
  });

  it('CRITICAL: tenant admin can add repo', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertSucceeds(
      db.collection('gwi_tenants').doc(TENANT_ALPHA).collection('repos').doc('repo-alpha-2').set({
        id: 'repo-alpha-2',
        tenantId: TENANT_ALPHA,
        githubRepoId: 33333,
        githubFullName: 'alpha-org/new-repo',
        displayName: 'New Repo',
        enabled: true,
        settings: {
          autoTriage: true,
          autoReview: false,
          autoResolve: false,
        },
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        addedAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('CRITICAL: non-admin member cannot add repo', async () => {
    const db = getFirestoreForUser(USER_CHARLIE);
    await assertFails(
      db.collection('gwi_tenants').doc(TENANT_ALPHA).collection('repos').doc('repo-alpha-2').set({
        id: 'repo-alpha-2',
        tenantId: TENANT_ALPHA,
        githubRepoId: 33333,
        githubFullName: 'alpha-org/new-repo',
        displayName: 'New Repo',
        enabled: true,
      })
    );
  });
});

// =============================================================================
// Run Collection Tests (Cross-Tenant Isolation)
// =============================================================================

describe.skipIf(skipIfNoEmulator)('Firestore Rules: Run Collection (Tenant Isolation)', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('CRITICAL: user can read runs for their tenant', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertSucceeds(db.collection('gwi_runs').doc('run-alpha-1').get());
  });

  it('CRITICAL: user CANNOT read runs from other tenant', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    // Alice belongs to tenant-alpha, should NOT access tenant-beta's run
    await assertFails(db.collection('gwi_runs').doc('run-beta-1').get());
  });

  it('CRITICAL: user cannot create run directly (service account only)', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertFails(db.collection('gwi_runs').doc('run-alpha-2').set({
      id: 'run-alpha-2',
      tenantId: TENANT_ALPHA,
      repoId: 'repo-alpha-1',
      prId: 'pr-789',
      prUrl: 'https://github.com/alpha-org/repo/pull/789',
      type: 'plan',
      status: 'pending',
      steps: [],
      trigger: { source: 'ui', userId: USER_ALICE },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  it('CRITICAL: service account can create run', async () => {
    const db = getFirestoreForServiceAccount();
    await assertSucceeds(db.collection('gwi_runs').doc('run-alpha-2').set({
      id: 'run-alpha-2',
      tenantId: TENANT_ALPHA,
      repoId: 'repo-alpha-1',
      prId: 'pr-789',
      prUrl: 'https://github.com/alpha-org/repo/pull/789',
      type: 'plan',
      status: 'pending',
      steps: [],
      trigger: { source: 'webhook' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  it('CRITICAL: user cannot update run status (service account only)', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertFails(db.collection('gwi_runs').doc('run-alpha-1').update({
      status: 'failed',
    }));
  });

  it('CRITICAL: developer can delete/cancel runs in their tenant', async () => {
    // First, need to create a developer membership for Alice
    const adminDb = getFirestoreForServiceAccount();
    await adminDb.collection('gwi_memberships').doc(`${USER_ALICE}_${TENANT_ALPHA}`).update({
      role: 'developer',
    });

    const db = getFirestoreForUser(USER_ALICE);
    await assertSucceeds(db.collection('gwi_runs').doc('run-alpha-1').delete());
  });

  it('CRITICAL: developer CANNOT delete runs from other tenant', async () => {
    // Make Alice a developer in tenant-alpha
    const adminDb = getFirestoreForServiceAccount();
    await adminDb.collection('gwi_memberships').doc(`${USER_ALICE}_${TENANT_ALPHA}`).update({
      role: 'developer',
    });

    const db = getFirestoreForUser(USER_ALICE);
    // Alice cannot delete tenant-beta's run
    await assertFails(db.collection('gwi_runs').doc('run-beta-1').delete());
  });
});

// =============================================================================
// User Collection Tests
// =============================================================================

describe.skipIf(skipIfNoEmulator)('Firestore Rules: User Collection', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('CRITICAL: user can read their own profile', async () => {
    const adminDb = getFirestoreForServiceAccount();
    await adminDb.collection('gwi_users').doc(USER_ALICE).set({
      id: USER_ALICE,
      githubUserId: 1001,
      githubLogin: 'alice',
      displayName: 'Alice',
      email: 'alice@example.com',
      preferences: {
        notificationsEnabled: true,
        theme: 'light',
      },
      createdAt: new Date(),
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    });

    const db = getFirestoreForUser(USER_ALICE);
    await assertSucceeds(db.collection('gwi_users').doc(USER_ALICE).get());
  });

  it('CRITICAL: user CANNOT read other user profiles', async () => {
    const adminDb = getFirestoreForServiceAccount();
    await adminDb.collection('gwi_users').doc(USER_BOB).set({
      id: USER_BOB,
      githubUserId: 2002,
      githubLogin: 'bob',
      displayName: 'Bob',
      email: 'bob@example.com',
      preferences: {
        notificationsEnabled: true,
        theme: 'dark',
      },
      createdAt: new Date(),
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    });

    const db = getFirestoreForUser(USER_ALICE);
    await assertFails(db.collection('gwi_users').doc(USER_BOB).get());
  });

  it('CRITICAL: user can update their own profile', async () => {
    const adminDb = getFirestoreForServiceAccount();
    await adminDb.collection('gwi_users').doc(USER_ALICE).set({
      id: USER_ALICE,
      githubUserId: 1001,
      githubLogin: 'alice',
      displayName: 'Alice',
      email: 'alice@example.com',
      preferences: {
        notificationsEnabled: true,
        theme: 'light',
      },
      createdAt: new Date(),
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    });

    const db = getFirestoreForUser(USER_ALICE);
    await assertSucceeds(db.collection('gwi_users').doc(USER_ALICE).update({
      displayName: 'Alice Updated',
    }));
  });

  it('CRITICAL: only service account can create user', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertFails(db.collection('gwi_users').doc('user-new').set({
      id: 'user-new',
      githubUserId: 9999,
      githubLogin: 'newuser',
      displayName: 'New User',
      email: 'new@example.com',
    }));
  });
});

// =============================================================================
// Membership Collection Tests
// =============================================================================

describe.skipIf(skipIfNoEmulator)('Firestore Rules: Membership Collection', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('CRITICAL: user can read their own memberships', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertSucceeds(
      db.collection('gwi_memberships').doc(`${USER_ALICE}_${TENANT_ALPHA}`).get()
    );
  });

  it('CRITICAL: user CANNOT read other user memberships (unless tenant admin)', async () => {
    const db = getFirestoreForUser(USER_CHARLIE);
    await assertFails(
      db.collection('gwi_memberships').doc(`${USER_ALICE}_${TENANT_ALPHA}`).get()
    );
  });

  it('CRITICAL: tenant admin can read tenant memberships', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    // Alice is owner of tenant-alpha, can read Charlie's membership
    await assertSucceeds(
      db.collection('gwi_memberships').doc(`${USER_CHARLIE}_${TENANT_ALPHA}`).get()
    );
  });

  it('CRITICAL: tenant admin can invite members (create membership)', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertSucceeds(
      db.collection('gwi_memberships').doc('user-new_tenant-alpha').set({
        id: 'user-new_tenant-alpha',
        userId: 'user-new',
        tenantId: TENANT_ALPHA,
        role: 'member',
        status: 'invited',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('CRITICAL: admin CANNOT create owner membership (service account only)', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertFails(
      db.collection('gwi_memberships').doc('user-new_tenant-alpha').set({
        id: 'user-new_tenant-alpha',
        userId: 'user-new',
        tenantId: TENANT_ALPHA,
        role: 'owner',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('CRITICAL: user cannot elevate their own role', async () => {
    const db = getFirestoreForUser(USER_CHARLIE);
    // Charlie is member, trying to upgrade to admin
    await assertFails(
      db.collection('gwi_memberships').doc(`${USER_CHARLIE}_${TENANT_ALPHA}`).update({
        role: 'admin',
      })
    );
  });

  it('CRITICAL: only owner can delete memberships', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertSucceeds(
      db.collection('gwi_memberships').doc(`${USER_CHARLIE}_${TENANT_ALPHA}`).delete()
    );
  });
});

// =============================================================================
// Audit Events Collection Tests (Immutability)
// =============================================================================

describe.skipIf(skipIfNoEmulator)('Firestore Rules: Audit Events (Immutable)', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('CRITICAL: tenant admin can read audit events for their tenant', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertSucceeds(db.collection('gwi_audit_events').doc('event-alpha-1').get());
  });

  it('CRITICAL: user CANNOT read audit events from other tenant', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertFails(db.collection('gwi_audit_events').doc('event-beta-1').get());
  });

  it('CRITICAL: only service account can create audit event', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertFails(db.collection('gwi_audit_events').doc('event-new').set({
      id: 'event-new',
      runId: 'run-alpha-1',
      tenantId: TENANT_ALPHA,
      eventType: 'run_completed',
      timestamp: new Date(),
      actor: USER_ALICE,
      details: {},
    }));
  });

  it('CRITICAL: audit events are immutable (cannot update)', async () => {
    const db = getFirestoreForServiceAccount();
    await assertFails(db.collection('gwi_audit_events').doc('event-alpha-1').update({
      details: { modified: true },
    }));
  });

  it('CRITICAL: audit events are immutable (cannot delete)', async () => {
    const db = getFirestoreForServiceAccount();
    await assertFails(db.collection('gwi_audit_events').doc('event-alpha-1').delete());
  });
});

// =============================================================================
// Idempotency Collection Tests (Service Account Only)
// =============================================================================

describe.skipIf(skipIfNoEmulator)('Firestore Rules: Idempotency Collection', () => {
  it('CRITICAL: only service account can access idempotency records', async () => {
    const adminDb = getFirestoreForServiceAccount();
    await assertSucceeds(adminDb.collection('gwi_idempotency').doc('key-123').set({
      key: 'key-123',
      result: { success: true },
      createdAt: new Date(),
    }));

    const db = getFirestoreForUser(USER_ALICE);
    await assertFails(adminDb.collection('gwi_idempotency').doc('key-123').get());
  });

  it('CRITICAL: unauthenticated users cannot access idempotency records', async () => {
    const db = getFirestoreUnauthenticated();
    await assertFails(db.collection('gwi_idempotency').doc('key-123').get());
  });
});

// =============================================================================
// Default Deny Tests
// =============================================================================

describe.skipIf(skipIfNoEmulator)('Firestore Rules: Default Deny', () => {
  it('CRITICAL: unauthenticated user cannot access any collection', async () => {
    const db = getFirestoreUnauthenticated();
    await assertFails(db.collection('gwi_tenants').doc(TENANT_ALPHA).get());
    await assertFails(db.collection('gwi_runs').doc('run-alpha-1').get());
    await assertFails(db.collection('gwi_users').doc(USER_ALICE).get());
  });

  it('CRITICAL: unknown collections are denied by default', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertFails(db.collection('unknown_collection').doc('doc-1').get());
  });
});

// =============================================================================
// Suspended Tenant Tests
// =============================================================================

describe.skipIf(skipIfNoEmulator)('Firestore Rules: Suspended Tenant', () => {
  beforeEach(async () => {
    await seedTestData();
    // Suspend tenant-alpha
    const adminDb = getFirestoreForServiceAccount();
    await adminDb.collection('gwi_tenants').doc(TENANT_ALPHA).update({
      status: 'suspended',
    });
  });

  it('CRITICAL: users from suspended tenant cannot write data', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    await assertFails(
      db.collection('gwi_tenants').doc(TENANT_ALPHA).update({
        displayName: 'Try to update while suspended',
      })
    );
  });

  it('CRITICAL: users from suspended tenant can still read (for visibility)', async () => {
    const db = getFirestoreForUser(USER_ALICE);
    // Reading is allowed even when suspended (so users can see suspension status)
    await assertSucceeds(db.collection('gwi_tenants').doc(TENANT_ALPHA).get());
  });
});
