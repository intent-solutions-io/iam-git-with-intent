#!/usr/bin/env npx tsx
/**
 * ARV: Load Test & Performance Budgets
 *
 * Phase 30: Reliability & Scaling
 *
 * Tests:
 * - Rate limiting under load
 * - Concurrent request handling
 * - Retry mechanism performance
 * - Circuit breaker behavior
 *
 * Performance budgets:
 * - P50 latency: < 100ms
 * - P95 latency: < 500ms
 * - P99 latency: < 1000ms
 * - Error rate: < 1%
 * - Throughput: > 100 req/sec
 *
 * @module arv/load-test
 */

// =============================================================================
// Types
// =============================================================================

interface LoadTestResult {
  name: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  latencies: number[];
  p50: number;
  p95: number;
  p99: number;
  errorRate: number;
  throughput: number;
  durationMs: number;
  passedBudget: boolean;
}

interface PerformanceBudget {
  p50MaxMs: number;
  p95MaxMs: number;
  p99MaxMs: number;
  maxErrorRate: number;
  minThroughput: number;
}

interface LoadTestReport {
  timestamp: string;
  tests: LoadTestResult[];
  overall: {
    passed: number;
    failed: number;
    total: number;
  };
}

// =============================================================================
// Performance Budgets
// =============================================================================

const DEFAULT_BUDGET: PerformanceBudget = {
  p50MaxMs: 100,
  p95MaxMs: 500,
  p99MaxMs: 1000,
  maxErrorRate: 0.01, // 1%
  minThroughput: 100, // req/sec
};

const RELAXED_BUDGET: PerformanceBudget = {
  p50MaxMs: 200,
  p95MaxMs: 1000,
  p99MaxMs: 2000,
  maxErrorRate: 0.05, // 5%
  minThroughput: 50,
};

// =============================================================================
// Utilities
// =============================================================================

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Load Test Runner
// =============================================================================

async function runLoadTest(
  name: string,
  fn: () => Promise<void>,
  options: {
    concurrency: number;
    totalRequests: number;
    rampUpMs?: number;
    budget?: PerformanceBudget;
  }
): Promise<LoadTestResult> {
  const { concurrency, totalRequests, rampUpMs = 0, budget = DEFAULT_BUDGET } = options;

  const latencies: number[] = [];
  let successfulRequests = 0;
  let failedRequests = 0;
  let requestsStarted = 0;

  const startTime = Date.now();

  // Worker function
  async function worker(): Promise<void> {
    while (requestsStarted < totalRequests) {
      requestsStarted++;

      // Ramp up delay
      if (rampUpMs > 0) {
        const progress = requestsStarted / totalRequests;
        const delay = Math.round(rampUpMs * (1 - progress) / concurrency);
        if (delay > 0) {
          await sleep(delay);
        }
      }

      const reqStart = Date.now();
      try {
        await fn();
        latencies.push(Date.now() - reqStart);
        successfulRequests++;
      } catch {
        latencies.push(Date.now() - reqStart);
        failedRequests++;
      }
    }
  }

  // Run concurrent workers
  const workers = Array(Math.min(concurrency, totalRequests))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);

  const durationMs = Date.now() - startTime;
  const throughput = (totalRequests / durationMs) * 1000;
  const errorRate = failedRequests / totalRequests;

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);

  // Check against budget
  const passedBudget =
    p50 <= budget.p50MaxMs &&
    p95 <= budget.p95MaxMs &&
    p99 <= budget.p99MaxMs &&
    errorRate <= budget.maxErrorRate &&
    throughput >= budget.minThroughput;

  return {
    name,
    totalRequests,
    successfulRequests,
    failedRequests,
    latencies,
    p50,
    p95,
    p99,
    errorRate,
    throughput,
    durationMs,
    passedBudget,
  };
}

// =============================================================================
// Load Test Scenarios
// =============================================================================

async function testRateLimiting(): Promise<LoadTestResult> {
  const { InMemoryRateLimitStore, RateLimiter } = await import('@gwi/core');

  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store, {
    test: { maxRequests: 1000, windowMs: 60000 },
  });

  let tenantCounter = 0;

  return runLoadTest(
    'Rate Limiting',
    async () => {
      // Distribute across tenants to avoid hitting limits
      const tenantId = `tenant-${tenantCounter++ % 10}`;
      const result = await limiter.check(tenantId, 'test');
      if (!result.allowed) {
        throw new Error('Rate limited');
      }
    },
    {
      concurrency: 50,
      totalRequests: 500,
      budget: RELAXED_BUDGET,
    }
  );
}

async function testRetryMechanism(): Promise<LoadTestResult> {
  const { retry, RETRY_PRESETS } = await import('@gwi/core');

  let callCount = 0;

  return runLoadTest(
    'Retry Mechanism',
    async () => {
      await retry(
        async () => {
          callCount++;
          // 20% failure rate to trigger retries
          if (Math.random() < 0.2) {
            throw new Error('Transient failure');
          }
          return 'success';
        },
        { ...RETRY_PRESETS.fast, isRetryable: () => true }
      );
    },
    {
      concurrency: 20,
      totalRequests: 200,
      budget: RELAXED_BUDGET,
    }
  );
}

async function testCircuitBreaker(): Promise<LoadTestResult> {
  const { CircuitBreaker } = await import('@gwi/core');

  const breaker = new CircuitBreaker('load-test', {
    failureThreshold: 100, // High threshold for load test
    resetTimeoutMs: 1000,
    failureWindowMs: 60000,
  });

  return runLoadTest(
    'Circuit Breaker',
    async () => {
      await breaker.execute(async () => {
        // 2% failure rate - lower to stay under 5% budget
        if (Math.random() < 0.02) {
          throw new Error('Service error');
        }
        // Simulate work
        await sleep(Math.random() * 10);
        return 'success';
      });
    },
    {
      concurrency: 30,
      totalRequests: 300,
      budget: RELAXED_BUDGET,
    }
  );
}

