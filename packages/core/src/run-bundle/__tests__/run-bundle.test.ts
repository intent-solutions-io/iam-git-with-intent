/**
 * Run Bundle Tests
 *
 * Tests for the run artifact bundle system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';

import {
  // Types
  RunState,
  STATE_TRANSITIONS,
  ARTIFACT_NAMES,

  // State Machine
  isValidTransition,
  validateTransition,
  isTerminalState,
  getHappyPath,
  calculateProgress,
  InvalidStateTransitionError,

  // Artifact Writer
  RUN_BUNDLES_BASE,
  getRunDir,
  ensureRunDir,
  runExists,
  writeArtifact,
  readArtifact,
  readJsonArtifact,
  artifactExists,
  listArtifacts,
  hashArtifact,
  hashString,
  deleteRunBundle,
  listRuns,

  // Audit Log
  appendAudit,
  readAuditLog,
  auditStateTransition,
  auditArtifactWritten,

  // Run Context
  createRun,
  loadRunContext,
  transitionState,
  failRun,
  abortRun,
} from '../index.js';

// =============================================================================
// Test Helpers
// =============================================================================

let testBaseDir: string;

beforeEach(async () => {
  // Create a unique temp directory for each test
  testBaseDir = join(tmpdir(), `gwi-test-${randomUUID()}`);
  await fs.mkdir(testBaseDir, { recursive: true });
});

afterEach(async () => {
  // Clean up temp directory
  await fs.rm(testBaseDir, { recursive: true, force: true });
});

// =============================================================================
// State Machine Tests
// =============================================================================

describe('State Machine', () => {
  describe('isValidTransition', () => {
    it('should allow valid transitions from queued', () => {
      expect(isValidTransition('queued', 'triaged')).toBe(true);
      expect(isValidTransition('queued', 'failed')).toBe(true);
      expect(isValidTransition('queued', 'aborted')).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(isValidTransition('queued', 'done')).toBe(false);
      expect(isValidTransition('queued', 'applying')).toBe(false);
      expect(isValidTransition('done', 'queued')).toBe(false);
    });

    it('should not allow transitions from terminal states', () => {
      expect(isValidTransition('done', 'queued')).toBe(false);
      expect(isValidTransition('failed', 'triaged')).toBe(false);
      expect(isValidTransition('aborted', 'review')).toBe(false);
    });
  });

  describe('validateTransition', () => {
    it('should not throw for valid transitions', () => {
      expect(() => validateTransition('queued', 'triaged', 'test-run')).not.toThrow();
      expect(() => validateTransition('triaged', 'planned', 'test-run')).not.toThrow();
    });

    it('should throw InvalidStateTransitionError for invalid transitions', () => {
      expect(() => validateTransition('queued', 'done', 'test-run'))
        .toThrow(InvalidStateTransitionError);
    });
  });

  describe('isTerminalState', () => {
    it('should identify terminal states', () => {
      expect(isTerminalState('done')).toBe(true);
      expect(isTerminalState('failed')).toBe(true);
      expect(isTerminalState('aborted')).toBe(true);
    });

    it('should identify non-terminal states', () => {
      expect(isTerminalState('queued')).toBe(false);
      expect(isTerminalState('review')).toBe(false);
      expect(isTerminalState('awaiting_approval')).toBe(false);
    });
  });

  describe('getHappyPath', () => {
    it('should return the full happy path from queued', () => {
      const path = getHappyPath('queued');
      expect(path).toContain('queued');
      expect(path).toContain('triaged');
      expect(path).toContain('done');
    });

    it('should return path from mid-workflow state', () => {
      const path = getHappyPath('review');
      expect(path[0]).toBe('review');
      expect(path).toContain('done');
    });
  });

  describe('calculateProgress', () => {
    it('should return 0 for queued', () => {
      expect(calculateProgress('queued')).toBe(0);
    });

    it('should return 100 for terminal states', () => {
      expect(calculateProgress('done')).toBe(100);
      expect(calculateProgress('failed')).toBe(100);
      expect(calculateProgress('aborted')).toBe(100);
    });

    it('should return intermediate values for non-terminal states', () => {
      const progress = calculateProgress('review');
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThan(100);
    });
  });

  describe('STATE_TRANSITIONS', () => {
    it('should have transitions defined for all states', () => {
      const states: RunState[] = [
        'queued', 'triaged', 'planned', 'resolving', 'review',
        'awaiting_approval', 'applying', 'done', 'aborted', 'failed'
      ];

      for (const state of states) {
        expect(STATE_TRANSITIONS[state]).toBeDefined();
        expect(Array.isArray(STATE_TRANSITIONS[state])).toBe(true);
      }
    });
  });
});

// =============================================================================
// Artifact Writer Tests
// =============================================================================

describe('Artifact Writer', () => {
  describe('ensureRunDir', () => {
    it('should create run directory', async () => {
      const runId = randomUUID();
      const runDir = await ensureRunDir(runId, testBaseDir);

      expect(runDir).toContain(runId);
      expect(await runExists(runId, testBaseDir)).toBe(true);
    });

    it('should be idempotent', async () => {
      const runId = randomUUID();
      await ensureRunDir(runId, testBaseDir);
      await ensureRunDir(runId, testBaseDir);

      expect(await runExists(runId, testBaseDir)).toBe(true);
    });
  });

  describe('writeArtifact / readArtifact', () => {
    it('should write and read string content', async () => {
      const runId = randomUUID();
      const content = 'Hello, World!';

      await writeArtifact(runId, 'test.txt', content, testBaseDir);
      const result = await readArtifact(runId, 'test.txt', testBaseDir);

      expect(result).toBe(content);
    });

    it('should write and read JSON content', async () => {
      const runId = randomUUID();
      const content = { foo: 'bar', num: 42, nested: { x: 1 } };

      await writeArtifact(runId, 'test.json', content, testBaseDir);
      const result = await readJsonArtifact(runId, 'test.json', testBaseDir);

      expect(result).toEqual(content);
    });

    it('should return null for non-existent artifacts', async () => {
      const runId = randomUUID();
      await ensureRunDir(runId, testBaseDir);

      const result = await readArtifact(runId, 'nonexistent.txt', testBaseDir);
      expect(result).toBeNull();
    });
  });

  describe('artifactExists', () => {
    it('should return true for existing artifacts', async () => {
      const runId = randomUUID();
      await writeArtifact(runId, 'test.txt', 'content', testBaseDir);

      expect(await artifactExists(runId, 'test.txt', testBaseDir)).toBe(true);
    });

    it('should return false for non-existing artifacts', async () => {
      const runId = randomUUID();
      await ensureRunDir(runId, testBaseDir);

      expect(await artifactExists(runId, 'test.txt', testBaseDir)).toBe(false);
    });
  });

  describe('listArtifacts', () => {
    it('should list all artifacts in a run', async () => {
      const runId = randomUUID();
      await writeArtifact(runId, 'a.txt', 'a', testBaseDir);
      await writeArtifact(runId, 'b.json', { b: 1 }, testBaseDir);
      await writeArtifact(runId, 'c.md', '# C', testBaseDir);

      const artifacts = await listArtifacts(runId, testBaseDir);

      expect(artifacts).toContain('a.txt');
      expect(artifacts).toContain('b.json');
      expect(artifacts).toContain('c.md');
    });

    it('should return empty array for non-existent run', async () => {
      const artifacts = await listArtifacts('nonexistent', testBaseDir);
      expect(artifacts).toEqual([]);
    });
  });

  describe('hashArtifact', () => {
    it('should compute consistent hash', async () => {
      const runId = randomUUID();
      const content = 'test content';
      await writeArtifact(runId, 'test.txt', content, testBaseDir);

      const hash1 = await hashArtifact(runId, 'test.txt', testBaseDir);
      const hash2 = await hashArtifact(runId, 'test.txt', testBaseDir);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('should return null for non-existent artifact', async () => {
      const runId = randomUUID();
      const hash = await hashArtifact(runId, 'nonexistent.txt', testBaseDir);
      expect(hash).toBeNull();
    });
  });

  describe('hashString', () => {
    it('should compute consistent hash', () => {
      const content = 'test content';
      const hash1 = hashString(content);
      const hash2 = hashString(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different content', () => {
      const hash1 = hashString('content 1');
      const hash2 = hashString('content 2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('deleteRunBundle', () => {
    it('should delete entire run directory', async () => {
      const runId = randomUUID();
      await writeArtifact(runId, 'test.txt', 'content', testBaseDir);
      await writeArtifact(runId, 'other.json', { x: 1 }, testBaseDir);

      expect(await runExists(runId, testBaseDir)).toBe(true);

      await deleteRunBundle(runId, testBaseDir);

      expect(await runExists(runId, testBaseDir)).toBe(false);
    });

    it('should not throw for non-existent run', async () => {
      await expect(deleteRunBundle('nonexistent', testBaseDir)).resolves.not.toThrow();
    });
  });

  describe('listRuns', () => {
    it('should list all run IDs', async () => {
      const runId1 = randomUUID();
      const runId2 = randomUUID();

      await ensureRunDir(runId1, testBaseDir);
      await ensureRunDir(runId2, testBaseDir);

      const runs = await listRuns(testBaseDir);

      expect(runs).toContain(runId1);
      expect(runs).toContain(runId2);
    });

    it('should return empty array if no runs', async () => {
      const runs = await listRuns(testBaseDir);
      expect(runs).toEqual([]);
    });
  });
});

// =============================================================================
// Audit Log Tests
// =============================================================================

describe('Audit Log', () => {
  describe('appendAudit / readAuditLog', () => {
    it('should append and read audit entries', async () => {
      const runId = randomUUID();
      await ensureRunDir(runId, testBaseDir);

      await appendAudit(runId, {
        actor: 'system',
        actorId: 'test',
        action: 'test_action',
        details: { foo: 'bar' },
      }, testBaseDir);

      const entries = await readAuditLog(runId, testBaseDir);

      expect(entries.length).toBe(1);
      expect(entries[0].action).toBe('test_action');
      expect(entries[0].actor).toBe('system');
      expect(entries[0].details).toEqual({ foo: 'bar' });
    });

    it('should append multiple entries', async () => {
      const runId = randomUUID();
      await ensureRunDir(runId, testBaseDir);

      await appendAudit(runId, { actor: 'system', action: 'first' }, testBaseDir);
      await appendAudit(runId, { actor: 'user', action: 'second' }, testBaseDir);
      await appendAudit(runId, { actor: 'agent', action: 'third' }, testBaseDir);

      const entries = await readAuditLog(runId, testBaseDir);

      expect(entries.length).toBe(3);
      expect(entries[0].action).toBe('first');
      expect(entries[1].action).toBe('second');
      expect(entries[2].action).toBe('third');
    });

    it('should include runId and timestamp', async () => {
      const runId = randomUUID();
      await ensureRunDir(runId, testBaseDir);

      await appendAudit(runId, { actor: 'system', action: 'test' }, testBaseDir);

      const entries = await readAuditLog(runId, testBaseDir);

      expect(entries[0].runId).toBe(runId);
      expect(entries[0].timestamp).toBeDefined();
      expect(new Date(entries[0].timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('convenience functions', () => {
    it('should log state transitions', async () => {
      const runId = randomUUID();
      await ensureRunDir(runId, testBaseDir);

      await auditStateTransition(runId, 'queued', 'triaged', testBaseDir);

      const entries = await readAuditLog(runId, testBaseDir);

      expect(entries[0].action).toBe('state_transition');
      expect(entries[0].details).toEqual({ fromState: 'queued', toState: 'triaged' });
    });

    it('should log artifact writes', async () => {
      const runId = randomUUID();
      await ensureRunDir(runId, testBaseDir);

      await auditArtifactWritten(runId, 'triage.json', 'triage-agent', testBaseDir);

      const entries = await readAuditLog(runId, testBaseDir);

      expect(entries[0].action).toBe('artifact_written');
      expect(entries[0].actorId).toBe('triage-agent');
      expect(entries[0].details).toEqual({ artifactName: 'triage.json' });
    });
  });
});

// =============================================================================
// Run Context Tests
// =============================================================================

describe('Run Context', () => {
  describe('createRun', () => {
    it('should create a new run with run.json', async () => {
      const context = await createRun({
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        initiator: 'test-user',
      }, testBaseDir);

      expect(context.runId).toBeDefined();
      expect(context.state).toBe('queued');
      expect(context.version).toBe(1);
      expect(context.capabilitiesMode).toBe('patch-only');

      // Verify file exists
      expect(await artifactExists(context.runId, ARTIFACT_NAMES.RUN_CONTEXT, testBaseDir)).toBe(true);
    });

    it('should create audit log entry', async () => {
      const context = await createRun({
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        initiator: 'test-user',
      }, testBaseDir);

      const entries = await readAuditLog(context.runId, testBaseDir);

      expect(entries.length).toBe(1);
      expect(entries[0].action).toBe('run_created');
      expect(entries[0].actorId).toBe('test-user');
    });

    it('should use provided options', async () => {
      const context = await createRun({
        repo: { owner: 'owner', name: 'name', fullName: 'owner/name' },
        initiator: 'user@example.com',
        capabilitiesMode: 'commit-after-approval',
        prUrl: 'https://github.com/owner/name/pull/123',
        baseRef: 'main',
        headRef: 'feature',
        models: { triage: 'custom-model' },
      }, testBaseDir);

      expect(context.capabilitiesMode).toBe('commit-after-approval');
      expect(context.prUrl).toBe('https://github.com/owner/name/pull/123');
      expect(context.baseRef).toBe('main');
      expect(context.headRef).toBe('feature');
      expect(context.models.triage).toBe('custom-model');
    });
  });

  describe('loadRunContext', () => {
    it('should load existing run context', async () => {
      const created = await createRun({
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        initiator: 'test-user',
      }, testBaseDir);

      const loaded = await loadRunContext(created.runId, testBaseDir);

      expect(loaded).not.toBeNull();
      expect(loaded!.runId).toBe(created.runId);
      expect(loaded!.state).toBe('queued');
    });

    it('should return null for non-existent run', async () => {
      const loaded = await loadRunContext('nonexistent', testBaseDir);
      expect(loaded).toBeNull();
    });
  });

  describe('transitionState', () => {
    it('should transition to valid states', async () => {
      const context = await createRun({
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        initiator: 'test-user',
      }, testBaseDir);

      const updated = await transitionState(context.runId, 'triaged', testBaseDir);

      expect(updated.state).toBe('triaged');
      expect(updated.previousStates).toHaveLength(1);
      expect(updated.previousStates[0].state).toBe('queued');
    });

    it('should throw for invalid transitions', async () => {
      const context = await createRun({
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        initiator: 'test-user',
      }, testBaseDir);

      await expect(transitionState(context.runId, 'done', testBaseDir))
        .rejects.toThrow(InvalidStateTransitionError);
    });

    it('should create audit entries for transitions', async () => {
      const context = await createRun({
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        initiator: 'test-user',
      }, testBaseDir);

      await transitionState(context.runId, 'triaged', testBaseDir);

      const entries = await readAuditLog(context.runId, testBaseDir);
      const transitionEntry = entries.find(e => e.action === 'state_transition');

      expect(transitionEntry).toBeDefined();
      expect(transitionEntry!.details).toEqual({ fromState: 'queued', toState: 'triaged' });
    });
  });

  describe('failRun', () => {
    it('should mark run as failed with error', async () => {
      const context = await createRun({
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        initiator: 'test-user',
      }, testBaseDir);

      const failed = await failRun(context.runId, 'Something went wrong', { code: 500 }, testBaseDir);

      expect(failed.state).toBe('failed');
      expect(failed.error).toBe('Something went wrong');
      expect(failed.errorDetails).toEqual({ code: 500 });
    });

    it('should not change already terminal states', async () => {
      const context = await createRun({
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        initiator: 'test-user',
      }, testBaseDir);

      await failRun(context.runId, 'First error', undefined, testBaseDir);
      const secondFail = await failRun(context.runId, 'Second error', undefined, testBaseDir);

      expect(secondFail.error).toBe('First error');
    });
  });

  describe('abortRun', () => {
    it('should mark run as aborted', async () => {
      const context = await createRun({
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        initiator: 'test-user',
      }, testBaseDir);

      const aborted = await abortRun(context.runId, 'User cancelled', testBaseDir);

      expect(aborted.state).toBe('aborted');
      expect(aborted.error).toBe('User cancelled');
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  it('should support full workflow lifecycle', async () => {
    // Create run
    const context = await createRun({
      repo: { owner: 'acme', name: 'project', fullName: 'acme/project' },
      initiator: 'developer@acme.com',
      prUrl: 'https://github.com/acme/project/pull/42',
      capabilitiesMode: 'commit-after-approval',
    }, testBaseDir);

    // Simulate triage
    await transitionState(context.runId, 'triaged', testBaseDir);
    await writeArtifact(context.runId, ARTIFACT_NAMES.TRIAGE, {
      complexity: 5,
      files: ['src/app.ts'],
    }, testBaseDir);
    await auditArtifactWritten(context.runId, 'triage.json', 'triage-agent', testBaseDir);

    // Simulate plan
    await transitionState(context.runId, 'planned', testBaseDir);
    await writeArtifact(context.runId, ARTIFACT_NAMES.PLAN_MD, '# Plan\n\n1. Fix auth\n2. Add tests', testBaseDir);

    // Simulate resolve
    await transitionState(context.runId, 'resolving', testBaseDir);
    await writeArtifact(context.runId, ARTIFACT_NAMES.PATCH, 'diff --git a/src/app.ts...', testBaseDir);

    // Simulate review
    await transitionState(context.runId, 'review', testBaseDir);
    await writeArtifact(context.runId, ARTIFACT_NAMES.REVIEW, {
      approved: true,
      issues: [],
    }, testBaseDir);

    // Await approval
    await transitionState(context.runId, 'awaiting_approval', testBaseDir);

    // Verify state
    const loaded = await loadRunContext(context.runId, testBaseDir);
    expect(loaded!.state).toBe('awaiting_approval');

    // Verify artifacts
    const artifacts = await listArtifacts(context.runId, testBaseDir);
    expect(artifacts).toContain('run.json');
    expect(artifacts).toContain('triage.json');
    expect(artifacts).toContain('plan.md');
    expect(artifacts).toContain('patch.diff');
    expect(artifacts).toContain('review.json');
    expect(artifacts).toContain('audit.log');

    // Verify audit log
    const auditEntries = await readAuditLog(context.runId, testBaseDir);
    expect(auditEntries.length).toBeGreaterThan(5);

    // Count state transitions
    const transitions = auditEntries.filter(e => e.action === 'state_transition');
    expect(transitions.length).toBe(5); // queued→triaged→planned→resolving→review→awaiting_approval
  });
});
