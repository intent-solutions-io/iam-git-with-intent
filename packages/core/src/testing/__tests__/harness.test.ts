/**
 * Deterministic Test Harness Tests
 *
 * Phase 38: Tests for the E2E testing infrastructure.
 */

import { describe, it, expect } from 'vitest';
import {
  TestHarness,
  SeededRandom,
  FixedClock,
  compareGolden,
  DEFAULT_HARNESS_CONFIG,
} from '../harness.js';

// =============================================================================
// SeededRandom Tests
// =============================================================================

describe('SeededRandom', () => {
  it('should produce deterministic values with same seed', () => {
    const rand1 = new SeededRandom(12345);
    const rand2 = new SeededRandom(12345);

    expect(rand1.next()).toBe(rand2.next());
    expect(rand1.next()).toBe(rand2.next());
    expect(rand1.next()).toBe(rand2.next());
  });

  it('should produce different values with different seeds', () => {
    const rand1 = new SeededRandom(12345);
    const rand2 = new SeededRandom(54321);

    expect(rand1.next()).not.toBe(rand2.next());
  });

  it('should generate integers in range', () => {
    const rand = new SeededRandom(12345);

    for (let i = 0; i < 100; i++) {
      const value = rand.int(0, 10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(10);
    }
  });

  it('should pick elements from array deterministically', () => {
    const rand1 = new SeededRandom(12345);
    const rand2 = new SeededRandom(12345);
    const array = ['a', 'b', 'c', 'd', 'e'];

    expect(rand1.pick(array)).toBe(rand2.pick(array));
  });

  it('should shuffle array deterministically', () => {
    const rand1 = new SeededRandom(12345);
    const rand2 = new SeededRandom(12345);

    const arr1 = [1, 2, 3, 4, 5];
    const arr2 = [1, 2, 3, 4, 5];

    rand1.shuffle(arr1);
    rand2.shuffle(arr2);

    expect(arr1).toEqual(arr2);
  });

  it('should generate deterministic strings', () => {
    const rand1 = new SeededRandom(12345);
    const rand2 = new SeededRandom(12345);

    expect(rand1.string(10)).toBe(rand2.string(10));
  });

  it('should generate deterministic UUIDs', () => {
    const rand1 = new SeededRandom(12345);
    const rand2 = new SeededRandom(12345);

    const uuid1 = rand1.uuid();
    const uuid2 = rand2.uuid();

    expect(uuid1).toBe(uuid2);
    expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

// =============================================================================
// FixedClock Tests
// =============================================================================

describe('FixedClock', () => {
  it('should return fixed time', () => {
    const clock = new FixedClock(new Date('2025-01-01T00:00:00Z'));

    expect(clock.now().toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('should advance time on tick', () => {
    const clock = new FixedClock(new Date('2025-01-01T00:00:00Z'), 1000);

    expect(clock.now().toISOString()).toBe('2025-01-01T00:00:00.000Z');
    clock.tick();
    expect(clock.now().toISOString()).toBe('2025-01-01T00:00:01.000Z');
    clock.tick();
    expect(clock.now().toISOString()).toBe('2025-01-01T00:00:02.000Z');
  });

  it('should advance by specific amount', () => {
    const clock = new FixedClock(new Date('2025-01-01T00:00:00Z'));

    clock.advance(5000);
    expect(clock.now().toISOString()).toBe('2025-01-01T00:00:05.000Z');
  });

  it('should set specific time', () => {
    const clock = new FixedClock(new Date('2025-01-01T00:00:00Z'));

    clock.set(new Date('2025-06-15T12:30:00Z'));
    expect(clock.now().toISOString()).toBe('2025-06-15T12:30:00.000Z');
  });

  it('should return timestamp', () => {
    const clock = new FixedClock(new Date('2025-01-01T00:00:00Z'));
    expect(clock.timestamp()).toBe(new Date('2025-01-01T00:00:00Z').getTime());
  });
});

// =============================================================================
// TestHarness Tests
// =============================================================================

describe('TestHarness', () => {
  describe('Configuration', () => {
    it('should use default config', () => {
      const harness = new TestHarness();
      expect(harness).toBeDefined();
    });

    it('should accept custom config', () => {
      const harness = new TestHarness({
        seed: 99999,
        timeout: 60000,
      });
      expect(harness).toBeDefined();
    });
  });

  describe('Deterministic Utilities', () => {
    it('should provide seeded random', () => {
      const harness1 = new TestHarness({ seed: 12345 });
      const harness2 = new TestHarness({ seed: 12345 });

      expect(harness1.getRandom().next()).toBe(harness2.getRandom().next());
    });

    it('should provide fixed clock', () => {
      const harness = new TestHarness({
        fixedTimestamp: new Date('2025-01-01T00:00:00Z'),
      });

      expect(harness.getClock().now().toISOString()).toBe('2025-01-01T00:00:00.000Z');
    });
  });

  describe('API Mocking', () => {
    it('should register and match mock', async () => {
      const harness = new TestHarness();

      harness.mockApi({
        pattern: '/api/test',
        method: 'GET',
        response: {
          status: 200,
          body: { message: 'success' },
        },
      });

      const response = await harness.getMockResponse({
        url: '/api/test',
        method: 'GET',
        headers: {},
      });

      expect(response).not.toBeNull();
      expect(response?.status).toBe(200);
      expect(response?.body).toEqual({ message: 'success' });
    });

    it('should return null for unmatched mock', async () => {
      const harness = new TestHarness();

      const response = await harness.getMockResponse({
        url: '/api/unknown',
        method: 'GET',
        headers: {},
      });

      expect(response).toBeNull();
    });

    it('should support regex patterns', async () => {
      const harness = new TestHarness();

      harness.mockApi({
        pattern: /\/api\/users\/\d+/,
        response: {
          status: 200,
          body: { id: 123 },
        },
      });

      const response = await harness.getMockResponse({
        url: '/api/users/42',
        method: 'GET',
        headers: {},
      });

      expect(response).not.toBeNull();
      expect(response?.body).toEqual({ id: 123 });
    });

    it('should support dynamic responses', async () => {
      const harness = new TestHarness();

      harness.mockApi({
        pattern: '/api/echo',
        response: (req) => ({
          status: 200,
          body: { echo: req.body },
        }),
      });

      const response = await harness.getMockResponse({
        url: '/api/echo',
        method: 'POST',
        headers: {},
        body: { test: 'data' },
      });

      expect(response?.body).toEqual({ echo: { test: 'data' } });
    });

    it('should clear mocks', async () => {
      const harness = new TestHarness();

      harness.mockApi({
        pattern: '/api/test',
        response: { status: 200, body: {} },
      });

      harness.clearMocks();

      const response = await harness.getMockResponse({
        url: '/api/test',
        method: 'GET',
        headers: {},
      });

      expect(response).toBeNull();
    });
  });

  describe('Test Execution', () => {
    it('should run passing test', async () => {
      const harness = new TestHarness();

      const result = await harness.runTest('passing test', async () => {
        // Test passes
      });

      expect(result.passed).toBe(true);
      expect(result.retryCount).toBe(0);
    });

    it('should run failing test', async () => {
      const harness = new TestHarness({ maxRetries: 0 });

      const result = await harness.runTest('failing test', async () => {
        throw new Error('Test failure');
      });

      expect(result.passed).toBe(false);
      expect(result.error).toBe('Test failure');
    });

    it('should retry failing tests', async () => {
      const harness = new TestHarness({
        maxRetries: 2,
        retryDelay: 10,
      });

      let attempts = 0;
      const result = await harness.runTest('flaky test', async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Flaky failure');
        }
      });

      expect(result.passed).toBe(true);
      expect(result.retryCount).toBe(1);
    });

    it('should timeout long tests', async () => {
      const harness = new TestHarness({
        timeout: 50,
        maxRetries: 0,
      });

      const result = await harness.runTest('slow test', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.passed).toBe(false);
      expect(result.error).toContain('Timeout');
    });

    it('should track test results', async () => {
      const harness = new TestHarness({ maxRetries: 0 });

      await harness.runTest('test 1', async () => {});
      await harness.runTest('test 2', async () => {
        throw new Error('fail');
      });

      const results = harness.getResults();
      expect(results.length).toBe(2);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(false);
    });
  });

  describe('Snapshots', () => {
    it('should save snapshot', () => {
      const harness = new TestHarness();

      harness.saveSnapshot('test-snapshot', { key: 'value' });

      const snapshots = harness.getSnapshots();
      expect(snapshots.length).toBe(1);
      expect(snapshots[0].name).toBe('test-snapshot');
      expect(snapshots[0].data).toEqual({ key: 'value' });
    });

    it('should compare matching snapshot', () => {
      const harness = new TestHarness();

      harness.saveSnapshot('test', { value: 123 });
      const matches = harness.compareSnapshot('test', { value: 123 });

      expect(matches).toBe(true);
    });

    it('should detect non-matching snapshot', () => {
      const harness = new TestHarness();

      harness.saveSnapshot('test', { value: 123 });
      const matches = harness.compareSnapshot('test', { value: 456 });

      expect(matches).toBe(false);
    });

    it('should save new snapshot on first comparison', () => {
      const harness = new TestHarness();

      const matches = harness.compareSnapshot('new-test', { data: 'test' });

      expect(matches).toBe(true);
      expect(harness.getSnapshots().length).toBe(1);
    });
  });

  describe('Reset', () => {
    it('should reset all state', async () => {
      const harness = new TestHarness();

      // Add some state
      harness.mockApi({
        pattern: '/test',
        response: { status: 200, body: {} },
      });
      await harness.runTest('test', async () => {});
      harness.getRandom().next();
      harness.getClock().tick();

      // Reset
      harness.reset();

      // Verify reset
      expect(harness.getResults().length).toBe(0);
      expect(harness.getSnapshots().length).toBe(0);

      // Random should restart from seed
      const harness2 = new TestHarness();
      expect(harness.getRandom().next()).toBe(harness2.getRandom().next());
    });
  });

  describe('Report Generation', () => {
    it('should generate test report', async () => {
      const harness = new TestHarness({ maxRetries: 0 });

      await harness.runTest('passing test', async () => {});
      await harness.runTest('failing test', async () => {
        throw new Error('failure');
      });

      const report = harness.generateReport();

      expect(report).toContain('# Test Report');
      expect(report).toContain('**Total**: 2 tests');
      expect(report).toContain('**Passed**: 1');
      expect(report).toContain('**Failed**: 1');
      expect(report).toContain('✅ **passing test**');
      expect(report).toContain('❌ **failing test**');
    });
  });
});

// =============================================================================
// Golden File Tests
// =============================================================================

describe('Golden File Utilities', () => {
  describe('compareGolden', () => {
    it('should match identical values', () => {
      const result = compareGolden({ key: 'value' }, { key: 'value' });
      expect(result.matches).toBe(true);
    });

    it('should detect different values', () => {
      const result = compareGolden({ key: 'expected' }, { key: 'actual' });
      expect(result.matches).toBe(false);
      expect(result.expected).toEqual({ key: 'expected' });
      expect(result.actual).toEqual({ key: 'actual' });
    });

    it('should include diff for non-matching values', () => {
      const result = compareGolden({ a: 1 }, { a: 2 });
      expect(result.diff).toContain('- ');
      expect(result.diff).toContain('+ ');
    });

    it('should match complex nested objects', () => {
      const complex = {
        array: [1, 2, 3],
        nested: { deep: { value: 'test' } },
        null: null,
        bool: true,
      };
      const result = compareGolden(complex, { ...complex });
      expect(result.matches).toBe(true);
    });
  });
});

// =============================================================================
// Default Configuration Tests
// =============================================================================

describe('Default Configuration', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_HARNESS_CONFIG.seed).toBe(12345);
    expect(DEFAULT_HARNESS_CONFIG.timeout).toBe(30000);
    expect(DEFAULT_HARNESS_CONFIG.maxRetries).toBe(3);
    expect(DEFAULT_HARNESS_CONFIG.captureSnapshots).toBe(false);
  });
});
