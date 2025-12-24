#!/usr/bin/env node
/**
 * Auto-Fix Health Monitoring Script
 *
 * Comprehensive health monitoring for auto-fix workflow execution.
 * Analyzes workflow runs, database health, and performance metrics.
 * Generates alerts using GitHubAlerts library.
 *
 * Usage:
 *   npx tsx scripts/monitor-autofix-health.ts [options]
 *
 * Options:
 *   --workflow-runs=<json>    JSON data from GitHub Actions workflow runs
 *   --db-health=<json>        JSON data from database health check
 *   --performance=<json>      JSON data from performance metrics
 *   --output-json             Output results as JSON
 *   --dry-run                 Run without creating alerts
 */

import { createAlerter, GitHubAlerts } from './github-alerts';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  run_started_at: string | null;
  duration: number | null;
  html_url: string;
}

interface WorkflowRunsData {
  total_runs: number;
  successful: number;
  failed: number;
  in_progress: number;
  runs: WorkflowRun[];
}

interface DatabaseHealth {
  exists: boolean | string;
  size_mb: number | string;
  table_count: number | string;
  total_runs: number | string;
  recent_errors: number | string;
  stuck_runs: number | string;
  integrity: string;
  integrity_detail?: string;
}

interface PerformanceMetrics {
  avg_duration: number | string;
  p95_duration: number | string;
  failure_rate: number | string;
  success_rate: number | string;
  total_runs: number;
  in_progress: number;
}

interface HealthAlert {
  type: 'error' | 'warning' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  remediation: string[];
}

interface HealthReport {
  timestamp: string;
  status: 'healthy' | 'degraded' | 'critical';
  summary: string;
  metrics: {
    workflow: PerformanceMetrics;
    database: DatabaseHealth;
  };
  alerts: HealthAlert[];
  recommendations: string[];
}

// ============================================================================
// Configuration
// ============================================================================

const THRESHOLDS = {
  FAILURE_RATE: 20, // Alert if >20% failure rate
  SLOW_PERFORMANCE_MULTIPLIER: 2.0, // Alert if >2x baseline
  DB_SIZE_MB: 100, // Alert if >100MB
  STUCK_RUN_HOURS: 2, // Alert if run stuck >2 hours
  MIN_RUNS_FOR_ANALYSIS: 5, // Minimum runs needed for statistical analysis
  BASELINE_DURATION_SECONDS: 300, // 5 minute baseline
};

// ============================================================================
// Health Analysis Functions
// ============================================================================

/**
 * Analyze workflow run health
 */
function analyzeWorkflowHealth(data: WorkflowRunsData): HealthAlert[] {
  const alerts: HealthAlert[] = [];

  if (data.total_runs === 0) {
    alerts.push({
      type: 'info',
      severity: 'low',
      title: 'No Recent Workflow Runs',
      message: 'No auto-fix workflow runs found in the monitoring period. This is normal for new setups.',
      remediation: [
        'If auto-fix is expected to run, verify workflow triggers are configured',
        'Check if auto-fix workflow file exists at .github/workflows/auto-fix.yml',
        'Ensure issues are being labeled with "auto-fix" label',
      ],
    });
    return alerts;
  }

  // Check failure rate
  const failureRate = (data.failed / data.total_runs) * 100;
  if (failureRate > THRESHOLDS.FAILURE_RATE) {
    alerts.push({
      type: 'error',
      severity: 'high',
      title: 'High Failure Rate Detected',
      message: `Failure rate is ${failureRate.toFixed(2)}% (${data.failed}/${data.total_runs} runs), exceeding threshold of ${THRESHOLDS.FAILURE_RATE}%`,
      remediation: [
        'Review failed workflow runs for common error patterns',
        'Check AI provider API quotas and rate limits',
        'Verify database connectivity and integrity',
        'Review recent code changes that may affect reliability',
        'Check external service status (GitHub, AI providers)',
      ],
    });
  }

  // Check for stuck runs
  if (data.in_progress > 3) {
    alerts.push({
      type: 'warning',
      severity: 'medium',
      title: 'Multiple Concurrent Runs',
      message: `${data.in_progress} workflow runs are currently in progress. This may indicate slow performance or stuck runs.`,
      remediation: [
        'Review in-progress runs to identify if they are legitimately running',
        'Cancel any hung or stale workflow runs',
        'Check for resource constraints (CPU, memory, API rate limits)',
        'Consider adding workflow timeout limits',
      ],
    });
  }

  // Check success rate for statistical significance
  if (data.total_runs >= THRESHOLDS.MIN_RUNS_FOR_ANALYSIS) {
    const successRate = (data.successful / data.total_runs) * 100;
    if (successRate < 50) {
      alerts.push({
        type: 'error',
        severity: 'critical',
        title: 'Very Low Success Rate',
        message: `Success rate is only ${successRate.toFixed(2)}%. Auto-fix is failing more often than succeeding.`,
        remediation: [
          'IMMEDIATE: Review system logs for critical failures',
          'Verify all required environment variables are set',
          'Check AI provider API keys are valid and not expired',
          'Verify database schema is up to date',
          'Consider disabling auto-fix until issues are resolved',
        ],
      });
    }
  }

  return alerts;
}

