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

export {
  QueryManager,
  createQueryManager,
  AutofixRunQueries,
  AICallQueries,
  QualityMetricsQueries,
  GradeQueries,
  AlertQueries,
  type AutofixRun,
  type AICall,
  type CodeChange,
  type QualityMetrics,
  type Grade,
  type Alert
} from './queries.js';

export {
  AnalyticsQueries,
  createAnalyticsQueries,
  type SuccessRateMetrics,
  type CostMetrics,
  type GradeDistribution,
  type PerformanceMetrics,
  type QualityTrends,
  type TopIssues,
  type RepoLeaderboard
} from './analytics.js';

export {
  BackupManager,
  createBackupManager,
  type BackupOptions,
  type BackupMetadata,
  type RestoreOptions,
  type RestoreResult,
  type VerificationResult
} from './backup.js';
