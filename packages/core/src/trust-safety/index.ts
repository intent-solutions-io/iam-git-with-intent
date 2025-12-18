/**
 * Trust & Safety Module
 *
 * Phase 43: Connector vulnerability scanning, reputation scoring, and trust signals.
 * Provides security analysis and trust management for the connector ecosystem.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Severity levels for vulnerabilities
 */
export type VulnerabilitySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Vulnerability status
 */
export type VulnerabilityStatus = 'open' | 'fixed' | 'mitigated' | 'accepted' | 'false_positive';

/**
 * Trust level for connectors
 */
export type TrustLevel = 'verified' | 'trusted' | 'community' | 'untrusted' | 'blocked';

/**
 * Vulnerability record
 */
export interface Vulnerability {
  id: string;
  connectorId: string;
  version: string;
  severity: VulnerabilitySeverity;
  status: VulnerabilityStatus;
  cveId?: string;
  title: string;
  description: string;
  affectedVersions: string[];
  fixedVersion?: string;
  cvssScore?: number;
  vector?: string;
  discoveredAt: Date;
  reportedBy?: string;
  references: string[];
  mitigation?: string;
}

/**
 * Vulnerability scan result
 */
export interface VulnerabilityScanResult {
  connectorId: string;
  version: string;
  scannedAt: Date;
  scanDurationMs: number;
  vulnerabilities: Vulnerability[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  riskScore: number;
  recommendations: string[];
}

/**
 * Trust signal types
 */
export type TrustSignalType =
  | 'code_review'
  | 'security_audit'
  | 'vulnerability_scan'
  | 'usage_metrics'
  | 'author_verification'
  | 'community_rating'
  | 'official_endorsement'
  | 'compliance_check';

/**
 * Trust signal
 */
export interface TrustSignal {
  id: string;
  type: TrustSignalType;
  connectorId: string;
  value: number; // 0-100
  weight: number; // Importance factor 0-1
  source: string;
  evidence?: Record<string, unknown>;
  validUntil?: Date;
  createdAt: Date;
}

/**
 * Connector reputation
 */
export interface ConnectorReputation {
  connectorId: string;
  trustLevel: TrustLevel;
  overallScore: number; // 0-100
  signals: TrustSignal[];
  vulnerabilityHistory: {
    total: number;
    critical: number;
    avgTimeToFix: number; // days
  };
  usageStats: {
    totalInstalls: number;
    activeInstances: number;
    errorRate: number;
  };
  lastUpdated: Date;
}

/**
 * Security policy for connectors
 */
export interface ConnectorSecurityPolicy {
  id: string;
  tenantId: string;
  name: string;
  minTrustLevel: TrustLevel;
  maxVulnerabilitySeverity: VulnerabilitySeverity;
  blockUnscanned: boolean;
  autoUpdate: boolean;
  requiredSignals: TrustSignalType[];
  allowedConnectors: string[];
  blockedConnectors: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Policy evaluation result
 */
export interface PolicyEvaluationResult {
  allowed: boolean;
  connectorId: string;
  version: string;
  violations: {
    type: string;
    message: string;
    severity: VulnerabilitySeverity;
  }[];
  warnings: string[];
  recommendations: string[];
}

// =============================================================================
// Vulnerability Store Interface
// =============================================================================

/**
 * Store for vulnerability data
 */
export interface VulnerabilityStore {
  record(vuln: Omit<Vulnerability, 'id' | 'discoveredAt'>): Promise<Vulnerability>;
  get(id: string): Promise<Vulnerability | null>;
  getByConnector(connectorId: string, version?: string): Promise<Vulnerability[]>;
  update(id: string, updates: Partial<Vulnerability>): Promise<Vulnerability>;
  scan(connectorId: string, version: string): Promise<VulnerabilityScanResult>;
}

/**
 * Store for reputation data
 */
export interface ReputationStore {
  get(connectorId: string): Promise<ConnectorReputation | null>;
  update(connectorId: string, updates: Partial<ConnectorReputation>): Promise<ConnectorReputation>;
  addSignal(connectorId: string, signal: Omit<TrustSignal, 'id' | 'createdAt'>): Promise<TrustSignal>;
  calculateScore(connectorId: string): Promise<number>;
}

// =============================================================================
// In-Memory Vulnerability Store
// =============================================================================

/**
 * In-memory vulnerability store for development
 */
export class InMemoryVulnerabilityStore implements VulnerabilityStore {
  private vulnerabilities = new Map<string, Vulnerability>();
  private counter = 0;

