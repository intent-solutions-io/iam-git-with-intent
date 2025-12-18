/**
 * Phase 64: Data Governance
 *
 * Data governance framework:
 * - Data classification
 * - Access policies
 * - Data lineage tracking
 * - PII detection and handling
 * - Data quality rules
 * - Consent management
 *
 * @module @gwi/core/data-governance
 */

import { z } from 'zod';

// =============================================================================
// DATA CLASSIFICATION
// =============================================================================

export const DataClassificationLevels = {
  PUBLIC: 'public',
  INTERNAL: 'internal',
  CONFIDENTIAL: 'confidential',
  RESTRICTED: 'restricted',
  PII: 'pii',
  PHI: 'phi',
  PCI: 'pci',
} as const;

export type DataClassificationLevel = (typeof DataClassificationLevels)[keyof typeof DataClassificationLevels];

export const DataCategories = {
  PERSONAL: 'personal',
  FINANCIAL: 'financial',
  HEALTH: 'health',
  BEHAVIORAL: 'behavioral',
  TECHNICAL: 'technical',
  OPERATIONAL: 'operational',
  ANALYTICS: 'analytics',
} as const;

export type DataCategory = (typeof DataCategories)[keyof typeof DataCategories];

export interface DataClassification {
  /** Classification level */
  level: DataClassificationLevel;
  /** Data categories */
  categories: DataCategory[];
  /** Requires encryption at rest */
  encryptionRequired: boolean;
  /** Requires encryption in transit */
  transitEncryptionRequired: boolean;
  /** Requires masking in logs */
  maskInLogs: boolean;
  /** Retention policy */
  retentionPolicy?: string;
  /** Access requires approval */
  accessRequiresApproval: boolean;
  /** Audit all access */
  auditAllAccess: boolean;
}

// =============================================================================
// DATA SCHEMA REGISTRY
// =============================================================================

export interface DataSchema {
  /** Schema ID */
  id: string;
  /** Schema name */
  name: string;
  /** Version */
  version: string;
  /** Owner */
  owner: string;
  /** Description */
  description: string;
  /** Fields */
  fields: DataField[];
  /** Classification */
  classification: DataClassification;
  /** Tags */
  tags: string[];
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
}

export interface DataField {
  /** Field name */
  name: string;
  /** Field type */
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  /** Description */
  description?: string;
  /** Required */
  required: boolean;
  /** Classification override */
  classification?: DataClassificationLevel;
  /** PII type if applicable */
  piiType?: PiiType;
  /** Validation rules */
  validation?: FieldValidation;
  /** Default value */
  defaultValue?: unknown;
}

export interface FieldValidation {
  /** Min length (strings) */
  minLength?: number;
  /** Max length (strings) */
  maxLength?: number;
  /** Pattern (regex) */
  pattern?: string;
  /** Min value (numbers) */
  min?: number;
  /** Max value (numbers) */
  max?: number;
  /** Allowed values */
  allowedValues?: unknown[];
}

// =============================================================================
// PII HANDLING
// =============================================================================

export const PiiTypes = {
  NAME: 'name',
  EMAIL: 'email',
  PHONE: 'phone',
  ADDRESS: 'address',
  SSN: 'ssn',
  DOB: 'date_of_birth',
  FINANCIAL_ACCOUNT: 'financial_account',
  IP_ADDRESS: 'ip_address',
  DEVICE_ID: 'device_id',
  BIOMETRIC: 'biometric',
  GENETIC: 'genetic',
  HEALTH: 'health',
  LOCATION: 'location',
  PHOTO: 'photo',
  GOVERNMENT_ID: 'government_id',
} as const;

export type PiiType = (typeof PiiTypes)[keyof typeof PiiTypes];

export interface PiiDetectionResult {
  /** Field name */
  fieldName: string;
  /** Detected PII type */
  piiType: PiiType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Sample value (masked) */
  maskedSample?: string;
  /** Detection method */
  detectionMethod: 'pattern' | 'ml' | 'dictionary' | 'manual';
}

export interface PiiPolicy {
  /** Policy ID */
  id: string;
  /** Policy name */
  name: string;
  /** PII type */
  piiType: PiiType;
  /** Handling rules */
  handling: PiiHandling;
  /** Jurisdictions this applies to */
  jurisdictions: string[];
  /** Enabled */
  enabled: boolean;
}

