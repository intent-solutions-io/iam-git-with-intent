/**
 * Heartbeat Service
 *
 * B2: Cloud Run Reliability - Durable Orchestration State
 *
 * Provides heartbeat mechanism for long-running workflows:
 * - Updates lastHeartbeatAt periodically during execution
 * - Enables orphan detection for crashed instances
 * - Tracks instance ownership for recovery
 *
 * @module @gwi/engine/run/heartbeat
 */

import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { TenantStore, SaaSRun } from '@gwi/core';
import { getLogger } from '@gwi/core';

const logger = getLogger('heartbeat');

// =============================================================================
// Constants
// =============================================================================

/** Default heartbeat interval: 30 seconds */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

/** Default stale threshold: 5 minutes (10 missed heartbeats) */
const DEFAULT_STALE_THRESHOLD_MS = 300_000;

// =============================================================================
// Types
// =============================================================================

export interface HeartbeatConfig {
  /** How often to send heartbeats (default: 30s) */
  intervalMs?: number;
  /** Instance ID (auto-generated if not provided) */
  ownerId?: string;
  /** TenantStore for persistence */
  store: TenantStore;
}

interface ActiveRun {
  tenantId: string;
  runId: string;
  timer: NodeJS.Timeout;
  startedAt: Date;
}

// =============================================================================
// Heartbeat Service
// =============================================================================

/**
 * Heartbeat service for tracking active runs and detecting orphans.
 *
 * Usage:
 * ```typescript
 * const heartbeat = new HeartbeatService({ store });
 *
 * // On engine startup
 * await heartbeat.recoverOrphanedRuns();
 *
 * // When starting a run
 * heartbeat.startHeartbeat(tenantId, runId);
 *
 * // When run completes/fails
 * heartbeat.stopHeartbeat(runId);
 *
 * // On shutdown
 * heartbeat.shutdown();
 * ```
 */
export class HeartbeatService {
  private readonly ownerId: string;
  private readonly intervalMs: number;
  private readonly store: TenantStore;
  private readonly activeRuns: Map<string, ActiveRun> = new Map();
  private shutdownRequested = false;

  constructor(config: HeartbeatConfig) {
    this.store = config.store;
    this.intervalMs = config.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.ownerId = config.ownerId ?? generateOwnerId();

    logger.info('HeartbeatService initialized', {
      ownerId: this.ownerId,
      intervalMs: this.intervalMs,
    });
  }

  /**
   * Get the instance ID (ownerId) for this engine instance
   */
  getOwnerId(): string {
    return this.ownerId;
  }

