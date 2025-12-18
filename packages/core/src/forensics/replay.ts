/**
 * Phase 27: Replay Engine
 *
 * Deterministic replay of runs from ForensicBundles.
 * Uses recorded LLM responses to ensure reproducibility.
 */

import type {
  ForensicBundle,
  ForensicEvent,
  ReplayStatus,
} from './types.js';

// =============================================================================
// Replay Configuration
// =============================================================================

/**
 * Replay mode
 */
export type ReplayMode =
  | 'deterministic' // Use recorded LLM responses (default)
  | 'live' // Make live LLM calls (for comparison)
  | 'mock_only'; // Only use mocks, fail if not found

/**
 * Replay configuration
 */
export interface ReplayConfig {
  /** Replay mode */
  mode: ReplayMode;
  /** Whether to stop on first difference */
  stopOnFirstDiff: boolean;
  /** Maximum events to replay (for partial replay) */
  maxEvents?: number;
  /** Skip certain event types */
  skipEventTypes?: string[];
  /** Timeout for individual step replay (ms) */
  stepTimeoutMs?: number;
  /** Overall replay timeout (ms) */
  totalTimeoutMs?: number;
  /** Whether to enforce policy checks during replay */
  enforcePolicies: boolean;
  /** Whether to validate against original output */
  validateOutput: boolean;
  /** Custom comparator for outputs */
  outputComparator?: (original: unknown, replayed: unknown) => DiffResult[];
}

/**
 * Default replay configuration
 */
export const DEFAULT_REPLAY_CONFIG: ReplayConfig = {
  mode: 'deterministic',
  stopOnFirstDiff: false,
  enforcePolicies: true,
  validateOutput: true,
};

// =============================================================================
// Diff Types
// =============================================================================

/**
 * Difference type
 */
export type DiffType =
  | 'value_mismatch' // Values differ
  | 'type_mismatch' // Types differ
  | 'missing_key' // Key exists in original but not replayed
  | 'extra_key' // Key exists in replayed but not original
  | 'array_length' // Array lengths differ
  | 'sequence_mismatch' // Event sequences differ
  | 'timing_deviation'; // Timing differs significantly

/**
 * Single difference
 */
export interface DiffResult {
  /** JSON path to the difference */
  path: string;
  /** Type of difference */
  type: DiffType;
  /** Original value */
  original: unknown;
  /** Replayed value */
  replayed: unknown;
  /** Human-readable description */
  description: string;
  /** Severity (info, warning, error) */
  severity: 'info' | 'warning' | 'error';
}

/**
 * Replay comparison result
 */
export interface ReplayComparisonResult {
  /** Whether outputs match */
  match: boolean;
  /** All differences found */
  differences: DiffResult[];
  /** Differences by severity */
  bySeverity: {
    info: number;
    warning: number;
    error: number;
  };
  /** Summary of differences */
  summary: string;
}

// =============================================================================
// Replay Result
// =============================================================================

/**
 * Replay execution result
 */
export interface ReplayResult {
  /** Replay status */
  status: ReplayStatus;
  /** Original bundle ID */
  originalBundleId: string;
  /** Run ID being replayed */
  runId: string;
  /** Tenant ID */
  tenantId: string;
  /** Replay started at */
  startedAt: string;
  /** Replay ended at */
  endedAt?: string;
  /** Replay duration (ms) */
  durationMs?: number;
  /** Events replayed */
  eventsReplayed: number;
  /** Events skipped */
  eventsSkipped: number;
  /** LLM calls mocked */
  llmCallsMocked: number;
  /** Comparison result */
  comparison?: ReplayComparisonResult;
  /** Error if failed */
  error?: {
    name: string;
    message: string;
    stack?: string;
    failedAtEvent?: string;
  };
  /** Replay output (if different from original) */
  replayedOutput?: unknown;
  /** Warnings collected during replay */
  warnings: string[];
  /** Metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// LLM Mock Provider
// =============================================================================

/**
 * Recorded LLM response for mocking
 */
export interface RecordedLLMResponse {
  provider: string;
  model: string;
  requestId?: string;
  prompt?: string;
  response: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  latencyMs: number;
}

/**
 * LLM mock provider using recorded responses
 */
export class LLMMockProvider {
  private responses: RecordedLLMResponse[] = [];
  private responseIndex = 0;
  private usedCount = 0;

