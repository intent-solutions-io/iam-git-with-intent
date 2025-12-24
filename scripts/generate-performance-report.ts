#!/usr/bin/env node
/**
 * Performance Report Generator
 *
 * Generates comprehensive weekly performance reports from auto-fix analytics.
 * Posts reports to GitHub Discussions for transparency and collaboration.
 */

import Database from 'better-sqlite3';
import { createAnalyticsQueries } from '../packages/core/src/database/analytics';
import type {
  SuccessRateMetrics,
  CostMetrics,
  GradeDistribution,
  PerformanceMetrics,
  QualityTrends,
  TopIssues,
  RepoLeaderboard,
} from '../packages/core/src/database/analytics';

// ============================================================================
// Types
// ============================================================================

interface ReportConfig {
  dbPath: string;
  weekOffset: number; // 0 = current week, 1 = last week, etc.
  includeCharts: boolean;
}

interface WeeklyReport {
  title: string;
  summary: string;
  successRates: SuccessRateMetrics[];
  costMetrics: CostMetrics[];
  gradeDistribution: GradeDistribution[];
  performanceMetrics: PerformanceMetrics[];
  qualityTrends: QualityTrends[];
  topErrors: TopIssues[];
  leaderboard: RepoLeaderboard[];
  weekOverWeek: WeekOverWeekComparison;
}

interface WeekOverWeekComparison {
  runsDelta: number;
  successRateDelta: number;
  costDelta: number;
  avgGradeDelta: number;
}

// ============================================================================
// Date Utilities
// ============================================================================

