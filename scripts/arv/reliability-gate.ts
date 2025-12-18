#!/usr/bin/env npx tsx
/**
 * ARV: Reliability Gate
 *
 * Phase 7: Validates reliability primitives are working correctly.
 * Phase 30: Added retry/backoff and circuit breaker tests.
 *
 * Checks:
 * - Run locking correctness
 * - Idempotency key correctness
 * - Resume logic correctness
 * - Error taxonomy compliance
 * - Retry with exponential backoff (Phase 30)
 * - Circuit breaker pattern (Phase 30)
 *
 * @module arv/reliability-gate
 */

// =============================================================================
// Types
// =============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

interface ReliabilityReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: TestResult[];
}

// =============================================================================
// Test Helpers
// =============================================================================

async function runTest(
  name: string,
  fn: () => Promise<void>
): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return {
      name,
      passed: true,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// =============================================================================
// Locking Tests
// =============================================================================

async function testLockAcquisition(): Promise<void> {
  const { MemoryRunLockManager } = await import(
    '@gwi/core'
  );

  const manager = new MemoryRunLockManager();

  // Test basic acquisition
  const result = await manager.tryAcquire('test-run-1');
  assert(result.acquired, 'Should acquire lock on unlocked run');
  assert(result.lock?.runId === 'test-run-1', 'Lock should have correct runId');

  // Test conflict detection
  const result2 = await manager.tryAcquire('test-run-1');
  assert(!result2.acquired, 'Should not acquire lock on locked run');
  assert(result2.existingHolderId !== undefined, 'Should report existing holder');

  // Test release
  const released = await manager.release('test-run-1', result.lock!.holderId);
  assert(released, 'Should release held lock');

  // Test re-acquisition after release
  const result3 = await manager.tryAcquire('test-run-1');
  assert(result3.acquired, 'Should acquire lock after release');

  manager.clear();
}

async function testLockExpiration(): Promise<void> {
  const { MemoryRunLockManager } = await import(
    '@gwi/core'
  );

  const manager = new MemoryRunLockManager();

  // Acquire with short TTL
  await manager.tryAcquire('test-run-2', { ttlMs: 50 });

  // Wait for expiration
  await new Promise((r) => setTimeout(r, 100));

  // Should be able to acquire expired lock
  const result = await manager.tryAcquire('test-run-2');
  assert(result.acquired, 'Should acquire expired lock');

  manager.clear();
}

async function testConcurrentLocking(): Promise<void> {
  const { MemoryRunLockManager } = await import(
    '@gwi/core'
  );

  const manager = new MemoryRunLockManager();

  // Simulate concurrent acquisition attempts
  const results = await Promise.all([
    manager.tryAcquire('concurrent-run'),
    manager.tryAcquire('concurrent-run'),
    manager.tryAcquire('concurrent-run'),
  ]);

  const acquired = results.filter((r) => r.acquired);
  assert(acquired.length === 1, 'Only one concurrent lock should succeed');

  manager.clear();
}

// =============================================================================
// Idempotency Tests
// =============================================================================

async function testIdempotencyKeyGeneration(): Promise<void> {
  const { generateIdempotencyKey, hashInput, createIdempotencyKey } = await import(
    '@gwi/core'
  );

  // Test deterministic key generation
  const key1 = generateIdempotencyKey({
    runId: 'run-1',
    stepId: 'step-1',
    operation: 'test',
    inputHash: 'abc123',
  });

  const key2 = generateIdempotencyKey({
    runId: 'run-1',
    stepId: 'step-1',
    operation: 'test',
    inputHash: 'abc123',
  });

  assert(key1 === key2, 'Same input should produce same key');

  // Test different input produces different key
  const key3 = generateIdempotencyKey({
    runId: 'run-2',
    stepId: 'step-1',
    operation: 'test',
    inputHash: 'abc123',
  });

  assert(key1 !== key3, 'Different input should produce different key');

  // Test hash input consistency
  const hash1 = hashInput({ a: 1, b: 2 });
  const hash2 = hashInput({ b: 2, a: 1 }); // Different order
  assert(hash1 === hash2, 'Object key order should not affect hash');
}

async function testIdempotencyExecution(): Promise<void> {
  const { MemoryIdempotencyStore, createIdempotencyKey } = await import(
    '@gwi/core'
  );

  const store = new MemoryIdempotencyStore();
  let executionCount = 0;

  const components = createIdempotencyKey('run-1', 'step-1', 'test', { x: 1 });

  // First execution
  const result1 = await store.withIdempotency(components, async () => {
    executionCount++;
    return 'result';
  });

  assert(result1 === 'result', 'First execution should return result');
  assert(executionCount === 1, 'Should execute once');

  // Second execution (should use cached)
  const result2 = await store.withIdempotency(components, async () => {
    executionCount++;
    return 'result';
  });

  assert(result2 === 'result', 'Second execution should return cached result');
  assert(executionCount === 1, 'Should not execute again');

  store.clear();
}

// =============================================================================
// Resume Tests
// =============================================================================

async function testResumeAnalysis(): Promise<void> {
  const { analyzeResumePoint } = await import(
    '@gwi/core'
  );

  const mockRun = {
    id: 'run-1',
    tenantId: 'tenant-1',
    repoId: 'repo-1',
    prId: 'pr-1',
    prUrl: 'https://github.com/org/repo/pull/1',
    type: 'resolve',
    status: 'running',
    currentStep: 'coder',
    steps: [
      { id: 'step-1', runId: 'run-1', agent: 'triage', status: 'completed', output: { x: 1 } },
      { id: 'step-2', runId: 'run-1', agent: 'coder', status: 'running' },
      { id: 'step-3', runId: 'run-1', agent: 'reviewer', status: 'pending' },
    ],
    trigger: { source: 'ui' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Test finding resume point
  const result = analyzeResumePoint(mockRun as any, null);
  assert(result.success, 'Should find resume point');
  assert(result.startFromStep === 'coder', 'Should resume from coder step');
  assert(result.startFromIndex === 1, 'Should resume from index 1');
  assert((result.availableArtifacts as any)?.triage?.x === 1, 'Should include prior artifacts');

  // Test force restart
  const restartResult = analyzeResumePoint(mockRun as any, null, { forceRestart: true });
  assert(restartResult.success, 'Force restart should succeed');
  assert(restartResult.startFromIndex === 0, 'Force restart should start from 0');

  // Test completed run rejection
  const completedRun = { ...mockRun, status: 'completed' };
  const completedResult = analyzeResumePoint(completedRun as any, null);
  assert(!completedResult.success, 'Should reject completed run');
}

// =============================================================================
// Error Taxonomy Tests
// =============================================================================

async function testErrorTypes(): Promise<void> {
  const {
    RetryableError,
    NonRetryableError,
    PolicyDeniedError,
    ApprovalRequiredError,
    LockConflictError,
    isRetryable,
    toExitCode,
  } = await import('@gwi/core');

  // Test retryable error
  const retryable = new RetryableError('Rate limited', 'RATE_LIMITED');
  assert(retryable.retryable, 'RetryableError should be retryable');
  assert(isRetryable(retryable), 'isRetryable should return true');

  // Test non-retryable error
  const nonRetryable = new NonRetryableError('Invalid input', 'VALIDATION_ERROR');
  assert(!nonRetryable.retryable, 'NonRetryableError should not be retryable');
  assert(!isRetryable(nonRetryable), 'isRetryable should return false');

  // Test specific error types
  const policyDenied = new PolicyDeniedError('Not allowed');
  assert(policyDenied.code === 'POLICY_DENIED', 'PolicyDeniedError should have correct code');

  const approvalRequired = new ApprovalRequiredError('Needs approval');
  assert(approvalRequired.code === 'APPROVAL_REQUIRED', 'ApprovalRequiredError should have correct code');

  const lockConflict = new LockConflictError('run-123');
  assert(lockConflict.code === 'LOCK_CONFLICT', 'LockConflictError should have correct code');
  assert(lockConflict.retryable, 'LockConflictError should be retryable');

  // Test exit code mapping
  assert(toExitCode(retryable) === 10, 'RATE_LIMITED should map to exit code 10');
  assert(toExitCode(nonRetryable) === 20, 'VALIDATION_ERROR should map to exit code 20');
  assert(toExitCode(policyDenied) === 30, 'POLICY_DENIED should map to exit code 30');
}

async function testErrorPatternDetection(): Promise<void> {
  const { isRetryable } = await import('@gwi/core');

  // Test pattern detection in regular errors
  assert(isRetryable(new Error('Connection timeout')), 'Should detect timeout pattern');
  assert(isRetryable(new Error('Rate limit exceeded')), 'Should detect rate limit pattern');
  assert(isRetryable(new Error('503 Service Unavailable')), 'Should detect 503 pattern');
  assert(!isRetryable(new Error('Invalid parameter')), 'Should not detect invalid errors as retryable');
}

// =============================================================================
// Retry Tests (Phase 30)
// =============================================================================

async function testRetryWithSuccess(): Promise<void> {
  const { retry, RETRY_PRESETS } = await import('@gwi/core');

  let attempts = 0;

  const result = await retry(
    async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Transient error');
      }
      return 'success';
    },
    { ...RETRY_PRESETS.fast, maxAttempts: 5, isRetryable: () => true }
  );

  assert(result === 'success', 'Should return successful result');
  assert(attempts === 3, 'Should have attempted 3 times');
}

async function testRetryWithFailure(): Promise<void> {
  const { retryWithResult, RETRY_PRESETS } = await import('@gwi/core');

  let attempts = 0;

  const result = await retryWithResult(
    async () => {
      attempts++;
      throw new Error('Permanent error');
    },
    { ...RETRY_PRESETS.fast, maxAttempts: 3, isRetryable: () => true }
  );

  assert(!result.success, 'Should report failure');
  assert(result.attempts === 3, 'Should have attempted 3 times');
  assert(result.attemptErrors.length === 3, 'Should have recorded 3 errors');
}

async function testRetryNonRetryable(): Promise<void> {
  const { retryWithResult, RETRY_PRESETS } = await import('@gwi/core');

  let attempts = 0;

  const result = await retryWithResult(
    async () => {
      attempts++;
      throw new Error('Non-retryable error');
    },
    { ...RETRY_PRESETS.fast, maxAttempts: 5, isRetryable: () => false }
  );

  assert(!result.success, 'Should report failure');
  assert(result.attempts === 1, 'Should not retry non-retryable errors');
}

async function testBackoffCalculation(): Promise<void> {
  const { calculateBackoff, DEFAULT_RETRY_CONFIG } = await import('@gwi/core');

  // Test exponential growth
  const delay0 = calculateBackoff(0, DEFAULT_RETRY_CONFIG);
  const delay1 = calculateBackoff(1, DEFAULT_RETRY_CONFIG);
  const delay2 = calculateBackoff(2, DEFAULT_RETRY_CONFIG);

  // With jitter, values will vary but should follow exponential trend
  assert(delay0 > 0, 'First delay should be positive');
  assert(delay1 > delay0 * 0.5, 'Second delay should be larger than half of first');
  assert(delay2 <= DEFAULT_RETRY_CONFIG.maxDelayMs * 1.2, 'Delay should not exceed max');
}

// =============================================================================
// Circuit Breaker Tests (Phase 30)
// =============================================================================

async function testCircuitBreakerNormal(): Promise<void> {
  const { CircuitBreaker } = await import('@gwi/core');

  const breaker = new CircuitBreaker('test-normal', {
    failureThreshold: 3,
    resetTimeoutMs: 100,
  });

  // Normal operation
  assert(breaker.getState() === 'closed', 'Should start closed');

  const result = await breaker.execute(async () => 'success');
  assert(result === 'success', 'Should pass through in closed state');
  assert(breaker.getState() === 'closed', 'Should remain closed after success');
}

async function testCircuitBreakerOpen(): Promise<void> {
  const { CircuitBreaker } = await import('@gwi/core');

  const breaker = new CircuitBreaker('test-open', {
    failureThreshold: 3,
    resetTimeoutMs: 1000,
    failureWindowMs: 60000,
  });

  // Cause failures
  for (let i = 0; i < 3; i++) {
    try {
      await breaker.execute(async () => {
        throw new Error('Failure');
      });
    } catch {
      // Expected
    }
  }

  assert(breaker.getState() === 'open', 'Should be open after failures');

  // Verify requests fail fast
  try {
    await breaker.execute(async () => 'should not run');
    throw new Error('Should have thrown');
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes('Circuit breaker'),
      'Should throw circuit breaker error'
    );
  }
}