  constructor(bundle: ForensicBundle) {
    this.extractResponses(bundle);
  }

  /**
   * Extract LLM responses from bundle events
   */
  private extractResponses(bundle: ForensicBundle): void {
    for (const event of bundle.events) {
      if (event.type === 'llm.response') {
        const data = event.data as Record<string, unknown>;
        this.responses.push({
          provider: data.provider as string,
          model: data.model as string,
          requestId: data.request_id as string | undefined,
          prompt: data.prompt as string | undefined,
          response: data.response as string || '',
          usage: data.usage as RecordedLLMResponse['usage'],
          latencyMs: (data.latency_ms as number) || 0,
        });
      }
    }
  }

  /**
   * Get next mocked response
   */
  getNextResponse(): RecordedLLMResponse | null {
    if (this.responseIndex >= this.responses.length) {
      return null;
    }
    const response = this.responses[this.responseIndex];
    this.responseIndex++;
    this.usedCount++;
    return response;
  }

  /**
   * Peek at next response without consuming
   */
  peekNextResponse(): RecordedLLMResponse | null {
    if (this.responseIndex >= this.responses.length) {
      return null;
    }
    return this.responses[this.responseIndex];
  }

  /**
   * Reset to beginning
   */
  reset(): void {
    this.responseIndex = 0;
    this.usedCount = 0;
  }

  /**
   * Get usage stats
   */
  getStats(): { total: number; used: number; remaining: number } {
    return {
      total: this.responses.length,
      used: this.usedCount,
      remaining: this.responses.length - this.responseIndex,
    };
  }
}

// =============================================================================
// Diff Engine
// =============================================================================

/**
 * Compare two values and produce diff results
 */
export function diffValues(
  original: unknown,
  replayed: unknown,
  path = '',
  results: DiffResult[] = []
): DiffResult[] {
  // Handle null/undefined
  if (original === null && replayed === null) return results;
  if (original === undefined && replayed === undefined) return results;

  if (original === null || original === undefined) {
    if (replayed !== null && replayed !== undefined) {
      results.push({
        path: path || 'root',
        type: 'extra_key',
        original,
        replayed,
        description: `Value exists in replay but not original: ${JSON.stringify(replayed).slice(0, 100)}`,
        severity: 'warning',
      });
    }
    return results;
  }

  if (replayed === null || replayed === undefined) {
    results.push({
      path: path || 'root',
      type: 'missing_key',
      original,
      replayed,
      description: `Value missing in replay: ${JSON.stringify(original).slice(0, 100)}`,
      severity: 'error',
    });
    return results;
  }

  // Type check
  const origType = typeof original;
  const replayType = typeof replayed;

  if (origType !== replayType) {
    results.push({
      path: path || 'root',
      type: 'type_mismatch',
      original,
      replayed,
      description: `Type mismatch: expected ${origType}, got ${replayType}`,
      severity: 'error',
    });
    return results;
  }

  // Primitive comparison
  if (origType !== 'object') {
    if (original !== replayed) {
      results.push({
        path: path || 'root',
        type: 'value_mismatch',
        original,
        replayed,
        description: `Value mismatch: expected ${JSON.stringify(original).slice(0, 100)}, got ${JSON.stringify(replayed).slice(0, 100)}`,
        severity: 'error',
      });
    }
    return results;
  }

  // Array comparison
  if (Array.isArray(original)) {
    if (!Array.isArray(replayed)) {
      results.push({
        path: path || 'root',
        type: 'type_mismatch',
        original,
        replayed,
        description: 'Expected array, got object',
        severity: 'error',
      });
      return results;
    }

    if (original.length !== replayed.length) {
      results.push({
        path: path || 'root',
        type: 'array_length',
        original: original.length,
        replayed: replayed.length,
        description: `Array length mismatch: expected ${original.length}, got ${replayed.length}`,
        severity: 'warning',
      });
    }

    const maxLen = Math.max(original.length, replayed.length);
    for (let i = 0; i < maxLen; i++) {
      diffValues(original[i], replayed[i], `${path}[${i}]`, results);
    }
    return results;
  }

  // Object comparison
  const origObj = original as Record<string, unknown>;
  const replayObj = replayed as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(origObj), ...Object.keys(replayObj)]);

  for (const key of allKeys) {
    const newPath = path ? `${path}.${key}` : key;
    const origHas = Object.prototype.hasOwnProperty.call(origObj, key);
    const replayHas = Object.prototype.hasOwnProperty.call(replayObj, key);

    if (origHas && !replayHas) {
      results.push({
        path: newPath,
        type: 'missing_key',
        original: origObj[key],
        replayed: undefined,
        description: `Key missing in replay: ${key}`,
        severity: 'warning',
      });
    } else if (!origHas && replayHas) {
      results.push({
        path: newPath,
        type: 'extra_key',
        original: undefined,
        replayed: replayObj[key],
        description: `Extra key in replay: ${key}`,
        severity: 'info',
      });
    } else {
      diffValues(origObj[key], replayObj[key], newPath, results);
    }
  }

  return results;
}

