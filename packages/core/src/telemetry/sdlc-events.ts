/**
 * SDLC Events Module
 *
 * EPIC 002: SDLC Telemetry + Bottleneck Measurement
 *
 * Provides lifecycle event tracking across the software development lifecycle:
 * - Stage-based event emission (planning, coding, review, testing, release, incident, onboarding)
 * - Duration tracking for bottleneck identification
 * - DORA metrics foundation
 *
 * @module @gwi/core/telemetry/sdlc-events
 */

import { z } from 'zod';
import { getCurrentContext } from './context.js';
import { generateRequestId } from './ids.js';
import { info, warn } from './logger.js';
import { Counter, Histogram, getMetricsRegistry } from './metrics.js';

// =============================================================================
// Types & Schemas
// =============================================================================

/**
 * SDLC stages representing the full developer lifecycle
 */
export const SDLCStage = z.enum([
  'planning',    // Issue creation, requirements gathering, sprint planning
  'coding',      // Code generation, implementation
  'review',      // PR review, code review
  'testing',     // Test execution, QA validation
  'release',     // Deployment, release management
  'incident',    // Incident response, troubleshooting
  'onboarding',  // Developer onboarding, setup
]);
export type SDLCStage = z.infer<typeof SDLCStage>;

/**
 * Event actions within each stage
 */
export const SDLCAction = z.enum([
  'started',    // Stage work has begun
  'completed',  // Stage work finished successfully
  'failed',     // Stage work failed
  'escalated',  // Stage requires human intervention
  'skipped',    // Stage was skipped (e.g., auto-merge)
]);
export type SDLCAction = z.infer<typeof SDLCAction>;

/**
 * SDLC Event schema
 */
export const SDLCEventSchema = z.object({
  /** Unique event identifier */
  eventId: z.string(),

  /** Tenant identifier */
  tenantId: z.string(),

  /** SDLC stage */
  stage: SDLCStage,

  /** Action taken */
  action: SDLCAction,

  /** Duration in milliseconds (for completed/failed events) */
  durationMs: z.number().optional(),

  /** Associated GWI run ID */
  runId: z.string().optional(),

  /** Associated PR number */
  prNumber: z.number().optional(),

  /** Associated issue number */
  issueNumber: z.number().optional(),

  /** Repository identifier (owner/repo) */
  repository: z.string().optional(),

  /** Agent that performed the action */
  agentId: z.string().optional(),

  /** Workflow type (triage, resolve, review, etc.) */
  workflowType: z.string().optional(),

  /** Error type (for failed events) */
  errorType: z.string().optional(),

  /** Error message (for failed events) */
  errorMessage: z.string().optional(),

  /** Arbitrary metadata */
  metadata: z.record(z.unknown()).default({}),

  /** ISO 8601 timestamp */
  timestamp: z.string(),
});
export type SDLCEvent = z.infer<typeof SDLCEventSchema>;

/**
 * Input for creating a new SDLC event
 */
export interface SDLCEventInput {
  stage: SDLCStage;
  action: SDLCAction;
  durationMs?: number;
  runId?: string;
  prNumber?: number;
  issueNumber?: number;
  repository?: string;
  agentId?: string;
  workflowType?: string;
  errorType?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Stage timer for tracking duration
 */
export interface StageTimer {
  stage: SDLCStage;
  startTime: number;
  stop: (outcome: 'completed' | 'failed', options?: { errorType?: string; errorMessage?: string }) => SDLCEvent;
}

// =============================================================================
// Event Storage Interface
// =============================================================================

/**
 * Interface for persisting SDLC events
 */
export interface SDLCEventStore {
  /**
   * Store an event
   */
  store(event: SDLCEvent): Promise<void>;

  /**
   * Query events by criteria
   */
  query(options: SDLCEventQueryOptions): Promise<SDLCEvent[]>;

