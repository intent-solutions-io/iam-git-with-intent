/**
 * Phase 27: Forensic Collector
 *
 * Collects events during run execution and builds ForensicBundles.
 * Applies redaction before bundle finalization.
 */

import { randomUUID } from 'node:crypto';
import type {
  ForensicBundle,
  ForensicEvent,
  ForensicEventType,
  RedactionConfig,
} from './types.js';
import { RedactionService, getRedactionService } from './redaction.js';
import { createHash } from 'node:crypto';

// =============================================================================
// Collector Configuration
// =============================================================================

/**
 * Collector configuration
 */
export interface CollectorConfig {
  /** Tenant ID */
  tenantId: string;
  /** Run ID */
  runId: string;
  /** Workflow ID (optional) */
  workflowId?: string;
  /** Agent ID (optional) */
  agentId?: string;
  /** Model being used */
  model?: string;
  /** Redaction config */
  redactionConfig?: Partial<RedactionConfig>;
  /** Whether to compute checksum */
  computeChecksum?: boolean;
  /** Maximum events to collect (prevent memory issues) */
  maxEvents?: number;
  /** Correlation ID for distributed tracing */
  correlationId?: string;
}

// =============================================================================
// Forensic Collector
// =============================================================================

/**
 * Collector for forensic events
 */
export class ForensicCollector {
  private config: CollectorConfig;
  private events: ForensicEvent[] = [];
  private sequence = 0;
  private startedAt: Date | null = null;
  private endedAt: Date | null = null;
  private input: Record<string, unknown> | undefined;
  private output: Record<string, unknown> | undefined;
  private error: { name: string; message: string; stack?: string; code?: string } | undefined;
  private status: 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled' = 'running';
  private redactionService: RedactionService;
  private tokenUsage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
  private llmLatency = 0;
  private policyChecks = {
    total: 0,
    approved: 0,
    denied: 0,
    escalated: 0,
  };

  constructor(config: CollectorConfig) {
    this.config = config;
    this.redactionService = config.redactionConfig
      ? new RedactionService(config.redactionConfig)
      : getRedactionService();
  }

  /**
   * Start collecting (called when run starts)
   */
  start(input?: Record<string, unknown>): void {
    this.startedAt = new Date();
    this.input = input;

    this.addEvent('run.started', {
      run_id: this.config.runId,
      tenant_id: this.config.tenantId,
      workflow_id: this.config.workflowId,
      agent_id: this.config.agentId,
      model: this.config.model,
      input,
    });
  }

  /**
   * End collecting (called when run completes)
   */
  complete(output?: Record<string, unknown>): void {
    this.endedAt = new Date();
    this.output = output;
    this.status = 'completed';

    this.addEvent('run.completed', {
      run_id: this.config.runId,
      tenant_id: this.config.tenantId,
      output,
    });
  }

  /**
   * End collecting with failure
   */
  fail(error: { name: string; message: string; stack?: string; code?: string }): void {
    this.endedAt = new Date();
    this.error = error;
    this.status = 'failed';

    this.addEvent('run.failed', {
      run_id: this.config.runId,
      tenant_id: this.config.tenantId,
      error,
    });
  }

  /**
   * End collecting with timeout
   */
  timeout(): void {
    this.endedAt = new Date();
    this.status = 'timeout';

    this.addEvent('run.timeout', {
      run_id: this.config.runId,
      tenant_id: this.config.tenantId,
    });
  }

  /**
   * Cancel collecting
   */
  cancel(): void {
    this.endedAt = new Date();
    this.status = 'cancelled';
  }

  /**
   * Add a generic event
   */
  addEvent(type: ForensicEventType, data: Record<string, unknown>, parentId?: string): string {
    // Check max events limit
    if (this.config.maxEvents && this.events.length >= this.config.maxEvents) {
      console.warn(`Max events limit reached (${this.config.maxEvents}), dropping event`);
      return '';
    }

    const eventId = randomUUID();
    const event: ForensicEvent = {
      event_id: eventId,
      type,
      timestamp: new Date().toISOString(),
      sequence: this.sequence++,
      parent_id: parentId,
      correlation_id: this.config.correlationId,
      data,
    } as ForensicEvent;

    this.events.push(event);

    // Track aggregates for specific event types
    this.updateAggregates(type, data);

    return eventId;
  }