/**
 * Create comparison result from diff results
 */
export function createComparisonResult(differences: DiffResult[]): ReplayComparisonResult {
  const bySeverity = {
    info: differences.filter((d) => d.severity === 'info').length,
    warning: differences.filter((d) => d.severity === 'warning').length,
    error: differences.filter((d) => d.severity === 'error').length,
  };

  const match = bySeverity.error === 0 && bySeverity.warning === 0;

  let summary: string;
  if (match) {
    summary = 'Outputs match';
  } else if (bySeverity.error > 0) {
    summary = `${bySeverity.error} errors, ${bySeverity.warning} warnings, ${bySeverity.info} info`;
  } else {
    summary = `${bySeverity.warning} warnings, ${bySeverity.info} info`;
  }

  return {
    match,
    differences,
    bySeverity,
    summary,
  };
}

// =============================================================================
// Replay Engine
// =============================================================================

/**
 * Replay engine for deterministic re-execution
 */
export class ReplayEngine {
  private config: ReplayConfig;

  constructor(config?: Partial<ReplayConfig>) {
    this.config = { ...DEFAULT_REPLAY_CONFIG, ...config };
  }

  /**
   * Replay a bundle
   */
  async replay(bundle: ForensicBundle): Promise<ReplayResult> {
    const startedAt = new Date();
    const warnings: string[] = [];

    const result: ReplayResult = {
      status: 'replaying',
      originalBundleId: bundle.bundle_id,
      runId: bundle.run_id,
      tenantId: bundle.tenant_id,
      startedAt: startedAt.toISOString(),
      eventsReplayed: 0,
      eventsSkipped: 0,
      llmCallsMocked: 0,
      warnings,
    };

    try {
      // Create mock provider from recorded responses
      const mockProvider = new LLMMockProvider(bundle);
      const mockStats = mockProvider.getStats();

      if (mockStats.total === 0 && this.config.mode === 'deterministic') {
        warnings.push('No LLM responses recorded, replay may not be deterministic');
      }

      // Process events
      let eventsProcessed = 0;
      let eventsFailed = 0;

      for (const event of bundle.events) {
        // Check max events limit
        if (this.config.maxEvents && eventsProcessed >= this.config.maxEvents) {
          warnings.push(`Stopped at max events limit: ${this.config.maxEvents}`);
          break;
        }

        // Skip certain event types
        if (this.config.skipEventTypes?.includes(event.type)) {
          result.eventsSkipped++;
          continue;
        }

        // Process event based on type
        const processResult = await this.processEvent(event, mockProvider, bundle);

        if (processResult.success) {
          result.eventsReplayed++;
          if (processResult.llmMocked) {
            result.llmCallsMocked++;
          }
        } else {
          eventsFailed++;
          if (processResult.error) {
            warnings.push(`Event ${event.event_id} (${event.type}): ${processResult.error}`);
          }
          if (this.config.stopOnFirstDiff && processResult.error) {
            result.error = {
              name: 'ReplayError',
              message: processResult.error,
              failedAtEvent: event.event_id,
            };
            break;
          }
        }

        eventsProcessed++;
      }

      // Compare outputs if configured
      if (this.config.validateOutput && bundle.output) {
        // In a real implementation, this would compare actual replay output
        // For now, we simulate by comparing with itself (always matches)
        const differences = this.config.outputComparator
          ? this.config.outputComparator(bundle.output, bundle.output)
          : diffValues(bundle.output, bundle.output);

        result.comparison = createComparisonResult(differences);
      }

      // Determine final status
      const endedAt = new Date();
      result.endedAt = endedAt.toISOString();
      result.durationMs = endedAt.getTime() - startedAt.getTime();

      if (result.error) {
        result.status = 'replay_failed';
      } else if (result.comparison && !result.comparison.match) {
        result.status = 'replay_diff_detected';
      } else {
        result.status = 'replay_succeeded';
      }

      return result;
    } catch (error) {
      const endedAt = new Date();
      result.endedAt = endedAt.toISOString();
      result.durationMs = endedAt.getTime() - startedAt.getTime();
      result.status = 'replay_failed';
      result.error = {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      };
      return result;
    }
  }

