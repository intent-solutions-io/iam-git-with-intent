/**
 * Recovery Orchestrator Tests
 *
 * B3: Cloud Run Reliability - Recovery/Resume on Restart
 *
 * Tests cover:
 * - Recovery of orphaned runs on engine startup
 * - Resume decision logic (resume vs fail)
 * - Checkpoint-based resume capability
 * - Integration with HeartbeatService
 * - Metrics and observability
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RecoveryOrchestrator } from '../recovery.js';
import { InMemoryCheckpointStore } from '../checkpoint.js';
import { InMemoryTenantStore } from '@gwi/core';
import type { StepCheckpoint } from '@gwi/core';

describe('RecoveryOrchestrator', () => {
  let store: InMemoryTenantStore;
  let checkpointStore: InMemoryCheckpointStore;
  let orchestrator: RecoveryOrchestrator;

  beforeEach(() => {
    store = new InMemoryTenantStore();
    checkpointStore = new InMemoryCheckpointStore();
    orchestrator = new RecoveryOrchestrator({
      store,
      checkpointStore,
      ownerId: 'test-recovery-instance',
    });
  });

  afterEach(() => {
    orchestrator.shutdown();
  });

  describe('initialization', () => {
    it('should create orchestrator with custom owner ID', () => {
      expect(orchestrator.getOwnerId()).toBe('test-recovery-instance');
    });

    it('should create heartbeat service', () => {
      const heartbeatService = orchestrator.getHeartbeatService();
      expect(heartbeatService).toBeDefined();
      expect(heartbeatService.getOwnerId()).toBe('test-recovery-instance');
    });
  });

  describe('recoverOrphanedRuns', () => {
    it('should return empty result when no orphans exist', async () => {
      const result = await orchestrator.recoverOrphanedRuns();

      expect(result.orphanedCount).toBe(0);
      expect(result.resumedCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.runs).toHaveLength(0);
    });

    it('should find and fail orphaned runs without checkpoints', async () => {
      // Create an orphaned run (stale heartbeat, no checkpoint)
      const oldDate = new Date(Date.now() - 600_000); // 10 minutes ago
      await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [],
        trigger: { source: 'cli' },
        lastHeartbeatAt: oldDate,
        ownerId: 'dead-instance',
      });

      const result = await orchestrator.recoverOrphanedRuns({
        staleThresholdMs: 300_000, // 5 minutes
      });

      expect(result.orphanedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.resumedCount).toBe(0);
      expect(result.runs[0].decision).toBe('fail');
      expect(result.runs[0].reason).toContain('No checkpoints');
    });

    it('should resume orphaned runs with valid checkpoints', async () => {
      // Create an orphaned run
      const oldDate = new Date(Date.now() - 600_000);
      const run = await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [
          {
            id: 'step-1',
            runId: 'will-be-replaced',
            agent: 'triage',
            status: 'completed',
            startedAt: new Date(Date.now() - 700_000),
            completedAt: new Date(Date.now() - 650_000),
            durationMs: 50_000,
          },
        ],
        trigger: { source: 'cli' },
        lastHeartbeatAt: oldDate,
        ownerId: 'dead-instance',
      });

      // Add a checkpoint for the run
      const checkpoint: StepCheckpoint = {
        stepId: 'step-1',
        agent: 'triage',
        status: 'completed',
        timestamp: new Date(Date.now() - 650_000),
        resumable: true,
        idempotent: false,
        output: { triageResult: 'high-priority' },
      };
      await checkpointStore.saveCheckpoint(run.id, checkpoint);

      const result = await orchestrator.recoverOrphanedRuns({
        staleThresholdMs: 300_000,
      });

      expect(result.orphanedCount).toBe(1);
      expect(result.resumedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.runs[0].decision).toBe('resume');
      expect(result.runs[0].success).toBe(true);

      // Verify run was updated
      const updatedRun = await store.getRun('tenant-1', run.id);
      expect(updatedRun?.status).toBe('running');
      expect(updatedRun?.ownerId).toBe('test-recovery-instance');
      expect(updatedRun?.resumeCount).toBe(1);
    });

    it('should handle multiple orphaned runs', async () => {
      const oldDate = new Date(Date.now() - 600_000);

      // Create 3 orphaned runs
      const run1 = await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [{ id: 'step-1', runId: '', agent: 'triage', status: 'completed', startedAt: new Date(), completedAt: new Date(), durationMs: 100 }],
        trigger: { source: 'cli' },
        lastHeartbeatAt: oldDate,
        ownerId: 'dead-instance-1',
      });

      await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-2',
        prId: 'pr-2',
        prUrl: 'https://github.com/test/repo/pull/2',
        type: 'review',
        status: 'running',
        steps: [],
        trigger: { source: 'cli' },
        lastHeartbeatAt: oldDate,
        ownerId: 'dead-instance-2',
      });

      const run3 = await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-3',
        prId: 'pr-3',
        prUrl: 'https://github.com/test/repo/pull/3',
        type: 'review',
        status: 'running',
        steps: [{ id: 'step-1', runId: '', agent: 'triage', status: 'completed', startedAt: new Date(), completedAt: new Date(), durationMs: 100 }],
        trigger: { source: 'cli' },
        lastHeartbeatAt: oldDate,
        ownerId: 'dead-instance-3',
      });

      // Add checkpoints for run1 and run3 (run2 has no checkpoint)
      await checkpointStore.saveCheckpoint(run1.id, {
        stepId: 'step-1',
        agent: 'triage',
        status: 'completed',
        timestamp: new Date(),
        resumable: true,
        idempotent: false,
      });

      await checkpointStore.saveCheckpoint(run3.id, {
        stepId: 'step-1',
        agent: 'triage',
        status: 'completed',
        timestamp: new Date(),
        resumable: true,
        idempotent: false,
      });

      const result = await orchestrator.recoverOrphanedRuns({
        staleThresholdMs: 300_000,
      });

      expect(result.orphanedCount).toBe(3);
      expect(result.resumedCount).toBe(2); // run1 and run3
      expect(result.failedCount).toBe(1); // run2
    });

    it('should respect maxRuns limit', async () => {
      const oldDate = new Date(Date.now() - 600_000);

      // Create 5 orphaned runs
      for (let i = 0; i < 5; i++) {
        await store.createRun('tenant-1', {
          tenantId: 'tenant-1',
          repoId: `repo-${i}`,
          prId: `pr-${i}`,
          prUrl: `https://github.com/test/repo/pull/${i}`,
          type: 'review',
          status: 'running',
          steps: [],
          trigger: { source: 'cli' },
          lastHeartbeatAt: oldDate,
          ownerId: `dead-instance-${i}`,
        });
      }

      const result = await orchestrator.recoverOrphanedRuns({
        staleThresholdMs: 300_000,
        maxRuns: 3,
      });

      expect(result.orphanedCount).toBe(5);
      expect(result.runs).toHaveLength(3); // Only processed 3
      expect(result.failedCount).toBe(3);
    });

    it('should support dry run mode (executeResume=false)', async () => {
      const oldDate = new Date(Date.now() - 600_000);
      const run = await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [],
        trigger: { source: 'cli' },
        lastHeartbeatAt: oldDate,
        ownerId: 'dead-instance',
      });

      const result = await orchestrator.recoverOrphanedRuns({
        staleThresholdMs: 300_000,
        executeResume: false, // Dry run
      });

      expect(result.orphanedCount).toBe(1);
      expect(result.failedCount).toBe(1);

      // Verify run was NOT updated (dry run)
      const unchangedRun = await store.getRun('tenant-1', run.id);
      expect(unchangedRun?.status).toBe('running'); // Still running
      expect(unchangedRun?.ownerId).toBe('dead-instance'); // Still old owner
    });

    it('should track recovery duration', async () => {
      const result = await orchestrator.recoverOrphanedRuns();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.ownerId).toBe('test-recovery-instance');
    });
  });

  describe('resume decision logic', () => {
    it('should fail run if all checkpoints are failed', async () => {
      const oldDate = new Date(Date.now() - 600_000);
      const run = await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [{ id: 'step-1', runId: '', agent: 'triage', status: 'failed', startedAt: new Date(), durationMs: 100 }],
        trigger: { source: 'cli' },
        lastHeartbeatAt: oldDate,
        ownerId: 'dead-instance',
      });

      // Add a failed checkpoint
      await checkpointStore.saveCheckpoint(run.id, {
        stepId: 'step-1',
        agent: 'triage',
        status: 'failed',
        timestamp: new Date(),
        resumable: true,
        idempotent: false,
        error: 'API timeout',
      });

      const result = await orchestrator.recoverOrphanedRuns({
        staleThresholdMs: 300_000,
      });

      expect(result.orphanedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.resumedCount).toBe(0);
      expect(result.runs[0].decision).toBe('fail');
      expect(result.runs[0].reason).toContain('No resumable checkpoint');
    });

    it('should fail run if checkpoint is not resumable', async () => {
      const oldDate = new Date(Date.now() - 600_000);
      const run = await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [{ id: 'step-1', runId: '', agent: 'triage', status: 'completed', startedAt: new Date(), completedAt: new Date(), durationMs: 100 }],
        trigger: { source: 'cli' },
        lastHeartbeatAt: oldDate,
        ownerId: 'dead-instance',
      });

      // Add a non-resumable checkpoint
      await checkpointStore.saveCheckpoint(run.id, {
        stepId: 'step-1',
        agent: 'triage',
        status: 'completed',
        timestamp: new Date(),
        resumable: false, // Not resumable
        idempotent: false,
      });

      const result = await orchestrator.recoverOrphanedRuns({
        staleThresholdMs: 300_000,
      });

      expect(result.runs[0].decision).toBe('fail');
      expect(result.runs[0].reason).toContain('No resumable checkpoint');
    });

    it('should resume from last successful checkpoint when later steps failed', async () => {
      const oldDate = new Date(Date.now() - 600_000);
      const run = await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'resolve',
        status: 'running',
        steps: [
          { id: 'step-1', runId: '', agent: 'triage', status: 'completed', startedAt: new Date(), completedAt: new Date(), durationMs: 100 },
          { id: 'step-2', runId: '', agent: 'planner', status: 'completed', startedAt: new Date(), completedAt: new Date(), durationMs: 200 },
          { id: 'step-3', runId: '', agent: 'coder', status: 'failed', startedAt: new Date(), durationMs: 300 },
        ],
        trigger: { source: 'cli' },
        lastHeartbeatAt: oldDate,
        ownerId: 'dead-instance',
      });

      // Add checkpoints
      await checkpointStore.saveCheckpoint(run.id, {
        stepId: 'step-1',
        agent: 'triage',
        status: 'completed',
        timestamp: new Date(Date.now() - 3000),
        resumable: true,
        idempotent: false,
        output: { triageResult: 'high' },
      });

      await checkpointStore.saveCheckpoint(run.id, {
        stepId: 'step-2',
        agent: 'planner',
        status: 'completed',
        timestamp: new Date(Date.now() - 2000),
        resumable: true,
        idempotent: false,
        output: { plan: 'test-plan' },
      });

      await checkpointStore.saveCheckpoint(run.id, {
        stepId: 'step-3',
        agent: 'coder',
        status: 'failed',
        timestamp: new Date(Date.now() - 1000),
        resumable: true,
        idempotent: false,
        error: 'API timeout',
      });

      const result = await orchestrator.recoverOrphanedRuns({
        staleThresholdMs: 300_000,
      });

      expect(result.orphanedCount).toBe(1);
      expect(result.resumedCount).toBe(1);
      expect(result.runs[0].decision).toBe('resume');
      expect(result.runs[0].reason).toContain('planner'); // Resume from step-2
    });
  });

  describe('heartbeat integration', () => {
    it('should start heartbeat for resumed runs', async () => {
      const oldDate = new Date(Date.now() - 600_000);
      const run = await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [{ id: 'step-1', runId: '', agent: 'triage', status: 'completed', startedAt: new Date(), completedAt: new Date(), durationMs: 100 }],
        trigger: { source: 'cli' },
        lastHeartbeatAt: oldDate,
        ownerId: 'dead-instance',
      });

      // Add checkpoint
      await checkpointStore.saveCheckpoint(run.id, {
        stepId: 'step-1',
        agent: 'triage',
        status: 'completed',
        timestamp: new Date(),
        resumable: true,
        idempotent: false,
      });

      await orchestrator.recoverOrphanedRuns({ staleThresholdMs: 300_000 });

      // Verify heartbeat service is tracking the resumed run
      const heartbeatService = orchestrator.getHeartbeatService();
      expect(heartbeatService.getActiveRunCount()).toBe(1);
      expect(heartbeatService.getActiveRunIds()).toContain(run.id);
    });

    it('should not track failed runs in heartbeat', async () => {
      const oldDate = new Date(Date.now() - 600_000);
      await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [],
        trigger: { source: 'cli' },
        lastHeartbeatAt: oldDate,
        ownerId: 'dead-instance',
      });

      await orchestrator.recoverOrphanedRuns({ staleThresholdMs: 300_000 });

      // No checkpoints = run failed, not tracked
      const heartbeatService = orchestrator.getHeartbeatService();
      expect(heartbeatService.getActiveRunCount()).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should shutdown heartbeat service', async () => {
      const run = await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [{ id: 'step-1', runId: '', agent: 'triage', status: 'completed', startedAt: new Date(), completedAt: new Date(), durationMs: 100 }],
        trigger: { source: 'cli' },
        lastHeartbeatAt: new Date(Date.now() - 600_000),
        ownerId: 'dead-instance',
      });

      // Add checkpoint and recover
      await checkpointStore.saveCheckpoint(run.id, {
        stepId: 'step-1',
        agent: 'triage',
        status: 'completed',
        timestamp: new Date(),
        resumable: true,
        idempotent: false,
      });

      await orchestrator.recoverOrphanedRuns({ staleThresholdMs: 300_000 });

      const heartbeatService = orchestrator.getHeartbeatService();
      expect(heartbeatService.getActiveRunCount()).toBe(1);

      // Shutdown
      orchestrator.shutdown();

      // Heartbeat should stop tracking
      expect(heartbeatService.getActiveRunCount()).toBe(0);
    });
  });
});

describe('Integration: Cloud Run Restart Scenarios', () => {
  let store: InMemoryTenantStore;
  let checkpointStore: InMemoryCheckpointStore;

  beforeEach(() => {
    store = new InMemoryTenantStore();
    checkpointStore = new InMemoryCheckpointStore();
  });

  it('should handle complete restart scenario: instance crash and recovery', async () => {
    // === Phase 1: Simulate original instance running ===
    const originalOrchestrator = new RecoveryOrchestrator({
      store,
      checkpointStore,
      ownerId: 'original-instance',
    });

    // Start a run on original instance
    const run = await store.createRun('tenant-1', {
      tenantId: 'tenant-1',
      repoId: 'repo-1',
      prId: 'pr-1',
      prUrl: 'https://github.com/test/repo/pull/1',
      type: 'resolve',
      status: 'running',
      currentStep: 'planner',
      steps: [
        { id: 'step-1', runId: '', agent: 'triage', status: 'completed', startedAt: new Date(), completedAt: new Date(), durationMs: 100 },
        { id: 'step-2', runId: '', agent: 'planner', status: 'running', startedAt: new Date(), durationMs: 0 },
      ],
      trigger: { source: 'cli' },
      ownerId: 'original-instance',
      lastHeartbeatAt: new Date(Date.now() - 600_000), // Stale (crashed)
    });

    // Save checkpoint from completed step
    await checkpointStore.saveCheckpoint(run.id, {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(Date.now() - 650_000),
      resumable: true,
      idempotent: false,
      output: { complexity: 3, recommendation: 'auto-resolve' },
    });

    // Original instance crashes (shutdown without proper cleanup)
    // Note: In real scenario, heartbeat would stop updating

    // === Phase 2: New instance starts and recovers ===
    const newOrchestrator = new RecoveryOrchestrator({
      store,
      checkpointStore,
      ownerId: 'new-instance',
    });

    const recoveryResult = await newOrchestrator.recoverOrphanedRuns({
      staleThresholdMs: 300_000,
    });

    // Verify recovery
    expect(recoveryResult.orphanedCount).toBe(1);
    expect(recoveryResult.resumedCount).toBe(1);
    expect(recoveryResult.runs[0].runId).toBe(run.id);
    expect(recoveryResult.runs[0].decision).toBe('resume');

    // Verify run ownership transferred
    const resumedRun = await store.getRun('tenant-1', run.id);
    expect(resumedRun?.ownerId).toBe('new-instance');
    expect(resumedRun?.status).toBe('running');
    expect(resumedRun?.resumeCount).toBe(1);

    // Verify new instance is tracking heartbeat
    expect(newOrchestrator.getHeartbeatService().getActiveRunIds()).toContain(run.id);

    // Cleanup
    originalOrchestrator.shutdown();
    newOrchestrator.shutdown();
  });

  it('should handle multiple concurrent instances with no orphan overlap', async () => {
    // Create runs owned by different instances
    const instance1Run = await store.createRun('tenant-1', {
      tenantId: 'tenant-1',
      repoId: 'repo-1',
      prId: 'pr-1',
      prUrl: 'https://github.com/test/repo/pull/1',
      type: 'review',
      status: 'running',
      steps: [],
      trigger: { source: 'cli' },
      ownerId: 'instance-1',
      lastHeartbeatAt: new Date(), // Fresh - not orphaned
    });

    const instance2Run = await store.createRun('tenant-1', {
      tenantId: 'tenant-1',
      repoId: 'repo-2',
      prId: 'pr-2',
      prUrl: 'https://github.com/test/repo/pull/2',
      type: 'review',
      status: 'running',
      steps: [],
      trigger: { source: 'cli' },
      ownerId: 'instance-2',
      lastHeartbeatAt: new Date(), // Fresh - not orphaned
    });

    // New instance starts - should find no orphans
    const newOrchestrator = new RecoveryOrchestrator({
      store,
      checkpointStore,
      ownerId: 'instance-3',
    });

    const result = await newOrchestrator.recoverOrphanedRuns({
      staleThresholdMs: 300_000,
    });

    expect(result.orphanedCount).toBe(0);
    expect(result.resumedCount).toBe(0);
    expect(result.failedCount).toBe(0);

    // Verify original runs unchanged
    const run1 = await store.getRun('tenant-1', instance1Run.id);
    const run2 = await store.getRun('tenant-1', instance2Run.id);
    expect(run1?.ownerId).toBe('instance-1');
    expect(run2?.ownerId).toBe('instance-2');

    newOrchestrator.shutdown();
  });

  it('should handle graceful shutdown followed by restart', async () => {
    // === Phase 1: Original instance with active work ===
    const originalOrchestrator = new RecoveryOrchestrator({
      store,
      checkpointStore,
      ownerId: 'original-instance',
    });

    const run = await store.createRun('tenant-1', {
      tenantId: 'tenant-1',
      repoId: 'repo-1',
      prId: 'pr-1',
      prUrl: 'https://github.com/test/repo/pull/1',
      type: 'review',
      status: 'running',
      steps: [{ id: 'step-1', runId: '', agent: 'triage', status: 'completed', startedAt: new Date(), completedAt: new Date(), durationMs: 100 }],
      trigger: { source: 'cli' },
      ownerId: 'original-instance',
      lastHeartbeatAt: new Date(), // Fresh
    });

    // Start heartbeat
    originalOrchestrator.getHeartbeatService().startHeartbeat('tenant-1', run.id);

    // Simulate passing time (heartbeat becomes stale)
    await store.updateRun('tenant-1', run.id, {
      lastHeartbeatAt: new Date(Date.now() - 600_000),
    });

    // Graceful shutdown
    originalOrchestrator.shutdown();

    // === Phase 2: New instance starts ===
    const newOrchestrator = new RecoveryOrchestrator({
      store,
      checkpointStore,
      ownerId: 'new-instance',
    });

    // Add checkpoint before recovery (simulating checkpoint that was saved)
    await checkpointStore.saveCheckpoint(run.id, {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
    });

    const result = await newOrchestrator.recoverOrphanedRuns({
      staleThresholdMs: 300_000,
    });

    expect(result.orphanedCount).toBe(1);
    expect(result.resumedCount).toBe(1);

    newOrchestrator.shutdown();
  });
});
