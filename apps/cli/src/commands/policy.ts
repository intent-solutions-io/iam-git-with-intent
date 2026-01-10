/**
 * gwi policy command
 *
 * Policy management and testing commands.
 * Epic D: Policy & Audit - D2.5: Policy dry-run mode
 */

import chalk from 'chalk';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  createSchemaEngine,
  type DryRunResult,
  type SchemaPolicyDocument,
  type SchemaEvaluationRequest,
} from '@gwi/core';

export interface PolicyTestOptions {
  policy?: string;
  actor?: string;
  actorType?: 'human' | 'agent';
  action?: string;
  resource?: string;
  complexity?: number;
  branch?: string;
  files?: string[];
  labels?: string[];
  json?: boolean;
  verbose?: boolean;
}

/**
 * Build evaluation request from CLI options
 */
function buildRequest(options: PolicyTestOptions): SchemaEvaluationRequest {
  return {
    actor: {
      id: options.actor ?? 'cli-user',
      type: options.actorType ?? 'human',
    },
    action: {
      name: options.action ?? 'pr.merge',
    },
    resource: {
      type: options.resource ?? 'pull_request',
      complexity: options.complexity,
      branch: options.branch,
      files: options.files,
      labels: options.labels,
    },
    context: {
      source: 'cli',
      timestamp: new Date(),
    },
    hasApproval: false,
  };
}

/**
 * Load policy from file or inline JSON
 */
function loadPolicy(policyPath: string): SchemaPolicyDocument {
  const fullPath = resolve(process.cwd(), policyPath);

  if (!existsSync(fullPath)) {
    throw new Error(`Policy file not found: ${fullPath}`);
  }

  const content = readFileSync(fullPath, 'utf-8');
  return JSON.parse(content) as SchemaPolicyDocument;
}

/**
 * Format condition evaluation for display
 */
function formatCondition(cond: DryRunResult['allRules'][0]['conditions'][0], verbose: boolean): string {
  const icon = cond.matched ? chalk.green('✓') : chalk.red('✗');
  const status = cond.matched ? chalk.green('MATCH') : chalk.dim('NO MATCH');

  if (verbose) {
    return `      ${icon} [${cond.type}] ${cond.explanation}`;
  }

  return `      ${icon} ${cond.type}: ${status}`;
}

/**
 * Format rule evaluation for display
 */
function formatRule(rule: DryRunResult['allRules'][0], verbose: boolean): string {
  const lines: string[] = [];
  const icon = rule.matched ? chalk.green('●') : chalk.dim('○');
  const status = rule.matched ? chalk.green('MATCHED') : chalk.dim('no match');

  lines.push(`    ${icon} ${chalk.bold(rule.ruleName)} (${rule.ruleId})`);
  lines.push(`      Priority: ${rule.priority}, Status: ${status}`);
  lines.push(`      Effect: ${chalk.yellow(rule.wouldApply.effect)}${rule.wouldApply.reason ? ` - ${rule.wouldApply.reason}` : ''}`);

  if (verbose && rule.conditions.length > 0) {
    lines.push('      Conditions:');
    for (const cond of rule.conditions) {
      lines.push(formatCondition(cond, verbose));
    }
  }

  return lines.join('\n');
}

/**
 * gwi policy test - Dry-run policy evaluation
 */
