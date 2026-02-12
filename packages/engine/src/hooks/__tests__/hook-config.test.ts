/**
 * Hook Configuration Tests
 *
 * Verifies that buildDefaultHookRunner() registers the correct hooks
 * based on environment variables.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @gwi/core logger
vi.mock('@gwi/core', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  meetsRiskTier: vi.fn(() => true),
  getDecisionTraceStore: vi.fn(() => ({
    saveTrace: vi.fn(),
    getTracesForRun: vi.fn().mockResolvedValue([]),
  })),
  generateTraceId: vi.fn(() => 'trace-test-1'),
}));

vi.mock('@gwi/agents', () => ({
  analyzeQuality: vi.fn(() => ({ totalWeight: 0, signals: [] })),
  analyzeLinguistic: vi.fn(() => ({ totalWeight: 0, signals: [] })),
  hasObviousComments: vi.fn(() => false),
}));

import { buildDefaultHookRunner, readHookConfigFromEnv } from '../config.js';

describe('Hook Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('readHookConfigFromEnv', () => {
    it('returns defaults when no env vars set', () => {
      const config = readHookConfigFromEnv();
      expect(config.enableCustomHooks).toBe(true);
      expect(config.hookTimeoutMs).toBe(5000);
      expect(config.parallelExecution).toBe(true);
      expect(config.debug).toBe(false);
    });

    it('reads GWI_HOOK_DEBUG', () => {
      process.env.GWI_HOOK_DEBUG = 'true';
      const config = readHookConfigFromEnv();
      expect(config.debug).toBe(true);
    });
  });

  describe('buildDefaultHookRunner', () => {
    it('registers risk-enforcement hook by default', async () => {
      const runner = await buildDefaultHookRunner();
      const hookNames = runner.getRegisteredHooks();
      expect(hookNames).toContain('risk-enforcement');
    });

    it('registers code-quality hook by default', async () => {
      const runner = await buildDefaultHookRunner();
      const hookNames = runner.getRegisteredHooks();
      expect(hookNames).toContain('code-quality');
    });

    it('does not register decision-trace by default', async () => {
      delete process.env.GWI_DECISION_TRACE_ENABLED;
      const runner = await buildDefaultHookRunner();
      const hookNames = runner.getRegisteredHooks();
      expect(hookNames).not.toContain('decision-trace');
    });

    it('registers decision-trace when GWI_DECISION_TRACE_ENABLED=true', async () => {
      process.env.GWI_DECISION_TRACE_ENABLED = 'true';
      const runner = await buildDefaultHookRunner();
      const hookNames = runner.getRegisteredHooks();
      expect(hookNames).toContain('decision-trace');
    });

    it('excludes risk-enforcement when GWI_RISK_ENFORCEMENT_ENABLED=false', async () => {
      process.env.GWI_RISK_ENFORCEMENT_ENABLED = 'false';
      const runner = await buildDefaultHookRunner();
      const hookNames = runner.getRegisteredHooks();
      expect(hookNames).not.toContain('risk-enforcement');
    });

    it('excludes code-quality when GWI_CODE_QUALITY_HOOK_ENABLED=false', async () => {
      process.env.GWI_CODE_QUALITY_HOOK_ENABLED = 'false';
      const runner = await buildDefaultHookRunner();
      const hookNames = runner.getRegisteredHooks();
      expect(hookNames).not.toContain('code-quality');
    });

    it('registers all three hooks when all enabled', async () => {
      process.env.GWI_DECISION_TRACE_ENABLED = 'true';
      const runner = await buildDefaultHookRunner();
      const hookNames = runner.getRegisteredHooks();
      expect(hookNames).toContain('decision-trace');
      expect(hookNames).toContain('risk-enforcement');
      expect(hookNames).toContain('code-quality');
      expect(hookNames.length).toBe(3);
    });
  });
});
