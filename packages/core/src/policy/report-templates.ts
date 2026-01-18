/**
 * Compliance Report Templates
 *
 * Epic D: Policy & Audit - Story D4: Compliance Reports
 * Task D4.1: Design report templates
 *
 * Templates for SOC2, ISO27001, and custom compliance frameworks.
 * Integrates with immutable audit log (D3) for cryptographically-verified evidence.
 *
 * Features:
 * - Framework-specific control mappings
 * - Evidence sections with audit log references
 * - Attestation fields for verification
 * - Markdown and JSON output formats
 *
 * @module @gwi/core/policy/report-templates
 */

import { z } from 'zod';

// =============================================================================
// Framework Types
// =============================================================================

/**
 * Supported compliance frameworks
 */
export const ComplianceFramework = z.enum([
  'soc2_type1',     // SOC2 Type I (point-in-time)
  'soc2_type2',     // SOC2 Type II (over a period)
  'iso27001',       // ISO/IEC 27001:2022
  'hipaa',          // HIPAA Security Rule
  'gdpr',           // GDPR (EU data protection)
  'pci_dss',        // PCI DSS v4.0
  'custom',         // Custom framework
]);
export type ComplianceFramework = z.infer<typeof ComplianceFramework>;

/**
 * Framework metadata
 */
export const FrameworkMetadata = z.object({
  /** Framework identifier */
  framework: ComplianceFramework,
  /** Framework version/edition */
  version: z.string(),
  /** Full framework name */
  name: z.string(),
  /** Brief description */
  description: z.string(),
  /** Issuing organization */
  issuingOrg: z.string().optional(),
  /** Link to official documentation */
  documentationUrl: z.string().url().optional(),
});
export type FrameworkMetadata = z.infer<typeof FrameworkMetadata>;

// =============================================================================
// Control Types
// =============================================================================

/**
 * Control status (finding)
 */
export const ControlStatus = z.enum([
  'not_evaluated',   // Not yet evaluated
  'compliant',       // Fully compliant
  'partially_compliant', // Partially meets requirements
  'non_compliant',   // Does not meet requirements
  'not_applicable',  // N/A for this environment
  'compensating',    // Met via compensating control
]);
export type ControlStatus = z.infer<typeof ControlStatus>;

/**
 * Control priority/criticality
 */
export const ControlPriority = z.enum([
  'critical',   // Must be addressed immediately
  'high',       // Should be addressed soon
  'medium',     // Normal priority
  'low',        // Low priority
]);
export type ControlPriority = z.infer<typeof ControlPriority>;

/**
 * Evidence type
 */
