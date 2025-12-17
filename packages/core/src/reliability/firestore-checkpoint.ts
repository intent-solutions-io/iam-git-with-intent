/**
 * Firestore Checkpoint Store
 *
 * Phase 16: Production-ready checkpoint storage for run resume/replay.
 *
 * Features:
 * - Durable checkpoint persistence
 * - Tenant-scoped queries
 * - Artifact serialization with size limits
 * - Checkpoint history for debugging
 *
 * @module @gwi/core/reliability/firestore-checkpoint
 */

import { getFirestoreClient } from '../storage/firestore-client.js';
import { Timestamp } from 'firebase-admin/firestore';
import type { RunCheckpoint } from './resume.js';
import type { SaaSRun } from '../storage/interfaces.js';

// =============================================================================
// Firestore Checkpoint Document Schema
// =============================================================================

interface FirestoreCheckpointDoc {
  runId: string;
  tenantId: string;
  currentStepIndex: number;
  currentStepName: string;
  status: string;
  completedSteps: string[];
  failedStepId?: string;
  artifacts: string; // JSON serialized, max 1MB
  checkpointedAt: Timestamp;
  reason?: string;
  version: number; // For optimistic concurrency
}

// =============================================================================
// Constants
// =============================================================================

const MAX_ARTIFACT_SIZE = 1024 * 1024; // 1MB limit for artifacts

// =============================================================================
// Firestore Checkpoint Manager
// =============================================================================

/**
 * Firestore-backed checkpoint manager for durable resume/replay
 */
export class FirestoreCheckpointManager {
  private collectionName = 'gwi_checkpoints';

