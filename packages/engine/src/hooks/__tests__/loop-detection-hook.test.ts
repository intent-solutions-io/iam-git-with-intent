/**
 * Loop Detection Hook Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LoopDetectionHook,
  LoopDetectionError,
  calculateSimilarity,
} from '../loop-detection-hook.js';
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

describe('calculateSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(calculateSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('should return 0 for completely different strings', () => {
    const similarity = calculateSimilarity('abc', 'xyz');
    expect(similarity).toBe(0);
  });

  it('should return high similarity for near-identical strings', () => {
    const a = 'function validateEmail(email: string): boolean { return true; }';
    const b = 'function validateEmail(email: string): boolean { return false; }';
    expect(calculateSimilarity(a, b)).toBeGreaterThan(0.8);
  });

  it('should return low similarity for different code', () => {
    const a = 'function validateEmail(email: string): boolean { return true; }';
    const b = 'class UserService { async getUser(id: number): Promise<User> { return db.find(id); } }';
    expect(calculateSimilarity(a, b)).toBeLessThan(0.5);
  });

  it('should handle empty strings', () => {
    // Two empty strings are identical
    expect(calculateSimilarity('', '')).toBe(1);
    expect(calculateSimilarity('abc', '')).toBe(0);
    expect(calculateSimilarity('', 'abc')).toBe(0);
  });

  it('should normalize whitespace', () => {
    expect(calculateSimilarity('hello  world', 'hello world')).toBe(1);
  });
});

describe('LoopDetectionHook', () => {
  let hook: LoopDetectionHook;

  beforeEach(() => {
    hook = new LoopDetectionHook();
  });

  describe('role filtering', () => {
    it('should only track CODER role', async () => {
      const ctx = makeCtx({ agentRole: 'REVIEWER', outputSummary: 'Review output' });
      await hook.onAfterStep(ctx);
      expect(ctx.metadata?.loopDetection).toBeUndefined();
    });

    it('should track CODER role', async () => {
      const ctx = makeCtx({ outputSummary: 'Generated code' });
      await hook.onAfterStep(ctx);
      // First output — no loop, but detection result is still attached
      const detection = ctx.metadata?.loopDetection as any;
      expect(detection).toBeDefined();
      expect(detection.loopDetected).toBe(false);
      expect(detection.similarCount).toBe(1);
    });
  });

  describe('loop detection', () => {
    it('should not detect loop with different outputs', async () => {
      const outputs = [
        'Generated email validator function',
        'Built user authentication service',
        'Created database migration script',
      ];

      for (const output of outputs) {
        const ctx = makeCtx({ outputSummary: output });
        await hook.onAfterStep(ctx);
      }

      // Last ctx would have loopDetection only if loop found
      const lastCtx = makeCtx({ outputSummary: 'Another unique output' });
      await hook.onAfterStep(lastCtx);
      const detection = lastCtx.metadata?.loopDetection as any;
      if (detection) {
        expect(detection.loopDetected).toBe(false);
      }
    });

    it('should detect loop with identical outputs', async () => {
      const repeatedOutput = 'Generated email validator with regex pattern for email validation';

      // Submit 3 identical outputs (default maxSimilarOutputs=3)
      for (let i = 0; i < 3; i++) {
        const ctx = makeCtx({
          stepId: `step-${i}`,
          outputSummary: repeatedOutput,
        });
        await hook.onAfterStep(ctx);

        if (i === 2) {
          const detection = ctx.metadata?.loopDetection as any;
          expect(detection).toBeDefined();
          expect(detection.loopDetected).toBe(true);
          expect(detection.similarCount).toBe(3);
          expect(detection.suggestion).toBeTruthy();
          expect(ctx.metadata?.loopNudge).toBeTruthy();
        }
      }
    });

    it('should detect loop with near-identical outputs', async () => {
      const outputs = [
        'Generated email validator with regex pattern for user@domain.com validation',
        'Generated email validator with regex pattern for user@domain.com validation check',
        'Generated email validator with regex pattern for user@domain.com validation test',
      ];

      let lastCtx: AgentRunContext | undefined;
      for (let i = 0; i < outputs.length; i++) {
        lastCtx = makeCtx({ stepId: `step-${i}`, outputSummary: outputs[i] });
        await hook.onAfterStep(lastCtx);
      }

      const detection = lastCtx!.metadata?.loopDetection as any;
      expect(detection).toBeDefined();
      expect(detection.loopDetected).toBe(true);
    });
  });

  describe('blocking mode', () => {
    it('should throw LoopDetectionError in blocking mode', async () => {
      const blockingHook = new LoopDetectionHook({ enforceBlocking: true });
      const output = 'Identical generated code output for loop test';

      for (let i = 0; i < 2; i++) {
        const ctx = makeCtx({ stepId: `step-${i}`, outputSummary: output });
        await blockingHook.onAfterStep(ctx);
      }

      const ctx = makeCtx({ stepId: 'step-2', outputSummary: output });
      await expect(blockingHook.onAfterStep(ctx)).rejects.toThrow(LoopDetectionError);
    });

    it('should not throw when loop is not detected', async () => {
      const blockingHook = new LoopDetectionHook({ enforceBlocking: true });

      const ctx1 = makeCtx({ stepId: 'step-0', outputSummary: 'Output A' });
      await expect(blockingHook.onAfterStep(ctx1)).resolves.toBeUndefined();

      const ctx2 = makeCtx({ stepId: 'step-1', outputSummary: 'Completely different output B' });
      await expect(blockingHook.onAfterStep(ctx2)).resolves.toBeUndefined();
    });
  });

  describe('onLoopDetected callback', () => {
    it('should call callback when loop detected', async () => {
      const onLoop = vi.fn();
      const cbHook = new LoopDetectionHook({ onLoopDetected: onLoop });
      const output = 'Same output repeated multiple times in agent loop';

      for (let i = 0; i < 3; i++) {
        const ctx = makeCtx({ stepId: `step-${i}`, outputSummary: output });
        await cbHook.onAfterStep(ctx);
      }

      expect(onLoop).toHaveBeenCalledOnce();
    });
  });

  describe('onRunEnd cleanup', () => {
    it('should clean up run state', async () => {
      const ctx = makeCtx({ outputSummary: 'Some output' });
      await hook.onAfterStep(ctx);

      await hook.onRunEnd(makeCtx(), true);

      // After cleanup, same runId should start fresh
      const newCtx = makeCtx({ outputSummary: 'Some output' });
      await hook.onAfterStep(newCtx);
      // History was cleared, so this is first output — no loop
      const detection = newCtx.metadata?.loopDetection as any;
      expect(detection).toBeDefined();
      expect(detection.loopDetected).toBe(false);
      expect(detection.similarCount).toBe(1);
    });
  });

  describe('config', () => {
    it('should respect custom similarity threshold', async () => {
      // With very high threshold, similar-but-not-identical should not trigger
      const strictHook = new LoopDetectionHook({ similarityThreshold: 0.99 });

      const outputs = [
        'Generated email validator version 1',
        'Generated email validator version 2',
        'Generated email validator version 3',
      ];

      let lastCtx: AgentRunContext | undefined;
      for (let i = 0; i < outputs.length; i++) {
        lastCtx = makeCtx({ stepId: `step-${i}`, outputSummary: outputs[i] });
        await strictHook.onAfterStep(lastCtx);
      }

      const detection = lastCtx!.metadata?.loopDetection as any;
      if (detection) {
        expect(detection.loopDetected).toBe(false);
      }
    });

    it('should respect maxTrackedOutputs', async () => {
      const smallHook = new LoopDetectionHook({ maxTrackedOutputs: 2 });

      // Add 5 different outputs — only last 2 should be tracked
      for (let i = 0; i < 5; i++) {
        const ctx = makeCtx({ stepId: `step-${i}`, outputSummary: `Unique output ${i}` });
        await smallHook.onAfterStep(ctx);
      }

      // No loop should be detected since all outputs are unique
      const ctx = makeCtx({ stepId: 'step-5', outputSummary: 'Another unique output' });
      await smallHook.onAfterStep(ctx);
      const detection = ctx.metadata?.loopDetection as any;
      if (detection) {
        expect(detection.loopDetected).toBe(false);
      }
    });
  });

  describe('isEnabled', () => {
    it('should be enabled by default', async () => {
      expect(await hook.isEnabled()).toBe(true);
    });

    it('should be disabled when env var is false', async () => {
      const orig = process.env.GWI_LOOP_DETECTION_ENABLED;
      process.env.GWI_LOOP_DETECTION_ENABLED = 'false';
      try {
        expect(await hook.isEnabled()).toBe(false);
      } finally {
        if (orig === undefined) delete process.env.GWI_LOOP_DETECTION_ENABLED;
        else process.env.GWI_LOOP_DETECTION_ENABLED = orig;
      }
    });
  });
});
