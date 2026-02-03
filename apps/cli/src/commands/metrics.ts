/**
 * Metrics Command
 *
 * EPIC 002: SDLC Telemetry + Bottleneck Measurement
 *
 * Displays SDLC stage timings, bottleneck identification, and DORA metrics.
 *
 * @module @gwi/cli/commands/metrics
 */

import chalk from 'chalk';
import {
  getSDLCEventStore,
  getSDLCMetrics,
  type StageTimings,
  type SDLCStage,
} from '@gwi/core';

/**
 * Metrics command options
 */
export interface MetricsOptions {
  json?: boolean;
  verbose?: boolean;
  since?: string; // ISO date or relative (7d, 30d)
  stage?: SDLCStage;
  repository?: string;
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Parse relative date string to Date
 */
function parseRelativeDate(input: string): Date {
  const now = new Date();

  // Check for relative format (7d, 30d, etc.)
  const match = input.match(/^(\d+)([dwhm])$/i);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'd':
        return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
      case 'w':
        return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
      case 'h':
        return new Date(now.getTime() - value * 60 * 60 * 1000);
      case 'm':
        return new Date(now.getTime() - value * 60 * 1000);
    }
  }

  // Try ISO date
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${input}. Use ISO date or relative (7d, 30d, etc.)`);
  }
  return date;
}

/**
 * Get stage status indicator
 */
function getStageIndicator(timing: StageTimings): string {
  const failureRate = timing.count > 0 ? timing.failedCount / timing.count : 0;

  if (failureRate > 0.1) return chalk.red('●');
  if (failureRate > 0.05) return chalk.yellow('●');
  return chalk.green('●');
}

/**
 * Identify bottleneck stage
 */
function identifyBottleneck(timings: StageTimings[]): StageTimings | null {
  if (timings.length === 0) return null;

  // Bottleneck is the stage with highest P95 duration
  return timings.reduce((max, t) => (t.p95DurationMs > max.p95DurationMs ? t : max), timings[0]);
}

/**
 * Execute the metrics command
 */
export async function metricsCommand(options: MetricsOptions): Promise<void> {
  const store = getSDLCEventStore();
  const sdlcMetrics = getSDLCMetrics();

  // Parse date range
  let since: Date | undefined;
  if (options.since) {
    since = parseRelativeDate(options.since);
  } else {
    // Default to last 7 days
    since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  // Query stage timings
  const timings = await store.getStageTimings({
    since,
    repository: options.repository,
  });

  // Filter by stage if specified
  const filteredTimings = options.stage ? timings.filter((t) => t.stage === options.stage) : timings;

  // JSON output
  if (options.json) {
    const output = {
      generatedAt: new Date().toISOString(),
      since: since?.toISOString(),
      repository: options.repository,
      timings: filteredTimings,
      bottleneck: identifyBottleneck(filteredTimings),
      metrics: {
        eventsTotal: sdlcMetrics.eventsTotal.get(),
        activeStages: sdlcMetrics.activeStages.size,
      },
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Console output
  console.log(chalk.bold('\nSDLC Stage Timings'));
  console.log(chalk.gray(`Since: ${since?.toISOString() ?? 'all time'}`));
  if (options.repository) {
    console.log(chalk.gray(`Repository: ${options.repository}`));
  }
  console.log();

  if (filteredTimings.length === 0) {
    console.log(chalk.yellow('No SDLC events found for the specified period.'));
    console.log(chalk.gray('\nTip: SDLC events are emitted when using gwi commands like:'));
    console.log(chalk.gray('  gwi triage <pr-url>      (planning stage)'));
    console.log(chalk.gray('  gwi issue-to-code <url>  (coding stage)'));
    console.log(chalk.gray('  gwi review <pr-url>      (review stage)'));
    return;
  }

  // Table header
  const header = `${chalk.gray('Status')} ${'Stage'.padEnd(12)} ${'Count'.padStart(7)} ${'Success'.padStart(9)} ${'Failed'.padStart(8)} ${'Avg'.padStart(10)} ${'P50'.padStart(10)} ${'P95'.padStart(10)} ${'P99'.padStart(10)}`;
  console.log(header);
  console.log(chalk.gray('─'.repeat(100)));

  // Table rows
  for (const timing of filteredTimings) {
    const indicator = getStageIndicator(timing);
    const successRate =
      timing.count > 0 ? `${((timing.completedCount / timing.count) * 100).toFixed(0)}%` : '-';
    const failureRate =
      timing.count > 0 ? `${((timing.failedCount / timing.count) * 100).toFixed(0)}%` : '-';

    const row = [
      `  ${indicator}   `,
      timing.stage.padEnd(12),
      String(timing.count).padStart(7),
      successRate.padStart(9),
      (timing.failedCount > 0 ? chalk.red(failureRate) : failureRate).padStart(8),
      formatDuration(timing.avgDurationMs).padStart(10),
      formatDuration(timing.p50DurationMs).padStart(10),
      formatDuration(timing.p95DurationMs).padStart(10),
      formatDuration(timing.p99DurationMs).padStart(10),
    ].join(' ');

    console.log(row);
  }

  console.log(chalk.gray('─'.repeat(100)));

  // Bottleneck identification
  const bottleneck = identifyBottleneck(filteredTimings);
  if (bottleneck) {
    console.log();
    console.log(
      chalk.yellow('⚠ Bottleneck identified: ') +
        chalk.bold(bottleneck.stage) +
        chalk.gray(` (P95: ${formatDuration(bottleneck.p95DurationMs)})`)
    );

    if (options.verbose) {
      console.log();
      console.log(chalk.gray('Recommendations:'));
      switch (bottleneck.stage) {
        case 'coding':
          console.log(chalk.gray('  - Consider breaking large changes into smaller PRs'));
          console.log(chalk.gray('  - Review agent model selection for complex tasks'));
          break;
        case 'review':
          console.log(chalk.gray('  - Enable parallel review for multiple files'));
          console.log(chalk.gray('  - Use local review for faster feedback'));
          break;
        case 'testing':
          console.log(chalk.gray('  - Run tests in parallel where possible'));
          console.log(chalk.gray('  - Consider test suite optimization'));
          break;
        case 'release':
          console.log(chalk.gray('  - Automate release checklist items'));
          console.log(chalk.gray('  - Consider automated semantic versioning'));
          break;
        default:
          console.log(chalk.gray('  - Analyze stage events for specific improvement areas'));
      }
    }
  }

  // Summary
  console.log();
  const totalEvents = filteredTimings.reduce((sum, t) => sum + t.count, 0);
  const totalSuccess = filteredTimings.reduce((sum, t) => sum + t.completedCount, 0);
  const overallSuccessRate = totalEvents > 0 ? ((totalSuccess / totalEvents) * 100).toFixed(1) : '0';

  console.log(chalk.gray(`Total events: ${totalEvents}`));
  console.log(chalk.gray(`Overall success rate: ${overallSuccessRate}%`));
  console.log(chalk.gray(`Active stages: ${sdlcMetrics.activeStages.size}`));

  if (!options.verbose) {
    console.log();
    console.log(chalk.gray('Tip: Use --verbose for recommendations'));
  }
}

/**
 * Execute metrics summary (for dashboard/quick view)
 */
export async function metricsSummaryCommand(): Promise<{
  stageCount: number;
  totalEvents: number;
  successRate: number;
  bottleneck: string | null;
}> {
  const store = getSDLCEventStore();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const timings = await store.getStageTimings({ since });
  const totalEvents = timings.reduce((sum, t) => sum + t.count, 0);
  const totalSuccess = timings.reduce((sum, t) => sum + t.completedCount, 0);
  const bottleneck = identifyBottleneck(timings);

  return {
    stageCount: timings.length,
    totalEvents,
    successRate: totalEvents > 0 ? (totalSuccess / totalEvents) * 100 : 100,
    bottleneck: bottleneck?.stage ?? null,
  };
}