export interface PiiHandling {
  /** Masking strategy */
  maskingStrategy: 'full' | 'partial' | 'tokenize' | 'hash' | 'encrypt';
  /** Characters to show (for partial masking) */
  showChars?: number;
  /** Retention days (0 = delete immediately) */
  retentionDays: number;
  /** Require consent */
  requireConsent: boolean;
  /** Allow export */
  allowExport: boolean;
  /** Allow in logs */
  allowInLogs: boolean;
}

// =============================================================================
// DATA LINEAGE
// =============================================================================

export interface DataLineageNode {
  /** Node ID */
  id: string;
  /** Node type */
  type: 'source' | 'transform' | 'destination' | 'process';
  /** System name */
  system: string;
  /** Dataset/table name */
  dataset: string;
  /** Schema ID */
  schemaId?: string;
  /** Owner */
  owner?: string;
  /** Metadata */
  metadata: Record<string, unknown>;
}

export interface DataLineageEdge {
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Transformation type */
  transformationType?: 'copy' | 'aggregate' | 'filter' | 'join' | 'derive' | 'enrich';
  /** Field mappings */
  fieldMappings?: LineageFieldMapping[];
  /** Transformation description */
  description?: string;
}

export interface LineageFieldMapping {
  /** Source field */
  sourceField: string;
  /** Target field */
  targetField: string;
  /** Transformation */
  transformation?: string;
}

export interface DataLineageGraph {
  /** Graph ID */
  id: string;
  /** Nodes */
  nodes: DataLineageNode[];
  /** Edges */
  edges: DataLineageEdge[];
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
}

// =============================================================================
// ACCESS POLICIES
// =============================================================================

export interface DataAccessPolicy {
  /** Policy ID */
  id: string;
  /** Policy name */
  name: string;
  /** Description */
  description: string;
  /** Target schema IDs */
  schemaIds: string[];
  /** Target classification levels */
  classificationLevels?: DataClassificationLevel[];
  /** Rules */
  rules: AccessRule[];
  /** Priority (higher = evaluated first) */
  priority: number;
  /** Enabled */
  enabled: boolean;
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
}

export interface AccessRule {
  /** Rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Action */
  action: 'allow' | 'deny' | 'mask' | 'redact';
  /** Conditions */
  conditions: AccessCondition[];
  /** Fields to apply to (empty = all) */
  fields?: string[];
  /** Masking config if action is mask */
  maskingConfig?: MaskingConfig;
}

export interface AccessCondition {
  /** Condition type */
  type: 'role' | 'permission' | 'attribute' | 'time' | 'location' | 'purpose';
  /** Operator */
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'matches';
  /** Value */
  value: unknown;
}

export interface MaskingConfig {
  /** Masking type */
  type: 'full' | 'partial' | 'hash' | 'tokenize' | 'null';
  /** Show first N chars */
  showFirst?: number;
  /** Show last N chars */
  showLast?: number;
  /** Mask character */
  maskChar?: string;
}

// =============================================================================
// DATA QUALITY
// =============================================================================

export interface DataQualityRule {
  /** Rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Target schema ID */
  schemaId: string;
  /** Target field (null = row level) */
  fieldName?: string;
  /** Rule type */
  type: DataQualityRuleType;
  /** Rule configuration */
  config: Record<string, unknown>;
  /** Severity */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** Enabled */
  enabled: boolean;
}

export type DataQualityRuleType =
  | 'not_null'
  | 'unique'
  | 'range'
  | 'pattern'
  | 'referential'
  | 'completeness'
  | 'freshness'
  | 'consistency'
  | 'custom';

export interface DataQualityResult {
  /** Rule ID */
  ruleId: string;
  /** Rule name */
  ruleName: string;
  /** Schema ID */
  schemaId: string;
  /** Field name */
  fieldName?: string;
  /** Passed */
  passed: boolean;
  /** Total records checked */
  totalRecords: number;
  /** Records passed */
  passedRecords: number;
  /** Records failed */
  failedRecords: number;
  /** Pass percentage */
  passPercentage: number;
  /** Sample failures */
  sampleFailures?: unknown[];
  /** Execution time (ms) */
  executionTimeMs: number;
  /** Timestamp */
  timestamp: string;
}

