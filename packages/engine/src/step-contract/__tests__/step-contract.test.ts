/**
 * Step Contract Tests
 *
 * Tests the step execution contract types and validation.
 */

import { describe, it, expect } from 'vitest';
import {
  StepResultCode,
  RESULT_CODE_RETRY_MAP,
  RESULT_CODE_CONTINUE_MAP,
  ArtifactPointer,
  type StepInput,
  type StepOutput,
} from '../types.js';
import {
  validateStepInput,
  validateStepOutput,
  assertValidStepInput,
  assertValidStepOutput,
  StepValidationError,
  validateOutputSemantics,
} from '../validation.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const validStepInput: StepInput = {
  runId: '550e8400-e29b-41d4-a716-446655440000',
  stepId: 'step-001',
  tenantId: 'tenant-123',
  repo: {
    owner: 'acme',
    name: 'my-repo',
    fullName: 'acme/my-repo',
    defaultBranch: 'main',
  },
  pr: {
    number: 42,
    title: 'Fix bug in login',
    url: 'https://github.com/acme/my-repo/pull/42',
    baseBranch: 'main',
    headBranch: 'fix/login-bug',
    baseSha: 'abc123def456',
    headSha: '789xyz000111',
    author: 'developer',
    state: 'open',
    isDraft: false,
    labels: ['bug', 'priority:high'],
  },
  stepType: 'triage',
  riskMode: 'suggest_patch',
  capabilitiesMode: 'patch-only',
  queuedAt: '2024-12-19T10:00:00.000Z',
  attemptNumber: 0,
  maxAttempts: 3,
};

const validStepOutput: StepOutput = {
  runId: '550e8400-e29b-41d4-a716-446655440000',
  stepId: 'step-001',
  resultCode: 'ok',
  summary: 'Triage completed successfully',
  data: { complexity: 3, riskLevel: 'medium' },
  timing: {
    startedAt: '2024-12-19T10:00:00.000Z',
    completedAt: '2024-12-19T10:00:05.000Z',
    durationMs: 5000,
    llmWaitMs: 4500,
  },
  cost: {
    model: 'gemini-1.5-flash',
    provider: 'google',
    tokens: { input: 1000, output: 500, total: 1500 },
    estimatedCostUsd: 0.0015,
  },
  requiresApproval: false,
};

// =============================================================================
// Result Code Tests
// =============================================================================

describe('StepResultCode', () => {
  it('should define all result codes', () => {
    const codes = StepResultCode.options;
    expect(codes).toContain('ok');
    expect(codes).toContain('retryable');
    expect(codes).toContain('fatal');
    expect(codes).toContain('blocked');
    expect(codes).toContain('skipped');
  });

  it('should have correct retry map', () => {
    expect(RESULT_CODE_RETRY_MAP.ok).toBe(false);
    expect(RESULT_CODE_RETRY_MAP.retryable).toBe(true);
    expect(RESULT_CODE_RETRY_MAP.fatal).toBe(false);
    expect(RESULT_CODE_RETRY_MAP.blocked).toBe(false);
    expect(RESULT_CODE_RETRY_MAP.skipped).toBe(false);
  });

  it('should have correct continue map', () => {
    expect(RESULT_CODE_CONTINUE_MAP.ok).toBe(true);
    expect(RESULT_CODE_CONTINUE_MAP.retryable).toBe(false);
    expect(RESULT_CODE_CONTINUE_MAP.fatal).toBe(false);
    expect(RESULT_CODE_CONTINUE_MAP.blocked).toBe(false);
    expect(RESULT_CODE_CONTINUE_MAP.skipped).toBe(true);
  });
});

// =============================================================================
// Artifact Pointer Tests
// =============================================================================

