/**
 * Run Command
 *
 * Manage and inspect run artifacts.
 * Shows run state, complexity scores, and approval status.
 *
 * Usage:
 *   gwi run status <run-id>   Show run status
 *   gwi run list              List recent runs
 *   gwi run approve <run-id>  Approve run for commit/push
 */

import chalk from 'chalk';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  RunContext,
  ApprovalRecord,
  ARTIFACT_NAMES,
  computePatchHash,
  createApprovalFromPatch,
  checkApproval,
  // Import schema-based types (these have full definitions)
  type TriageResult,
  type PlanResult,
} from '@gwi/core';
import type { OperationRequest } from '@gwi/core';

// Review result interface for run artifacts (matches schema)
interface ReviewResult {
  version: 1;
  timestamp: string;
  approved: boolean;
  confidence: number;
  summary: string;
  findings: Array<{
    id: string;
    type: string;
    severity: string;
    message: string;
  }>;
  securityIssues: Array<{
    id: string;
    severity: string;
    description: string;
  }>;
}

// =============================================================================
// Types
// =============================================================================

export interface RunStatusOptions {
  json?: boolean;
  verbose?: boolean;
}

export interface RunListOptions {
  json?: boolean;
  limit?: number;
}

export interface RunApproveOptions {
  scope?: string[];
  comment?: string;
  json?: boolean;
}

// =============================================================================
// Run Directory Utilities
// =============================================================================

/**
 * Get the runs directory
 */
function getRunsDir(): string {
  return join(process.cwd(), '.gwi', 'runs');
}

/**
 * Get a run's directory
 */
function getRunDir(runId: string): string {
  return join(getRunsDir(), runId);
}

/**
 * Read a JSON artifact from a run
 */