export const EvidenceType = z.enum([
  'audit_log',        // Reference to immutable audit log entry
  'policy_document',  // Policy document reference
  'screenshot',       // Screenshot/image evidence
  'configuration',    // Configuration export
  'test_result',      // Test execution result
  'interview',        // Interview notes
  'observation',      // Direct observation notes
  'certificate',      // Certificate or attestation
  'report',           // Third-party report
  'other',            // Other evidence type
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

/**
 * Evidence reference with audit log integration
 */
export const EvidenceReference = z.object({
  /** Unique evidence ID */
  id: z.string(),
  /** Evidence type */
  type: EvidenceType,
  /** Brief description */
  description: z.string(),
  /** For audit_log type: entry ID(s) from immutable audit log */
  auditLogEntryIds: z.array(z.string()).optional(),
  /** For audit_log type: chain verification status */
  chainVerified: z.boolean().optional(),
  /** For audit_log type: verification timestamp */
  verifiedAt: z.date().optional(),
  /** External URL or file path */
  url: z.string().optional(),
  /** Collection timestamp */
  collectedAt: z.date(),
  /** Who collected this evidence */
  collectedBy: z.string(),
  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});
export type EvidenceReference = z.infer<typeof EvidenceReference>;

/**
 * Attestation record
 */
export const Attestation = z.object({
  /** Attestor name */
  attestorName: z.string(),
  /** Attestor title/role */
  attestorTitle: z.string(),
  /** Attestor email */
  attestorEmail: z.string().email().optional(),
  /** Attestation date */
  attestedAt: z.date(),
  /** Statement/signature */
  statement: z.string(),
  /** Digital signature (optional) */
  signature: z.string().optional(),
});
export type Attestation = z.infer<typeof Attestation>;

/**
 * Remediation item for findings
 */
export const RemediationItem = z.object({
  /** Remediation ID */
  id: z.string(),
  /** Description of what needs to be done */
  description: z.string(),
  /** Assigned owner */
  owner: z.string().optional(),
  /** Target completion date */
  dueDate: z.date().optional(),
  /** Current status */
  status: z.enum(['open', 'in_progress', 'completed', 'deferred']),
  /** Completion notes */
  completionNotes: z.string().optional(),
  /** Completed date */
  completedAt: z.date().optional(),
});
export type RemediationItem = z.infer<typeof RemediationItem>;

/**
 * Control definition with evidence and findings
 */
export const ControlDefinition = z.object({
  /** Control ID (e.g., CC6.1, A.9.1.1) */
  controlId: z.string(),
  /** Control title */
  title: z.string(),
  /** Full control description */
  description: z.string(),
  /** Category/domain (e.g., "Logical Access", "Risk Assessment") */
  category: z.string(),
  /** Sub-category if applicable */
  subCategory: z.string().optional(),
  /** Control priority */
  priority: ControlPriority,
  /** Parent control ID if nested */
  parentControlId: z.string().optional(),

  // --- Evaluation ---
  /** Current status */
  status: ControlStatus,
  /** Detailed finding/observation */
  finding: z.string().optional(),
  /** Implementation description */
  implementation: z.string().optional(),
  /** Testing procedure used */
  testingProcedure: z.string().optional(),
  /** Test results */
  testResults: z.string().optional(),

  // --- Evidence ---
  /** Evidence references */
  evidence: z.array(EvidenceReference).default([]),
  /** Evidence collection period */
  evidencePeriod: z.object({
    start: z.date(),
    end: z.date(),
  }).optional(),

  // --- Remediation ---
  /** Remediation items for non-compliant findings */
  remediation: z.array(RemediationItem).default([]),

  // --- Attestation ---
  /** Control-level attestations */
  attestations: z.array(Attestation).default([]),

  // --- Metadata ---
  /** Last evaluated date */
  evaluatedAt: z.date().optional(),
  /** Evaluator name */
  evaluatedBy: z.string().optional(),
  /** Notes */
  notes: z.array(z.string()).default([]),
  /** Tags for filtering */
  tags: z.array(z.string()).default([]),
});
export type ControlDefinition = z.infer<typeof ControlDefinition>;

// =============================================================================
// Report Structure
// =============================================================================

/**
 * Report period
 */
export const ReportPeriod = z.object({
  /** Period start date */
  start: z.date(),
  /** Period end date */
  end: z.date(),
  /** Period type */
  type: z.enum(['point_in_time', 'period', 'custom']),
});
export type ReportPeriod = z.infer<typeof ReportPeriod>;

/**
 * Report summary statistics
 */
export const ReportSummary = z.object({
  /** Total controls evaluated */
  totalControls: z.number().int().nonnegative(),
  /** Controls by status */
  byStatus: z.object({
    compliant: z.number().int().nonnegative(),
    partiallyCompliant: z.number().int().nonnegative(),
    nonCompliant: z.number().int().nonnegative(),
    notApplicable: z.number().int().nonnegative(),
    notEvaluated: z.number().int().nonnegative(),
    compensating: z.number().int().nonnegative(),
  }),
  /** Compliance percentage (compliant / (total - N/A - not evaluated)) */
  complianceRate: z.number().min(0).max(100),
  /** Total evidence items */
  totalEvidence: z.number().int().nonnegative(),
  /** Evidence from audit log (chain-verified) */
  verifiedEvidence: z.number().int().nonnegative(),
  /** Open remediation items */
  openRemediations: z.number().int().nonnegative(),
  /** Critical/high priority non-compliant controls */
  criticalFindings: z.number().int().nonnegative(),
});
export type ReportSummary = z.infer<typeof ReportSummary>;

/**
 * Compliance report template
 */
export const ComplianceReportTemplate = z.object({
  /** Unique report ID */
  reportId: z.string(),
  /** Report version */
  version: z.string().default('1.0.0'),

  // --- Framework ---
  /** Framework metadata */
  framework: FrameworkMetadata,

  // --- Scope ---
  /** Tenant/organization ID */
  tenantId: z.string(),
  /** Organization name */
  organizationName: z.string(),
  /** Report title */
  title: z.string(),
  /** Report description */
  description: z.string().optional(),
  /** Audit period */
  period: ReportPeriod,
  /** Scope description */
  scope: z.string(),
  /** Systems/services in scope */
  systemsInScope: z.array(z.string()).default([]),
  /** Exclusions */
  exclusions: z.array(z.string()).default([]),

  // --- Controls ---
  /** Control definitions organized by category */
  controls: z.array(ControlDefinition),

  // --- Summary ---
  /** Report summary statistics */
  summary: ReportSummary,

  // --- Attestations ---
  /** Report-level attestations */
  attestations: z.array(Attestation).default([]),

  // --- Audit Trail ---
  /** Link to immutable audit log */
  auditLogId: z.string().optional(),
  /** Audit log chain verified */
  auditLogVerified: z.boolean().optional(),
  /** Audit log verification hash */
  auditLogRootHash: z.string().optional(),

  // --- Metadata ---
  /** Report generation timestamp */
  generatedAt: z.date(),
  /** Generator (system/tool name) */
  generatedBy: z.string(),
  /** Report hash for integrity */
  contentHash: z.string().optional(),
  /** Digital signature */
  signature: z.string().optional(),
});
export type ComplianceReportTemplate = z.infer<typeof ComplianceReportTemplate>;

// =============================================================================
// SOC2 Trust Service Criteria
// =============================================================================

/**
 * SOC2 Trust Service Categories
 */
export const SOC2Category = z.enum([
  'CC',   // Common Criteria (required for all)
  'A',    // Availability
  'PI',   // Processing Integrity
  'C',    // Confidentiality
  'P',    // Privacy
]);
export type SOC2Category = z.infer<typeof SOC2Category>;

/**
 * SOC2 Common Criteria domains
 */
export const SOC2_COMMON_CRITERIA_DOMAINS = {
  'CC1': 'Control Environment',
  'CC2': 'Communication and Information',
  'CC3': 'Risk Assessment',
  'CC4': 'Monitoring Activities',
  'CC5': 'Control Activities',
  'CC6': 'Logical and Physical Access Controls',
  'CC7': 'System Operations',
  'CC8': 'Change Management',
  'CC9': 'Risk Mitigation',
} as const;

/**
 * SOC2 control template (subset of key controls)
 */
export const SOC2_CONTROL_TEMPLATES: Omit<ControlDefinition, 'status' | 'evidence' | 'remediation' | 'attestations' | 'notes' | 'tags'>[] = [
  // CC6: Logical and Physical Access Controls
  {
    controlId: 'CC6.1',
    title: 'Logical Access Security Software',
    description: 'The entity implements logical access security software, infrastructure, and architectures over protected information assets to protect them from security events.',
    category: 'Logical and Physical Access Controls',
    subCategory: 'Logical Access',
    priority: 'critical',
  },
  {
    controlId: 'CC6.2',
    title: 'Access Provisioning',
    description: 'Prior to issuing system credentials and granting system access, the entity registers and authorizes new internal and external users whose access is administered by the entity.',
    category: 'Logical and Physical Access Controls',
    subCategory: 'User Management',
    priority: 'critical',
  },
  {
    controlId: 'CC6.3',
    title: 'Access Removal',
    description: 'The entity removes access to protected information assets when appropriate (e.g., upon termination of employment or system access is no longer required).',
    category: 'Logical and Physical Access Controls',
    subCategory: 'User Management',
    priority: 'critical',
  },
  {
    controlId: 'CC6.6',
    title: 'System Boundary Protection',
    description: 'The entity implements logical access security measures to protect against threats from sources outside its system boundaries.',
    category: 'Logical and Physical Access Controls',
    subCategory: 'Network Security',
    priority: 'high',
  },
  {
    controlId: 'CC6.7',
    title: 'Information Transmission Protection',
    description: 'The entity restricts the transmission, movement, and removal of information to authorized internal and external users and processes.',
    category: 'Logical and Physical Access Controls',
    subCategory: 'Data Protection',
    priority: 'high',
  },
  {
    controlId: 'CC6.8',
    title: 'Malicious Software Prevention',
    description: 'The entity implements controls to prevent or detect and act upon the introduction of unauthorized or malicious software.',
    category: 'Logical and Physical Access Controls',
    subCategory: 'Malware Protection',
    priority: 'high',
  },

  // CC7: System Operations
  {
    controlId: 'CC7.1',
    title: 'Security Event Detection',
    description: 'To meet its objectives, the entity uses detection and monitoring procedures to identify anomalies that could represent security events.',
    category: 'System Operations',
    subCategory: 'Monitoring',
    priority: 'critical',
  },
  {
    controlId: 'CC7.2',
    title: 'Anomaly Analysis',
    description: 'The entity monitors system components and the operation of those components for anomalies that are indicative of malicious acts, natural disasters, and errors.',
    category: 'System Operations',
    subCategory: 'Monitoring',
    priority: 'high',
  },
  {
    controlId: 'CC7.3',
    title: 'Security Event Evaluation',
    description: 'The entity evaluates security events to determine whether they could or have resulted in a failure to meet objectives.',
    category: 'System Operations',
    subCategory: 'Incident Response',
    priority: 'high',
  },
  {
    controlId: 'CC7.4',
    title: 'Incident Response',
    description: 'The entity responds to identified security incidents by executing a defined incident response program.',
    category: 'System Operations',
    subCategory: 'Incident Response',
    priority: 'critical',
  },
  {
    controlId: 'CC7.5',
    title: 'Incident Recovery',
    description: 'The entity identifies, develops, and implements activities to recover from identified security incidents.',
    category: 'System Operations',
    subCategory: 'Incident Response',
    priority: 'high',
  },

  // CC8: Change Management
  {
    controlId: 'CC8.1',
    title: 'Change Management Process',
    description: 'The entity authorizes, designs, develops or acquires, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures.',
    category: 'Change Management',
    subCategory: 'Change Control',
    priority: 'critical',
  },

  // CC3: Risk Assessment
  {
    controlId: 'CC3.1',
    title: 'Risk Identification',
    description: 'The entity identifies and assesses risks that could affect the achievement of its objectives.',
    category: 'Risk Assessment',
    subCategory: 'Risk Management',
    priority: 'high',
  },
  {
    controlId: 'CC3.2',
    title: 'Risk Analysis',
    description: 'The entity identifies risks to the achievement of its objectives across the entity and analyzes risks.',
    category: 'Risk Assessment',
    subCategory: 'Risk Management',
    priority: 'high',
  },
  {
    controlId: 'CC3.4',
    title: 'Fraud Risk Assessment',
    description: 'The entity considers the potential for fraud in assessing risks to the achievement of objectives.',
    category: 'Risk Assessment',
    subCategory: 'Fraud Prevention',
    priority: 'medium',
  },

  // CC5: Control Activities
  {
    controlId: 'CC5.1',
    title: 'Control Selection',
    description: 'The entity selects and develops control activities that contribute to the mitigation of risks to the achievement of objectives.',
    category: 'Control Activities',
    subCategory: 'Control Design',
    priority: 'high',
  },
  {
    controlId: 'CC5.2',
    title: 'Technology Controls',
    description: 'The entity also selects and develops general control activities over technology to support the achievement of objectives.',
    category: 'Control Activities',
    subCategory: 'IT Controls',
    priority: 'high',
  },
  {
    controlId: 'CC5.3',
    title: 'Control Policies',
    description: 'The entity deploys control activities through policies that establish what is expected and procedures that put policies into action.',
    category: 'Control Activities',
    subCategory: 'Policy Management',
    priority: 'medium',
  },
];

// =============================================================================
// ISO 27001 Annex A Controls
// =============================================================================

/**
 * ISO 27001:2022 Annex A Domains
 */
export const ISO27001_DOMAINS = {
  'A.5': 'Organizational controls',
  'A.6': 'People controls',
  'A.7': 'Physical controls',
  'A.8': 'Technological controls',
} as const;

/**
 * ISO 27001:2022 control templates (subset of key controls)
 */
export const ISO27001_CONTROL_TEMPLATES: Omit<ControlDefinition, 'status' | 'evidence' | 'remediation' | 'attestations' | 'notes' | 'tags'>[] = [
  // A.5: Organizational controls
  {
    controlId: 'A.5.1',
    title: 'Policies for information security',
    description: 'Information security policy and topic-specific policies shall be defined, approved by management, published, communicated to and acknowledged by relevant personnel and relevant interested parties.',
    category: 'Organizational controls',
    subCategory: 'Information security policies',
    priority: 'critical',
  },
  {
    controlId: 'A.5.2',
    title: 'Information security roles and responsibilities',
    description: 'Information security roles and responsibilities shall be defined and allocated according to the organization needs.',
    category: 'Organizational controls',
    subCategory: 'Organization of information security',
    priority: 'high',
  },
  {
    controlId: 'A.5.7',
    title: 'Threat intelligence',
    description: 'Information relating to information security threats shall be collected and analysed to produce threat intelligence.',
    category: 'Organizational controls',
    subCategory: 'Threat intelligence',
    priority: 'medium',
  },
  {
    controlId: 'A.5.15',
    title: 'Access control',
    description: 'Rules to control physical and logical access to information and other associated assets shall be established and implemented based on business and information security requirements.',
    category: 'Organizational controls',
    subCategory: 'Access control',
    priority: 'critical',
  },
  {
    controlId: 'A.5.17',
    title: 'Authentication information',
    description: 'Allocation and management of authentication information shall be controlled by a management process including advising personnel on appropriate handling.',
    category: 'Organizational controls',
    subCategory: 'Identity management',
    priority: 'critical',
  },
  {
    controlId: 'A.5.23',
    title: 'Information security for use of cloud services',
    description: 'Processes for acquisition, use, management and exit from cloud services shall be established in accordance with the organization information security requirements.',
    category: 'Organizational controls',
    subCategory: 'Cloud security',
    priority: 'high',
  },
  {
    controlId: 'A.5.24',
    title: 'Information security incident management planning and preparation',
    description: 'The organization shall plan and prepare for managing information security incidents by defining, establishing and communicating information security incident management processes, roles and responsibilities.',
    category: 'Organizational controls',
    subCategory: 'Incident management',
    priority: 'critical',
  },
  {
    controlId: 'A.5.28',
    title: 'Collection of evidence',
    description: 'The organization shall establish and implement procedures for the identification, collection, acquisition and preservation of evidence related to information security events.',
    category: 'Organizational controls',
    subCategory: 'Evidence collection',
    priority: 'high',
  },
  {
    controlId: 'A.5.30',
    title: 'ICT readiness for business continuity',
    description: 'ICT readiness shall be planned, implemented, maintained and tested based on business continuity objectives and ICT continuity requirements.',
    category: 'Organizational controls',
    subCategory: 'Business continuity',
    priority: 'high',
  },
  {
    controlId: 'A.5.36',
    title: 'Compliance with policies, rules and standards for information security',
    description: 'Compliance with the organization information security policy, topic-specific policies, rules and standards shall be regularly reviewed.',
    category: 'Organizational controls',
    subCategory: 'Compliance',
    priority: 'high',
  },

  // A.6: People controls
  {
    controlId: 'A.6.1',
    title: 'Screening',
    description: 'Background verification checks on all candidates to become personnel shall be carried out prior to joining the organization and on an ongoing basis.',
    category: 'People controls',
    subCategory: 'Prior to employment',
    priority: 'medium',
  },
  {
    controlId: 'A.6.3',
    title: 'Information security awareness, education and training',
    description: 'Personnel of the organization and relevant interested parties shall receive appropriate information security awareness, education and training.',
    category: 'People controls',
    subCategory: 'Awareness and training',
    priority: 'high',
  },
  {
    controlId: 'A.6.5',
    title: 'Responsibilities after termination or change of employment',
    description: 'Information security responsibilities and duties that remain valid after termination or change of employment shall be defined, enforced and communicated.',
    category: 'People controls',
    subCategory: 'Termination',
    priority: 'high',
  },

  // A.8: Technological controls
  {
    controlId: 'A.8.2',
    title: 'Privileged access rights',
    description: 'The allocation and use of privileged access rights shall be restricted and managed.',
    category: 'Technological controls',
    subCategory: 'Access management',
    priority: 'critical',
  },
  {
    controlId: 'A.8.5',
    title: 'Secure authentication',
    description: 'Secure authentication technologies and procedures shall be implemented based on information access restrictions and the topic-specific policy on access control.',
    category: 'Technological controls',
    subCategory: 'Authentication',
    priority: 'critical',
  },
  {
    controlId: 'A.8.9',
    title: 'Configuration management',
    description: 'Configurations, including security configurations, of hardware, software, services and networks shall be established, documented, implemented, monitored and reviewed.',
    category: 'Technological controls',
    subCategory: 'Configuration',
    priority: 'high',
  },
  {
    controlId: 'A.8.15',
    title: 'Logging',
    description: 'Logs that record activities, exceptions, faults and other relevant events shall be produced, stored, protected and analysed.',
    category: 'Technological controls',
    subCategory: 'Logging and monitoring',
    priority: 'critical',
  },
  {
    controlId: 'A.8.16',
    title: 'Monitoring activities',
    description: 'Networks, systems and applications shall be monitored for anomalous behaviour and appropriate actions taken to evaluate potential information security incidents.',
    category: 'Technological controls',
    subCategory: 'Logging and monitoring',
    priority: 'critical',
  },
  {
    controlId: 'A.8.20',
    title: 'Networks security',
    description: 'Networks and network devices shall be secured, managed and controlled to protect information in systems and applications.',
    category: 'Technological controls',
    subCategory: 'Network security',
    priority: 'high',
  },
  {
    controlId: 'A.8.24',
    title: 'Use of cryptography',
    description: 'Rules for the effective use of cryptography, including cryptographic key management, shall be defined and implemented.',
    category: 'Technological controls',
    subCategory: 'Cryptography',
    priority: 'high',
  },
  {
    controlId: 'A.8.25',
    title: 'Secure development life cycle',
    description: 'Rules for the secure development of software and systems shall be established and applied.',
    category: 'Technological controls',
    subCategory: 'Secure development',
    priority: 'high',
  },
  {
    controlId: 'A.8.32',
    title: 'Change management',
    description: 'Changes to information processing facilities and information systems shall be subject to change management procedures.',
    category: 'Technological controls',
    subCategory: 'Change management',
    priority: 'critical',
  },
];

// =============================================================================
// Framework Metadata Definitions
// =============================================================================

/**
 * Pre-defined framework metadata
 */
export const FRAMEWORK_METADATA: Record<ComplianceFramework, FrameworkMetadata> = {
  soc2_type1: {
    framework: 'soc2_type1',
    version: '2017',
    name: 'SOC 2 Type I',
    description: 'Point-in-time report on the suitability of design of controls',
    issuingOrg: 'AICPA',
    documentationUrl: 'https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/socforserviceorganizations.html',
  },
  soc2_type2: {
    framework: 'soc2_type2',
    version: '2017',
    name: 'SOC 2 Type II',
    description: 'Report on the suitability of design and operating effectiveness of controls over a period',
    issuingOrg: 'AICPA',
    documentationUrl: 'https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/socforserviceorganizations.html',
  },
  iso27001: {
    framework: 'iso27001',
    version: '2022',
    name: 'ISO/IEC 27001:2022',
    description: 'Information security management systems requirements',
    issuingOrg: 'ISO/IEC',
    documentationUrl: 'https://www.iso.org/standard/27001',
  },
  hipaa: {
    framework: 'hipaa',
    version: '2013',
    name: 'HIPAA Security Rule',
    description: 'Health Insurance Portability and Accountability Act Security Rule',
    issuingOrg: 'HHS',
    documentationUrl: 'https://www.hhs.gov/hipaa/for-professionals/security/index.html',
  },
  gdpr: {
    framework: 'gdpr',
    version: '2018',
    name: 'General Data Protection Regulation',
    description: 'EU regulation on data protection and privacy',
    issuingOrg: 'European Union',
    documentationUrl: 'https://gdpr.eu/',
  },
  pci_dss: {
    framework: 'pci_dss',
    version: '4.0',
    name: 'PCI DSS v4.0',
    description: 'Payment Card Industry Data Security Standard',
    issuingOrg: 'PCI SSC',
    documentationUrl: 'https://www.pcisecuritystandards.org/',
  },
  custom: {
    framework: 'custom',
    version: '1.0',
    name: 'Custom Framework',
    description: 'Organization-defined compliance framework',
  },
};

// =============================================================================
// Template Factory Functions
// =============================================================================

/**
 * Generate a unique report ID
 */
export function generateReportId(framework: ComplianceFramework): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `rpt-${framework}-${timestamp}-${random}`;
}

/**
 * Create an empty control definition from a template
 */
export function createControlFromTemplate(
  template: Omit<ControlDefinition, 'status' | 'evidence' | 'remediation' | 'attestations' | 'notes' | 'tags'>
): ControlDefinition {
  return {
    ...template,
    status: 'not_evaluated',
    evidence: [],
    remediation: [],
    attestations: [],
    notes: [],
    tags: [],
  };
}

/**
 * Create a new SOC2 report template
 */
export function createSOC2Template(
  tenantId: string,
  organizationName: string,
  period: ReportPeriod,
  type: 'soc2_type1' | 'soc2_type2' = 'soc2_type2',
  options?: {
    title?: string;
    description?: string;
    scope?: string;
    systemsInScope?: string[];
    exclusions?: string[];
    categories?: SOC2Category[];
  }
): ComplianceReportTemplate {
  const controls = SOC2_CONTROL_TEMPLATES.map(createControlFromTemplate);

  const summary = calculateReportSummary(controls);

  return {
    reportId: generateReportId(type),
    version: '1.0.0',
    framework: FRAMEWORK_METADATA[type],
    tenantId,
    organizationName,
    title: options?.title || `${organizationName} SOC 2 ${type === 'soc2_type1' ? 'Type I' : 'Type II'} Report`,
    description: options?.description,
    period,
    scope: options?.scope || 'All systems and processes supporting the service',
    systemsInScope: options?.systemsInScope || [],
    exclusions: options?.exclusions || [],
    controls,
    summary,
    attestations: [],
    generatedAt: new Date(),
    generatedBy: 'gwi-compliance-engine',
  };
}

/**
 * Create a new ISO 27001 report template
 */
export function createISO27001Template(
  tenantId: string,
  organizationName: string,
  period: ReportPeriod,
  options?: {
    title?: string;
    description?: string;
    scope?: string;
    systemsInScope?: string[];
    exclusions?: string[];
  }
): ComplianceReportTemplate {
  const controls = ISO27001_CONTROL_TEMPLATES.map(createControlFromTemplate);

  const summary = calculateReportSummary(controls);

  return {
    reportId: generateReportId('iso27001'),
    version: '1.0.0',
    framework: FRAMEWORK_METADATA.iso27001,
    tenantId,
    organizationName,
    title: options?.title || `${organizationName} ISO 27001:2022 Compliance Report`,
    description: options?.description,
    period,
    scope: options?.scope || 'Information security management system',
    systemsInScope: options?.systemsInScope || [],
    exclusions: options?.exclusions || [],
    controls,
    summary,
    attestations: [],
    generatedAt: new Date(),
    generatedBy: 'gwi-compliance-engine',
  };
}

/**
 * Create a custom framework template
 */
export function createCustomTemplate(
  tenantId: string,
  organizationName: string,
  period: ReportPeriod,
  frameworkName: string,
  controls: Omit<ControlDefinition, 'status' | 'evidence' | 'remediation' | 'attestations' | 'notes' | 'tags'>[],
  options?: {
    title?: string;
    description?: string;
    scope?: string;
    systemsInScope?: string[];
    exclusions?: string[];
    frameworkVersion?: string;
  }
): ComplianceReportTemplate {
  const populatedControls = controls.map(createControlFromTemplate);
  const summary = calculateReportSummary(populatedControls);

  return {
    reportId: generateReportId('custom'),
    version: '1.0.0',
    framework: {
      framework: 'custom',
      version: options?.frameworkVersion || '1.0',
      name: frameworkName,
      description: options?.description || `Custom compliance framework: ${frameworkName}`,
    },
    tenantId,
    organizationName,
    title: options?.title || `${organizationName} ${frameworkName} Compliance Report`,
    description: options?.description,
    period,
    scope: options?.scope || 'As defined by the custom framework',
    systemsInScope: options?.systemsInScope || [],
    exclusions: options?.exclusions || [],
    controls: populatedControls,
    summary,
    attestations: [],
    generatedAt: new Date(),
    generatedBy: 'gwi-compliance-engine',
  };
}

/**
 * Calculate report summary from controls
 */
export function calculateReportSummary(controls: ControlDefinition[]): ReportSummary {
  const byStatus = {
    compliant: 0,
    partiallyCompliant: 0,
    nonCompliant: 0,
    notApplicable: 0,
    notEvaluated: 0,
    compensating: 0,
  };

  let totalEvidence = 0;
  let verifiedEvidence = 0;
  let openRemediations = 0;
  let criticalFindings = 0;

  for (const control of controls) {
    // Count by status
    switch (control.status) {
      case 'compliant':
        byStatus.compliant++;
        break;
      case 'partially_compliant':
        byStatus.partiallyCompliant++;
        break;
      case 'non_compliant':
        byStatus.nonCompliant++;
        if (control.priority === 'critical' || control.priority === 'high') {
          criticalFindings++;
        }
        break;
      case 'not_applicable':
        byStatus.notApplicable++;
        break;
      case 'not_evaluated':
        byStatus.notEvaluated++;
        break;
      case 'compensating':
        byStatus.compensating++;
        break;
    }

    // Count evidence
    totalEvidence += control.evidence.length;
    verifiedEvidence += control.evidence.filter(e => e.chainVerified).length;

    // Count open remediations
    openRemediations += control.remediation.filter(r => r.status === 'open' || r.status === 'in_progress').length;
  }

  // Calculate compliance rate (excluding N/A and not evaluated)
  const evaluatedControls = controls.length - byStatus.notApplicable - byStatus.notEvaluated;
  const compliantControls = byStatus.compliant + byStatus.compensating;
  const complianceRate = evaluatedControls > 0
    ? (compliantControls / evaluatedControls) * 100
    : 0;

  return {
    totalControls: controls.length,
    byStatus,
    complianceRate: Math.round(complianceRate * 100) / 100,
    totalEvidence,
    verifiedEvidence,
    openRemediations,
    criticalFindings,
  };
}

// =============================================================================
// Evidence Helpers
// =============================================================================

/**
 * Create an evidence reference from audit log entries
 */
export function createAuditLogEvidence(
  auditLogEntryIds: string[],
  description: string,
  collectedBy: string,
  options?: {
    chainVerified?: boolean;
    verifiedAt?: Date;
    metadata?: Record<string, unknown>;
  }
): EvidenceReference {
  return {
    id: `ev-audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'audit_log',
    description,
    auditLogEntryIds,
    chainVerified: options?.chainVerified ?? false,
    verifiedAt: options?.verifiedAt,
    collectedAt: new Date(),
    collectedBy,
    metadata: options?.metadata,
  };
}

/**
 * Create a document evidence reference
 */
export function createDocumentEvidence(
  description: string,
  url: string,
  collectedBy: string,
  type: EvidenceType = 'policy_document',
  metadata?: Record<string, unknown>
): EvidenceReference {
  return {
    id: `ev-doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    description,
    url,
    collectedAt: new Date(),
    collectedBy,
    metadata,
  };
}

/**
 * Add evidence to a control
 */
export function addEvidenceToControl(
  report: ComplianceReportTemplate,
  controlId: string,
  evidence: EvidenceReference
): ComplianceReportTemplate {
  const controls = report.controls.map(control => {
    if (control.controlId === controlId) {
      return {
        ...control,
        evidence: [...control.evidence, evidence],
      };
    }
    return control;
  });

  return {
    ...report,
    controls,
    summary: calculateReportSummary(controls),
  };
}

/**
 * Update control status
 */
export function updateControlStatus(
  report: ComplianceReportTemplate,
  controlId: string,
  status: ControlStatus,
  options?: {
    finding?: string;
    implementation?: string;
    testResults?: string;
    evaluatedBy?: string;
  }
): ComplianceReportTemplate {
  const controls = report.controls.map(control => {
    if (control.controlId === controlId) {
      return {
        ...control,
        status,
        finding: options?.finding ?? control.finding,
        implementation: options?.implementation ?? control.implementation,
        testResults: options?.testResults ?? control.testResults,
        evaluatedAt: new Date(),
        evaluatedBy: options?.evaluatedBy ?? control.evaluatedBy,
      };
    }
    return control;
  });

  return {
    ...report,
    controls,
    summary: calculateReportSummary(controls),
  };
}

// =============================================================================
// Output Formatters
// =============================================================================

/**
 * Format control status as emoji for Markdown
 */
function statusEmoji(status: ControlStatus): string {
  switch (status) {
    case 'compliant':
      return '[PASS]';
    case 'partially_compliant':
      return '[PARTIAL]';
    case 'non_compliant':
      return '[FAIL]';
    case 'not_applicable':
      return '[N/A]';
    case 'not_evaluated':
      return '[--]';
    case 'compensating':
      return '[COMP]';
    default:
      return '[?]';
  }
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Export report to Markdown format
 */
export function formatReportAsMarkdown(report: ComplianceReportTemplate): string {
  const lines: string[] = [];

  // Title
  lines.push(`# ${report.title}`);
  lines.push('');

  // Metadata
  lines.push(`**Report ID:** ${report.reportId}`);
  lines.push(`**Framework:** ${report.framework.name} (${report.framework.version})`);
  lines.push(`**Organization:** ${report.organizationName}`);
  lines.push(`**Period:** ${formatDate(report.period.start)} to ${formatDate(report.period.end)}`);
  lines.push(`**Generated:** ${report.generatedAt.toISOString()}`);
  lines.push('');

  // Scope
  lines.push('## Scope');
  lines.push('');
  lines.push(report.scope);
  if (report.systemsInScope.length > 0) {
    lines.push('');
    lines.push('**Systems in Scope:**');
    for (const system of report.systemsInScope) {
      lines.push(`- ${system}`);
    }
  }
  if (report.exclusions.length > 0) {
    lines.push('');
    lines.push('**Exclusions:**');
    for (const exclusion of report.exclusions) {
      lines.push(`- ${exclusion}`);
    }
  }
  lines.push('');

  // Executive Summary
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Controls | ${report.summary.totalControls} |`);
  lines.push(`| Compliance Rate | ${report.summary.complianceRate.toFixed(1)}% |`);
  lines.push(`| Compliant | ${report.summary.byStatus.compliant} |`);
  lines.push(`| Partially Compliant | ${report.summary.byStatus.partiallyCompliant} |`);
  lines.push(`| Non-Compliant | ${report.summary.byStatus.nonCompliant} |`);
  lines.push(`| Not Applicable | ${report.summary.byStatus.notApplicable} |`);
  lines.push(`| Not Evaluated | ${report.summary.byStatus.notEvaluated} |`);
  lines.push(`| Compensating Controls | ${report.summary.byStatus.compensating} |`);
  lines.push(`| Critical/High Findings | ${report.summary.criticalFindings} |`);
  lines.push(`| Total Evidence Items | ${report.summary.totalEvidence} |`);
  lines.push(`| Chain-Verified Evidence | ${report.summary.verifiedEvidence} |`);
  lines.push(`| Open Remediations | ${report.summary.openRemediations} |`);
  lines.push('');

  // Audit Log Verification
  if (report.auditLogId) {
    lines.push('## Audit Trail');
    lines.push('');
    lines.push(`**Audit Log ID:** ${report.auditLogId}`);
    lines.push(`**Chain Verified:** ${report.auditLogVerified ? 'Yes' : 'No'}`);
    if (report.auditLogRootHash) {
      lines.push(`**Root Hash:** \`${report.auditLogRootHash}\``);
    }
    lines.push('');
  }

  // Controls by Category
  lines.push('## Control Details');
  lines.push('');

  // Group controls by category
  const byCategory = new Map<string, ControlDefinition[]>();
  for (const control of report.controls) {
    const existing = byCategory.get(control.category) || [];
    existing.push(control);
    byCategory.set(control.category, existing);
  }

  for (const [category, controls] of byCategory) {
    lines.push(`### ${category}`);
    lines.push('');

    for (const control of controls) {
      lines.push(`#### ${control.controlId}: ${control.title}`);
      lines.push('');
      lines.push(`**Status:** ${statusEmoji(control.status)} ${control.status.replace('_', ' ')}`);
      lines.push(`**Priority:** ${control.priority}`);
      lines.push('');
      lines.push('**Description:**');
      lines.push(control.description);
      lines.push('');

      if (control.implementation) {
        lines.push('**Implementation:**');
        lines.push(control.implementation);
        lines.push('');
      }

      if (control.finding) {
        lines.push('**Finding:**');
        lines.push(control.finding);
        lines.push('');
      }

      if (control.testResults) {
        lines.push('**Test Results:**');
        lines.push(control.testResults);
        lines.push('');
      }

      // Evidence
      if (control.evidence.length > 0) {
        lines.push('**Evidence:**');
        for (const ev of control.evidence) {
          let evLine = `- ${ev.description}`;
          if (ev.type === 'audit_log' && ev.auditLogEntryIds) {
            evLine += ` (Audit entries: ${ev.auditLogEntryIds.join(', ')})`;
            if (ev.chainVerified) {
              evLine += ' [Verified]';
            }
          } else if (ev.url) {
            evLine += ` [${ev.url}]`;
          }
          lines.push(evLine);
        }
        lines.push('');
      }

      // Remediation
      if (control.remediation.length > 0) {
        lines.push('**Remediation:**');
        for (const rem of control.remediation) {
          lines.push(`- [${rem.status}] ${rem.description}`);
          if (rem.owner) {
            lines.push(`  - Owner: ${rem.owner}`);
          }
          if (rem.dueDate) {
            lines.push(`  - Due: ${formatDate(rem.dueDate)}`);
          }
        }
        lines.push('');
      }

      if (control.evaluatedAt && control.evaluatedBy) {
        lines.push(`*Evaluated by ${control.evaluatedBy} on ${formatDate(control.evaluatedAt)}*`);
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }
  }

  // Attestations
  if (report.attestations.length > 0) {
    lines.push('## Attestations');
    lines.push('');
    for (const att of report.attestations) {
      lines.push(`### ${att.attestorName}`);
      lines.push(`**Title:** ${att.attestorTitle}`);
      lines.push(`**Date:** ${formatDate(att.attestedAt)}`);
      lines.push('');
      lines.push(att.statement);
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Generated by ${report.generatedBy} on ${report.generatedAt.toISOString()}*`);
  if (report.contentHash) {
    lines.push(`*Content Hash: ${report.contentHash}*`);
  }

  return lines.join('\n');
}

/**
 * Export report to JSON format
 */
export function formatReportAsJSON(report: ComplianceReportTemplate): string {
  // Convert dates to ISO strings for JSON serialization
  const serializable = JSON.parse(JSON.stringify(report, (_key, value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }));

  return JSON.stringify(serializable, null, 2);
}

/**
 * Parse JSON report back to template
 */
export function parseReportFromJSON(json: string): ComplianceReportTemplate {
  const parsed = JSON.parse(json);

  // Convert date strings back to Date objects
  const convertDates = (obj: Record<string, unknown>): void => {
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        obj[key] = new Date(value);
      } else if (value && typeof value === 'object') {
        convertDates(value as Record<string, unknown>);
      }
    }
  };

  convertDates(parsed);

  return ComplianceReportTemplate.parse(parsed);
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a compliance report template
 */
export function validateReportTemplate(
  report: unknown
): { success: true; data: ComplianceReportTemplate } | { success: false; errors: z.ZodError } {
  const result = ComplianceReportTemplate.safeParse(report);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Check if report is ready for finalization
 */
export function isReportComplete(report: ComplianceReportTemplate): {
  complete: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check for unevaluated controls
  const unevaluated = report.controls.filter(c => c.status === 'not_evaluated');
  if (unevaluated.length > 0) {
    issues.push(`${unevaluated.length} controls have not been evaluated: ${unevaluated.map(c => c.controlId).join(', ')}`);
  }

  // Check for non-compliant controls without remediation
  const noRemediation = report.controls.filter(
    c => c.status === 'non_compliant' && c.remediation.length === 0
  );
  if (noRemediation.length > 0) {
    issues.push(`${noRemediation.length} non-compliant controls have no remediation plan: ${noRemediation.map(c => c.controlId).join(', ')}`);
  }

  // Check for controls without evidence
  const noEvidence = report.controls.filter(
    c => c.status !== 'not_applicable' && c.status !== 'not_evaluated' && c.evidence.length === 0
  );
  if (noEvidence.length > 0) {
    issues.push(`${noEvidence.length} evaluated controls have no evidence: ${noEvidence.map(c => c.controlId).join(', ')}`);
  }

  // Check for attestations
  if (report.attestations.length === 0) {
    issues.push('Report has no attestations');
  }

  return {
    complete: issues.length === 0,
    issues,
  };
}
