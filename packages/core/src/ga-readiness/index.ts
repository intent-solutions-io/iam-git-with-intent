/**
 * Phase 70: GA Readiness Gate
 *
 * Comprehensive readiness verification for production launch:
 * - Feature completeness checks
 * - Performance benchmarks
 * - Security audits
 * - Documentation verification
 * - Compliance validation
 * - Operational readiness
 */

import { z } from 'zod';

// =============================================================================
// VERSION
// =============================================================================

export const GA_READINESS_VERSION = '1.0.0';

// =============================================================================
// TYPES & SCHEMAS
// =============================================================================

export const GaReadinessCheckCategory = z.enum([
  'feature',
  'performance',
  'security',
  'documentation',
  'compliance',
  'operational',
  'integration',
  'testing',
]);
export type GaReadinessCheckCategory = z.infer<typeof GaReadinessCheckCategory>;

export const GaReadinessStatus = z.enum([
  'not_started',
  'in_progress',
  'passed',
  'failed',
  'blocked',
  'waived',
]);
export type GaReadinessStatus = z.infer<typeof GaReadinessStatus>;

export const ReadinessSeverity = z.enum(['critical', 'high', 'medium', 'low']);
export type ReadinessSeverity = z.infer<typeof ReadinessSeverity>;

export const GaReadinessCheckSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: GaReadinessCheckCategory,
  severity: ReadinessSeverity,
  status: GaReadinessStatus,
  automated: z.boolean(),
  checkFn: z.string().optional(), // Function name for automated checks
  lastRunAt: z.date().optional(),
  lastResult: z
    .object({
      passed: z.boolean(),
      message: z.string(),
      details: z.record(z.unknown()).optional(),
      duration: z.number().optional(),
    })
    .optional(),
  owner: z.string().optional(),
  dueDate: z.date().optional(),
  blockedBy: z.array(z.string()).optional(),
  waivedBy: z.string().optional(),
  waivedReason: z.string().optional(),
  waivedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type GaReadinessCheck = z.infer<typeof GaReadinessCheckSchema>;

export const ReadinessMilestoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  targetDate: z.date(),
  checkIds: z.array(z.string()),
  status: GaReadinessStatus,
  completedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ReadinessMilestone = z.infer<typeof ReadinessMilestoneSchema>;

export const ReadinessGateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  targetLaunchDate: z.date().optional(),
  milestones: z.array(z.string()),
  requiredCategories: z.array(GaReadinessCheckCategory),
  blockingChecks: z.array(z.string()), // Check IDs that must pass
  status: GaReadinessStatus,
  overallScore: z.number().min(0).max(100),
  categoryScores: z.record(GaReadinessCheckCategory, z.number()),
  launchApprovalRequired: z.boolean(),
  launchApprovedBy: z.string().optional(),
  launchApprovedAt: z.date().optional(),
  launchNotes: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ReadinessGate = z.infer<typeof ReadinessGateSchema>;

export const GaReadinessReportSchema = z.object({
  id: z.string(),
  gateId: z.string(),
  generatedAt: z.date(),
  summary: z.object({
    totalChecks: z.number(),
    passedChecks: z.number(),
    failedChecks: z.number(),
    blockedChecks: z.number(),
    waivedChecks: z.number(),
    pendingChecks: z.number(),
    overallScore: z.number(),
    readyForLaunch: z.boolean(),
  }),
  categoryBreakdown: z.array(
    z.object({
      category: GaReadinessCheckCategory,
      total: z.number(),
      passed: z.number(),
      failed: z.number(),
      score: z.number(),
    })
  ),
  blockingIssues: z.array(
    z.object({
      checkId: z.string(),
      checkName: z.string(),
      severity: ReadinessSeverity,
      message: z.string(),
    })
  ),
  recommendations: z.array(z.string()),
  riskAssessment: z.object({
    level: z.enum(['low', 'medium', 'high', 'critical']),
    factors: z.array(z.string()),
  }),
});
export type GaReadinessReport = z.infer<typeof GaReadinessReportSchema>;

