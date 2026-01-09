/**
 * Simulate Command
 *
 * Phase 35: Context Graph - World Model Simulation
 *
 * Answer "If we do X now, what likely happens?" using precedent matching.
 * Uses historical decision traces to predict outcomes.
 *
 * Usage:
 *   gwi simulate "merge PR without review"
 *   gwi simulate "auto-approve complex changes" --complexity 8
 *   gwi simulate compare "action A" "action B"
 *   gwi simulate what-if "action 1" "action 2" "action 3"
 *   gwi simulate pattern "generate code from issue"
 */

import chalk from 'chalk';
import {
  createSimulator,
  formatSimulationForCLI,
  formatWhatIfForCLI,
  type SimulationContext,
  type AgentType,
} from '@gwi/core';

// =============================================================================
// Types
// =============================================================================

export interface SimulateOptions {
  json?: boolean;
  verbose?: boolean;
  tenant?: string;
  complexity?: number;
  repo?: string;
  author?: string;
  agentType?: AgentType;
  maxPrecedents?: number;
  minSimilarity?: number;
}

export type CompareOptions = SimulateOptions;

export type WhatIfOptions = SimulateOptions;

export type PatternOptions = SimulateOptions;

// =============================================================================
// Simulate Command
// =============================================================================

/**
 * Simulate a single action
 */
export async function simulateActionCommand(
  action: string,
  options: SimulateOptions
): Promise<void> {
  const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';
  const simulator = createSimulator(tenantId, {
    defaultOptions: {
      maxPrecedents: options.maxPrecedents ?? 10,
      minSimilarity: options.minSimilarity ?? 0.5,
    },
  });

  // Build context from options
  const context: SimulationContext = {
    repo: options.repo,
    complexity: options.complexity,
    author: options.author,
    agentType: options.agentType,
    time: new Date(),
  };

  console.log(chalk.dim('Simulating...'));

  const result = await simulator.simulate({ action, context });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Pretty print
  console.log();
  console.log(formatSimulationForCLI(result));
  console.log();

  // Show risk warning if high risk
  if (result.riskLevel > 0.5) {
    console.log(chalk.yellow('  ⚠️  High risk action based on historical precedents'));
    console.log(chalk.yellow('  Consider: ' + result.recommendation));
  }
}

// =============================================================================
// Compare Command
// =============================================================================

/**
 * Compare two actions
 */
export async function simulateCompareCommand(
  actionA: string,
  actionB: string,
  options: CompareOptions
): Promise<void> {
  const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';
  const simulator = createSimulator(tenantId, {
    defaultOptions: {
      maxPrecedents: options.maxPrecedents ?? 10,
      minSimilarity: options.minSimilarity ?? 0.5,
    },
  });

  // Build context from options
  const context: SimulationContext = {
    repo: options.repo,
    complexity: options.complexity,
    author: options.author,
    agentType: options.agentType,
    time: new Date(),
  };

  console.log(chalk.dim('Comparing actions...'));

  const comparison = await simulator.compareActions(context, actionA, actionB);

  if (options.json) {
    console.log(JSON.stringify(comparison, null, 2));
    return;
  }

  // Pretty print
  console.log();
  console.log(chalk.bold('=== Action Comparison ==='));
  console.log();

  // Action A
  console.log(chalk.bold('ACTION A: ') + actionA);
  console.log(`  Status: ${formatStatus(comparison.actionA.likelyStatus)}`);
  console.log(`  Confidence: ${(comparison.actionA.confidence * 100).toFixed(0)}%`);
  console.log(`  Risk: ${(comparison.actionA.riskLevel * 100).toFixed(0)}%`);
  console.log(`  Outcome: ${comparison.actionA.likelyOutcome}`);
  console.log();

  // Action B
  console.log(chalk.bold('ACTION B: ') + actionB);
  console.log(`  Status: ${formatStatus(comparison.actionB.likelyStatus)}`);
  console.log(`  Confidence: ${(comparison.actionB.confidence * 100).toFixed(0)}%`);
  console.log(`  Risk: ${(comparison.actionB.riskLevel * 100).toFixed(0)}%`);
  console.log(`  Outcome: ${comparison.actionB.likelyOutcome}`);
  console.log();

  // Recommendation
  const preferredIcon = comparison.preferredAction === 'A' ? chalk.green('A') :
                        comparison.preferredAction === 'B' ? chalk.green('B') :
                        chalk.yellow('either');
  console.log(chalk.bold('RECOMMENDATION:'));
  console.log(`  Preferred: ${preferredIcon}`);
  console.log(`  ${comparison.recommendation}`);
  console.log();
}

