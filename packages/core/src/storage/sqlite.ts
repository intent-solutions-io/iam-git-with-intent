/**
 * SQLite Storage Implementation
 *
 * Default storage backend for Git With Intent.
 * Uses better-sqlite3 for synchronous, fast SQLite operations.
 *
 * This is the "boring" implementation that works out of the box
 * for any user who installs the CLI.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

import type {
  PRStore,
  RunStore,
  SettingsStore,
  StoreFactory,
  PRMetadata,
  PRFilter,
  ConflictInfo,
  Run,
  RunStep,
  RunType,
  RunStatus,
  RunResult,
} from './interfaces.js';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Expand ~ to home directory
 */
function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * Ensure directory exists
 */
function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Generate a unique ID
 */
function generateId(prefix: string = ''): string {
  const id = randomUUID().replace(/-/g, '').slice(0, 12);
  return prefix ? `${prefix}-${id}` : id;
}

// =============================================================================
// SQLite PR Store
// =============================================================================

class SQLitePRStore implements PRStore {
  constructor(private db: Database.Database) {}

  async savePR(pr: PRMetadata): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO prs (
        id, url, owner, repo, number, title, body, author,
        base_branch, head_branch, state, mergeable, mergeable_state,
        has_conflicts, files_changed, additions, deletions,
        created_at, updated_at, fetched_at
      ) VALUES (
        @id, @url, @owner, @repo, @number, @title, @body, @author,
        @baseBranch, @headBranch, @state, @mergeable, @mergeableState,
        @hasConflicts, @filesChanged, @additions, @deletions,
        @createdAt, @updatedAt, @fetchedAt
      )
    `);

    stmt.run({
      id: pr.id,
      url: pr.url,
      owner: pr.owner,
      repo: pr.repo,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      author: pr.author,
      baseBranch: pr.baseBranch,
      headBranch: pr.headBranch,
      state: pr.state,
      mergeable: pr.mergeable === null ? null : pr.mergeable ? 1 : 0,
      mergeableState: pr.mergeableState,
      hasConflicts: pr.hasConflicts ? 1 : 0,
      filesChanged: pr.filesChanged,
      additions: pr.additions,
      deletions: pr.deletions,
      createdAt: pr.createdAt.toISOString(),
      updatedAt: pr.updatedAt.toISOString(),
      fetchedAt: pr.fetchedAt.toISOString(),
    });
  }

  async getPR(id: string): Promise<PRMetadata | null> {
    const stmt = this.db.prepare('SELECT * FROM prs WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToPR(row) : null;
  }

  async getPRByUrl(url: string): Promise<PRMetadata | null> {
    const stmt = this.db.prepare('SELECT * FROM prs WHERE url = ?');
    const row = stmt.get(url) as Record<string, unknown> | undefined;
    return row ? this.rowToPR(row) : null;
  }

  async listPRs(filter?: PRFilter): Promise<PRMetadata[]> {
    let sql = 'SELECT * FROM prs WHERE 1=1';
    const params: unknown[] = [];

    if (filter?.owner) {
      sql += ' AND owner = ?';
      params.push(filter.owner);
    }
    if (filter?.repo) {
      sql += ' AND repo = ?';
      params.push(filter.repo);
    }
    if (filter?.state) {
      sql += ' AND state = ?';
      params.push(filter.state);
    }
    if (filter?.hasConflicts !== undefined) {
      sql += ' AND has_conflicts = ?';
      params.push(filter.hasConflicts ? 1 : 0);
    }

    sql += ' ORDER BY updated_at DESC';

    if (filter?.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }
    if (filter?.offset) {
      sql += ' OFFSET ?';
      params.push(filter.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.rowToPR(row));
  }

  async deletePR(id: string): Promise<void> {
    this.db.prepare('DELETE FROM conflicts WHERE pr_id = ?').run(id);
    this.db.prepare('DELETE FROM run_steps WHERE run_id IN (SELECT id FROM runs WHERE pr_id = ?)').run(id);
    this.db.prepare('DELETE FROM runs WHERE pr_id = ?').run(id);
    this.db.prepare('DELETE FROM prs WHERE id = ?').run(id);
  }

  async saveConflicts(prId: string, conflicts: ConflictInfo[]): Promise<void> {
    // Delete existing conflicts
    this.db.prepare('DELETE FROM conflicts WHERE pr_id = ?').run(prId);

    // Insert new conflicts
    const stmt = this.db.prepare(`
      INSERT INTO conflicts (id, pr_id, file, base_content, ours_content, theirs_content, conflict_markers, complexity)
      VALUES (@id, @prId, @file, @baseContent, @oursContent, @theirsContent, @conflictMarkers, @complexity)
    `);

    for (const conflict of conflicts) {
      stmt.run({
        id: generateId('conf'),
        prId,
        file: conflict.file,
        baseContent: conflict.baseContent,
        oursContent: conflict.oursContent,
        theirsContent: conflict.theirsContent,
        conflictMarkers: conflict.conflictMarkers,
        complexity: conflict.complexity,
      });
    }
  }

  async getConflicts(prId: string): Promise<ConflictInfo[]> {
    const stmt = this.db.prepare('SELECT * FROM conflicts WHERE pr_id = ?');
    const rows = stmt.all(prId) as Record<string, unknown>[];
    return rows.map((row) => ({
      file: row.file as string,
      baseContent: row.base_content as string,
      oursContent: row.ours_content as string,
      theirsContent: row.theirs_content as string,
      conflictMarkers: row.conflict_markers as string,
      complexity: row.complexity as number,
    }));
  }

  private rowToPR(row: Record<string, unknown>): PRMetadata {
    return {
      id: row.id as string,
      url: row.url as string,
      owner: row.owner as string,
      repo: row.repo as string,
      number: row.number as number,
      title: row.title as string,
      body: row.body as string,
      author: row.author as string,
      baseBranch: row.base_branch as string,
      headBranch: row.head_branch as string,
      state: row.state as 'open' | 'closed' | 'merged',
      mergeable: row.mergeable === null ? null : row.mergeable === 1,
      mergeableState: row.mergeable_state as string | null,
      hasConflicts: row.has_conflicts === 1,
      filesChanged: row.files_changed as number,
      additions: row.additions as number,
      deletions: row.deletions as number,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      fetchedAt: new Date(row.fetched_at as string),
    };
  }
}

// =============================================================================
// SQLite Run Store
// =============================================================================

class SQLiteRunStore implements RunStore {
  constructor(private db: Database.Database) {}

  async createRun(prId: string, prUrl: string, type: RunType): Promise<Run> {
    const id = generateId('run');
    const now = new Date();

    const stmt = this.db.prepare(`
      INSERT INTO runs (id, pr_id, pr_url, type, status, created_at, updated_at)
      VALUES (@id, @prId, @prUrl, @type, @status, @createdAt, @updatedAt)
    `);

    stmt.run({
      id,
      prId,
      prUrl,
      type,
      status: 'pending',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    return {
      id,
      prId,
      prUrl,
      type,
      status: 'pending',
      steps: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  async getRun(runId: string): Promise<Run | null> {
    const stmt = this.db.prepare('SELECT * FROM runs WHERE id = ?');
    const row = stmt.get(runId) as Record<string, unknown> | undefined;
    if (!row) return null;

    const steps = await this.getSteps(runId);
    return this.rowToRun(row, steps);
  }

  async getLatestRun(prId: string): Promise<Run | null> {
    const stmt = this.db.prepare('SELECT * FROM runs WHERE pr_id = ? ORDER BY created_at DESC LIMIT 1');
    const row = stmt.get(prId) as Record<string, unknown> | undefined;
    if (!row) return null;

    const steps = await this.getSteps(row.id as string);
    return this.rowToRun(row, steps);
  }

  async listRuns(prId: string, limit: number = 10): Promise<Run[]> {
    const stmt = this.db.prepare('SELECT * FROM runs WHERE pr_id = ? ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(prId, limit) as Record<string, unknown>[];

    const runs: Run[] = [];
    for (const row of rows) {
      const steps = await this.getSteps(row.id as string);
      runs.push(this.rowToRun(row, steps));
    }
    return runs;
  }

  async updateRunStatus(runId: string, status: RunStatus): Promise<void> {
    const stmt = this.db.prepare('UPDATE runs SET status = ?, updated_at = ? WHERE id = ?');
    stmt.run(status, new Date().toISOString(), runId);
  }

  async addStep(runId: string, agent: string): Promise<RunStep> {
    const id = generateId('step');
    const now = new Date();

    const stmt = this.db.prepare(`
      INSERT INTO run_steps (id, run_id, agent, status, started_at)
      VALUES (@id, @runId, @agent, @status, @startedAt)
    `);

    stmt.run({
      id,
      runId,
      agent,
      status: 'running',
      startedAt: now.toISOString(),
    });

    // Update run status and current step
    this.db.prepare('UPDATE runs SET status = ?, current_step = ?, updated_at = ? WHERE id = ?')
      .run('running', agent, now.toISOString(), runId);

    return {
      id,
      runId,
      agent,
      status: 'running',
      startedAt: now,
    };
  }

  async updateStep(runId: string, stepId: string, update: Partial<RunStep>): Promise<void> {
    const sets: string[] = [];
    const params: Record<string, unknown> = { stepId };

    if (update.status !== undefined) {
      sets.push('status = @status');
      params.status = update.status;
    }
    if (update.output !== undefined) {
      sets.push('output = @output');
      params.output = JSON.stringify(update.output);
    }
    if (update.error !== undefined) {
      sets.push('error = @error');
      params.error = update.error;
    }
    if (update.completedAt !== undefined) {
      sets.push('completed_at = @completedAt');
      params.completedAt = update.completedAt.toISOString();
    }
    if (update.durationMs !== undefined) {
      sets.push('duration_ms = @durationMs');
      params.durationMs = update.durationMs;
    }
    if (update.tokensUsed !== undefined) {
      sets.push('tokens_input = @tokensInput, tokens_output = @tokensOutput');
      params.tokensInput = update.tokensUsed.input;
      params.tokensOutput = update.tokensUsed.output;
    }

    if (sets.length === 0) return;

    const sql = `UPDATE run_steps SET ${sets.join(', ')} WHERE id = @stepId`;
    this.db.prepare(sql).run(params);

    // Update run updated_at
    this.db.prepare('UPDATE runs SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), runId);
  }

  async getSteps(runId: string): Promise<RunStep[]> {
    const stmt = this.db.prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY started_at ASC');
    const rows = stmt.all(runId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToStep(row));
  }

  async completeRun(runId: string, result: RunResult): Promise<void> {
    const now = new Date();
    const stmt = this.db.prepare(`
      UPDATE runs SET
        status = 'completed',
        result = @result,
        completed_at = @completedAt,
        updated_at = @updatedAt
      WHERE id = @runId
    `);

    stmt.run({
      runId,
      result: JSON.stringify(result),
      completedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  async failRun(runId: string, error: string): Promise<void> {
    const now = new Date();
    const stmt = this.db.prepare(`
      UPDATE runs SET
        status = 'failed',
        error = @error,
        completed_at = @completedAt,
        updated_at = @updatedAt
      WHERE id = @runId
    `);

    stmt.run({
      runId,
      error,
      completedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  async cancelRun(runId: string): Promise<void> {
    const now = new Date();
    this.db.prepare(`
      UPDATE runs SET status = 'cancelled', completed_at = ?, updated_at = ? WHERE id = ?
    `).run(now.toISOString(), now.toISOString(), runId);
  }

  private rowToRun(row: Record<string, unknown>, steps: RunStep[]): Run {
    return {
      id: row.id as string,
      prId: row.pr_id as string,
      prUrl: row.pr_url as string,
      type: row.type as RunType,
      status: row.status as RunStatus,
      currentStep: row.current_step as string | undefined,
      steps,
      result: row.result ? JSON.parse(row.result as string) : undefined,
      error: row.error as string | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
      durationMs: row.duration_ms as number | undefined,
    };
  }

  private rowToStep(row: Record<string, unknown>): RunStep {
    return {
      id: row.id as string,
      runId: row.run_id as string,
      agent: row.agent as string,
      status: row.status as RunStep['status'],
      input: row.input ? JSON.parse(row.input as string) : undefined,
      output: row.output ? JSON.parse(row.output as string) : undefined,
      error: row.error as string | undefined,
      startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
      durationMs: row.duration_ms as number | undefined,
      tokensUsed: row.tokens_input !== null ? {
        input: row.tokens_input as number,
        output: row.tokens_output as number,
      } : undefined,
    };
  }
}

// =============================================================================
// SQLite Settings Store
// =============================================================================

class SQLiteSettingsStore implements SettingsStore {
  constructor(private db: Database.Database) {}

  async get<T>(key: string, defaultValue?: T): Promise<T | null> {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    if (!row) return defaultValue ?? null;
    return JSON.parse(row.value) as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (@key, @value, @updatedAt)
    `);
    stmt.run({
      key,
      value: JSON.stringify(value),
      updatedAt: new Date().toISOString(),
    });
  }

  async delete(key: string): Promise<void> {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }

  async list(prefix?: string): Promise<Record<string, unknown>> {
    let sql = 'SELECT key, value FROM settings';
    const params: string[] = [];

    if (prefix) {
      sql += ' WHERE key LIKE ?';
      params.push(`${prefix}%`);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as { key: string; value: string }[];

    const result: Record<string, unknown> = {};
    for (const row of rows) {
      result[row.key] = JSON.parse(row.value);
    }
    return result;
  }
}