  /**
   * Create or update a checkpoint from a run's current state
   */
  async createCheckpoint(
    run: SaaSRun,
    artifacts: Record<string, unknown>,
    reason?: RunCheckpoint['reason']
  ): Promise<RunCheckpoint> {
    const db = getFirestoreClient();
    const docRef = db.collection(this.collectionName).doc(run.id);

    const completedSteps = run.steps
      .filter((s) => s.status === 'completed')
      .map((s) => s.id);

    const failedStep = run.steps.find((s) => s.status === 'failed');

    // Serialize artifacts with size check
    const serializedArtifacts = this.serializeArtifacts(artifacts);

    const checkpoint: RunCheckpoint = {
      runId: run.id,
      tenantId: run.tenantId,
      currentStepIndex: completedSteps.length,
      currentStepName: run.currentStep ?? 'unknown',
      status: run.status,
      completedSteps,
      failedStepId: failedStep?.id,
      artifacts,
      checkpointedAt: new Date(),
      reason,
    };

    // Use transaction for optimistic concurrency
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      const currentVersion = doc.exists ? (doc.data() as FirestoreCheckpointDoc).version : 0;

      const data: FirestoreCheckpointDoc = {
        runId: run.id,
        tenantId: run.tenantId,
        currentStepIndex: completedSteps.length,
        currentStepName: run.currentStep ?? 'unknown',
        status: run.status,
        completedSteps,
        failedStepId: failedStep?.id,
        artifacts: serializedArtifacts,
        checkpointedAt: Timestamp.now(),
        reason,
        version: currentVersion + 1,
      };

      transaction.set(docRef, data);
    });

    return checkpoint;
  }

  /**
   * Get the latest checkpoint for a run
   */
  async getCheckpoint(runId: string): Promise<RunCheckpoint | null> {
    const db = getFirestoreClient();
    const docRef = db.collection(this.collectionName).doc(runId);

    const doc = await docRef.get();
    if (!doc.exists) {
      return null;
    }

    return this.toCheckpoint(doc.data() as FirestoreCheckpointDoc);
  }

  /**
   * Delete a checkpoint
   */
  async deleteCheckpoint(runId: string): Promise<boolean> {
    const db = getFirestoreClient();
    const docRef = db.collection(this.collectionName).doc(runId);

    try {
      const doc = await docRef.get();
      if (!doc.exists) {
        return false;
      }

      await docRef.delete();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all checkpoints for a tenant
   */
  async listCheckpoints(tenantId?: string): Promise<RunCheckpoint[]> {
    const db = getFirestoreClient();

    let query = db.collection(this.collectionName).orderBy('checkpointedAt', 'desc');

    if (tenantId) {
      query = db
        .collection(this.collectionName)
        .where('tenantId', '==', tenantId)
        .orderBy('checkpointedAt', 'desc');
    }

    const snapshot = await query.limit(100).get();

    return snapshot.docs.map((doc) => this.toCheckpoint(doc.data() as FirestoreCheckpointDoc));
  }

  /**
   * List checkpoints by status
   */
  async listByStatus(status: string, tenantId?: string): Promise<RunCheckpoint[]> {
    const db = getFirestoreClient();

    let query = db
      .collection(this.collectionName)
      .where('status', '==', status)
      .orderBy('checkpointedAt', 'desc');

    if (tenantId) {
      query = db
        .collection(this.collectionName)
        .where('tenantId', '==', tenantId)
        .where('status', '==', status)
        .orderBy('checkpointedAt', 'desc');
    }

    const snapshot = await query.limit(100).get();

    return snapshot.docs.map((doc) => this.toCheckpoint(doc.data() as FirestoreCheckpointDoc));
  }

  /**
   * Clean up old checkpoints (for completed/cancelled runs)
   */
  async cleanupOldCheckpoints(olderThanDays: number = 7): Promise<number> {
    const db = getFirestoreClient();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    // Query for old checkpoints with terminal status
    const snapshot = await db
      .collection(this.collectionName)
      .where('status', 'in', ['completed', 'cancelled'])
      .where('checkpointedAt', '<', Timestamp.fromDate(cutoff))
      .limit(100)
      .get();

    if (snapshot.empty) {
      return 0;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    return snapshot.size;
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  /**
   * Serialize artifacts with size limit
   */
  private serializeArtifacts(artifacts: Record<string, unknown>): string {
    const serialized = JSON.stringify(artifacts);

    if (serialized.length > MAX_ARTIFACT_SIZE) {
      // Truncate large artifacts
      const truncated: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(artifacts)) {
        const itemSerialized = JSON.stringify(value);
        if (itemSerialized.length < 100 * 1024) {
          // Keep items under 100KB
          truncated[key] = value;
        } else {
          // Store a truncation marker
          truncated[key] = {
            _truncated: true,
            _originalSize: itemSerialized.length,
            _type: typeof value,
          };
        }
      }
      return JSON.stringify(truncated);
    }

    return serialized;
  }

  /**
   * Convert Firestore document to RunCheckpoint
   */
  private toCheckpoint(data: FirestoreCheckpointDoc): RunCheckpoint {
    let artifacts: Record<string, unknown> = {};
    try {
      artifacts = JSON.parse(data.artifacts);
    } catch {
      // Failed to parse artifacts - use empty
    }

    return {
      runId: data.runId,
      tenantId: data.tenantId,
      currentStepIndex: data.currentStepIndex,
      currentStepName: data.currentStepName,
      status: data.status as RunCheckpoint['status'],
      completedSteps: data.completedSteps,
      failedStepId: data.failedStepId,
      artifacts,
      checkpointedAt: data.checkpointedAt.toDate(),
      reason: data.reason as RunCheckpoint['reason'],
    };
  }
}

// =============================================================================
// Global Singleton
// =============================================================================

let firestoreCheckpointManager: FirestoreCheckpointManager | null = null;

/**
 * Get the Firestore checkpoint manager singleton
 */
export function getFirestoreCheckpointManager(): FirestoreCheckpointManager {
  if (!firestoreCheckpointManager) {
    firestoreCheckpointManager = new FirestoreCheckpointManager();
  }
  return firestoreCheckpointManager;
}

/**
 * Reset the checkpoint manager (for testing)
 */
export function resetFirestoreCheckpointManager(): void {
  firestoreCheckpointManager = null;
}

// =============================================================================
// Collection Constant for Indices
// =============================================================================

/**
 * Add to COLLECTIONS constant (for documentation)
 * Collection: gwi_checkpoints
 * Fields: runId, tenantId, currentStepIndex, currentStepName, status, completedSteps,
 *         failedStepId, artifacts, checkpointedAt, reason, version
 * Indices:
 *   - tenantId ASC, checkpointedAt DESC (for listCheckpoints by tenant)
 *   - status ASC, checkpointedAt ASC (for cleanup)
 *   - tenantId ASC, status ASC, checkpointedAt DESC (for listByStatus)
 */
