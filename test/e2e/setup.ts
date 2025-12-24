/**
 * E2E Test Setup and Teardown
 *
 * Global test setup for E2E tests including:
 * - Database initialization
 * - Environment variable management
 * - Test isolation
 * - Global before/after hooks
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

/**
 * Environment variables to set for E2E tests
 */
const testEnv: Record<string, string> = {
  // Use in-memory storage for tests
  GWI_STORE_BACKEND: 'memory',

  // Test environment indicator
  NODE_ENV: 'test',

  // Disable external API calls
  SKIP_EXTERNAL_APIS: 'true',

  // Mock AI providers (use test keys)
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  GOOGLE_AI_API_KEY: 'test-google-key',

  // Mock GitHub
  GITHUB_TOKEN: 'test-github-token',

  // Disable rate limiting in tests
  DISABLE_RATE_LIMITING: 'true',

  // Short timeouts for faster tests
  API_TIMEOUT_MS: '5000',

  // Test database connection (if using real DB)
  DATABASE_URL: ':memory:',
};

/**
 * Original environment variables (for restoration)
 */
const originalEnv: Record<string, string | undefined> = {};

/**
 * Setup test environment
 */
export function setupTestEnvironment(): void {
  // Save original environment variables
  Object.keys(testEnv).forEach((key) => {
    originalEnv[key] = process.env[key];
  });

  // Set test environment variables
  Object.entries(testEnv).forEach(([key, value]) => {
    process.env[key] = value;
  });
}

/**
 * Restore original environment
 */
export function restoreEnvironment(): void {
  // Restore original environment variables
  Object.entries(originalEnv).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
}

/**
 * Clean up test artifacts
 */
export async function cleanupTestArtifacts(): Promise<void> {
  // Clean up .gwi directory if it exists
  // Note: In real implementation, you might want to use fs.rm or similar
  // For now, we'll keep this as a placeholder
}

/**
 * Reset all stores to initial state
 */
export async function resetStores(): Promise<void> {
  // When using memory backend, stores are automatically reset between tests
  // If using a real database, you would clear tables here
}

/**
 * Global test setup - runs once before all E2E tests
 */
export function setupGlobalE2E(): void {
  beforeAll(async () => {
    setupTestEnvironment();
    await cleanupTestArtifacts();
  });

  afterAll(async () => {
    await cleanupTestArtifacts();
    restoreEnvironment();
  });
}

/**
 * Per-test setup - runs before each E2E test
 */
export function setupPerTestE2E(): void {
  beforeEach(async () => {
    // Reset stores for test isolation
    await resetStores();
  });

  afterEach(async () => {
    // Clean up any test-specific artifacts
    await cleanupTestArtifacts();
  });
}

/**
 * Complete E2E setup (global + per-test)
 */
export function setupE2E(): void {
  setupGlobalE2E();
  setupPerTestE2E();
}

/**
 * Mock store factory for testing
 */