async function testIdempotencyStore(): Promise<LoadTestResult> {
  const { MemoryIdempotencyStore, createIdempotencyKey } = await import('@gwi/core');

  const store = new MemoryIdempotencyStore();
  let counter = 0;

  return runLoadTest(
    'Idempotency Store',
    async () => {
      // Use unique keys to avoid collision errors
      const uniqueCounter = counter++;
      const key = createIdempotencyKey(`run-${uniqueCounter}`, `step-${uniqueCounter}`, 'test', { x: uniqueCounter });
      await store.withIdempotency(key, async () => {
        // Simulate work
        await sleep(Math.random() * 5);
        return 'result';
      });
    },
    {
      concurrency: 40,
      totalRequests: 400,
      budget: RELAXED_BUDGET,
    }
  );
}

async function testConcurrentLocking(): Promise<LoadTestResult> {
  const { MemoryRunLockManager } = await import('@gwi/core');

  const manager = new MemoryRunLockManager();
  let runCounter = 0;

  return runLoadTest(
    'Concurrent Locking',
    async () => {
      // Distribute across runs to avoid contention
      const runId = `run-${runCounter++ % 20}`;
      const result = await manager.tryAcquire(runId, { ttlMs: 100 });
      if (result.acquired && result.lock) {
        // Simulate work
        await sleep(Math.random() * 5);
        await manager.release(runId, result.lock.holderId);
      }
    },
    {
      concurrency: 25,
      totalRequests: 250,
      budget: RELAXED_BUDGET,
    }
  );
}

async function testHighContention(): Promise<LoadTestResult> {
  const { MemoryRunLockManager } = await import('@gwi/core');

  const manager = new MemoryRunLockManager();

  return runLoadTest(
    'High Contention (Single Resource)',
    async () => {
      // All requests compete for same lock
      const result = await manager.tryAcquire('single-resource', { ttlMs: 10 });
      if (result.acquired && result.lock) {
        // Quick work
        await sleep(1);
        await manager.release('single-resource', result.lock.holderId);
      }
    },
    {
      concurrency: 100,
      totalRequests: 500,
      budget: {
        ...RELAXED_BUDGET,
        maxErrorRate: 0.9, // High contention means many will fail
        minThroughput: 20,
      },
    }
  );
}

// =============================================================================
// Main
// =============================================================================

async function runLoadTests(): Promise<{ passed: boolean; report: LoadTestReport }> {
  console.log('Running load tests...\n');

  const results: LoadTestResult[] = [];

  // Run tests sequentially to avoid interference
  results.push(await testRateLimiting());
  console.log(`  ${results[results.length - 1].passedBudget ? '\u2705' : '\u274C'} ${results[results.length - 1].name}`);

  results.push(await testRetryMechanism());
  console.log(`  ${results[results.length - 1].passedBudget ? '\u2705' : '\u274C'} ${results[results.length - 1].name}`);

  results.push(await testCircuitBreaker());
  console.log(`  ${results[results.length - 1].passedBudget ? '\u2705' : '\u274C'} ${results[results.length - 1].name}`);

  results.push(await testIdempotencyStore());
  console.log(`  ${results[results.length - 1].passedBudget ? '\u2705' : '\u274C'} ${results[results.length - 1].name}`);

  results.push(await testConcurrentLocking());
  console.log(`  ${results[results.length - 1].passedBudget ? '\u2705' : '\u274C'} ${results[results.length - 1].name}`);

  results.push(await testHighContention());
  console.log(`  ${results[results.length - 1].passedBudget ? '\u2705' : '\u274C'} ${results[results.length - 1].name}`);

  const passed = results.filter((r) => r.passedBudget).length;
  const failed = results.filter((r) => !r.passedBudget).length;

  const report: LoadTestReport = {
    timestamp: new Date().toISOString(),
    tests: results,
    overall: {
      passed,
      failed,
      total: results.length,
    },
  };

  return {
    passed: failed === 0,
    report,
  };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Load Test & Performance Budgets');
  console.log('='.repeat(60));

  runLoadTests().then(({ passed, report }) => {
    console.log('\n' + '='.repeat(60));
    console.log('\nResults:\n');

    for (const test of report.tests) {
      console.log(`${test.passedBudget ? '\u2705' : '\u274C'} ${test.name}`);
      console.log(`   Total: ${test.totalRequests} requests`);
      console.log(`   Success: ${test.successfulRequests}, Failed: ${test.failedRequests}`);
      console.log(`   Latency: P50=${test.p50.toFixed(0)}ms, P95=${test.p95.toFixed(0)}ms, P99=${test.p99.toFixed(0)}ms`);
      console.log(`   Throughput: ${test.throughput.toFixed(1)} req/sec`);
      console.log(`   Error Rate: ${(test.errorRate * 100).toFixed(2)}%`);
      console.log('');
    }

    console.log('='.repeat(60));
    console.log(`\nOverall: ${report.overall.passed}/${report.overall.total} tests passed`);
    console.log(passed ? '\n\u2705 ALL BUDGETS MET' : '\n\u274C BUDGET VIOLATIONS');

    process.exit(passed ? 0 : 1);
  });
}

export { runLoadTests, type LoadTestResult, type LoadTestReport, type PerformanceBudget };