// =============================================================================
// ERROR CODES
// =============================================================================

export const GaReadinessErrorCodes = {
  CHECK_NOT_FOUND: 'GA_CHECK_NOT_FOUND',
  MILESTONE_NOT_FOUND: 'GA_MILESTONE_NOT_FOUND',
  GATE_NOT_FOUND: 'GA_GATE_NOT_FOUND',
  CHECK_ALREADY_EXISTS: 'GA_CHECK_ALREADY_EXISTS',
  CHECK_BLOCKED: 'GA_CHECK_BLOCKED',
  AUTOMATED_CHECK_FAILED: 'GA_AUTOMATED_CHECK_FAILED',
  LAUNCH_NOT_APPROVED: 'GA_LAUNCH_NOT_APPROVED',
  BLOCKING_CHECKS_FAILED: 'GA_BLOCKING_CHECKS_FAILED',
  INVALID_WAIVER: 'GA_INVALID_WAIVER',
} as const;

// =============================================================================
// DEFAULT CHECKS
// =============================================================================

export const DEFAULT_GA_CHECKS: Array<{
  id: string;
  name: string;
  description: string;
  category: GaReadinessCheckCategory;
  severity: ReadinessSeverity;
  automated: boolean;
}> = [
  // Feature Checks
  {
    id: 'feat-core-complete',
    name: 'Core Features Complete',
    description: 'All core features implemented and functional',
    category: 'feature',
    severity: 'critical',
    automated: false,
  },
  {
    id: 'feat-api-stable',
    name: 'API Stability',
    description: 'Public APIs are stable and documented',
    category: 'feature',
    severity: 'critical',
    automated: false,
  },
  {
    id: 'feat-backward-compat',
    name: 'Backward Compatibility',
    description: 'Breaking changes documented and migration path provided',
    category: 'feature',
    severity: 'high',
    automated: false,
  },

  // Performance Checks
  {
    id: 'perf-load-test',
    name: 'Load Testing Complete',
    description: 'System handles expected load with acceptable latency',
    category: 'performance',
    severity: 'critical',
    automated: true,
  },
  {
    id: 'perf-stress-test',
    name: 'Stress Testing Complete',
    description: 'System gracefully handles overload conditions',
    category: 'performance',
    severity: 'high',
    automated: true,
  },
  {
    id: 'perf-benchmarks',
    name: 'Performance Benchmarks Met',
    description: 'All performance SLOs achieved',
    category: 'performance',
    severity: 'critical',
    automated: true,
  },

  // Security Checks
  {
    id: 'sec-audit-complete',
    name: 'Security Audit Complete',
    description: 'Third-party security audit passed',
    category: 'security',
    severity: 'critical',
    automated: false,
  },
  {
    id: 'sec-pen-test',
    name: 'Penetration Testing',
    description: 'Penetration testing completed with no critical findings',
    category: 'security',
    severity: 'critical',
    automated: false,
  },
  {
    id: 'sec-vuln-scan',
    name: 'Vulnerability Scanning',
    description: 'All dependencies scanned, no critical vulnerabilities',
    category: 'security',
    severity: 'critical',
    automated: true,
  },
  {
    id: 'sec-secrets-rotated',
    name: 'Secrets Rotation',
    description: 'All production secrets rotated and secured',
    category: 'security',
    severity: 'high',
    automated: false,
  },

  // Documentation Checks
  {
    id: 'docs-api-complete',
    name: 'API Documentation',
    description: 'Complete API documentation with examples',
    category: 'documentation',
    severity: 'high',
    automated: false,
  },
  {
    id: 'docs-user-guide',
    name: 'User Guide',
    description: 'End-user documentation complete',
    category: 'documentation',
    severity: 'medium',
    automated: false,
  },
  {
    id: 'docs-runbook',
    name: 'Operations Runbook',
    description: 'Operations runbook for common scenarios',
    category: 'documentation',
    severity: 'high',
    automated: false,
  },

  // Compliance Checks
  {
    id: 'comp-gdpr',
    name: 'GDPR Compliance',
    description: 'GDPR requirements implemented and verified',
    category: 'compliance',
    severity: 'critical',
    automated: false,
  },
  {
    id: 'comp-data-retention',
    name: 'Data Retention Policy',
    description: 'Data retention policies implemented',
    category: 'compliance',
    severity: 'high',
    automated: false,
  },
  {
    id: 'comp-audit-trail',
    name: 'Audit Trail',
    description: 'Complete audit trail for compliance',
    category: 'compliance',
    severity: 'critical',
    automated: true,
  },

  // Operational Checks
  {
    id: 'ops-monitoring',
    name: 'Monitoring Setup',
    description: 'Production monitoring and alerting configured',
    category: 'operational',
    severity: 'critical',
    automated: true,
  },
  {
    id: 'ops-backup',
    name: 'Backup & Recovery',
    description: 'Backup procedures tested and documented',
    category: 'operational',
    severity: 'critical',
    automated: false,
  },
  {
    id: 'ops-incident',
    name: 'Incident Response',
    description: 'Incident response procedures documented',
    category: 'operational',
    severity: 'high',
    automated: false,
  },
  {
    id: 'ops-rollback',
    name: 'Rollback Procedure',
    description: 'Rollback procedure tested and documented',
    category: 'operational',
    severity: 'critical',
    automated: false,
  },

  // Integration Checks
  {
    id: 'int-e2e-tests',
    name: 'E2E Integration Tests',
    description: 'End-to-end integration tests passing',
    category: 'integration',
    severity: 'critical',
    automated: true,
  },
  {
    id: 'int-third-party',
    name: 'Third-Party Integrations',
    description: 'All third-party integrations tested',
    category: 'integration',
    severity: 'high',
    automated: false,
  },

  // Testing Checks
  {
    id: 'test-coverage',
    name: 'Test Coverage',
    description: 'Minimum test coverage requirements met',
    category: 'testing',
    severity: 'high',
    automated: true,
  },
  {
    id: 'test-regression',
    name: 'Regression Testing',
    description: 'Full regression test suite passing',
    category: 'testing',
    severity: 'critical',
    automated: true,
  },
  {
    id: 'test-uat',
    name: 'User Acceptance Testing',
    description: 'UAT completed and signed off',
    category: 'testing',
    severity: 'high',
    automated: false,
  },
];

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface GaReadinessConfig {
  autoRunInterval?: number; // Interval for auto-running checks (ms)
  requiredPassRate?: number; // Minimum pass rate for launch (0-100)
  blockOnCriticalFailure?: boolean;
  allowWaivers?: boolean;
  maxWaiversPerCategory?: number;
  notifyOnStatusChange?: boolean;
}

