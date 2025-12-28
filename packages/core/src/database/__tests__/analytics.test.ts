/**
 * Analytics Query Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createQueryManager, QueryManager } from '../queries.js';
import { createAnalyticsQueries, AnalyticsQueries } from '../analytics.js';

// Minimal schema for testing
const TEST_SCHEMA = `
  CREATE TABLE autofix_runs (
    id TEXT PRIMARY KEY,
    issue_number INTEGER NOT NULL,
    pr_number INTEGER,
    pr_url TEXT,
    repo_owner TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'success', 'failure', 'partial')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    duration_ms INTEGER,
    trigger_source TEXT NOT NULL,
    triggered_by TEXT,
    agent_version TEXT NOT NULL,
    files_changed INTEGER DEFAULT 0,
    lines_added INTEGER DEFAULT 0,
    lines_deleted INTEGER DEFAULT 0,
    commits_created INTEGER DEFAULT 0,
    merged BOOLEAN DEFAULT FALSE,
    time_to_merge_hours REAL,
    human_edits_required BOOLEAN DEFAULT FALSE,
    comments_received INTEGER DEFAULT 0,
    error_message TEXT,
    error_stack TEXT
  );

  CREATE TABLE ai_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES autofix_runs(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK(provider IN ('anthropic', 'google', 'openai', 'groq')),
    model TEXT NOT NULL,
    purpose TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    cost_per_1k_tokens REAL,
    latency_ms INTEGER NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    error_type TEXT
  );

  CREATE TABLE quality_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE REFERENCES autofix_runs(id) ON DELETE CASCADE,
    lint_passed BOOLEAN DEFAULT FALSE,
    lint_errors INTEGER DEFAULT 0,
    lint_warnings INTEGER DEFAULT 0,
    typecheck_passed BOOLEAN DEFAULT FALSE,
    typecheck_errors INTEGER DEFAULT 0,
    complexity_delta REAL DEFAULT 0,
    tests_run INTEGER DEFAULT 0,
    tests_passed INTEGER DEFAULT 0,
    tests_failed INTEGER DEFAULT 0,
    tests_skipped INTEGER DEFAULT 0,
    test_duration_ms INTEGER,
    coverage_before REAL DEFAULT 0,
    coverage_after REAL DEFAULT 0,
    coverage_delta REAL DEFAULT 0,
    readme_updated BOOLEAN DEFAULT FALSE,
    comments_added INTEGER DEFAULT 0,
    docs_changed BOOLEAN DEFAULT FALSE,
    measured_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE REFERENCES autofix_runs(id) ON DELETE CASCADE,
    letter_grade TEXT NOT NULL CHECK(letter_grade IN ('A', 'B', 'C', 'D', 'F')),
    overall_score REAL NOT NULL,
    code_quality_score REAL NOT NULL,
    test_coverage_score REAL NOT NULL,
    pr_outcome_score REAL NOT NULL,
    cost_efficiency_score REAL NOT NULL,
    documentation_score REAL NOT NULL,
    keyword_bonus REAL DEFAULT 0,
    summary TEXT NOT NULL,
    strengths TEXT,
    weaknesses TEXT,
    recommendations TEXT,
    grading_version TEXT NOT NULL,
    graded_at TEXT NOT NULL DEFAULT (datetime('now')),
    grading_duration_ms INTEGER
  );

  PRAGMA foreign_keys = ON;
`;

describe('Analytics Queries', () => {
  let db: Database.Database;
  let queries: QueryManager;
  let analytics: AnalyticsQueries;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(TEST_SCHEMA);
    queries = createQueryManager(db);
    analytics = createAnalyticsQueries(db);

    // Create sample data
    createSampleData();
  });

  afterEach(() => {
    db.close();
  });

  function createSampleData() {
    // Create runs for repo1
    for (let i = 1; i <= 5; i++) {
      queries.runs.create({
        id: `repo1-run-${i}`,
        issue_number: 100 + i,
        pr_number: null,
        pr_url: null,
        repo_owner: 'owner1',
        repo_name: 'repo1',
        status: i <= 4 ? 'success' : 'failure',
        created_at: `2025-12-${20 + Math.floor(i / 2)}T10:00:00Z`,
        started_at: null,
        completed_at: null,
        trigger_source: 'manual',
        triggered_by: 'user@example.com',
        agent_version: '1.0.0',
        files_changed: i * 2,
        lines_added: i * 10,
        lines_deleted: i * 5,
        commits_created: 1,
        merged: i <= 3,
        time_to_merge_hours: i <= 3 ? i * 2.5 : null,
        human_edits_required: false,
        comments_received: 0,
        error_message: null,
        error_stack: null
      });

      // Update duration_ms separately (excluded from create)
      queries.runs.update(`repo1-run-${i}`, {
        duration_ms: 5000 + i * 1000
      });

      // Add AI calls
      queries.aiCalls.create({
        run_id: `repo1-run-${i}`,
        provider: i % 2 === 0 ? 'anthropic' : 'google',
        model: i % 2 === 0 ? 'claude-sonnet-4' : 'gemini-flash',
        purpose: 'code_generation',
        input_tokens: 1000 + i * 100,
        output_tokens: 500 + i * 50,
        total_tokens: 1500 + i * 150,
        cost_usd: 0.01 + i * 0.005,
        cost_per_1k_tokens: 0.01,
        latency_ms: 2000 + i * 500,
        started_at: `2025-12-${20 + Math.floor(i / 2)}T10:00:00Z`,
        completed_at: `2025-12-${20 + Math.floor(i / 2)}T10:00:05Z`,
        retry_count: 0,
        error_type: i === 5 ? 'rate_limit' : null
      });

      // Add quality metrics
      queries.qualityMetrics.create({
        run_id: `repo1-run-${i}`,
        lint_passed: i <= 4,
        lint_errors: i === 5 ? 3 : 0,
        lint_warnings: 2,
        typecheck_passed: i <= 4,
        typecheck_errors: i === 5 ? 2 : 0,
        complexity_delta: -2 * i,
        tests_run: 100,
        tests_passed: i <= 4 ? 95 + i : 80,
        tests_failed: i <= 4 ? 5 - i : 20,
        tests_skipped: 0,
        test_duration_ms: 5000,
        coverage_before: 75.0,
        coverage_after: 75.0 + i * 2,
        coverage_delta: i * 2,
        readme_updated: true,
        comments_added: 10,
        docs_changed: true
      });

      // Add grades
      const grade = i <= 2 ? 'A' : i <= 4 ? 'B' : 'C';
      const score = i <= 2 ? 95 : i <= 4 ? 85 : 75;
      queries.grades.create({
        run_id: `repo1-run-${i}`,
        letter_grade: grade,
        overall_score: score,
        code_quality_score: score * 0.3,
        test_coverage_score: score * 0.25,
        pr_outcome_score: score * 0.25,
        cost_efficiency_score: score * 0.1,
        documentation_score: score * 0.1,
        keyword_bonus: i <= 2 ? 5 : 0,
        summary: `Grade ${grade}`,
        strengths: null,
        weaknesses: null,
        recommendations: null,
        grading_version: '1.0.0',
        grading_duration_ms: 100
      });
    }

    // Create runs for repo2
    for (let i = 1; i <= 3; i++) {
      queries.runs.create({
        id: `repo2-run-${i}`,
        issue_number: 200 + i,
        pr_number: null,
        pr_url: null,
        repo_owner: 'owner2',
        repo_name: 'repo2',
        status: 'success',
        created_at: `2025-12-${21 + i}T10:00:00Z`,
        started_at: null,
        completed_at: null,
        trigger_source: 'manual',
        triggered_by: 'user@example.com',
        agent_version: '1.0.0',
        files_changed: i,
        lines_added: i * 5,
        lines_deleted: i * 2,
        commits_created: 1,
        merged: true,
        time_to_merge_hours: i * 1.5,
        human_edits_required: false,
        comments_received: 0,
        error_message: null,
        error_stack: null
      });

      // Update duration_ms separately (excluded from create)
      queries.runs.update(`repo2-run-${i}`, {
        duration_ms: 3000 + i * 500
      });

      queries.aiCalls.create({
        run_id: `repo2-run-${i}`,
        provider: 'openai',
        model: 'gpt-4',
        purpose: 'review',
        input_tokens: 800 + i * 50,
        output_tokens: 400 + i * 25,
        total_tokens: 1200 + i * 75,
        cost_usd: 0.008 + i * 0.002,
        cost_per_1k_tokens: 0.01,
        latency_ms: 1500 + i * 300,
        started_at: `2025-12-${21 + i}T10:00:00Z`,
        completed_at: `2025-12-${21 + i}T10:00:03Z`,
        retry_count: 0,
        error_type: null
      });

      queries.qualityMetrics.create({
        run_id: `repo2-run-${i}`,
        lint_passed: true,
        lint_errors: 0,
        lint_warnings: 1,
        typecheck_passed: true,
        typecheck_errors: 0,
        complexity_delta: -1,
        tests_run: 50,
        tests_passed: 48 + i,
        tests_failed: 2 - i,
        tests_skipped: 0,
        test_duration_ms: 3000,
        coverage_before: 80.0,
        coverage_after: 80.0 + i,
        coverage_delta: i,
        readme_updated: false,
        comments_added: 5,
        docs_changed: false
      });

      queries.grades.create({
        run_id: `repo2-run-${i}`,
        letter_grade: 'A',
        overall_score: 92 + i,
        code_quality_score: (92 + i) * 0.3,
        test_coverage_score: (92 + i) * 0.25,
        pr_outcome_score: (92 + i) * 0.25,
        cost_efficiency_score: (92 + i) * 0.1,
        documentation_score: (92 + i) * 0.1,
        keyword_bonus: 3,
        summary: 'Grade A',
        strengths: null,
        weaknesses: null,
        recommendations: null,
        grading_version: '1.0.0',
        grading_duration_ms: 100
      });
    }
  }

  describe('Success Rate Analytics', () => {
    it('should calculate success rate by repo', () => {
      const results = analytics.getSuccessRateByRepo();

      expect(results).toHaveLength(2);

      const repo1 = results.find(r => r.repo_name === 'repo1');
      expect(repo1).toBeDefined();
      expect(repo1!.total_runs).toBe(5);
      expect(repo1!.successful_runs).toBe(4);
      expect(repo1!.failed_runs).toBe(1);
      expect(repo1!.success_rate).toBe(80);

      const repo2 = results.find(r => r.repo_name === 'repo2');
      expect(repo2).toBeDefined();
      expect(repo2!.total_runs).toBe(3);
      expect(repo2!.successful_runs).toBe(3);
      expect(repo2!.success_rate).toBe(100);
    });

    it('should filter success rate by repo owner', () => {
      const results = analytics.getSuccessRateByRepo({ repo_owner: 'owner1' });

      expect(results).toHaveLength(1);
      expect(results[0].repo_owner).toBe('owner1');
    });

    it('should filter success rate by date range', () => {
      // repo1 runs have dates: 2025-12-20, 2025-12-21, 2025-12-21, 2025-12-22, 2025-12-22
      // repo2 runs have dates: 2025-12-22, 2025-12-23, 2025-12-24
      // Use a range that should include all runs
      const results = analytics.getSuccessRateByRepo({
        date_from: '2025-12-20T00:00:00Z',
        date_to: '2025-12-24T23:59:59Z'
      });

      expect(results.length).toBe(2); // Both repos should be included
      expect(results.some(r => r.repo_name === 'repo1')).toBe(true);
      expect(results.some(r => r.repo_name === 'repo2')).toBe(true);
    });
  });

  describe('Cost Analytics', () => {
    it('should calculate daily cost metrics', () => {
      const results = analytics.getCostMetrics('daily');

      expect(results.length).toBeGreaterThan(0);

      results.forEach(result => {
        expect(result.period).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(result.total_runs).toBeGreaterThan(0);
        expect(result.total_cost_usd).toBeGreaterThan(0);
        expect(result.total_tokens).toBeGreaterThan(0);
      });
    });

    it('should calculate monthly cost metrics', () => {
      const results = analytics.getCostMetrics('monthly');

      expect(results.length).toBeGreaterThan(0);

      results.forEach(result => {
        expect(result.period).toMatch(/^\d{4}-\d{2}$/);
      });
    });

    it('should break down costs by provider', () => {
      const results = analytics.getCostMetrics('daily');

      const hasAnthropicCost = results.some(r => r.anthropic_cost > 0);
      const hasGoogleCost = results.some(r => r.google_cost > 0);
      const hasOpenAICost = results.some(r => r.openai_cost > 0);

      expect(hasAnthropicCost).toBe(true);
      expect(hasGoogleCost).toBe(true);
      expect(hasOpenAICost).toBe(true);
    });

    it('should filter cost metrics by date range', () => {
      const results = analytics.getCostMetrics('daily', {
        date_from: '2025-12-22T00:00:00Z'
      });

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Grade Distribution', () => {
    it('should calculate grade distribution', () => {
      const results = analytics.getGradeDistribution();

      expect(results.length).toBeGreaterThan(0);

      const totalPercentage = results.reduce((sum, r) => sum + r.percentage, 0);
      expect(totalPercentage).toBeCloseTo(100, 1);

      const gradeA = results.find(r => r.letter_grade === 'A');
      expect(gradeA).toBeDefined();
      expect(gradeA!.count).toBeGreaterThan(0);
      expect(gradeA!.avg_score).toBeGreaterThanOrEqual(90);
    });

    it('should filter grade distribution by repo', () => {
      const results = analytics.getGradeDistribution({
        repo_owner: 'owner2'
      });

      expect(results.length).toBeGreaterThan(0);

      const allA = results.every(r => r.letter_grade === 'A');
      expect(allA).toBe(true);
    });

    it('should include cost and duration averages', () => {
      const results = analytics.getGradeDistribution();

      results.forEach(result => {
        expect(result.avg_cost).toBeGreaterThan(0);
        expect(result.avg_duration_ms).toBeGreaterThan(0);
      });
    });
  });

  describe('Performance Metrics', () => {
    it('should calculate duration percentiles', () => {
      const results = analytics.getPerformanceMetrics();

      const p50 = results.find(r => r.metric === 'duration_p50');
      const p95 = results.find(r => r.metric === 'duration_p95');
      const p99 = results.find(r => r.metric === 'duration_p99');

      expect(p50).toBeDefined();
      expect(p95).toBeDefined();
      expect(p99).toBeDefined();

      expect(p50!.value).toBeLessThan(p95!.value);
      expect(p95!.value).toBeLessThanOrEqual(p99!.value);
    });

    it('should calculate AI latency percentiles', () => {
      const results = analytics.getPerformanceMetrics();

      const p50 = results.find(r => r.metric === 'ai_latency_p50');
      const p95 = results.find(r => r.metric === 'ai_latency_p95');

      expect(p50).toBeDefined();
      expect(p95).toBeDefined();
      expect(p50!.unit).toBe('ms');
    });

    it('should calculate cost percentiles', () => {
      const results = analytics.getPerformanceMetrics();

      const p50 = results.find(r => r.metric === 'cost_p50');
      expect(p50).toBeDefined();
      expect(p50!.unit).toBe('usd');
    });
  });

  describe('Quality Trends', () => {
    it('should calculate daily quality trends', () => {
      const results = analytics.getQualityTrends('daily');

      expect(results.length).toBeGreaterThan(0);

      results.forEach(result => {
        expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(result.total_runs).toBeGreaterThan(0);
        expect(result.lint_pass_rate).toBeGreaterThanOrEqual(0);
        expect(result.lint_pass_rate).toBeLessThanOrEqual(100);
      });
    });

    it('should calculate weekly quality trends', () => {
      const results = analytics.getQualityTrends('weekly');

      expect(results.length).toBeGreaterThan(0);

      results.forEach(result => {
        expect(result.date).toMatch(/^\d{4}-W\d{2}$/);
      });
    });

    it('should include test pass rates', () => {
      const results = analytics.getQualityTrends('daily');

      results.forEach(result => {
        if (result.avg_test_pass_rate !== null) {
          expect(result.avg_test_pass_rate).toBeGreaterThanOrEqual(0);
          expect(result.avg_test_pass_rate).toBeLessThanOrEqual(100);
        }
      });
    });
  });

  describe('Top Errors', () => {
    it('should return top error types', () => {
      const results = analytics.getTopErrors(5);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);

      results.forEach(error => {
        expect(error.error_type).toBeDefined();
        expect(error.count).toBeGreaterThan(0);
        expect(error.first_seen).toBeDefined();
        expect(error.last_seen).toBeDefined();
      });
    });

    it('should sort errors by count descending', () => {
      const results = analytics.getTopErrors(10);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].count).toBeGreaterThanOrEqual(results[i].count);
      }
    });
  });

  describe('Repo Leaderboard', () => {
    it('should return top repositories', () => {
      const results = analytics.getRepoLeaderboard(10);

      expect(results.length).toBeGreaterThan(0);

      results.forEach(repo => {
        expect(repo.repo_owner).toBeDefined();
        expect(repo.repo_name).toBeDefined();
        expect(repo.total_runs).toBeGreaterThanOrEqual(5);
        expect(repo.success_rate).toBeGreaterThanOrEqual(0);
        expect(repo.success_rate).toBeLessThanOrEqual(100);
      });
    });

    it('should sort by average grade score', () => {
      const results = analytics.getRepoLeaderboard(10);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].avg_grade_score).toBeGreaterThanOrEqual(
          results[i].avg_grade_score
        );
      }
    });

    it('should include merge statistics', () => {
      const results = analytics.getRepoLeaderboard(10);

      results.forEach(repo => {
        expect(repo.merged_pr_count).toBeGreaterThanOrEqual(0);
        expect(repo.merge_rate).toBeGreaterThanOrEqual(0);
        expect(repo.merge_rate).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Summary Statistics', () => {
    it('should calculate overall summary stats', () => {
      const result = analytics.getSummaryStats();

      expect(result.total_runs).toBe(8);
      expect(result.total_cost_usd).toBeGreaterThan(0);
      expect(result.total_tokens).toBeGreaterThan(0);
      expect(result.avg_duration_ms).toBeGreaterThan(0);
      expect(result.success_rate).toBeGreaterThanOrEqual(0);
      expect(result.success_rate).toBeLessThanOrEqual(100);
      expect(result.avg_grade).toBeGreaterThan(0);
      expect(result.total_repos).toBe(2);
    });
  });
});
