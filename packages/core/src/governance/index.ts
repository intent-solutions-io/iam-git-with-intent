/**
 * Governance & Compliance Module
 *
 * Epic E: RBAC & Governance
 *
 * @module @gwi/core/governance
 */

export {
  // Audit Query Service
  AuditQueryService,
  createAuditQueryService,
  type AuditQueryFilters,
  type AuditQueryResult,
  type AuditStatistics,
  type AnomalyType,
  type AnomalySeverity,
  type Anomaly,
  type AnomalyDetectionResult,
} from './audit-query.js';

export {
  // Compliance Service
  ComplianceService,
  createComplianceService,
  type ReportPeriod,
  type ExportFormat,
  type BaseReport,
  type AccessReport,
  type RBACComplianceReport,
  type QuotaComplianceReport,
  type SecretAccessReport,
  type HighRiskActionsReport,
} from './compliance.js';