  /**
   * Update aggregate statistics
   */
  private updateAggregates(type: ForensicEventType, data: Record<string, unknown>): void {
    // Track LLM token usage and latency
    if (type === 'llm.response') {
      const usage = data.usage as { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
      if (usage) {
        this.tokenUsage.prompt_tokens += usage.prompt_tokens || 0;
        this.tokenUsage.completion_tokens += usage.completion_tokens || 0;
        this.tokenUsage.total_tokens += usage.total_tokens || 0;
      }
      const latency = data.latency_ms as number | undefined;
      if (latency) {
        this.llmLatency += latency;
      }
    }

    // Track policy decisions
    if (type === 'policy.check') {
      this.policyChecks.total++;
    } else if (type === 'policy.approved') {
      this.policyChecks.approved++;
    } else if (type === 'policy.denied') {
      this.policyChecks.denied++;
    } else if (type === 'policy.escalated') {
      this.policyChecks.escalated++;
    }
  }

  // =============================================================================
  // Convenience Methods for Common Events
  // =============================================================================

  /**
   * Record step started
   */
  stepStarted(stepId: string, stepName: string, stepIndex: number, input?: Record<string, unknown>): string {
    return this.addEvent('step.started', {
      step_id: stepId,
      step_name: stepName,
      step_index: stepIndex,
      input,
    });
  }

  /**
   * Record step completed
   */
  stepCompleted(
    stepId: string,
    stepName: string,
    stepIndex: number,
    output?: Record<string, unknown>,
    durationMs?: number,
    parentId?: string
  ): string {
    const eventId = this.addEvent(
      'step.completed',
      {
        step_id: stepId,
        step_name: stepName,
        step_index: stepIndex,
        output,
      },
      parentId
    );
    // Update duration on the event
    const event = this.events.find((e) => e.event_id === eventId);
    if (event && durationMs !== undefined) {
      event.duration_ms = durationMs;
    }
    return eventId;
  }

  /**
   * Record step failed
   */
  stepFailed(
    stepId: string,
    stepName: string,
    stepIndex: number,
    error: { name: string; message: string; stack?: string },
    parentId?: string
  ): string {
    return this.addEvent(
      'step.failed',
      {
        step_id: stepId,
        step_name: stepName,
        step_index: stepIndex,
        error,
      },
      parentId
    );
  }

  /**
   * Record tool invocation
   */
  toolInvoked(toolName: string, toolId: string, input?: Record<string, unknown>): string {
    return this.addEvent('tool.invoked', {
      tool_name: toolName,
      tool_id: toolId,
      input,
    });
  }

  /**
   * Record tool completion
   */
  toolCompleted(
    toolName: string,
    toolId: string,
    output?: Record<string, unknown>,
    durationMs?: number,
    parentId?: string
  ): string {
    const eventId = this.addEvent(
      'tool.completed',
      {
        tool_name: toolName,
        tool_id: toolId,
        output,
      },
      parentId
    );
    const event = this.events.find((e) => e.event_id === eventId);
    if (event && durationMs !== undefined) {
      event.duration_ms = durationMs;
    }
    return eventId;
  }

  /**
   * Record tool failure
   */
  toolFailed(
    toolName: string,
    toolId: string,
    error: { name: string; message: string; stack?: string },
    parentId?: string
  ): string {
    return this.addEvent(
      'tool.failed',
      {
        tool_name: toolName,
        tool_id: toolId,
        error,
      },
      parentId
    );
  }

  /**
   * Record LLM request
   */
  llmRequest(
    provider: string,
    model: string,
    prompt?: string,
    system?: string,
    temperature?: number,
    maxTokens?: number
  ): string {
    return this.addEvent('llm.request', {
      provider,
      model,
      prompt,
      system,
      temperature,
      max_tokens: maxTokens,
    });
  }

  /**
   * Record LLM response
   */
  llmResponse(
    provider: string,
    model: string,
    response?: string,
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number },
    latencyMs?: number,
    finishReason?: string,
    requestId?: string,
    parentId?: string
  ): string {
    const eventId = this.addEvent(
      'llm.response',
      {
        provider,
        model,
        response,
        usage,
        latency_ms: latencyMs,
        finish_reason: finishReason,
        request_id: requestId,
      },
      parentId
    );
    const event = this.events.find((e) => e.event_id === eventId);
    if (event && latencyMs !== undefined) {
      event.duration_ms = latencyMs;
    }
    return eventId;
  }

  /**
   * Record LLM error
   */
  llmError(
    provider: string,
    model: string,
    error: { name: string; message: string; code?: string },
    parentId?: string
  ): string {
    return this.addEvent(
      'llm.error',
      {
        provider,
        model,
        error,
      },
      parentId
    );
  }

  /**
   * Record policy check
   */
  policyCheck(
    policyId: string,
    action: string,
    decision: 'allow' | 'deny' | 'escalate' | 'pending',
    reason?: string,
    gateId?: string,
    policyName?: string
  ): string {
    return this.addEvent('policy.check', {
      policy_id: policyId,
      policy_name: policyName,
      gate_id: gateId,
      action,
      decision,
      reason,
    });
  }