  async record(vuln: Omit<Vulnerability, 'id' | 'discoveredAt'>): Promise<Vulnerability> {
    const id = `vuln_${++this.counter}`;
    const vulnerability: Vulnerability = {
      ...vuln,
      id,
      discoveredAt: new Date(),
    };
    this.vulnerabilities.set(id, vulnerability);
    return vulnerability;
  }

  async get(id: string): Promise<Vulnerability | null> {
    return this.vulnerabilities.get(id) || null;
  }

  async getByConnector(connectorId: string, version?: string): Promise<Vulnerability[]> {
    return Array.from(this.vulnerabilities.values()).filter(
      (v) =>
        v.connectorId === connectorId && (!version || v.affectedVersions.includes(version))
    );
  }

  async update(id: string, updates: Partial<Vulnerability>): Promise<Vulnerability> {
    const existing = this.vulnerabilities.get(id);
    if (!existing) {
      throw new Error(`Vulnerability ${id} not found`);
    }
    const updated = { ...existing, ...updates };
    this.vulnerabilities.set(id, updated);
    return updated;
  }

  async scan(connectorId: string, version: string): Promise<VulnerabilityScanResult> {
    const startTime = Date.now();
    const vulnerabilities = await this.getByConnector(connectorId, version);
    const openVulns = vulnerabilities.filter((v) => v.status === 'open');

    const summary = {
      total: openVulns.length,
      critical: openVulns.filter((v) => v.severity === 'critical').length,
      high: openVulns.filter((v) => v.severity === 'high').length,
      medium: openVulns.filter((v) => v.severity === 'medium').length,
      low: openVulns.filter((v) => v.severity === 'low').length,
      info: openVulns.filter((v) => v.severity === 'info').length,
    };

    // Calculate risk score (0-100, higher is worse)
    const riskScore = Math.min(
      100,
      summary.critical * 25 + summary.high * 15 + summary.medium * 8 + summary.low * 3 + summary.info
    );

    const recommendations: string[] = [];
    if (summary.critical > 0) {
      recommendations.push('Immediate action required: Critical vulnerabilities detected');
    }
    if (summary.high > 0) {
      recommendations.push('Update to latest version to address high severity issues');
    }
    if (riskScore > 50) {
      recommendations.push('Consider using an alternative connector with better security posture');
    }

    return {
      connectorId,
      version,
      scannedAt: new Date(),
      scanDurationMs: Date.now() - startTime,
      vulnerabilities: openVulns,
      summary,
      riskScore,
      recommendations,
    };
  }
}

// =============================================================================
// In-Memory Reputation Store
// =============================================================================

/**
 * In-memory reputation store for development
 */
export class InMemoryReputationStore implements ReputationStore {
  private reputations = new Map<string, ConnectorReputation>();
  private signals = new Map<string, TrustSignal[]>();
  private signalCounter = 0;

  async get(connectorId: string): Promise<ConnectorReputation | null> {
    return this.reputations.get(connectorId) || null;
  }

  async update(
    connectorId: string,
    updates: Partial<ConnectorReputation>
  ): Promise<ConnectorReputation> {
    const existing = this.reputations.get(connectorId) || this.createDefault(connectorId);
    const updated: ConnectorReputation = {
      ...existing,
      ...updates,
      connectorId,
      lastUpdated: new Date(),
    };
    this.reputations.set(connectorId, updated);
    return updated;
  }

  async addSignal(
    connectorId: string,
    signal: Omit<TrustSignal, 'id' | 'createdAt'>
  ): Promise<TrustSignal> {
    const id = `sig_${++this.signalCounter}`;
    const trustSignal: TrustSignal = {
      ...signal,
      id,
      connectorId,
      createdAt: new Date(),
    };

    const connectorSignals = this.signals.get(connectorId) || [];
    connectorSignals.push(trustSignal);
    this.signals.set(connectorId, connectorSignals);

    // Update reputation with new signal
    const reputation = await this.get(connectorId);
    if (reputation) {
      reputation.signals.push(trustSignal);
      reputation.lastUpdated = new Date();
      this.reputations.set(connectorId, reputation);
    }

    return trustSignal;
  }

  async calculateScore(connectorId: string): Promise<number> {
    const connectorSignals = this.signals.get(connectorId) || [];
    if (connectorSignals.length === 0) {
      return 50; // Default neutral score
    }

    // Filter expired signals
    const validSignals = connectorSignals.filter(
      (s) => !s.validUntil || s.validUntil > new Date()
    );

    if (validSignals.length === 0) {
      return 50;
    }

    // Weighted average
    let totalWeight = 0;
    let weightedSum = 0;

    for (const signal of validSignals) {
      totalWeight += signal.weight;
      weightedSum += signal.value * signal.weight;
    }

    return Math.round(weightedSum / totalWeight);
  }

