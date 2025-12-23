/**
 * Migration System Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MigrationManager } from '../migrations.js';
import { createInMemoryConnection } from '../connection.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('MigrationManager', () => {
  let db: Database.Database;
  let tempDir: string;
  let manager: MigrationManager;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Create temp directory for test migrations
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwi-migrations-test-'));

    manager = new MigrationManager(db, tempDir);
  });

  afterEach(() => {
    db.close();
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('getCurrentVersion', () => {
    it('should return 0 for new database', () => {
      const version = manager.getCurrentVersion();
      expect(version).toBe(0);
    });

    it('should return highest version after migrations', () => {
      // Manually insert versions
      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now')),
          description TEXT NOT NULL
        );
      `);

      db.prepare('INSERT INTO schema_version (version, description) VALUES (?, ?)')
        .run(1, 'First migration');

      db.prepare('INSERT INTO schema_version (version, description) VALUES (?, ?)')
        .run(2, 'Second migration');

      const version = manager.getCurrentVersion();
      expect(version).toBe(2);
    });
  });

  describe('getAvailableMigrations', () => {
    it('should find migration files', () => {
      // Create test migration files
      fs.writeFileSync(
        path.join(tempDir, '001_initial.sql'),
        'CREATE TABLE test (id INTEGER PRIMARY KEY);'
      );

      fs.writeFileSync(
        path.join(tempDir, '002_add_column.sql'),
        'ALTER TABLE test ADD COLUMN name TEXT;'
      );

      const migrations = manager.getAvailableMigrations();

      expect(migrations).toHaveLength(2);
      expect(migrations[0].version).toBe(1);
      expect(migrations[0].description).toBe('initial');
      expect(migrations[1].version).toBe(2);
      expect(migrations[1].description).toBe('add column');
    });

    it('should skip invalid filenames', () => {
      fs.writeFileSync(path.join(tempDir, '001_valid.sql'), 'SELECT 1;');
      fs.writeFileSync(path.join(tempDir, 'invalid.sql'), 'SELECT 1;');
      fs.writeFileSync(path.join(tempDir, 'README.md'), '# Migrations');

      const migrations = manager.getAvailableMigrations();

      expect(migrations).toHaveLength(1);
      expect(migrations[0].version).toBe(1);
    });

    it('should sort migrations by version', () => {
      fs.writeFileSync(path.join(tempDir, '003_third.sql'), 'SELECT 3;');
      fs.writeFileSync(path.join(tempDir, '001_first.sql'), 'SELECT 1;');
      fs.writeFileSync(path.join(tempDir, '002_second.sql'), 'SELECT 2;');

      const migrations = manager.getAvailableMigrations();

      expect(migrations).toHaveLength(3);
      expect(migrations[0].version).toBe(1);
      expect(migrations[1].version).toBe(2);
      expect(migrations[2].version).toBe(3);
    });
  });

  describe('getPendingMigrations', () => {
    beforeEach(() => {
      // Setup schema_version table
      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now')),
          description TEXT NOT NULL
        );
      `);

      // Create test migrations
      fs.writeFileSync(path.join(tempDir, '001_first.sql'), 'SELECT 1;');
      fs.writeFileSync(path.join(tempDir, '002_second.sql'), 'SELECT 2;');
      fs.writeFileSync(path.join(tempDir, '003_third.sql'), 'SELECT 3;');
    });

    it('should return all migrations for new database', () => {
      const pending = manager.getPendingMigrations();
      expect(pending).toHaveLength(3);
    });

    it('should return only unapplied migrations', () => {
      // Mark first migration as applied
      db.prepare('INSERT INTO schema_version (version, description) VALUES (?, ?)')
        .run(1, 'first');

      const pending = manager.getPendingMigrations();

      expect(pending).toHaveLength(2);
      expect(pending[0].version).toBe(2);
      expect(pending[1].version).toBe(3);
    });

    it('should return empty array if all applied', () => {
      db.prepare('INSERT INTO schema_version (version, description) VALUES (?, ?)')
        .run(1, 'first');
      db.prepare('INSERT INTO schema_version (version, description) VALUES (?, ?)')
        .run(2, 'second');
      db.prepare('INSERT INTO schema_version (version, description) VALUES (?, ?)')
        .run(3, 'third');

      const pending = manager.getPendingMigrations();
      expect(pending).toHaveLength(0);
    });
  });

  describe('migrate', () => {
    it('should apply pending migrations', () => {
      // Create test migration
      fs.writeFileSync(
        path.join(tempDir, '001_create_test.sql'),
        `
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        );
        INSERT INTO schema_version (version, description) VALUES (1, 'create test');
        `
      );

      const results = manager.migrate();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].version).toBe(1);

      // Verify table was created
      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'`)
        .all();

      expect(tables).toHaveLength(1);

      // Verify version was recorded
      const version = manager.getCurrentVersion();
      expect(version).toBe(1);
    });

    it('should stop on migration failure', () => {
      // Create migrations (second one will fail)
      fs.writeFileSync(
        path.join(tempDir, '001_good.sql'),
        `
        CREATE TABLE good_table (id INTEGER);
        INSERT INTO schema_version (version, description) VALUES (1, 'good');
        `
      );

      fs.writeFileSync(
        path.join(tempDir, '002_bad.sql'),
        `
        INVALID SQL SYNTAX;
        INSERT INTO schema_version (version, description) VALUES (2, 'bad');
        `
      );

      const results = manager.migrate();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBeDefined();

      // Only first migration should be applied
      const version = manager.getCurrentVersion();
      expect(version).toBe(1);
    });

    it('should handle empty migration list', () => {
      // No migrations created
      const results = manager.migrate();
      expect(results).toHaveLength(0);
    });
  });

  describe('migrateToVersion', () => {
    beforeEach(() => {
      // Create test migrations
      fs.writeFileSync(
        path.join(tempDir, '001_first.sql'),
        `
        CREATE TABLE test1 (id INTEGER);
        INSERT INTO schema_version (version, description) VALUES (1, 'first');
        `
      );

      fs.writeFileSync(
        path.join(tempDir, '002_second.sql'),
        `
        CREATE TABLE test2 (id INTEGER);
        INSERT INTO schema_version (version, description) VALUES (2, 'second');
        `
      );

      fs.writeFileSync(
        path.join(tempDir, '003_third.sql'),
        `
        CREATE TABLE test3 (id INTEGER);
        INSERT INTO schema_version (version, description) VALUES (3, 'third');
        `
      );
    });

    it('should migrate to specific version', () => {
      const results = manager.migrateToVersion(2);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);

      const version = manager.getCurrentVersion();
      expect(version).toBe(2);

      // Verify only first two tables exist
      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'test%'`)
        .all() as Array<{ name: string }>;

      expect(tables).toHaveLength(2);
      expect(tables.map(t => t.name).sort()).toEqual(['test1', 'test2']);
    });

    it('should throw error for backward migration', () => {
      // Apply all migrations first
      manager.migrate();

      expect(() => manager.migrateToVersion(1)).toThrow(
        'Cannot migrate backwards'
      );
    });
  });

  describe('getHistory', () => {
    it('should return migration history', () => {
      // Create and apply migrations
      fs.writeFileSync(
        path.join(tempDir, '001_first.sql'),
        `
        CREATE TABLE test1 (id INTEGER);
        INSERT INTO schema_version (version, description) VALUES (1, 'first migration');
        `
      );

      fs.writeFileSync(
        path.join(tempDir, '002_second.sql'),
        `
        CREATE TABLE test2 (id INTEGER);
        INSERT INTO schema_version (version, description) VALUES (2, 'second migration');
        `
      );

      manager.migrate();

      const history = manager.getHistory();

      expect(history).toHaveLength(2);
      expect(history[0].version).toBe(1);
      expect(history[0].description).toBe('first migration');
      expect(history[1].version).toBe(2);
      expect(history[1].description).toBe('second migration');
    });
  });

  describe('needsMigration', () => {
    it('should return true when migrations pending', () => {
      fs.writeFileSync(path.join(tempDir, '001_test.sql'), 'SELECT 1;');
      expect(manager.needsMigration()).toBe(true);
    });

    it('should return false when up to date', () => {
      expect(manager.needsMigration()).toBe(false);
    });
  });

  describe('validate', () => {
    it('should validate complete schema', () => {
      // Create all required tables manually for test
      db.exec(`
        CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, description TEXT NOT NULL);
        CREATE TABLE autofix_runs (id TEXT PRIMARY KEY, issue_number INTEGER NOT NULL);
        CREATE TABLE ai_calls (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL);
        CREATE TABLE code_changes (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL);
        CREATE TABLE quality_metrics (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL);
        CREATE TABLE grades (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL);
        CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT);
      `);

      // Enable pragmas properly
      db.pragma('foreign_keys = ON');
      db.pragma('journal_mode = WAL'); // Will be 'memory' for in-memory DBs

      const result = manager.validate();

      // In-memory databases will have "memory" journal mode, not "wal"
      // This is expected and acceptable for testing
      if (!result.valid) {
        // Filter out WAL warning for in-memory databases
        const filteredErrors = result.errors.filter(e => !e.includes('WAL mode'));
        expect(filteredErrors).toHaveLength(0);
      } else {
        expect(result.valid).toBe(true);
      }
    });

    it('should detect missing tables', () => {
      // Create partial schema
      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL,
          description TEXT NOT NULL
        );
        PRAGMA foreign_keys=ON;
        PRAGMA journal_mode=WAL;
      `);

      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('Missing table'))).toBe(true);
    });
  });
});
