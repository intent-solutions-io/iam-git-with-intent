/**
 * Type-Safe Query Builders
 *
 * Provides typed query builders for all database tables with
 * SQL injection prevention and compile-time type safety.
 */

import Database from 'better-sqlite3';

// ============================================================================
// Types
// ============================================================================

export interface AutofixRun {
  id: string;
  issue_number: number;
  pr_number: number | null;
  pr_url: string | null;
  repo_owner: string;
  repo_name: string;
  status: 'pending' | 'running' | 'success' | 'failure' | 'partial';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  trigger_source: 'issue_label' | 'webhook' | 'manual' | 'scheduled';
  triggered_by: string | null;
  agent_version: string;
  files_changed: number;
  lines_added: number;
  lines_deleted: number;
  commits_created: number;
  merged: boolean;
  time_to_merge_hours: number | null;
  human_edits_required: boolean;
  comments_received: number;
  error_message: string | null;
  error_stack: string | null;
}

export interface AICall {
  id: number;
  run_id: string;
  provider: 'anthropic' | 'google' | 'openai' | 'groq';
  model: string;
  purpose: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  cost_per_1k_tokens: number | null;
  latency_ms: number;
  started_at: string;
  completed_at: string;
  retry_count: number;
  error_type: string | null;
}

export interface CodeChange {
  id: number;
  run_id: string;
  file_path: string;
  change_type: 'added' | 'modified' | 'deleted' | 'renamed';
  lines_added: number;
  lines_deleted: number;
  lines_changed: number;
  complexity_before: number | null;
  complexity_after: number | null;
  complexity_delta: number | null;
  file_type: string | null;
  is_test_file: boolean;
  is_config_file: boolean;
  changed_at: string;
}

export interface QualityMetrics {
  id: number;
  run_id: string;
  lint_passed: boolean;
  lint_errors: number;
  lint_warnings: number;
  typecheck_passed: boolean;
  typecheck_errors: number;
  complexity_delta: number;
  tests_run: number;
  tests_passed: number;
  tests_failed: number;
  tests_skipped: number;
  test_duration_ms: number | null;
  coverage_before: number;
  coverage_after: number;
  coverage_delta: number;
  readme_updated: boolean;
  comments_added: number;
  docs_changed: boolean;
  measured_at: string;
}

export interface Grade {
  id: number;
  run_id: string;
  letter_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  overall_score: number;
  code_quality_score: number;
  test_coverage_score: number;
  pr_outcome_score: number;
  cost_efficiency_score: number;
  documentation_score: number;
  keyword_bonus: number;
  summary: string;
  strengths: string | null;
  weaknesses: string | null;
  recommendations: string | null;
  grading_version: string;
  graded_at: string;
  grading_duration_ms: number | null;
}

export interface Alert {
  id: number;
  run_id: string | null;
  type: 'error' | 'warning' | 'info' | 'success';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  sent: boolean;
  sent_at: string | null;
  sent_via: string | null;
  github_comment_id: number | null;
  github_comment_url: string | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  context: string | null;
}

// ============================================================================
// Query Builders
// ============================================================================

export class AutofixRunQueries {
  constructor(private db: Database.Database) {}

  create(run: Omit<AutofixRun, 'created_at' | 'duration_ms'>): AutofixRun {
    const stmt = this.db.prepare(`
      INSERT INTO autofix_runs (
        id, issue_number, pr_number, pr_url, repo_owner, repo_name, status,
        started_at, completed_at, trigger_source, triggered_by, agent_version,
        files_changed, lines_added, lines_deleted, commits_created,
        merged, time_to_merge_hours, human_edits_required, comments_received,
        error_message, error_stack
      ) VALUES (
        @id, @issue_number, @pr_number, @pr_url, @repo_owner, @repo_name, @status,
        @started_at, @completed_at, @trigger_source, @triggered_by, @agent_version,
        @files_changed, @lines_added, @lines_deleted, @commits_created,
        @merged, @time_to_merge_hours, @human_edits_required, @comments_received,
        @error_message, @error_stack
      )
    `);

    // Convert booleans to 0/1 for SQLite
    const params = {
      ...run,
      merged: run.merged ? 1 : 0,
      human_edits_required: run.human_edits_required ? 1 : 0
    };

    stmt.run(params);
    return this.getById(run.id)!;
  }

  getById(id: string): AutofixRun | null {
    return this.db
      .prepare('SELECT * FROM autofix_runs WHERE id = ?')
      .get(id) as AutofixRun | undefined || null;
  }

  getByIssue(repo_owner: string, repo_name: string, issue_number: number): AutofixRun | null {
    return this.db
      .prepare(`
        SELECT * FROM autofix_runs
        WHERE repo_owner = ? AND repo_name = ? AND issue_number = ?
      `)
      .get(repo_owner, repo_name, issue_number) as AutofixRun | undefined || null;
  }

