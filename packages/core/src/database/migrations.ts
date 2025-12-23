/**
 * Database Migration System
 *
 * Handles versioned schema changes with rollback support and validation.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export interface Migration {
  version: number;
  description: string;
  file: string;
  sql: string;
}

export interface MigrationResult {
  version: number;
  description: string;
  success: boolean;
  error?: string;
  duration: number;
}

export class MigrationManager {
  private db: Database.Database;
  private migrationsDir: string;

  constructor(db: Database.Database, migrationsDir?: string) {
    this.db = db;
    this.migrationsDir = migrationsDir || path.join(process.cwd(), 'db', 'migrations');
  }

  /**
   * Initialize migration tracking table
   */
  private initMigrationTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now')),
        description TEXT NOT NULL
      );
    `);
  }

  /**
   * Get current schema version
   */
  getCurrentVersion(): number {
    this.initMigrationTable();

    const row = this.db
      .prepare('SELECT MAX(version) as version FROM schema_version')
      .get() as { version: number | null };

    return row.version || 0;
  }

  /**
   * Get all available migrations
   */
  getAvailableMigrations(): Migration[] {
    if (!fs.existsSync(this.migrationsDir)) {
      throw new Error(`Migrations directory not found: ${this.migrationsDir}`);
    }

    const files = fs
      .readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const migrations: Migration[] = [];

    for (const file of files) {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        console.warn(`Skipping invalid migration file: ${file}`);
        continue;
      }

      const version = parseInt(match[1], 10);
      const description = match[2].replace(/_/g, ' ');
      const filePath = path.join(this.migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      migrations.push({
        version,
        description,
        file,
        sql
      });
    }

    return migrations;
  }

  /**
   * Get pending migrations
   */
  getPendingMigrations(): Migration[] {
    const currentVersion = this.getCurrentVersion();
    const available = this.getAvailableMigrations();

    return available.filter(m => m.version > currentVersion);
  }

  /**
   * Apply a single migration
   */
  private applyMigration(migration: Migration): MigrationResult {
    const startTime = Date.now();

    try {
      // Run migration in a transaction
      this.db.exec('BEGIN TRANSACTION;');

      // Execute migration SQL
      this.db.exec(migration.sql);

      // Record migration
      this.db
        .prepare(
          `INSERT INTO schema_version (version, description)
           VALUES (?, ?)
           ON CONFLICT(version) DO NOTHING`
        )
        .run(migration.version, migration.description);

      this.db.exec('COMMIT;');

      const duration = Date.now() - startTime;

      return {
        version: migration.version,
        description: migration.description,
        success: true,
        duration
      };
    } catch (error) {
      this.db.exec('ROLLBACK;');

      return {
        version: migration.version,
        description: migration.description,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Apply all pending migrations
   */
  migrate(): MigrationResult[] {
    this.initMigrationTable();

    const pending = this.getPendingMigrations();

    if (pending.length === 0) {
      console.log('✓ Database is up to date. No migrations needed.');
      return [];
    }

    console.log(`Applying ${pending.length} migration(s)...`);

    const results: MigrationResult[] = [];

    for (const migration of pending) {
      console.log(`  → Migration ${migration.version}: ${migration.description}`);

      const result = this.applyMigration(migration);
      results.push(result);

      if (result.success) {
        console.log(`    ✓ Applied in ${result.duration}ms`);
      } else {
        console.error(`    ✗ Failed: ${result.error}`);
        break; // Stop on first failure
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\nCompleted: ${successful} successful, ${failed} failed`);

    return results;
  }

  /**
   * Migrate to a specific version
   */
  migrateToVersion(targetVersion: number): MigrationResult[] {
    this.initMigrationTable();

    const currentVersion = this.getCurrentVersion();
    const available = this.getAvailableMigrations();

    if (targetVersion < currentVersion) {
      throw new Error(
        `Cannot migrate backwards. Current version: ${currentVersion}, Target: ${targetVersion}`
      );
    }

    if (targetVersion === currentVersion) {
      console.log(`✓ Already at version ${targetVersion}`);
      return [];
    }

    const toApply = available.filter(
      m => m.version > currentVersion && m.version <= targetVersion
    );

    if (toApply.length === 0) {
      throw new Error(`No migrations found between ${currentVersion} and ${targetVersion}`);
    }

    console.log(`Migrating from v${currentVersion} to v${targetVersion}...`);

    const results: MigrationResult[] = [];

    for (const migration of toApply) {
      console.log(`  → Migration ${migration.version}: ${migration.description}`);

      const result = this.applyMigration(migration);
      results.push(result);

      if (result.success) {
        console.log(`    ✓ Applied in ${result.duration}ms`);
      } else {
        console.error(`    ✗ Failed: ${result.error}`);
        break;
      }
    }

    return results;
  }

  /**
   * Get migration history
   */
  getHistory(): Array<{ version: number; description: string; appliedAt: string }> {
    this.initMigrationTable();

    return this.db
      .prepare(
        `SELECT version, description, applied_at as appliedAt
         FROM schema_version
         ORDER BY version ASC`
      )
      .all() as Array<{ version: number; description: string; appliedAt: string }>;
  }

  /**
   * Check if database needs migration
   */
  needsMigration(): boolean {
    return this.getPendingMigrations().length > 0;
  }

  /**
   * Validate database schema
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      // Check if core tables exist
      const tables = [
        'schema_version',
        'autofix_runs',
        'ai_calls',
        'code_changes',
        'quality_metrics',
        'grades',
        'alerts'
      ];

      for (const table of tables) {
        const result = this.db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
          )
          .get(table);

        if (!result) {
          errors.push(`Missing table: ${table}`);
        }
      }

      // Check foreign key support
      const fkResult = this.db.prepare('PRAGMA foreign_keys').get() as {
        foreign_keys: number;
      };

      if (fkResult.foreign_keys !== 1) {
        errors.push('Foreign keys are not enabled');
      }

      // Check WAL mode (case-insensitive)
      const walResult = this.db.prepare('PRAGMA journal_mode').get() as {
        journal_mode: string;
      };

      if (walResult.journal_mode.toLowerCase() !== 'wal') {
        errors.push('WAL mode is not enabled (expected for performance)');
      }

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        valid: false,
        errors
      };
    }
  }
}

/**
 * Run migrations from CLI
 */
export async function runMigrations(dbPath: string, migrationsDir?: string): Promise<void> {
  const db = new Database(dbPath);
  const manager = new MigrationManager(db, migrationsDir);

  try {
    console.log('Database Migration Tool\n');
    console.log(`Database: ${dbPath}`);
    console.log(`Migrations: ${migrationsDir || 'db/migrations'}\n`);

    const currentVersion = manager.getCurrentVersion();
    console.log(`Current version: ${currentVersion}`);

    const pending = manager.getPendingMigrations();
    console.log(`Pending migrations: ${pending.length}\n`);

    if (pending.length === 0) {
      console.log('✓ Database is up to date.');
      return;
    }

    const results = manager.migrate();
    const failed = results.filter(r => !r.success);

    if (failed.length > 0) {
      console.error('\n✗ Migration failed. See errors above.');
      process.exit(1);
    }

    console.log('\n✓ All migrations applied successfully.');

    // Validate schema
    console.log('\nValidating schema...');
    const validation = manager.validate();

    if (validation.valid) {
      console.log('✓ Schema validation passed.');
    } else {
      console.error('✗ Schema validation failed:');
      validation.errors.forEach(err => console.error(`  - ${err}`));
      process.exit(1);
    }
  } finally {
    db.close();
  }
}