const DEFAULT_CONFIG: Required<GaReadinessConfig> = {
  autoRunInterval: 3600000, // 1 hour
  requiredPassRate: 90,
  blockOnCriticalFailure: true,
  allowWaivers: true,
  maxWaiversPerCategory: 2,
  notifyOnStatusChange: true,
};

// =============================================================================
// GA READINESS SERVICE
// =============================================================================

export class GaReadinessService {
  private checks: Map<string, GaReadinessCheck> = new Map();
  private milestones: Map<string, ReadinessMilestone> = new Map();
  private gates: Map<string, ReadinessGate> = new Map();
  private config: Required<GaReadinessConfig>;
  private automatedCheckHandlers: Map<
    string,
    () => Promise<{ passed: boolean; message: string; details?: Record<string, unknown> }>
  > = new Map();

  constructor(config: GaReadinessConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Check Management
  // ---------------------------------------------------------------------------

  createCheck(
    data: Omit<GaReadinessCheck, 'id' | 'status' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    }
  ): GaReadinessCheck {
    const id = data.id || `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (this.checks.has(id)) {
      throw new Error(`${GaReadinessErrorCodes.CHECK_ALREADY_EXISTS}: ${id}`);
    }

    const now = new Date();
    const check: GaReadinessCheck = {
      ...data,
      id,
      status: 'not_started',
      createdAt: now,
      updatedAt: now,
    };

    this.checks.set(id, check);
    return check;
  }

  getCheck(id: string): GaReadinessCheck | undefined {
    return this.checks.get(id);
  }

  updateCheckStatus(
    id: string,
    status: GaReadinessStatus,
    result?: { passed: boolean; message: string; details?: Record<string, unknown>; duration?: number }
  ): GaReadinessCheck {
    const check = this.checks.get(id);
    if (!check) {
      throw new Error(`${GaReadinessErrorCodes.CHECK_NOT_FOUND}: ${id}`);
    }

    // Check if blocked
    if (check.blockedBy && check.blockedBy.length > 0) {
      const blockers = check.blockedBy.filter((blockerId) => {
        const blocker = this.checks.get(blockerId);
        return blocker && blocker.status !== 'passed' && blocker.status !== 'waived';
      });

      if (blockers.length > 0 && status === 'passed') {
        throw new Error(`${GaReadinessErrorCodes.CHECK_BLOCKED}: blocked by ${blockers.join(', ')}`);
      }
    }

    const updated: GaReadinessCheck = {
      ...check,
      status,
      lastRunAt: result ? new Date() : check.lastRunAt,
      lastResult: result || check.lastResult,
      updatedAt: new Date(),
    };

    this.checks.set(id, updated);
    this.updateRelatedMilestones(id);
    this.updateRelatedGates(id);

    return updated;
  }

  waiveCheck(id: string, waivedBy: string, reason: string): GaReadinessCheck {
    if (!this.config.allowWaivers) {
      throw new Error(`${GaReadinessErrorCodes.INVALID_WAIVER}: Waivers not allowed`);
    }

    const check = this.checks.get(id);
    if (!check) {
      throw new Error(`${GaReadinessErrorCodes.CHECK_NOT_FOUND}: ${id}`);
    }

    // Check waiver limit per category
    const categoryWaivers = Array.from(this.checks.values()).filter(
      (c) => c.category === check.category && c.status === 'waived'
    ).length;

    if (categoryWaivers >= this.config.maxWaiversPerCategory) {
      throw new Error(
        `${GaReadinessErrorCodes.INVALID_WAIVER}: Max waivers reached for category ${check.category}`
      );
    }

    const updated: GaReadinessCheck = {
      ...check,
      status: 'waived',
      waivedBy,
      waivedReason: reason,
      waivedAt: new Date(),
      updatedAt: new Date(),
    };

    this.checks.set(id, updated);
    this.updateRelatedMilestones(id);
    this.updateRelatedGates(id);

    return updated;
  }

  listChecks(filter?: {
    category?: GaReadinessCheckCategory;
    status?: GaReadinessStatus;
    severity?: ReadinessSeverity;
  }): GaReadinessCheck[] {
    let checks = Array.from(this.checks.values());

    if (filter?.category) {
      checks = checks.filter((c) => c.category === filter.category);
    }
    if (filter?.status) {
      checks = checks.filter((c) => c.status === filter.status);
    }
    if (filter?.severity) {
      checks = checks.filter((c) => c.severity === filter.severity);
    }

    return checks;
  }

  // ---------------------------------------------------------------------------
  // Automated Check Execution
  // ---------------------------------------------------------------------------

  registerAutomatedCheck(
    checkId: string,
    handler: () => Promise<{ passed: boolean; message: string; details?: Record<string, unknown> }>
  ): void {
    this.automatedCheckHandlers.set(checkId, handler);
  }

  async runAutomatedCheck(id: string): Promise<GaReadinessCheck> {
    const check = this.checks.get(id);
    if (!check) {
      throw new Error(`${GaReadinessErrorCodes.CHECK_NOT_FOUND}: ${id}`);
    }

    if (!check.automated) {
      throw new Error(`${GaReadinessErrorCodes.AUTOMATED_CHECK_FAILED}: Check ${id} is not automated`);
    }

    const handler = this.automatedCheckHandlers.get(id);
    if (!handler) {
      throw new Error(
        `${GaReadinessErrorCodes.AUTOMATED_CHECK_FAILED}: No handler registered for ${id}`
      );
    }

    this.updateCheckStatus(id, 'in_progress');

    const startTime = Date.now();
    const result = await handler();
    const duration = Date.now() - startTime;

    return this.updateCheckStatus(id, result.passed ? 'passed' : 'failed', {
      ...result,
      duration,
    });
  }

  async runAllAutomatedChecks(): Promise<Map<string, GaReadinessCheck>> {
    const results = new Map<string, GaReadinessCheck>();
    const automatedChecks = Array.from(this.checks.values()).filter((c) => c.automated);

    for (const check of automatedChecks) {
      try {
        const result = await this.runAutomatedCheck(check.id);
        results.set(check.id, result);
      } catch (error) {
        // Mark as failed if handler throws
        const failedCheck = this.updateCheckStatus(check.id, 'failed', {
          passed: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        results.set(check.id, failedCheck);
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Milestone Management
  // ---------------------------------------------------------------------------

  createMilestone(
    data: Omit<ReadinessMilestone, 'id' | 'status' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    }
  ): ReadinessMilestone {
    const id = data.id || `milestone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const now = new Date();
    const milestone: ReadinessMilestone = {
      ...data,
      id,
      status: 'not_started',
      createdAt: now,
      updatedAt: now,
    };

    this.milestones.set(id, milestone);
    return milestone;
  }

