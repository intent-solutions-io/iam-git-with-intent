-- Auto-Fix Monitoring Database Schema
-- SQLite 3.x
-- Version: 1.0.0
-- Created: 2025-12-22

-- =============================================================================
-- METADATA
-- =============================================================================

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    description TEXT NOT NULL
);

INSERT INTO schema_version (version, description) VALUES
    (1, 'Initial schema: autofix_runs, ai_calls, code_changes, quality_metrics, grades, alerts');

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- Auto-fix run tracking
CREATE TABLE IF NOT EXISTS autofix_runs (
    id TEXT PRIMARY KEY,                    -- UUID
    issue_number INTEGER NOT NULL,          -- GitHub issue number
    pr_number INTEGER,                      -- GitHub PR number (nullable until created)
    pr_url TEXT,                            -- Full PR URL
    repo_owner TEXT NOT NULL,               -- e.g., "intent-solutions-io"
    repo_name TEXT NOT NULL,                -- e.g., "git-with-intent"
    status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'success', 'failure', 'partial')),

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    duration_ms INTEGER,                    -- Execution time in milliseconds

    -- Metadata
    trigger_source TEXT NOT NULL CHECK(trigger_source IN ('issue_label', 'webhook', 'manual', 'scheduled')),
    triggered_by TEXT,                      -- GitHub username
    agent_version TEXT NOT NULL,            -- Version of auto-fix agent used

    -- Results
    files_changed INTEGER DEFAULT 0,
    lines_added INTEGER DEFAULT 0,
    lines_deleted INTEGER DEFAULT 0,
    commits_created INTEGER DEFAULT 0,

    -- Outcomes
    merged BOOLEAN DEFAULT FALSE,
    time_to_merge_hours REAL,              -- Hours from PR creation to merge
    human_edits_required BOOLEAN DEFAULT FALSE,
    comments_received INTEGER DEFAULT 0,

    -- Error tracking
    error_message TEXT,
    error_stack TEXT,

    UNIQUE(repo_owner, repo_name, issue_number)
);

CREATE INDEX idx_runs_status ON autofix_runs(status);
CREATE INDEX idx_runs_repo ON autofix_runs(repo_owner, repo_name);
CREATE INDEX idx_runs_created ON autofix_runs(created_at DESC);
CREATE INDEX idx_runs_merged ON autofix_runs(merged, time_to_merge_hours);

-- AI API call tracking
CREATE TABLE IF NOT EXISTS ai_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES autofix_runs(id) ON DELETE CASCADE,

    -- Model details
    provider TEXT NOT NULL CHECK(provider IN ('anthropic', 'google', 'openai', 'groq')),
    model TEXT NOT NULL,                    -- e.g., "claude-sonnet-4", "gemini-1.5-flash"
    purpose TEXT NOT NULL,                  -- e.g., "code_generation", "conflict_resolution"

    -- Usage metrics
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,

    -- Cost tracking
    cost_usd REAL NOT NULL,                 -- Cost in USD
    cost_per_1k_tokens REAL,                -- For analytics

    -- Performance
    latency_ms INTEGER NOT NULL,            -- API call latency
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT NOT NULL,

    -- Error handling
    retry_count INTEGER DEFAULT 0,
    error_type TEXT,                        -- e.g., "rate_limit", "timeout"

    CHECK(total_tokens = input_tokens + output_tokens)
);

CREATE INDEX idx_ai_calls_run ON ai_calls(run_id);
CREATE INDEX idx_ai_calls_provider ON ai_calls(provider, model);
CREATE INDEX idx_ai_calls_cost ON ai_calls(cost_usd DESC);
CREATE INDEX idx_ai_calls_date ON ai_calls(started_at DESC);

-- Code changes tracking
CREATE TABLE IF NOT EXISTS code_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES autofix_runs(id) ON DELETE CASCADE,

    -- File details
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL CHECK(change_type IN ('added', 'modified', 'deleted', 'renamed')),

    -- Change metrics
    lines_added INTEGER DEFAULT 0,
    lines_deleted INTEGER DEFAULT 0,
    lines_changed INTEGER DEFAULT 0,

    -- Complexity tracking
    complexity_before INTEGER,
    complexity_after INTEGER,
    complexity_delta INTEGER,

    -- File metadata
    file_type TEXT,                         -- e.g., "typescript", "markdown", "json"
    is_test_file BOOLEAN DEFAULT FALSE,
    is_config_file BOOLEAN DEFAULT FALSE,

    -- Timestamps
    changed_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(run_id, file_path)
);

CREATE INDEX idx_code_changes_run ON code_changes(run_id);
CREATE INDEX idx_code_changes_type ON code_changes(change_type);
CREATE INDEX idx_code_changes_complexity ON code_changes(complexity_delta);

