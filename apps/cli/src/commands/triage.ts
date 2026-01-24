/**
 * gwi triage command
 *
 * Analyze PR or local change complexity.
 * This is the first step in the GWI workflow.
 *
 * Modes:
 *   gwi triage [pr-url]      Analyze PR complexity
 *   gwi triage --diff [ref]  Analyze local changes (Epic J)
 *
 * Uses pluggable storage (SQLite by default).
 */

import chalk from 'chalk';
import ora from 'ora';
import { createGitHubClient } from '@gwi/integrations';
import { createTriageAgent } from '@gwi/agents';
import { getDefaultStoreFactory } from '@gwi/core';
import type { PRMetadata, ConflictInfo } from '@gwi/core';
import { localTriageCommand, type LocalTriageOptions } from './local-triage.js';

export interface TriageOptions extends LocalTriageOptions {
  verbose?: boolean;
  json?: boolean;
  save?: boolean;
  /** Local diff triage mode (Epic J) */
  diff?: boolean;
}

export interface TriageResult {
  prId: string;
  prNumber: number;
  title: string;
  repository: string;
  overallComplexity: number;
  riskLevel: 'low' | 'medium' | 'high';
  routeDecision: 'auto-resolve' | 'agent-resolve' | 'human-required';
  estimatedTimeSec: number;
  fileAnalysis: FileAnalysis[];
  recommendation: string;
}

interface FileAnalysis {
  file: string;
  complexity: number;
  riskLevel: 'low' | 'medium' | 'high';
  suggestedRoute: 'auto' | 'agent' | 'human';
  reason: string;
}