  getMilestone(id: string): ReadinessMilestone | undefined {
    return this.milestones.get(id);
  }

  getMilestoneStatus(id: string): {
    milestone: ReadinessMilestone;
    checks: GaReadinessCheck[];
    progress: number;
  } {
    const milestone = this.milestones.get(id);
    if (!milestone) {
      throw new Error(`${GaReadinessErrorCodes.MILESTONE_NOT_FOUND}: ${id}`);
    }

    const checks = milestone.checkIds
      .map((checkId) => this.checks.get(checkId))
      .filter((c): c is GaReadinessCheck => c !== undefined);

    const passedOrWaived = checks.filter(
      (c) => c.status === 'passed' || c.status === 'waived'
    ).length;
    const progress = checks.length > 0 ? (passedOrWaived / checks.length) * 100 : 0;

    return { milestone, checks, progress };
  }

  private updateRelatedMilestones(checkId: string): void {
    for (const [id, milestone] of this.milestones) {
      if (milestone.checkIds.includes(checkId)) {
        const { progress } = this.getMilestoneStatus(id);
        let status: GaReadinessStatus = 'in_progress';

        if (progress === 100) {
          status = 'passed';
        } else if (progress === 0) {
          status = 'not_started';
        }

        this.milestones.set(id, {
          ...milestone,
          status,
          completedAt: status === 'passed' ? new Date() : undefined,
          updatedAt: new Date(),
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Gate Management
  // ---------------------------------------------------------------------------

  createGate(
    data: Omit<
      ReadinessGate,
      'id' | 'status' | 'overallScore' | 'categoryScores' | 'createdAt' | 'updatedAt'
    > & { id?: string }
  ): ReadinessGate {
    const id = data.id || `gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const now = new Date();
    const gate: ReadinessGate = {
      ...data,
      id,
      status: 'not_started',
      overallScore: 0,
      categoryScores: {} as Record<GaReadinessCheckCategory, number>,
      createdAt: now,
      updatedAt: now,
    };

    // Calculate initial scores
    this.gates.set(id, gate);
    this.recalculateGateScores(id);

    return this.gates.get(id)!;
  }

  getGate(id: string): ReadinessGate | undefined {
    return this.gates.get(id);
  }

  private updateRelatedGates(_checkId: string): void {
    for (const [id] of this.gates) {
      this.recalculateGateScores(id);
    }
  }

  private recalculateGateScores(gateId: string): void {
    const gate = this.gates.get(gateId);
    if (!gate) return;

    const allChecks = Array.from(this.checks.values());
    const categoryScores: Record<string, number> = {};
    let totalPassed = 0;
    let totalChecks = 0;

    for (const category of gate.requiredCategories) {
      const categoryChecks = allChecks.filter((c) => c.category === category);
      const passed = categoryChecks.filter(
        (c) => c.status === 'passed' || c.status === 'waived'
      ).length;
      categoryScores[category] = categoryChecks.length > 0 ? (passed / categoryChecks.length) * 100 : 0;
      totalPassed += passed;
      totalChecks += categoryChecks.length;
    }

    const overallScore = totalChecks > 0 ? (totalPassed / totalChecks) * 100 : 0;

    // Determine status
    let status: GaReadinessStatus = 'in_progress';
    const blockingChecksFailed = gate.blockingChecks.some((checkId) => {
      const check = this.checks.get(checkId);
      return check && check.status === 'failed';
    });

    if (blockingChecksFailed && this.config.blockOnCriticalFailure) {
      status = 'blocked';
    } else if (overallScore >= this.config.requiredPassRate) {
      status = 'passed';
    } else if (overallScore === 0) {
      status = 'not_started';
    }

    this.gates.set(gateId, {
      ...gate,
      status,
      overallScore: Math.round(overallScore * 100) / 100,
      categoryScores: categoryScores as Record<GaReadinessCheckCategory, number>,
      updatedAt: new Date(),
    });
  }

  approveLaunch(
    gateId: string,
    approvedBy: string,
    notes?: string
  ): ReadinessGate {
    const gate = this.gates.get(gateId);
    if (!gate) {
      throw new Error(`${GaReadinessErrorCodes.GATE_NOT_FOUND}: ${gateId}`);
    }

    if (gate.status === 'blocked') {
      throw new Error(`${GaReadinessErrorCodes.BLOCKING_CHECKS_FAILED}: Gate is blocked`);
    }

    if (gate.overallScore < this.config.requiredPassRate) {
      throw new Error(
        `${GaReadinessErrorCodes.LAUNCH_NOT_APPROVED}: Score ${gate.overallScore}% below required ${this.config.requiredPassRate}%`
      );
    }

    const updated: ReadinessGate = {
      ...gate,
      launchApprovedBy: approvedBy,
      launchApprovedAt: new Date(),
      launchNotes: notes,
      updatedAt: new Date(),
    };

    this.gates.set(gateId, updated);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Report Generation
  // ---------------------------------------------------------------------------

  generateReport(gateId: string): GaReadinessReport {
    const gate = this.gates.get(gateId);
    if (!gate) {
      throw new Error(`${GaReadinessErrorCodes.GATE_NOT_FOUND}: ${gateId}`);
    }

    const allChecks = Array.from(this.checks.values());
    const passedChecks = allChecks.filter((c) => c.status === 'passed').length;
    const failedChecks = allChecks.filter((c) => c.status === 'failed').length;
    const blockedChecks = allChecks.filter((c) => c.status === 'blocked').length;
    const waivedChecks = allChecks.filter((c) => c.status === 'waived').length;
    const pendingChecks = allChecks.filter(
      (c) => c.status === 'not_started' || c.status === 'in_progress'
    ).length;

    // Category breakdown
    const categoryBreakdown = gate.requiredCategories.map((category) => {
      const categoryChecks = allChecks.filter((c) => c.category === category);
      const passed = categoryChecks.filter(
        (c) => c.status === 'passed' || c.status === 'waived'
      ).length;
      const failed = categoryChecks.filter((c) => c.status === 'failed').length;
      return {
        category,
        total: categoryChecks.length,
        passed,
        failed,
        score: categoryChecks.length > 0 ? (passed / categoryChecks.length) * 100 : 0,
      };
    });

    // Blocking issues
    const blockingIssues = allChecks
      .filter((c) => c.status === 'failed' && (c.severity === 'critical' || c.severity === 'high'))
      .map((c) => ({
        checkId: c.id,
        checkName: c.name,
        severity: c.severity,
        message: c.lastResult?.message || 'Check failed',
      }));

    // Recommendations
    const recommendations: string[] = [];
    if (failedChecks > 0) {
      recommendations.push(`Address ${failedChecks} failing check(s) before launch`);
    }
    if (waivedChecks > 2) {
      recommendations.push(`Review ${waivedChecks} waived checks for potential risks`);
    }
    if (pendingChecks > 0) {
      recommendations.push(`Complete ${pendingChecks} pending check(s)`);
    }

    const criticalFailed = allChecks.filter(
      (c) => c.status === 'failed' && c.severity === 'critical'
    ).length;

    // Risk assessment
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const riskFactors: string[] = [];

    if (criticalFailed > 0) {
      riskLevel = 'critical';
      riskFactors.push(`${criticalFailed} critical check(s) failed`);
    } else if (failedChecks > 5) {
      riskLevel = 'high';
      riskFactors.push(`High number of failing checks (${failedChecks})`);
    } else if (gate.overallScore < 80) {
      riskLevel = 'medium';
      riskFactors.push(`Overall readiness score below 80%`);
    }

    if (waivedChecks > 3) {
      riskFactors.push(`Multiple checks waived (${waivedChecks})`);
    }

    const readyForLaunch =
      gate.overallScore >= this.config.requiredPassRate &&
      criticalFailed === 0 &&
      gate.status !== 'blocked';

    return {
      id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      gateId,
      generatedAt: new Date(),
      summary: {
        totalChecks: allChecks.length,
        passedChecks,
        failedChecks,
        blockedChecks,
        waivedChecks,
        pendingChecks,
        overallScore: gate.overallScore,
        readyForLaunch,
      },
      categoryBreakdown,
      blockingIssues,
      recommendations,
      riskAssessment: {
        level: riskLevel,
        factors: riskFactors,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Initialize with Default Checks
  // ---------------------------------------------------------------------------

  initializeDefaultChecks(): void {
    for (const checkDef of DEFAULT_GA_CHECKS) {
      this.createCheck({
        ...checkDef,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  getStats(): {
    totalChecks: number;
    byStatus: Record<GaReadinessStatus, number>;
    byCategory: Record<GaReadinessCheckCategory, number>;
    bySeverity: Record<ReadinessSeverity, number>;
  } {
    const checks = Array.from(this.checks.values());

    const byStatus: Record<string, number> = {
      not_started: 0,
      in_progress: 0,
      passed: 0,
      failed: 0,
      blocked: 0,
      waived: 0,
    };

    const byCategory: Record<string, number> = {
      feature: 0,
      performance: 0,
      security: 0,
      documentation: 0,
      compliance: 0,
      operational: 0,
      integration: 0,
      testing: 0,
    };

    const bySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const check of checks) {
      byStatus[check.status]++;
      byCategory[check.category]++;
      bySeverity[check.severity]++;
    }

    return {
      totalChecks: checks.length,
      byStatus: byStatus as Record<GaReadinessStatus, number>,
      byCategory: byCategory as Record<GaReadinessCheckCategory, number>,
      bySeverity: bySeverity as Record<ReadinessSeverity, number>,
    };
  }
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export function validateGaReadinessCheck(data: unknown): GaReadinessCheck {
  return GaReadinessCheckSchema.parse(data);
}

export function validateReadinessMilestone(data: unknown): ReadinessMilestone {
  return ReadinessMilestoneSchema.parse(data);
}

export function validateReadinessGate(data: unknown): ReadinessGate {
  return ReadinessGateSchema.parse(data);
}

export function validateGaReadinessReport(data: unknown): GaReadinessReport {
  return GaReadinessReportSchema.parse(data);
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

export function createGaReadinessService(config?: GaReadinessConfig): GaReadinessService {
  return new GaReadinessService(config);
}

export function createDefaultGaReadinessService(): GaReadinessService {
  const service = new GaReadinessService();
  service.initializeDefaultChecks();
  return service;
}
