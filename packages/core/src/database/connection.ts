/**
 * Database Connection Manager
 *
 * Handles SQLite database connections with proper configuration.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export interface DatabaseConfig {
  path: string;
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: boolean;
}

export class DatabaseConnection {
  private db: Database.Database | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = {
      readonly: false,
      fileMustExist: false,
      timeout: 5000,
      verbose: false,
      ...config
    };
  }

  /**
   * Get or create database connection
   */
  getConnection(): Database.Database {
    if (this.db) {
      return this.db;
    }

    // Ensure directory exists
    const dir = path.dirname(this.config.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create connection
    this.db = new Database(this.config.path, {
      readonly: this.config.readonly,
      fileMustExist: this.config.fileMustExist,
      timeout: this.config.timeout,
      verbose: this.config.verbose ? console.log : undefined
    });

    // Configure database
    this.configurePragmas();

    return this.db;
  }

  /**
   * Configure SQLite pragmas for optimal performance
   */
  private configurePragmas(): void {
    if (!this.db) return;

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Enable foreign key constraints
    this.db.pragma('foreign_keys = ON');

    // Optimize for performance
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');
    this.db.pragma('temp_store = MEMORY');
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Check if connection is open
   */
  isOpen(): boolean {
    return this.db !== null && this.db.open;
  }

  /**
   * Get database info
   */
  getInfo(): {
    path: string;
    isOpen: boolean;
    size: number;
    pageCount: number;
    pageSize: number;
  } {
    const db = this.getConnection();

    const pageCount = db.pragma('page_count', { simple: true }) as number;
    const pageSize = db.pragma('page_size', { simple: true }) as number;
    const size = fs.existsSync(this.config.path)
      ? fs.statSync(this.config.path).size
      : 0;

    return {
      path: this.config.path,
      isOpen: this.isOpen(),
      size,
      pageCount,
      pageSize
    };
  }

  /**
   * Vacuum database (optimize and reclaim space)
   */
  vacuum(): void {
    const db = this.getConnection();
    db.exec('VACUUM;');
  }

  /**
   * Optimize database (rebuild indexes and analyze)
   */
  optimize(): void {
    const db = this.getConnection();
    db.exec('PRAGMA optimize;');
    db.exec('ANALYZE;');
  }

  /**
   * Get database statistics
   */
  getStats(): {
    tables: number;
    indexes: number;
    views: number;
    triggers: number;
  } {
    const db = this.getConnection();

    const tables = db
      .prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'`)
      .get() as { count: number };

    const indexes = db
      .prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='index'`)
      .get() as { count: number };

    const views = db
      .prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='view'`)
      .get() as { count: number };

    const triggers = db
      .prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='trigger'`)
      .get() as { count: number };

    return {
      tables: tables.count,
      indexes: indexes.count,
      views: views.count,
      triggers: triggers.count
    };
  }
}

/**
 * Create a new database connection
 */
export function createConnection(config: DatabaseConfig): DatabaseConnection {
  return new DatabaseConnection(config);
}

/**
 * Create an in-memory database (for testing)
 */
export function createInMemoryConnection(): DatabaseConnection {
  return new DatabaseConnection({ path: ':memory:' });
}
