/**
 * A2A Protocol Types for Git With Intent
 *
 * Defines the Agent-to-Agent communication protocol used by Vertex AI Agent Engine.
 * All inter-agent communication must use these types.
 */

import type { AgentId, ModelConfig } from '../types.js';

// Export SWE Pipeline contracts (EPIC 024)
export * from './contracts.js';

/**
 * Message types for A2A communication
 */
export type MessageType =
  | 'task_request' // Request another agent to do something
  | 'task_response' // Response to a task request
  | 'status_update' // Broadcast current status
  | 'escalation' // Escalate to human
  | 'claim_work' // Claim a piece of work (via Agent Mail)
  | 'release_work' // Release claimed work
  | 'query' // Ask another agent for information
  | 'notification'; // FYI, no response expected

/**
 * Message priority levels
 */
export type MessagePriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Base A2A message structure
 */
export interface A2AMessage<TPayload = unknown> {
  /** Unique message identifier */
  id: string;
  /** Sending agent SPIFFE ID */
  from: AgentId;
  /** Receiving agent or orchestrator */
  to: AgentId | 'orchestrator';
  /** Message type */
  type: MessageType;
  /** Message payload */
  payload: TPayload;
  /** Unix timestamp (ms) */
  timestamp: number;
  /** For request/response correlation */
  correlationId?: string;
  /** Message priority */
  priority: MessagePriority;
  /** Trace ID for distributed tracing */
  traceId?: string;
}

/**
 * Task request payload
 */
export interface TaskRequestPayload {
  /** Task type identifier */
  taskType: string;
  /** Task-specific input data */
  input: unknown;
  /** Deadline timestamp (optional) */
  deadline?: number;
  /** Context from previous steps */
  context?: Record<string, unknown>;
}

/**
 * Task response payload
 */
export interface TaskResponsePayload {
  /** Whether the task succeeded */
  success: boolean;
  /** Task output data */
  output: unknown;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Model used for this task */
  modelUsed?: ModelConfig;
  /** Token consumption */
  tokensUsed?: {
    input: number;
    output: number;
  };
}

/**
 * Escalation payload for human handoff
 */
export interface EscalationPayload {
  /** Reason for escalation */
  reason: string;
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Context for the human */
  context: Record<string, unknown>;
  /** Suggested actions */
  suggestedActions?: string[];
  /** Time limit before auto-timeout */
  timeoutMs?: number;
}

/**
 * Status update payload
 */
export interface StatusUpdatePayload {
  /** Current status */
  status: 'idle' | 'working' | 'blocked' | 'error';
  /** Current task being worked on */
  currentTask?: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Status message */
  message?: string;
}

/**
 * Work claim payload (for Agent Mail coordination)
 */
export interface ClaimWorkPayload {
  /** Work item identifier */
  workId: string;
  /** Expected duration in seconds */
  expectedDurationSec: number;
}

/**
 * Agent Card for service discovery
 */
export interface AgentCard {
  /** Agent SPIFFE ID */
  id: AgentId;
  /** Human-readable name */
  name: string;
  /** Agent description */
  description: string;
  /** Supported task types */
  capabilities: string[];
  /** Default model configuration */
  defaultModel: ModelConfig;
  /** Agent version */
  version: string;
  /** Health endpoint URL */
  healthEndpoint?: string;
}

/**
 * Create a new A2A message
 */
export function createMessage<TPayload>(
  params: Omit<A2AMessage<TPayload>, 'id' | 'timestamp'>
): A2AMessage<TPayload> {
  return {
    ...params,
    id: generateMessageId(),
    timestamp: Date.now(),
  };
}

/**
 * Create a task request message
 */
export function createTaskRequest(
  from: AgentId,
  to: AgentId,
  taskType: string,
  input: unknown,
  options?: {
    priority?: MessagePriority;
    deadline?: number;
    context?: Record<string, unknown>;
    traceId?: string;
  }
): A2AMessage<TaskRequestPayload> {
  return createMessage({
    from,
    to,
    type: 'task_request',
    priority: options?.priority ?? 'normal',
    traceId: options?.traceId,
    payload: {
      taskType,
      input,
      deadline: options?.deadline,
      context: options?.context,
    },
  });
}

/**
 * Create a task response message
 */
export function createTaskResponse(
  from: AgentId,
  to: AgentId,
  correlationId: string,
  success: boolean,
  output: unknown,
  options?: {
    error?: string;
    durationMs?: number;
    modelUsed?: ModelConfig;
    tokensUsed?: { input: number; output: number };
  }
): A2AMessage<TaskResponsePayload> {
  return createMessage({
    from,
    to,
    type: 'task_response',
    priority: 'normal',
    correlationId,
    payload: {
      success,
      output,
      error: options?.error,
      durationMs: options?.durationMs ?? 0,
      modelUsed: options?.modelUsed,
      tokensUsed: options?.tokensUsed,
    },
  });
}

/**
 * Create an escalation message
 */
export function createEscalation(
  from: AgentId,
  reason: string,
  severity: EscalationPayload['severity'],
  context: Record<string, unknown>,
  options?: {
    suggestedActions?: string[];
    timeoutMs?: number;
    traceId?: string;
  }
): A2AMessage<EscalationPayload> {
  return createMessage({
    from,
    to: 'orchestrator',
    type: 'escalation',
    priority: severity === 'critical' ? 'critical' : 'high',
    traceId: options?.traceId,
    payload: {
      reason,
      severity,
      context,
      suggestedActions: options?.suggestedActions,
      timeoutMs: options?.timeoutMs,
    },
  });
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Validate an A2A message structure
 */
export function isValidMessage(msg: unknown): msg is A2AMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.from === 'string' &&
    (typeof m.to === 'string' || m.to === 'orchestrator') &&
    typeof m.type === 'string' &&
    typeof m.timestamp === 'number' &&
    m.payload !== undefined
  );
}
