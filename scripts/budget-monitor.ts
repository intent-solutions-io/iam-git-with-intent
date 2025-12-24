#!/usr/bin/env node
/**
 * Budget Monitoring Script
 *
 * Queries SQLite analytics database for cost metrics and alerts on budget thresholds.
 * Used by the auto-fix-budget.yml workflow.
 */

import { DatabaseConnection } from '../packages/core/src/database/connection';
import { createAnalyticsQueries, CostMetrics } from '../packages/core/src/database/analytics';
import { createAlerter } from './github-alerts';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface BudgetConfig {
  monthlyBudgetUsd: number;
  warningThresholdPercent: number; // Alert when budget usage exceeds this percentage
  criticalThresholdPercent: number; // Critical alert threshold
  dbPath: string;
}

export interface BudgetAnalysis {
  currentMonthSpend: number;
  projectedMonthlySpend: number;
  budgetUsedPercent: number;
  daysIntoMonth: number;
  daysRemainingInMonth: number;
  status: 'ok' | 'warning' | 'critical' | 'exceeded';
  recommendations: string[];
  costBreakdown: {
    byProvider: Record<string, number>;
    byRepo: Array<{ repo: string; cost: number; runs: number }>;
    topExpensiveRuns: Array<{ period: string; cost: number; runs: number }>;
  };
}

// ============================================================================
// Budget Analysis Functions
// ============================================================================

/**
 * Calculate days into and remaining in current month
 */
function getMonthProgress(): { daysInto: number; daysRemaining: number; totalDays: number } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();
  const daysInto = now.getDate();
  const daysRemaining = totalDays - daysInto;

  return { daysInto, daysRemaining, totalDays };
}

/**
 * Analyze budget usage and generate recommendations
 */
export async function analyzeBudget(config: BudgetConfig): Promise<BudgetAnalysis> {
  // Connect to database
  const dbConnection = new DatabaseConnection({
    path: config.dbPath,
    readonly: true,
    fileMustExist: true
  });

  const db = dbConnection.getConnection();
  const analytics = createAnalyticsQueries(db);

  // Get current month date range
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstOfMonthStr = firstOfMonth.toISOString().split('T')[0];

  // Get cost metrics for current month
  const monthlyCosts = analytics.getCostMetrics('monthly', {
    date_from: firstOfMonthStr
  });

  const currentMonthData = monthlyCosts.length > 0 ? monthlyCosts[0] : {
    period: '',
    total_runs: 0,
    total_cost_usd: 0,
    avg_cost_per_run: 0,
    total_tokens: 0,
    avg_tokens_per_run: 0,
    anthropic_cost: 0,
    google_cost: 0,
    openai_cost: 0,
    groq_cost: 0
  };

  const currentMonthSpend = currentMonthData.total_cost_usd;

  // Calculate projection
  const { daysInto, daysRemaining, totalDays } = getMonthProgress();
  const dailyAverage = daysInto > 0 ? currentMonthSpend / daysInto : 0;
  const projectedMonthlySpend = dailyAverage * totalDays;

  // Calculate budget usage percentage
  const budgetUsedPercent = (currentMonthSpend / config.monthlyBudgetUsd) * 100;

  // Determine status
  let status: BudgetAnalysis['status'] = 'ok';
  if (currentMonthSpend > config.monthlyBudgetUsd) {
    status = 'exceeded';
  } else if (budgetUsedPercent >= config.criticalThresholdPercent) {
    status = 'critical';
  } else if (budgetUsedPercent >= config.warningThresholdPercent) {
    status = 'warning';
  }

  // Get cost breakdown by provider
  const costBreakdown = {
    byProvider: {
      anthropic: currentMonthData.anthropic_cost,
      google: currentMonthData.google_cost,
      openai: currentMonthData.openai_cost,
      groq: currentMonthData.groq_cost
    },
    byRepo: [] as Array<{ repo: string; cost: number; runs: number }>,
    topExpensiveRuns: [] as Array<{ period: string; cost: number; runs: number }>
  };

  // Get daily costs for trending
  const dailyCosts = analytics.getCostMetrics('daily', {
    date_from: firstOfMonthStr
  });

  costBreakdown.topExpensiveRuns = dailyCosts
    .sort((a, b) => b.total_cost_usd - a.total_cost_usd)
    .slice(0, 5)
    .map(day => ({
      period: day.period,
      cost: day.total_cost_usd,
      runs: day.total_runs
    }));

  // Get repository breakdown
  const repoStats = analytics.getRepoLeaderboard(10);
  costBreakdown.byRepo = repoStats.map(repo => ({
    repo: `${repo.repo_owner}/${repo.repo_name}`,
    cost: repo.total_cost_usd,
    runs: repo.total_runs
  }));

  // Generate recommendations
  const recommendations: string[] = [];

  if (status === 'exceeded') {
    recommendations.push('Budget exceeded! Immediate action required to reduce spending.');
    recommendations.push('Consider temporarily disabling auto-fix on high-cost repositories.');
  } else if (status === 'critical') {
    recommendations.push('Approaching budget limit. Review and optimize high-cost operations.');
  } else if (status === 'warning') {
    recommendations.push('Budget usage is higher than expected. Monitor closely.');
  }

  // Analyze cost per run
  if (currentMonthData.avg_cost_per_run > 0.10) {
    recommendations.push(`Average cost per run ($${currentMonthData.avg_cost_per_run.toFixed(4)}) is high. Consider optimizing prompt complexity or using more efficient models.`);
  }

  // Analyze provider costs
  const totalProviderCost = currentMonthData.anthropic_cost + currentMonthData.google_cost + currentMonthData.openai_cost + currentMonthData.groq_cost;
  if (totalProviderCost > 0) {
    const anthropicPercent = (currentMonthData.anthropic_cost / totalProviderCost) * 100;
    if (anthropicPercent > 70) {
      recommendations.push('Anthropic accounts for most costs. Consider using Google (Gemini Flash) for simpler tasks.');
    }
  }

  // Analyze repository costs
  if (costBreakdown.byRepo.length > 0) {
    const topRepo = costBreakdown.byRepo[0];
    const topRepoPercent = (topRepo.cost / currentMonthSpend) * 100;
    if (topRepoPercent > 50) {
      recommendations.push(`Repository ${topRepo.repo} accounts for ${topRepoPercent.toFixed(1)}% of costs. Review auto-fix usage patterns.`);
    }
  }

  // Projection-based recommendations
  if (projectedMonthlySpend > config.monthlyBudgetUsd * 1.1) {
    recommendations.push(`Projected monthly spend ($${projectedMonthlySpend.toFixed(2)}) will exceed budget by ${((projectedMonthlySpend / config.monthlyBudgetUsd - 1) * 100).toFixed(1)}%.`);
    recommendations.push('Consider implementing rate limits or repository-level budgets.');
  }

  // Close database connection
  dbConnection.close();

  return {
    currentMonthSpend,
    projectedMonthlySpend,
    budgetUsedPercent,
    daysIntoMonth: daysInto,
    daysRemainingInMonth: daysRemaining,
    status,
    recommendations,
    costBreakdown
  };
}