async function testCircuitBreakerRecovery(): Promise<void> {
  const { CircuitBreaker } = await import('@gwi/core');

  const breaker = new CircuitBreaker('test-recovery', {
    failureThreshold: 2,
    resetTimeoutMs: 50,
    successThreshold: 2,
    failureWindowMs: 60000,
  });

  // Open the circuit
  for (let i = 0; i < 2; i++) {
    try {
      await breaker.execute(async () => {
        throw new Error('Failure');
      });
    } catch {
      // Expected
    }
  }

  assert(breaker.getState() === 'open', 'Should be open');

  // Wait for reset timeout
  await new Promise((r) => setTimeout(r, 60));

  assert(breaker.getState() === 'half-open', 'Should be half-open after timeout');

  // Successful request should eventually close
  await breaker.execute(async () => 'success');
  await breaker.execute(async () => 'success');

  assert(breaker.getState() === 'closed', 'Should be closed after recovery');
}

// =============================================================================
// Main
// =============================================================================

async function runReliabilityGate(): Promise<{ passed: boolean; report: ReliabilityReport }> {
  const results: TestResult[] = [];

  // Locking tests
  results.push(await runTest('Lock acquisition', testLockAcquisition));
  results.push(await runTest('Lock expiration', testLockExpiration));
  results.push(await runTest('Concurrent locking', testConcurrentLocking));

  // Idempotency tests
  results.push(await runTest('Idempotency key generation', testIdempotencyKeyGeneration));
  results.push(await runTest('Idempotency execution', testIdempotencyExecution));

  // Resume tests
  results.push(await runTest('Resume analysis', testResumeAnalysis));

  // Error tests
  results.push(await runTest('Error types', testErrorTypes));
  results.push(await runTest('Error pattern detection', testErrorPatternDetection));

  // Retry tests (Phase 30)
  results.push(await runTest('Retry with success', testRetryWithSuccess));
  results.push(await runTest('Retry with failure', testRetryWithFailure));
  results.push(await runTest('Retry non-retryable', testRetryNonRetryable));
  results.push(await runTest('Backoff calculation', testBackoffCalculation));

  // Circuit breaker tests (Phase 30)
  results.push(await runTest('Circuit breaker normal', testCircuitBreakerNormal));
  results.push(await runTest('Circuit breaker open', testCircuitBreakerOpen));
  results.push(await runTest('Circuit breaker recovery', testCircuitBreakerRecovery));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  const report: ReliabilityReport = {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed,
    failed,
    results,
  };

  return {
    passed: failed === 0,
    report,
  };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Reliability Gate');
  console.log('-'.repeat(60));

  runReliabilityGate().then(({ passed, report }) => {
    console.log(`\nTests: ${report.totalTests}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);

    if (report.results.length > 0) {
      console.log('\nResults:');
      for (const result of report.results) {
        const status = result.passed ? '\u2705' : '\u274C';
        console.log(`  ${status} ${result.name} (${result.durationMs}ms)`);
        if (!result.passed && result.error) {
          console.log(`     Error: ${result.error}`);
        }
      }
    }

    console.log('\n' + '-'.repeat(60));
    console.log(passed ? '\u2705 PASSED' : '\u274C FAILED');

    process.exit(passed ? 0 : 1);
  });
}

export { runReliabilityGate };
