/**
 * Self-Test Execution Hook
 *
 * Harness Engineering Pattern 1: Build & Self-Verify
 *
 * Validates CODER output by checking whether generated code includes tests,
 * whether test files follow naming conventions, and whether the code/test
 * ratio is reasonable. Attaches validation metadata for the Reviewer to consume.
 *
 * @module @gwi/engine/hooks
 */

import { getLogger, type CodeGenerationResult } from '@gwi/core';
import type { AgentHook, AgentRunContext } from './types.js';

const logger = getLogger('self-test-hook');

// =============================================================================
// Types
// =============================================================================

/**
 * Result of self-test validation
 */
export interface SelfTestValidation {
  /** Whether tests were included with the generated code */
  hasTests: boolean;
  /** Number of test files found */
  testFileCount: number;
  /** Number of source files found */
  sourceFileCount: number;
  /** Test-to-source ratio */
  testRatio: number;
  /** Detected test framework patterns */
  detectedFrameworks: string[];
  /** Whether code contains assertion-like patterns */
  hasAssertions: boolean;
  /** Validation passed */
  passed: boolean;
  /** Reasons for failure */
  failureReasons: string[];
}

/**
 * Configuration for self-test hook
 */
export interface SelfTestConfig {
  /** Require tests for generated code. @default false (warn only) */
  requireTests: boolean;
  /** Minimum test-to-source ratio. @default 0 (no minimum) */
  minTestRatio: number;
  /** Block on failure (throw) or just warn. @default false */
  enforceBlocking: boolean;
  /** File patterns considered test files */
  testPatterns: RegExp[];
  /** Callback when validation fails */
  onBlocked?: (ctx: AgentRunContext, reason: string) => Promise<void>;
}

/**
 * Default configuration
 */
export const DEFAULT_SELF_TEST_CONFIG: SelfTestConfig = {
  requireTests: false,
  minTestRatio: 0,
  enforceBlocking: false,
  testPatterns: [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\//,
    /\.test\.py$/,
    /test_.*\.py$/,
    /\.test\.go$/,
    /_test\.go$/,
  ],
};

// =============================================================================
// Test Framework Detection Patterns
// =============================================================================

const FRAMEWORK_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /import\s+.*\bvitest\b|from\s+['"]vitest['"]/, name: 'vitest' },
  { pattern: /import\s+.*\bjest\b|from\s+['"]@jest\//, name: 'jest' },
  { pattern: /import\s+.*\bmocha\b|describe\s*\(/, name: 'mocha' },
  { pattern: /import\s+.*\bpytest\b|def\s+test_/, name: 'pytest' },
  { pattern: /import\s+.*testing\b|func\s+Test/, name: 'go-testing' },
  { pattern: /assert\s*\(|expect\s*\(|assertEquals/, name: 'assertions' },
];

// =============================================================================
// Error
// =============================================================================

/**
 * Error thrown when self-test validation fails in blocking mode
 */
export class SelfTestError extends Error {
  constructor(
    message: string,
    public readonly validation: SelfTestValidation,
  ) {
    super(message);
    this.name = 'SelfTestError';
  }
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Self-Test Execution Hook
 *
 * Validates that CODER output includes appropriate tests.
 * Runs after CODER steps and attaches validation metadata
 * for the Reviewer agent to consume.
 */
export class SelfTestHook implements AgentHook {
  readonly name = 'self-test';
  private config: SelfTestConfig;

  constructor(config?: Partial<SelfTestConfig>) {
    this.config = { ...DEFAULT_SELF_TEST_CONFIG, ...config };
  }

  /**
   * Validate CODER output for test inclusion
   */
  async onAfterStep(ctx: AgentRunContext): Promise<void> {
    // Only activate for CODER role
    if (ctx.agentRole !== 'CODER') {
      return;
    }

    const generatedFiles = ctx.metadata?.generatedFiles as CodeGenerationResult['files'] | undefined;

    if (!generatedFiles || generatedFiles.length === 0) {
      return;
    }

    const validation = this.validate(generatedFiles);

    // Attach validation to metadata for Reviewer consumption
    if (ctx.metadata) {
      ctx.metadata.selfTestValidation = validation;
    }

    if (validation.passed) {
      logger.info('Self-test validation passed', {
        runId: ctx.runId,
        testFileCount: validation.testFileCount,
        testRatio: validation.testRatio.toFixed(2),
      });
      return;
    }

    const reason = `Self-test validation failed: ${validation.failureReasons.join('; ')}`;

    if (this.config.enforceBlocking) {
      await this.config.onBlocked?.(ctx, reason);
      throw new SelfTestError(reason, validation);
    }

    logger.warn('Self-test validation failed (non-blocking)', {
      runId: ctx.runId,
      reasons: validation.failureReasons,
      testFileCount: validation.testFileCount,
      sourceFileCount: validation.sourceFileCount,
    });
  }

  /**
   * Check if this hook is enabled
   */
  async isEnabled(): Promise<boolean> {
    return process.env.GWI_SELF_TEST_HOOK_ENABLED !== 'false';
  }

  /**
   * Validate generated files for test inclusion
   */
  validate(files: CodeGenerationResult['files']): SelfTestValidation {
    const testFiles: string[] = [];
    const sourceFiles: string[] = [];
    const detectedFrameworks = new Set<string>();
    let hasAssertions = false;

    for (const file of files) {
      const isTest = this.config.testPatterns.some((p) => p.test(file.path));

      if (isTest) {
        testFiles.push(file.path);
      } else {
        sourceFiles.push(file.path);
      }

      // Detect test frameworks in content
      for (const { pattern, name } of FRAMEWORK_PATTERNS) {
        if (pattern.test(file.content)) {
          detectedFrameworks.add(name);
        }
      }

      // Check for assertion patterns
      if (/\b(assert|expect|should)\s*[.(]/.test(file.content)) {
        hasAssertions = true;
      }
    }

    const testRatio = sourceFiles.length > 0
      ? testFiles.length / sourceFiles.length
      : testFiles.length > 0 ? 1 : 0;

    const failureReasons: string[] = [];

    if (this.config.requireTests && testFiles.length === 0 && sourceFiles.length > 0) {
      failureReasons.push(
        `No test files generated for ${sourceFiles.length} source file(s)`
      );
    }

    if (this.config.minTestRatio > 0 && testRatio < this.config.minTestRatio) {
      failureReasons.push(
        `Test ratio ${testRatio.toFixed(2)} below minimum ${this.config.minTestRatio}`
      );
    }

    return {
      hasTests: testFiles.length > 0,
      testFileCount: testFiles.length,
      sourceFileCount: sourceFiles.length,
      testRatio,
      detectedFrameworks: [...detectedFrameworks],
      hasAssertions,
      passed: failureReasons.length === 0,
      failureReasons,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a self-test hook
 */
export function createSelfTestHook(
  config?: Partial<SelfTestConfig>,
): SelfTestHook {
  return new SelfTestHook(config);
}
