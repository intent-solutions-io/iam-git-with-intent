/**
 * SLO Definitions Module (A12)
 *
 * Service Level Objectives for Git With Intent.
 * Defines targets for availability, latency, and throughput.
 *
 * @module @gwi/core/slo
 */

// =============================================================================
// SLO Types
// =============================================================================

/**
 * SLO category
 */
export type SLOCategory = 'availability' | 'latency' | 'throughput' | 'error_rate' | 'saturation';

/**
 * SLO window (measurement period)
 */
export type SLOWindow = '1h' | '24h' | '7d' | '28d' | '30d' | '90d';

/**
 * SLO definition
 */
export interface SLODefinition {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Category */
  category: SLOCategory;
  /** Target percentage (0-100) */
  target: number;
  /** Measurement window */
  window: SLOWindow;
  /** Service this SLO applies to */
  service: string;
  /** Prometheus-style query for good events */
  goodQuery: string;
  /** Prometheus-style query for total events */
  totalQuery: string;
  /** Alert thresholds */
  alerts?: {
    /** Burn rate that triggers warning */
    warningBurnRate: number;
    /** Burn rate that triggers critical */
    criticalBurnRate: number;
  };
  /** Metadata tags */
  tags?: string[];
}

/**
 * SLO status
 */
export interface SLOStatus {
  sloId: string;
  sloName: string;
  target: number;
  current: number;
  window: SLOWindow;
  /** Error budget (100 - target) */
  errorBudget: number;
  /** Remaining error budget */
  errorBudgetRemaining: number;
  /** Current burn rate */
  burnRate: number;
  /** Status */
  status: 'met' | 'at_risk' | 'breached';
  /** Calculated at */
  calculatedAt: Date;
}

// =============================================================================
// Latency Targets
// =============================================================================

/**
 * Latency targets in milliseconds
 */
export const LATENCY_TARGETS = {
  // API endpoints
  api: {
    /** Health check */
    healthCheck: { p50: 10, p95: 50, p99: 100 },
    /** Tenant operations (list, get, update) */
    tenantOperations: { p50: 50, p95: 200, p99: 500 },
    /** Run operations (create, get, list) */
    runOperations: { p50: 100, p95: 500, p99: 1000 },
    /** Usage/billing endpoints */
    usageEndpoints: { p50: 100, p95: 300, p99: 800 },
  },
  // Gateway operations
  gateway: {
    /** A2A task submission */
    taskSubmit: { p50: 200, p95: 800, p99: 2000 },
    /** A2A status check */
    statusCheck: { p50: 50, p95: 200, p99: 500 },
  },
  // Worker operations
  worker: {
    /** Triage operation */
    triage: { p50: 5000, p95: 15000, p99: 30000 },
    /** Plan generation */
    plan: { p50: 10000, p95: 30000, p99: 60000 },
    /** Code resolution */
    resolve: { p50: 15000, p95: 45000, p99: 90000 },
    /** Review generation */
    review: { p50: 8000, p95: 25000, p99: 50000 },
  },
  // Storage operations
  storage: {
    /** Firestore read */
    firestoreRead: { p50: 20, p95: 100, p99: 300 },
    /** Firestore write */
    firestoreWrite: { p50: 50, p95: 200, p99: 500 },
    /** GCS upload */
    gcsUpload: { p50: 100, p95: 500, p99: 1500 },
    /** GCS download */
    gcsDownload: { p50: 50, p95: 200, p99: 800 },
  },
} as const;

// =============================================================================
// SLO Definitions
// =============================================================================

/**
 * All SLO definitions for the system
 */
