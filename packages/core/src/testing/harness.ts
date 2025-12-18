/**
 * Deterministic Test Harness
 *
 * Phase 38: Framework for reproducible E2E tests.
 *
 * Features:
 * - Deterministic timestamps
 * - Seeded random values
 * - API mocking
 * - Test isolation
 * - Golden file comparison
 *
 * @module @gwi/core/testing/harness
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Test harness configuration
 */
export interface HarnessConfig {
  /** Seed for deterministic random values */
  seed: number;
  /** Fixed timestamp for tests */
  fixedTimestamp?: Date;
  /** Test timeout in milliseconds */
  timeout: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Retry delay in milliseconds */
  retryDelay: number;
  /** Whether to capture snapshots */
  captureSnapshots: boolean;
  /** Snapshot directory */
  snapshotDir: string;
}

/**
 * Mock API response
 */
export interface MockResponse {
  /** HTTP status code */
  status: number;
  /** Response body */
  body: unknown;
  /** Response headers */
  headers?: Record<string, string>;
  /** Delay in milliseconds */
  delay?: number;
}

/**
 * Mock API configuration
 */
export interface MockApiConfig {
  /** URL pattern to match */
  pattern: string | RegExp;
  /** HTTP method (GET, POST, etc.) */
  method?: string;
  /** Response to return */
  response: MockResponse | ((req: MockRequest) => MockResponse | Promise<MockResponse>);
}

/**
 * Mock request details
 */
export interface MockRequest {
  /** Request URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Request headers */
  headers: Record<string, string>;
  /** Request body */
  body?: unknown;
}

/**
 * Test result
 */
export interface TestResult {
  /** Test name */
  name: string;
  /** Whether test passed */
  passed: boolean;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error if failed */
  error?: string;
  /** Snapshot comparison result */
  snapshotMatch?: boolean;
  /** Retry count */
  retryCount: number;
}

/**
 * Snapshot data
 */
export interface Snapshot {
  /** Snapshot name */
  name: string;
  /** Snapshot data */
  data: unknown;
  /** Snapshot timestamp */
  timestamp: Date;
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default harness configuration
 */
export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  seed: 12345,
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  captureSnapshots: false,
  snapshotDir: '__snapshots__',
};

// =============================================================================
// Deterministic Utilities
// =============================================================================

/**
 * Seeded random number generator (Mulberry32)
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /**
   * Generate next random number between 0 and 1
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generate random integer in range [min, max]
   */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Pick random element from array
   */
  pick<T>(array: T[]): T {
    return array[this.int(0, array.length - 1)];
  }

  /**
   * Shuffle array in place
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Generate random string
   */
  string(length: number, charset = 'abcdefghijklmnopqrstuvwxyz0123456789'): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[this.int(0, charset.length - 1)];
    }
    return result;
  }

  /**
   * Generate random UUID (v4-like)
   */
  uuid(): string {
    const hex = () => this.int(0, 15).toString(16);
    return (
      hex() + hex() + hex() + hex() + hex() + hex() + hex() + hex() + '-' +
      hex() + hex() + hex() + hex() + '-4' +
      hex() + hex() + hex() + '-' +
      ['8', '9', 'a', 'b'][this.int(0, 3)] + hex() + hex() + hex() + '-' +
      hex() + hex() + hex() + hex() + hex() + hex() + hex() + hex() + hex() + hex() + hex() + hex()
    );
  }
}

/**
 * Fixed clock for deterministic timestamps
 */
export class FixedClock {
  private currentTime: Date;
  private advanceMs: number;

  constructor(initialTime: Date, advanceMs = 1000) {
    this.currentTime = new Date(initialTime);
    this.advanceMs = advanceMs;
  }

  /**
   * Get current time
   */
  now(): Date {
    return new Date(this.currentTime);
  }

  /**
   * Get current timestamp (ms)
   */
  timestamp(): number {
    return this.currentTime.getTime();
  }

  /**
   * Advance clock by configured amount
   */
  tick(): Date {
    this.currentTime = new Date(this.currentTime.getTime() + this.advanceMs);
    return this.now();
  }

  /**
   * Advance clock by specific amount
   */
  advance(ms: number): Date {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
    return this.now();
  }

  /**
   * Set specific time
   */
  set(time: Date): void {
    this.currentTime = new Date(time);
  }
}

// =============================================================================
// Test Harness
// =============================================================================

/**
 * Deterministic test harness
 */
export class TestHarness {
  private config: HarnessConfig;
  private random: SeededRandom;
  private clock: FixedClock;
  private mocks: MockApiConfig[] = [];
  private snapshots: Map<string, Snapshot> = new Map();
  private results: TestResult[] = [];

  constructor(config: Partial<HarnessConfig> = {}) {
    this.config = { ...DEFAULT_HARNESS_CONFIG, ...config };
    this.random = new SeededRandom(this.config.seed);
    this.clock = new FixedClock(
      this.config.fixedTimestamp || new Date('2025-01-01T00:00:00Z')
    );
  }

  /**
   * Get deterministic random generator
   */
  getRandom(): SeededRandom {
    return this.random;
  }

  /**
   * Get deterministic clock
   */
  getClock(): FixedClock {
    return this.clock;
  }