// =============================================================================
// What-If Command
// =============================================================================

/**
 * What-if analysis for multiple actions
 */
export async function simulateWhatIfCommand(
  actions: string[],
  options: WhatIfOptions
): Promise<void> {
  if (actions.length < 1) {
    console.error(chalk.red('At least one action is required'));
    process.exit(1);
  }

  const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';
  const simulator = createSimulator(tenantId, {
    defaultOptions: {
      maxPrecedents: options.maxPrecedents ?? 10,
      minSimilarity: options.minSimilarity ?? 0.5,
    },
  });

  // Build context from options
  const context: SimulationContext = {
    repo: options.repo,
    complexity: options.complexity,
    author: options.author,
    agentType: options.agentType,
    time: new Date(),
  };

  console.log(chalk.dim(`Analyzing ${actions.length} scenario(s)...`));

  const results = await simulator.whatIf(context, actions);

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Pretty print
  console.log();
  console.log(formatWhatIfForCLI(results));
}

// =============================================================================
// Pattern Command
// =============================================================================

/**
 * Get historical pattern for an action type
 */
export async function simulatePatternCommand(
  action: string,
  options: PatternOptions
): Promise<void> {
  const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';
  const simulator = createSimulator(tenantId, {
    defaultOptions: {
      maxPrecedents: 100, // Get more for pattern analysis
      minSimilarity: options.minSimilarity ?? 0.7, // Higher threshold
    },
  });

  console.log(chalk.dim('Analyzing historical pattern...'));

  const pattern = await simulator.getPattern(action, {
    maxPrecedents: 100,
    minSimilarity: 0.7,
  });

  if (options.json) {
    console.log(JSON.stringify(pattern, null, 2));
    return;
  }

  // Pretty print
  console.log();
  console.log(chalk.bold('=== Historical Pattern ==='));
  console.log(`Action: ${action}`);
  console.log();

  if (pattern.sampleSize === 0) {
    console.log(chalk.yellow('  No historical precedents found for this action.'));
    console.log(chalk.dim('  As more decisions are recorded, patterns will emerge.'));
    console.log();
    return;
  }

  // Success rate
  const successColor = pattern.successRate > 0.7 ? chalk.green :
                       pattern.successRate > 0.4 ? chalk.yellow : chalk.red;
  console.log(`  Success Rate: ${successColor((pattern.successRate * 100).toFixed(0) + '%')}`);
  console.log(`  Sample Size: ${pattern.sampleSize} precedents`);
  console.log();

  // Common outcomes
  if (pattern.commonOutcomes.length > 0) {
    console.log(chalk.bold('  Common Outcomes:'));
    for (let i = 0; i < pattern.commonOutcomes.length; i++) {
      console.log(`    ${i + 1}. ${pattern.commonOutcomes[i]}`);
    }
    console.log();
  }

  // Interpretation
  console.log(chalk.bold('  Interpretation:'));
  if (pattern.successRate > 0.7) {
    console.log(chalk.green('    This action type has a strong track record.'));
  } else if (pattern.successRate > 0.4) {
    console.log(chalk.yellow('    This action type has mixed results.'));
    console.log(chalk.yellow('    Consider additional safeguards.'));
  } else {
    console.log(chalk.red('    This action type frequently fails.'));
    console.log(chalk.red('    Strong recommendation to reconsider approach.'));
  }
  console.log();
}

// =============================================================================
// Helpers
// =============================================================================

function formatStatus(status: string): string {
  switch (status) {
    case 'success':
      return chalk.green('✓ Success likely');
    case 'failure':
      return chalk.red('✗ Failure likely');
    case 'neutral':
      return chalk.yellow('○ Neutral');
    case 'uncertain':
      return chalk.dim('? Uncertain');
    default:
      return status;
  }
}

// =============================================================================
// Main Command Handler
// =============================================================================

/**
 * Main simulate command - routes to appropriate handler
 */
export async function simulateCommand(
  action: string,
  options: SimulateOptions
): Promise<void> {
  await simulateActionCommand(action, options);
}
