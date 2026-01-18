/**
 * Compliance Report Templates Tests
 *
 * Epic D: Policy & Audit - Story D4: Compliance Reports
 * Task D4.1: Design report templates
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Types
  ComplianceFramework,
  FrameworkMetadata,
  ControlStatus,
  ControlPriority,
  EvidenceType,
  EvidenceReference,
  Attestation,
  RemediationItem,
  ControlDefinition,
  ReportPeriod,
  ReportSummary,
  ComplianceReportTemplate,
  SOC2Category,

  // Constants
  SOC2_COMMON_CRITERIA_DOMAINS,
  SOC2_CONTROL_TEMPLATES,
  ISO27001_DOMAINS,
  ISO27001_CONTROL_TEMPLATES,
  FRAMEWORK_METADATA,

  // Factory functions
  generateReportId,
  createControlFromTemplate,
  createSOC2Template,
  createISO27001Template,
  createCustomTemplate,
  calculateReportSummary,

  // Evidence helpers
  createAuditLogEvidence,
  createDocumentEvidence,
  addEvidenceToControl,
  updateControlStatus,

  // Formatters
  formatReportAsMarkdown,
  formatReportAsJSON,
  parseReportFromJSON,

  // Validation
  validateReportTemplate,
  isReportComplete,
} from '../report-templates.js';

// =============================================================================
// Schema Validation Tests
// =============================================================================

describe('Compliance Framework Schema', () => {
  it('should validate framework types', () => {
    expect(ComplianceFramework.parse('soc2_type1')).toBe('soc2_type1');
    expect(ComplianceFramework.parse('soc2_type2')).toBe('soc2_type2');
    expect(ComplianceFramework.parse('iso27001')).toBe('iso27001');
    expect(ComplianceFramework.parse('hipaa')).toBe('hipaa');
    expect(ComplianceFramework.parse('gdpr')).toBe('gdpr');
    expect(ComplianceFramework.parse('pci_dss')).toBe('pci_dss');
    expect(ComplianceFramework.parse('custom')).toBe('custom');
  });

  it('should reject invalid framework types', () => {
    expect(() => ComplianceFramework.parse('invalid')).toThrow();
    expect(() => ComplianceFramework.parse('')).toThrow();
  });
});

describe('Control Status Schema', () => {
  it('should validate control status values', () => {
    expect(ControlStatus.parse('not_evaluated')).toBe('not_evaluated');
    expect(ControlStatus.parse('compliant')).toBe('compliant');
    expect(ControlStatus.parse('partially_compliant')).toBe('partially_compliant');
    expect(ControlStatus.parse('non_compliant')).toBe('non_compliant');
    expect(ControlStatus.parse('not_applicable')).toBe('not_applicable');
    expect(ControlStatus.parse('compensating')).toBe('compensating');
  });
});

describe('Control Priority Schema', () => {
  it('should validate control priority values', () => {
    expect(ControlPriority.parse('critical')).toBe('critical');
    expect(ControlPriority.parse('high')).toBe('high');
    expect(ControlPriority.parse('medium')).toBe('medium');
    expect(ControlPriority.parse('low')).toBe('low');
  });
});

describe('Evidence Type Schema', () => {
  it('should validate evidence type values', () => {
    expect(EvidenceType.parse('audit_log')).toBe('audit_log');
    expect(EvidenceType.parse('policy_document')).toBe('policy_document');
    expect(EvidenceType.parse('screenshot')).toBe('screenshot');
    expect(EvidenceType.parse('configuration')).toBe('configuration');
    expect(EvidenceType.parse('test_result')).toBe('test_result');
    expect(EvidenceType.parse('interview')).toBe('interview');
    expect(EvidenceType.parse('observation')).toBe('observation');
    expect(EvidenceType.parse('certificate')).toBe('certificate');
    expect(EvidenceType.parse('report')).toBe('report');
    expect(EvidenceType.parse('other')).toBe('other');
  });
});

describe('Evidence Reference Schema', () => {
  it('should validate audit log evidence', () => {
    const evidence = {
      id: 'ev-audit-123',
      type: 'audit_log',
      description: 'Access control logs',
      auditLogEntryIds: ['alog-123-1-abc123', 'alog-123-2-def456'],
      chainVerified: true,
      verifiedAt: new Date(),
      collectedAt: new Date(),
      collectedBy: 'auditor@example.com',
    };

    const result = EvidenceReference.parse(evidence);
    expect(result.type).toBe('audit_log');
    expect(result.auditLogEntryIds).toHaveLength(2);
    expect(result.chainVerified).toBe(true);
  });

  it('should validate document evidence', () => {
    const evidence = {
      id: 'ev-doc-456',
      type: 'policy_document',
      description: 'Access control policy',
      url: 'https://example.com/policies/access-control.pdf',
      collectedAt: new Date(),
      collectedBy: 'auditor@example.com',
    };

    const result = EvidenceReference.parse(evidence);
    expect(result.type).toBe('policy_document');
    expect(result.url).toContain('policies');
  });
});

describe('Attestation Schema', () => {
  it('should validate attestation', () => {
    const attestation = {
      attestorName: 'John Doe',
      attestorTitle: 'Chief Security Officer',
      attestorEmail: 'john.doe@example.com',
      attestedAt: new Date(),
      statement: 'I attest that the controls described in this report are accurate.',
    };

    const result = Attestation.parse(attestation);
    expect(result.attestorName).toBe('John Doe');
    expect(result.attestorTitle).toBe('Chief Security Officer');
  });
});

describe('Remediation Item Schema', () => {
  it('should validate remediation item', () => {
    const remediation = {
      id: 'rem-001',
      description: 'Implement MFA for all admin accounts',
      owner: 'security-team@example.com',
      dueDate: new Date('2024-06-30'),
      status: 'in_progress',
    };

    const result = RemediationItem.parse(remediation);
    expect(result.status).toBe('in_progress');
  });

  it('should validate completed remediation', () => {
    const remediation = {
      id: 'rem-002',
      description: 'Enable audit logging',
      owner: 'devops@example.com',
      dueDate: new Date('2024-03-31'),
      status: 'completed',
      completionNotes: 'Audit logging enabled for all services',
      completedAt: new Date('2024-03-15'),
    };

    const result = RemediationItem.parse(remediation);
    expect(result.status).toBe('completed');
    expect(result.completedAt).toBeDefined();
  });
});

describe('Control Definition Schema', () => {
  it('should validate full control definition', () => {
    const control = {
      controlId: 'CC6.1',
      title: 'Logical Access Security',
      description: 'The entity implements logical access security.',
      category: 'Logical and Physical Access Controls',
      subCategory: 'Logical Access',
      priority: 'critical',
      status: 'compliant',
      finding: 'All access controls are properly implemented.',
      implementation: 'Using RBAC with MFA.',
      testingProcedure: 'Reviewed access logs and tested authentication.',
      testResults: 'All tests passed.',
      evidence: [],
      evidencePeriod: {
        start: new Date('2024-01-01'),
        end: new Date('2024-03-31'),
      },
      remediation: [],
      attestations: [],
      evaluatedAt: new Date(),
      evaluatedBy: 'auditor@example.com',
      notes: ['No exceptions noted'],
      tags: ['access', 'critical'],
    };

    const result = ControlDefinition.parse(control);
    expect(result.controlId).toBe('CC6.1');
    expect(result.status).toBe('compliant');
    expect(result.priority).toBe('critical');
  });
});

// =============================================================================
// Framework Metadata Tests
// =============================================================================

describe('Framework Metadata', () => {
  it('should have metadata for all frameworks', () => {
    expect(FRAMEWORK_METADATA.soc2_type1).toBeDefined();
    expect(FRAMEWORK_METADATA.soc2_type2).toBeDefined();
    expect(FRAMEWORK_METADATA.iso27001).toBeDefined();
    expect(FRAMEWORK_METADATA.hipaa).toBeDefined();
    expect(FRAMEWORK_METADATA.gdpr).toBeDefined();
    expect(FRAMEWORK_METADATA.pci_dss).toBeDefined();
    expect(FRAMEWORK_METADATA.custom).toBeDefined();
  });

  it('should have valid SOC2 Type II metadata', () => {
    const metadata = FRAMEWORK_METADATA.soc2_type2;
    expect(metadata.framework).toBe('soc2_type2');
    expect(metadata.name).toContain('SOC 2');
    expect(metadata.issuingOrg).toBe('AICPA');
    expect(metadata.documentationUrl).toBeDefined();
  });

  it('should have valid ISO 27001 metadata', () => {
    const metadata = FRAMEWORK_METADATA.iso27001;
    expect(metadata.framework).toBe('iso27001');
    expect(metadata.version).toBe('2022');
    expect(metadata.name).toContain('ISO/IEC 27001');
    expect(metadata.issuingOrg).toBe('ISO/IEC');
  });
});

// =============================================================================
// SOC2 Templates Tests
// =============================================================================

describe('SOC2 Control Templates', () => {
  it('should have CC6 access control templates', () => {
    const cc6Controls = SOC2_CONTROL_TEMPLATES.filter(c => c.controlId.startsWith('CC6'));
    expect(cc6Controls.length).toBeGreaterThan(0);
    expect(cc6Controls.some(c => c.controlId === 'CC6.1')).toBe(true);
    expect(cc6Controls.some(c => c.controlId === 'CC6.2')).toBe(true);
    expect(cc6Controls.some(c => c.controlId === 'CC6.3')).toBe(true);
  });

  it('should have CC7 system operations templates', () => {
    const cc7Controls = SOC2_CONTROL_TEMPLATES.filter(c => c.controlId.startsWith('CC7'));
    expect(cc7Controls.length).toBeGreaterThan(0);
    expect(cc7Controls.some(c => c.controlId === 'CC7.1')).toBe(true);
    expect(cc7Controls.some(c => c.controlId === 'CC7.4')).toBe(true);
  });

  it('should have CC8 change management templates', () => {
    const cc8Controls = SOC2_CONTROL_TEMPLATES.filter(c => c.controlId.startsWith('CC8'));
    expect(cc8Controls.some(c => c.controlId === 'CC8.1')).toBe(true);
  });

  it('should define common criteria domains', () => {
    expect(SOC2_COMMON_CRITERIA_DOMAINS['CC6']).toBe('Logical and Physical Access Controls');
    expect(SOC2_COMMON_CRITERIA_DOMAINS['CC7']).toBe('System Operations');
    expect(SOC2_COMMON_CRITERIA_DOMAINS['CC8']).toBe('Change Management');
  });
});

describe('SOC2 Template Creation', () => {
  it('should create SOC2 Type II template', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    const template = createSOC2Template('tenant-123', 'Acme Corp', period);

    expect(template.reportId).toMatch(/^rpt-soc2_type2-/);
    expect(template.framework.framework).toBe('soc2_type2');
    expect(template.organizationName).toBe('Acme Corp');
    expect(template.tenantId).toBe('tenant-123');
    expect(template.controls.length).toBeGreaterThan(0);
    expect(template.summary.totalControls).toBe(template.controls.length);
  });

  it('should create SOC2 Type I template', () => {
    const period: ReportPeriod = {
      start: new Date('2024-03-31'),
      end: new Date('2024-03-31'),
      type: 'point_in_time',
    };

    const template = createSOC2Template('tenant-123', 'Acme Corp', period, 'soc2_type1');

    expect(template.reportId).toMatch(/^rpt-soc2_type1-/);
    expect(template.framework.framework).toBe('soc2_type1');
  });

  it('should initialize all controls as not_evaluated', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    const template = createSOC2Template('tenant-123', 'Acme Corp', period);

    for (const control of template.controls) {
      expect(control.status).toBe('not_evaluated');
      expect(control.evidence).toEqual([]);
      expect(control.remediation).toEqual([]);
      expect(control.attestations).toEqual([]);
    }
  });

  it('should calculate initial summary correctly', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    const template = createSOC2Template('tenant-123', 'Acme Corp', period);

    expect(template.summary.byStatus.notEvaluated).toBe(template.controls.length);
    expect(template.summary.byStatus.compliant).toBe(0);
    expect(template.summary.complianceRate).toBe(0);
  });
});

// =============================================================================
// ISO 27001 Templates Tests
// =============================================================================

describe('ISO 27001 Control Templates', () => {
  it('should have A.5 organizational controls', () => {
    const a5Controls = ISO27001_CONTROL_TEMPLATES.filter(c => c.controlId.startsWith('A.5'));
    expect(a5Controls.length).toBeGreaterThan(0);
    expect(a5Controls.some(c => c.controlId === 'A.5.1')).toBe(true);
    expect(a5Controls.some(c => c.controlId === 'A.5.15')).toBe(true);
  });

  it('should have A.6 people controls', () => {
    const a6Controls = ISO27001_CONTROL_TEMPLATES.filter(c => c.controlId.startsWith('A.6'));
    expect(a6Controls.length).toBeGreaterThan(0);
    expect(a6Controls.some(c => c.controlId === 'A.6.3')).toBe(true);
  });

  it('should have A.8 technological controls', () => {
    const a8Controls = ISO27001_CONTROL_TEMPLATES.filter(c => c.controlId.startsWith('A.8'));
    expect(a8Controls.length).toBeGreaterThan(0);
    expect(a8Controls.some(c => c.controlId === 'A.8.15')).toBe(true);
    expect(a8Controls.some(c => c.controlId === 'A.8.16')).toBe(true);
  });

  it('should define ISO 27001 domains', () => {
    expect(ISO27001_DOMAINS['A.5']).toBe('Organizational controls');
    expect(ISO27001_DOMAINS['A.6']).toBe('People controls');
    expect(ISO27001_DOMAINS['A.7']).toBe('Physical controls');
    expect(ISO27001_DOMAINS['A.8']).toBe('Technological controls');
  });
});

describe('ISO 27001 Template Creation', () => {
  it('should create ISO 27001 template', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-12-31'),
      type: 'period',
    };

    const template = createISO27001Template('tenant-456', 'TechCorp', period);

    expect(template.reportId).toMatch(/^rpt-iso27001-/);
    expect(template.framework.framework).toBe('iso27001');
    expect(template.framework.version).toBe('2022');
    expect(template.organizationName).toBe('TechCorp');
    expect(template.controls.length).toBeGreaterThan(0);
  });

  it('should allow custom options', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-12-31'),
      type: 'period',
    };

    const template = createISO27001Template('tenant-456', 'TechCorp', period, {
      title: 'Custom Title',
      scope: 'Cloud infrastructure only',
      systemsInScope: ['AWS', 'GCP'],
      exclusions: ['On-premise systems'],
    });

    expect(template.title).toBe('Custom Title');
    expect(template.scope).toBe('Cloud infrastructure only');
    expect(template.systemsInScope).toContain('AWS');
    expect(template.exclusions).toContain('On-premise systems');
  });
});

// =============================================================================
// Custom Template Tests
// =============================================================================

describe('Custom Template Creation', () => {
  it('should create custom framework template', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-06-30'),
      type: 'period',
    };

    const customControls = [
      {
        controlId: 'CUSTOM-001',
        title: 'Custom Control 1',
        description: 'A custom control for testing',
        category: 'Custom Category',
        priority: 'high' as const,
      },
      {
        controlId: 'CUSTOM-002',
        title: 'Custom Control 2',
        description: 'Another custom control',
        category: 'Custom Category',
        priority: 'medium' as const,
      },
    ];

    const template = createCustomTemplate(
      'tenant-789',
      'StartupInc',
      period,
      'Internal Security Framework',
      customControls
    );

    expect(template.reportId).toMatch(/^rpt-custom-/);
    expect(template.framework.framework).toBe('custom');
    expect(template.framework.name).toBe('Internal Security Framework');
    expect(template.controls.length).toBe(2);
    expect(template.controls[0].controlId).toBe('CUSTOM-001');
    expect(template.controls[0].status).toBe('not_evaluated');
  });
});

// =============================================================================
// Evidence Helper Tests
// =============================================================================

describe('Evidence Creation Helpers', () => {
  it('should create audit log evidence', () => {
    const evidence = createAuditLogEvidence(
      ['alog-123-1-abc123', 'alog-123-2-def456'],
      'Access control verification logs',
      'auditor@example.com',
      { chainVerified: true, verifiedAt: new Date() }
    );

    expect(evidence.id).toMatch(/^ev-audit-/);
    expect(evidence.type).toBe('audit_log');
    expect(evidence.auditLogEntryIds).toHaveLength(2);
    expect(evidence.chainVerified).toBe(true);
    expect(evidence.collectedBy).toBe('auditor@example.com');
  });

  it('should create document evidence', () => {
    const evidence = createDocumentEvidence(
      'Access control policy document',
      'https://example.com/policies/access.pdf',
      'auditor@example.com'
    );

    expect(evidence.id).toMatch(/^ev-doc-/);
    expect(evidence.type).toBe('policy_document');
    expect(evidence.url).toContain('access.pdf');
  });

  it('should create evidence with custom type', () => {
    const evidence = createDocumentEvidence(
      'Security configuration export',
      'https://example.com/exports/config.json',
      'auditor@example.com',
      'configuration'
    );

    expect(evidence.type).toBe('configuration');
  });
});

describe('Control Update Helpers', () => {
  let template: ComplianceReportTemplate;

  beforeEach(() => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };
    template = createSOC2Template('tenant-123', 'Acme Corp', period);
  });

  it('should add evidence to control', () => {
    const evidence = createAuditLogEvidence(
      ['alog-123-1-abc123'],
      'Access logs',
      'auditor@example.com'
    );

    const updated = addEvidenceToControl(template, 'CC6.1', evidence);
    const control = updated.controls.find(c => c.controlId === 'CC6.1');

    expect(control?.evidence).toHaveLength(1);
    expect(control?.evidence[0].description).toBe('Access logs');
    expect(updated.summary.totalEvidence).toBe(1);
  });

  it('should update control status', () => {
    const updated = updateControlStatus(template, 'CC6.1', 'compliant', {
      finding: 'All access controls are properly implemented',
      implementation: 'RBAC with MFA enabled',
      evaluatedBy: 'auditor@example.com',
    });

    const control = updated.controls.find(c => c.controlId === 'CC6.1');

    expect(control?.status).toBe('compliant');
    expect(control?.finding).toBe('All access controls are properly implemented');
    expect(control?.evaluatedBy).toBe('auditor@example.com');
    expect(control?.evaluatedAt).toBeDefined();
    expect(updated.summary.byStatus.compliant).toBe(1);
    expect(updated.summary.byStatus.notEvaluated).toBe(template.controls.length - 1);
  });

  it('should recalculate summary after updates', () => {
    let updated = updateControlStatus(template, 'CC6.1', 'compliant');
    updated = updateControlStatus(updated, 'CC6.2', 'non_compliant');
    updated = updateControlStatus(updated, 'CC6.3', 'not_applicable');

    expect(updated.summary.byStatus.compliant).toBe(1);
    expect(updated.summary.byStatus.nonCompliant).toBe(1);
    expect(updated.summary.byStatus.notApplicable).toBe(1);

    // Compliance rate should be 1/(2 evaluated) = 50%
    expect(updated.summary.complianceRate).toBe(50);
  });
});

// =============================================================================
// Summary Calculation Tests
// =============================================================================

describe('Report Summary Calculation', () => {
  it('should calculate compliance rate correctly', () => {
    const controls: ControlDefinition[] = [
      createControlFromTemplate({
        controlId: 'TEST-1',
        title: 'Test 1',
        description: 'Test',
        category: 'Test',
        priority: 'high',
      }),
      createControlFromTemplate({
        controlId: 'TEST-2',
        title: 'Test 2',
        description: 'Test',
        category: 'Test',
        priority: 'high',
      }),
      createControlFromTemplate({
        controlId: 'TEST-3',
        title: 'Test 3',
        description: 'Test',
        category: 'Test',
        priority: 'medium',
      }),
    ];

    controls[0].status = 'compliant';
    controls[1].status = 'non_compliant';
    controls[2].status = 'not_applicable';

    const summary = calculateReportSummary(controls);

    expect(summary.totalControls).toBe(3);
    expect(summary.byStatus.compliant).toBe(1);
    expect(summary.byStatus.nonCompliant).toBe(1);
    expect(summary.byStatus.notApplicable).toBe(1);
    // 1 compliant / (3 - 1 N/A) = 50%
    expect(summary.complianceRate).toBe(50);
  });

  it('should count critical findings', () => {
    const controls: ControlDefinition[] = [
      createControlFromTemplate({
        controlId: 'TEST-1',
        title: 'Test 1',
        description: 'Test',
        category: 'Test',
        priority: 'critical',
      }),
      createControlFromTemplate({
        controlId: 'TEST-2',
        title: 'Test 2',
        description: 'Test',
        category: 'Test',
        priority: 'high',
      }),
      createControlFromTemplate({
        controlId: 'TEST-3',
        title: 'Test 3',
        description: 'Test',
        category: 'Test',
        priority: 'medium',
      }),
    ];

    controls[0].status = 'non_compliant'; // Critical
    controls[1].status = 'non_compliant'; // High
    controls[2].status = 'non_compliant'; // Medium - not counted

    const summary = calculateReportSummary(controls);

    expect(summary.criticalFindings).toBe(2);
  });

  it('should count verified evidence', () => {
    const controls: ControlDefinition[] = [
      createControlFromTemplate({
        controlId: 'TEST-1',
        title: 'Test 1',
        description: 'Test',
        category: 'Test',
        priority: 'high',
      }),
    ];

    controls[0].status = 'compliant';
    controls[0].evidence = [
      {
        id: 'ev-1',
        type: 'audit_log',
        description: 'Verified evidence',
        auditLogEntryIds: ['alog-1'],
        chainVerified: true,
        collectedAt: new Date(),
        collectedBy: 'auditor',
      },
      {
        id: 'ev-2',
        type: 'policy_document',
        description: 'Unverified document',
        url: 'https://example.com',
        collectedAt: new Date(),
        collectedBy: 'auditor',
      },
    ];

    const summary = calculateReportSummary(controls);

    expect(summary.totalEvidence).toBe(2);
    expect(summary.verifiedEvidence).toBe(1);
  });

  it('should count open remediations', () => {
    const controls: ControlDefinition[] = [
      createControlFromTemplate({
        controlId: 'TEST-1',
        title: 'Test 1',
        description: 'Test',
        category: 'Test',
        priority: 'high',
      }),
    ];

    controls[0].status = 'non_compliant';
    controls[0].remediation = [
      { id: 'rem-1', description: 'Fix 1', status: 'open' },
      { id: 'rem-2', description: 'Fix 2', status: 'in_progress' },
      { id: 'rem-3', description: 'Fix 3', status: 'completed' },
    ];

    const summary = calculateReportSummary(controls);

    expect(summary.openRemediations).toBe(2);
  });
});

// =============================================================================
// Formatter Tests
// =============================================================================

describe('Markdown Formatter', () => {
  it('should format report as markdown', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    const template = createSOC2Template('tenant-123', 'Acme Corp', period);
    const markdown = formatReportAsMarkdown(template);

    expect(markdown).toContain('# Acme Corp SOC 2 Type II Report');
    expect(markdown).toContain('**Framework:** SOC 2 Type II');
    expect(markdown).toContain('**Organization:** Acme Corp');
    expect(markdown).toContain('## Executive Summary');
    expect(markdown).toContain('## Control Details');
    expect(markdown).toContain('CC6.1');
  });

  it('should include control status indicators', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    let template = createSOC2Template('tenant-123', 'Acme Corp', period);
    template = updateControlStatus(template, 'CC6.1', 'compliant');
    template = updateControlStatus(template, 'CC6.2', 'non_compliant');

    const markdown = formatReportAsMarkdown(template);

    expect(markdown).toContain('[PASS]');
    expect(markdown).toContain('[FAIL]');
  });

  it('should include evidence references', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    let template = createSOC2Template('tenant-123', 'Acme Corp', period);
    const evidence = createAuditLogEvidence(
      ['alog-123-1-abc123'],
      'Access logs for CC6.1',
      'auditor@example.com',
      { chainVerified: true }
    );
    template = addEvidenceToControl(template, 'CC6.1', evidence);

    const markdown = formatReportAsMarkdown(template);

    expect(markdown).toContain('Access logs for CC6.1');
    expect(markdown).toContain('[Verified]');
  });

  it('should include audit log verification section', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    const template = createSOC2Template('tenant-123', 'Acme Corp', period);
    template.auditLogId = 'log-tenant123-policy-abc12345';
    template.auditLogVerified = true;
    template.auditLogRootHash = 'abc123def456';

    const markdown = formatReportAsMarkdown(template);

    expect(markdown).toContain('## Audit Trail');
    expect(markdown).toContain('log-tenant123-policy-abc12345');
    expect(markdown).toContain('Chain Verified:** Yes');
  });
});

describe('JSON Formatter', () => {
  it('should format report as JSON', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    const template = createSOC2Template('tenant-123', 'Acme Corp', period);
    const json = formatReportAsJSON(template);

    expect(json).toContain('"reportId"');
    expect(json).toContain('"Acme Corp"');
    expect(json).toContain('"soc2_type2"');

    // Should be valid JSON
    const parsed = JSON.parse(json);
    expect(parsed.reportId).toBe(template.reportId);
  });

  it('should serialize dates as ISO strings', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01T00:00:00.000Z'),
      end: new Date('2024-03-31T23:59:59.000Z'),
      type: 'period',
    };

    const template = createSOC2Template('tenant-123', 'Acme Corp', period);
    const json = formatReportAsJSON(template);

    expect(json).toContain('2024-01-01');
    expect(json).toContain('2024-03-31');
  });

  it('should round-trip through JSON', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    const original = createSOC2Template('tenant-123', 'Acme Corp', period);
    const json = formatReportAsJSON(original);
    const restored = parseReportFromJSON(json);

    expect(restored.reportId).toBe(original.reportId);
    expect(restored.organizationName).toBe(original.organizationName);
    expect(restored.controls.length).toBe(original.controls.length);
    expect(restored.period.start.getTime()).toBe(original.period.start.getTime());
  });
});

// =============================================================================
// Validation Tests
// =============================================================================

describe('Report Validation', () => {
  it('should validate complete report template', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    const template = createSOC2Template('tenant-123', 'Acme Corp', period);
    const result = validateReportTemplate(template);

    expect(result.success).toBe(true);
  });

  it('should reject invalid report template', () => {
    const invalid = {
      reportId: 'test',
      // Missing required fields
    };

    const result = validateReportTemplate(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('Report Completeness Check', () => {
  it('should identify incomplete report with unevaluated controls', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    const template = createSOC2Template('tenant-123', 'Acme Corp', period);
    const result = isReportComplete(template);

    expect(result.complete).toBe(false);
    expect(result.issues.some(i => i.includes('not been evaluated'))).toBe(true);
  });

  it('should identify non-compliant controls without remediation', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    let template = createSOC2Template('tenant-123', 'Acme Corp', period);

    // Mark all controls evaluated, one as non-compliant without remediation
    for (const control of template.controls) {
      if (control.controlId === 'CC6.1') {
        control.status = 'non_compliant';
        // No remediation added
      } else {
        control.status = 'compliant';
        control.evidence = [{
          id: 'ev-test',
          type: 'observation',
          description: 'Test evidence',
          collectedAt: new Date(),
          collectedBy: 'auditor',
        }];
      }
    }

    const result = isReportComplete(template);

    expect(result.complete).toBe(false);
    expect(result.issues.some(i => i.includes('no remediation plan'))).toBe(true);
  });

  it('should identify controls without evidence', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    let template = createSOC2Template('tenant-123', 'Acme Corp', period);

    // Mark all controls as compliant but only first one has evidence
    for (let i = 0; i < template.controls.length; i++) {
      template.controls[i].status = 'compliant';
      if (i === 0) {
        template.controls[i].evidence = [{
          id: 'ev-test',
          type: 'observation',
          description: 'Test evidence',
          collectedAt: new Date(),
          collectedBy: 'auditor',
        }];
      }
    }

    const result = isReportComplete(template);

    expect(result.complete).toBe(false);
    expect(result.issues.some(i => i.includes('no evidence'))).toBe(true);
  });

  it('should identify missing attestations', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    let template = createSOC2Template('tenant-123', 'Acme Corp', period);

    // Mark all controls as evaluated with evidence
    for (const control of template.controls) {
      control.status = 'compliant';
      control.evidence = [{
        id: 'ev-test',
        type: 'observation',
        description: 'Test evidence',
        collectedAt: new Date(),
        collectedBy: 'auditor',
      }];
    }

    const result = isReportComplete(template);

    expect(result.complete).toBe(false);
    expect(result.issues.some(i => i.includes('no attestations'))).toBe(true);
  });

  it('should pass complete report', () => {
    const period: ReportPeriod = {
      start: new Date('2024-01-01'),
      end: new Date('2024-03-31'),
      type: 'period',
    };

    let template = createSOC2Template('tenant-123', 'Acme Corp', period);

    // Mark all controls as evaluated with evidence
    for (const control of template.controls) {
      control.status = 'compliant';
      control.evidence = [{
        id: 'ev-test',
        type: 'observation',
        description: 'Test evidence',
        collectedAt: new Date(),
        collectedBy: 'auditor',
      }];
    }

    // Add attestation
    template.attestations = [{
      attestorName: 'John Doe',
      attestorTitle: 'CSO',
      attestedAt: new Date(),
      statement: 'I attest...',
    }];

    const result = isReportComplete(template);

    expect(result.complete).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

// =============================================================================
// Report ID Generation Tests
// =============================================================================

describe('Report ID Generation', () => {
  it('should generate unique report IDs', () => {
    const id1 = generateReportId('soc2_type2');
    const id2 = generateReportId('soc2_type2');

    expect(id1).toMatch(/^rpt-soc2_type2-\d+-[a-z0-9]+$/);
    expect(id2).toMatch(/^rpt-soc2_type2-\d+-[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });

  it('should include framework in ID', () => {
    const soc2Id = generateReportId('soc2_type2');
    const isoId = generateReportId('iso27001');
    const customId = generateReportId('custom');

    expect(soc2Id).toContain('soc2_type2');
    expect(isoId).toContain('iso27001');
    expect(customId).toContain('custom');
  });
});