/**
 * Format budget analysis as markdown for GitHub issue
 */
export function formatBudgetReport(analysis: BudgetAnalysis, config: BudgetConfig): string {
  const statusIcon = {
    ok: '✅',
    warning: '⚠️',
    critical: '🚨',
    exceeded: '🛑'
  }[analysis.status];

  let report = `## ${statusIcon} Budget Status: ${analysis.status.toUpperCase()}\n\n`;

  // Summary section
  report += `### Summary\n`;
  report += `- **Budget**: $${config.monthlyBudgetUsd.toFixed(2)}/month\n`;
  report += `- **Current Spend**: $${analysis.currentMonthSpend.toFixed(2)} (${analysis.budgetUsedPercent.toFixed(1)}% used)\n`;
  report += `- **Projected Monthly**: $${analysis.projectedMonthlySpend.toFixed(2)}\n`;
  report += `- **Days Into Month**: ${analysis.daysIntoMonth} (${analysis.daysRemainingInMonth} remaining)\n`;
  report += `- **Daily Average**: $${(analysis.currentMonthSpend / analysis.daysIntoMonth).toFixed(2)}/day\n\n`;

  // Cost breakdown by provider
  report += `### Cost Breakdown by AI Provider\n`;
  const providers = Object.entries(analysis.costBreakdown.byProvider)
    .filter(([_, cost]) => cost > 0)
    .sort((a, b) => b[1] - a[1]);

  if (providers.length > 0) {
    providers.forEach(([provider, cost]) => {
      const percent = (cost / analysis.currentMonthSpend) * 100;
      report += `- **${provider}**: $${cost.toFixed(2)} (${percent.toFixed(1)}%)\n`;
    });
  } else {
    report += `No costs recorded yet this month.\n`;
  }
  report += `\n`;

  // Cost breakdown by repository
  report += `### Top Repositories by Cost\n`;
  if (analysis.costBreakdown.byRepo.length > 0) {
    analysis.costBreakdown.byRepo.slice(0, 5).forEach((repo, index) => {
      const percent = (repo.cost / analysis.currentMonthSpend) * 100;
      report += `${index + 1}. **${repo.repo}**: $${repo.cost.toFixed(2)} (${repo.runs} runs, ${percent.toFixed(1)}% of total)\n`;
    });
  } else {
    report += `No repository data available.\n`;
  }
  report += `\n`;

  // Most expensive days
  if (analysis.costBreakdown.topExpensiveRuns.length > 0) {
    report += `### Most Expensive Days\n`;
    analysis.costBreakdown.topExpensiveRuns.forEach((day, index) => {
      report += `${index + 1}. **${day.period}**: $${day.cost.toFixed(2)} (${day.runs} runs)\n`;
    });
    report += `\n`;
  }

  // Recommendations
  if (analysis.recommendations.length > 0) {
    report += `### 📋 Recommendations\n`;
    analysis.recommendations.forEach(rec => {
      report += `- ${rec}\n`;
    });
    report += `\n`;
  }

  // Action items based on status
  report += `### 🎯 Action Items\n`;
  if (analysis.status === 'exceeded') {
    report += `- [ ] Immediately review and disable auto-fix on high-cost repositories\n`;
    report += `- [ ] Investigate recent expensive runs\n`;
    report += `- [ ] Consider increasing budget or implementing stricter controls\n`;
  } else if (analysis.status === 'critical') {
    report += `- [ ] Review recent auto-fix usage patterns\n`;
    report += `- [ ] Optimize AI model selection (use Gemini Flash for simpler tasks)\n`;
    report += `- [ ] Consider implementing per-repository budget limits\n`;
  } else if (analysis.status === 'warning') {
    report += `- [ ] Monitor daily spending closely\n`;
    report += `- [ ] Review high-cost repositories for optimization opportunities\n`;
    report += `- [ ] Ensure auto-fix is only running on appropriate PRs\n`;
  }

  report += `\n---\n*Auto-generated by budget-monitor.ts at ${new Date().toISOString()}*\n`;

  return report;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Configuration
  const config: BudgetConfig = {
    monthlyBudgetUsd: parseFloat(process.env.BUDGET_THRESHOLD_USD || '100'),
    warningThresholdPercent: parseFloat(process.env.WARNING_THRESHOLD_PERCENT || '80'),
    criticalThresholdPercent: parseFloat(process.env.CRITICAL_THRESHOLD_PERCENT || '95'),
    dbPath: process.env.DB_PATH || path.join(process.cwd(), '.gwi', 'analytics.db')
  };

  // Check if database exists
  if (!fs.existsSync(config.dbPath)) {
    console.error(`Database not found at ${config.dbPath}`);
    console.log('No budget monitoring available - database does not exist yet.');
    process.exit(0); // Exit gracefully for new installations
  }

  console.log('Budget Monitoring');
  console.log('='.repeat(50));
  console.log(`Database: ${config.dbPath}`);
  console.log(`Budget: $${config.monthlyBudgetUsd}/month`);
  console.log(`Warning threshold: ${config.warningThresholdPercent}%`);
  console.log(`Critical threshold: ${config.criticalThresholdPercent}%`);
  console.log('');

  try {
    // Analyze budget
    const analysis = await analyzeBudget(config);

    // Print report
    const report = formatBudgetReport(analysis, config);
    console.log(report);

    // Create GitHub issue if threshold exceeded
    if (analysis.status === 'warning' || analysis.status === 'critical' || analysis.status === 'exceeded') {
      console.log('');
      console.log('Creating GitHub alert...');

      try {
        const alerter = createAlerter();

        // Check if there's already an open budget issue
        const issueTitle = `[Budget Alert] ${analysis.budgetUsedPercent.toFixed(1)}% of Monthly Budget Used`;

        const issueNumber = await alerter.createIssue({
          title: issueTitle,
          body: report,
          labels: ['alert', 'budget', 'auto-fix', analysis.status === 'exceeded' ? 'p0' : analysis.status === 'critical' ? 'p1' : 'p2']
        });

        console.log(`Created issue #${issueNumber}`);
      } catch (error) {
        console.error('Failed to create GitHub issue:', error);
        // Don't fail the workflow if issue creation fails
      }
    }

    // Exit with appropriate code
    if (analysis.status === 'exceeded') {
      process.exit(2); // Budget exceeded
    } else if (analysis.status === 'critical') {
      process.exit(1); // Critical warning
    } else {
      process.exit(0); // OK or warning (non-blocking)
    }

  } catch (error) {
    console.error('Budget analysis failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
