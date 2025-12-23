/**
 * Backup Utilities Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createBackupManager, BackupManager } from '../backup.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Minimal test schema
const TEST_SCHEMA = `
  CREATE TABLE schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    description TEXT NOT NULL
  );

  INSERT INTO schema_version (version, description) VALUES (1, 'Test schema');

  CREATE TABLE test_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE test_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES test_users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  PRAGMA foreign_keys = ON;
`;

describe('Backup Utilities', () => {
  let db: Database.Database;
  let backup: BackupManager;
  let tempDir: string;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');
    db.exec(TEST_SCHEMA);

    // Create temp directory for backups
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwi-backup-test-'));

    backup = createBackupManager(db);

    // Insert sample data
    db.prepare('INSERT INTO test_users (name, email) VALUES (?, ?)').run('Alice', 'alice@example.com');
    db.prepare('INSERT INTO test_users (name, email) VALUES (?, ?)').run('Bob', 'bob@example.com');
    db.prepare('INSERT INTO test_posts (user_id, title, content) VALUES (?, ?, ?)').run(1, 'First Post', 'Content 1');
    db.prepare('INSERT INTO test_posts (user_id, title, content) VALUES (?, ?, ?)').run(1, 'Second Post', 'Content 2');
  });

  afterEach(() => {
    db.close();

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('SQL Backup', () => {
    it('should create an uncompressed SQL backup', async () => {
      const backupPath = path.join(tempDir, 'test-backup.sql');

      const metadata = await backup.backup(backupPath, {
        format: 'sql',
        compress: false
      });

      expect(metadata.format).toBe('sql');
      expect(metadata.compressed).toBe(false);
      expect(metadata.table_count).toBeGreaterThan(0);
      expect(metadata.row_count).toBeGreaterThanOrEqual(5); // At least 1 schema_version + 2 users + 2 posts
      expect(metadata.checksum).toBeDefined();
      expect(metadata.schema_version).toBe(1);

      // Check files exist
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(fs.existsSync(`${backupPath}.meta.json`)).toBe(true);

      // Check SQL content
      const content = fs.readFileSync(backupPath, 'utf-8');
      expect(content).toContain('BEGIN TRANSACTION');
      expect(content).toContain('test_users');
      expect(content).toContain('test_posts');
      expect(content).toContain('Alice');
      expect(content).toContain('First Post');
    });

    it('should create a compressed SQL backup', async () => {
      const backupPath = path.join(tempDir, 'test-backup-compressed.sql');

      const metadata = await backup.backup(backupPath, {
        format: 'sql',
        compress: true
      });

      expect(metadata.compressed).toBe(true);

      // Check compressed file exists
      expect(fs.existsSync(`${backupPath}.gz`)).toBe(true);
    });

    it('should include schema in SQL backup', async () => {
      const backupPath = path.join(tempDir, 'test-backup-schema.sql');

      await backup.backup(backupPath, {
        format: 'sql',
        compress: false,
        includeSchema: true
      });

      const content = fs.readFileSync(backupPath, 'utf-8');
      expect(content).toContain('CREATE TABLE');
      expect(content).toContain('DROP TABLE IF EXISTS');
    });

    it('should exclude tables from backup', async () => {
      const backupPath = path.join(tempDir, 'test-backup-exclude.sql');

      const metadata = await backup.backup(backupPath, {
        format: 'sql',
        compress: false,
        excludeTables: ['test_posts']
      });

      expect(metadata.tables).not.toContain('test_posts');
      expect(metadata.row_count).toBeGreaterThanOrEqual(3); // At least schema_version + test_users
    });

    it('should include only specified tables', async () => {
      const backupPath = path.join(tempDir, 'test-backup-include.sql');

      const metadata = await backup.backup(backupPath, {
        format: 'sql',
        compress: false,
        includeTables: ['test_users']
      });

      expect(metadata.tables).toEqual(['test_users']);
      expect(metadata.table_count).toBe(1);
    });
  });

  describe('JSON Backup', () => {
    it('should create a JSON backup', async () => {
      const backupPath = path.join(tempDir, 'test-backup.json');

      const metadata = await backup.backup(backupPath, {
        format: 'json',
        compress: false
      });

      expect(metadata.format).toBe('json');
      expect(fs.existsSync(backupPath)).toBe(true);

      // Parse and verify JSON content
      const content = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
      expect(content.meta).toBeDefined();
      expect(content.data).toBeDefined();
      expect(content.data.test_users).toHaveLength(2);
      expect(content.data.test_posts).toHaveLength(2);
    });

    it('should create a compressed JSON backup', async () => {
      const backupPath = path.join(tempDir, 'test-backup.json');

      const metadata = await backup.backup(backupPath, {
        format: 'json',
        compress: true
      });

      expect(metadata.compressed).toBe(true);
      expect(fs.existsSync(`${backupPath}.gz`)).toBe(true);
    });
  });

  describe('Restore', () => {
    it('should restore from SQL backup', async () => {
      // Create backup (include schema for restore to work)
      const backupPath = path.join(tempDir, 'restore-test.sql');
      await backup.backup(backupPath, { format: 'sql', compress: false, includeSchema: true });

      // Create new database
      const newDb = new Database(':memory:');
      const newBackup = createBackupManager(newDb);

      // Restore
      const result = await newBackup.restore(backupPath, {
        dropExisting: true,
        verify: true
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.tables_restored).toBeGreaterThan(0);
      expect(result.rows_restored).toBe(5);

      // Verify data
      const users = newDb.prepare('SELECT * FROM test_users').all();
      expect(users).toHaveLength(2);

      const posts = newDb.prepare('SELECT * FROM test_posts').all();
      expect(posts).toHaveLength(2);

      newDb.close();
    });

    it('should restore from compressed backup', async () => {
      // Create compressed backup
      const backupPath = path.join(tempDir, 'restore-compressed.sql');
      await backup.backup(backupPath, { format: 'sql', compress: true });

      // Create new database
      const newDb = new Database(':memory:');
      const newBackup = createBackupManager(newDb);

      // Restore
      const result = await newBackup.restore(backupPath);

      expect(result.success).toBe(true);
      expect(result.rows_restored).toBe(5);

      newDb.close();
    });

    it('should restore from JSON backup', async () => {
      // Create JSON backup
      const backupPath = path.join(tempDir, 'restore-json.json');
      await backup.backup(backupPath, { format: 'json', compress: false });

      // Create new database
      const newDb = new Database(':memory:');
      newDb.exec(TEST_SCHEMA); // JSON backup doesn't include schema
      const newBackup = createBackupManager(newDb);

      // Restore
      const result = await newBackup.restore(backupPath);

      expect(result.success).toBe(true);
      expect(result.rows_restored).toBe(4); // 2 users + 2 posts (schema_version excluded from JSON)

      // Verify data
      const users = newDb.prepare('SELECT * FROM test_users').all();
      expect(users).toHaveLength(2);

      newDb.close();
    });

    it('should handle dry run mode', async () => {
      // Create backup
      const backupPath = path.join(tempDir, 'dry-run.sql');
      await backup.backup(backupPath, { format: 'sql', compress: false });

      // Create new database
      const newDb = new Database(':memory:');
      const newBackup = createBackupManager(newDb);

      // Dry run restore
      const result = await newBackup.restore(backupPath, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Dry run mode - no changes made');

      // Verify no tables were created
      const tables = newDb
        .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
        .all();
      expect(tables).toHaveLength(0);

      newDb.close();
    });

    it('should fail restore with invalid backup', async () => {
      const invalidPath = path.join(tempDir, 'invalid.sql');

      const result = await backup.restore(invalidPath);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('not found');
    });
  });

  describe('Verification', () => {
    it('should verify valid backup', async () => {
      const backupPath = path.join(tempDir, 'verify-test.sql');
      await backup.backup(backupPath, { format: 'sql', compress: false });

      const result = await backup.verify(backupPath);

      expect(result.valid).toBe(true);
      expect(result.checksum_match).toBe(true);
      expect(result.schema_match).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect corrupted backup', async () => {
      const backupPath = path.join(tempDir, 'corrupt.sql');
      await backup.backup(backupPath, { format: 'sql', compress: false });

      // Corrupt the backup file
      fs.appendFileSync(backupPath, '\n-- CORRUPTED DATA');

      const result = await backup.verify(backupPath);

      expect(result.valid).toBe(false);
      expect(result.checksum_match).toBe(false);
      expect(result.errors).toContain('Checksum mismatch - backup may be corrupted');
    });

    it('should detect missing backup file', async () => {
      const missingPath = path.join(tempDir, 'missing.sql');

      const result = await backup.verify(missingPath);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Backup Management', () => {
    it('should list backups in directory', async () => {
      // Create multiple backups
      await backup.backup(path.join(tempDir, 'backup1.sql'), { compress: false });
      await backup.backup(path.join(tempDir, 'backup2.sql'), { compress: false });
      await backup.backup(path.join(tempDir, 'backup3.sql'), { compress: false });

      const backups = backup.listBackups(tempDir);

      expect(backups).toHaveLength(3);
      expect(backups[0].path).toBeDefined();
      expect(backups[0].timestamp).toBeDefined();

      // Should be sorted by timestamp (newest first)
      expect(backups[0].timestamp >= backups[1].timestamp).toBe(true);
      expect(backups[1].timestamp >= backups[2].timestamp).toBe(true);
    });

    it('should handle empty backup directory', () => {
      const emptyDir = path.join(tempDir, 'empty');
      fs.mkdirSync(emptyDir);

      const backups = backup.listBackups(emptyDir);

      expect(backups).toHaveLength(0);
    });

    it('should clean up old backups', async () => {
      // Create 5 backups
      for (let i = 1; i <= 5; i++) {
        await backup.backup(path.join(tempDir, `backup${i}.sql`), { compress: false });
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Keep only 3 most recent
      const deleted = backup.cleanupOldBackups(tempDir, 3);

      expect(deleted).toBe(2);

      const remaining = backup.listBackups(tempDir);
      expect(remaining).toHaveLength(3);
    });

    it('should not delete backups if under limit', async () => {
      // Create 2 backups
      await backup.backup(path.join(tempDir, 'backup1.sql'), { compress: false });
      await backup.backup(path.join(tempDir, 'backup2.sql'), { compress: false });

      // Try to keep 5
      const deleted = backup.cleanupOldBackups(tempDir, 5);

      expect(deleted).toBe(0);

      const remaining = backup.listBackups(tempDir);
      expect(remaining).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty database', async () => {
      // Create empty database
      const emptyDb = new Database(':memory:');
      emptyDb.exec(`
        CREATE TABLE empty_table (id INTEGER PRIMARY KEY);
        CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT, description TEXT);
        INSERT INTO schema_version (version, description) VALUES (1, 'Test');
      `);
      const emptyBackup = createBackupManager(emptyDb);

      const backupPath = path.join(tempDir, 'empty.sql');
      const metadata = await emptyBackup.backup(backupPath, { compress: false });

      expect(metadata.table_count).toBe(2);
      expect(metadata.row_count).toBe(1); // Only schema_version row

      emptyDb.close();
    });

    it('should handle tables with special characters', async () => {
      db.exec(`
        CREATE TABLE "test-table" (id INTEGER PRIMARY KEY, data TEXT);
        INSERT INTO "test-table" (data) VALUES ('test');
      `);

      const backupPath = path.join(tempDir, 'special-chars.sql');
      const metadata = await backup.backup(backupPath, { compress: false });

      expect(metadata.tables).toContain('test-table');
    });

    it('should handle NULL values correctly', async () => {
      db.prepare('INSERT INTO test_posts (user_id, title, content) VALUES (?, ?, ?)').run(1, 'NULL Test', null);

      const backupPath = path.join(tempDir, 'nulls.sql');
      await backup.backup(backupPath, { format: 'sql', compress: false });

      const newDb = new Database(':memory:');
      const newBackup = createBackupManager(newDb);

      await newBackup.restore(backupPath);

      const posts = newDb.prepare('SELECT * FROM test_posts WHERE title = ?').get('NULL Test') as any;
      expect(posts.content).toBeNull();

      newDb.close();
    });
  });
});