-- Quality metrics tracking
CREATE TABLE IF NOT EXISTS quality_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES autofix_runs(id) ON DELETE CASCADE,

    -- Code quality
    lint_passed BOOLEAN NOT NULL,
    lint_errors INTEGER DEFAULT 0,
    lint_warnings INTEGER DEFAULT 0,

    typecheck_passed BOOLEAN NOT NULL,
    typecheck_errors INTEGER DEFAULT 0,

    complexity_delta INTEGER DEFAULT 0,     -- Overall complexity change

    -- Test metrics
    tests_run INTEGER DEFAULT 0,
    tests_passed INTEGER DEFAULT 0,
    tests_failed INTEGER DEFAULT 0,
    tests_skipped INTEGER DEFAULT 0,
    test_duration_ms INTEGER,

    -- Coverage
    coverage_before REAL DEFAULT 0,         -- Percentage (0-100)
    coverage_after REAL DEFAULT 0,
    coverage_delta REAL DEFAULT 0,

    -- Documentation
    readme_updated BOOLEAN DEFAULT FALSE,
    comments_added INTEGER DEFAULT 0,
    docs_changed BOOLEAN DEFAULT FALSE,

    -- Timestamps
    measured_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(run_id)
);

CREATE INDEX idx_quality_run ON quality_metrics(run_id);
CREATE INDEX idx_quality_lint ON quality_metrics(lint_passed);
CREATE INDEX idx_quality_tests ON quality_metrics(tests_passed, tests_failed);
CREATE INDEX idx_quality_coverage ON quality_metrics(coverage_delta);

-- Grading results
CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES autofix_runs(id) ON DELETE CASCADE,

    -- Overall grade
    letter_grade TEXT NOT NULL CHECK(letter_grade IN ('A', 'B', 'C', 'D', 'F')),
    overall_score REAL NOT NULL CHECK(overall_score >= 0 AND overall_score <= 100),

    -- Criteria scores
    code_quality_score REAL NOT NULL,
    test_coverage_score REAL NOT NULL,
    pr_outcome_score REAL NOT NULL,
    cost_efficiency_score REAL NOT NULL,
    documentation_score REAL NOT NULL,

    -- Keyword analysis (optional)
    keyword_bonus REAL DEFAULT 0,

    -- Explanations
    summary TEXT NOT NULL,
    strengths TEXT,                         -- JSON array of strings
    weaknesses TEXT,                        -- JSON array of strings
    recommendations TEXT,                   -- JSON array of strings

    -- Metadata
    grading_version TEXT NOT NULL DEFAULT '1.0.0',
    graded_at TEXT NOT NULL DEFAULT (datetime('now')),
    grading_duration_ms INTEGER,

    UNIQUE(run_id)
);

CREATE INDEX idx_grades_run ON grades(run_id);
CREATE INDEX idx_grades_letter ON grades(letter_grade);
CREATE INDEX idx_grades_score ON grades(overall_score DESC);
CREATE INDEX idx_grades_date ON grades(graded_at DESC);

-- Alert tracking
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT REFERENCES autofix_runs(id) ON DELETE CASCADE,  -- Nullable for system alerts

    -- Alert details
    type TEXT NOT NULL CHECK(type IN ('error', 'warning', 'info', 'success')),
    severity TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low')),

    -- Message
    title TEXT NOT NULL,
    message TEXT NOT NULL,

    -- Notification status
    sent BOOLEAN DEFAULT FALSE,
    sent_at TEXT,
    sent_via TEXT,                          -- e.g., "github_comment", "email", "slack"

    -- GitHub integration
    github_comment_id INTEGER,              -- GitHub comment ID if posted
    github_comment_url TEXT,

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    acknowledged_at TEXT,
    acknowledged_by TEXT,                   -- Username who acknowledged

    -- Context
    context TEXT                            -- JSON object with additional data
);

CREATE INDEX idx_alerts_run ON alerts(run_id);
CREATE INDEX idx_alerts_type ON alerts(type, severity);
CREATE INDEX idx_alerts_sent ON alerts(sent, sent_at);
CREATE INDEX idx_alerts_created ON alerts(created_at DESC);

-- =============================================================================
-- ANALYTICS VIEWS
-- =============================================================================

-- Success rate by repository
CREATE VIEW IF NOT EXISTS v_success_rate_by_repo AS
SELECT
    repo_owner,
    repo_name,
    COUNT(*) as total_runs,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_runs,
    ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate_pct,
    ROUND(AVG(duration_ms) / 1000.0, 2) as avg_duration_seconds,
    SUM(CASE WHEN merged = 1 THEN 1 ELSE 0 END) as merged_prs,
    ROUND(AVG(time_to_merge_hours), 2) as avg_merge_time_hours
FROM autofix_runs
GROUP BY repo_owner, repo_name
ORDER BY total_runs DESC;

