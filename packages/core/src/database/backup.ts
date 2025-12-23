/**
 * Database Backup and Restore Utilities
 *
 * Provides safe backup/restore operations with verification and integrity checks.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface BackupOptions {
  compress?: boolean;
  includeSchema?: boolean;
  includeTables?: string[];
  excludeTables?: string[];
  format?: 'sql' | 'json';
}

export interface BackupMetadata {
  version: string;
  timestamp: string;
  database_path: string;
  format: 'sql' | 'json';
  compressed: boolean;
  checksum: string;
  table_count: number;
  row_count: number;
  schema_version: number;
  tables: string[];
}

export interface RestoreOptions {
  verify?: boolean;
  dropExisting?: boolean;
  dryRun?: boolean;
}

export interface RestoreResult {
  success: boolean;
  tables_restored: number;
  rows_restored: number;
  errors: string[];
  warnings: string[];
}

export interface VerificationResult {
  valid: boolean;
  checksum_match: boolean;
  schema_match: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Backup Manager
// ============================================================================

export class BackupManager {
  constructor(private db: Database.Database) {}

  /**
   * Create a backup of the database
   */
  async backup(outputPath: string, options: BackupOptions = {}): Promise<BackupMetadata> {
    const {
      compress = true,
      includeSchema = true,
      format = 'sql',
      includeTables,
      excludeTables
    } = options;

    // Get list of tables to backup
    let tables = this.getTables(includeTables, excludeTables);

    // For JSON format, exclude schema_version as it's metadata, not user data
    if (format === 'json') {
      tables = tables.filter(t => t !== 'schema_version');
    }

    // Generate backup content
    const content = format === 'sql'
      ? this.generateSQLBackup(tables, includeSchema)
      : this.generateJSONBackup(tables);

    // Calculate checksum
    const checksum = this.calculateChecksum(content);

    // Write to file (with optional compression)
    const finalPath = compress ? `${outputPath}.gz` : outputPath;
    await this.writeBackup(content, finalPath, compress);

    // Get row count
    const rowCount = this.getRowCount(tables);

    // Create metadata
    const metadata: BackupMetadata = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database_path: (this.db as any).name || ':memory:',
      format,
      compressed: compress,
      checksum,
      table_count: tables.length,
      row_count: rowCount,
      schema_version: this.getSchemaVersion(),
      tables
    };

    // Write metadata file
    const metadataPath = `${outputPath}.meta.json`;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    return metadata;
  }

  /**
   * Restore database from backup
   */
  async restore(backupPath: string, options: RestoreOptions = {}): Promise<RestoreResult> {
    const {
      verify = true,
      dropExisting = false,
      dryRun = false
    } = options;

    const result: RestoreResult = {
      success: false,
      tables_restored: 0,
      rows_restored: 0,
      errors: [],
      warnings: []
    };

    try {
      // Read metadata
      const metadataPath = `${backupPath}.meta.json`;
      if (!fs.existsSync(metadataPath)) {
        throw new Error('Backup metadata file not found');
      }

      const metadata: BackupMetadata = JSON.parse(
        fs.readFileSync(metadataPath, 'utf-8')
      );

      // Verify backup if requested
      if (verify) {
        const verification = await this.verify(backupPath);
        if (!verification.valid) {
          result.errors.push('Backup verification failed');
          result.errors.push(...verification.errors);
          return result;
        }
      }

      // Read backup content
      const actualBackupPath = metadata.compressed ? `${backupPath}.gz` : backupPath;
      const content = await this.readBackup(actualBackupPath, metadata.compressed);

      if (dryRun) {
        result.warnings.push('Dry run mode - no changes made');
        result.success = true;
        return result;
      }

      // Drop existing tables if requested
      if (dropExisting) {
        for (const table of metadata.tables) {
          if (table !== 'schema_version') {
            this.db.exec(`DROP TABLE IF EXISTS ${table}`);
          }
        }
      }

      // Restore data
      if (metadata.format === 'sql') {
        this.restoreFromSQL(content);
      } else {
        this.restoreFromJSON(content);
      }

      result.tables_restored = metadata.table_count;
      result.rows_restored = metadata.row_count;
      result.success = true;

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Verify backup integrity
   */
  async verify(backupPath: string): Promise<VerificationResult> {
    const result: VerificationResult = {
      valid: true,
      checksum_match: false,
      schema_match: false,
      errors: [],
      warnings: []
    };

    try {
      // Check metadata file exists
      const metadataPath = `${backupPath}.meta.json`;
      if (!fs.existsSync(metadataPath)) {
        result.errors.push('Metadata file not found');
        result.valid = false;
        return result;
      }

      const metadata: BackupMetadata = JSON.parse(
        fs.readFileSync(metadataPath, 'utf-8')
      );

      // Check backup file exists
      const actualBackupPath = metadata.compressed ? `${backupPath}.gz` : backupPath;
      if (!fs.existsSync(actualBackupPath)) {
        result.errors.push('Backup file not found');
        result.valid = false;
        return result;
      }

      // Verify checksum
      const content = await this.readBackup(actualBackupPath, metadata.compressed);
      const actualChecksum = this.calculateChecksum(content);

      if (actualChecksum === metadata.checksum) {
        result.checksum_match = true;
      } else {
        result.errors.push('Checksum mismatch - backup may be corrupted');
        result.valid = false;
      }

      // Verify schema version compatibility
      const currentSchemaVersion = this.getSchemaVersion();
      if (metadata.schema_version === currentSchemaVersion) {
        result.schema_match = true;
      } else {
        result.warnings.push(
          `Schema version mismatch: backup is v${metadata.schema_version}, current is v${currentSchemaVersion}`
        );
      }

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      result.valid = false;
    }

    return result;
  }

  /**
   * List available backups in a directory
   */
  listBackups(directory: string): Array<BackupMetadata & { path: string }> {
    if (!fs.existsSync(directory)) {
      return [];
    }

    const files = fs.readdirSync(directory);
    const metadataFiles = files.filter(f => f.endsWith('.meta.json'));

    return metadataFiles.map(file => {
      const metadataPath = path.join(directory, file);
      const metadata: BackupMetadata = JSON.parse(
        fs.readFileSync(metadataPath, 'utf-8')
      );

      return {
        ...metadata,
        path: path.join(directory, file.replace('.meta.json', ''))
      };
    }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  /**
   * Clean up old backups (keep N most recent)
   */
  cleanupOldBackups(directory: string, keepCount: number = 10): number {
    const backups = this.listBackups(directory);

    if (backups.length <= keepCount) {
      return 0;
    }

    const toDelete = backups.slice(keepCount);
    let deleted = 0;

    for (const backup of toDelete) {
      try {
        // Delete backup file
        const backupFile = backup.compressed ? `${backup.path}.gz` : backup.path;
        if (fs.existsSync(backupFile)) {
          fs.unlinkSync(backupFile);
        }

        // Delete metadata file
        const metadataFile = `${backup.path}.meta.json`;
        if (fs.existsSync(metadataFile)) {
          fs.unlinkSync(metadataFile);
        }

        deleted++;
      } catch (error) {
        console.error(`Failed to delete backup ${backup.path}:`, error);
      }
    }

    return deleted;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private getTables(include?: string[], exclude?: string[]): string[] {
    const allTables = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;

    let tables = allTables.map(t => t.name);

    // Always exclude SQLite internal tables (they start with sqlite_)
    tables = tables.filter(t => !t.startsWith('sqlite_'));

    // Filter by include list
    if (include && include.length > 0) {
      tables = tables.filter(t => include.includes(t));
    }

    // Filter by exclude list
    if (exclude && exclude.length > 0) {
      tables = tables.filter(t => !exclude.includes(t));
    }

    return tables;
  }

  private generateSQLBackup(tables: string[], includeSchema: boolean): string {
    let sql = '';

    sql += '-- Database Backup\n';
    sql += `-- Created: ${new Date().toISOString()}\n`;
    sql += '-- Format: SQL\n\n';

    // Disable foreign keys during restore
    sql += 'PRAGMA foreign_keys=OFF;\n';
    sql += 'BEGIN TRANSACTION;\n\n';

    for (const table of tables) {
      // Get table schema
      if (includeSchema) {
        const schemaSql = this.db
          .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`)
          .get(table) as { sql: string } | undefined;

        if (schemaSql?.sql) {
          sql += `-- Table: ${table}\n`;
          sql += `DROP TABLE IF EXISTS ${table};\n`;
          sql += `${schemaSql.sql};\n\n`;
        }
      }

      // Get table data (quote table name for special characters)
      const rows = this.db.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, any>>;

      if (rows.length > 0) {
        sql += `-- Data for table: ${table}\n`;

        for (const row of rows) {
          const columns = Object.keys(row);
          const values = columns.map(col => {
            const val = row[col];
            if (val === null) return 'NULL';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            return String(val);
          });

          sql += `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
        }

        sql += '\n';
      }
    }

    sql += 'COMMIT;\n';
    sql += 'PRAGMA foreign_keys=ON;\n';

    return sql;
  }

  private generateJSONBackup(tables: string[]): string {
    const backup: any = {
      meta: {
        created: new Date().toISOString(),
        format: 'json',
        tables: tables
      },
      data: {}
    };

    for (const table of tables) {
      backup.data[table] = this.db.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, any>>;
    }

    return JSON.stringify(backup, null, 2);
  }

  private async writeBackup(content: string, outputPath: string, compress: boolean): Promise<void> {
    if (compress) {
      // Write compressed
      const input = Buffer.from(content, 'utf-8');
      const output = createWriteStream(outputPath);
      const gzip = createGzip();

      await pipeline(
        async function* () {
          yield input;
        },
        gzip,
        output
      );
    } else {
      // Write uncompressed
      fs.writeFileSync(outputPath, content, 'utf-8');
    }
  }

  private async readBackup(backupPath: string, compressed: boolean): Promise<string> {
    if (compressed) {
      // Read compressed
      const chunks: Buffer[] = [];
      const input = createReadStream(backupPath);
      const gunzip = createGunzip();

      for await (const chunk of input.pipe(gunzip)) {
        chunks.push(chunk as Buffer);
      }

      return Buffer.concat(chunks).toString('utf-8');
    } else {
      // Read uncompressed
      return fs.readFileSync(backupPath, 'utf-8');
    }
  }

  private restoreFromSQL(sql: string): void {
    // Execute SQL statements
    this.db.exec(sql);
  }

  private restoreFromJSON(json: string): void {
    const backup = JSON.parse(json);

    // Disable foreign keys during restore
    this.db.exec('PRAGMA foreign_keys=OFF');
    this.db.exec('BEGIN TRANSACTION');

    try {
      for (const [table, rows] of Object.entries(backup.data)) {
        if (!Array.isArray(rows) || rows.length === 0) continue;

        const firstRow = rows[0] as any;
        const columns = Object.keys(firstRow);

        const placeholders = columns.map(() => '?').join(', ');
        const quotedColumns = columns.map(c => `"${c}"`).join(', ');
        const stmt = this.db.prepare(
          `INSERT INTO "${table}" (${quotedColumns}) VALUES (${placeholders})`
        );

        for (const row of rows as any[]) {
          const values = columns.map(col => row[col]);
          stmt.run(...values);
        }
      }

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.db.exec('PRAGMA foreign_keys=ON');
    }
  }

  private calculateChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private getSchemaVersion(): number {
    try {
      const result = this.db
        .prepare('SELECT MAX(version) as version FROM schema_version')
        .get() as { version: number | null };

      return result.version || 0;
    } catch {
      return 0;
    }
  }

  private getRowCount(tables: string[]): number {
    let total = 0;

    for (const table of tables) {
      const result = this.db
        .prepare(`SELECT COUNT(*) as count FROM "${table}"`)
        .get() as { count: number };

      total += result.count;
    }

    return total;
  }
}

/**
 * Create backup manager instance
 */
export function createBackupManager(db: Database.Database): BackupManager {
  return new BackupManager(db);
}