  /**
   * Register mock API
   */
  mockApi(config: MockApiConfig): void {
    this.mocks.push(config);
  }

  /**
   * Clear all mocks
   */
  clearMocks(): void {
    this.mocks = [];
  }

  /**
   * Get mock response for request
   */
  async getMockResponse(request: MockRequest): Promise<MockResponse | null> {
    for (const mock of this.mocks) {
      const patternMatch =
        typeof mock.pattern === 'string'
          ? request.url.includes(mock.pattern)
          : mock.pattern.test(request.url);

      const methodMatch = !mock.method || mock.method === request.method;

      if (patternMatch && methodMatch) {
        const response =
          typeof mock.response === 'function'
            ? await mock.response(request)
            : mock.response;

        if (response.delay) {
          await this.delay(response.delay);
        }

        return response;
      }
    }
    return null;
  }

  /**
   * Run test with retry support
   */
  async runTest(
    name: string,
    testFn: () => Promise<void>
  ): Promise<TestResult> {
    let retryCount = 0;
    let lastError: Error | null = null;
    const startTime = Date.now();

    while (retryCount <= this.config.maxRetries) {
      try {
        await this.withTimeout(testFn(), this.config.timeout);

        const result: TestResult = {
          name,
          passed: true,
          durationMs: Date.now() - startTime,
          retryCount,
        };
        this.results.push(result);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;

        if (retryCount <= this.config.maxRetries) {
          await this.delay(this.config.retryDelay * retryCount);
        }
      }
    }

    const result: TestResult = {
      name,
      passed: false,
      durationMs: Date.now() - startTime,
      error: lastError?.message,
      retryCount: retryCount - 1,
    };
    this.results.push(result);
    return result;
  }

  /**
   * Save snapshot
   */
  saveSnapshot(name: string, data: unknown): void {
    this.snapshots.set(name, {
      name,
      data,
      timestamp: this.clock.now(),
    });
  }

  /**
   * Compare with snapshot
   */
  compareSnapshot(name: string, data: unknown): boolean {
    const snapshot = this.snapshots.get(name);
    if (!snapshot) {
      // No existing snapshot - save and pass
      this.saveSnapshot(name, data);
      return true;
    }

    return this.deepEqual(snapshot.data, data);
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): Snapshot[] {
    return Array.from(this.snapshots.values());
  }

  /**
   * Get all test results
   */
  getResults(): TestResult[] {
    return [...this.results];
  }

  /**
   * Reset harness state
   */
  reset(): void {
    this.random = new SeededRandom(this.config.seed);
    this.clock = new FixedClock(
      this.config.fixedTimestamp || new Date('2025-01-01T00:00:00Z')
    );
    this.mocks = [];
    this.results = [];
  }

  /**
   * Generate test report
   */
  generateReport(): string {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.length - passed;
    const totalDuration = this.results.reduce((sum, r) => sum + r.durationMs, 0);

    const lines = [
      '# Test Report',
      '',
      `**Total**: ${this.results.length} tests`,
      `**Passed**: ${passed}`,
      `**Failed**: ${failed}`,
      `**Duration**: ${totalDuration}ms`,
      '',
      '## Results',
      '',
    ];

    for (const result of this.results) {
      const icon = result.passed ? '✅' : '❌';
      lines.push(`${icon} **${result.name}** (${result.durationMs}ms)`);
      if (result.retryCount > 0) {
        lines.push(`   - Retries: ${result.retryCount}`);
      }
      if (result.error) {
        lines.push(`   - Error: ${result.error}`);
      }
    }

    return lines.join('\n');
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
      ),
    ]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return a === b;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => this.deepEqual(item, b[index]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a as Record<string, unknown>);
      const bKeys = Object.keys(b as Record<string, unknown>);
      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every(key =>
        this.deepEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key]
        )
      );
    }

    return false;
  }
}

// =============================================================================
// Golden File Utilities
// =============================================================================

/**
 * Golden file comparison result
 */
export interface GoldenCompareResult {
  /** Whether files match */
  matches: boolean;
  /** Diff if not matching */
  diff?: string;
  /** Expected value */
  expected?: unknown;
  /** Actual value */
  actual?: unknown;
}

/**
 * Compare value against golden file content
 */
export function compareGolden(
  expected: unknown,
  actual: unknown
): GoldenCompareResult {
  const expectedStr = JSON.stringify(expected, null, 2);
  const actualStr = JSON.stringify(actual, null, 2);

  if (expectedStr === actualStr) {
    return { matches: true };
  }

  return {
    matches: false,
    expected,
    actual,
    diff: generateDiff(expectedStr, actualStr),
  };
}

/**
 * Generate simple diff between two strings
 */
function generateDiff(expected: string, actual: string): string {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const diff: string[] = [];

  const maxLines = Math.max(expectedLines.length, actualLines.length);

  for (let i = 0; i < maxLines; i++) {
    const exp = expectedLines[i] ?? '';
    const act = actualLines[i] ?? '';

    if (exp !== act) {
      if (exp) diff.push(`- ${exp}`);
      if (act) diff.push(`+ ${act}`);
    }
  }

  return diff.join('\n');
}

// =============================================================================
// Exports
// =============================================================================

export { TestHarness as DeterministicTestHarness };
