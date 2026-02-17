/**
 * Approval Loader
 *
 * Loads Phase 25 signed approvals from the `.gwi/approvals/` directory,
 * filtering by run ID and decision. Provides a bridge between the
 * file-based approval CLI flow and the autopilot executor.
 *
 * @module @gwi/engine/run/approval-loader
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import {
  SignedApprovalSchema,
  type SignedApproval,
  type Phase25ApprovalScope as ApprovalScope,
  getLogger,
} from '@gwi/core';

const logger = getLogger('approval-loader');

/**
 * Default approvals directory (relative to repo root)
 */
const APPROVALS_DIR = '.gwi/approvals';

/**
 * Load signed approvals for a specific run from the approvals directory.
 *
 * Scans `.gwi/approvals/` for JSON files, parses each with the SignedApproval
 * Zod schema, and filters to approvals matching the given run ID with
 * `decision === 'approved'`.
 *
 * Gracefully handles:
 * - Missing `.gwi/approvals/` directory (returns empty array)
 * - Malformed JSON files (skips with warning)
 * - Files that don't match the SignedApproval schema (skips with warning)
 */
export async function loadSignedApprovalsForRun(
  runId: string,
  repoRoot?: string,
): Promise<SignedApproval[]> {
  const approvalsPath = join(repoRoot ?? process.cwd(), APPROVALS_DIR);
  const approvals: SignedApproval[] = [];

  let files: string[];
  try {
    files = await readdir(approvalsPath);
  } catch {
    // Directory doesn't exist — no approvals available
    logger.debug('Approvals directory not found, no approvals loaded', {
      path: approvalsPath,
      runId,
    });
    return [];
  }

  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  for (const file of jsonFiles) {
    try {
      const content = await readFile(join(approvalsPath, file), 'utf-8');
      const parsed = JSON.parse(content);
      const result = SignedApprovalSchema.safeParse(parsed);

      if (!result.success) {
        logger.warn('Skipping invalid approval file', {
          file,
          errors: result.error.issues.map((i) => i.message),
        });
        continue;
      }

      const approval = result.data;

      // Filter: must match run ID and be an approved decision
      if (approval.target.runId === runId && approval.decision === 'approved') {
        approvals.push(approval);
      }
    } catch (error) {
      logger.warn('Failed to read approval file', {
        file,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.debug('Loaded approvals for run', {
    runId,
    total: jsonFiles.length,
    matched: approvals.length,
  });

  return approvals;
}

/**
 * Check if a set of required scopes are covered by loaded approvals.
 *
 * @returns Object with `covered` boolean and `missing` scopes array
 */
export function checkApprovalCoverage(
  approvals: SignedApproval[],
  requiredScopes: ApprovalScope[],
): { covered: boolean; missing: ApprovalScope[] } {
  const approvedScopes = new Set<ApprovalScope>();

  for (const approval of approvals) {
    for (const scope of approval.scopesApproved) {
      approvedScopes.add(scope);
    }
  }

  const missing = requiredScopes.filter((s) => !approvedScopes.has(s));

  return {
    covered: missing.length === 0,
    missing,
  };
}
