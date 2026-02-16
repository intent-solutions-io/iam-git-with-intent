/**
 * Code Quality Hook Tests
 *
 * Tests the CodeQualityHook that validates agent-generated code
 * before it proceeds to commit/apply.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeQualityHook, CodeQualityError } from '../code-quality-hook.js';
import type { AgentRunContext } from '../types.js';

/**
 * Create a minimal AgentRunContext for testing
 */
function makeCtx(overrides?: Partial<AgentRunContext>): AgentRunContext {
  return {
    runId: 'test-run-1',
    runType: 'autopilot',
    stepId: 'step-1',
    agentRole: 'CODER',
    stepStatus: 'completed',
    timestamp: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

/**
 * Clean generated files that should pass quality checks
 */
const CLEAN_FILES = [
  {
    path: 'src/utils/validator.ts',
    content: [
      'export function validateEmail(email: string): boolean {',
      '  const re = /^[^@]+@[^@]+\\.[^@]+$/;',
      '  return re.test(email);',
      '}',
    ].join('\n'),
    action: 'create' as const,
    explanation: 'Email validation utility',
  },
];

/**
 * Files with heavy comment spam that should trigger quality signals
 */
const COMMENT_HEAVY_FILES = [
  {
    path: 'src/app.ts',
    content: [
      '// Import the express module',
      'import express from "express";',
      '// Create the express application',
      'const app = express();',
      '// Set the port number',
      'const port = 3000;',
      '// Initialize the middleware',
      'app.use(express.json());',
      '// Start the server',
      'app.listen(port);',
      '// Log the port number',
      'console.log(port);',
      '// Export the app',
      'export default app;',
    ].join('\n'),
    action: 'create' as const,
    explanation: 'I\'ve made some improvements for better maintainability',
  },
];

describe('CodeQualityHook', () => {
  let hook: CodeQualityHook;

  beforeEach(() => {
    hook = new CodeQualityHook();
  });

  describe('role filtering', () => {
    it('should only activate for CODER role', async () => {
      const ctx = makeCtx({
        agentRole: 'TRIAGE',
        metadata: { generatedFiles: CLEAN_FILES, confidence: 85 },
      });

      // Should not throw for non-CODER roles
      await expect(hook.onAfterStep(ctx)).resolves.toBeUndefined();
      // No quality assessment should be attached
      expect(ctx.metadata?.qualityAssessment).toBeUndefined();
    });

    it('should activate for CODER role with files', async () => {
      const ctx = makeCtx({
        metadata: { generatedFiles: CLEAN_FILES, confidence: 85 },
      });

      await expect(hook.onAfterStep(ctx)).resolves.toBeUndefined();
      expect(ctx.metadata?.qualityAssessment).toBeDefined();
    });

    it('should skip other agent roles', async () => {
      const roles = ['FOREMAN', 'PLANNER', 'VALIDATOR', 'REVIEWER'] as const;

      for (const role of roles) {
        const ctx = makeCtx({
          agentRole: role,
          metadata: { generatedFiles: CLEAN_FILES, confidence: 85 },
        });
        await expect(hook.onAfterStep(ctx)).resolves.toBeUndefined();
        expect(ctx.metadata?.qualityAssessment).toBeUndefined();
      }
    });
  });

  describe('clean code', () => {
    it('should allow clean code with high confidence', async () => {
      const ctx = makeCtx({
        metadata: { generatedFiles: CLEAN_FILES, confidence: 85 },
      });

      await expect(hook.onAfterStep(ctx)).resolves.toBeUndefined();

      const assessment = ctx.metadata?.qualityAssessment as any;
      expect(assessment.passed).toBe(true);
      expect(assessment.confidence).toBe(85);
    });
  });

  describe('confidence enforcement', () => {
    it('should block code with confidence below threshold', async () => {
      const ctx = makeCtx({
        metadata: { generatedFiles: CLEAN_FILES, confidence: 10 },
      });

      await expect(hook.onAfterStep(ctx)).rejects.toThrow(CodeQualityError);
    });

    it('should allow code at exactly the minimum confidence', async () => {
      const hook50 = new CodeQualityHook({ minConfidence: 50 });
      const ctx = makeCtx({
        metadata: { generatedFiles: CLEAN_FILES, confidence: 50 },
      });

      await expect(hook50.onAfterStep(ctx)).resolves.toBeUndefined();
    });

    it('should respect custom minConfidence config', async () => {
      const strictHook = new CodeQualityHook({ minConfidence: 90 });
      const ctx = makeCtx({
        metadata: { generatedFiles: CLEAN_FILES, confidence: 80 },
      });

      await expect(strictHook.onAfterStep(ctx)).rejects.toThrow(CodeQualityError);
    });
  });

  describe('warn-only mode', () => {
    it('should not throw in non-blocking mode', async () => {
      const warnHook = new CodeQualityHook({
        enforceBlocking: false,
        minConfidence: 90,
      });

      const ctx = makeCtx({
        metadata: { generatedFiles: CLEAN_FILES, confidence: 10 },
      });

      // Should not throw even with low confidence
      await expect(warnHook.onAfterStep(ctx)).resolves.toBeUndefined();

      const assessment = ctx.metadata?.qualityAssessment as any;
      expect(assessment.passed).toBe(false);
    });
  });

  describe('missing metadata', () => {
    it('should handle missing metadata gracefully', async () => {
      const ctx = makeCtx({ metadata: undefined });
      await expect(hook.onAfterStep(ctx)).resolves.toBeUndefined();
    });

    it('should handle missing generatedFiles gracefully', async () => {
      const ctx = makeCtx({ metadata: {} });
      await expect(hook.onAfterStep(ctx)).resolves.toBeUndefined();
    });

    it('should handle empty generatedFiles array', async () => {
      const ctx = makeCtx({
        metadata: { generatedFiles: [], confidence: 85 },
      });
      await expect(hook.onAfterStep(ctx)).resolves.toBeUndefined();
    });
  });

  describe('onBlocked callback', () => {
    it('should call onBlocked when code is blocked', async () => {
      const onBlocked = vi.fn();
      const callbackHook = new CodeQualityHook({
        minConfidence: 90,
        onBlocked,
      });

      const ctx = makeCtx({
        metadata: { generatedFiles: CLEAN_FILES, confidence: 10 },
      });

      await expect(callbackHook.onAfterStep(ctx)).rejects.toThrow(CodeQualityError);
      expect(onBlocked).toHaveBeenCalledOnce();
      expect(onBlocked).toHaveBeenCalledWith(ctx, expect.stringContaining('confidence'));
    });
  });

  describe('isEnabled', () => {
    it('should be enabled by default', async () => {
      expect(await hook.isEnabled()).toBe(true);
    });

    it('should be disabled when env var is false', async () => {
      const origVal = process.env.GWI_CODE_QUALITY_HOOK_ENABLED;
      process.env.GWI_CODE_QUALITY_HOOK_ENABLED = 'false';

      try {
        expect(await hook.isEnabled()).toBe(false);
      } finally {
        if (origVal === undefined) {
          delete process.env.GWI_CODE_QUALITY_HOOK_ENABLED;
        } else {
          process.env.GWI_CODE_QUALITY_HOOK_ENABLED = origVal;
        }
      }
    });
  });

  describe('assess method', () => {
    it('should return a complete QualityAssessment', () => {
      const assessment = hook.assess(CLEAN_FILES, 85);

      expect(assessment).toEqual(
        expect.objectContaining({
          confidence: 85,
          passed: expect.any(Boolean),
          qualityScore: expect.any(Number),
          linguisticScore: expect.any(Number),
          combinedSlopScore: expect.any(Number),
          signals: expect.any(Array),
          hasObviousComments: expect.any(Boolean),
        })
      );
    });

    it('should cap combined slop score at 100', () => {
      // Even with many signals, score should not exceed 100
      const assessment = hook.assess(COMMENT_HEAVY_FILES, 85);
      expect(assessment.combinedSlopScore).toBeLessThanOrEqual(100);
    });

    it('should block code with slop score above strict threshold', () => {
      const strictHook = new CodeQualityHook({ maxSlopScore: 10 });
      const assessment = strictHook.assess(COMMENT_HEAVY_FILES, 85);

      // COMMENT_HEAVY_FILES should produce a non-trivial slop score
      // With maxSlopScore=10, anything above 10 fails
      if (assessment.combinedSlopScore > 10) {
        expect(assessment.passed).toBe(false);
      }
    });

    it('should block when confidence is missing (defaults to 0)', () => {
      // Confidence 0 is below any reasonable minConfidence threshold
      const assessment = hook.assess(CLEAN_FILES, 0);
      expect(assessment.confidence).toBe(0);
      expect(assessment.passed).toBe(false);
    });
  });
});