export interface DataQualityReport {
  /** Report ID */
  id: string;
  /** Schema ID */
  schemaId: string;
  /** Run timestamp */
  timestamp: string;
  /** Overall score (0-100) */
  overallScore: number;
  /** Rule results */
  results: DataQualityResult[];
  /** Summary by dimension */
  dimensionScores: {
    completeness: number;
    accuracy: number;
    consistency: number;
    timeliness: number;
    uniqueness: number;
  };
}

// =============================================================================
// CONSENT MANAGEMENT
// =============================================================================

export interface ConsentRecord {
  /** Consent ID */
  id: string;
  /** Subject ID (user ID) */
  subjectId: string;
  /** Tenant ID */
  tenantId: string;
  /** Purpose */
  purpose: string;
  /** Data types consented to */
  dataTypes: string[];
  /** Consent status */
  status: 'granted' | 'denied' | 'withdrawn' | 'expired';
  /** Granted at */
  grantedAt?: string;
  /** Expires at */
  expiresAt?: string;
  /** Withdrawn at */
  withdrawnAt?: string;
  /** Collection method */
  collectionMethod: 'explicit' | 'implicit' | 'opt_out';
  /** Legal basis */
  legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interest' | 'public_task' | 'legitimate_interest';
  /** Version of terms */
  termsVersion: string;
  /** IP address at consent */
  ipAddress?: string;
  /** User agent at consent */
  userAgent?: string;
}

export interface ConsentPurpose {
  /** Purpose ID */
  id: string;
  /** Purpose name */
  name: string;
  /** Description */
  description: string;
  /** Required data types */
  requiredDataTypes: string[];
  /** Optional data types */
  optionalDataTypes: string[];
  /** Is required for service */
  isRequired: boolean;
  /** Default state */
  defaultState: 'granted' | 'denied';
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const DataClassificationSchema = z.object({
  level: z.enum(['public', 'internal', 'confidential', 'restricted', 'pii', 'phi', 'pci']),
  categories: z.array(z.enum(['personal', 'financial', 'health', 'behavioral', 'technical', 'operational', 'analytics'])),
  encryptionRequired: z.boolean(),
  transitEncryptionRequired: z.boolean(),
  maskInLogs: z.boolean(),
  retentionPolicy: z.string().optional(),
  accessRequiresApproval: z.boolean(),
  auditAllAccess: z.boolean(),
});

export const DataFieldSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'date', 'object', 'array']),
  description: z.string().optional(),
  required: z.boolean(),
  classification: z.enum(['public', 'internal', 'confidential', 'restricted', 'pii', 'phi', 'pci']).optional(),
  piiType: z.string().optional(),
  validation: z.object({
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().positive().optional(),
    pattern: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    allowedValues: z.array(z.unknown()).optional(),
  }).optional(),
  defaultValue: z.unknown().optional(),
});

