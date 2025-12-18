/**
 * Run Context
 *
 * Creates and manages RunContext objects for run bundles.
 */

import { randomUUID } from 'crypto';
import {
  type RunContext,
  type RunState,
  type CapabilitiesMode,
  type RepoInfo,
  type ModelConfigSummary,
  RunContext as RunContextSchema,
  ARTIFACT_NAMES,
} from './types.js';
import { validateTransition } from './state-machine.js';
import { writeArtifact, readJsonArtifact, ensureRunDir } from './artifact-writer.js';
import { auditRunCreated, auditStateTransition, auditError } from './audit-log.js';

/**
 * Options for creating a new run
 */
export interface CreateRunOptions {
  repo: RepoInfo;
  initiator: string;
  capabilitiesMode?: CapabilitiesMode;
  prUrl?: string;
  issueUrl?: string;
  baseRef?: string;
  headRef?: string;
  models?: Partial<ModelConfigSummary>;
}

/**
 * Default model configuration
 */
const DEFAULT_MODELS: ModelConfigSummary = {
  triage: 'gemini-2.0-flash-exp',
  resolver: 'claude-sonnet-4-20250514',
  reviewer: 'claude-sonnet-4-20250514',
};

/**
 * Create a new run and write the initial run.json
 *
 * @param options - Run creation options
 * @param basePath - Base directory for the run bundle
 * @returns The created RunContext
 */
export async function createRun(
  options: CreateRunOptions,
  basePath: string = process.cwd()
): Promise<RunContext> {
  const runId = randomUUID();
  const now = new Date().toISOString();

  const context: RunContext = {
    runId,
    version: 1,
    createdAt: now,
    updatedAt: now,
    repo: options.repo,
    prUrl: options.prUrl,
    issueUrl: options.issueUrl,
    baseRef: options.baseRef,
    headRef: options.headRef,
    initiator: options.initiator,
    models: {
      ...DEFAULT_MODELS,
      ...options.models,
    },
    capabilitiesMode: options.capabilitiesMode ?? 'patch-only',
    state: 'queued',
    previousStates: [],
  };

  // Validate against schema
  RunContextSchema.parse(context);

  // Ensure directory exists and write run.json
  await ensureRunDir(runId, basePath);
  await writeArtifact(runId, ARTIFACT_NAMES.RUN_CONTEXT, context, basePath);

  // Log creation in audit log
  await auditRunCreated(runId, options.initiator, basePath);

  return context;
}

/**
 * Load a RunContext from disk
 *
 * @param runId - The run ID
 * @param basePath - Base directory for the run bundle
 * @returns The RunContext, or null if not found
 */
export async function loadRunContext(
  runId: string,
  basePath: string = process.cwd()
): Promise<RunContext | null> {
  const raw = await readJsonArtifact<RunContext>(runId, ARTIFACT_NAMES.RUN_CONTEXT, basePath);
  if (!raw) return null;

  // Validate against schema
  try {
    return RunContextSchema.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Update the run state with proper transition validation
 *
 * @param runId - The run ID
 * @param newState - The new state to transition to
 * @param basePath - Base directory for the run bundle
 * @returns The updated RunContext
 * @throws InvalidStateTransitionError if transition is invalid
 */
export async function transitionState(
  runId: string,
  newState: RunState,
  basePath: string = process.cwd()
): Promise<RunContext> {
  const context = await loadRunContext(runId, basePath);
  if (!context) {
    throw new Error(`Run not found: ${runId}`);
  }

  const oldState = context.state;

  // Validate transition
  validateTransition(oldState, newState, runId);

  // Update context
  const now = new Date().toISOString();
  const updatedContext: RunContext = {
    ...context,
    state: newState,
    updatedAt: now,
    previousStates: [
      ...context.previousStates,
      { state: oldState, timestamp: context.updatedAt },
    ],
  };

  // Validate and write
  RunContextSchema.parse(updatedContext);
  await writeArtifact(runId, ARTIFACT_NAMES.RUN_CONTEXT, updatedContext, basePath);

  // Log state transition
  await auditStateTransition(runId, oldState, newState, basePath);

  return updatedContext;
}

/**
 * Mark a run as failed with an error message
 *
 * @param runId - The run ID
 * @param error - Error message
 * @param errorDetails - Additional error details
 * @param basePath - Base directory for the run bundle
 * @returns The updated RunContext
 */
export async function failRun(
  runId: string,
  error: string,
  errorDetails?: unknown,
  basePath: string = process.cwd()
): Promise<RunContext> {
  const context = await loadRunContext(runId, basePath);
  if (!context) {
    throw new Error(`Run not found: ${runId}`);
  }

  const oldState = context.state;

  // Only transition if not already terminal
  if (oldState !== 'failed' && oldState !== 'aborted' && oldState !== 'done') {
    // Log error first
    await auditError(runId, error, errorDetails as Record<string, unknown>, basePath);

    // Update context
    const now = new Date().toISOString();
    const updatedContext: RunContext = {
      ...context,
      state: 'failed',
      updatedAt: now,
      error,
      errorDetails,
      previousStates: [
        ...context.previousStates,
        { state: oldState, timestamp: context.updatedAt },
      ],
    };

    RunContextSchema.parse(updatedContext);
    await writeArtifact(runId, ARTIFACT_NAMES.RUN_CONTEXT, updatedContext, basePath);
    await auditStateTransition(runId, oldState, 'failed', basePath);

    return updatedContext;
  }

  return context;
}

/**
 * Abort a run
 *
 * @param runId - The run ID
 * @param reason - Abort reason (optional)
 * @param basePath - Base directory for the run bundle
 * @returns The updated RunContext
 */
export async function abortRun(
  runId: string,
  reason?: string,
  basePath: string = process.cwd()
): Promise<RunContext> {
  const context = await loadRunContext(runId, basePath);
  if (!context) {
    throw new Error(`Run not found: ${runId}`);
  }

  const oldState = context.state;

  // Only transition if not already terminal
  if (oldState !== 'failed' && oldState !== 'aborted' && oldState !== 'done') {
    const now = new Date().toISOString();
    const updatedContext: RunContext = {
      ...context,
      state: 'aborted',
      updatedAt: now,
      error: reason,
      previousStates: [
        ...context.previousStates,
        { state: oldState, timestamp: context.updatedAt },
      ],
    };

    RunContextSchema.parse(updatedContext);
    await writeArtifact(runId, ARTIFACT_NAMES.RUN_CONTEXT, updatedContext, basePath);
    await auditStateTransition(runId, oldState, 'aborted', basePath);

    return updatedContext;
  }

  return context;
}

/**
 * Update models configuration
 */
export async function updateModels(
  runId: string,
  models: Partial<ModelConfigSummary>,
  basePath: string = process.cwd()
): Promise<RunContext> {
  const context = await loadRunContext(runId, basePath);
  if (!context) {
    throw new Error(`Run not found: ${runId}`);
  }

  const now = new Date().toISOString();
  const updatedContext: RunContext = {
    ...context,
    updatedAt: now,
    models: {
      ...context.models,
      ...models,
    },
  };

  RunContextSchema.parse(updatedContext);
  await writeArtifact(runId, ARTIFACT_NAMES.RUN_CONTEXT, updatedContext, basePath);

  return updatedContext;
}