  private createDefault(connectorId: string): ConnectorReputation {
    return {
      connectorId,
      trustLevel: 'community',
      overallScore: 50,
      signals: this.signals.get(connectorId) || [],
      vulnerabilityHistory: {
        total: 0,
        critical: 0,
        avgTimeToFix: 0,
      },
      usageStats: {
        totalInstalls: 0,
        activeInstances: 0,
        errorRate: 0,
      },
      lastUpdated: new Date(),
    };
  }
}

// =============================================================================
// Trust Manager
// =============================================================================

/**
 * Configuration for Trust Manager
 */
export interface TrustManagerConfig {
  defaultPolicy?: Partial<ConnectorSecurityPolicy>;
  scoringWeights?: Record<TrustSignalType, number>;
}

/**
 * Default scoring weights for trust signals
 */
export const DEFAULT_SCORING_WEIGHTS: Record<TrustSignalType, number> = {
  security_audit: 0.25,
  code_review: 0.2,
  vulnerability_scan: 0.2,
  official_endorsement: 0.15,
  author_verification: 0.1,
  community_rating: 0.05,
  usage_metrics: 0.03,
  compliance_check: 0.02,
};

/**
 * Trust level thresholds
 */
export const TRUST_LEVEL_THRESHOLDS: Record<TrustLevel, number> = {
  verified: 90,
  trusted: 75,
  community: 50,
  untrusted: 25,
  blocked: 0,
};

/**
 * Trust Manager - manages connector reputation and security policies
 */
export class TrustManager {
  private vulnerabilityStore: VulnerabilityStore;
  private reputationStore: ReputationStore;
  private policies = new Map<string, ConnectorSecurityPolicy>();
  private config: TrustManagerConfig;
  private policyCounter = 0;

  constructor(
    vulnerabilityStore: VulnerabilityStore,
    reputationStore: ReputationStore,
    config: TrustManagerConfig = {}
  ) {
    this.vulnerabilityStore = vulnerabilityStore;
    this.reputationStore = reputationStore;
    this.config = config;
  }

  /**
   * Scan connector for vulnerabilities
   */
  async scanConnector(connectorId: string, version: string): Promise<VulnerabilityScanResult> {
    const result = await this.vulnerabilityStore.scan(connectorId, version);

    // Add scan signal to reputation
    await this.reputationStore.addSignal(connectorId, {
      type: 'vulnerability_scan',
      connectorId,
      value: Math.max(0, 100 - result.riskScore),
      weight: this.config.scoringWeights?.vulnerability_scan || DEFAULT_SCORING_WEIGHTS.vulnerability_scan,
      source: 'internal_scanner',
      evidence: { scanResult: result.summary },
    });

    // Update reputation score
    await this.updateReputationScore(connectorId);

    return result;
  }

  /**
   * Get connector reputation
   */
  async getReputation(connectorId: string): Promise<ConnectorReputation | null> {
    return this.reputationStore.get(connectorId);
  }

  /**
   * Add trust signal for connector
   */
  async addTrustSignal(
    connectorId: string,
    type: TrustSignalType,
    value: number,
    source: string,
    evidence?: Record<string, unknown>,
    validUntil?: Date
  ): Promise<TrustSignal> {
    const weight = this.config.scoringWeights?.[type] || DEFAULT_SCORING_WEIGHTS[type];

    const signal = await this.reputationStore.addSignal(connectorId, {
      type,
      connectorId,
      value: Math.max(0, Math.min(100, value)),
      weight,
      source,
      evidence,
      validUntil,
    });

    await this.updateReputationScore(connectorId);

    return signal;
  }

  /**
   * Update reputation score and trust level
   */
  async updateReputationScore(connectorId: string): Promise<ConnectorReputation> {
    const score = await this.reputationStore.calculateScore(connectorId);
    const trustLevel = this.scoreToTrustLevel(score);

    return this.reputationStore.update(connectorId, {
      overallScore: score,
      trustLevel,
    });
  }

