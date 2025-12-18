/**
 * Approval Commands (Phase 25)
 *
 * CLI commands for approval management using policy-as-code enforcement.
 *
 * Commands:
 *   gwi approval approve <target>    Approve a candidate/run/PR
 *   gwi approval deny <target>       Deny a candidate/run/PR
 *   gwi approval revoke <target>     Revoke existing approval
 *   gwi approval list <target>       List approvals for a target
 *   gwi approval check <target>      Check policy for a target
 *
 * @module @gwi/cli/commands/approval
 */

import chalk from 'chalk';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  generateSigningKeyPair,
  createSignedApproval,
  verifyApprovalSignature,
  computeIntentHash,
  computeApprovalPatchHash,
  checkGate,
  type GateCheckInput,
  type SignedApproval,
  type ApproverIdentity,
  type Phase25ApprovalScope,
  type CreateSignedApproval,
  ARTIFACT_NAMES,
} from '@gwi/core';

// Use Phase25ApprovalScope for the approval scopes type
type ApprovalScope = Phase25ApprovalScope;

// =============================================================================
// Types
// =============================================================================

export interface ApprovalApproveOptions {
  scopes?: string[];
  comment?: string;
  tenant?: string;
  json?: boolean;
  verbose?: boolean;
}

export interface ApprovalDenyOptions {
  reason: string;
  tenant?: string;
  json?: boolean;
  verbose?: boolean;
}

export interface ApprovalRevokeOptions {
  tenant?: string;
  json?: boolean;
  verbose?: boolean;
}

export interface ApprovalListOptions {
  tenant?: string;
  json?: boolean;
  limit?: number;
  verbose?: boolean;
}

