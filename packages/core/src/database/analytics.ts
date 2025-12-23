/**
 * Analytics Query Builders
 *
 * Complex aggregation queries for metrics, trends, and insights.
 */

import Database from 'better-sqlite3';

// ============================================================================
// Types
// ============================================================================

export interface SuccessRateMetrics {
  repo_owner: string;
  repo_name: string;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  partial_runs: number;
  success_rate: number;
  avg_duration_ms: number;
  avg_files_changed: number;
}

export interface CostMetrics {
  period: string; // e.g., "2025-12-22" for daily, "2025-12" for monthly
  total_runs: number;
  total_cost_usd: number;
  avg_cost_per_run: number;
  total_tokens: number;
  avg_tokens_per_run: number;
  anthropic_cost: number;
  google_cost: number;
  openai_cost: number;
  groq_cost: number;
}

export interface GradeDistribution {
  letter_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  count: number;
  percentage: number;
  avg_score: number;
  avg_cost: number;
  avg_duration_ms: number;
}

export interface PerformanceMetrics {
  metric: string;
  value: number;
  unit: string;
}

export interface QualityTrends {
  date: string;
  total_runs: number;
  lint_pass_rate: number;
  typecheck_pass_rate: number;
  avg_test_pass_rate: number;
  avg_coverage_delta: number;
  avg_complexity_delta: number;
}

export interface TopIssues {
  error_type: string;
  count: number;
  first_seen: string;
  last_seen: string;
  avg_latency_ms: number;
  total_cost_usd: number;
}

export interface RepoLeaderboard {
  repo_owner: string;
  repo_name: string;
  total_runs: number;
  success_rate: number;
  avg_grade_score: number;
  total_cost_usd: number;
  avg_duration_ms: number;
  merged_pr_count: number;
  merge_rate: number;
}

// ============================================================================
// Analytics Query Builder
// ============================================================================

export class AnalyticsQueries {
  constructor(private db: Database.Database) {}

  /**
   * Get success rate metrics by repository
   */
  getSuccessRateByRepo(filters?: {
    repo_owner?: string;
    repo_name?: string;
    date_from?: string;
    date_to?: string;
  }): SuccessRateMetrics[] {
    let query = `
      SELECT
        repo_owner,
        repo_name,
        COUNT(*) as total_runs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_runs,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failed_runs,
        SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partial_runs,
        ROUND(
          CAST(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100,
          2
        ) as success_rate,
        ROUND(AVG(duration_ms), 0) as avg_duration_ms,
        ROUND(AVG(files_changed), 1) as avg_files_changed
      FROM autofix_runs
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.repo_owner) {
      query += ' AND repo_owner = ?';
      params.push(filters.repo_owner);
    }

    if (filters?.repo_name) {
      query += ' AND repo_name = ?';
      params.push(filters.repo_name);
    }

    if (filters?.date_from) {
      query += ' AND created_at >= ?';
      params.push(filters.date_from);
    }

    if (filters?.date_to) {
      query += ' AND created_at <= ?';
      params.push(filters.date_to);
    }

    query += `
      GROUP BY repo_owner, repo_name
      ORDER BY total_runs DESC
    `;

    return this.db.prepare(query).all(...params) as SuccessRateMetrics[];
  }

  /**
   * Get cost metrics aggregated by time period
   */
  getCostMetrics(granularity: 'daily' | 'weekly' | 'monthly' = 'daily', filters?: {
    date_from?: string;
    date_to?: string;
  }): CostMetrics[] {
    let dateFormat: string;
    switch (granularity) {
      case 'monthly':
        dateFormat = '%Y-%m';
        break;
      case 'weekly':
        dateFormat = '%Y-W%W';
        break;
      case 'daily':
      default:
        dateFormat = '%Y-%m-%d';
    }

    let query = `
      SELECT
        strftime('${dateFormat}', r.created_at) as period,
        COUNT(DISTINCT r.id) as total_runs,
        ROUND(SUM(c.cost_usd), 2) as total_cost_usd,
        ROUND(AVG(run_cost.cost), 2) as avg_cost_per_run,
        SUM(c.total_tokens) as total_tokens,
        ROUND(AVG(run_tokens.tokens), 0) as avg_tokens_per_run,
        ROUND(SUM(CASE WHEN c.provider = 'anthropic' THEN c.cost_usd ELSE 0 END), 2) as anthropic_cost,
        ROUND(SUM(CASE WHEN c.provider = 'google' THEN c.cost_usd ELSE 0 END), 2) as google_cost,
        ROUND(SUM(CASE WHEN c.provider = 'openai' THEN c.cost_usd ELSE 0 END), 2) as openai_cost,
        ROUND(SUM(CASE WHEN c.provider = 'groq' THEN c.cost_usd ELSE 0 END), 2) as groq_cost
      FROM autofix_runs r
      LEFT JOIN ai_calls c ON c.run_id = r.id
      LEFT JOIN (
        SELECT run_id, SUM(cost_usd) as cost
        FROM ai_calls
        GROUP BY run_id
      ) run_cost ON run_cost.run_id = r.id
      LEFT JOIN (
        SELECT run_id, SUM(total_tokens) as tokens
        FROM ai_calls
        GROUP BY run_id
      ) run_tokens ON run_tokens.run_id = r.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.date_from) {
      query += ' AND r.created_at >= ?';
      params.push(filters.date_from);
    }