  /**
   * Record approval request
   */
  approvalRequested(
    approvalId: string,
    requesterId: string,
    scope: string,
    reason?: string,
    expiresAt?: string
  ): string {
    return this.addEvent('approval.requested', {
      approval_id: approvalId,
      requester_id: requesterId,
      scope,
      reason,
      expires_at: expiresAt,
    });
  }

  /**
   * Record error for DLQ
   */
  errorForDLQ(
    errorId: string,
    error: { name: string; message: string; stack?: string; code?: string },
    retryCount = 0,
    maxRetries?: number
  ): string {
    return this.addEvent('dlq.enqueued', {
      error_id: errorId,
      error,
      retry_count: retryCount,
      max_retries: maxRetries,
    });
  }

  // =============================================================================
  // Bundle Building
  // =============================================================================

  /**
   * Build the final ForensicBundle
   */
  build(): ForensicBundle {
    const now = new Date();
    const createdAt = now.toISOString();
    const runDuration = this.startedAt && this.endedAt
      ? this.endedAt.getTime() - this.startedAt.getTime()
      : undefined;

    // Apply redaction to all events, input, and output
    const redactedEvents = this.events.map((event) => {
      const result = this.redactionService.redact(event);
      return result.data as ForensicEvent;
    });

    const redactedInput = this.input
      ? (this.redactionService.redact(this.input).data as Record<string, unknown>)
      : undefined;

    const redactedOutput = this.output
      ? (this.redactionService.redact(this.output).data as Record<string, unknown>)
      : undefined;

    // Calculate redaction stats
    const fullRedaction = this.redactionService.redact({
      events: this.events,
      input: this.input,
      output: this.output,
    });

    // Count events by type
    const eventCounts: Record<string, number> = {};
    for (const event of this.events) {
      eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
    }

    const bundle: ForensicBundle = {
      version: 1,
      bundle_id: randomUUID(),
      run_id: this.config.runId,
      tenant_id: this.config.tenantId,
      workflow_id: this.config.workflowId,
      created_at: createdAt,
      run_started_at: this.startedAt?.toISOString() || createdAt,
      run_ended_at: this.endedAt?.toISOString(),
      run_duration_ms: runDuration,
      run_status: this.status,
      agent_id: this.config.agentId,
      model: this.config.model,
      input: redactedInput,
      output: redactedOutput,
      error: this.error,
      events: redactedEvents,
      event_counts: eventCounts,
      total_tokens:
        this.tokenUsage.total_tokens > 0 ? this.tokenUsage : undefined,
      total_llm_latency_ms: this.llmLatency > 0 ? this.llmLatency : undefined,
      policy_summary:
        this.policyChecks.total > 0
          ? {
              total_checks: this.policyChecks.total,
              approved: this.policyChecks.approved,
              denied: this.policyChecks.denied,
              escalated: this.policyChecks.escalated,
            }
          : undefined,
      redaction: {
        applied: fullRedaction.redactionCount > 0,
        fields_redacted: fullRedaction.fieldsRedacted,
        redaction_count: fullRedaction.redactionCount,
        config: this.redactionService.getConfig(),
      },
      replay_status: 'not_replayed',
      replay_attempts: 0,
    };

    // Compute checksum if requested
    if (this.config.computeChecksum) {
      bundle.checksum = this.computeChecksum(bundle);
    }

    return bundle;
  }

  /**
   * Compute SHA-256 checksum of bundle
   */
  private computeChecksum(bundle: ForensicBundle): string {
    // Exclude checksum field from hash computation
    const { checksum: _, ...bundleWithoutChecksum } = bundle;
    const content = JSON.stringify(bundleWithoutChecksum, null, 0);
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get current event count
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Get current status
   */
  getStatus(): string {
    return this.status;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new forensic collector
 */
export function createForensicCollector(config: CollectorConfig): ForensicCollector {
  return new ForensicCollector(config);
}

// =============================================================================
// Collector Registry (for accessing collector by run ID)
// =============================================================================

const collectors = new Map<string, ForensicCollector>();

/**
 * Register a collector for a run
 */
export function registerCollector(runId: string, collector: ForensicCollector): void {
  collectors.set(runId, collector);
}

/**
 * Get collector for a run
 */
export function getCollector(runId: string): ForensicCollector | undefined {
  return collectors.get(runId);
}

/**
 * Remove collector for a run
 */
export function removeCollector(runId: string): void {
  collectors.delete(runId);
}

/**
 * Clear all collectors (for testing)
 */
export function clearCollectors(): void {
  collectors.clear();
}