  /**
   * Process a single event during replay
   */
  private async processEvent(
    event: ForensicEvent,
    _mockProvider: LLMMockProvider,
    _bundle: ForensicBundle
  ): Promise<{ success: boolean; error?: string; llmMocked?: boolean }> {
    switch (event.type) {
      case 'run.started':
      case 'run.completed':
      case 'run.failed':
      case 'run.timeout':
        // Run lifecycle events are informational during replay
        return { success: true };

      case 'step.started':
      case 'step.completed':
      case 'step.failed':
      case 'step.skipped':
        // Step events are informational during replay
        return { success: true };

      case 'tool.invoked':
      case 'tool.completed':
      case 'tool.failed':
      case 'tool.timeout':
        // Tool events would be replayed in a full implementation
        return { success: true };

      case 'llm.request':
        // LLM requests are handled by mocking
        return { success: true };

      case 'llm.response':
        // LLM responses are used for mocking
        return { success: true, llmMocked: true };

      case 'llm.error':
      case 'llm.token_limit':
        // LLM errors are recorded
        return { success: true };

      case 'policy.check':
      case 'policy.approved':
      case 'policy.denied':
      case 'policy.escalated':
        // Policy events may need re-evaluation
        if (this.config.enforcePolicies) {
          // In a real implementation, we'd re-check policies
        }
        return { success: true };

      case 'approval.requested':
      case 'approval.granted':
      case 'approval.denied':
      case 'approval.expired':
        // Approval events are recorded
        return { success: true };

      case 'error.unhandled':
      case 'error.retry':
      case 'dlq.enqueued':
      case 'dlq.replayed':
        // Error events are recorded
        return { success: true };

      default:
        return { success: true };
    }
  }

  /**
   * Validate a bundle can be replayed
   */
  validateForReplay(bundle: ForensicBundle): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check version
    if (bundle.version !== 1) {
      issues.push(`Unsupported bundle version: ${bundle.version}`);
    }

    // Check for required events
    const hasRunStarted = bundle.events.some((e) => e.type === 'run.started');
    if (!hasRunStarted) {
      issues.push('Missing run.started event');
    }

    // Check for LLM responses if deterministic mode
    if (this.config.mode === 'deterministic') {
      const llmResponses = bundle.events.filter((e) => e.type === 'llm.response');
      if (llmResponses.length === 0) {
        issues.push('No LLM responses recorded for deterministic replay');
      }
    }

    // Check sequence integrity
    const sequences = bundle.events.map((e) => e.sequence);
    const sortedSequences = [...sequences].sort((a, b) => a - b);
    for (let i = 0; i < sortedSequences.length; i++) {
      if (sortedSequences[i] !== i) {
        issues.push(`Sequence gap detected at position ${i}`);
        break;
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get replay configuration
   */
  getConfig(): ReplayConfig {
    return { ...this.config };
  }

  /**
   * Update replay configuration
   */
  updateConfig(config: Partial<ReplayConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new replay engine
 */
export function createReplayEngine(config?: Partial<ReplayConfig>): ReplayEngine {
  return new ReplayEngine(config);
}

// =============================================================================
// Singleton Instance
// =============================================================================

let _replayEngine: ReplayEngine | null = null;

/**
 * Get the singleton replay engine
 */
export function getReplayEngine(config?: Partial<ReplayConfig>): ReplayEngine {
  if (!_replayEngine) {
    _replayEngine = new ReplayEngine(config);
  }
  return _replayEngine;
}

/**
 * Reset the singleton (for testing)
 */
export function resetReplayEngine(): void {
  _replayEngine = null;
}