    if (filters?.date_to) {
      query += ' AND r.created_at <= ?';
      params.push(filters.date_to);
    }

    query += `
      GROUP BY period
      ORDER BY period DESC
    `;

    return this.db.prepare(query).all(...params) as CostMetrics[];
  }

  /**
   * Get grade distribution with detailed metrics
   */
  getGradeDistribution(filters?: {
    repo_owner?: string;
    repo_name?: string;
    date_from?: string;
    date_to?: string;
  }): GradeDistribution[] {
    let query = `
      SELECT
        g.letter_grade,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (
          SELECT COUNT(*) FROM grades g2
          JOIN autofix_runs r2 ON r2.id = g2.run_id
          WHERE 1=1
          ${filters?.repo_owner ? 'AND r2.repo_owner = ?' : ''}
          ${filters?.repo_name ? 'AND r2.repo_name = ?' : ''}
          ${filters?.date_from ? 'AND r2.created_at >= ?' : ''}
          ${filters?.date_to ? 'AND r2.created_at <= ?' : ''}
        ), 2) as percentage,
        ROUND(AVG(g.overall_score), 2) as avg_score,
        ROUND(COALESCE(AVG(costs.total_cost), 0), 2) as avg_cost,
        ROUND(COALESCE(AVG(r.duration_ms), 0), 0) as avg_duration_ms
      FROM grades g
      JOIN autofix_runs r ON r.id = g.run_id
      LEFT JOIN (
        SELECT run_id, SUM(cost_usd) as total_cost
        FROM ai_calls
        GROUP BY run_id
      ) costs ON costs.run_id = r.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Add filter params twice (once for subquery, once for main query)
    const filterParams: any[] = [];
    if (filters?.repo_owner) {
      filterParams.push(filters.repo_owner);
      query += ' AND r.repo_owner = ?';
    }
    if (filters?.repo_name) {
      filterParams.push(filters.repo_name);
      query += ' AND r.repo_name = ?';
    }
    if (filters?.date_from) {
      filterParams.push(filters.date_from);
      query += ' AND r.created_at >= ?';
    }
    if (filters?.date_to) {
      filterParams.push(filters.date_to);
      query += ' AND r.created_at <= ?';
    }

    query += `
      GROUP BY g.letter_grade
      ORDER BY
        CASE g.letter_grade
          WHEN 'A' THEN 1
          WHEN 'B' THEN 2
          WHEN 'C' THEN 3
          WHEN 'D' THEN 4
          WHEN 'F' THEN 5
        END
    `;

    // Params for subquery, then for main query
    params.push(...filterParams, ...filterParams);

    return this.db.prepare(query).all(...params) as GradeDistribution[];
  }

  /**
   * Get performance percentiles (P50, P95, P99)
   */
  getPerformanceMetrics(): PerformanceMetrics[] {
    const metrics: PerformanceMetrics[] = [];

    // Duration percentiles
    const durations = this.db.prepare(`
      SELECT
        duration_ms
      FROM autofix_runs
      WHERE duration_ms IS NOT NULL AND duration_ms > 0
      ORDER BY duration_ms
    `).all() as Array<{ duration_ms: number }>;

    if (durations.length > 0) {
      const p50Index = Math.max(0, Math.floor(durations.length * 0.5) - 1);
      const p95Index = Math.max(0, Math.floor(durations.length * 0.95) - 1);
      const p99Index = Math.max(0, Math.floor(durations.length * 0.99) - 1);

      metrics.push(
        { metric: 'duration_p50', value: durations[p50Index].duration_ms, unit: 'ms' },
        { metric: 'duration_p95', value: durations[p95Index].duration_ms, unit: 'ms' },
        { metric: 'duration_p99', value: durations[p99Index].duration_ms, unit: 'ms' }
      );
    }

    // AI call latency percentiles
    const latencies = this.db.prepare(`
      SELECT latency_ms
      FROM ai_calls
      ORDER BY latency_ms
    `).all() as Array<{ latency_ms: number }>;

    if (latencies.length > 0) {
      const p50Index = Math.floor(latencies.length * 0.5);
      const p95Index = Math.floor(latencies.length * 0.95);
      const p99Index = Math.floor(latencies.length * 0.99);

      metrics.push(
        { metric: 'ai_latency_p50', value: latencies[p50Index].latency_ms, unit: 'ms' },
        { metric: 'ai_latency_p95', value: latencies[p95Index].latency_ms, unit: 'ms' },
        { metric: 'ai_latency_p99', value: latencies[p99Index].latency_ms, unit: 'ms' }
      );
    }

    // Cost percentiles
    const costs = this.db.prepare(`
      SELECT run_id, SUM(cost_usd) as total_cost
      FROM ai_calls
      GROUP BY run_id
      ORDER BY total_cost
    `).all() as Array<{ run_id: string; total_cost: number }>;

    if (costs.length > 0) {
      const p50Index = Math.floor(costs.length * 0.5);
      const p95Index = Math.floor(costs.length * 0.95);
      const p99Index = Math.floor(costs.length * 0.99);

      metrics.push(
        { metric: 'cost_p50', value: costs[p50Index].total_cost, unit: 'usd' },
        { metric: 'cost_p95', value: costs[p95Index].total_cost, unit: 'usd' },
        { metric: 'cost_p99', value: costs[p99Index].total_cost, unit: 'usd' }
      );
    }

    return metrics;
  }

  /**
   * Get quality metrics trends over time
   */
  getQualityTrends(granularity: 'daily' | 'weekly' = 'daily', filters?: {
    date_from?: string;
    date_to?: string;
  }): QualityTrends[] {
    const dateFormat = granularity === 'weekly' ? '%Y-W%W' : '%Y-%m-%d';

    let query = `
      SELECT
        strftime('${dateFormat}', r.created_at) as date,
        COUNT(*) as total_runs,
        ROUND(
          AVG(CASE WHEN qm.lint_passed = 1 THEN 100.0 ELSE 0.0 END),
          2
        ) as lint_pass_rate,
        ROUND(
          AVG(CASE WHEN qm.typecheck_passed = 1 THEN 100.0 ELSE 0.0 END),
          2
        ) as typecheck_pass_rate,
        ROUND(
          AVG(
            CASE
              WHEN qm.tests_run > 0
              THEN (CAST(qm.tests_passed AS REAL) / qm.tests_run * 100)
              ELSE NULL
            END
          ),
          2
        ) as avg_test_pass_rate,
        ROUND(AVG(qm.coverage_delta), 2) as avg_coverage_delta,
        ROUND(AVG(qm.complexity_delta), 2) as avg_complexity_delta
      FROM autofix_runs r
      LEFT JOIN quality_metrics qm ON qm.run_id = r.id
      WHERE qm.id IS NOT NULL
    `;
    const params: any[] = [];

    if (filters?.date_from) {
      query += ' AND r.created_at >= ?';
      params.push(filters.date_from);
    }

    if (filters?.date_to) {
      query += ' AND r.created_at <= ?';
      params.push(filters.date_to);
    }

    query += `
      GROUP BY date
      ORDER BY date DESC
    `;

    return this.db.prepare(query).all(...params) as QualityTrends[];
  }

  /**
   * Get top error types with metrics
   */
  getTopErrors(limit: number = 10): TopIssues[] {
    return this.db.prepare(`
      SELECT
        error_type,
        COUNT(*) as count,
        MIN(started_at) as first_seen,
        MAX(started_at) as last_seen,
        ROUND(AVG(latency_ms), 0) as avg_latency_ms,
        ROUND(SUM(cost_usd), 2) as total_cost_usd
      FROM ai_calls
      WHERE error_type IS NOT NULL
      GROUP BY error_type
      ORDER BY count DESC
      LIMIT ?
    `).all(limit) as TopIssues[];
  }

  /**
   * Get repository leaderboard
   */
  getRepoLeaderboard(limit: number = 20): RepoLeaderboard[] {
    return this.db.prepare(`
      SELECT
        r.repo_owner,
        r.repo_name,
        COUNT(*) as total_runs,
        ROUND(
          CAST(SUM(CASE WHEN r.status = 'success' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100,
          2
        ) as success_rate,
        ROUND(AVG(g.overall_score), 2) as avg_grade_score,
        ROUND(SUM(costs.total_cost), 2) as total_cost_usd,
        ROUND(AVG(r.duration_ms), 0) as avg_duration_ms,
        SUM(CASE WHEN r.merged = 1 THEN 1 ELSE 0 END) as merged_pr_count,
        ROUND(
          CAST(SUM(CASE WHEN r.merged = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100,
          2
        ) as merge_rate
      FROM autofix_runs r
      LEFT JOIN grades g ON g.run_id = r.id
      LEFT JOIN (
        SELECT run_id, SUM(cost_usd) as total_cost
        FROM ai_calls
        GROUP BY run_id
      ) costs ON costs.run_id = r.id
      GROUP BY r.repo_owner, r.repo_name
      HAVING total_runs >= 5
      ORDER BY avg_grade_score DESC, success_rate DESC
      LIMIT ?
    `).all(limit) as RepoLeaderboard[];
  }

  /**
   * Get summary statistics
   */
  getSummaryStats(): {
    total_runs: number;
    total_cost_usd: number;
    total_tokens: number;
    avg_duration_ms: number;
    success_rate: number;
    avg_grade: number;
    total_repos: number;
  } {
    const result = this.db.prepare(`
      SELECT
        COUNT(DISTINCT r.id) as total_runs,
        ROUND(COALESCE(SUM(costs.total_cost), 0), 2) as total_cost_usd,
        COALESCE(SUM(tokens.total_tokens), 0) as total_tokens,
        ROUND(COALESCE(AVG(r.duration_ms), 0), 0) as avg_duration_ms,
        ROUND(
          CAST(SUM(CASE WHEN r.status = 'success' THEN 1 ELSE 0 END) AS REAL) / NULLIF(COUNT(*), 0) * 100,
          2
        ) as success_rate,
        ROUND(COALESCE(AVG(g.overall_score), 0), 2) as avg_grade,
        COUNT(DISTINCT r.repo_owner || '/' || r.repo_name) as total_repos
      FROM autofix_runs r
      LEFT JOIN (
        SELECT run_id, SUM(cost_usd) as total_cost
        FROM ai_calls
        GROUP BY run_id
      ) costs ON costs.run_id = r.id
      LEFT JOIN (
        SELECT run_id, SUM(total_tokens) as total_tokens
        FROM ai_calls
        GROUP BY run_id
      ) tokens ON tokens.run_id = r.id
      LEFT JOIN grades g ON g.run_id = r.id
    `).get() as {
      total_runs: number;
      total_cost_usd: number;
      total_tokens: number;
      avg_duration_ms: number;
      success_rate: number;
      avg_grade: number;
      total_repos: number;
    };

    return result;
  }
}

/**
 * Create analytics query builder instance
 */
export function createAnalyticsQueries(db: Database.Database): AnalyticsQueries {
  return new AnalyticsQueries(db);
}