  /**
   * Start heartbeat for a run.
   * Updates lastHeartbeatAt immediately, then periodically.
   */
  startHeartbeat(tenantId: string, runId: string): void {
    if (this.shutdownRequested) {
      logger.warn('Cannot start heartbeat - shutdown in progress', { runId });
      return;
    }

    // Check if already tracking
    if (this.activeRuns.has(runId)) {
      logger.debug('Heartbeat already active for run', { runId });
      return;
    }

    // Send initial heartbeat
    this.sendHeartbeat(tenantId, runId).catch(err => {
      logger.error('Failed to send initial heartbeat', {
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // Start periodic heartbeat
    const timer = setInterval(() => {
      if (this.shutdownRequested) {
        this.stopHeartbeat(runId);
        return;
      }

      this.sendHeartbeat(tenantId, runId).catch(err => {
        logger.error('Failed to send heartbeat', {
          runId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.intervalMs);

    // Prevent timer from keeping process alive
    timer.unref();

    this.activeRuns.set(runId, {
      tenantId,
      runId,
      timer,
      startedAt: new Date(),
    });

    logger.debug('Started heartbeat for run', {
      runId,
      tenantId,
      intervalMs: this.intervalMs,
    });
  }

  /**
   * Stop heartbeat for a run (when it completes, fails, or is cancelled).
   */
  stopHeartbeat(runId: string): void {
    const activeRun = this.activeRuns.get(runId);
    if (!activeRun) {
      return;
    }

    clearInterval(activeRun.timer);
    this.activeRuns.delete(runId);

    logger.debug('Stopped heartbeat for run', {
      runId,
      durationMs: Date.now() - activeRun.startedAt.getTime(),
    });
  }

  /**
   * Recover orphaned runs on startup.
   *
   * Finds runs that:
   * 1. Were owned by any instance (lastHeartbeatAt exists)
   * 2. Have stale heartbeat (> staleThresholdMs)
   * 3. Are in non-terminal status
   *
   * Then either:
   * - Fails them (default, safe)
   * - Or returns them for custom recovery
   */
  async recoverOrphanedRuns(options?: {
    staleThresholdMs?: number;
    failOrphans?: boolean;
  }): Promise<SaaSRun[]> {
    const staleThresholdMs = options?.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;
    const failOrphans = options?.failOrphans ?? true;

    logger.info('Checking for orphaned runs', {
      ownerId: this.ownerId,
      staleThresholdMs,
      failOrphans,
    });

    try {
      const orphanedRuns = await this.store.listOrphanedRuns(staleThresholdMs);

      if (orphanedRuns.length === 0) {
        logger.info('No orphaned runs found');
        return [];
      }

      logger.warn('Found orphaned runs', {
        count: orphanedRuns.length,
        runIds: orphanedRuns.map(r => r.id),
      });

      if (failOrphans) {
        // Fail each orphaned run
        for (const run of orphanedRuns) {
          try {
            await this.store.updateRun(run.tenantId, run.id, {
              status: 'failed',
              error: `Run orphaned: previous owner (${run.ownerId || 'unknown'}) stopped responding. ` +
                     `Last heartbeat: ${run.lastHeartbeatAt?.toISOString() || 'never'}. ` +
                     `Recovered by: ${this.ownerId}`,
              completedAt: new Date(),
            });

            logger.info('Failed orphaned run', {
              runId: run.id,
              tenantId: run.tenantId,
              previousOwner: run.ownerId,
            });
          } catch (err) {
            logger.error('Failed to update orphaned run', {
              runId: run.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      return orphanedRuns;
    } catch (err) {
      logger.error('Failed to list orphaned runs', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Recover runs that were owned by this instance (on restart).
   *
   * Useful for picking up where we left off after a process restart
   * (e.g., container restart within the same Cloud Run revision).
   */
  async recoverOwnedRuns(): Promise<SaaSRun[]> {
    logger.info('Checking for runs owned by this instance', {
      ownerId: this.ownerId,
    });

    try {
      const ownedRuns = await this.store.listInFlightRunsByOwner(this.ownerId);

      if (ownedRuns.length === 0) {
        logger.info('No runs owned by this instance');
        return [];
      }

      logger.info('Found runs owned by this instance', {
        count: ownedRuns.length,
        runIds: ownedRuns.map(r => r.id),
      });

      return ownedRuns;
    } catch (err) {
      logger.error('Failed to list owned runs', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Get count of active runs being tracked.
   */
  getActiveRunCount(): number {
    return this.activeRuns.size;
  }

  /**
   * Get list of active run IDs.
   */
  getActiveRunIds(): string[] {
    return Array.from(this.activeRuns.keys());
  }

  /**
   * Shutdown the heartbeat service.
   * Stops all active heartbeats.
   */
  shutdown(): void {
    this.shutdownRequested = true;

    logger.info('Shutting down HeartbeatService', {
      activeRuns: this.activeRuns.size,
    });

    for (const runId of this.activeRuns.keys()) {
      this.stopHeartbeat(runId);
    }
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Send a single heartbeat update.
   */
  private async sendHeartbeat(tenantId: string, runId: string): Promise<void> {
    await this.store.updateRunHeartbeat(tenantId, runId, this.ownerId);

    logger.debug('Heartbeat sent', {
      runId,
      ownerId: this.ownerId,
    });
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique owner ID for this instance.
 *
 * Format: `{hostname}-{timestamp}-{uuid}`
 * Example: `cloudrun-instance-1234567890-a1b2c3d4`
 */
function generateOwnerId(): string {
  const host = safeHostname();
  const timestamp = Date.now().toString(36);
  const uuid = randomUUID().slice(0, 8);
  return `${host}-${timestamp}-${uuid}`;
}

/**
 * Get hostname safely (falls back if unavailable).
 */
function safeHostname(): string {
  try {
    const h = hostname();
    // Truncate and sanitize for ID use
    return h.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 20);
  } catch {
    return 'unknown';
  }
}

// =============================================================================
// Singleton Instance (for simple usage)
// =============================================================================

let defaultHeartbeatService: HeartbeatService | null = null;

/**
 * Get or create the default heartbeat service.
 *
 * @param store - TenantStore (required on first call)
 */
export function getHeartbeatService(store?: TenantStore): HeartbeatService {
  if (!defaultHeartbeatService) {
    if (!store) {
      throw new Error('HeartbeatService not initialized. Provide TenantStore on first call.');
    }
    defaultHeartbeatService = new HeartbeatService({ store });
  }
  return defaultHeartbeatService;
}

/**
 * Reset the default heartbeat service (for testing).
 */
export function resetHeartbeatService(): void {
  if (defaultHeartbeatService) {
    defaultHeartbeatService.shutdown();
    defaultHeartbeatService = null;
  }
}