describe('ArtifactPointer', () => {
  it('should validate correct GCS URIs', () => {
    const result = ArtifactPointer.safeParse({
      uri: 'gs://my-bucket/path/to/artifact.json',
      contentType: 'application/json',
      sizeBytes: 1024,
      sha256: 'a'.repeat(64),
      createdAt: '2024-12-19T10:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid GCS URIs', () => {
    const result = ArtifactPointer.safeParse({
      uri: 'https://storage.googleapis.com/bucket/file',
      contentType: 'application/json',
      sizeBytes: 1024,
      sha256: 'a'.repeat(64),
      createdAt: '2024-12-19T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid SHA256', () => {
    const result = ArtifactPointer.safeParse({
      uri: 'gs://my-bucket/file.json',
      contentType: 'application/json',
      sizeBytes: 1024,
      sha256: 'too-short',
      createdAt: '2024-12-19T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// StepInput Validation Tests
// =============================================================================

describe('StepInput Validation', () => {
  it('should validate correct step input', () => {
    const result = validateStepInput(validStepInput);
    expect(result.valid).toBe(true);
    expect(result.data).toEqual(validStepInput);
  });

  it('should reject missing required fields', () => {
    const result = validateStepInput({});
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('should reject invalid UUID for runId', () => {
    const input = { ...validStepInput, runId: 'not-a-uuid' };
    const result = validateStepInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.path.includes('runId'))).toBe(true);
  });

  it('should reject invalid step type', () => {
    const input = { ...validStepInput, stepType: 'invalid-type' };
    const result = validateStepInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.path.includes('stepType'))).toBe(true);
  });

  it('should accept input without PR context', () => {
    const { pr, ...inputWithoutPR } = validStepInput;
    const result = validateStepInput(inputWithoutPR);
    expect(result.valid).toBe(true);
  });

  it('assertValidStepInput should throw for invalid input', () => {
    expect(() => assertValidStepInput({})).toThrow(StepValidationError);
  });

  it('assertValidStepInput should return data for valid input', () => {
    const data = assertValidStepInput(validStepInput);
    expect(data.runId).toBe(validStepInput.runId);
  });
});

// =============================================================================
// StepOutput Validation Tests
// =============================================================================

describe('StepOutput Validation', () => {
  it('should validate correct step output', () => {
    const result = validateStepOutput(validStepOutput);
    expect(result.valid).toBe(true);
    expect(result.data).toEqual(validStepOutput);
  });

  it('should reject missing result code', () => {
    const { resultCode, ...outputWithoutCode } = validStepOutput;
    const result = validateStepOutput(outputWithoutCode);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.path.includes('resultCode'))).toBe(true);
  });

  it('should reject invalid result code', () => {
    const output = { ...validStepOutput, resultCode: 'invalid' };
    const result = validateStepOutput(output);
    expect(result.valid).toBe(false);
  });

  it('should accept output with error for retryable code', () => {
    const output = {
      ...validStepOutput,
      resultCode: 'retryable' as const,
      error: {
        message: 'Rate limited',
        code: 'RATE_LIMIT',
        retryAfterMs: 5000,
      },
    };
    const result = validateStepOutput(output);
    expect(result.valid).toBe(true);
  });

  it('assertValidStepOutput should throw for invalid output', () => {
    expect(() => assertValidStepOutput({}, 'test-step')).toThrow(StepValidationError);
  });

  it('assertValidStepOutput should include step ID in error', () => {
    try {
      assertValidStepOutput({}, 'my-step-id');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(StepValidationError);
      expect((error as StepValidationError).message).toContain('my-step-id');
    }
  });
});

// =============================================================================
// Semantic Validation Tests
// =============================================================================

describe('Semantic Validation', () => {
  it('should pass for valid output', () => {
    const errors = validateOutputSemantics(validStepOutput);
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('should detect timing inconsistency', () => {
    const output = {
      ...validStepOutput,
      timing: {
        startedAt: '2024-12-19T10:00:10.000Z',
        completedAt: '2024-12-19T10:00:00.000Z', // Before start!
        durationMs: 5000,
      },
    };
    const errors = validateOutputSemantics(output);
    expect(errors.some(e => e.code === 'TIMING_INCONSISTENT')).toBe(true);
  });

  it('should detect missing error for fatal result', () => {
    const output = {
      ...validStepOutput,
      resultCode: 'fatal' as const,
      error: undefined,
    };
    const errors = validateOutputSemantics(output);
    expect(errors.some(e => e.code === 'MISSING_ERROR')).toBe(true);
  });

  it('should detect missing proposed changes when approval required', () => {
    const output = {
      ...validStepOutput,
      requiresApproval: true,
      proposedChanges: undefined,
    };
    const errors = validateOutputSemantics(output);
    expect(errors.some(e => e.code === 'MISSING_PROPOSED_CHANGES')).toBe(true);
  });

  it('should detect token count mismatch', () => {
    const output = {
      ...validStepOutput,
      cost: {
        ...validStepOutput.cost!,
        tokens: { input: 1000, output: 500, total: 9999 }, // Wrong total
      },
    };
    const errors = validateOutputSemantics(output);
    expect(errors.some(e => e.code === 'TOKEN_COUNT_MISMATCH')).toBe(true);
  });
});

// =============================================================================
// StepValidationError Tests
// =============================================================================

describe('StepValidationError', () => {
  it('should have correct name', () => {
    const error = new StepValidationError('input', [
      { path: ['runId'], message: 'Required' },
    ]);
    expect(error.name).toBe('StepValidationError');
  });

  it('should include direction in message', () => {
    const error = new StepValidationError('output', [
      { path: ['resultCode'], message: 'Invalid' },
    ]);
    expect(error.message).toContain('output');
  });

  it('should include step ID when provided', () => {
    const error = new StepValidationError(
      'output',
      [{ path: [], message: 'Test' }],
      'step-xyz'
    );
    expect(error.message).toContain('step-xyz');
    expect(error.stepId).toBe('step-xyz');
  });

  it('should truncate error list in message', () => {
    const manyErrors = Array(10).fill(null).map((_, i) => ({
      path: [`field${i}`],
      message: `Error ${i}`,
    }));
    const error = new StepValidationError('input', manyErrors);
    expect(error.message).toContain('+7 more');
    expect(error.errors).toHaveLength(10);
  });
});
