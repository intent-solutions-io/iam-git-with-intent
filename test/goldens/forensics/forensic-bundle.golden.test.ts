/**
 * Phase 27: ForensicBundle Golden Tests
 *
 * Deterministic tests for ForensicBundle schema validation,
 * redaction service, and replay engine.
 *
 * NO LIVE LLM CALLS - uses frozen fixtures only.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateForensicBundle,
  ForensicBundleSchema,
  RedactionService,
  getRedactionService,
  resetRedactionService,
  ForensicCollector,
  createForensicCollector,
  ReplayEngine,
  diffValues,
  createComparisonResult,
  type ForensicBundle,
} from '@gwi/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load a test fixture
 */
function loadFixture(name: string): unknown {
  const path = join(__dirname, 'fixtures', name);
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

// =============================================================================
// ForensicBundle Schema Validation
// =============================================================================

describe('ForensicBundle Schema Validation', () => {
  describe('Valid Bundles', () => {
    it('should validate a complete valid bundle', () => {
      const bundle = loadFixture('valid-bundle.json');
      const result = validateForensicBundle(bundle);
      expect(result.valid).toBe(true);
      expect(result.bundle).toBeDefined();
    });

    it('should parse all required fields', () => {
      const data = loadFixture('valid-bundle.json');
      const bundle = ForensicBundleSchema.parse(data);

      expect(bundle.version).toBe(1);
      expect(bundle.bundle_id).toBeDefined();
      expect(bundle.run_id).toBeDefined();
      expect(bundle.tenant_id).toBeDefined();
      expect(bundle.run_status).toBe('completed');
      expect(bundle.events.length).toBeGreaterThan(0);
      expect(bundle.redaction).toBeDefined();
    });

    it('should have correct event counts', () => {
      const data = loadFixture('valid-bundle.json');
      const bundle = ForensicBundleSchema.parse(data);

      expect(bundle.event_counts['run.started']).toBe(1);
      expect(bundle.event_counts['run.completed']).toBe(1);
      expect(bundle.event_counts['llm.response']).toBe(1);
    });
  });

  describe('Invalid Bundles - Schema Errors', () => {
    it('should reject bundle with invalid version', () => {
      const bundle = loadFixture('valid-bundle.json') as Record<string, unknown>;
      bundle.version = 2;

      const result = validateForensicBundle(bundle);
      expect(result.valid).toBe(false);
    });

    it('should reject bundle with missing run_id', () => {
      const bundle = loadFixture('valid-bundle.json') as Record<string, unknown>;
      delete bundle.run_id;

      const result = validateForensicBundle(bundle);
      expect(result.valid).toBe(false);
    });

    it('should reject bundle with invalid run_status', () => {
      const bundle = loadFixture('valid-bundle.json') as Record<string, unknown>;
      bundle.run_status = 'invalid_status';

      const result = validateForensicBundle(bundle);
      expect(result.valid).toBe(false);
    });

    it('should reject bundle with invalid event type', () => {
      const bundle = loadFixture('valid-bundle.json') as Record<string, unknown>;
      const events = bundle.events as Array<Record<string, unknown>>;
      events[0].type = 'invalid.event';

      const result = validateForensicBundle(bundle);
      expect(result.valid).toBe(false);
    });

    it('should reject bundle with missing event_id', () => {
      const bundle = loadFixture('valid-bundle.json') as Record<string, unknown>;
      const events = bundle.events as Array<Record<string, unknown>>;
      delete events[0].event_id;

      const result = validateForensicBundle(bundle);
      expect(result.valid).toBe(false);
    });
  });
});

// =============================================================================
// Redaction Service
// =============================================================================

describe('Redaction Service', () => {
  let service: RedactionService;

  beforeEach(() => {
    resetRedactionService();
    service = new RedactionService();
  });

  describe('API Key Redaction', () => {
    it('should redact OpenAI API keys', () => {
      const input = 'My API key is sk-abcdefghijklmnopqrstuvwxyz1234567890';
      const { result, count } = service.redactString(input);

      expect(result).toContain('[REDACTED:OPENAI_KEY]');
      expect(result).not.toContain('sk-abcdefghijklmnop');
      expect(count).toBe(1);
    });

    it('should redact Anthropic API keys', () => {
      const input = 'Use this key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890';
      const { result, count } = service.redactString(input);

      expect(result).toContain('[REDACTED:ANTHROPIC_KEY]');
      expect(count).toBe(1);
    });

    it('should redact GitHub PATs', () => {
      const input = 'Token: ghp_abcdefghijklmnopqrstuvwxyz1234567890';
      const { result, count } = service.redactString(input);

      expect(result).toContain('[REDACTED:GITHUB_PAT]');
      expect(count).toBe(1);
    });

    it('should redact multiple keys in one string', () => {
      const input = 'Keys: sk-key123456789012345678901234567890abc and ghp_abcdefghijklmnopqrstuvwxyz1234567890';
      const { count } = service.redactString(input);

      expect(count).toBe(2);
    });
  });

  describe('Bearer Token Redaction', () => {
    it('should redact Bearer tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.xyz';
      const { result, count } = service.redactString(input);

      expect(result).toContain('[REDACTED:BEARER_TOKEN]');
      expect(count).toBe(1);
    });
  });

  describe('Object Redaction', () => {
    it('should redact secrets in nested objects', () => {
      const input = {
        config: {
          api_key: 'sk-abcdefghijklmnopqrstuvwxyz1234567890',
          nested: {
            token: 'Bearer abc123.def456.ghi789'
          }
        }
      };

      const result = service.redact(input);

      expect(result.redactionCount).toBe(2);
      expect(JSON.stringify(result.data)).toContain('[REDACTED');
    });

    it('should redact secrets in arrays', () => {
      const input = {
        keys: [
          'sk-abcdefghijklmnopqrstuvwxyz1234567890',
          'sk-zyxwvutsrqponmlkjihgfedcba0987654321'
        ]
      };

      const result = service.redact(input);

      expect(result.redactionCount).toBe(2);
    });

    it('should track redaction paths', () => {
      const input = {
        config: {
          api_key: 'sk-abcdefghijklmnopqrstuvwxyz1234567890'
        }
      };

      const result = service.redact(input);

      expect(result.redactionPaths.length).toBeGreaterThan(0);
    });
  });

  describe('PII Redaction', () => {
    it('should not redact PII by default', () => {
      const input = 'Email: test@example.com';
      const { result, count } = service.redactString(input);

      expect(result).toBe(input);
      expect(count).toBe(0);
    });

    it('should support custom patterns for PII', () => {
      // PII rules are disabled by default in the rule definitions
      // Users can add custom patterns for their specific PII needs
      const piiService = new RedactionService({
        customPatterns: ['([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})'],
      });
      const input = 'Email: test@example.com';
      const { result, count } = piiService.redactString(input);

      expect(result).toContain('[REDACTED:CUSTOM]');
      expect(count).toBe(1);
    });
  });

  describe('containsSecrets', () => {
    it('should detect secrets in data', () => {
      const data = { key: 'sk-abcdefghijklmnopqrstuvwxyz1234567890' };
      expect(service.containsSecrets(data)).toBe(true);
    });

    it('should return false for clean data', () => {
      const data = { message: 'Hello, World!' };
      expect(service.containsSecrets(data)).toBe(false);
    });
  });
});

