/**
 * Run Bundle Module
 *
 * Provides the run artifact bundle system for GWI workflows.
 * All run artifacts are stored in .gwi/runs/<runId>/.
 *
 * @module @gwi/core/run-bundle
 */

// Types
export {
  // Run States
  RunState,
  STATE_TRANSITIONS,

  // Capabilities
  CapabilitiesMode,

  // Context
  RunContext,
  RepoInfo,
  ModelConfigSummary,

  // Audit
  AuditEntry,
  AuditActor,

  // Approval
  ApprovalRecord,
  ApprovalScope,

  // Artifact names
  ARTIFACT_NAMES,
  type ArtifactName,
} from './types.js';

// State Machine
export {
  isValidTransition,
  validateTransition,
  isTerminalState,
  getNextExpectedState,
  getHappyPath,
  calculateProgress,
  InvalidStateTransitionError,
} from './state-machine.js';

// Artifact Writer
export {
  RUN_BUNDLES_BASE,
  getRunDir,
  getArtifactPath,
  ensureRunDir,
  runExists,
  writeArtifact,
  readArtifact,
  readJsonArtifact,
  artifactExists,
  listArtifacts,
  hashArtifact,
  hashString,
  deleteRunBundle,
  listRuns,
} from './artifact-writer.js';

// Audit Log
export {
  appendAudit,
  readAuditLog,
  getRecentAuditEntries,
  getAuditEntriesByActor,
  getAuditEntriesByAction,
  auditStateTransition,
  auditArtifactWritten,
  auditRunCreated,
  auditError,
  auditApprovalGranted,
  auditSchemaValidationFailed,
} from './audit-log.js';

// Run Context
export {
  createRun,
  loadRunContext,
  transitionState,
  failRun,
  abortRun,
  updateModels,
  type CreateRunOptions,
} from './run-context.js';