  /**
   * Get stage timings aggregation
   */
  getStageTimings(options: StageTimingsOptions): Promise<StageTimings[]>;
}

/**
 * Query options for events
 */
export interface SDLCEventQueryOptions {
  tenantId?: string;
  stage?: SDLCStage;
  action?: SDLCAction;
  runId?: string;
  prNumber?: number;
  repository?: string;
  since?: Date;
  until?: Date;
  limit?: number;
}

/**
 * Options for stage timing aggregations
 */
export interface StageTimingsOptions {
  tenantId?: string;
  repository?: string;
  since?: Date;
  until?: Date;
  groupBy?: 'stage' | 'day' | 'week';
}

/**
 * Stage timing aggregation result
 */
export interface StageTimings {
  stage: SDLCStage;
  period?: string; // Date string for time-based grouping
  count: number;
  completedCount: number;
  failedCount: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
}

// =============================================================================
// SDLC Metrics
// =============================================================================

/**
 * Pre-defined SDLC metrics
 */
export interface SDLCMetrics {
  /** Events by stage and action */
  eventsTotal: Counter;
  /** Stage duration histogram */
  stageDuration: Histogram;
  /** Failure rate by stage */
  stageFailures: Counter;
  /** Currently active stages */
  activeStages: Map<string, StageTimer>;
}

let sdlcMetrics: SDLCMetrics | null = null;

/**
 * Get SDLC metrics (singleton)
 */
export function getSDLCMetrics(): SDLCMetrics {
  if (sdlcMetrics) return sdlcMetrics;

  const registry = getMetricsRegistry();

  sdlcMetrics = {
    eventsTotal: registry.counter(
      'gwi_sdlc_events_total',
      'Total SDLC events by stage and action',
      ['stage', 'action', 'tenant_id']
    ),
    stageDuration: registry.histogram(
      'gwi_sdlc_stage_duration_ms',
      'SDLC stage duration in milliseconds',
      ['stage', 'tenant_id', 'workflow_type'],
      {
        boundaries: [100, 500, 1000, 5000, 10000, 30000, 60000, 120000, 300000, 600000],
      }
    ),
    stageFailures: registry.counter(
      'gwi_sdlc_stage_failures_total',
      'SDLC stage failures by error type',
      ['stage', 'error_type', 'tenant_id']
    ),
    activeStages: new Map(),
  };

  return sdlcMetrics;
}

// =============================================================================
// Event Emission
// =============================================================================

/** Event listeners */
type SDLCEventListener = (event: SDLCEvent) => void | Promise<void>;
const eventListeners: SDLCEventListener[] = [];

/**
 * Register an event listener
 */
export function onSDLCEvent(listener: SDLCEventListener): () => void {
  eventListeners.push(listener);
  return () => {
    const idx = eventListeners.indexOf(listener);
    if (idx >= 0) eventListeners.splice(idx, 1);
  };
}

/**
 * Emit an SDLC event
 */
export function emitSDLCEvent(input: SDLCEventInput): SDLCEvent {
  const ctx = getCurrentContext();
  const tenantId = ctx?.tenantId ?? 'default';

  const event: SDLCEvent = {
    eventId: generateRequestId(),
    tenantId,
    stage: input.stage,
    action: input.action,
    durationMs: input.durationMs,
    runId: input.runId ?? ctx?.requestId,
    prNumber: input.prNumber,
    issueNumber: input.issueNumber,
    repository: input.repository,
    agentId: input.agentId,
    workflowType: input.workflowType,
    errorType: input.errorType,
    errorMessage: input.errorMessage,
    metadata: input.metadata ?? {},
    timestamp: new Date().toISOString(),
  };

  // Validate
  const validated = SDLCEventSchema.parse(event);

  // Record metrics
  const metrics = getSDLCMetrics();
  metrics.eventsTotal.inc({
    stage: validated.stage,
    action: validated.action,
    tenant_id: tenantId,
  });

  if (validated.durationMs !== undefined && (validated.action === 'completed' || validated.action === 'failed')) {
    metrics.stageDuration.observe(validated.durationMs, {
      stage: validated.stage,
      tenant_id: tenantId,
      workflow_type: validated.workflowType ?? 'unknown',
    });
  }

  if (validated.action === 'failed' && validated.errorType) {
    metrics.stageFailures.inc({
      stage: validated.stage,
      error_type: validated.errorType,
      tenant_id: tenantId,
    });
  }

  // Log event
  info('SDLC event emitted', {
    eventId: validated.eventId,
    stage: validated.stage,
    action: validated.action,
    durationMs: validated.durationMs,
    runId: validated.runId,
  });

  // Notify listeners (fire-and-forget)
  for (const listener of eventListeners) {
    Promise.resolve(listener(validated)).catch((err) => {
      warn('SDLC event listener error', { error: String(err) });
    });
  }

  return validated;
}

// =============================================================================
// Stage Timer Helpers
// =============================================================================

/**
 * Start timing an SDLC stage
 *
 * @example
 * ```typescript
 * const timer = startStageTimer('coding', { runId: 'abc123' });
 * // ... do work ...
 * const event = timer.stop('completed');
 * ```
 */
export function startStageTimer(
  stage: SDLCStage,
  options?: {
    runId?: string;
    prNumber?: number;
    issueNumber?: number;
    repository?: string;
    agentId?: string;
    workflowType?: string;
    metadata?: Record<string, unknown>;
  }
): StageTimer {
  const startTime = Date.now();

  // Emit started event
  emitSDLCEvent({
    stage,
    action: 'started',
    ...options,
  });

  const timer: StageTimer = {
    stage,
    startTime,
    stop: (outcome, stopOptions) => {
      const durationMs = Date.now() - startTime;
      return emitSDLCEvent({
        stage,
        action: outcome,
        durationMs,
        errorType: stopOptions?.errorType,
        errorMessage: stopOptions?.errorMessage,
        ...options,
      });
    },
  };

  // Track active timers
  const metrics = getSDLCMetrics();
  const timerKey = `${stage}:${options?.runId ?? 'default'}`;
  metrics.activeStages.set(timerKey, timer);

  return timer;
}

/**
 * Wrap an async function with SDLC stage tracking
 *
 * @example
 * ```typescript
 * const result = await withStageTracking('review', async () => {
 *   return await reviewPR(prUrl);
 * }, { runId: 'abc123' });
 * ```
 */
export async function withStageTracking<T>(
  stage: SDLCStage,
  fn: () => Promise<T>,
  options?: {
    runId?: string;
    prNumber?: number;
    issueNumber?: number;
    repository?: string;
    agentId?: string;
    workflowType?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<T> {
  const timer = startStageTimer(stage, options);

  try {
    const result = await fn();
    timer.stop('completed');
    return result;
  } catch (error) {
    timer.stop('failed', {
      errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// =============================================================================
// Stage Mapping Helpers
// =============================================================================

/**
 * Map GWI workflow type to SDLC stage
 */
export function workflowToStage(workflowType: string): SDLCStage {
  const mapping: Record<string, SDLCStage> = {
    triage: 'planning',
    'issue-to-code': 'coding',
    generate: 'coding',
    coder: 'coding',
    review: 'review',
    reviewer: 'review',
    resolve: 'coding',
    resolver: 'coding',
    merge: 'release',
    autopilot: 'coding',
    test: 'testing',
    deploy: 'release',
    release: 'release',
    init: 'onboarding',
    setup: 'onboarding',
    diagnose: 'incident',
    forensics: 'incident',
  };

  return mapping[workflowType.toLowerCase()] ?? 'coding';
}

/**
 * Determine stage from context (PR state, etc.)
 */
export function inferStageFromContext(context: {
  hasMergeConflicts?: boolean;
  isPRMerged?: boolean;
  isIncident?: boolean;
  isReview?: boolean;
  isNewSetup?: boolean;
}): SDLCStage {
  if (context.isIncident) return 'incident';
  if (context.isNewSetup) return 'onboarding';
  if (context.isReview) return 'review';
  if (context.hasMergeConflicts) return 'coding';
  if (context.isPRMerged) return 'release';
  return 'coding';
}

// =============================================================================
// DORA Metrics Helpers
// =============================================================================

/**
 * DORA (DevOps Research and Assessment) metrics
 */
export interface DORAMetrics {
  /** Deployment Frequency - how often code deploys to production */
  deploymentFrequency: {
    deploysPerDay: number;
    deploysPerWeek: number;
    deploysPerMonth: number;
  };
  /** Lead Time for Changes - commit to production duration */
  leadTimeForChanges: {
    avgHours: number;
    p50Hours: number;
    p95Hours: number;
  };
  /** Change Failure Rate - % of deploys causing incidents */
  changeFailureRate: {
    failurePercent: number;
    totalDeploys: number;
    failedDeploys: number;
  };
  /** Time to Restore - mean time to recover from failures */
  timeToRestore: {
    avgHours: number;
    p50Hours: number;
    p95Hours: number;
  };
}

/**
 * Calculate DORA metrics from events
 * (Placeholder - full implementation requires event store queries)
 */
export function calculateDORAMetrics(_events: SDLCEvent[]): Partial<DORAMetrics> {
  // This would be implemented with actual event store queries
  // For now, return empty metrics
  return {
    deploymentFrequency: {
      deploysPerDay: 0,
      deploysPerWeek: 0,
      deploysPerMonth: 0,
    },
    leadTimeForChanges: {
      avgHours: 0,
      p50Hours: 0,
      p95Hours: 0,
    },
    changeFailureRate: {
      failurePercent: 0,
      totalDeploys: 0,
      failedDeploys: 0,
    },
    timeToRestore: {
      avgHours: 0,
      p50Hours: 0,
      p95Hours: 0,
    },
  };
}