function getWeekRange(weekOffset: number = 0): { start: string; end: string } {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Calculate the most recent Monday (start of week)
  const daysToMonday = currentDay === 0 ? 6 : currentDay - 1; // If Sunday, go back 6 days
  const mostRecentMonday = new Date(now);
  mostRecentMonday.setDate(now.getDate() - daysToMonday - (weekOffset * 7));
  mostRecentMonday.setHours(0, 0, 0, 0);

  // Calculate Sunday (end of week)
  const sunday = new Date(mostRecentMonday);
  sunday.setDate(mostRecentMonday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return {
    start: mostRecentMonday.toISOString(),
    end: sunday.toISOString(),
  };
}

function formatWeekLabel(weekOffset: number = 0): string {
  const { start, end } = getWeekRange(weekOffset);
  const startDate = new Date(start);
  const endDate = new Date(end);

  const formatDate = (d: Date) => {
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = d.getDate();
    return `${month} ${day}`;
  };

  return `${formatDate(startDate)} - ${formatDate(endDate)}, ${startDate.getFullYear()}`;
}

// ============================================================================
// Report Generator
// ============================================================================

class PerformanceReportGenerator {
  private analytics: ReturnType<typeof createAnalyticsQueries>;

  constructor(private db: Database.Database) {
    this.analytics = createAnalyticsQueries(db);
  }

  /**
   * Generate complete weekly report
   */
  generateWeeklyReport(config: ReportConfig): WeeklyReport {
    const weekRange = getWeekRange(config.weekOffset);
    const prevWeekRange = getWeekRange(config.weekOffset + 1);

    // Current week data
    const successRates = this.analytics.getSuccessRateByRepo({
      date_from: weekRange.start,
      date_to: weekRange.end,
    });

    const costMetrics = this.analytics.getCostMetrics('weekly', {
      date_from: weekRange.start,
      date_to: weekRange.end,
    });

    const gradeDistribution = this.analytics.getGradeDistribution({
      date_from: weekRange.start,
      date_to: weekRange.end,
    });

    const performanceMetrics = this.analytics.getPerformanceMetrics();

    const qualityTrends = this.analytics.getQualityTrends('weekly', {
      date_from: weekRange.start,
      date_to: weekRange.end,
    });

    const topErrors = this.analytics.getTopErrors(10);

    const leaderboard = this.analytics.getRepoLeaderboard(10);

    // Previous week for comparison
    const prevWeekStats = this.analytics.getSummaryStats();
    const currentWeekStats = this.analytics.getSummaryStats();

    const weekOverWeek: WeekOverWeekComparison = {
      runsDelta: currentWeekStats.total_runs - prevWeekStats.total_runs,
      successRateDelta: currentWeekStats.success_rate - prevWeekStats.success_rate,
      costDelta: currentWeekStats.total_cost_usd - prevWeekStats.total_cost_usd,
      avgGradeDelta: currentWeekStats.avg_grade - prevWeekStats.avg_grade,
    };

    return {
      title: `Auto-Fix Performance Report - ${formatWeekLabel(config.weekOffset)}`,
      summary: this.generateSummary(currentWeekStats),
      successRates,
      costMetrics,
      gradeDistribution,
      performanceMetrics,
      qualityTrends,
      topErrors,
      leaderboard,
      weekOverWeek,
    };
  }

  /**
   * Generate executive summary
   */
  private generateSummary(stats: ReturnType<typeof this.analytics.getSummaryStats>): string {
    return `
**Total Runs:** ${stats.total_runs.toLocaleString()}
**Success Rate:** ${stats.success_rate.toFixed(1)}%
**Average Grade:** ${stats.avg_grade.toFixed(2)}/100
**Total Cost:** $${stats.total_cost_usd.toFixed(2)}
**Active Repositories:** ${stats.total_repos}
**Average Duration:** ${(stats.avg_duration_ms / 1000).toFixed(1)}s
    `.trim();
  }

  /**
   * Format report as markdown
   */
  formatAsMarkdown(report: WeeklyReport, includeCharts: boolean = true): string {
    let md = `# ${report.title}\n\n`;

    // Executive Summary
    md += `## Executive Summary\n\n`;
    md += report.summary + '\n\n';

    // Week-over-Week Comparison
    md += `## Week-over-Week Comparison\n\n`;
    md += this.formatWeekOverWeek(report.weekOverWeek);

    // Success Rates by Repository
    if (report.successRates.length > 0) {
      md += `\n## Success Rates by Repository\n\n`;
      md += this.formatSuccessRatesTable(report.successRates);
    }

    // Cost Analysis
    if (report.costMetrics.length > 0) {
      md += `\n## Cost Analysis\n\n`;
      md += this.formatCostMetrics(report.costMetrics);
      if (includeCharts) {
        md += this.generateCostChart(report.costMetrics);
      }
    }

    // Grade Distribution
    if (report.gradeDistribution.length > 0) {
      md += `\n## Grade Distribution\n\n`;
      md += this.formatGradeDistribution(report.gradeDistribution);
      if (includeCharts) {
        md += this.generateGradeChart(report.gradeDistribution);
      }
    }

    // Performance Metrics
    if (report.performanceMetrics.length > 0) {
      md += `\n## Performance Metrics\n\n`;
      md += this.formatPerformanceMetrics(report.performanceMetrics);
    }

    // Quality Trends
    if (report.qualityTrends.length > 0) {
      md += `\n## Quality Trends\n\n`;
      md += this.formatQualityTrends(report.qualityTrends);
    }

    // Top Errors
    if (report.topErrors.length > 0) {
      md += `\n## Top Errors\n\n`;
      md += this.formatTopErrors(report.topErrors);
    }

    // Repository Leaderboard
    if (report.leaderboard.length > 0) {
      md += `\n## Repository Leaderboard\n\n`;
      md += this.formatLeaderboard(report.leaderboard);
    }

    // Recommendations
    md += `\n## Recommendations\n\n`;
    md += this.generateRecommendations(report);

    // Footer
    md += `\n---\n`;
    md += `*Generated automatically by Auto-Fix Performance Reporter*\n`;
    md += `*Report Date: ${new Date().toISOString()}*\n`;

    return md;
  }

  /**
   * Format week-over-week comparison
   */
  private formatWeekOverWeek(wow: WeekOverWeekComparison): string {
    const formatDelta = (value: number, unit: string = '', showPlus: boolean = true): string => {
      const sign = value > 0 ? (showPlus ? '+' : '') : '';
      return `${sign}${value.toFixed(2)}${unit}`;
    };

    const emoji = (value: number) => (value >= 0 ? '📈' : '📉');

    return `
| Metric | Change |
|--------|--------|
| Total Runs | ${emoji(wow.runsDelta)} ${formatDelta(wow.runsDelta, '', false)} |
| Success Rate | ${emoji(wow.successRateDelta)} ${formatDelta(wow.successRateDelta, '%')} |
| Total Cost | ${emoji(-wow.costDelta)} ${formatDelta(wow.costDelta, ' USD')} |
| Average Grade | ${emoji(wow.avgGradeDelta)} ${formatDelta(wow.avgGradeDelta, ' pts')} |
    `.trim() + '\n';
  }

  /**
   * Format success rates as table
   */
  private formatSuccessRatesTable(metrics: SuccessRateMetrics[]): string {
    let md = '| Repository | Total Runs | Success Rate | Avg Duration | Avg Files |\n';
    md += '|------------|------------|--------------|--------------|----------|\n';

    for (const m of metrics.slice(0, 10)) {
      const repo = `${m.repo_owner}/${m.repo_name}`;
      const successRate = `${m.success_rate.toFixed(1)}%`;
      const duration = `${(m.avg_duration_ms / 1000).toFixed(1)}s`;
      const files = m.avg_files_changed.toFixed(1);

      md += `| ${repo} | ${m.total_runs} | ${successRate} | ${duration} | ${files} |\n`;
    }

    return md + '\n';
  }

  /**
   * Format cost metrics
   */
  private formatCostMetrics(metrics: CostMetrics[]): string {
    let md = '| Period | Runs | Total Cost | Avg Cost/Run | Anthropic | Google | OpenAI |\n';
    md += '|--------|------|------------|--------------|-----------|--------|--------|\n';

    for (const m of metrics) {
      md += `| ${m.period} | ${m.total_runs} | $${m.total_cost_usd.toFixed(2)} | $${m.avg_cost_per_run.toFixed(4)} | $${m.anthropic_cost.toFixed(2)} | $${m.google_cost.toFixed(2)} | $${m.openai_cost.toFixed(2)} |\n`;
    }

    return md + '\n';
  }

  /**
   * Generate cost trend chart (Mermaid)
   */
  private generateCostChart(metrics: CostMetrics[]): string {
    if (metrics.length === 0) return '';

    // Reverse to show chronological order
    const sorted = [...metrics].reverse();

    return `
\`\`\`mermaid
xychart-beta
    title "Cost Trends Over Time"
    x-axis [${sorted.map(m => `"${m.period}"`).join(', ')}]
    y-axis "Cost (USD)" 0 --> ${Math.max(...sorted.map(m => m.total_cost_usd)) * 1.1}
    line [${sorted.map(m => m.total_cost_usd.toFixed(2)).join(', ')}]
\`\`\`
    `.trim() + '\n';
  }

  /**
   * Format grade distribution
   */
  private formatGradeDistribution(grades: GradeDistribution[]): string {
    let md = '| Grade | Count | Percentage | Avg Score | Avg Cost | Avg Duration |\n';
    md += '|-------|-------|------------|-----------|----------|-------------|\n';

    for (const g of grades) {
      const emoji = { A: '🌟', B: '✅', C: '⚠️', D: '🔶', F: '❌' }[g.letter_grade] || '';
      md += `| ${emoji} ${g.letter_grade} | ${g.count} | ${g.percentage.toFixed(1)}% | ${g.avg_score.toFixed(1)} | $${g.avg_cost.toFixed(4)} | ${(g.avg_duration_ms / 1000).toFixed(1)}s |\n`;
    }

    return md + '\n';
  }

  /**
   * Generate grade distribution chart (Mermaid)
   */
  private generateGradeChart(grades: GradeDistribution[]): string {
    if (grades.length === 0) return '';

    return `
\`\`\`mermaid
pie title Grade Distribution
${grades.map(g => `    "${g.letter_grade}" : ${g.count}`).join('\n')}
\`\`\`
    `.trim() + '\n';
  }

  /**
   * Format performance metrics
   */
  private formatPerformanceMetrics(metrics: PerformanceMetrics[]): string {
    let md = '| Metric | P50 | P95 | P99 |\n';
    md += '|--------|-----|-----|-----|\n';

    const groups: Record<string, PerformanceMetrics[]> = {};
    for (const m of metrics) {
      const prefix = m.metric.split('_')[0];
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(m);
    }

    for (const [prefix, group] of Object.entries(groups)) {
      const p50 = group.find(m => m.metric.includes('p50'));
      const p95 = group.find(m => m.metric.includes('p95'));
      const p99 = group.find(m => m.metric.includes('p99'));

      if (p50 && p95 && p99) {
        const formatValue = (v: number, unit: string) => {
          if (unit === 'usd') return `$${v.toFixed(4)}`;
          if (unit === 'ms' && v > 1000) return `${(v / 1000).toFixed(1)}s`;
          return `${v.toFixed(0)}${unit}`;
        };

        const metricName = prefix === 'duration' ? 'Run Duration' :
                          prefix === 'ai' ? 'AI Latency' :
                          prefix === 'cost' ? 'Run Cost' : prefix;

        md += `| ${metricName} | ${formatValue(p50.value, p50.unit)} | ${formatValue(p95.value, p95.unit)} | ${formatValue(p99.value, p99.unit)} |\n`;
      }
    }

    return md + '\n';
  }

  /**
   * Format quality trends
   */
  private formatQualityTrends(trends: QualityTrends[]): string {
    let md = '| Date | Runs | Lint Pass | Typecheck Pass | Test Pass | Coverage Δ | Complexity Δ |\n';
    md += '|------|------|-----------|----------------|-----------|------------|-------------|\n';

    for (const t of trends.slice(0, 7)) {
      const formatPercent = (v: number | null) => v !== null ? `${v.toFixed(1)}%` : 'N/A';
      const formatDelta = (v: number | null) => {
        if (v === null) return 'N/A';
        const sign = v > 0 ? '+' : '';
        return `${sign}${v.toFixed(2)}`;
      };

      md += `| ${t.date} | ${t.total_runs} | ${formatPercent(t.lint_pass_rate)} | ${formatPercent(t.typecheck_pass_rate)} | ${formatPercent(t.avg_test_pass_rate)} | ${formatDelta(t.avg_coverage_delta)} | ${formatDelta(t.avg_complexity_delta)} |\n`;
    }

    return md + '\n';
  }

  /**
   * Format top errors
   */
  private formatTopErrors(errors: TopIssues[]): string {
    if (errors.length === 0) {
      return '✅ No errors recorded this week!\n\n';
    }

    let md = '| Error Type | Count | First Seen | Last Seen | Avg Latency | Total Cost |\n';
    md += '|------------|-------|------------|-----------|-------------|------------|\n';

    for (const e of errors) {
      const formatDate = (d: string) => new Date(d).toLocaleDateString();
      md += `| ${e.error_type} | ${e.count} | ${formatDate(e.first_seen)} | ${formatDate(e.last_seen)} | ${(e.avg_latency_ms / 1000).toFixed(1)}s | $${e.total_cost_usd.toFixed(2)} |\n`;
    }

    return md + '\n';
  }

  /**
   * Format repository leaderboard
   */
  private formatLeaderboard(leaderboard: RepoLeaderboard[]): string {
    let md = '| Rank | Repository | Runs | Success Rate | Avg Grade | Total Cost | Merge Rate |\n';
    md += '|------|------------|------|--------------|-----------|------------|------------|\n';

    for (let i = 0; i < leaderboard.length; i++) {
      const l = leaderboard[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const repo = `${l.repo_owner}/${l.repo_name}`;

      md += `| ${medal} | ${repo} | ${l.total_runs} | ${l.success_rate.toFixed(1)}% | ${l.avg_grade_score.toFixed(1)} | $${l.total_cost_usd.toFixed(2)} | ${l.merge_rate.toFixed(1)}% |\n`;
    }

    return md + '\n';
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(report: WeeklyReport): string {
    const recommendations: string[] = [];

    // Success rate recommendations
    const avgSuccessRate = report.successRates.reduce((sum, r) => sum + r.success_rate, 0) / report.successRates.length;
    if (avgSuccessRate < 80) {
      recommendations.push(`⚠️ **Success rate is ${avgSuccessRate.toFixed(1)}%** - Investigate common failure patterns and improve auto-fix reliability.`);
    } else if (avgSuccessRate > 95) {
      recommendations.push(`✅ **Excellent success rate at ${avgSuccessRate.toFixed(1)}%** - Consider expanding auto-fix to more complex issues.`);
    }

    // Cost recommendations
    const totalCost = report.costMetrics.reduce((sum, m) => sum + m.total_cost_usd, 0);
    const avgCostPerRun = report.costMetrics.reduce((sum, m) => sum + m.avg_cost_per_run, 0) / report.costMetrics.length;
    if (avgCostPerRun > 0.10) {
      recommendations.push(`💰 **Average cost per run is $${avgCostPerRun.toFixed(4)}** - Review model selection and prompt optimization to reduce costs.`);
    }

    // Grade recommendations
    const gradeA = report.gradeDistribution.find(g => g.letter_grade === 'A');
    const gradeF = report.gradeDistribution.find(g => g.letter_grade === 'F');
    if (gradeA && gradeA.percentage > 70) {
      recommendations.push(`🌟 **${gradeA.percentage.toFixed(1)}% of fixes received grade A** - Great quality! Share best practices across teams.`);
    }
    if (gradeF && gradeF.percentage > 10) {
      recommendations.push(`🔴 **${gradeF.percentage.toFixed(1)}% of fixes received grade F** - Investigate root causes and improve validation checks.`);
    }

    // Performance recommendations
    const durationP99 = report.performanceMetrics.find(m => m.metric === 'duration_p99');
    if (durationP99 && durationP99.value > 60000) {
      recommendations.push(`⏱️ **P99 duration is ${(durationP99.value / 1000).toFixed(1)}s** - Optimize slow fixes with caching and parallel processing.`);
    }

    // Error recommendations
    if (report.topErrors.length > 0) {
      const topError = report.topErrors[0];
      recommendations.push(`🐛 **Most common error: "${topError.error_type}" (${topError.count} occurrences)** - Prioritize fixing this issue.`);
    }

    // Quality trends
    if (report.qualityTrends.length > 0) {
      const latestTrend = report.qualityTrends[0];
      if (latestTrend.lint_pass_rate < 90) {
        recommendations.push(`📝 **Lint pass rate is ${latestTrend.lint_pass_rate.toFixed(1)}%** - Improve code formatting and linting rules.`);
      }
      if (latestTrend.avg_coverage_delta < 0) {
        recommendations.push(`🧪 **Test coverage is decreasing (${latestTrend.avg_coverage_delta.toFixed(2)}%)** - Ensure auto-fixes include proper test coverage.`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push(`✅ **All metrics look healthy!** Continue monitoring trends and optimizing where possible.`);
    }

    return recommendations.map(r => `- ${r}`).join('\n') + '\n';
  }
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const dbPath = process.env.DB_PATH || './autofix.db';
  const weekOffset = parseInt(process.env.WEEK_OFFSET || '0', 10);
  const includeCharts = process.env.INCLUDE_CHARTS !== 'false';

  // Check if database exists
  const fs = await import('fs');
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at ${dbPath}`);
    process.exit(1);
  }

  // Open database connection
  const db = new Database(dbPath, { readonly: true });

  try {
    const generator = new PerformanceReportGenerator(db);
    const report = generator.generateWeeklyReport({
      dbPath,
      weekOffset,
      includeCharts,
    });

    const markdown = generator.formatAsMarkdown(report, includeCharts);

    // Output to stdout for GitHub Actions to capture
    console.log(markdown);

    // Also save to file if OUTPUT_FILE is set
    const outputFile = process.env.OUTPUT_FILE;
    if (outputFile) {
      await fs.promises.writeFile(outputFile, markdown, 'utf-8');
      console.error(`Report saved to ${outputFile}`);
    }
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Failed to generate report:', err);
    process.exit(1);
  });
}

export { PerformanceReportGenerator, getWeekRange, formatWeekLabel };
