/**
 * Evidence Packet Schema
 *
 * Phase 37: Standardized evidence packet for PR reviews.
 *
 * Contains:
 * - Test results and coverage delta
 * - Risk score and factors
 * - Security scan results
 * - Dependency changes
 * - Code quality metrics
 *
 * @module @gwi/core/evidence
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Test execution results
 */
export interface TestResults {
  /** Total number of tests */
  total: number;
  /** Number of passed tests */
  passed: number;
  /** Number of failed tests */
  failed: number;
  /** Number of skipped tests */
  skipped: number;
  /** Test duration in milliseconds */
  durationMs: number;
  /** Coverage percentage (0-100) */
  coveragePercent?: number;
  /** Coverage delta from base branch */
  coverageDelta?: number;
  /** Failed test names */
  failedTests?: string[];
}

/**
 * Individual risk factor for evidence assessment
 */
export interface EvidenceRiskFactor {
  /** Factor identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Factor weight (0-1) */
  weight: number;
  /** Factor value */
  value: number;
  /** Weighted score contribution */
  score: number;
  /** Explanation of the factor */
  explanation?: string;
}

/**
 * Risk assessment result
 */
export interface RiskAssessment {
  /** Overall risk score (0-100) */
  score: number;
  /** Risk level classification */
  level: 'low' | 'medium' | 'high' | 'critical';
  /** Individual risk factors */
  factors: EvidenceRiskFactor[];
  /** Recommended action */
  recommendation: 'auto_approve' | 'request_review' | 'block';
  /** Threshold used for classification */
  thresholds: {
    low: number;
    medium: number;
    high: number;
  };
}

/**
 * Security scan finding
 */
export interface SecurityFinding {
  /** Severity level */
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  /** Finding type/category */
  type: string;
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description: string;
  /** Affected file path */
  file?: string;
  /** Line number */
  line?: number;
  /** CWE identifier if applicable */
  cwe?: string;
  /** CVSS score if applicable */
  cvss?: number;
}

/**
 * Security scan results
 */
export interface SecurityScanResults {
  /** Whether scan completed successfully */
  completed: boolean;
  /** Scan duration in milliseconds */
  durationMs: number;
  /** Total findings count */
  totalFindings: number;
  /** Findings by severity */
  findingsBySeverity: Record<SecurityFinding['severity'], number>;
  /** Top findings (limited to avoid large payloads) */
  topFindings: SecurityFinding[];
  /** Tools used for scanning */
  tools: string[];
}

/**
 * Dependency change
 */
export interface DependencyChange {
  /** Dependency name */
  name: string;
  /** Change type */
  type: 'added' | 'removed' | 'updated';
  /** Previous version (for updates/removals) */
  previousVersion?: string;
  /** New version (for additions/updates) */
  newVersion?: string;
  /** Whether it's a dev dependency */
  isDev: boolean;
  /** Known vulnerabilities in new version */
  vulnerabilities?: number;
}

/**
 * Dependency analysis
 */
export interface DependencyAnalysis {
  /** Total dependency count */
  totalDependencies: number;
  /** Production dependencies */
  prodDependencies: number;
  /** Dev dependencies */
  devDependencies: number;
  /** Dependency changes in this PR */
  changes: DependencyChange[];
  /** New vulnerabilities introduced */
  newVulnerabilities: number;
}

/**
 * Code quality metrics
 */
export interface CodeQualityMetrics {
  /** Lines of code added */
  linesAdded: number;
  /** Lines of code removed */
  linesRemoved: number;
  /** Net lines changed */
  netLinesChanged: number;
  /** Files modified */
  filesModified: number;
  /** Files added */
  filesAdded: number;
  /** Files deleted */
  filesDeleted: number;
  /** Cyclomatic complexity delta (if available) */
  complexityDelta?: number;
  /** Linting issues introduced */
  lintIssues?: number;
  /** Type errors (if applicable) */
  typeErrors?: number;
}

/**
 * File change summary
 */
export interface FileChangeSummary {
  /** File path */
  path: string;
  /** Change type */
  type: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Lines added */
  linesAdded: number;
  /** Lines removed */
  linesRemoved: number;
  /** File category */
  category: 'source' | 'test' | 'config' | 'docs' | 'other';
}

/**
 * Author information
 */
export interface AuthorInfo {
  /** Author username */
  username: string;
  /** Number of previous commits to this repo */
  commitHistory: number;
  /** Is a maintainer/owner */
  isMaintainer: boolean;
  /** Days since first commit */
  tenureDays: number;
}

/**
 * Complete evidence packet for a PR
 */
export interface EvidencePacket {
  /** Schema version */
  version: '1.0';
  /** Packet creation timestamp */
  createdAt: Date;
  /** Run ID that generated this packet */
  runId: string;
  /** Tenant ID */
  tenantId: string;