export interface ApprovalCheckOptions {
  action?: string;
  scopes?: string[];
  tenant?: string;
  json?: boolean;
  verbose?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get GWI data directory
 */
function getGwiDir(): string {
  return join(process.cwd(), '.gwi');
}

/**
 * Get run directory
 */
function getRunDir(runId: string): string {
  return join(getGwiDir(), 'runs', runId);
}

/**
 * Get approvals directory
 */
function getApprovalsDir(): string {
  return join(getGwiDir(), 'approvals');
}

/**
 * Get signing key path
 */
function getSigningKeyPath(): string {
  return join(getGwiDir(), 'signing-key.json');
}

/**
 * Get or create signing key pair
 */
async function getOrCreateSigningKeyPair() {
  const keyPath = getSigningKeyPath();

  try {
    const content = await readFile(keyPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Generate new key pair
    const keyPair = generateSigningKeyPair();

    // Ensure directory exists
    await mkdir(getGwiDir(), { recursive: true });

    // Save key pair
    await writeFile(keyPath, JSON.stringify(keyPair, null, 2));

    console.log(chalk.dim(`  Generated signing key: ${keyPair.keyId}`));

    return keyPair;
  }
}

/**
 * Get current user identity
 */
function getCurrentApprover(): ApproverIdentity {
  let email = process.env.USER || 'cli-user';
  let name = email;

  try {
    email = execSync('git config user.email', { encoding: 'utf-8' }).trim() || email;
    name = execSync('git config user.name', { encoding: 'utf-8' }).trim() || email;
  } catch {
    // Use defaults
  }

  return {
    type: 'user',
    id: email,
    displayName: name,
    email: email,
    githubUsername: undefined,
    organization: undefined,
  };
}

/**
 * Parse target to determine type and ID
 */
function parseTarget(target: string): { type: 'candidate' | 'run' | 'pr'; id: string } {
  // Check for explicit prefix
  if (target.startsWith('run-') || target.startsWith('run_')) {
    return { type: 'run', id: target.replace(/^run[-_]/, '') };
  }
  if (target.startsWith('candidate-') || target.startsWith('cand-')) {
    return { type: 'candidate', id: target.replace(/^(candidate|cand)[-_]/, '') };
  }
  if (target.startsWith('pr-') || target.startsWith('pr#') || target.startsWith('#')) {
    return { type: 'pr', id: target.replace(/^(pr[-#]|#)/, '') };
  }

  // If it's a number, assume PR
  if (/^\d+$/.test(target)) {
    return { type: 'pr', id: target };
  }

  // Default to run for UUIDs
  if (/^[a-f0-9-]{36}$/i.test(target)) {
    return { type: 'run', id: target };
  }

  // Default to run
  return { type: 'run', id: target };
}

/**
 * Load run context
 */
async function loadRunContext(runId: string) {
  try {
    const path = join(getRunDir(runId), ARTIFACT_NAMES.RUN_CONTEXT);
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Load patch for a run
 */
async function loadPatch(runId: string): Promise<string | null> {
  try {
    const path = join(getRunDir(runId), ARTIFACT_NAMES.PATCH);
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Load plan for a run
 */
async function loadPlan(runId: string): Promise<string | null> {
  try {
    const path = join(getRunDir(runId), ARTIFACT_NAMES.PLAN_JSON);
    const content = await readFile(path, 'utf-8');
    return content;
  } catch {
    return null;
  }
}

/**
 * Save signed approval
 */
async function saveApproval(approval: SignedApproval): Promise<void> {
  const approvalsDir = getApprovalsDir();
  await mkdir(approvalsDir, { recursive: true });

  const filename = `${approval.approvalId}.json`;
  const path = join(approvalsDir, filename);

  await writeFile(path, JSON.stringify(approval, null, 2));
}

/**
 * Load approvals for a target
 */
async function loadApprovalsForTarget(
  targetType: 'candidate' | 'run' | 'pr',
  targetId: string
): Promise<SignedApproval[]> {
  const approvalsDir = getApprovalsDir();

  try {
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(approvalsDir);

    const approvals: SignedApproval[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const content = await readFile(join(approvalsDir, file), 'utf-8');
        const approval = JSON.parse(content) as SignedApproval;

        // Match by target
        const matches =
          approval.targetType === targetType &&
          ((targetType === 'run' && approval.target.runId === targetId) ||
            (targetType === 'candidate' && approval.target.candidateId === targetId) ||
            (targetType === 'pr' && String(approval.target.prNumber) === targetId));

        if (matches) {
          approvals.push(approval);
        }
      } catch {
        // Skip invalid files
      }
    }

    // Sort by creation date, newest first
    return approvals.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    return [];
  }
}

// =============================================================================
// Approve Command
// =============================================================================

export async function approvalApproveCommand(
  target: string,
  options: ApprovalApproveOptions
): Promise<void> {
  const { type: targetType, id: targetId } = parseTarget(target);

  // Validate scopes
  const validScopes: ApprovalScope[] = ['commit', 'push', 'open_pr', 'merge', 'deploy'];
  const scopes: ApprovalScope[] = options.scopes
    ? (options.scopes.filter((s) => validScopes.includes(s as ApprovalScope)) as ApprovalScope[])
    : ['commit', 'push']; // Default scopes

  if (scopes.length === 0) {
    console.error(chalk.red('No valid scopes specified.'));
    console.log(chalk.dim(`Valid scopes: ${validScopes.join(', ')}`));
    process.exit(1);
  }

  // Get approver identity
  const approver = getCurrentApprover();

  // Get signing key
  const keyPair = await getOrCreateSigningKeyPair();

  // Load run context if this is a run
  let intentHash: string | undefined;
  let patchHash: string | undefined;
  let repo: string | undefined;

  if (targetType === 'run') {
    const context = await loadRunContext(targetId);
    if (context) {
      repo = context.repo?.fullName;

      const plan = await loadPlan(targetId);
      if (plan) {
        intentHash = computeIntentHash(plan);
      }

      const patch = await loadPatch(targetId);
      if (patch) {
        patchHash = computeApprovalPatchHash(patch);
      }
    }
  }

  // Build approval input
  const input: CreateSignedApproval = {
    tenantId: options.tenant || 'default',
    approver,
    approverRole: 'DEVELOPER', // Could be enhanced to lookup actual role
    decision: 'approved',
    scopesApproved: scopes,
    targetType,
    target: {
      runId: targetType === 'run' ? targetId : undefined,
      candidateId: targetType === 'candidate' ? targetId : undefined,
      prNumber: targetType === 'pr' ? parseInt(targetId, 10) : undefined,
      repo,
    },
    intentHash: intentHash || 'cli-approval-no-plan', // Required field - use placeholder if no plan
    patchHash,
    source: 'cli',
    comment: options.comment,
  };

  // Create signed approval
  const approval = createSignedApproval(input, keyPair);

  // Verify our own signature (sanity check)
  const verification = verifyApprovalSignature(approval, keyPair.publicKey);
  if (!verification.valid) {
    console.error(chalk.red('Signature verification failed:'), verification.error);
    process.exit(1);
  }

  // Save approval
  await saveApproval(approval);

  // Also save to run directory if applicable
  if (targetType === 'run') {
    const runDir = getRunDir(targetId);
    try {
      await mkdir(runDir, { recursive: true });
      await writeFile(
        join(runDir, 'phase25-approval.json'),
        JSON.stringify(approval, null, 2)
      );
    } catch {
      // Run directory may not exist
    }
  }

  if (options.json) {
    console.log(
      JSON.stringify({
        success: true,
        approvalId: approval.approvalId,
        targetType,
        targetId,
        scopes,
        approver: approver.email,
        signedBy: keyPair.keyId,
        createdAt: approval.createdAt,
      })
    );
    return;
  }

  console.log();
  console.log(chalk.green('  ✓ Approval created'));
  console.log();
  console.log(`    Approval ID: ${chalk.cyan(approval.approvalId)}`);
  console.log(`    Target: ${targetType}-${targetId}`);
  console.log(`    Scopes: ${scopes.join(', ')}`);
  console.log(`    Approved by: ${approver.email}`);
  console.log(`    Signed with: ${keyPair.keyId}`);
  if (options.comment) {
    console.log(`    Comment: "${options.comment}"`);
  }
  console.log();

  if (options.verbose) {
    console.log(chalk.dim('  Signature verified ✓'));
    if (intentHash) console.log(chalk.dim(`  Intent hash: ${intentHash.slice(0, 16)}...`));
    if (patchHash) console.log(chalk.dim(`  Patch hash: ${patchHash.slice(0, 16)}...`));
  }
}

// =============================================================================
// Deny Command
// =============================================================================

export async function approvalDenyCommand(
  target: string,
  options: ApprovalDenyOptions
): Promise<void> {
  if (!options.reason) {
    console.error(chalk.red('--reason is required for deny'));
    process.exit(1);
  }

  const { type: targetType, id: targetId } = parseTarget(target);

  // Get approver identity
  const approver = getCurrentApprover();

  // Get signing key
  const keyPair = await getOrCreateSigningKeyPair();

  // Build denial input
  const input: CreateSignedApproval = {
    tenantId: options.tenant || 'default',
    approver,
    approverRole: 'DEVELOPER',
    decision: 'denied',
    scopesApproved: [], // No scopes for denial
    targetType,
    target: {
      runId: targetType === 'run' ? targetId : undefined,
      candidateId: targetType === 'candidate' ? targetId : undefined,
      prNumber: targetType === 'pr' ? parseInt(targetId, 10) : undefined,
    },
    intentHash: 'cli-denial', // Required field
    source: 'cli',
    reason: options.reason,
  };

  // Create signed denial
  const denial = createSignedApproval(input, keyPair);

  // Save denial
  await saveApproval(denial);

  if (options.json) {
    console.log(
      JSON.stringify({
        success: true,
        approvalId: denial.approvalId,
        decision: 'denied',
        targetType,
        targetId,
        reason: options.reason,
        deniedBy: approver.email,
        createdAt: denial.createdAt,
      })
    );
    return;
  }

  console.log();
  console.log(chalk.red('  ✗ Denied'));
  console.log();
  console.log(`    Denial ID: ${chalk.cyan(denial.approvalId)}`);
  console.log(`    Target: ${targetType}-${targetId}`);
  console.log(`    Reason: ${options.reason}`);
  console.log(`    Denied by: ${approver.email}`);
  console.log();
}

// =============================================================================
// Revoke Command
// =============================================================================

export async function approvalRevokeCommand(
  target: string,
  options: ApprovalRevokeOptions
): Promise<void> {
  const { type: targetType, id: targetId } = parseTarget(target);

  // Get approver identity
  const approver = getCurrentApprover();

  // Get signing key
  const keyPair = await getOrCreateSigningKeyPair();

  // Build revocation input
  const input: CreateSignedApproval = {
    tenantId: options.tenant || 'default',
    approver,
    approverRole: 'DEVELOPER',
    decision: 'revoked',
    scopesApproved: [], // No scopes for revocation
    targetType,
    target: {
      runId: targetType === 'run' ? targetId : undefined,
      candidateId: targetType === 'candidate' ? targetId : undefined,
      prNumber: targetType === 'pr' ? parseInt(targetId, 10) : undefined,
    },
    intentHash: 'cli-revocation', // Required field
    source: 'cli',
    reason: 'Revoked via CLI',
  };

  // Create signed revocation
  const revocation = createSignedApproval(input, keyPair);

  // Save revocation
  await saveApproval(revocation);

  if (options.json) {
    console.log(
      JSON.stringify({
        success: true,
        approvalId: revocation.approvalId,
        decision: 'revoked',
        targetType,
        targetId,
        revokedBy: approver.email,
        createdAt: revocation.createdAt,
      })
    );
    return;
  }

  console.log();
  console.log(chalk.yellow('  ↩ Revoked'));
  console.log();
  console.log(`    Revocation ID: ${chalk.cyan(revocation.approvalId)}`);
  console.log(`    Target: ${targetType}-${targetId}`);
  console.log(`    Revoked by: ${approver.email}`);
  console.log();
}

// =============================================================================
// List Command
// =============================================================================

export async function approvalListCommand(
  target: string,
  options: ApprovalListOptions
): Promise<void> {
  const { type: targetType, id: targetId } = parseTarget(target);

  // Load approvals for target
  const approvals = await loadApprovalsForTarget(targetType, targetId);

  const limit = options.limit || 10;
  const displayedApprovals = approvals.slice(0, limit);

  if (options.json) {
    console.log(
      JSON.stringify({
        target: `${targetType}-${targetId}`,
        count: approvals.length,
        approvals: displayedApprovals.map((a) => ({
          approvalId: a.approvalId,
          decision: a.decision,
          scopes: a.scopesApproved,
          approver: a.approver.email,
          createdAt: a.createdAt,
          reason: a.reason,
        })),
      })
    );
    return;
  }

  console.log();
  console.log(chalk.bold(`Approvals for ${targetType}-${targetId}:`));
  console.log();

  if (approvals.length === 0) {
    console.log(chalk.dim('  No approvals found'));
    console.log();
    return;
  }

  for (const approval of displayedApprovals) {
    const icon =
      approval.decision === 'approved'
        ? chalk.green('✓')
        : approval.decision === 'denied'
          ? chalk.red('✗')
          : chalk.yellow('↩');

    const date = new Date(approval.createdAt).toLocaleString();

    console.log(`  ${icon} ${approval.approvalId.slice(0, 8)}...`);
    console.log(`    Decision: ${approval.decision}`);
    if (approval.scopesApproved.length > 0) {
      console.log(`    Scopes: ${approval.scopesApproved.join(', ')}`);
    }
    console.log(`    By: ${approval.approver.email}`);
    console.log(`    At: ${date}`);
    if (approval.reason) {
      console.log(`    Reason: ${approval.reason}`);
    }
    console.log();
  }

  if (approvals.length > limit) {
    console.log(chalk.dim(`  ... and ${approvals.length - limit} more`));
    console.log();
  }
}

// =============================================================================
// Check Command
// =============================================================================

export async function approvalCheckCommand(
  target: string,
  options: ApprovalCheckOptions
): Promise<void> {
  const { type: targetType, id: targetId } = parseTarget(target);

  // Load approvals for target
  const approvals = await loadApprovalsForTarget(targetType, targetId);

  // Filter to approved decisions only
  const validApprovals = approvals.filter((a) => a.decision === 'approved');

  // Get approver identity for actor
  const actor = getCurrentApprover();

  // Determine action
  const action = options.action || 'candidate.execute';

  // Determine required scopes
  const validScopes: ApprovalScope[] = ['commit', 'push', 'open_pr', 'merge', 'deploy'];
  const requiredScopes: ApprovalScope[] = options.scopes
    ? (options.scopes.filter((s) => validScopes.includes(s as ApprovalScope)) as ApprovalScope[])
    : ['commit'];

  // Build gate check input
  const gateInput: GateCheckInput = {
    tenantId: options.tenant || 'default',
    action: action as GateCheckInput['action'],
    actor: {
      id: actor.id,
      type: 'user',
      role: 'DEVELOPER',
      email: actor.email,
    },
    resource: {
      type: targetType,
      id: targetId,
    },
    approvals: validApprovals,
    requiredScopes,
  };

  // Check gate
  const result = await checkGate(gateInput);

  if (options.json) {
    console.log(
      JSON.stringify({
        allowed: result.allowed,
        decision: result.policyResult.decision,
        policiesEvaluated: result.policyResult.policiesEvaluated,
        reasons: result.policyResult.reasons,
        missingRequirements: result.policyResult.missingRequirements,
      })
    );
    return;
  }

  console.log();
  console.log(chalk.bold(`Policy Check for ${targetType}-${targetId}:`));
  console.log();

  if (result.allowed) {
    console.log(chalk.green('  ✓ ALLOWED'));
  } else {
    console.log(chalk.red(`  ✗ ${result.policyResult.decision}`));
  }

  console.log();
  console.log(`  Action: ${action}`);
  console.log(`  Required scopes: ${requiredScopes.join(', ')}`);
  console.log(`  Valid approvals: ${validApprovals.length}`);
  console.log(`  Policies evaluated: ${result.policyResult.policiesEvaluated}`);
  console.log();

  if (result.policyResult.reasons.length > 0) {
    console.log(chalk.bold('  Reasons:'));
    for (const reason of result.policyResult.reasons) {
      // Determine icon based on overall decision
      const icon = result.allowed ? chalk.green('✓') : chalk.red('✗');
      console.log(`    ${icon} [${reason.policyId}] ${reason.message}`);
      if (reason.resolution && options.verbose) {
        console.log(chalk.dim(`       Resolution: ${reason.resolution}`));
      }
    }
    console.log();
  }

  if (result.policyResult.missingRequirements) {
    const missing = result.policyResult.missingRequirements;
    console.log(chalk.bold('  Missing Requirements:'));
    if (missing.approvalsNeeded > 0) {
      console.log(`    - ${missing.approvalsNeeded} more approval(s) needed`);
    }
    if (missing.missingScopes.length > 0) {
      console.log(`    - Missing scopes: ${missing.missingScopes.join(', ')}`);
    }
    if (missing.requiredRoles && missing.requiredRoles.length > 0) {
      console.log(`    - Required roles: ${missing.requiredRoles.join(' or ')}`);
    }
    console.log();
  }

  if (!result.allowed) {
    console.log(chalk.dim('  Run: gwi approval approve ' + target + ' --scopes ' + requiredScopes.join(',')));
    console.log();
  }
}