async function readArtifact<T>(runId: string, filename: string): Promise<T | null> {
  try {
    const path = join(getRunDir(runId), filename);
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Read patch.diff content
 */
async function readPatch(runId: string): Promise<string | null> {
  try {
    const path = join(getRunDir(runId), ARTIFACT_NAMES.PATCH);
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * List all run IDs in the runs directory
 */
async function listRunIds(limit = 20): Promise<string[]> {
  try {
    const runsDir = getRunsDir();
    const entries = await readdir(runsDir);

    // Get stats for each entry
    const runStats = await Promise.all(
      entries.map(async (entry) => {
        try {
          const entryPath = join(runsDir, entry);
          const stats = await stat(entryPath);
          if (stats.isDirectory()) {
            return { id: entry, mtime: stats.mtime };
          }
        } catch {
          return null;
        }
        return null;
      })
    );

    // Filter, sort by mtime desc, and limit
    return runStats
      .filter((r): r is { id: string; mtime: Date } => r !== null)
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
      .slice(0, limit)
      .map((r) => r.id);
  } catch {
    return [];
  }
}

// =============================================================================
// Status Command
// =============================================================================

export async function runStatusCommand(
  runId: string,
  options: RunStatusOptions
): Promise<void> {
  // Load run context
  const context = await readArtifact<ReturnType<typeof RunContext.parse>>(
    runId,
    ARTIFACT_NAMES.RUN_CONTEXT
  );

  if (!context) {
    console.error(chalk.red(`Run not found: ${runId}`));
    console.log(chalk.dim(`Expected at: ${getRunDir(runId)}`));
    process.exit(1);
  }

  // Load other artifacts
  const triage = await readArtifact<TriageResult>(runId, ARTIFACT_NAMES.TRIAGE);
  const plan = await readArtifact<PlanResult>(runId, ARTIFACT_NAMES.PLAN_JSON);
  const review = await readArtifact<ReviewResult>(runId, ARTIFACT_NAMES.REVIEW);
  const approval = await readArtifact<ApprovalRecord>(runId, ARTIFACT_NAMES.APPROVAL);
  const patch = await readPatch(runId);

  // Check approval status
  const patchHash = patch ? computePatchHash(patch) : undefined;

  if (options.json) {
    console.log(JSON.stringify({
      runId,
      state: context.state,
      repo: context.repo,
      prUrl: context.prUrl,
      issueUrl: context.issueUrl,
      createdAt: context.createdAt,
      updatedAt: context.updatedAt,
      capabilitiesMode: context.capabilitiesMode,
      triage: triage ? {
        finalScore: triage.finalScore,
        routeDecision: triage.routeDecision,
        baselineReasons: triage.baselineReasons,
        llmReasons: triage.llmReasons,
      } : null,
      plan: plan ? {
        stepCount: plan.steps.length,
        risks: plan.risks.map((r) => ({ severity: r.severity, description: r.description })),
      } : null,
      review: review ? {
        approved: review.approved,
        findingCount: review.findings.length,
        securityIssueCount: review.securityIssues.length,
      } : null,
      approval: approval ? {
        scope: approval.scope,
        approvedBy: approval.approvedBy,
        approvedAt: approval.approvedAt,
      } : null,
      patchHash,
    }, null, 2));
    return;
  }

  // Pretty print
  console.log();
  console.log(chalk.bold(`Run: ${runId}`));
  console.log();

  // State
  const stateIcon = getStateIcon(context.state);
  console.log(`  ${stateIcon} State: ${formatState(context.state)}`);
  console.log(`    Repo: ${context.repo.fullName}`);
  if (context.prUrl) console.log(`    PR: ${context.prUrl}`);
  if (context.issueUrl) console.log(`    Issue: ${context.issueUrl}`);
  console.log(`    Mode: ${context.capabilitiesMode}`);
  console.log(`    Created: ${new Date(context.createdAt).toLocaleString()}`);
  console.log();

  // Triage
  if (triage) {
    const complexityColor = triage.finalScore <= 3 ? chalk.green :
      triage.finalScore <= 6 ? chalk.yellow : chalk.red;
    console.log(chalk.bold('  Triage:'));
    console.log(`    Complexity: ${complexityColor(`${triage.finalScore}/10`)}`);
    console.log(`    Route: ${formatRoute(triage.routeDecision)}`);
    const allReasons = [...triage.baselineReasons, ...triage.llmReasons];
    if (options.verbose && allReasons.length > 0) {
      console.log(`    Reasons: ${allReasons.join(', ')}`);
    }
    console.log();
  }

  // Plan
  if (plan) {
    console.log(chalk.bold('  Plan:'));
    console.log(`    Steps: ${plan.steps.length}`);
    if (plan.risks.length > 0) {
      console.log(`    Risks: ${plan.risks.map((r) => r.severity).join(', ')}`);
    }
    if (options.verbose) {
      for (const step of plan.steps) {
        console.log(`      ${step.order}. ${step.name}: ${step.description}`);
      }
    }
    console.log();
  }

  // Patch
  if (patch) {
    console.log(chalk.bold('  Patch:'));
    console.log(`    Size: ${patch.length} bytes`);
    console.log(`    Hash: ${patchHash?.slice(0, 16)}...`);
    console.log();
  }

  // Review
  if (review) {
    const verdictColor = review.approved ? chalk.green : chalk.red;
    const verdictText = review.approved ? 'Approved' : 'Changes Requested';
    console.log(chalk.bold('  Review:'));
    console.log(`    Verdict: ${verdictColor(verdictText)}`);
    if (review.findings.length > 0) {
      console.log(`    Findings: ${review.findings.length}`);
      if (options.verbose) {
        for (const finding of review.findings.slice(0, 5)) {
          console.log(`      - ${finding.severity}: ${finding.message}`);
        }
      }
    }
    if (review.securityIssues.length > 0) {
      console.log(chalk.red(`    Security Issues: ${review.securityIssues.length}`));
    }
    console.log();
  }

  // Approval
  if (approval) {
    console.log(chalk.bold('  Approval:'));
    console.log(chalk.green(`    ✓ Approved by: ${approval.approvedBy}`));
    console.log(`    Scope: ${approval.scope.join(', ')}`);
    console.log(`    At: ${new Date(approval.approvedAt).toLocaleString()}`);
    if (approval.comment) {
      console.log(`    Comment: "${approval.comment}"`);
    }
    console.log();
  } else if (context.state === 'awaiting_approval') {
    console.log(chalk.bold('  Approval:'));
    console.log(chalk.yellow(`    ⏳ Awaiting approval`));
    console.log(chalk.dim(`    Run: gwi run approve ${runId}`));
    console.log();
  }

  // Next steps based on state
  if (context.state === 'awaiting_approval') {
    console.log(chalk.dim('  Next steps:'));
    console.log(chalk.dim(`    gwi run approve ${runId}    # Approve commit/push`));
    console.log(chalk.dim(`    gwi run reject ${runId}     # Abort the run`));
  }
}

// =============================================================================
// List Command
// =============================================================================

export async function runListCommand(options: RunListOptions): Promise<void> {
  const runIds = await listRunIds(options.limit ?? 10);

  if (runIds.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ runs: [] }));
    } else {
      console.log(chalk.dim('No runs found in .gwi/runs/'));
    }
    return;
  }

  // Load run contexts
  const runs = await Promise.all(
    runIds.map(async (id) => {
      const context = await readArtifact<ReturnType<typeof RunContext.parse>>(
        id,
        ARTIFACT_NAMES.RUN_CONTEXT
      );
      return context ? { id, ...context } : null;
    })
  );

  const validRuns = runs.filter((r): r is NonNullable<typeof r> => r !== null);

  if (options.json) {
    console.log(JSON.stringify({
      runs: validRuns.map((r) => ({
        runId: r.id,
        state: r.state,
        repo: r.repo.fullName,
        prUrl: r.prUrl,
        issueUrl: r.issueUrl,
        createdAt: r.createdAt,
        capabilitiesMode: r.capabilitiesMode,
      })),
    }, null, 2));
    return;
  }

  console.log();
  console.log(chalk.bold('Recent Runs:'));
  console.log();

  for (const run of validRuns) {
    const stateIcon = getStateIcon(run.state);
    const target = run.prUrl || run.issueUrl || run.repo.fullName;
    console.log(`  ${stateIcon} ${run.id.slice(0, 8)}... | ${formatState(run.state).padEnd(18)} | ${target}`);
  }

  console.log();
  console.log(chalk.dim(`  gwi run status <run-id> for details`));
}