// =============================================================================
// ForensicCollector
// =============================================================================

describe('ForensicCollector', () => {
  it('should create a collector with config', () => {
    const collector = createForensicCollector({
      tenantId: 'tenant-test',
      runId: 'run-test',
    });

    expect(collector).toBeDefined();
    expect(collector.getStatus()).toBe('running');
  });

  it('should track events', () => {
    const collector = createForensicCollector({
      tenantId: 'tenant-test',
      runId: 'run-test',
    });

    collector.start({ intent: 'Test' });
    collector.llmRequest('anthropic', 'claude-3', 'test prompt');
    collector.llmResponse('anthropic', 'claude-3', 'test response', {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    }, 100);
    collector.complete({ success: true });

    expect(collector.getEventCount()).toBe(4);
  });

  it('should build a valid bundle', () => {
    const collector = createForensicCollector({
      tenantId: 'tenant-test',
      runId: 'run-test',
      computeChecksum: true,
    });

    collector.start({ intent: 'Test' });
    collector.complete({ success: true });

    const bundle = collector.build();

    expect(bundle.version).toBe(1);
    expect(bundle.run_id).toBe('run-test');
    expect(bundle.tenant_id).toBe('tenant-test');
    expect(bundle.run_status).toBe('completed');
    expect(bundle.checksum).toBeDefined();

    // Validate the bundle
    const validation = validateForensicBundle(bundle);
    expect(validation.valid).toBe(true);
  });

  it('should apply redaction when building bundle', () => {
    const collector = createForensicCollector({
      tenantId: 'tenant-test',
      runId: 'run-test',
    });

    collector.start({
      api_key: 'sk-abcdefghijklmnopqrstuvwxyz1234567890'
    });
    collector.complete({ success: true });

    const bundle = collector.build();

    expect(bundle.redaction.applied).toBe(true);
    expect(bundle.redaction.redaction_count).toBeGreaterThan(0);
    expect(JSON.stringify(bundle.input)).toContain('[REDACTED');
  });
});

// =============================================================================
// Replay Engine
// =============================================================================