  /**
   * Create security policy
   */
  async createPolicy(policy: Omit<ConnectorSecurityPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<ConnectorSecurityPolicy> {
    const id = `policy_${++this.policyCounter}`;
    const securityPolicy: ConnectorSecurityPolicy = {
      ...policy,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.policies.set(id, securityPolicy);
    return securityPolicy;
  }

  /**
   * Get policy by ID
   */
  async getPolicy(id: string): Promise<ConnectorSecurityPolicy | null> {
    return this.policies.get(id) || null;
  }

  /**
   * Get policies for tenant
   */
  async getPoliciesForTenant(tenantId: string): Promise<ConnectorSecurityPolicy[]> {
    return Array.from(this.policies.values()).filter((p) => p.tenantId === tenantId);
  }

  /**
   * Evaluate connector against security policy
   */
  async evaluatePolicy(
    policyId: string,
    connectorId: string,
    version: string
  ): Promise<PolicyEvaluationResult> {
    const policy = await this.getPolicy(policyId);
    if (!policy) {
      throw new Error(`Policy ${policyId} not found`);
    }

    const violations: PolicyEvaluationResult['violations'] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check blocked connectors
    if (policy.blockedConnectors.includes(connectorId)) {
      violations.push({
        type: 'blocked_connector',
        message: `Connector ${connectorId} is explicitly blocked by policy`,
        severity: 'critical',
      });
    }

    // Check allowed connectors (if list is non-empty)
    if (
      policy.allowedConnectors.length > 0 &&
      !policy.allowedConnectors.includes(connectorId)
    ) {
      violations.push({
        type: 'not_allowed',
        message: `Connector ${connectorId} is not in the allowed list`,
        severity: 'high',
      });
    }

    // Get reputation
    const reputation = await this.getReputation(connectorId);

    // Check trust level
    if (reputation) {
      const requiredLevel = TRUST_LEVEL_THRESHOLDS[policy.minTrustLevel];
      if (reputation.overallScore < requiredLevel) {
        violations.push({
          type: 'insufficient_trust',
          message: `Connector trust level ${reputation.trustLevel} (${reputation.overallScore}) is below required ${policy.minTrustLevel} (${requiredLevel})`,
          severity: 'high',
        });
      }

      // Check required signals
      const signalTypes = new Set(reputation.signals.map((s) => s.type));
      for (const required of policy.requiredSignals) {
        if (!signalTypes.has(required)) {
          warnings.push(`Missing required trust signal: ${required}`);
        }
      }
    } else if (policy.blockUnscanned) {
      violations.push({
        type: 'unscanned',
        message: `Connector ${connectorId} has no reputation data and policy blocks unscanned connectors`,
        severity: 'medium',
      });
    } else {
      warnings.push('Connector has no reputation data - consider running a security scan');
    }

    // Scan for vulnerabilities
    const scanResult = await this.vulnerabilityStore.scan(connectorId, version);
    const severityOrder: VulnerabilitySeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
    const maxAllowedIndex = severityOrder.indexOf(policy.maxVulnerabilitySeverity);

    for (const severity of severityOrder.slice(0, maxAllowedIndex)) {
      const count = scanResult.summary[severity];
      if (count > 0) {
        violations.push({
          type: 'vulnerability',
          message: `${count} ${severity} severity vulnerabilities found`,
          severity,
        });
      }
    }

    recommendations.push(...scanResult.recommendations);

    if (policy.autoUpdate && scanResult.vulnerabilities.some((v) => v.fixedVersion)) {
      recommendations.push('Auto-update is enabled - consider updating to patched version');
    }

    return {
      allowed: violations.length === 0,
      connectorId,
      version,
      violations,
      warnings,
      recommendations,
    };
  }

  /**
   * Convert score to trust level
   */
  private scoreToTrustLevel(score: number): TrustLevel {
    if (score >= TRUST_LEVEL_THRESHOLDS.verified) return 'verified';
    if (score >= TRUST_LEVEL_THRESHOLDS.trusted) return 'trusted';
    if (score >= TRUST_LEVEL_THRESHOLDS.community) return 'community';
    if (score >= TRUST_LEVEL_THRESHOLDS.untrusted) return 'untrusted';
    return 'blocked';
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a Trust Manager with in-memory stores
 */
export function createTrustManager(config: TrustManagerConfig = {}): TrustManager {
  return new TrustManager(
    new InMemoryVulnerabilityStore(),
    new InMemoryReputationStore(),
    config
  );
}

/**
 * Create a vulnerability scanner
 */
export function createVulnerabilityScanner(): InMemoryVulnerabilityStore {
  return new InMemoryVulnerabilityStore();
}

/**
 * Create a reputation store
 */
export function createReputationStore(): InMemoryReputationStore {
  return new InMemoryReputationStore();
}