export async function policyTestCommand(options: PolicyTestOptions): Promise<void> {
  const engine = createSchemaEngine();

  // Load policy file if specified
  if (options.policy) {
    try {
      const policy = loadPolicy(options.policy);
      engine.loadPolicy(policy);
      if (options.verbose) {
        console.log(chalk.dim(`  Loaded policy from ${options.policy}`));
      }
    } catch (error) {
      console.error(chalk.red('Error loading policy:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  // Check if any policies are loaded
  const loadedPolicies = engine.getLoadedPolicies();
  if (loadedPolicies.length === 0) {
    console.error(chalk.yellow('  No policies loaded. Use --policy to specify a policy file.'));
    console.log();
    console.log(chalk.dim('  Example:'));
    console.log(chalk.dim('    gwi policy test --policy ./my-policy.json --complexity 8'));
    console.log();
    process.exit(1);
  }

  // Build request from options
  const request = buildRequest(options);

  // Run dry-run evaluation
  const result = engine.evaluateDryRun(request);

  // Output as JSON if requested
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Human-readable output
  console.log();
  console.log(chalk.bold('  Policy Dry-Run Evaluation'));
  console.log(chalk.dim('  ─────────────────────────────────────────────────────'));
  console.log();

  // Request summary
  console.log(chalk.bold('  Request:'));
  console.log(`    Actor:      ${request.actor.id} (${request.actor.type})`);
  console.log(`    Action:     ${request.action.name}`);
  console.log(`    Resource:   ${request.resource.type}`);
  if (request.resource.complexity !== undefined) {
    console.log(`    Complexity: ${request.resource.complexity}`);
  }
  if (request.resource.branch) {
    console.log(`    Branch:     ${request.resource.branch}`);
  }
  if (request.resource.files?.length) {
    console.log(`    Files:      ${request.resource.files.length} files`);
  }
  if (request.resource.labels?.length) {
    console.log(`    Labels:     ${request.resource.labels.join(', ')}`);
  }
  console.log();

  // Decision summary
  console.log(chalk.bold('  Decision:'));
  const decisionIcon = result.wouldAllow ? chalk.green('✓') : chalk.red('✗');
  const decisionText = result.wouldAllow ? chalk.green('ALLOW') : chalk.red('DENY');
  console.log(`    ${decisionIcon} Would ${decisionText}`);
  console.log(`    Effect: ${chalk.yellow(result.wouldEffect)}`);
  console.log(`    Reason: ${result.reason}`);
  console.log();

  // Summary stats
  console.log(chalk.bold('  Summary:'));
  console.log(`    Policies evaluated:  ${result.summary.totalPolicies}`);
  console.log(`    Rules evaluated:     ${result.summary.totalRules}`);
  console.log(`    Rules matched:       ${result.summary.matchingRules}`);
  console.log(`    Evaluation time:     ${result.summary.evaluationTimeMs}ms`);
  console.log();

  // Primary match
  if (result.primaryMatch) {
    console.log(chalk.bold('  Primary Matching Rule:'));
    console.log(formatRule(result.primaryMatch, options.verbose ?? false));
    console.log();
  }

  // Other matching rules
  if (result.matchingRules.length > 1) {
    console.log(chalk.bold(`  Other Matching Rules (${result.matchingRules.length - 1}):`));
    for (const rule of result.matchingRules.slice(1)) {
      console.log(formatRule(rule, options.verbose ?? false));
    }
    console.log();
  }

  // Non-matching rules (verbose only)
  if (options.verbose && result.nonMatchingRules.length > 0) {
    console.log(chalk.bold(`  Non-Matching Rules (${result.nonMatchingRules.length}):`));
    for (const rule of result.nonMatchingRules) {
      console.log(formatRule(rule, true));
    }
    console.log();
  }

  // Warnings
  if (result.warnings.length > 0) {
    console.log(chalk.bold('  Warnings:'));
    for (const warning of result.warnings) {
      console.log(`    ${chalk.yellow('⚠')} ${warning}`);
    }
    console.log();
  }
}

/**
 * gwi policy list - List loaded policies
 */
export async function policyListCommand(options: { json?: boolean }): Promise<void> {
  const engine = createSchemaEngine();
  const policies = engine.getLoadedPolicies();

  if (options.json) {
    console.log(JSON.stringify({ policies }, null, 2));
    return;
  }

  console.log();
  console.log(chalk.bold('  Loaded Policies'));
  console.log();

  if (policies.length === 0) {
    console.log(chalk.dim('  No policies loaded.'));
    console.log();
    return;
  }

  for (const policyId of policies) {
    console.log(`    • ${policyId}`);
  }
  console.log();
}

/**
 * gwi policy validate - Validate a policy file
 */
export async function policyValidateCommand(
  policyPath: string,
  options: { json?: boolean; verbose?: boolean }
): Promise<void> {
  try {
    const policy = loadPolicy(policyPath);

    // Try loading into engine (which validates)
    const engine = createSchemaEngine({ validateOnLoad: true });
    engine.loadPolicy(policy);

    if (options.json) {
      console.log(JSON.stringify({
        valid: true,
        path: policyPath,
        name: policy.name,
        rulesCount: policy.rules?.length ?? 0,
      }, null, 2));
      return;
    }

    console.log();
    console.log(chalk.green('  ✓ Policy is valid'));
    console.log();
    console.log(`    Name:  ${policy.name}`);
    console.log(`    Rules: ${policy.rules?.length ?? 0}`);
    if (options.verbose && policy.rules) {
      console.log();
      console.log('    Rules:');
      for (const rule of policy.rules) {
        console.log(`      • ${rule.name} (${rule.id})`);
      }
    }
    console.log();
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({
        valid: false,
        path: policyPath,
        error: error instanceof Error ? error.message : String(error),
      }, null, 2));
      process.exit(1);
    }

    console.log();
    console.log(chalk.red('  ✗ Policy is invalid'));
    console.log();
    console.log(`    ${error instanceof Error ? error.message : String(error)}`);
    console.log();
    process.exit(1);
  }
}