  /** PR/Issue context */
  context: {
    /** Issue number */
    issueNumber: number;
    /** Issue URL */
    issueUrl: string;
    /** PR number (if created) */
    prNumber?: number;
    /** PR URL (if created) */
    prUrl?: string;
    /** Repository full name */
    repo: string;
    /** Base branch */
    baseBranch: string;
    /** Target branch */
    targetBranch: string;
  };

  /** Test results */
  tests: TestResults;

  /** Risk assessment */
  risk: RiskAssessment;

  /** Security scan results */
  security: SecurityScanResults;

  /** Dependency analysis */
  dependencies: DependencyAnalysis;

  /** Code quality metrics */
  quality: CodeQualityMetrics;

  /** File change summary */
  files: FileChangeSummary[];

  /** Author information */
  author: AuthorInfo;

  /** Additional metadata */
  metadata: Record<string, unknown>;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create default test results (empty/skipped)
 */
export function createDefaultTestResults(): TestResults {
  return {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
  };
}

/**
 * Create default risk assessment (low risk)
 */
export function createDefaultRiskAssessment(): RiskAssessment {
  return {
    score: 0,
    level: 'low',
    factors: [],
    recommendation: 'auto_approve',
    thresholds: {
      low: 25,
      medium: 50,
      high: 75,
    },
  };
}

/**
 * Create default security scan results (no findings)
 */
export function createDefaultSecurityScanResults(): SecurityScanResults {
  return {
    completed: true,
    durationMs: 0,
    totalFindings: 0,
    findingsBySeverity: {
      info: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
    topFindings: [],
    tools: [],
  };
}

/**
 * Create default dependency analysis
 */
export function createDefaultDependencyAnalysis(): DependencyAnalysis {
  return {
    totalDependencies: 0,
    prodDependencies: 0,
    devDependencies: 0,
    changes: [],
    newVulnerabilities: 0,
  };
}

/**
 * Create default code quality metrics
 */
export function createDefaultCodeQualityMetrics(): CodeQualityMetrics {
  return {
    linesAdded: 0,
    linesRemoved: 0,
    netLinesChanged: 0,
    filesModified: 0,
    filesAdded: 0,
    filesDeleted: 0,
  };
}

/**
 * Create an empty evidence packet
 */
export function createEvidencePacket(
  runId: string,
  tenantId: string,
  context: EvidencePacket['context']
): EvidencePacket {
  return {
    version: '1.0',
    createdAt: new Date(),
    runId,
    tenantId,
    context,
    tests: createDefaultTestResults(),
    risk: createDefaultRiskAssessment(),
    security: createDefaultSecurityScanResults(),
    dependencies: createDefaultDependencyAnalysis(),
    quality: createDefaultCodeQualityMetrics(),
    files: [],
    author: {
      username: 'unknown',
      commitHistory: 0,
      isMaintainer: false,
      tenureDays: 0,
    },
    metadata: {},
  };
}

// =============================================================================
// Risk Calculation
// =============================================================================

/**
 * Default risk factors with weights
 */
export const DEFAULT_RISK_FACTORS = {
  linesChanged: { weight: 0.15, name: 'Lines Changed' },
  filesChanged: { weight: 0.10, name: 'Files Changed' },
  testCoverage: { weight: 0.20, name: 'Test Coverage' },
  testsPassing: { weight: 0.15, name: 'Tests Passing' },
  securityFindings: { weight: 0.20, name: 'Security Findings' },
  dependencyChanges: { weight: 0.10, name: 'Dependency Changes' },
  authorTenure: { weight: 0.10, name: 'Author Experience' },
};

/**
 * Calculate risk score from evidence packet
 */
export function calculateRiskScore(
  packet: EvidencePacket,
  thresholds = { low: 25, medium: 50, high: 75 }
): RiskAssessment {
  const factors: EvidenceRiskFactor[] = [];

  // Lines changed factor (more lines = higher risk)
  const linesChangedRaw = Math.min(packet.quality.netLinesChanged / 500, 1);
  factors.push({
    id: 'lines_changed',
    name: DEFAULT_RISK_FACTORS.linesChanged.name,
    weight: DEFAULT_RISK_FACTORS.linesChanged.weight,
    value: packet.quality.netLinesChanged,
    score: linesChangedRaw * DEFAULT_RISK_FACTORS.linesChanged.weight * 100,
    explanation: `${packet.quality.netLinesChanged} net lines changed`,
  });

  // Files changed factor
  const filesChangedRaw = Math.min(
    (packet.quality.filesModified + packet.quality.filesAdded) / 20,
    1
  );
  factors.push({
    id: 'files_changed',
    name: DEFAULT_RISK_FACTORS.filesChanged.name,
    weight: DEFAULT_RISK_FACTORS.filesChanged.weight,
    value: packet.quality.filesModified + packet.quality.filesAdded,
    score: filesChangedRaw * DEFAULT_RISK_FACTORS.filesChanged.weight * 100,
    explanation: `${packet.quality.filesModified + packet.quality.filesAdded} files changed`,
  });

  // Test coverage factor (lower coverage = higher risk)
  const coverageRaw = packet.tests.coveragePercent !== undefined
    ? 1 - (packet.tests.coveragePercent / 100)
    : 0.5;
  factors.push({
    id: 'test_coverage',
    name: DEFAULT_RISK_FACTORS.testCoverage.name,
    weight: DEFAULT_RISK_FACTORS.testCoverage.weight,
    value: packet.tests.coveragePercent ?? 50,
    score: coverageRaw * DEFAULT_RISK_FACTORS.testCoverage.weight * 100,
    explanation: packet.tests.coveragePercent !== undefined
      ? `${packet.tests.coveragePercent}% coverage`
      : 'Coverage unknown',
  });

  // Tests passing factor
  const testsPassingRaw = packet.tests.total > 0
    ? 1 - (packet.tests.passed / packet.tests.total)
    : 0;
  factors.push({
    id: 'tests_passing',
    name: DEFAULT_RISK_FACTORS.testsPassing.name,
    weight: DEFAULT_RISK_FACTORS.testsPassing.weight,
    value: packet.tests.total > 0 ? (packet.tests.passed / packet.tests.total) * 100 : 100,
    score: testsPassingRaw * DEFAULT_RISK_FACTORS.testsPassing.weight * 100,
    explanation: `${packet.tests.passed}/${packet.tests.total} tests passing`,
  });

  // Security findings factor
  const securityScore =
    packet.security.findingsBySeverity.critical * 25 +
    packet.security.findingsBySeverity.high * 15 +
    packet.security.findingsBySeverity.medium * 5 +
    packet.security.findingsBySeverity.low * 1;
  const securityRaw = Math.min(securityScore / 50, 1);
  factors.push({
    id: 'security_findings',
    name: DEFAULT_RISK_FACTORS.securityFindings.name,
    weight: DEFAULT_RISK_FACTORS.securityFindings.weight,
    value: packet.security.totalFindings,
    score: securityRaw * DEFAULT_RISK_FACTORS.securityFindings.weight * 100,
    explanation: `${packet.security.totalFindings} security findings`,
  });

  // Dependency changes factor
  const depChangesRaw = Math.min(packet.dependencies.changes.length / 10, 1);
  factors.push({
    id: 'dependency_changes',
    name: DEFAULT_RISK_FACTORS.dependencyChanges.name,
    weight: DEFAULT_RISK_FACTORS.dependencyChanges.weight,
    value: packet.dependencies.changes.length,
    score: depChangesRaw * DEFAULT_RISK_FACTORS.dependencyChanges.weight * 100,
    explanation: `${packet.dependencies.changes.length} dependency changes`,
  });

  // Author tenure factor (lower tenure = higher risk)
  const tenureRaw = Math.max(0, 1 - (packet.author.tenureDays / 365));
  factors.push({
    id: 'author_tenure',
    name: DEFAULT_RISK_FACTORS.authorTenure.name,
    weight: DEFAULT_RISK_FACTORS.authorTenure.weight,
    value: packet.author.tenureDays,
    score: packet.author.isMaintainer ? 0 : tenureRaw * DEFAULT_RISK_FACTORS.authorTenure.weight * 100,
    explanation: packet.author.isMaintainer
      ? 'Maintainer'
      : `${packet.author.tenureDays} days tenure`,
  });

  // Calculate total score
  const totalScore = Math.round(factors.reduce((sum, f) => sum + f.score, 0));

  // Determine level
  let level: RiskAssessment['level'];
  if (totalScore >= thresholds.high) {
    level = 'critical';
  } else if (totalScore >= thresholds.medium) {
    level = 'high';
  } else if (totalScore >= thresholds.low) {
    level = 'medium';
  } else {
    level = 'low';
  }

  // Determine recommendation
  let recommendation: RiskAssessment['recommendation'];
  if (level === 'critical' || packet.security.findingsBySeverity.critical > 0) {
    recommendation = 'block';
  } else if (level === 'high' || level === 'medium') {
    recommendation = 'request_review';
  } else {
    recommendation = 'auto_approve';
  }

  return {
    score: totalScore,
    level,
    factors,
    recommendation,
    thresholds,
  };
}

// =============================================================================
// Exports - Using prefixed names to avoid conflicts with storage module
// =============================================================================

// Types are already exported above with their proper names
// EvidenceRiskFactor is the canonical name (avoids conflict with storage.RiskFactor)