export const DataSchemaSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  owner: z.string(),
  description: z.string(),
  fields: z.array(DataFieldSchema),
  classification: DataClassificationSchema,
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ConsentRecordSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  tenantId: z.string(),
  purpose: z.string(),
  dataTypes: z.array(z.string()),
  status: z.enum(['granted', 'denied', 'withdrawn', 'expired']),
  grantedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  withdrawnAt: z.string().datetime().optional(),
  collectionMethod: z.enum(['explicit', 'implicit', 'opt_out']),
  legalBasis: z.enum(['consent', 'contract', 'legal_obligation', 'vital_interest', 'public_task', 'legitimate_interest']),
  termsVersion: z.string(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

// =============================================================================
// DATA GOVERNANCE ENGINE
// =============================================================================

export interface DataGovernanceConfig {
  /** Default classification for new data */
  defaultClassification: DataClassificationLevel;
  /** Enable PII auto-detection */
  enablePiiDetection: boolean;
  /** PII detection confidence threshold */
  piiConfidenceThreshold: number;
  /** Enable data quality checks */
  enableQualityChecks: boolean;
  /** Consent required by default */
  consentRequiredByDefault: boolean;
}

/**
 * Data governance engine
 */
export class DataGovernanceEngine {
  private config: DataGovernanceConfig;
  private schemas: Map<string, DataSchema> = new Map();
  private accessPolicies: Map<string, DataAccessPolicy> = new Map();
  private qualityRules: Map<string, DataQualityRule[]> = new Map();
  private consents: Map<string, ConsentRecord[]> = new Map();
  private lineageGraph: DataLineageGraph | null = null;

  constructor(config: Partial<DataGovernanceConfig> = {}) {
    this.config = {
      defaultClassification: config.defaultClassification ?? 'internal',
      enablePiiDetection: config.enablePiiDetection ?? true,
      piiConfidenceThreshold: config.piiConfidenceThreshold ?? 0.8,
      enableQualityChecks: config.enableQualityChecks ?? true,
      consentRequiredByDefault: config.consentRequiredByDefault ?? true,
    };
  }

  // ---------------------------------------------------------------------------
  // Schema Management
  // ---------------------------------------------------------------------------

  /**
   * Register a data schema
   */
  registerSchema(schema: DataSchema): void {
    this.schemas.set(schema.id, schema);
  }

  /**
   * Get schema by ID
   */
  getSchema(id: string): DataSchema | undefined {
    return this.schemas.get(id);
  }

  /**
   * List all schemas
   */
  listSchemas(): DataSchema[] {
    return Array.from(this.schemas.values());
  }

  /**
   * Detect PII in schema fields
   */
  detectPii(schema: DataSchema): PiiDetectionResult[] {
    // Check if PII detection is enabled
    if (!this.config.enablePiiDetection) {
      return [];
    }

    const results: PiiDetectionResult[] = [];

    for (const field of schema.fields) {
      const detected = this.detectPiiInField(field);
      // Filter by confidence threshold
      if (detected && detected.confidence >= this.config.piiConfidenceThreshold) {
        results.push(detected);
      }
    }

    return results;
  }

  private detectPiiInField(field: DataField): PiiDetectionResult | null {
    const namePatterns: Record<string, PiiType> = {
      'email': 'email',
      'e_mail': 'email',
      'mail': 'email',
      'phone': 'phone',
      'telephone': 'phone',
      'mobile': 'phone',
      'ssn': 'ssn',
      'social_security': 'ssn',
      'name': 'name',
      'first_name': 'name',
      'last_name': 'name',
      'full_name': 'name',
      'address': 'address',
      'street': 'address',
      'city': 'address',
      'zip': 'address',
      'postal': 'address',
      'dob': 'date_of_birth',
      'date_of_birth': 'date_of_birth',
      'birth_date': 'date_of_birth',
      'ip': 'ip_address',
      'ip_address': 'ip_address',
      'device_id': 'device_id',
      'credit_card': 'financial_account',
      'account_number': 'financial_account',
      'passport': 'government_id',
      'license': 'government_id',
    };

    const fieldNameLower = field.name.toLowerCase();

    for (const [pattern, piiType] of Object.entries(namePatterns)) {
      if (fieldNameLower.includes(pattern)) {
        return {
          fieldName: field.name,
          piiType,
          confidence: 0.9,
          detectionMethod: 'pattern',
        };
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Access Policy Management
  // ---------------------------------------------------------------------------

  /**
   * Register an access policy
   */
  registerAccessPolicy(policy: DataAccessPolicy): void {
    this.accessPolicies.set(policy.id, policy);
  }

  /**
   * Get access policy by ID
   */
  getAccessPolicy(id: string): DataAccessPolicy | undefined {
    return this.accessPolicies.get(id);
  }

  /**
   * Evaluate access for a user
   */
  evaluateAccess(
    schemaId: string,
    userContext: {
      roles: string[];
      permissions: string[];
      attributes: Record<string, unknown>;
    },
    _operation: 'read' | 'write' | 'delete'
  ): AccessEvaluationResult {
    const schema = this.schemas.get(schemaId);
    if (!schema) {
      return {
        allowed: false,
        reason: 'Schema not found',
        maskedFields: [],
        redactedFields: [],
      };
    }

    const applicablePolicies = Array.from(this.accessPolicies.values())
      .filter(p => p.enabled && p.schemaIds.includes(schemaId))
      .sort((a, b) => b.priority - a.priority);

    const maskedFields: string[] = [];
    const redactedFields: string[] = [];
    let allowed = true;
    let reason = 'Access granted';

    for (const policy of applicablePolicies) {
      for (const rule of policy.rules) {
        const matches = this.evaluateConditions(rule.conditions, userContext);
        if (!matches) continue;

        switch (rule.action) {
          case 'deny':
            return {
              allowed: false,
              reason: `Denied by policy: ${policy.name}, rule: ${rule.name}`,
              maskedFields: [],
              redactedFields: [],
            };
          case 'mask':
            if (rule.fields) {
              maskedFields.push(...rule.fields);
            }
            break;
          case 'redact':
            if (rule.fields) {
              redactedFields.push(...rule.fields);
            }
            break;
          case 'allow':
            // Continue checking other rules
            break;
        }
      }
    }

    // Check classification-based access
    if (schema.classification.accessRequiresApproval) {
      if (!userContext.permissions.includes('data:approve')) {
        allowed = false;
        reason = 'Access requires approval for this classification level';
      }
    }

    return {
      allowed,
      reason,
      maskedFields: [...new Set(maskedFields)],
      redactedFields: [...new Set(redactedFields)],
    };
  }

  private evaluateConditions(
    conditions: AccessCondition[],
    userContext: { roles: string[]; permissions: string[]; attributes: Record<string, unknown> }
  ): boolean {
    return conditions.every(cond => {
      let actualValue: unknown;

      switch (cond.type) {
        case 'role':
          actualValue = userContext.roles;
          break;
        case 'permission':
          actualValue = userContext.permissions;
          break;
        case 'attribute':
          actualValue = userContext.attributes;
          break;
        default:
          return false;
      }

      switch (cond.operator) {
        case 'equals':
          return actualValue === cond.value;
        case 'not_equals':
          return actualValue !== cond.value;
        case 'in':
          return Array.isArray(actualValue) && Array.isArray(cond.value) &&
            cond.value.some(v => actualValue.includes(v));
        case 'not_in':
          return Array.isArray(actualValue) && Array.isArray(cond.value) &&
            !cond.value.some(v => actualValue.includes(v));
        case 'contains':
          return Array.isArray(actualValue) && actualValue.includes(cond.value);
        default:
          return false;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Data Quality
  // ---------------------------------------------------------------------------

  /**
   * Register quality rules for a schema
   */
  registerQualityRules(schemaId: string, rules: DataQualityRule[]): void {
    this.qualityRules.set(schemaId, rules);
  }

  /**
   * Run quality checks
   */
  runQualityChecks(
    schemaId: string,
    data: Record<string, unknown>[]
  ): DataQualityReport {
    const rules = this.qualityRules.get(schemaId) ?? [];
    const results: DataQualityResult[] = [];
    let totalScore = 0;

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const result = this.evaluateQualityRule(rule, data);
      results.push(result);
      totalScore += result.passPercentage;
    }

    const overallScore = rules.length > 0 ? totalScore / rules.length : 100;

    return {
      id: `qr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      schemaId,
      timestamp: new Date().toISOString(),
      overallScore,
      results,
      dimensionScores: this.calculateDimensionScores(results),
    };
  }

  private evaluateQualityRule(
    rule: DataQualityRule,
    data: Record<string, unknown>[]
  ): DataQualityResult {
    const startTime = Date.now();
    let passed = 0;
    let failed = 0;
    const sampleFailures: unknown[] = [];

    for (const record of data) {
      const value = rule.fieldName ? record[rule.fieldName] : record;
      const isValid = this.checkQualityRule(rule, value);

      if (isValid) {
        passed++;
      } else {
        failed++;
        if (sampleFailures.length < 5) {
          sampleFailures.push(value);
        }
      }
    }

    const total = passed + failed;
    const passPercentage = total > 0 ? (passed / total) * 100 : 100;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      schemaId: rule.schemaId,
      fieldName: rule.fieldName,
      passed: passPercentage >= 95,
      totalRecords: total,
      passedRecords: passed,
      failedRecords: failed,
      passPercentage,
      sampleFailures: sampleFailures.length > 0 ? sampleFailures : undefined,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  private checkQualityRule(rule: DataQualityRule, value: unknown): boolean {
    switch (rule.type) {
      case 'not_null':
        return value !== null && value !== undefined;
      case 'unique':
        // Would need to track seen values - simplified here
        return true;
      case 'range': {
        const min = rule.config.min as number | undefined;
        const max = rule.config.max as number | undefined;
        if (typeof value !== 'number') return false;
        if (min !== undefined && value < min) return false;
        if (max !== undefined && value > max) return false;
        return true;
      }
      case 'pattern':
        if (typeof value !== 'string') return false;
        const pattern = rule.config.pattern as string;
        return new RegExp(pattern).test(value);
      default:
        return true;
    }
  }

  private calculateDimensionScores(results: DataQualityResult[]): DataQualityReport['dimensionScores'] {
    // Simplified dimension scoring
    const avg = results.length > 0
      ? results.reduce((sum, r) => sum + r.passPercentage, 0) / results.length
      : 100;

    return {
      completeness: avg,
      accuracy: avg,
      consistency: avg,
      timeliness: 100,
      uniqueness: avg,
    };
  }

  // ---------------------------------------------------------------------------
  // Consent Management
  // ---------------------------------------------------------------------------

  /**
   * Record consent
   */
  recordConsent(consent: ConsentRecord): void {
    const existing = this.consents.get(consent.subjectId) ?? [];
    existing.push(consent);
    this.consents.set(consent.subjectId, existing);
  }

  /**
   * Check consent for a subject
   */
  checkConsent(subjectId: string, purpose: string, dataType: string): boolean {
    const consents = this.consents.get(subjectId) ?? [];
    const activeConsent = consents.find(c =>
      c.purpose === purpose &&
      c.dataTypes.includes(dataType) &&
      c.status === 'granted' &&
      (!c.expiresAt || new Date(c.expiresAt) > new Date())
    );

    return !!activeConsent;
  }

  /**
   * Withdraw consent
   */
  withdrawConsent(subjectId: string, purpose: string): void {
    const consents = this.consents.get(subjectId) ?? [];
    for (const consent of consents) {
      if (consent.purpose === purpose && consent.status === 'granted') {
        consent.status = 'withdrawn';
        consent.withdrawnAt = new Date().toISOString();
      }
    }
  }

  /**
   * Get all consents for a subject
   */
  getSubjectConsents(subjectId: string): ConsentRecord[] {
    return this.consents.get(subjectId) ?? [];
  }

  // ---------------------------------------------------------------------------
  // Data Lineage
  // ---------------------------------------------------------------------------

  /**
   * Initialize lineage graph
   */
  initializeLineageGraph(nodes: DataLineageNode[], edges: DataLineageEdge[]): void {
    this.lineageGraph = {
      id: `lg_${Date.now()}`,
      nodes,
      edges,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Add lineage node
   */
  addLineageNode(node: DataLineageNode): void {
    if (!this.lineageGraph) {
      this.lineageGraph = {
        id: `lg_${Date.now()}`,
        nodes: [],
        edges: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    this.lineageGraph.nodes.push(node);
    this.lineageGraph.updatedAt = new Date().toISOString();
  }

  /**
   * Add lineage edge
   */
  addLineageEdge(edge: DataLineageEdge): void {
    if (!this.lineageGraph) {
      throw new Error('Lineage graph not initialized');
    }
    this.lineageGraph.edges.push(edge);
    this.lineageGraph.updatedAt = new Date().toISOString();
  }

  /**
   * Get upstream lineage for a node
   */
  getUpstreamLineage(nodeId: string): DataLineageNode[] {
    if (!this.lineageGraph) return [];

    const upstream: DataLineageNode[] = [];
    const visited = new Set<string>();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const incomingEdges = this.lineageGraph.edges.filter(e => e.targetId === current);
      for (const edge of incomingEdges) {
        const sourceNode = this.lineageGraph.nodes.find(n => n.id === edge.sourceId);
        if (sourceNode && !visited.has(sourceNode.id)) {
          upstream.push(sourceNode);
          queue.push(sourceNode.id);
        }
      }
    }

    return upstream;
  }

  /**
   * Get downstream lineage for a node
   */
  getDownstreamLineage(nodeId: string): DataLineageNode[] {
    if (!this.lineageGraph) return [];

    const downstream: DataLineageNode[] = [];
    const visited = new Set<string>();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const outgoingEdges = this.lineageGraph.edges.filter(e => e.sourceId === current);
      for (const edge of outgoingEdges) {
        const targetNode = this.lineageGraph.nodes.find(n => n.id === edge.targetId);
        if (targetNode && !visited.has(targetNode.id)) {
          downstream.push(targetNode);
          queue.push(targetNode.id);
        }
      }
    }

    return downstream;
  }

  /**
   * Get lineage graph
   */
  getLineageGraph(): DataLineageGraph | null {
    return this.lineageGraph;
  }

  // ---------------------------------------------------------------------------
  // Masking
  // ---------------------------------------------------------------------------

  /**
   * Mask a value based on config
   */
  maskValue(value: unknown, config: MaskingConfig): unknown {
    if (value === null || value === undefined) return value;

    switch (config.type) {
      case 'full':
        if (typeof value === 'string') {
          return (config.maskChar ?? '*').repeat(value.length);
        }
        return '***';
      case 'partial':
        if (typeof value === 'string') {
          const showFirst = config.showFirst ?? 0;
          const showLast = config.showLast ?? 0;
          const maskChar = config.maskChar ?? '*';
          const maskLength = Math.max(0, value.length - showFirst - showLast);
          return (
            value.slice(0, showFirst) +
            maskChar.repeat(maskLength) +
            value.slice(-showLast || value.length)
          );
        }
        return '***';
      case 'hash':
        // Simple hash for demo
        return `hashed_${typeof value === 'string' ? value.length : 0}`;
      case 'tokenize':
        return `tok_${Math.random().toString(36).slice(2, 10)}`;
      case 'null':
        return null;
      default:
        return '***';
    }
  }

  /**
   * Mask record based on schema and access evaluation
   */
  maskRecord(
    record: Record<string, unknown>,
    _schemaId: string,
    evaluation: AccessEvaluationResult
  ): Record<string, unknown> {
    const result = { ...record };

    for (const field of evaluation.maskedFields) {
      if (field in result) {
        result[field] = this.maskValue(result[field], { type: 'partial', showFirst: 2, showLast: 2 });
      }
    }

    for (const field of evaluation.redactedFields) {
      if (field in result) {
        result[field] = '[REDACTED]';
      }
    }

    return result;
  }
}

export interface AccessEvaluationResult {
  /** Access allowed */
  allowed: boolean;
  /** Reason */
  reason: string;
  /** Fields to mask */
  maskedFields: string[];
  /** Fields to redact */
  redactedFields: string[];
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create data governance engine
 */
export function createDataGovernanceEngine(config?: Partial<DataGovernanceConfig>): DataGovernanceEngine {
  return new DataGovernanceEngine(config);
}

/**
 * Create default classification for a level
 */
export function createClassification(level: DataClassificationLevel): DataClassification {
  const defaults: Record<DataClassificationLevel, Partial<DataClassification>> = {
    public: {
      encryptionRequired: false,
      transitEncryptionRequired: true,
      maskInLogs: false,
      accessRequiresApproval: false,
      auditAllAccess: false,
    },
    internal: {
      encryptionRequired: false,
      transitEncryptionRequired: true,
      maskInLogs: false,
      accessRequiresApproval: false,
      auditAllAccess: false,
    },
    confidential: {
      encryptionRequired: true,
      transitEncryptionRequired: true,
      maskInLogs: true,
      accessRequiresApproval: false,
      auditAllAccess: true,
    },
    restricted: {
      encryptionRequired: true,
      transitEncryptionRequired: true,
      maskInLogs: true,
      accessRequiresApproval: true,
      auditAllAccess: true,
    },
    pii: {
      encryptionRequired: true,
      transitEncryptionRequired: true,
      maskInLogs: true,
      accessRequiresApproval: false,
      auditAllAccess: true,
    },
    phi: {
      encryptionRequired: true,
      transitEncryptionRequired: true,
      maskInLogs: true,
      accessRequiresApproval: true,
      auditAllAccess: true,
    },
    pci: {
      encryptionRequired: true,
      transitEncryptionRequired: true,
      maskInLogs: true,
      accessRequiresApproval: true,
      auditAllAccess: true,
    },
  };

  return {
    level,
    categories: [],
    ...defaults[level],
  } as DataClassification;
}
