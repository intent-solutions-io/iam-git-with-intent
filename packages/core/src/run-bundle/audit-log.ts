/**
 * Audit Log
 *
 * Append-only audit trail for run events.
 * Each entry is a JSON line in audit.log.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { ARTIFACT_NAMES, type AuditEntry, type AuditActor, AuditEntry as AuditEntrySchema } from './types.js';
import { getRunDir, ensureRunDir } from './artifact-writer.js';

/**
 * Append an audit entry to the run's audit log
 *
 * @param runId - The run ID
 * @param entry - The audit entry to append (without timestamp/runId, which are auto-filled)
 * @param basePath - Base directory (defaults to cwd)
 */
export async function appendAudit(
  runId: string,
  entry: Omit<AuditEntry, 'timestamp' | 'runId'>,
  basePath: string = process.cwd()
): Promise<void> {
  // Ensure run directory exists
  await ensureRunDir(runId, basePath);

  const auditPath = join(getRunDir(runId, basePath), ARTIFACT_NAMES.AUDIT_LOG);

  const fullEntry: AuditEntry = {
    timestamp: new Date().toISOString(),
    runId,
    ...entry,
  };

  // Validate entry against schema
  AuditEntrySchema.parse(fullEntry);

  // Append as JSON line
  const line = JSON.stringify(fullEntry) + '\n';
  await fs.appendFile(auditPath, line, 'utf-8');
}

/**
 * Read all audit entries for a run
 *
 * @param runId - The run ID
 * @param basePath - Base directory (defaults to cwd)
 * @returns Array of audit entries, or empty array if no log exists
 */
export async function readAuditLog(
  runId: string,
  basePath: string = process.cwd()
): Promise<AuditEntry[]> {
  const auditPath = join(getRunDir(runId, basePath), ARTIFACT_NAMES.AUDIT_LOG);

  try {
    const content = await fs.readFile(auditPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    return lines.map(line => {
      const entry = JSON.parse(line);
      return AuditEntrySchema.parse(entry);
    });
  } catch {
    return [];
  }
}

/**
 * Get the last N audit entries for a run
 */
export async function getRecentAuditEntries(
  runId: string,
  count: number = 10,
  basePath: string = process.cwd()
): Promise<AuditEntry[]> {
  const entries = await readAuditLog(runId, basePath);
  return entries.slice(-count);
}

/**
 * Filter audit entries by actor type
 */
export async function getAuditEntriesByActor(
  runId: string,
  actor: AuditActor,
  basePath: string = process.cwd()
): Promise<AuditEntry[]> {
  const entries = await readAuditLog(runId, basePath);
  return entries.filter(e => e.actor === actor);
}

/**
 * Filter audit entries by action
 */
export async function getAuditEntriesByAction(
  runId: string,
  action: string,
  basePath: string = process.cwd()
): Promise<AuditEntry[]> {
  const entries = await readAuditLog(runId, basePath);
  return entries.filter(e => e.action === action);
}

// =============================================================================
// Convenience functions for common audit events
// =============================================================================

/**
 * Log a state transition
 */
export async function auditStateTransition(
  runId: string,
  fromState: string,
  toState: string,
  basePath: string = process.cwd()
): Promise<void> {
  await appendAudit(runId, {
    actor: 'system',
    actorId: 'state-machine',
    action: 'state_transition',
    details: { fromState, toState },
  }, basePath);
}

/**
 * Log an artifact being written
 */
export async function auditArtifactWritten(
  runId: string,
  artifactName: string,
  agentId?: string,
  basePath: string = process.cwd()
): Promise<void> {
  await appendAudit(runId, {
    actor: agentId ? 'agent' : 'system',
    actorId: agentId ?? 'artifact-writer',
    action: 'artifact_written',
    details: { artifactName },
  }, basePath);
}

/**
 * Log a run being created
 */
export async function auditRunCreated(
  runId: string,
  initiator: string,
  basePath: string = process.cwd()
): Promise<void> {
  await appendAudit(runId, {
    actor: 'user',
    actorId: initiator,
    action: 'run_created',
    details: {},
  }, basePath);
}

/**
 * Log an error
 */
export async function auditError(
  runId: string,
  error: string,
  details?: Record<string, unknown>,
  basePath: string = process.cwd()
): Promise<void> {
  await appendAudit(runId, {
    actor: 'system',
    actorId: 'error-handler',
    action: 'error',
    details: { error, ...details },
  }, basePath);
}

/**
 * Log approval granted
 */
export async function auditApprovalGranted(
  runId: string,
  approvedBy: string,
  scope: string[],
  basePath: string = process.cwd()
): Promise<void> {
  await appendAudit(runId, {
    actor: 'user',
    actorId: approvedBy,
    action: 'approval_granted',
    details: { scope },
  }, basePath);
}

/**
 * Log a schema validation failure
 */
export async function auditSchemaValidationFailed(
  runId: string,
  schemaName: string,
  errors: unknown,
  basePath: string = process.cwd()
): Promise<void> {
  await appendAudit(runId, {
    actor: 'system',
    actorId: 'schema-validator',
    action: 'schema_validation_failed',
    details: { schemaName, errors },
  }, basePath);
}