// =============================================================================
// SQLite Store Factory
// =============================================================================

/**
 * SQLite-based storage factory
 *
 * This is the default storage backend for Git With Intent.
 * It creates a SQLite database at the specified path (default: ~/.gwi/data.db)
 */
export class SQLiteStoreFactory implements StoreFactory {
  private db: Database.Database;

  constructor(dbPath: string = '~/.gwi/data.db') {
    const expandedPath = expandPath(dbPath);
    ensureDir(expandedPath);

    this.db = new Database(expandedPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  createPRStore(): PRStore {
    return new SQLitePRStore(this.db);
  }

  createRunStore(): RunStore {
    return new SQLiteRunStore(this.db);
  }

  createSettingsStore(): SettingsStore {
    return new SQLiteSettingsStore(this.db);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private migrate(): void {
    // Create tables
    this.db.exec(`
      -- PRs table
      CREATE TABLE IF NOT EXISTS prs (
        id TEXT PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        author TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        head_branch TEXT NOT NULL,
        state TEXT NOT NULL,
        mergeable INTEGER,
        mergeable_state TEXT,
        has_conflicts INTEGER NOT NULL DEFAULT 0,
        files_changed INTEGER NOT NULL DEFAULT 0,
        additions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );

      -- Conflicts table
      CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY,
        pr_id TEXT NOT NULL REFERENCES prs(id),
        file TEXT NOT NULL,
        base_content TEXT,
        ours_content TEXT,
        theirs_content TEXT,
        conflict_markers TEXT,
        complexity INTEGER NOT NULL DEFAULT 5
      );

      -- Runs table
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        pr_id TEXT NOT NULL,
        pr_url TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        current_step TEXT,
        result TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER
      );

      -- Run steps table
      CREATE TABLE IF NOT EXISTS run_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id),
        agent TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        input TEXT,
        output TEXT,
        error TEXT,
        started_at TEXT,
        completed_at TEXT,
        duration_ms INTEGER,
        tokens_input INTEGER,
        tokens_output INTEGER
      );

      -- Settings table
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_prs_url ON prs(url);
      CREATE INDEX IF NOT EXISTS idx_prs_owner_repo ON prs(owner, repo);
      CREATE INDEX IF NOT EXISTS idx_conflicts_pr_id ON conflicts(pr_id);
      CREATE INDEX IF NOT EXISTS idx_runs_pr_id ON runs(pr_id);
      CREATE INDEX IF NOT EXISTS idx_run_steps_run_id ON run_steps(run_id);
    `);
  }
}
