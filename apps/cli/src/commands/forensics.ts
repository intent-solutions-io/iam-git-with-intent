/**
 * Phase 27: Forensics CLI Commands
 *
 * Commands for forensic replay and analysis:
 * - gwi forensics status - Show forensics feature status
 * - gwi forensics replay <file> - Replay a bundle
 * - gwi forensics timeline <file> - Show event timeline
 * - gwi forensics validate <file> - Validate a bundle
 * - gwi forensics dlq list - List DLQ items
 * - gwi forensics dlq replay <id> - Replay from DLQ
 *
 * Feature flag: GWI_FORENSICS_ENABLED=1 to enable
 */

import { Command } from 'commander';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import chalk from 'chalk';
import {
  isForensicsEnabled,
  validateForensicBundle,
  ReplayEngine,
  type ForensicBundle,
  type ForensicEvent,
  type ReplayResult,
} from '@gwi/core';

// =============================================================================
// Feature Flag Check
// =============================================================================

function checkFeatureFlag(): boolean {
  if (!isForensicsEnabled()) {
    console.error(
      chalk.red('Forensics feature is not enabled.')
    );
    console.error(
      chalk.yellow('Set GWI_FORENSICS_ENABLED=1 to enable forensics commands.')
    );
    return false;
  }
  return true;
}

// =============================================================================
// Status Command
// =============================================================================

async function statusCommand(): Promise<void> {
  console.log(chalk.bold.cyan('\n--- Forensics Status ---\n'));

  const enabled = isForensicsEnabled();
  console.log(
    `Feature Flag: ${enabled ? chalk.green('ENABLED') : chalk.red('DISABLED')}`
  );

  if (!enabled) {
    console.log(
      chalk.yellow('\nTo enable: export GWI_FORENSICS_ENABLED=1')
    );
    return;
  }

  // Show configuration
  console.log(chalk.bold('\nConfiguration:'));
  console.log(`  GWI_FORENSICS_ENABLED: ${process.env.GWI_FORENSICS_ENABLED}`);

  // Show DLQ directory if configured
  const dlqDir = process.env.GWI_DLQ_DIR || '.gwi/dlq';
  const dlqExists = existsSync(dlqDir);
  console.log(`  DLQ Directory: ${dlqDir} ${dlqExists ? chalk.green('(exists)') : chalk.yellow('(not found)')}`);

  if (dlqExists) {
    try {
      const files = readdirSync(dlqDir).filter((f) => f.endsWith('.json'));
      console.log(`  DLQ Items: ${files.length}`);
    } catch {
      // Ignore
    }
  }

  console.log(chalk.bold('\nCapabilities:'));
  console.log('  - ForensicBundle schema validation');
  console.log('  - Event redaction (API keys, secrets, PII)');
  console.log('  - Deterministic replay with LLM mocking');
  console.log('  - Diff detection and reporting');
  console.log('  - Timeline visualization');
}

// =============================================================================
// Replay Command
// =============================================================================

interface ReplayOptions {
  mode?: 'deterministic' | 'live' | 'mock_only';
  stopOnDiff?: boolean;
  maxEvents?: number;
  output?: string;
  verbose?: boolean;
}