/**
 * Analyze performance metrics
 */
function analyzePerformance(data: PerformanceMetrics, runs: WorkflowRun[]): HealthAlert[] {
  const alerts: HealthAlert[] = [];

  const avgDuration = parseFloat(String(data.avg_duration));
  const p95Duration = parseFloat(String(data.p95_duration));

  // Check for slow performance
  if (avgDuration > THRESHOLDS.BASELINE_DURATION_SECONDS * THRESHOLDS.SLOW_PERFORMANCE_MULTIPLIER) {
    alerts.push({
      type: 'warning',
      severity: 'medium',
      title: 'Slow Performance Detected',
      message: `Average duration is ${avgDuration.toFixed(2)}s, which is ${(avgDuration / THRESHOLDS.BASELINE_DURATION_SECONDS).toFixed(2)}x the baseline of ${THRESHOLDS.BASELINE_DURATION_SECONDS}s`,
      remediation: [
        'Review AI provider response times for slowness',
        'Check if large files or repositories are being processed',
        'Consider optimizing AI prompts to reduce token usage',
        'Verify network connectivity to AI providers',
        'Check for database query performance issues',
      ],
    });
  }

  // Check for high variance in duration (P95 >> average)
  if (runs.length >= THRESHOLDS.MIN_RUNS_FOR_ANALYSIS && p95Duration > avgDuration * 3) {
    alerts.push({
      type: 'warning',
      severity: 'low',
      title: 'High Performance Variance',
      message: `P95 duration (${p95Duration.toFixed(2)}s) is much higher than average (${avgDuration.toFixed(2)}s), indicating inconsistent performance`,
      remediation: [
        'Identify which runs are taking longest and investigate why',
        'Check for correlation between duration and issue complexity',
        'Review AI provider rate limiting patterns',
        'Consider implementing performance budgets per run',
      ],
    });
  }

  return alerts;
}

/**
 * Analyze database health
 */
