/**
 * Environment Onboarding Hook Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EnvironmentOnboardingHook } from '../environment-onboarding-hook.js';
import type { AgentRunContext } from '../types.js';

function makeCtx(overrides?: Partial<AgentRunContext>): AgentRunContext {
  return {
    runId: 'test-run-1',
    runType: 'autopilot',
    stepId: 'step-1',
    agentRole: 'FOREMAN',
    stepStatus: 'completed',
    timestamp: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

describe('EnvironmentOnboardingHook', () => {
  let hook: EnvironmentOnboardingHook;

  beforeEach(() => {
    hook = new EnvironmentOnboardingHook();
  });

  describe('onRunStart', () => {
    it('should profile the environment from file list', async () => {
      const ctx = makeCtx({
        metadata: {
          files: [
            'package.json',
            'tsconfig.json',
            'vitest.config.ts',
            'turbo.json',
            'src/index.ts',
            'src/utils.ts',
          ],
        },
      });

      await hook.onRunStart(ctx);

      const profile = ctx.metadata?.environmentProfile as any;
      expect(profile).toBeDefined();
      expect(profile.languages).toContain('typescript');
      expect(profile.testRunners).toContain('vitest');
      expect(profile.buildTools).toContain('turbo');
      expect(profile.packageManagers).toContain('npm');
      expect(profile.isMonorepo).toBe(true);
    });

    it('should detect Python projects', async () => {
      const ctx = makeCtx({
        metadata: {
          files: [
            'pyproject.toml',
            'conftest.py',
            'src/main.py',
            'tests/test_main.py',
          ],
        },
      });

      await hook.onRunStart(ctx);

      const profile = ctx.metadata?.environmentProfile as any;
      expect(profile.languages).toContain('python');
      expect(profile.testRunners).toContain('pytest');
    });

    it('should detect Go projects', async () => {
      const ctx = makeCtx({
        metadata: {
          files: ['go.mod', 'go.sum', 'main.go', 'handler_test.go'],
        },
      });

      await hook.onRunStart(ctx);

      const profile = ctx.metadata?.environmentProfile as any;
      expect(profile.languages).toContain('go');
      expect(profile.packageManagers).toContain('go-modules');
    });

    it('should detect Rust projects', async () => {
      const ctx = makeCtx({
        metadata: {
          files: ['Cargo.toml', 'Cargo.lock', 'src/main.rs'],
        },
      });

      await hook.onRunStart(ctx);

      const profile = ctx.metadata?.environmentProfile as any;
      expect(profile.languages).toContain('rust');
      expect(profile.packageManagers).toContain('cargo');
    });

    it('should detect monorepo from directory structure', async () => {
      const ctx = makeCtx({
        metadata: {
          files: [
            'packages/core/index.ts',
            'packages/cli/index.ts',
            'apps/web/index.ts',
          ],
        },
      });

      await hook.onRunStart(ctx);

      const profile = ctx.metadata?.environmentProfile as any;
      expect(profile.isMonorepo).toBe(true);
    });

    it('should handle empty file list', async () => {
      const ctx = makeCtx({ metadata: { files: [] } });
      await hook.onRunStart(ctx);

      const profile = ctx.metadata?.environmentProfile as any;
      expect(profile).toBeDefined();
      expect(profile.languages).toEqual([]);
      expect(profile.isMonorepo).toBe(false);
    });

    it('should handle missing files metadata', async () => {
      const ctx = makeCtx({ metadata: {} });
      await hook.onRunStart(ctx);

      const profile = ctx.metadata?.environmentProfile as any;
      expect(profile).toBeDefined();
      expect(profile.languages).toEqual([]);
    });
  });

  describe('onBeforeStep', () => {
    it('should inject profile into step context', async () => {
      const runCtx = makeCtx({
        metadata: {
          files: ['package.json', 'src/index.ts'],
        },
      });
      await hook.onRunStart(runCtx);

      const stepCtx = makeCtx({ stepId: 'step-2', agentRole: 'CODER' });
      await hook.onBeforeStep(stepCtx);

      expect(stepCtx.metadata?.environmentProfile).toBeDefined();
    });

    it('should not inject when injectIntoSteps is false', async () => {
      const noInjectHook = new EnvironmentOnboardingHook({ injectIntoSteps: false });

      const runCtx = makeCtx({
        metadata: { files: ['package.json'] },
      });
      await noInjectHook.onRunStart(runCtx);

      const stepCtx = makeCtx({ stepId: 'step-2' });
      await noInjectHook.onBeforeStep(stepCtx);

      expect(stepCtx.metadata?.environmentProfile).toBeUndefined();
    });
  });

  describe('onRunEnd', () => {
    it('should clean up run profile', async () => {
      const runCtx = makeCtx({
        metadata: { files: ['package.json'] },
      });
      await hook.onRunStart(runCtx);

      await hook.onRunEnd(runCtx, true);

      // After cleanup, step should not get profile
      const stepCtx = makeCtx({ runId: 'test-run-1', stepId: 'step-late' });
      await hook.onBeforeStep(stepCtx);
      expect(stepCtx.metadata?.environmentProfile).toBeUndefined();
    });
  });

  describe('isEnabled', () => {
    it('should be enabled by default', async () => {
      expect(await hook.isEnabled()).toBe(true);
    });

    it('should be disabled when env var is false', async () => {
      const orig = process.env.GWI_ENVIRONMENT_ONBOARDING_ENABLED;
      process.env.GWI_ENVIRONMENT_ONBOARDING_ENABLED = 'false';
      try {
        expect(await hook.isEnabled()).toBe(false);
      } finally {
        if (orig === undefined) delete process.env.GWI_ENVIRONMENT_ONBOARDING_ENABLED;
        else process.env.GWI_ENVIRONMENT_ONBOARDING_ENABLED = orig;
      }
    });
  });

  describe('configFiles', () => {
    it('should track discovered config files', async () => {
      const ctx = makeCtx({
        metadata: {
          files: [
            'package.json',
            'tsconfig.json',
            'Dockerfile',
            'src/index.ts',
          ],
        },
      });

      await hook.onRunStart(ctx);

      const profile = ctx.metadata?.environmentProfile as any;
      expect(profile.configFiles).toContain('package.json');
      expect(profile.configFiles).toContain('tsconfig.json');
      expect(profile.configFiles).toContain('Dockerfile');
      expect(profile.configFiles).not.toContain('src/index.ts');
    });
  });
});
