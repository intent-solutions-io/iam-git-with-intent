/**
 * Phase 27: Forensics Wiring Golden Tests
 *
 * Tests that ForensicCollector is correctly wired into the run engine
 * when GWI_FORENSICS_ENABLED=1 is set.
 *
 * NO LIVE LLM CALLS - uses mocked engine behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, rmSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isForensicsEnabled,
  createForensicCollector,
  validateForensicBundle,
  type ForensicBundle,
} from '@gwi/core';

const TEST_FORENSICS_DIR = '.gwi/test-forensics';

describe('Forensics Wiring', () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_FORENSICS_DIR)) {
      rmSync(TEST_FORENSICS_DIR, { recursive: true });
    }
    mkdirSync(TEST_FORENSICS_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(TEST_FORENSICS_DIR)) {
      rmSync(TEST_FORENSICS_DIR, { recursive: true });
    }
    // Reset env
    vi.unstubAllEnvs();
  });

  describe('Feature Flag', () => {
    it('should return false when GWI_FORENSICS_ENABLED is not set', () => {
      vi.stubEnv('GWI_FORENSICS_ENABLED', '');
      expect(isForensicsEnabled()).toBe(false);
    });

    it('should return true when GWI_FORENSICS_ENABLED=1', () => {
      vi.stubEnv('GWI_FORENSICS_ENABLED', '1');
      expect(isForensicsEnabled()).toBe(true);
    });

    it('should return true when GWI_FORENSICS_ENABLED=true', () => {
      vi.stubEnv('GWI_FORENSICS_ENABLED', 'true');
      expect(isForensicsEnabled()).toBe(true);
    });
  });

  describe('Collector Integration', () => {
    it('should create a valid bundle with run lifecycle events', () => {
      const collector = createForensicCollector({
        tenantId: 'test-tenant',
        runId: 'test-run-123',
        workflowId: 'test-workflow',
        agentId: 'orchestrator',
        model: 'claude-sonnet-4-20250514',
        computeChecksum: true,
      });

      // Simulate run lifecycle
      collector.start({
        runType: 'AUTOPILOT',
        repo: 'test/repo',
        prNumber: 42,
        trigger: 'webhook',
      });

      // Record some events
      collector.stepStarted('step-1', 'triage', 0);
      collector.stepCompleted('step-1', 'triage', 0, { complexity: 'low' }, 1500);

      collector.llmRequest('anthropic', 'claude-sonnet-4-20250514', 'test prompt');
      collector.llmResponse('anthropic', 'claude-sonnet-4-20250514', 'test response', {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      }, 500);

      collector.policyCheck('policy-default', 'run.start', 'allow', 'All checks passed');

      collector.complete({ success: true, filesChanged: 3 });

      // Build and validate bundle
      const bundle = collector.build();

      expect(bundle.version).toBe(1);
      expect(bundle.run_id).toBe('test-run-123');
      expect(bundle.tenant_id).toBe('test-tenant');
      expect(bundle.run_status).toBe('completed');
      expect(bundle.checksum).toBeDefined();
      expect(bundle.events.length).toBeGreaterThan(0);

      // Validate against schema
      const validation = validateForensicBundle(bundle);
      expect(validation.valid).toBe(true);
    });

    it('should redact secrets in bundle', () => {
      const collector = createForensicCollector({
        tenantId: 'test-tenant',
        runId: 'test-run-secrets',
      });

      collector.start({
        apiKey: 'sk-ant-api03-secretkey123456789012345678901234567890',
        githubToken: 'ghp_abcdefghijklmnopqrstuvwxyz1234567890',
      });
      collector.complete({});

      const bundle = collector.build();

      // Check redaction was applied
      expect(bundle.redaction.applied).toBe(true);
      expect(bundle.redaction.redaction_count).toBeGreaterThan(0);

      // Check secrets are not in the bundle
      const bundleStr = JSON.stringify(bundle);
      expect(bundleStr).not.toContain('sk-ant-api03');
      expect(bundleStr).not.toContain('ghp_abcdefgh');
      expect(bundleStr).toContain('[REDACTED');
    });

    it('should track token usage aggregates', () => {
      const collector = createForensicCollector({
        tenantId: 'test-tenant',
        runId: 'test-run-tokens',
      });

      collector.start({});

      // Multiple LLM calls
      collector.llmResponse('anthropic', 'claude-sonnet-4-20250514', 'response 1', {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      }, 500);

      collector.llmResponse('google', 'gemini-2.0-flash', 'response 2', {
        prompt_tokens: 200,
        completion_tokens: 100,
        total_tokens: 300,
      }, 300);

      collector.complete({});

      const bundle = collector.build();

      // Check aggregates
      expect(bundle.total_tokens).toBeDefined();
      expect(bundle.total_tokens?.prompt_tokens).toBe(300);
      expect(bundle.total_tokens?.completion_tokens).toBe(150);
      expect(bundle.total_tokens?.total_tokens).toBe(450);
      expect(bundle.total_llm_latency_ms).toBe(800);
    });

    it('should track policy check aggregates', () => {
      const collector = createForensicCollector({
        tenantId: 'test-tenant',
        runId: 'test-run-policy',
      });

      collector.start({});

      collector.policyCheck('policy-1', 'action.1', 'allow');
      collector.policyCheck('policy-2', 'action.2', 'allow');
      collector.policyCheck('policy-3', 'action.3', 'deny', 'Denied by policy');

      collector.complete({});

      const bundle = collector.build();

      expect(bundle.policy_summary).toBeDefined();
      expect(bundle.policy_summary?.total_checks).toBe(3);
    });

    it('should handle failed runs', () => {
      const collector = createForensicCollector({
        tenantId: 'test-tenant',
        runId: 'test-run-failed',
      });

      collector.start({ input: 'test' });
      collector.fail({
        name: 'WorkflowError',
        message: 'Something went wrong',
        code: 'ERR_WORKFLOW',
      });

      const bundle = collector.build();

      expect(bundle.run_status).toBe('failed');
      expect(bundle.error).toBeDefined();
      expect(bundle.error?.name).toBe('WorkflowError');
      expect(bundle.error?.message).toBe('Something went wrong');
    });

    it('should count events by type', () => {
      const collector = createForensicCollector({
        tenantId: 'test-tenant',
        runId: 'test-run-counts',
      });

      collector.start({});
      collector.stepStarted('s1', 'step1', 0);
      collector.stepStarted('s2', 'step2', 1);
      collector.stepCompleted('s1', 'step1', 0);
      collector.stepCompleted('s2', 'step2', 1);
      collector.llmRequest('anthropic', 'claude');
      collector.llmRequest('anthropic', 'claude');
      collector.llmResponse('anthropic', 'claude', 'r1', { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, 100);
      collector.llmResponse('anthropic', 'claude', 'r2', { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, 100);
      collector.complete({});

      const bundle = collector.build();

      expect(bundle.event_counts['run.started']).toBe(1);
      expect(bundle.event_counts['run.completed']).toBe(1);
      expect(bundle.event_counts['step.started']).toBe(2);
      expect(bundle.event_counts['step.completed']).toBe(2);
      expect(bundle.event_counts['llm.request']).toBe(2);
      expect(bundle.event_counts['llm.response']).toBe(2);
    });
  });

  describe('Bundle Persistence', () => {
    it('should write valid JSON bundle to file', () => {
      const collector = createForensicCollector({
        tenantId: 'test-tenant',
        runId: 'test-run-persist',
        computeChecksum: true,
      });

      collector.start({ test: true });
      collector.complete({ done: true });

      const bundle = collector.build();

      // Write bundle
      const { writeFileSync } = require('node:fs');
      const filePath = join(TEST_FORENSICS_DIR, `${bundle.run_id}.json`);
      writeFileSync(filePath, JSON.stringify(bundle, null, 2));

      // Read and validate
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      const validation = validateForensicBundle(parsed);

      expect(validation.valid).toBe(true);
      expect(validation.bundle?.checksum).toBe(bundle.checksum);
    });
  });

  describe('Provider Agnostic Support', () => {
    it('should accept any provider string', () => {
      const collector = createForensicCollector({
        tenantId: 'test-tenant',
        runId: 'test-run-providers',
      });

      collector.start({});

      // Test with various providers
      collector.llmRequest('anthropic', 'claude-3-opus', 'prompt1');
      collector.llmResponse('anthropic', 'claude-3-opus', 'response1', {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      }, 100);

      collector.llmRequest('openai', 'gpt-4-turbo', 'prompt2');
      collector.llmResponse('openai', 'gpt-4-turbo', 'response2', {
        prompt_tokens: 20,
        completion_tokens: 10,
        total_tokens: 30,
      }, 200);

      collector.llmRequest('google', 'gemini-2.0-flash', 'prompt3');
      collector.llmResponse('google', 'gemini-2.0-flash', 'response3', {
        prompt_tokens: 15,
        completion_tokens: 8,
        total_tokens: 23,
      }, 150);

      collector.llmRequest('ollama', 'llama3:70b', 'prompt4');
      collector.llmResponse('ollama', 'llama3:70b', 'response4', {
        prompt_tokens: 25,
        completion_tokens: 12,
        total_tokens: 37,
      }, 300);

      collector.llmRequest('custom-vllm', 'my-custom-model', 'prompt5');
      collector.llmResponse('custom-vllm', 'my-custom-model', 'response5', {
        prompt_tokens: 30,
        completion_tokens: 15,
        total_tokens: 45,
      }, 250);

      collector.complete({});

      const bundle = collector.build();

      // All events should be recorded
      expect(bundle.event_counts['llm.request']).toBe(5);
      expect(bundle.event_counts['llm.response']).toBe(5);

      // Validate bundle
      const validation = validateForensicBundle(bundle);
      expect(validation.valid).toBe(true);

      // Check provider values are preserved in events
      const providers = bundle.events
        .filter(e => e.type === 'llm.response')
        .map(e => (e.data as Record<string, unknown>).provider);

      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toContain('google');
      expect(providers).toContain('ollama');
      expect(providers).toContain('custom-vllm');
    });
  });
});