-- Grade distribution
CREATE VIEW IF NOT EXISTS v_grade_distribution AS
SELECT
    letter_grade,
    COUNT(*) as count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage,
    ROUND(AVG(overall_score), 2) as avg_score,
    ROUND(MIN(overall_score), 2) as min_score,
    ROUND(MAX(overall_score), 2) as max_score
FROM grades
GROUP BY letter_grade
ORDER BY letter_grade;

-- Cost analysis
CREATE VIEW IF NOT EXISTS v_cost_analysis AS
SELECT
    DATE(ai_calls.started_at) as date,
    provider,
    model,
    COUNT(*) as call_count,
    SUM(total_tokens) as total_tokens,
    ROUND(SUM(cost_usd), 4) as total_cost_usd,
    ROUND(AVG(cost_usd), 6) as avg_cost_per_call,
    ROUND(AVG(latency_ms), 2) as avg_latency_ms
FROM ai_calls
GROUP BY DATE(ai_calls.started_at), provider, model
ORDER BY date DESC, total_cost_usd DESC;

-- Quality trends over time
CREATE VIEW IF NOT EXISTS v_quality_trends AS
SELECT
    DATE(ar.created_at) as date,
    COUNT(*) as runs,
    ROUND(100.0 * SUM(CASE WHEN qm.lint_passed = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as lint_pass_rate,
    ROUND(100.0 * SUM(CASE WHEN qm.typecheck_passed = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as typecheck_pass_rate,
    ROUND(100.0 * SUM(CASE WHEN qm.tests_passed = qm.tests_run AND qm.tests_run > 0 THEN 1 ELSE 0 END) / COUNT(*), 2) as test_pass_rate,
    ROUND(AVG(qm.coverage_after), 2) as avg_coverage,
    ROUND(AVG(g.overall_score), 2) as avg_grade
FROM autofix_runs ar
LEFT JOIN quality_metrics qm ON ar.id = qm.run_id
LEFT JOIN grades g ON ar.id = g.run_id
GROUP BY DATE(ar.created_at)
ORDER BY date DESC;

-- Most expensive runs (top 20)
CREATE VIEW IF NOT EXISTS v_most_expensive_runs AS
SELECT
    ar.id as run_id,
    ar.repo_owner || '/' || ar.repo_name as repository,
    ar.issue_number,
    ar.pr_url,
    ROUND(SUM(ac.cost_usd), 4) as total_cost,
    COUNT(ac.id) as api_calls,
    SUM(ac.total_tokens) as total_tokens,
    ar.duration_ms,
    g.letter_grade,
    ar.status
FROM autofix_runs ar
LEFT JOIN ai_calls ac ON ar.id = ac.run_id
LEFT JOIN grades g ON ar.id = g.run_id
GROUP BY ar.id
ORDER BY total_cost DESC
LIMIT 20;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Automatically calculate duration_ms when run completes
CREATE TRIGGER IF NOT EXISTS trg_autofix_runs_duration
AFTER UPDATE OF completed_at ON autofix_runs
WHEN NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL
BEGIN
    UPDATE autofix_runs
    SET duration_ms = (
        (julianday(NEW.completed_at) - julianday(NEW.started_at)) * 24 * 60 * 60 * 1000
    )
    WHERE id = NEW.id;
END;

-- Automatically update lines_changed in code_changes
CREATE TRIGGER IF NOT EXISTS trg_code_changes_lines
AFTER INSERT ON code_changes
BEGIN
    UPDATE code_changes
    SET lines_changed = lines_added + lines_deleted
    WHERE id = NEW.id;
END;

-- Automatically calculate complexity_delta
CREATE TRIGGER IF NOT EXISTS trg_code_changes_complexity
AFTER INSERT ON code_changes
WHEN NEW.complexity_before IS NOT NULL AND NEW.complexity_after IS NOT NULL
BEGIN
    UPDATE code_changes
    SET complexity_delta = NEW.complexity_after - NEW.complexity_before
    WHERE id = NEW.id;
END;

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Composite indexes for common queries
CREATE INDEX idx_runs_status_repo ON autofix_runs(status, repo_owner, repo_name);
CREATE INDEX idx_runs_created_status ON autofix_runs(created_at DESC, status);

-- Analytics indexes
CREATE INDEX idx_ai_calls_date_provider ON ai_calls(started_at DESC, provider, model);
CREATE INDEX idx_grades_date_letter ON grades(graded_at DESC, letter_grade);

-- =============================================================================
-- VACUUM AND OPTIMIZE
-- =============================================================================

-- Enable WAL mode for better concurrency
PRAGMA journal_mode=WAL;

-- Enable foreign key constraints
PRAGMA foreign_keys=ON;

-- Optimize for performance
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=10000;
PRAGMA temp_store=MEMORY;