function analyzeDatabaseHealth(data: DatabaseHealth): HealthAlert[] {
  const alerts: HealthAlert[] = [];

  // Check if database exists
  if (data.exists === false || data.exists === 'false') {
    alerts.push({
      type: 'info',
      severity: 'low',
      title: 'Database Not Initialized',
      message: 'Monitoring database does not exist yet. This is normal for new installations.',
      remediation: [
        'Database will be created automatically on first auto-fix run',
        'Ensure db/schema.sql exists in the repository',
        'Verify write permissions for database directory',
      ],
    });
    return alerts;
  }

  // Check integrity
  if (data.integrity && data.integrity !== 'ok' && data.integrity !== 'Unknown') {
    alerts.push({
      type: 'error',
      severity: 'critical',
      title: 'Database Integrity Check Failed',
      message: `Database integrity check returned: ${data.integrity}. The database may be corrupted.`,
      remediation: [
        'IMMEDIATE: Create backup of current database',
        'Run: cp autofix-monitor.db autofix-monitor.db.backup',
        'Attempt recovery using SQLite .recover command',
        'Restore from last known good backup if recovery fails',
        'Review disk space and file system health',
      ],
    });
  }

  // Check size
  const sizeMb = parseFloat(String(data.size_mb));
  if (!isNaN(sizeMb) && sizeMb > THRESHOLDS.DB_SIZE_MB) {
    alerts.push({
      type: 'warning',
      severity: 'medium',
      title: 'Large Database Size',
      message: `Database size is ${sizeMb.toFixed(2)} MB, approaching threshold of ${THRESHOLDS.DB_SIZE_MB} MB`,
      remediation: [
        'Archive runs older than 90 days to JSON files',
        'Delete archived runs from database',
        'Run VACUUM to reclaim space',
        'Consider implementing automatic archival policy',
        'SQL: DELETE FROM autofix_runs WHERE created_at < datetime("now", "-90 days");',
      ],
    });
  }

  // Check for stuck runs
  const stuckRuns = parseInt(String(data.stuck_runs)) || 0;
  if (stuckRuns > 0) {
    alerts.push({
      type: 'warning',
      severity: 'high',
      title: 'Stuck Workflow Runs Detected',
      message: `Found ${stuckRuns} runs stuck in 'running' state for over ${THRESHOLDS.STUCK_RUN_HOURS} hours`,
      remediation: [
        'Check GitHub Actions for hung workflows',
        'Manually cancel stuck workflow runs',
        'Update database to mark stuck runs as failed',
        `SQL: UPDATE autofix_runs SET status='failure', error_message='Stuck run timeout' WHERE status='running' AND started_at < datetime('now', '-${THRESHOLDS.STUCK_RUN_HOURS} hours');`,
        'Add workflow timeout limits to prevent future hangs',
      ],
    });
  }

  return alerts;
}

/**
 * Generate overall health recommendations
 */
function generateRecommendations(alerts: HealthAlert[]): string[] {
  const recommendations: string[] = [];

  // Count alerts by severity
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const highCount = alerts.filter((a) => a.severity === 'high').length;
  const mediumCount = alerts.filter((a) => a.severity === 'medium').length;

  if (criticalCount > 0) {
    recommendations.push('URGENT: Address critical alerts immediately to prevent data loss or system failure');
  }

  if (highCount > 0) {
    recommendations.push('Review and resolve high-severity alerts within 24 hours');
  }

  if (mediumCount > 2) {
    recommendations.push('Multiple medium-severity issues detected - schedule maintenance window to address');
  }

  if (alerts.length === 0) {
    recommendations.push('All systems healthy - no action required');
    recommendations.push('Continue monitoring on regular schedule');
  } else {
    recommendations.push('Review alert remediation steps and execute appropriate fixes');
    recommendations.push('Monitor metrics after fixes to verify improvements');
  }

  // General recommendations
  recommendations.push('Maintain regular backups of monitoring database');
  recommendations.push('Review auto-fix configuration for optimization opportunities');

  return recommendations;
}

/**
 * Determine overall system status
 */
function determineSystemStatus(alerts: HealthAlert[]): 'healthy' | 'degraded' | 'critical' {
  const hasCritical = alerts.some((a) => a.severity === 'critical');
  const hasHigh = alerts.some((a) => a.severity === 'high');
  const hasMedium = alerts.some((a) => a.severity === 'medium');

  if (hasCritical) return 'critical';
  if (hasHigh || hasMedium) return 'degraded';
  return 'healthy';
}

// ============================================================================
// Main Health Check
// ============================================================================

