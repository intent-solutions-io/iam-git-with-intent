/**
 * @gwi/core/database - Database utilities and migration system
 *
 * Provides SQLite connection management and migration tools.
 */

export {
  DatabaseConnection,
  createConnection,
  createInMemoryConnection,
  type DatabaseConfig
} from './connection.js';

export {
  MigrationManager,
  runMigrations,
  type Migration,
  type MigrationResult
} from './migrations.js';