// =============================================================================
// Approve Command
// =============================================================================

export async function runApproveCommand(
  runId: string,
  options: RunApproveOptions
): Promise<void> {
  // Load run context
  const context = await readArtifact<ReturnType<typeof RunContext.parse>>(
    runId,
    ARTIFACT_NAMES.RUN_CONTEXT
  );

  if (!context) {
    console.error(chalk.red(`Run not found: ${runId}`));
    process.exit(1);
  }

  if (context.state !== 'awaiting_approval') {
    console.error(chalk.red(`Run is not awaiting approval. Current state: ${context.state}`));
    process.exit(1);
  }

  // Load patch
  const patch = await readPatch(runId);
  if (!patch) {
    console.error(chalk.red('No patch.diff found for this run'));
    process.exit(1);
  }

  // Determine scope
  const scope = options.scope ?? ['commit', 'push'];
  const validScopes = ['commit', 'push', 'open_pr', 'merge'];
  for (const s of scope) {
    if (!validScopes.includes(s)) {
      console.error(chalk.red(`Invalid scope: ${s}. Valid: ${validScopes.join(', ')}`));
      process.exit(1);
    }
  }

  // Get approver (from git config or env)
  let approvedBy = process.env.USER || 'cli-user';
  try {
    const { execSync } = await import('child_process');
    const gitEmail = execSync('git config user.email', { encoding: 'utf-8' }).trim();
    if (gitEmail) approvedBy = gitEmail;
  } catch {
    // Use default
  }

  // Create approval
  const approval = createApprovalFromPatch(
    runId,
    approvedBy,
    scope as ('commit' | 'push' | 'open_pr' | 'merge')[],
    patch,
    options.comment
  );

  // Verify approval would work
  const request: OperationRequest = {
    runId,
    operation: 'git_commit',
    targetRepo: { owner: context.repo.owner, name: context.repo.name },
    description: 'Verify approval',
  };

  const check = checkApproval(request, approval, patch);
  if (!check.approved) {
    console.error(chalk.red(`Approval verification failed: ${check.reason}`));
    process.exit(1);
  }

  // Write approval to file
  const { writeFile, mkdir } = await import('node:fs/promises');
  const approvalPath = join(getRunDir(runId), ARTIFACT_NAMES.APPROVAL);
  await mkdir(getRunDir(runId), { recursive: true });
  await writeFile(approvalPath, JSON.stringify(approval, null, 2));

  if (options.json) {
    console.log(JSON.stringify({ approved: true, approval }));
  } else {
    console.log();
    console.log(chalk.green('  ✓ Run approved'));
    console.log();
    console.log(`    Run ID: ${runId}`);
    console.log(`    Approved by: ${approvedBy}`);
    console.log(`    Scope: ${scope.join(', ')}`);
    console.log(`    Patch hash: ${approval.patchHash.slice(0, 16)}...`);
    if (options.comment) {
      console.log(`    Comment: "${options.comment}"`);
    }
    console.log();
  }
}

// =============================================================================
// Helpers
// =============================================================================

function getStateIcon(state: string): string {
  switch (state) {
    case 'queued': return chalk.dim('○');
    case 'triaged': return chalk.blue('●');
    case 'planned': return chalk.blue('●');
    case 'resolving': return chalk.yellow('●');
    case 'review': return chalk.yellow('●');
    case 'awaiting_approval': return chalk.yellow('⏳');
    case 'applying': return chalk.cyan('●');
    case 'done': return chalk.green('✓');
    case 'aborted': return chalk.dim('○');
    case 'failed': return chalk.red('✗');
    default: return chalk.dim('?');
  }
}

function formatState(state: string): string {
  switch (state) {
    case 'queued': return chalk.dim('Queued');
    case 'triaged': return chalk.blue('Triaged');
    case 'planned': return chalk.blue('Planned');
    case 'resolving': return chalk.yellow('Resolving');
    case 'review': return chalk.yellow('Under Review');
    case 'awaiting_approval': return chalk.yellow('Awaiting Approval');
    case 'applying': return chalk.cyan('Applying');
    case 'done': return chalk.green('Done');
    case 'aborted': return chalk.dim('Aborted');
    case 'failed': return chalk.red('Failed');
    default: return state;
  }
}

function formatRoute(route: string): string {
  switch (route) {
    case 'auto': return chalk.green('Auto-resolve');
    case 'agent': return chalk.yellow('Agent-resolve');
    case 'human': return chalk.red('Human required');
    default: return route;
  }
}