async function runHealthCheck(
  workflowData: WorkflowRunsData,
  dbHealth: DatabaseHealth,
  performance: PerformanceMetrics
): Promise<HealthReport> {
  const alerts: HealthAlert[] = [];

  // Analyze each component
  alerts.push(...analyzeWorkflowHealth(workflowData));
  alerts.push(...analyzePerformance(performance, workflowData.runs));
  alerts.push(...analyzeDatabaseHealth(dbHealth));

  // Generate recommendations
  const recommendations = generateRecommendations(alerts);

  // Determine overall status
  const status = determineSystemStatus(alerts);

  // Generate summary
  let summary = '';
  if (status === 'healthy') {
    summary = 'All auto-fix systems are operating normally';
  } else if (status === 'degraded') {
    summary = `Auto-fix systems are degraded with ${alerts.length} alerts requiring attention`;
  } else {
    summary = `CRITICAL: Auto-fix systems require immediate attention - ${alerts.filter((a) => a.severity === 'critical').length} critical alerts`;
  }

  return {
    timestamp: new Date().toISOString(),
    status,
    summary,
    metrics: {
      workflow: performance,
      database: dbHealth,
    },
    alerts,
    recommendations,
  };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let workflowRunsJson = '{"total_runs":0,"successful":0,"failed":0,"in_progress":0,"runs":[]}';
  let dbHealthJson = '{"exists":false,"size_mb":0,"table_count":0,"total_runs":0}';
  let performanceJson = '{"avg_duration":0,"p95_duration":0,"failure_rate":0,"success_rate":0,"total_runs":0,"in_progress":0}';
  let outputJson = false;
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--workflow-runs=')) {
      workflowRunsJson = arg.substring('--workflow-runs='.length);
    } else if (arg.startsWith('--db-health=')) {
      dbHealthJson = arg.substring('--db-health='.length);
    } else if (arg.startsWith('--performance=')) {
      performanceJson = arg.substring('--performance='.length);
    } else if (arg === '--output-json') {
      outputJson = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  // Parse JSON inputs
  const workflowData: WorkflowRunsData = JSON.parse(workflowRunsJson);
  const dbHealth: DatabaseHealth = JSON.parse(dbHealthJson);
  const performance: PerformanceMetrics = JSON.parse(performanceJson);

  // Run health check
  const report = await runHealthCheck(workflowData, dbHealth, performance);

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    // Human-readable output
    console.log('\n='.repeat(80));
    console.log('AUTO-FIX HEALTH MONITORING REPORT');
    console.log('='.repeat(80));
    console.log(`\nTimestamp: ${report.timestamp}`);
    console.log(`Status: ${report.status.toUpperCase()}`);
    console.log(`\n${report.summary}\n`);

    if (report.alerts.length > 0) {
      console.log('\nALERTS:');
      console.log('-'.repeat(80));
      for (const alert of report.alerts) {
        const icon = alert.type === 'error' ? '❌' : alert.type === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`\n${icon} [${alert.severity.toUpperCase()}] ${alert.title}`);
        console.log(`   ${alert.message}`);
        console.log(`   Remediation:`);
        for (const step of alert.remediation) {
          console.log(`   - ${step}`);
        }
      }
    }

    console.log('\n\nRECOMMENDATIONS:');
    console.log('-'.repeat(80));
    for (let i = 0; i < report.recommendations.length; i++) {
      console.log(`${i + 1}. ${report.recommendations[i]}`);
    }

    console.log('\n' + '='.repeat(80) + '\n');
  }

  // Exit with appropriate code
  if (report.status === 'critical') {
    process.exit(2);
  } else if (report.status === 'degraded') {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Health check failed:', error);
    process.exit(3);
  });
}

// ============================================================================
// Exports
// ============================================================================

export {
  runHealthCheck,
  analyzeWorkflowHealth,
  analyzePerformance,
  analyzeDatabaseHealth,
  generateRecommendations,
  determineSystemStatus,
  type WorkflowRunsData,
  type DatabaseHealth,
  type PerformanceMetrics,
  type HealthAlert,
  type HealthReport,
};