  list(filters?: {
    repo_owner?: string;
    repo_name?: string;
    status?: AutofixRun['status'];
    limit?: number;
    offset?: number;
  }): AutofixRun[] {
    let query = 'SELECT * FROM autofix_runs WHERE 1=1';
    const params: any[] = [];

    if (filters?.repo_owner) {
      query += ' AND repo_owner = ?';
      params.push(filters.repo_owner);
    }

    if (filters?.repo_name) {
      query += ' AND repo_name = ?';
      params.push(filters.repo_name);
    }

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters?.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    return this.db.prepare(query).all(...params) as AutofixRun[];
  }

  update(id: string, updates: Partial<Omit<AutofixRun, 'id' | 'created_at'>>): void {
    const fields = Object.keys(updates)
      .map(key => `${key} = @${key}`)
      .join(', ');

    const stmt = this.db.prepare(`UPDATE autofix_runs SET ${fields} WHERE id = @id`);
    stmt.run({ id, ...updates });
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM autofix_runs WHERE id = ?').run(id);
  }

  count(filters?: { repo_owner?: string; repo_name?: string; status?: string }): number {
    let query = 'SELECT COUNT(*) as count FROM autofix_runs WHERE 1=1';
    const params: any[] = [];

    if (filters?.repo_owner) {
      query += ' AND repo_owner = ?';
      params.push(filters.repo_owner);
    }

    if (filters?.repo_name) {
      query += ' AND repo_name = ?';
      params.push(filters.repo_name);
    }

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    const result = this.db.prepare(query).get(...params) as { count: number };
    return result.count;
  }
}

export class AICallQueries {
  constructor(private db: Database.Database) {}

  create(call: Omit<AICall, 'id'>): AICall {
    const stmt = this.db.prepare(`
      INSERT INTO ai_calls (
        run_id, provider, model, purpose, input_tokens, output_tokens,
        total_tokens, cost_usd, cost_per_1k_tokens, latency_ms,
        started_at, completed_at, retry_count, error_type
      ) VALUES (
        @run_id, @provider, @model, @purpose, @input_tokens, @output_tokens,
        @total_tokens, @cost_usd, @cost_per_1k_tokens, @latency_ms,
        @started_at, @completed_at, @retry_count, @error_type
      )
    `);

    const info = stmt.run(call);
    return this.getById(info.lastInsertRowid as number)!;
  }

  getById(id: number): AICall | null {
    return this.db
      .prepare('SELECT * FROM ai_calls WHERE id = ?')
      .get(id) as AICall | undefined || null;
  }

  getByRunId(run_id: string): AICall[] {
    return this.db
      .prepare('SELECT * FROM ai_calls WHERE run_id = ? ORDER BY started_at ASC')
      .all(run_id) as AICall[];
  }

  getTotalCost(run_id: string): number {
    const result = this.db
      .prepare('SELECT SUM(cost_usd) as total FROM ai_calls WHERE run_id = ?')
      .get(run_id) as { total: number | null };
    return result.total || 0;
  }

  getTotalTokens(run_id: string): number {
    const result = this.db
      .prepare('SELECT SUM(total_tokens) as total FROM ai_calls WHERE run_id = ?')
      .get(run_id) as { total: number | null };
    return result.total || 0;
  }
}

export class QualityMetricsQueries {
  constructor(private db: Database.Database) {}

  create(metrics: Omit<QualityMetrics, 'id' | 'measured_at'>): QualityMetrics {
    const stmt = this.db.prepare(`
      INSERT INTO quality_metrics (
        run_id, lint_passed, lint_errors, lint_warnings,
        typecheck_passed, typecheck_errors, complexity_delta,
        tests_run, tests_passed, tests_failed, tests_skipped, test_duration_ms,
        coverage_before, coverage_after, coverage_delta,
        readme_updated, comments_added, docs_changed
      ) VALUES (
        @run_id, @lint_passed, @lint_errors, @lint_warnings,
        @typecheck_passed, @typecheck_errors, @complexity_delta,
        @tests_run, @tests_passed, @tests_failed, @tests_skipped, @test_duration_ms,
        @coverage_before, @coverage_after, @coverage_delta,
        @readme_updated, @comments_added, @docs_changed
      )
    `);

    // Convert booleans to 0/1 for SQLite
    const params = {
      ...metrics,
      lint_passed: metrics.lint_passed ? 1 : 0,
      typecheck_passed: metrics.typecheck_passed ? 1 : 0,
      readme_updated: metrics.readme_updated ? 1 : 0,
      docs_changed: metrics.docs_changed ? 1 : 0
    };

    const info = stmt.run(params);
    return this.getById(info.lastInsertRowid as number)!;
  }

  getById(id: number): QualityMetrics | null {
    return this.db
      .prepare('SELECT * FROM quality_metrics WHERE id = ?')
      .get(id) as QualityMetrics | undefined || null;
  }

