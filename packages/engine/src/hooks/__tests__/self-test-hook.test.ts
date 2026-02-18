/**
 * Self-Test Hook Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelfTestHook, SelfTestError } from '../self-test-hook.js';
import type { AgentRunContext } from '../types.js';

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

const SOURCE_FILES = [
  {
    path: 'src/utils/validator.ts',
    content: 'export function validateEmail(email: string): boolean {\n  return /^[^@]+@[^@]+\\.[^@]+$/.test(email);\n}',
    action: 'create' as const,
    explanation: 'Email validation',
  },
];

const TEST_FILES = [
  {
    path: 'src/utils/__tests__/validator.test.ts',
    content: 'import { describe, it, expect } from "vitest";\nimport { validateEmail } from "../validator.js";\n\ndescribe("validateEmail", () => {\n  it("should validate email", () => {\n    expect(validateEmail("a@b.c")).toBe(true);\n  });\n});',
    action: 'create' as const,
    explanation: 'Tests for email validation',
  },
];

const MIXED_FILES = [...SOURCE_FILES, ...TEST_FILES];

describe('SelfTestHook', () => {
  let hook: SelfTestHook;

  beforeEach(() => {
    hook = new SelfTestHook();
  });

  describe('role filtering', () => {
    it('should only activate for CODER role', async () => {
      const ctx = makeCtx({
        agentRole: 'REVIEWER',
        metadata: { generatedFiles: SOURCE_FILES },
      });
      await hook.onAfterStep(ctx);
      expect(ctx.metadata?.selfTestValidation).toBeUndefined();
    });

    it('should activate for CODER role', async () => {
      const ctx = makeCtx({ metadata: { generatedFiles: SOURCE_FILES } });
      await hook.onAfterStep(ctx);
      expect(ctx.metadata?.selfTestValidation).toBeDefined();
    });
  });

  describe('test detection', () => {
    it('should detect test files', async () => {
      const ctx = makeCtx({ metadata: { generatedFiles: MIXED_FILES } });
      await hook.onAfterStep(ctx);

      const validation = ctx.metadata!.selfTestValidation as any;
      expect(validation.hasTests).toBe(true);
      expect(validation.testFileCount).toBe(1);
      expect(validation.sourceFileCount).toBe(1);
      expect(validation.testRatio).toBe(1);
    });

    it('should detect absence of tests', async () => {
      const ctx = makeCtx({ metadata: { generatedFiles: SOURCE_FILES } });
      await hook.onAfterStep(ctx);

      const validation = ctx.metadata!.selfTestValidation as any;
      expect(validation.hasTests).toBe(false);
      expect(validation.testFileCount).toBe(0);
    });

    it('should detect vitest framework', async () => {
      const ctx = makeCtx({ metadata: { generatedFiles: MIXED_FILES } });
      await hook.onAfterStep(ctx);

      const validation = ctx.metadata!.selfTestValidation as any;
      expect(validation.detectedFrameworks).toContain('vitest');
    });

    it('should detect assertions', async () => {
      const ctx = makeCtx({ metadata: { generatedFiles: MIXED_FILES } });
      await hook.onAfterStep(ctx);

      const validation = ctx.metadata!.selfTestValidation as any;
      expect(validation.hasAssertions).toBe(true);
    });
  });

  describe('requireTests mode', () => {
    it('should pass when requireTests is false (default)', async () => {
      const ctx = makeCtx({ metadata: { generatedFiles: SOURCE_FILES } });
      await hook.onAfterStep(ctx);

      const validation = ctx.metadata!.selfTestValidation as any;
      expect(validation.passed).toBe(true);
    });

    it('should fail when requireTests is true and no tests provided', async () => {
      const strictHook = new SelfTestHook({ requireTests: true });
      const ctx = makeCtx({ metadata: { generatedFiles: SOURCE_FILES } });
      await strictHook.onAfterStep(ctx);

      const validation = ctx.metadata!.selfTestValidation as any;
      expect(validation.passed).toBe(false);
      expect(validation.failureReasons).toHaveLength(1);
    });

    it('should pass when requireTests is true and tests are provided', async () => {
      const strictHook = new SelfTestHook({ requireTests: true });
      const ctx = makeCtx({ metadata: { generatedFiles: MIXED_FILES } });
      await strictHook.onAfterStep(ctx);

      const validation = ctx.metadata!.selfTestValidation as any;
      expect(validation.passed).toBe(true);
    });
  });

  describe('blocking mode', () => {
    it('should throw SelfTestError on next onBeforeStep after failed validation', async () => {
      const blockingHook = new SelfTestHook({
        requireTests: true,
        enforceBlocking: true,
      });
      // onAfterStep stores the failure (does NOT throw — runner swallows afterStep errors)
      const afterCtx = makeCtx({ metadata: { generatedFiles: SOURCE_FILES } });
      await blockingHook.onAfterStep(afterCtx);

      // onBeforeStep blocks the next step
      const beforeCtx = makeCtx({ stepId: 'step-2' });
      await expect(blockingHook.onBeforeStep(beforeCtx)).rejects.toThrow(SelfTestError);
    });

    it('should not throw when passing in blocking mode', async () => {
      const blockingHook = new SelfTestHook({
        requireTests: true,
        enforceBlocking: true,
      });
      const afterCtx = makeCtx({ metadata: { generatedFiles: MIXED_FILES } });
      await blockingHook.onAfterStep(afterCtx);

      const beforeCtx = makeCtx({ stepId: 'step-2' });
      await expect(blockingHook.onBeforeStep(beforeCtx)).resolves.toBeUndefined();
    });

    it('should call onBlocked callback on onBeforeStep', async () => {
      const onBlocked = vi.fn();
      const blockingHook = new SelfTestHook({
        requireTests: true,
        enforceBlocking: true,
        onBlocked,
      });
      const afterCtx = makeCtx({ metadata: { generatedFiles: SOURCE_FILES } });
      await blockingHook.onAfterStep(afterCtx);

      const beforeCtx = makeCtx({ stepId: 'step-2' });
      await expect(blockingHook.onBeforeStep(beforeCtx)).rejects.toThrow();
      expect(onBlocked).toHaveBeenCalledOnce();
    });

    it('should not block when enforceBlocking is false', async () => {
      const nonBlockingHook = new SelfTestHook({ requireTests: true });
      const afterCtx = makeCtx({ metadata: { generatedFiles: SOURCE_FILES } });
      await nonBlockingHook.onAfterStep(afterCtx);

      const beforeCtx = makeCtx({ stepId: 'step-2' });
      await expect(nonBlockingHook.onBeforeStep(beforeCtx)).resolves.toBeUndefined();
    });

    it('should clean up validation state on run end', async () => {
      const blockingHook = new SelfTestHook({
        requireTests: true,
        enforceBlocking: true,
      });
      const afterCtx = makeCtx({ metadata: { generatedFiles: SOURCE_FILES } });
      await blockingHook.onAfterStep(afterCtx);

      // Clean up
      await blockingHook.onRunEnd(makeCtx(), true);

      // Should not block after cleanup
      const beforeCtx = makeCtx({ stepId: 'step-3' });
      await expect(blockingHook.onBeforeStep(beforeCtx)).resolves.toBeUndefined();
    });
  });

  describe('minTestRatio', () => {
    it('should fail when test ratio is below minimum', async () => {
      const ratioHook = new SelfTestHook({ minTestRatio: 0.5 });
      // 2 source files, 0 test files → ratio 0
      const files = [
        ...SOURCE_FILES,
        { path: 'src/other.ts', content: 'export const x = 1;', action: 'create' as const, explanation: 'Other' },
      ];
      const ctx = makeCtx({ metadata: { generatedFiles: files } });
      await ratioHook.onAfterStep(ctx);

      const validation = ctx.metadata!.selfTestValidation as any;
      expect(validation.passed).toBe(false);
    });
  });

  describe('missing metadata', () => {
    it('should handle missing metadata', async () => {
      const ctx = makeCtx({ metadata: undefined });
      await expect(hook.onAfterStep(ctx)).resolves.toBeUndefined();
    });

    it('should handle empty files', async () => {
      const ctx = makeCtx({ metadata: { generatedFiles: [] } });
      await expect(hook.onAfterStep(ctx)).resolves.toBeUndefined();
    });
  });

  describe('isEnabled', () => {
    it('should be enabled by default', async () => {
      expect(await hook.isEnabled()).toBe(true);
    });

    it('should be disabled when env var is false', async () => {
      const orig = process.env.GWI_SELF_TEST_HOOK_ENABLED;
      process.env.GWI_SELF_TEST_HOOK_ENABLED = 'false';
      try {
        expect(await hook.isEnabled()).toBe(false);
      } finally {
        if (orig === undefined) delete process.env.GWI_SELF_TEST_HOOK_ENABLED;
        else process.env.GWI_SELF_TEST_HOOK_ENABLED = orig;
      }
    });
  });

  describe('test pattern matching', () => {
    it('should recognize .test.ts files', () => {
      const files = [{ path: 'foo.test.ts', content: '', action: 'create' as const, explanation: '' }];
      const result = hook.validate(files);
      expect(result.testFileCount).toBe(1);
    });

    it('should recognize .spec.js files', () => {
      const files = [{ path: 'foo.spec.js', content: '', action: 'create' as const, explanation: '' }];
      const result = hook.validate(files);
      expect(result.testFileCount).toBe(1);
    });

    it('should recognize __tests__/ directory', () => {
      const files = [{ path: '__tests__/foo.ts', content: '', action: 'create' as const, explanation: '' }];
      const result = hook.validate(files);
      expect(result.testFileCount).toBe(1);
    });

    it('should recognize Python test files', () => {
      const files = [{ path: 'test_foo.py', content: '', action: 'create' as const, explanation: '' }];
      const result = hook.validate(files);
      expect(result.testFileCount).toBe(1);
    });

    it('should recognize Go test files', () => {
      const files = [{ path: 'foo_test.go', content: '', action: 'create' as const, explanation: '' }];
      const result = hook.validate(files);
      expect(result.testFileCount).toBe(1);
    });
  });
});
