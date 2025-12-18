/**
 * Phase 27: Forensics Module
 *
 * Exports for the Forensics subsystem:
 * - ForensicBundle schema and types
 * - RedactionService for secrets/PII protection
 * - ForensicCollector for event capture
 *
 * Feature flag: GWI_FORENSICS_ENABLED=1 to enable
 */

// Types and Schema
export {
  // Redaction types
  RedactionField,
  RedactionRule,
  RedactionConfig,

  // Event types
  ForensicEventType,
  ForensicEventBase,
  RunLifecycleEvent,
  StepLifecycleEvent,
  ToolInvocationEvent,
  LLMEvent,
  PolicyEvent,
  ApprovalEvent,
  ErrorEvent,
  ForensicEvent,

  // Replay types
  ReplayStatus,

  // Bundle schema
  ForensicBundleSchema,
  type ForensicBundle,

  // Validation
  validateForensicBundle,
  parseForensicBundle,
  safeParseForensicBundle,
  type ForensicBundleValidationResult,
} from './types.js';

// Redaction
export {
  DEFAULT_REDACTION_RULES,
  DEFAULT_REDACTION_CONFIG,
  RedactionService,
  getRedactionService,
  resetRedactionService,
  type RedactionResult,
  type RedactionStats,
} from './redaction.js';

// Collector
export {
  ForensicCollector,
  createForensicCollector,
  registerCollector,
  getCollector,
  removeCollector,
  clearCollectors,
  type CollectorConfig,
} from './collector.js';

// Replay Engine
export {
  DEFAULT_REPLAY_CONFIG,
  LLMMockProvider,
  ReplayEngine,
  createReplayEngine,
  getReplayEngine,
  resetReplayEngine,
  diffValues,
  createComparisonResult,
  type ReplayMode,
  type ReplayConfig,
  type DiffType,
  type DiffResult,
  type ReplayComparisonResult,
  type ReplayResult,
  type RecordedLLMResponse,
} from './replay.js';

// =============================================================================
// Feature Flag Check
// =============================================================================

/**
 * Check if forensics feature is enabled
 */
export function isForensicsEnabled(): boolean {
  return process.env.GWI_FORENSICS_ENABLED === '1' || process.env.GWI_FORENSICS_ENABLED === 'true';
}