  getByRunId(run_id: string): QualityMetrics | null {
    return this.db
      .prepare('SELECT * FROM quality_metrics WHERE run_id = ?')
      .get(run_id) as QualityMetrics | undefined || null;
  }
}

export class GradeQueries {
  constructor(private db: Database.Database) {}

  create(grade: Omit<Grade, 'id' | 'graded_at'>): Grade {
    const stmt = this.db.prepare(`
      INSERT INTO grades (
        run_id, letter_grade, overall_score,
        code_quality_score, test_coverage_score, pr_outcome_score,
        cost_efficiency_score, documentation_score, keyword_bonus,
        summary, strengths, weaknesses, recommendations,
        grading_version, grading_duration_ms
      ) VALUES (
        @run_id, @letter_grade, @overall_score,
        @code_quality_score, @test_coverage_score, @pr_outcome_score,
        @cost_efficiency_score, @documentation_score, @keyword_bonus,
        @summary, @strengths, @weaknesses, @recommendations,
        @grading_version, @grading_duration_ms
      )
    `);

    const info = stmt.run(grade);
    return this.getById(info.lastInsertRowid as number)!;
  }

  getById(id: number): Grade | null {
    return this.db
      .prepare('SELECT * FROM grades WHERE id = ?')
      .get(id) as Grade | undefined || null;
  }

  getByRunId(run_id: string): Grade | null {
    return this.db
      .prepare('SELECT * FROM grades WHERE run_id = ?')
      .get(run_id) as Grade | undefined || null;
  }

  getRecentGrades(limit: number = 10): Grade[] {
    return this.db
      .prepare('SELECT * FROM grades ORDER BY graded_at DESC LIMIT ?')
      .all(limit) as Grade[];
  }

  getGradeDistribution(): Array<{ letter_grade: string; count: number; percentage: number }> {
    return this.db
      .prepare('SELECT * FROM v_grade_distribution ORDER BY letter_grade')
      .all() as Array<{ letter_grade: string; count: number; percentage: number }>;
  }
}

export class AlertQueries {
  constructor(private db: Database.Database) {}

  create(alert: Omit<Alert, 'id' | 'created_at'>): Alert {
    const stmt = this.db.prepare(`
      INSERT INTO alerts (
        run_id, type, severity, title, message,
        sent, sent_at, sent_via,
        github_comment_id, github_comment_url,
        acknowledged_at, acknowledged_by, context
      ) VALUES (
        @run_id, @type, @severity, @title, @message,
        @sent, @sent_at, @sent_via,
        @github_comment_id, @github_comment_url,
        @acknowledged_at, @acknowledged_by, @context
      )
    `);

    // Convert booleans to 0/1 for SQLite
    const params = {
      ...alert,
      sent: alert.sent ? 1 : 0
    };

    const info = stmt.run(params);
    return this.getById(info.lastInsertRowid as number)!;
  }

  getById(id: number): Alert | null {
    return this.db
      .prepare('SELECT * FROM alerts WHERE id = ?')
      .get(id) as Alert | undefined || null;
  }

  getByRunId(run_id: string): Alert[] {
    return this.db
      .prepare('SELECT * FROM alerts WHERE run_id = ? ORDER BY created_at DESC')
      .all(run_id) as Alert[];
  }

  getUnsent(): Alert[] {
    return this.db
      .prepare('SELECT * FROM alerts WHERE sent = 0 ORDER BY created_at ASC')
      .all() as Alert[];
  }

  markAsSent(id: number, sent_via: string): void {
    this.db
      .prepare(`
        UPDATE alerts
        SET sent = 1, sent_at = datetime('now'), sent_via = ?
        WHERE id = ?
      `)
      .run(sent_via, id);
  }

  acknowledge(id: number, acknowledged_by: string): void {
    this.db
      .prepare(`
        UPDATE alerts
        SET acknowledged_at = datetime('now'), acknowledged_by = ?
        WHERE id = ?
      `)
      .run(acknowledged_by, id);
  }
}

// ============================================================================
// Query Manager (Facade)
// ============================================================================

export class QueryManager {
  public runs: AutofixRunQueries;
  public aiCalls: AICallQueries;
  public qualityMetrics: QualityMetricsQueries;
  public grades: GradeQueries;
  public alerts: AlertQueries;

  constructor(private db: Database.Database) {
    this.runs = new AutofixRunQueries(db);
    this.aiCalls = new AICallQueries(db);
    this.qualityMetrics = new QualityMetricsQueries(db);
    this.grades = new GradeQueries(db);
    this.alerts = new AlertQueries(db);
  }

  /**
   * Execute queries in a transaction
   */
  transaction<T>(fn: (queries: QueryManager) => T): T {
    const transaction = this.db.transaction(fn);
    return transaction(this);
  }

  /**
   * Get database instance (for custom queries)
   */
  getDatabase(): Database.Database {
    return this.db;
  }
}

/**
 * Create a query manager instance
 */
export function createQueryManager(db: Database.Database): QueryManager {
  return new QueryManager(db);
}