async function replayCommand(
  bundleFile: string,
  options: ReplayOptions
): Promise<void> {
  if (!checkFeatureFlag()) return;

  console.log(chalk.bold.cyan('\n--- Forensic Replay ---\n'));

  // Load bundle
  if (!existsSync(bundleFile)) {
    console.error(chalk.red(`Bundle file not found: ${bundleFile}`));
    process.exit(1);
  }

  let bundle: ForensicBundle;
  try {
    const content = readFileSync(bundleFile, 'utf-8');
    const data = JSON.parse(content);
    const validation = validateForensicBundle(data);
    if (!validation.valid) {
      console.error(chalk.red('Invalid bundle:'));
      for (const msg of validation.errorMessages || []) {
        console.error(chalk.red(`  - ${msg}`));
      }
      process.exit(1);
    }
    bundle = validation.bundle!;
  } catch (error) {
    console.error(chalk.red(`Failed to load bundle: ${error}`));
    process.exit(1);
  }

  console.log(`Bundle ID: ${chalk.cyan(bundle.bundle_id)}`);
  console.log(`Run ID: ${chalk.cyan(bundle.run_id)}`);
  console.log(`Tenant ID: ${chalk.cyan(bundle.tenant_id)}`);
  console.log(`Events: ${chalk.cyan(bundle.events.length)}`);
  console.log(`Original Status: ${chalk.cyan(bundle.run_status)}`);
  console.log();

  // Create replay engine
  const engine = new ReplayEngine({
    mode: options.mode || 'deterministic',
    stopOnFirstDiff: options.stopOnDiff || false,
    maxEvents: options.maxEvents,
    enforcePolicies: true,
    validateOutput: true,
  });

  // Validate replay capability
  const validation = engine.validateForReplay(bundle);
  if (!validation.valid) {
    console.log(chalk.yellow('Replay validation issues:'));
    for (const issue of validation.issues) {
      console.log(chalk.yellow(`  - ${issue}`));
    }
    console.log();
  }

  // Execute replay
  console.log(chalk.bold('Starting replay...'));
  const startTime = Date.now();

  const result: ReplayResult = await engine.replay(bundle);

  const duration = Date.now() - startTime;

  // Display results
  console.log();
  console.log(chalk.bold('Replay Results:'));
  console.log(`  Status: ${formatReplayStatus(result.status)}`);
  console.log(`  Duration: ${chalk.cyan(duration + 'ms')}`);
  console.log(`  Events Replayed: ${chalk.cyan(result.eventsReplayed)}`);
  console.log(`  Events Skipped: ${chalk.cyan(result.eventsSkipped)}`);
  console.log(`  LLM Calls Mocked: ${chalk.cyan(result.llmCallsMocked)}`);

  if (result.warnings.length > 0) {
    console.log();
    console.log(chalk.yellow('Warnings:'));
    for (const warning of result.warnings) {
      console.log(chalk.yellow(`  - ${warning}`));
    }
  }

  if (result.comparison) {
    console.log();
    console.log(chalk.bold('Comparison:'));
    console.log(`  Match: ${result.comparison.match ? chalk.green('YES') : chalk.red('NO')}`);
    console.log(`  Summary: ${result.comparison.summary}`);

    if (options.verbose && result.comparison.differences.length > 0) {
      console.log();
      console.log(chalk.bold('Differences:'));
      for (const diff of result.comparison.differences.slice(0, 10)) {
        const color = diff.severity === 'error' ? chalk.red : diff.severity === 'warning' ? chalk.yellow : chalk.gray;
        console.log(color(`  [${diff.severity}] ${diff.path}: ${diff.description}`));
      }
      if (result.comparison.differences.length > 10) {
        console.log(chalk.gray(`  ... and ${result.comparison.differences.length - 10} more`));
      }
    }
  }

  if (result.error) {
    console.log();
    console.log(chalk.red('Error:'));
    console.log(chalk.red(`  ${result.error.name}: ${result.error.message}`));
    if (result.error.failedAtEvent) {
      console.log(chalk.red(`  Failed at event: ${result.error.failedAtEvent}`));
    }
  }
}

function formatReplayStatus(status: string): string {
  switch (status) {
    case 'replay_succeeded':
      return chalk.green('SUCCEEDED');
    case 'replay_failed':
      return chalk.red('FAILED');
    case 'replay_diff_detected':
      return chalk.yellow('DIFF DETECTED');
    case 'replaying':
      return chalk.cyan('REPLAYING');
    default:
      return chalk.gray(status);
  }
}

// =============================================================================
// Timeline Command
// =============================================================================

interface TimelineOptions {
  filter?: string;
  limit?: number;
  verbose?: boolean;
}