export function createMockStores() {
  const tenants = new Map<string, unknown>();
  const users = new Map<string, unknown>();
  const memberships = new Map<string, unknown>();
  const runs = new Map<string, unknown>();

  return {
    tenantStore: {
      createTenant: async (tenant: unknown) => {
        const id = (tenant as { id: string }).id;
        tenants.set(id, tenant);
      },
      getTenant: async (id: string) => tenants.get(id),
      listTenants: async () => Array.from(tenants.values()),
      updateTenant: async (id: string, updates: unknown) => {
        const existing = tenants.get(id);
        if (existing) {
          tenants.set(id, { ...existing, ...updates });
        }
      },
      deleteTenant: async (id: string) => {
        tenants.delete(id);
      },
    },
    userStore: {
      createUser: async (user: unknown) => {
        const id = (user as { id: string }).id;
        users.set(id, user);
      },
      getUser: async (id: string) => users.get(id),
      getUserByEmail: async (email: string) => {
        return Array.from(users.values()).find(
          (u) => (u as { email: string }).email === email
        );
      },
      updateUser: async (id: string, updates: unknown) => {
        const existing = users.get(id);
        if (existing) {
          users.set(id, { ...existing, ...updates });
        }
      },
      deleteUser: async (id: string) => {
        users.delete(id);
      },
    },
    membershipStore: {
      addMember: async (membership: unknown) => {
        const key = `${(membership as { userId: string }).userId}:${(membership as { tenantId: string }).tenantId}`;
        memberships.set(key, membership);
      },
      getMembership: async (userId: string, tenantId: string) => {
        return memberships.get(`${userId}:${tenantId}`);
      },
      listUserMemberships: async (userId: string) => {
        return Array.from(memberships.values()).filter(
          (m) => (m as { userId: string }).userId === userId
        );
      },
      listTenantMembers: async (tenantId: string) => {
        return Array.from(memberships.values()).filter(
          (m) => (m as { tenantId: string }).tenantId === tenantId
        );
      },
      updateMemberRole: async (userId: string, tenantId: string, role: string) => {
        const key = `${userId}:${tenantId}`;
        const existing = memberships.get(key);
        if (existing) {
          memberships.set(key, { ...existing, role });
        }
      },
      removeMember: async (userId: string, tenantId: string) => {
        memberships.delete(`${userId}:${tenantId}`);
      },
    },
    runStore: {
      createRun: async (run: unknown) => {
        const id = (run as { id: string }).id;
        runs.set(id, run);
        return id;
      },
      getRun: async (id: string) => runs.get(id),
      listRuns: async () => Array.from(runs.values()),
      updateRun: async (id: string, updates: unknown) => {
        const existing = runs.get(id);
        if (existing) {
          runs.set(id, { ...existing, ...updates });
        }
      },
    },
    reset: () => {
      tenants.clear();
      users.clear();
      memberships.clear();
      runs.clear();
    },
  };
}

/**
 * Wait for async operations to complete
 */
export async function waitForAsync(timeoutMs = 1000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

/**
 * Poll for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    timeoutMessage?: string;
  } = {}
): Promise<void> {
  const {
    timeoutMs = 5000,
    intervalMs = 100,
    timeoutMessage = 'Timeout waiting for condition',
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await condition();
    if (result) {
      return;
    }
    await waitForAsync(intervalMs);
  }

  throw new Error(timeoutMessage);
}

/**
 * Test isolation helper - ensures tests don't interfere with each other
 */
export class TestIsolation {
  private static instance: TestIsolation | null = null;
  private testContexts = new Map<string, Map<string, unknown>>();

  static getInstance(): TestIsolation {
    if (!TestIsolation.instance) {
      TestIsolation.instance = new TestIsolation();
    }
    return TestIsolation.instance;
  }

  /**
   * Get isolated context for a test
   */
  getContext(testId: string): Map<string, unknown> {
    if (!this.testContexts.has(testId)) {
      this.testContexts.set(testId, new Map());
    }
    return this.testContexts.get(testId)!;
  }

  /**
   * Clear context for a test
   */
  clearContext(testId: string): void {
    this.testContexts.delete(testId);
  }

  /**
   * Clear all contexts
   */
  clearAll(): void {
    this.testContexts.clear();
  }
}

/**
 * Snapshot helper for golden testing
 */
export function createSnapshot(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Compare snapshots
 */
export function compareSnapshots(actual: string, expected: string): {
  match: boolean;
  diff?: string;
} {
  if (actual === expected) {
    return { match: true };
  }

  // Simple diff - in production, use a proper diff library
  const actualLines = actual.split('\n');
  const expectedLines = expected.split('\n');
  const diffLines: string[] = [];

  const maxLines = Math.max(actualLines.length, expectedLines.length);
  for (let i = 0; i < maxLines; i++) {
    const actualLine = actualLines[i] ?? '';
    const expectedLine = expectedLines[i] ?? '';

    if (actualLine !== expectedLine) {
      diffLines.push(`Line ${i + 1}:`);
      diffLines.push(`- Expected: ${expectedLine}`);
      diffLines.push(`+ Actual:   ${actualLine}`);
    }
  }

  return {
    match: false,
    diff: diffLines.join('\n'),
  };
}

/**
 * Export all setup functions for use in test files
 */
export default {
  setupE2E,
  setupGlobalE2E,
  setupPerTestE2E,
  setupTestEnvironment,
  restoreEnvironment,
  cleanupTestArtifacts,
  resetStores,
  createMockStores,
  waitForAsync,
  waitFor,
  TestIsolation,
  createSnapshot,
  compareSnapshots,
};