describe('ReplayEngine', () => {
  describe('Validation', () => {
    it('should validate bundle can be replayed', () => {
      const bundle = loadFixture('valid-bundle.json') as ForensicBundle;
      const engine = new ReplayEngine();

      const validation = engine.validateForReplay(bundle);

      expect(validation.valid).toBe(true);
      expect(validation.issues.length).toBe(0);
    });

    it('should report issues for bundle without LLM responses in deterministic mode', () => {
      const bundle = loadFixture('valid-bundle.json') as ForensicBundle;
      // Remove LLM response events
      bundle.events = bundle.events.filter(e => e.type !== 'llm.response');

      const engine = new ReplayEngine({ mode: 'deterministic' });
      const validation = engine.validateForReplay(bundle);

      expect(validation.valid).toBe(false);
      expect(validation.issues.some(i => i.includes('LLM responses'))).toBe(true);
    });
  });

  describe('Replay Execution', () => {
    it('should replay a valid bundle', async () => {
      const bundle = loadFixture('valid-bundle.json') as ForensicBundle;
      const engine = new ReplayEngine();

      const result = await engine.replay(bundle);

      expect(result.status).toBe('replay_succeeded');
      expect(result.eventsReplayed).toBeGreaterThan(0);
      expect(result.originalBundleId).toBe(bundle.bundle_id);
    });

    it('should count mocked LLM calls', async () => {
      const bundle = loadFixture('valid-bundle.json') as ForensicBundle;
      const engine = new ReplayEngine();

      const result = await engine.replay(bundle);

      expect(result.llmCallsMocked).toBe(1);
    });

    it('should respect max events limit', async () => {
      const bundle = loadFixture('valid-bundle.json') as ForensicBundle;
      const engine = new ReplayEngine({ maxEvents: 2 });

      const result = await engine.replay(bundle);

      expect(result.eventsReplayed).toBeLessThanOrEqual(2);
      expect(result.warnings.some(w => w.includes('max events'))).toBe(true);
    });
  });
});

// =============================================================================
// Diff Engine
// =============================================================================

describe('Diff Engine', () => {
  describe('diffValues', () => {
    it('should detect no differences for identical values', () => {
      const original = { a: 1, b: 'test' };
      const replayed = { a: 1, b: 'test' };

      const diffs = diffValues(original, replayed);

      expect(diffs.length).toBe(0);
    });

    it('should detect value mismatches', () => {
      const original = { a: 1 };
      const replayed = { a: 2 };

      const diffs = diffValues(original, replayed);

      expect(diffs.length).toBe(1);
      expect(diffs[0].type).toBe('value_mismatch');
      expect(diffs[0].path).toBe('a');
    });

    it('should detect missing keys', () => {
      const original = { a: 1, b: 2 };
      const replayed = { a: 1 };

      const diffs = diffValues(original, replayed);

      expect(diffs.some(d => d.type === 'missing_key' && d.path === 'b')).toBe(true);
    });

    it('should detect extra keys', () => {
      const original = { a: 1 };
      const replayed = { a: 1, b: 2 };

      const diffs = diffValues(original, replayed);

      expect(diffs.some(d => d.type === 'extra_key' && d.path === 'b')).toBe(true);
    });

    it('should detect type mismatches', () => {
      const original = { a: '1' };
      const replayed = { a: 1 };

      const diffs = diffValues(original, replayed);

      expect(diffs.some(d => d.type === 'type_mismatch')).toBe(true);
    });

    it('should detect array length differences', () => {
      const original = { items: [1, 2, 3] };
      const replayed = { items: [1, 2] };

      const diffs = diffValues(original, replayed);

      expect(diffs.some(d => d.type === 'array_length')).toBe(true);
    });

    it('should handle nested objects', () => {
      const original = { outer: { inner: { value: 1 } } };
      const replayed = { outer: { inner: { value: 2 } } };

      const diffs = diffValues(original, replayed);

      expect(diffs[0].path).toBe('outer.inner.value');
    });
  });

  describe('createComparisonResult', () => {
    it('should mark as match when no differences', () => {
      const result = createComparisonResult([]);

      expect(result.match).toBe(true);
      expect(result.summary).toBe('Outputs match');
    });

    it('should mark as no match when errors exist', () => {
      const diffs = [
        { path: 'a', type: 'value_mismatch' as const, original: 1, replayed: 2, description: 'mismatch', severity: 'error' as const }
      ];

      const result = createComparisonResult(diffs);

      expect(result.match).toBe(false);
      expect(result.bySeverity.error).toBe(1);
    });

    it('should count by severity', () => {
      const diffs = [
        { path: 'a', type: 'value_mismatch' as const, original: 1, replayed: 2, description: 'mismatch', severity: 'error' as const },
        { path: 'b', type: 'missing_key' as const, original: 1, replayed: undefined, description: 'missing', severity: 'warning' as const },
        { path: 'c', type: 'extra_key' as const, original: undefined, replayed: 1, description: 'extra', severity: 'info' as const },
      ];

      const result = createComparisonResult(diffs);

      expect(result.bySeverity.error).toBe(1);
      expect(result.bySeverity.warning).toBe(1);
      expect(result.bySeverity.info).toBe(1);
    });
  });
});