export async function triageCommand(
  prUrlArg: string | undefined,
  options: TriageOptions
): Promise<void> {
  // Route to local triage if --diff flag is set (Epic J)
  if (options.diff) {
    await localTriageCommand(prUrlArg, {
      all: options.all,
      untracked: options.untracked,
      json: options.json,
      verbose: options.verbose,
      maxComplexity: options.maxComplexity,
    });
    return;
  }

  const spinner = ora({ isSilent: options.json });

  try {
    // Resolve PR URL
    let prUrl = prUrlArg;
    if (!prUrl) {
      prUrl = await getCurrentBranchPR() ?? undefined;
      if (!prUrl) {
        console.error(chalk.red('Error: No PR URL provided and no PR found for current branch'));
        process.exit(1);
      }
    }

    spinner.start('Fetching PR details...');

    // Get PR metadata
    const github = createGitHubClient();
    const pr = await github.getPRLegacy(prUrl);

    spinner.succeed(`Found PR #${pr.number}: ${pr.title}`);

    // Check for conflicts
    if (pr.conflicts.length === 0) {
      const result = {
        status: 'clean',
        prNumber: pr.number,
        title: pr.title,
        message: 'No conflicts detected. PR is ready to merge.',
      };

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green('\n  No conflicts detected. PR is ready to merge.\n'));
      }
      return;
    }

    spinner.start(`Analyzing ${pr.conflicts.length} conflict(s)...`);

    // Use Triage Agent for analysis
    const triageAgent = createTriageAgent();
    await triageAgent.initialize();

    const fileAnalysis: FileAnalysis[] = [];

    for (const conflict of pr.conflicts) {
      const analysis = analyzeConflictComplexity(conflict, pr);
      fileAnalysis.push(analysis);
    }

    await triageAgent.shutdown();
    spinner.succeed('Triage complete');

    // Calculate overall metrics
    const totalComplexity = fileAnalysis.reduce((sum, f) => sum + f.complexity, 0);
    const avgComplexity = totalComplexity / fileAnalysis.length;
    const maxComplexity = Math.max(...fileAnalysis.map(f => f.complexity));
    const highRiskCount = fileAnalysis.filter(f => f.riskLevel === 'high').length;

    const overallComplexity = Math.round((avgComplexity * 0.6) + (maxComplexity * 0.4));
    const riskLevel: 'low' | 'medium' | 'high' =
      highRiskCount > 0 ? 'high' :
      avgComplexity > 5 ? 'medium' : 'low';

    const routeDecision: 'auto-resolve' | 'agent-resolve' | 'human-required' =
      overallComplexity <= 2 && highRiskCount === 0 ? 'auto-resolve' :
      overallComplexity <= 7 && highRiskCount <= 1 ? 'agent-resolve' : 'human-required';

    const estimatedTimeSec = fileAnalysis.reduce((sum, f) => sum + (f.complexity * 15), 0);

    const result: TriageResult = {
      prId: pr.id,
      prNumber: pr.number,
      title: pr.title,
      repository: `${pr.owner}/${pr.repo}`,
      overallComplexity,
      riskLevel,
      routeDecision,
      estimatedTimeSec,
      fileAnalysis,
      recommendation: generateRecommendation(routeDecision, fileAnalysis),
    };

    // Save to storage if requested
    if (options.save !== false) {
      const factory = getDefaultStoreFactory();
      const prStore = factory.createPRStore();
      // Save the PR metadata (without custom fields)
      await prStore.savePR(pr);
      // Save conflicts separately
      await prStore.saveConflicts(pr.id, pr.conflicts);
    }

    // Output results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printTriageResult(result, options);
    }
  } catch (error) {
    spinner.fail('Triage failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

function analyzeConflictComplexity(conflict: ConflictInfo, _pr: PRMetadata): FileAnalysis {
  const lines = conflict.conflictMarkers.split('\n');
  const conflictSize = lines.length;
  const hasCodeBlocks = lines.some(l => l.includes('{') || l.includes('}'));
  const hasImports = lines.some(l => l.includes('import ') || l.includes('require('));
  const hasTypes = lines.some(l => l.includes('interface ') || l.includes('type '));

  // Complexity factors
  let complexity = conflict.complexity;

  // Adjust based on content
  if (conflictSize > 50) complexity = Math.min(10, complexity + 2);
  if (hasCodeBlocks && hasTypes) complexity = Math.min(10, complexity + 1);
  if (hasImports) complexity = Math.max(complexity, 3);

  const riskLevel: 'low' | 'medium' | 'high' =
    complexity <= 3 ? 'low' :
    complexity <= 6 ? 'medium' : 'high';

  const suggestedRoute: 'auto' | 'agent' | 'human' =
    complexity <= 2 ? 'auto' :
    complexity <= 7 ? 'agent' : 'human';

  const reasons: string[] = [];
  if (conflictSize > 50) reasons.push('large conflict region');
  if (hasCodeBlocks && hasTypes) reasons.push('type definitions involved');
  if (hasImports) reasons.push('import statements affected');
  if (complexity >= 7) reasons.push('high semantic complexity');

  return {
    file: conflict.file,
    complexity,
    riskLevel,
    suggestedRoute,
    reason: reasons.length > 0 ? reasons.join(', ') : 'standard conflict',
  };
}

function generateRecommendation(
  route: 'auto-resolve' | 'agent-resolve' | 'human-required',
  fileAnalysis: FileAnalysis[]
): string {
  const autoFiles = fileAnalysis.filter(f => f.suggestedRoute === 'auto').length;
  const agentFiles = fileAnalysis.filter(f => f.suggestedRoute === 'agent').length;
  const humanFiles = fileAnalysis.filter(f => f.suggestedRoute === 'human').length;

  switch (route) {
    case 'auto-resolve':
      return `All ${fileAnalysis.length} file(s) can be auto-resolved. Run: gwi autopilot`;
    case 'agent-resolve':
      return `${autoFiles + agentFiles} file(s) can be handled by AI. ${humanFiles > 0 ? `${humanFiles} need manual review.` : ''} Run: gwi plan`;
    case 'human-required':
      return `${humanFiles} file(s) require human expertise. Consider splitting the PR or manual resolution.`;
  }
}

function printTriageResult(result: TriageResult, options: TriageOptions): void {
  console.log();
  console.log(chalk.bold(`PR #${result.prNumber}: ${result.title}`));
  console.log(chalk.dim(`Repository: ${result.repository}`));
  console.log();

  // Overall summary
  const complexityColor = result.overallComplexity <= 3 ? chalk.green :
    result.overallComplexity <= 6 ? chalk.yellow : chalk.red;
  const riskColor = result.riskLevel === 'low' ? chalk.green :
    result.riskLevel === 'medium' ? chalk.yellow : chalk.red;
  const routeColor = result.routeDecision === 'auto-resolve' ? chalk.green :
    result.routeDecision === 'agent-resolve' ? chalk.yellow : chalk.red;

  console.log(chalk.bold('  Summary:'));
  console.log(`    Complexity:    ${complexityColor(`${result.overallComplexity}/10`)}`);
  console.log(`    Risk Level:    ${riskColor(result.riskLevel.toUpperCase())}`);
  console.log(`    Route:         ${routeColor(formatRoute(result.routeDecision))}`);
  console.log(`    Est. Time:     ${formatTime(result.estimatedTimeSec)}`);
  console.log();

  // Per-file analysis
  console.log(chalk.bold('  Files:'));
  console.log();
  for (const file of result.fileAnalysis) {
    const icon = file.suggestedRoute === 'auto' ? chalk.green('[AUTO]') :
      file.suggestedRoute === 'agent' ? chalk.yellow('[AI]') : chalk.red('[HUMAN]');
    const riskIcon = file.riskLevel === 'low' ? chalk.green('●') :
      file.riskLevel === 'medium' ? chalk.yellow('●') : chalk.red('●');

    console.log(`    ${riskIcon} ${file.file}`);
    console.log(`      ${icon} Complexity: ${file.complexity}/10 | ${file.reason}`);

    if (options.verbose && file.riskLevel === 'high') {
      console.log(chalk.dim(`      ⚠️  High-risk file - review carefully`));
    }
  }
  console.log();

  // Recommendation
  console.log(chalk.bold('  Recommendation:'));
  console.log(`    ${result.recommendation}`);
  console.log();

  // Next steps
  console.log(chalk.dim('  Next steps:'));
  if (result.routeDecision === 'auto-resolve') {
    console.log(chalk.dim(`    gwi autopilot ${result.prNumber}    # Fully automated resolution`));
  } else if (result.routeDecision === 'agent-resolve') {
    console.log(chalk.dim(`    gwi plan ${result.prNumber}         # Generate resolution plan`));
    console.log(chalk.dim(`    gwi autopilot ${result.prNumber}    # Or run with approval gates`));
  } else {
    console.log(chalk.dim(`    gwi plan ${result.prNumber}         # See what AI can help with`));
    console.log(chalk.dim(`    Manual resolution recommended for high-risk files`));
  }
  console.log();
}

function formatRoute(route: string): string {
  switch (route) {
    case 'auto-resolve': return 'Auto-resolve (simple)';
    case 'agent-resolve': return 'Agent-resolve (with approval)';
    case 'human-required': return 'Human required';
    default: return route;
  }
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

async function getCurrentBranchPR(): Promise<string | null> {
  try {
    const { execSync } = await import('child_process');

    const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    if (!branch) return null;

    try {
      const prUrl = execSync(`gh pr view ${branch} --json url -q .url 2>/dev/null`, {
        encoding: 'utf-8',
      }).trim();
      return prUrl || null;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}