export const SLO_DEFINITIONS: SLODefinition[] = [
  // ---------------------------------------------------------------------------
  // API Availability SLOs
  // ---------------------------------------------------------------------------
  {
    id: 'api-availability',
    name: 'API Availability',
    description: 'API should be available 99.9% of the time',
    category: 'availability',
    target: 99.9,
    window: '30d',
    service: 'api',
    goodQuery: 'sum(rate(http_requests_total{service="api",status!~"5.."}[5m]))',
    totalQuery: 'sum(rate(http_requests_total{service="api"}[5m]))',
    alerts: {
      warningBurnRate: 2,
      criticalBurnRate: 10,
    },
    tags: ['critical', 'sla'],
  },
  {
    id: 'gateway-availability',
    name: 'Gateway Availability',
    description: 'A2A Gateway should be available 99.9% of the time',
    category: 'availability',
    target: 99.9,
    window: '30d',
    service: 'gateway',
    goodQuery: 'sum(rate(http_requests_total{service="gateway",status!~"5.."}[5m]))',
    totalQuery: 'sum(rate(http_requests_total{service="gateway"}[5m]))',
    alerts: {
      warningBurnRate: 2,
      criticalBurnRate: 10,
    },
    tags: ['critical', 'sla'],
  },

  // ---------------------------------------------------------------------------
  // API Latency SLOs
  // ---------------------------------------------------------------------------
  {
    id: 'api-latency-p95',
    name: 'API Latency (p95)',
    description: '95% of API requests should complete within 500ms',
    category: 'latency',
    target: 95,
    window: '7d',
    service: 'api',
    goodQuery: 'sum(rate(http_request_duration_ms_bucket{service="api",le="500"}[5m]))',
    totalQuery: 'sum(rate(http_request_duration_ms_count{service="api"}[5m]))',
    alerts: {
      warningBurnRate: 2,
      criticalBurnRate: 5,
    },
    tags: ['performance'],
  },
  {
    id: 'api-latency-p99',
    name: 'API Latency (p99)',
    description: '99% of API requests should complete within 1000ms',
    category: 'latency',
    target: 99,
    window: '7d',
    service: 'api',
    goodQuery: 'sum(rate(http_request_duration_ms_bucket{service="api",le="1000"}[5m]))',
    totalQuery: 'sum(rate(http_request_duration_ms_count{service="api"}[5m]))',
    alerts: {
      warningBurnRate: 3,
      criticalBurnRate: 10,
    },
    tags: ['performance'],
  },

  // ---------------------------------------------------------------------------
  // Worker SLOs
  // ---------------------------------------------------------------------------
  {
    id: 'worker-triage-latency',
    name: 'Triage Latency (p95)',
    description: '95% of triage operations should complete within 15 seconds',
    category: 'latency',
    target: 95,
    window: '7d',
    service: 'worker',
    goodQuery: 'sum(rate(agent_operation_duration_ms_bucket{operation="triage",le="15000"}[5m]))',
    totalQuery: 'sum(rate(agent_operation_duration_ms_count{operation="triage"}[5m]))',
    alerts: {
      warningBurnRate: 2,
      criticalBurnRate: 5,
    },
    tags: ['agent', 'performance'],
  },
  {
    id: 'worker-plan-latency',
    name: 'Plan Generation Latency (p95)',
    description: '95% of plan generations should complete within 30 seconds',
    category: 'latency',
    target: 95,
    window: '7d',
    service: 'worker',
    goodQuery: 'sum(rate(agent_operation_duration_ms_bucket{operation="plan",le="30000"}[5m]))',
    totalQuery: 'sum(rate(agent_operation_duration_ms_count{operation="plan"}[5m]))',
    alerts: {
      warningBurnRate: 2,
      criticalBurnRate: 5,
    },
    tags: ['agent', 'performance'],
  },
  {
    id: 'worker-success-rate',
    name: 'Worker Success Rate',
    description: '98% of worker operations should succeed',
    category: 'error_rate',
    target: 98,
    window: '7d',
    service: 'worker',
    goodQuery: 'sum(rate(agent_operations_total{status="success"}[5m]))',
    totalQuery: 'sum(rate(agent_operations_total[5m]))',
    alerts: {
      warningBurnRate: 2,
      criticalBurnRate: 5,
    },
    tags: ['agent', 'reliability'],
  },

  // ---------------------------------------------------------------------------
  // Storage SLOs
  // ---------------------------------------------------------------------------
  {
    id: 'firestore-latency',
    name: 'Firestore Latency (p99)',
    description: '99% of Firestore operations should complete within 300ms',
    category: 'latency',
    target: 99,
    window: '7d',
    service: 'storage',
    goodQuery: 'sum(rate(firestore_operation_duration_ms_bucket{le="300"}[5m]))',
    totalQuery: 'sum(rate(firestore_operation_duration_ms_count[5m]))',
    alerts: {
      warningBurnRate: 3,
      criticalBurnRate: 10,
    },
    tags: ['storage', 'performance'],
  },
  {
    id: 'gcs-upload-latency',
    name: 'GCS Upload Latency (p95)',
    description: '95% of GCS uploads should complete within 1500ms',
    category: 'latency',
    target: 95,
    window: '7d',
    service: 'storage',
    goodQuery: 'sum(rate(gcs_operation_duration_ms_bucket{operation="upload",le="1500"}[5m]))',
    totalQuery: 'sum(rate(gcs_operation_duration_ms_count{operation="upload"}[5m]))',
    alerts: {
      warningBurnRate: 2,
      criticalBurnRate: 5,
    },
    tags: ['storage', 'performance'],
  },

  // ---------------------------------------------------------------------------
  // End-to-End SLOs
  // ---------------------------------------------------------------------------
  {
    id: 'run-completion-rate',
    name: 'Run Completion Rate',
    description: '95% of runs should complete successfully',
    category: 'error_rate',
    target: 95,
    window: '7d',
    service: 'engine',
    goodQuery: 'sum(rate(runs_total{status="completed"}[5m]))',
    totalQuery: 'sum(rate(runs_total{status!="running"}[5m]))',
    alerts: {
      warningBurnRate: 2,
      criticalBurnRate: 5,
    },
    tags: ['e2e', 'reliability'],
  },
  {
    id: 'run-e2e-latency',
    name: 'End-to-End Run Latency (p90)',
    description: '90% of complete autopilot runs should finish within 2 minutes',
    category: 'latency',
    target: 90,
    window: '7d',
    service: 'engine',
    goodQuery: 'sum(rate(run_duration_ms_bucket{type="autopilot",le="120000"}[5m]))',
    totalQuery: 'sum(rate(run_duration_ms_count{type="autopilot"}[5m]))',
    alerts: {
      warningBurnRate: 2,
      criticalBurnRate: 5,
    },
    tags: ['e2e', 'performance'],
  },

  // ---------------------------------------------------------------------------
  // Metering SLOs
  // ---------------------------------------------------------------------------
  {
    id: 'metering-availability',
    name: 'Metering Availability',
    description: 'Metering service should be available 99.9% of the time',
    category: 'availability',
    target: 99.9,
    window: '30d',
    service: 'metering',
    goodQuery: 'sum(rate(metering_events_total{status="success"}[5m]))',
    totalQuery: 'sum(rate(metering_events_total[5m]))',
    alerts: {
      warningBurnRate: 2,
      criticalBurnRate: 10,
    },
    tags: ['billing', 'critical'],
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get SLO by ID
 */
export function getSLOById(id: string): SLODefinition | undefined {
  return SLO_DEFINITIONS.find((slo) => slo.id === id);
}

/**
 * Get SLOs by service
 */
export function getSLOsByService(service: string): SLODefinition[] {
  return SLO_DEFINITIONS.filter((slo) => slo.service === service);
}

/**
 * Get SLOs by category
 */
export function getSLOsByCategory(category: SLOCategory): SLODefinition[] {
  return SLO_DEFINITIONS.filter((slo) => slo.category === category);
}

/**
 * Get SLOs by tag
 */
export function getSLOsByTag(tag: string): SLODefinition[] {
  return SLO_DEFINITIONS.filter((slo) => slo.tags?.includes(tag));
}

/**
 * Calculate error budget in time units
 * @param targetPercent SLO target (e.g., 99.9)
 * @param windowMinutes Window size in minutes
 * @returns Error budget in minutes
 */
export function calculateErrorBudgetMinutes(targetPercent: number, windowMinutes: number): number {
  const errorBudgetPercent = 100 - targetPercent;
  return (errorBudgetPercent / 100) * windowMinutes;
}

/**
 * Convert window to minutes
 */
export function windowToMinutes(window: SLOWindow): number {
  const map: Record<SLOWindow, number> = {
    '1h': 60,
    '24h': 24 * 60,
    '7d': 7 * 24 * 60,
    '28d': 28 * 24 * 60,
    '30d': 30 * 24 * 60,
    '90d': 90 * 24 * 60,
  };
  return map[window];
}

/**
 * Calculate burn rate
 * @param currentPercent Current SLI value
 * @param targetPercent SLO target
 * @returns Burn rate (1 = consuming at exactly budget rate, 0 = meeting/exceeding target)
 */
export function calculateBurnRate(currentPercent: number, targetPercent: number): number {
  // If meeting or exceeding target, no budget is being consumed
  if (currentPercent >= targetPercent) return 0;

  const errorBudget = 100 - targetPercent;
  if (errorBudget === 0) return Infinity; // Can't meet 100% target if below it

  // Burn rate = how far below target / error budget
  // e.g., 99% target, 98% current = (99-98) / 1 = 1x burn rate
  const gapFromTarget = targetPercent - currentPercent;
  return gapFromTarget / errorBudget;
}

/**
 * Determine SLO status
 */
export function determineSLOStatus(
  current: number,
  target: number,
  burnRate: number
): 'met' | 'at_risk' | 'breached' {
  if (current >= target) {
    return 'met';
  }
  // At risk if we're on track to breach within the window
  if (burnRate > 1 && current >= target * 0.95) {
    return 'at_risk';
  }
  return 'breached';
}

/**
 * Calculate SLO status from metrics
 */
export function calculateSLOStatus(
  slo: SLODefinition,
  goodCount: number,
  totalCount: number
): SLOStatus {
  const current = totalCount > 0 ? (goodCount / totalCount) * 100 : 100;
  const errorBudget = 100 - slo.target;
  const errorBudgetUsed = Math.max(0, 100 - current);
  const errorBudgetRemaining = Math.max(0, errorBudget - errorBudgetUsed);
  const burnRate = calculateBurnRate(current, slo.target);

  return {
    sloId: slo.id,
    sloName: slo.name,
    target: slo.target,
    current: Math.round(current * 100) / 100,
    window: slo.window,
    errorBudget,
    errorBudgetRemaining: Math.round(errorBudgetRemaining * 100) / 100,
    burnRate: Math.round(burnRate * 100) / 100,
    status: determineSLOStatus(current, slo.target, burnRate),
    calculatedAt: new Date(),
  };
}

/**
 * Get critical SLOs (those tagged as critical or SLA)
 */
export function getCriticalSLOs(): SLODefinition[] {
  return SLO_DEFINITIONS.filter(
    (slo) => slo.tags?.includes('critical') || slo.tags?.includes('sla')
  );
}

/**
 * Export latency thresholds for a service
 */
export function getLatencyThresholds(
  service: keyof typeof LATENCY_TARGETS,
  operation: string
): { p50: number; p95: number; p99: number } | undefined {
  const serviceTargets = LATENCY_TARGETS[service] as Record<
    string,
    { p50: number; p95: number; p99: number }
  >;
  return serviceTargets?.[operation];
}