async function timelineCommand(
  bundleFile: string,
  options: TimelineOptions
): Promise<void> {
  if (!checkFeatureFlag()) return;

  console.log(chalk.bold.cyan('\n--- Event Timeline ---\n'));

  // Load bundle
  if (!existsSync(bundleFile)) {
    console.error(chalk.red(`Bundle file not found: ${bundleFile}`));
    process.exit(1);
  }

  let bundle: ForensicBundle;
  try {
    const content = readFileSync(bundleFile, 'utf-8');
    const data = JSON.parse(content);
    const validation = validateForensicBundle(data);
    if (!validation.valid) {
      console.error(chalk.red('Invalid bundle'));
      process.exit(1);
    }
    bundle = validation.bundle!;
  } catch (error) {
    console.error(chalk.red(`Failed to load bundle: ${error}`));
    process.exit(1);
  }

  console.log(`Bundle: ${chalk.cyan(bundle.bundle_id)}`);
  console.log(`Run: ${chalk.cyan(bundle.run_id)}`);
  console.log(`Started: ${chalk.cyan(bundle.run_started_at)}`);
  console.log(`Ended: ${chalk.cyan(bundle.run_ended_at || 'N/A')}`);
  console.log(`Status: ${chalk.cyan(bundle.run_status)}`);
  console.log();

  // Filter events
  let events = bundle.events;
  if (options.filter) {
    const filter = options.filter.toLowerCase();
    events = events.filter((e) => e.type.toLowerCase().includes(filter));
  }

  // Limit events
  const limit = options.limit || 50;
  const displayEvents = events.slice(0, limit);
  const hasMore = events.length > limit;

  console.log(chalk.bold(`Events (${displayEvents.length}/${events.length}):`));
  console.log();

  for (const event of displayEvents) {
    printTimelineEvent(event, options.verbose);
  }

  if (hasMore) {
    console.log(chalk.gray(`\n... and ${events.length - limit} more events (use --limit to show more)`));
  }

  // Show summary
  console.log();
  console.log(chalk.bold('Event Counts:'));
  const counts = bundle.event_counts;
  for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${chalk.cyan(count)}`);
  }

  // Show token usage if available
  if (bundle.total_tokens) {
    console.log();
    console.log(chalk.bold('Token Usage:'));
    console.log(`  Prompt: ${chalk.cyan(bundle.total_tokens.prompt_tokens)}`);
    console.log(`  Completion: ${chalk.cyan(bundle.total_tokens.completion_tokens)}`);
    console.log(`  Total: ${chalk.cyan(bundle.total_tokens.total_tokens)}`);
  }

  // Show policy summary if available
  if (bundle.policy_summary) {
    console.log();
    console.log(chalk.bold('Policy Summary:'));
    console.log(`  Total Checks: ${chalk.cyan(bundle.policy_summary.total_checks)}`);
    console.log(`  Approved: ${chalk.green(bundle.policy_summary.approved)}`);
    console.log(`  Denied: ${chalk.red(bundle.policy_summary.denied)}`);
    console.log(`  Escalated: ${chalk.yellow(bundle.policy_summary.escalated)}`);
  }
}

function printTimelineEvent(event: ForensicEvent, verbose = false): void {
  const time = new Date(event.timestamp).toISOString().split('T')[1].split('.')[0];
  const icon = getEventIcon(event.type);
  const color = getEventColor(event.type);

  console.log(
    `${chalk.gray(time)} ${icon} ${color(event.type.padEnd(20))} ${chalk.gray(`#${event.sequence}`)}`
  );

  if (verbose && event.data) {
    const data = event.data as Record<string, unknown>;
    // Show relevant fields based on event type
    if (event.type.startsWith('llm.')) {
      if (data.provider) console.log(chalk.gray(`    Provider: ${data.provider}`));
      if (data.model) console.log(chalk.gray(`    Model: ${data.model}`));
      if (data.latency_ms) console.log(chalk.gray(`    Latency: ${data.latency_ms}ms`));
    } else if (event.type.startsWith('step.')) {
      if (data.step_name) console.log(chalk.gray(`    Step: ${data.step_name}`));
    } else if (event.type.startsWith('tool.')) {
      if (data.tool_name) console.log(chalk.gray(`    Tool: ${data.tool_name}`));
    } else if (event.type.startsWith('policy.')) {
      if (data.decision) console.log(chalk.gray(`    Decision: ${data.decision}`));
    }
  }
}

function getEventIcon(type: string): string {
  if (type.startsWith('run.')) return '\u25B6';
  if (type.startsWith('step.')) return '\u2192';
  if (type.startsWith('tool.')) return '\u2699';
  if (type.startsWith('llm.')) return '\u2728';
  if (type.startsWith('policy.')) return '\u2714';
  if (type.startsWith('approval.')) return '\u270B';
  if (type.startsWith('error.') || type.startsWith('dlq.')) return '\u26A0';
  return '\u2022';
}

function getEventColor(type: string): (s: string) => string {
  if (type.includes('failed') || type.includes('error') || type.includes('denied')) {
    return chalk.red;
  }
  if (type.includes('completed') || type.includes('approved') || type.includes('granted')) {
    return chalk.green;
  }
  if (type.includes('started') || type.includes('invoked') || type.includes('request')) {
    return chalk.cyan;
  }
  if (type.includes('warning') || type.includes('escalated') || type.includes('timeout')) {
    return chalk.yellow;
  }
  return chalk.white;
}

// =============================================================================
// Validate Command
// =============================================================================

async function validateCommand(bundleFile: string): Promise<void> {
  if (!checkFeatureFlag()) return;

  console.log(chalk.bold.cyan('\n--- Validate Bundle ---\n'));

  if (!existsSync(bundleFile)) {
    console.error(chalk.red(`Bundle file not found: ${bundleFile}`));
    process.exit(1);
  }

  try {
    const content = readFileSync(bundleFile, 'utf-8');
    const data = JSON.parse(content);
    const validation = validateForensicBundle(data);

    console.log(`File: ${chalk.cyan(bundleFile)}`);
    console.log(`Valid: ${validation.valid ? chalk.green('YES') : chalk.red('NO')}`);

    if (!validation.valid) {
      console.log();
      console.log(chalk.red('Validation Errors:'));
      for (const msg of validation.errorMessages || []) {
        console.log(chalk.red(`  - ${msg}`));
      }
      process.exit(1);
    }

    const bundle = validation.bundle!;
    console.log();
    console.log(chalk.bold('Bundle Info:'));
    console.log(`  Version: ${bundle.version}`);
    console.log(`  Bundle ID: ${bundle.bundle_id}`);
    console.log(`  Run ID: ${bundle.run_id}`);
    console.log(`  Tenant ID: ${bundle.tenant_id}`);
    console.log(`  Events: ${bundle.events.length}`);
    console.log(`  Status: ${bundle.run_status}`);
    console.log(`  Redaction Applied: ${bundle.redaction.applied ? chalk.green('YES') : chalk.yellow('NO')}`);
    console.log(`  Redaction Count: ${bundle.redaction.redaction_count}`);
    if (bundle.checksum) {
      console.log(`  Checksum: ${bundle.checksum.slice(0, 16)}...`);
    }
  } catch (error) {
    console.error(chalk.red(`Failed to parse bundle: ${error}`));
    process.exit(1);
  }
}

// =============================================================================
// DLQ Commands
// =============================================================================

async function dlqListCommand(): Promise<void> {
  if (!checkFeatureFlag()) return;

  console.log(chalk.bold.cyan('\n--- DLQ Items ---\n'));

  const dlqDir = process.env.GWI_DLQ_DIR || '.gwi/dlq';

  if (!existsSync(dlqDir)) {
    console.log(chalk.yellow(`DLQ directory not found: ${dlqDir}`));
    console.log(chalk.yellow('No items in DLQ.'));
    return;
  }

  try {
    const files = readdirSync(dlqDir).filter((f) => f.endsWith('.json'));

    if (files.length === 0) {
      console.log(chalk.green('No items in DLQ.'));
      return;
    }

    console.log(`Found ${chalk.cyan(files.length)} items:\n`);

    for (const file of files.slice(0, 20)) {
      const filePath = join(dlqDir, file);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        const id = basename(file, '.json');
        const runId = data.run_id || 'unknown';
        const status = data.run_status || 'unknown';
        const createdAt = data.created_at || 'unknown';

        console.log(
          `${chalk.cyan(id.slice(0, 8))} | Run: ${runId.slice(0, 12)} | Status: ${status} | Created: ${createdAt}`
        );
      } catch {
        console.log(`${chalk.gray(file)} - ${chalk.red('failed to parse')}`);
      }
    }

    if (files.length > 20) {
      console.log(chalk.gray(`\n... and ${files.length - 20} more items`));
    }
  } catch (error) {
    console.error(chalk.red(`Failed to list DLQ: ${error}`));
    process.exit(1);
  }
}

interface DlqReplayOptions {
  mode?: 'deterministic' | 'live' | 'mock_only';
  verbose?: boolean;
}

async function dlqReplayCommand(
  bundleId: string,
  options: DlqReplayOptions
): Promise<void> {
  if (!checkFeatureFlag()) return;

  console.log(chalk.bold.cyan('\n--- DLQ Replay ---\n'));

  const dlqDir = process.env.GWI_DLQ_DIR || '.gwi/dlq';

  // Find the bundle file
  let bundleFile: string | null = null;

  if (existsSync(dlqDir)) {
    const files = readdirSync(dlqDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      if (file.startsWith(bundleId) || file === `${bundleId}.json`) {
        bundleFile = join(dlqDir, file);
        break;
      }
    }
  }

  if (!bundleFile) {
    console.error(chalk.red(`Bundle not found in DLQ: ${bundleId}`));
    console.error(chalk.yellow(`DLQ directory: ${dlqDir}`));
    process.exit(1);
  }

  // Delegate to replay command
  await replayCommand(bundleFile, {
    mode: options.mode,
    verbose: options.verbose,
  });
}

// =============================================================================
// Command Registration
// =============================================================================

export function registerForensicsCommands(program: Command): void {
  const forensics = program
    .command('forensics')
    .description('Forensic replay and analysis commands')
    .addHelpText('after', `
Environment Variables:
  GWI_FORENSICS_ENABLED  Enable forensics feature (set to 1)
  GWI_DLQ_DIR           DLQ directory (default: .gwi/dlq)

Examples:
  gwi forensics status
  gwi forensics validate bundle.json
  gwi forensics replay bundle.json --mode deterministic
  gwi forensics timeline bundle.json --filter llm
  gwi forensics dlq list
  gwi forensics dlq replay <bundle-id>
`);

  // Status command
  forensics
    .command('status')
    .description('Show forensics feature status and configuration')
    .action(statusCommand);

  // Validate command
  forensics
    .command('validate <file>')
    .description('Validate a forensic bundle file')
    .action(validateCommand);

  // Replay command
  forensics
    .command('replay <file>')
    .description('Replay a forensic bundle')
    .option(
      '-m, --mode <mode>',
      'Replay mode: deterministic, live, mock_only',
      'deterministic'
    )
    .option('-s, --stop-on-diff', 'Stop on first difference')
    .option('-n, --max-events <n>', 'Maximum events to replay', parseInt)
    .option('-o, --output <file>', 'Output file for replay result')
    .option('-v, --verbose', 'Show detailed output')
    .action(replayCommand);

  // Timeline command
  forensics
    .command('timeline <file>')
    .description('Show event timeline from a bundle')
    .option('-f, --filter <type>', 'Filter by event type (e.g., llm, step, policy)')
    .option('-l, --limit <n>', 'Limit number of events', parseInt)
    .option('-v, --verbose', 'Show event details')
    .action(timelineCommand);

  // DLQ subcommand
  const dlq = forensics
    .command('dlq')
    .description('Dead Letter Queue commands');

  dlq
    .command('list')
    .description('List items in the DLQ')
    .action(dlqListCommand);

  dlq
    .command('replay <bundle-id>')
    .description('Replay a bundle from the DLQ')
    .option(
      '-m, --mode <mode>',
      'Replay mode: deterministic, live, mock_only',
      'deterministic'
    )
    .option('-v, --verbose', 'Show detailed output')
    .action(dlqReplayCommand);
}
