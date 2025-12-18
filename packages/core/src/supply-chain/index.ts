/**
 * Supply Chain Security Module
 *
 * Phase 49: Dependency scanning, SBOM generation, and supply chain security.
 * Provides comprehensive security analysis for software dependencies.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Dependency type (prefixed to avoid conflict with orchestration-v2)
 */
export type SupplyChainDepType = 'direct' | 'transitive' | 'dev' | 'optional' | 'peer';

/**
 * License risk level
 */
export type LicenseRisk = 'none' | 'low' | 'medium' | 'high' | 'critical' | 'unknown';

/**
 * SBOM format
 */
export type SBOMFormat = 'cyclonedx' | 'spdx' | 'swid';

/**
 * Dependency information
 */
export interface Dependency {
  name: string;
  version: string;
  type: SupplyChainDepType;
  ecosystem: 'npm' | 'pypi' | 'maven' | 'go' | 'cargo' | 'nuget';
  license?: string;
  licenseRisk: LicenseRisk;
  source?: string;
  checksum?: string;
  dependencies: string[]; // Transitive deps
}

/**
 * Vulnerability finding
 */
export interface VulnerabilityFinding {
  id: string;
  cveId?: string;
  ghsaId?: string;
  dependencyName: string;
  dependencyVersion: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  fixedVersions: string[];
  publishedAt: Date;
  references: string[];
  cvssScore?: number;
  exploitAvailable?: boolean;
}

/**
 * SBOM (Software Bill of Materials)
 */
export interface SBOM {
  id: string;
  format: SBOMFormat;
  version: string;
  createdAt: Date;
  projectName: string;
  projectVersion: string;
  dependencies: Dependency[];
  metadata: {
    tool: string;
    toolVersion: string;
    generator: string;
  };
  signature?: string;
}

/**
 * Supply chain scan result
 */
export interface SupplyChainScanResult {
  id: string;
  projectId: string;
  scannedAt: Date;
  durationMs: number;
  sbom: SBOM;
  vulnerabilities: VulnerabilityFinding[];
  licenseIssues: LicenseIssue[];
  summary: {
    totalDependencies: number;
    directDependencies: number;
    transitDependencies: number;
    vulnerableCount: number;
    criticalCount: number;
    highCount: number;
    licenseIssueCount: number;
  };
  riskScore: number;
  recommendations: string[];
}

/**
 * License issue
 */
export interface LicenseIssue {
  dependencyName: string;
  dependencyVersion: string;
  license: string;
  risk: LicenseRisk;
  reason: string;
  recommendation: string;
}

/**
 * Allowed license policy
 */
export interface LicensePolicy {
  id: string;
  tenantId: string;
  name: string;
  allowedLicenses: string[];
  blockedLicenses: string[];
  requireApprovalLicenses: string[];
  enabled: boolean;
  createdAt: Date;
}

/**
 * Dependency update
 */
export interface DependencyUpdate {
  dependencyName: string;
  currentVersion: string;
  latestVersion: string;
  recommendedVersion: string;
  updateType: 'major' | 'minor' | 'patch';
  breakingChanges: boolean;
  vulnerabilitiesFixed: string[];
  releaseDate?: Date;
}

// =============================================================================
// Store Interfaces
// =============================================================================

/**
 * SBOM store
 */
export interface SBOMStore {
  save(sbom: SBOM): Promise<SBOM>;
  get(id: string): Promise<SBOM | null>;
  getLatest(projectId: string): Promise<SBOM | null>;
  list(projectId: string): Promise<SBOM[]>;
  compare(sbomId1: string, sbomId2: string): Promise<SBOMDiff>;
}

/**
 * SBOM diff result
 */
export interface SBOMDiff {
  added: Dependency[];
  removed: Dependency[];
  changed: Array<{
    name: string;
    oldVersion: string;
    newVersion: string;
  }>;
}

/**
 * Vulnerability database
 */
export interface VulnerabilityDatabase {
  query(name: string, version: string): Promise<VulnerabilityFinding[]>;
  getById(cveId: string): Promise<VulnerabilityFinding | null>;
  update(): Promise<{ added: number; updated: number }>;
  getLastUpdate(): Promise<Date>;
}

// =============================================================================
// In-Memory Stores
// =============================================================================

/**
 * In-memory SBOM store
 */
export class InMemorySBOMStore implements SBOMStore {
  private sboms = new Map<string, SBOM>();
  private projectSboms = new Map<string, string[]>();

  async save(sbom: SBOM): Promise<SBOM> {
    this.sboms.set(sbom.id, sbom);

    const projectList = this.projectSboms.get(sbom.projectName) || [];
    projectList.push(sbom.id);
    this.projectSboms.set(sbom.projectName, projectList);

    return sbom;
  }

  async get(id: string): Promise<SBOM | null> {
    return this.sboms.get(id) || null;
  }

  async getLatest(projectId: string): Promise<SBOM | null> {
    const ids = this.projectSboms.get(projectId) || [];
    if (ids.length === 0) return null;

    const sboms = ids.map((id) => this.sboms.get(id)!).filter(Boolean);
    sboms.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return sboms[0] || null;
  }

  async list(projectId: string): Promise<SBOM[]> {
    const ids = this.projectSboms.get(projectId) || [];
    return ids.map((id) => this.sboms.get(id)!).filter(Boolean);
  }

  async compare(sbomId1: string, sbomId2: string): Promise<SBOMDiff> {
    const sbom1 = await this.get(sbomId1);
    const sbom2 = await this.get(sbomId2);

    if (!sbom1 || !sbom2) {
      throw new Error('One or both SBOMs not found');
    }

    const deps1 = new Map(sbom1.dependencies.map((d) => [d.name, d]));
    const deps2 = new Map(sbom2.dependencies.map((d) => [d.name, d]));

    const added: Dependency[] = [];
    const removed: Dependency[] = [];
    const changed: SBOMDiff['changed'] = [];

    for (const [name, dep] of deps2) {
      if (!deps1.has(name)) {
        added.push(dep);
      } else if (deps1.get(name)!.version !== dep.version) {
        changed.push({
          name,
          oldVersion: deps1.get(name)!.version,
          newVersion: dep.version,
        });
      }
    }

    for (const [name, dep] of deps1) {
      if (!deps2.has(name)) {
        removed.push(dep);
      }
    }

    return { added, removed, changed };
  }
}

/**
 * In-memory vulnerability database
 */
export class InMemoryVulnerabilityDB implements VulnerabilityDatabase {
  private vulns = new Map<string, VulnerabilityFinding[]>();
  private lastUpdate = new Date();

  async query(name: string, version: string): Promise<VulnerabilityFinding[]> {
    const findings = this.vulns.get(name) || [];
    return findings.filter((f) => this.isVersionAffected(f, version));
  }

  async getById(cveId: string): Promise<VulnerabilityFinding | null> {
    for (const findings of this.vulns.values()) {
      const found = findings.find((f) => f.cveId === cveId || f.id === cveId);
      if (found) return found;
    }
    return null;
  }

  async update(): Promise<{ added: number; updated: number }> {
    this.lastUpdate = new Date();
    return { added: 0, updated: 0 };
  }

  async getLastUpdate(): Promise<Date> {
    return this.lastUpdate;
  }

  // Add vulnerability for testing
  addVulnerability(finding: VulnerabilityFinding): void {
    const existing = this.vulns.get(finding.dependencyName) || [];
    existing.push(finding);
    this.vulns.set(finding.dependencyName, existing);
  }

  private isVersionAffected(finding: VulnerabilityFinding, version: string): boolean {
    // Simplified version check - in production would use semver
    return finding.dependencyVersion === version || finding.dependencyVersion === '*';
  }
}

// =============================================================================
// Supply Chain Manager
// =============================================================================

/**
 * Supply Chain Manager configuration
 */
export interface SupplyChainConfig {
  defaultSBOMFormat: SBOMFormat;
  autoScan: boolean;
  scanFrequencyHours: number;
  failOnCritical: boolean;
  failOnHigh: boolean;
}

/**
 * Default supply chain config
 */
export const DEFAULT_SUPPLY_CHAIN_CONFIG: SupplyChainConfig = {
  defaultSBOMFormat: 'cyclonedx',
  autoScan: true,
  scanFrequencyHours: 24,
  failOnCritical: true,
  failOnHigh: false,
};

/**
 * License categories
 */
export const LICENSE_CATEGORIES: Record<LicenseRisk, string[]> = {
  none: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0'],
  low: ['MPL-2.0', 'LGPL-2.1', 'LGPL-3.0', 'EPL-1.0', 'EPL-2.0'],
  medium: ['CDDL-1.0', 'CPL-1.0'],
  high: ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0'],
  critical: ['SSPL-1.0', 'BSL-1.1'],
  unknown: [],
};

/**
 * Supply Chain Manager
 */
export class SupplyChainManager {
  private sbomStore: SBOMStore;
  private vulnDb: VulnerabilityDatabase;
  private policies = new Map<string, LicensePolicy>();
  private config: SupplyChainConfig;
  private scanCounter = 0;
  private policyCounter = 0;
  private sbomCounter = 0;

  constructor(
    sbomStore: SBOMStore,
    vulnDb: VulnerabilityDatabase,
    config: SupplyChainConfig = DEFAULT_SUPPLY_CHAIN_CONFIG
  ) {
    this.sbomStore = sbomStore;
    this.vulnDb = vulnDb;
    this.config = config;
  }

  // -------------------------------------------------------------------------
  // SBOM Operations
  // -------------------------------------------------------------------------

  /**
   * Generate SBOM from dependencies
   */
  async generateSBOM(
    projectName: string,
    projectVersion: string,
    dependencies: Omit<Dependency, 'licenseRisk'>[]
  ): Promise<SBOM> {
    const sbom: SBOM = {
      id: `sbom_${++this.sbomCounter}`,
      format: this.config.defaultSBOMFormat,
      version: '1.0',
      createdAt: new Date(),
      projectName,
      projectVersion,
      dependencies: dependencies.map((d) => ({
        ...d,
        licenseRisk: this.assessLicenseRisk(d.license),
      })),
      metadata: {
        tool: 'gwi-supply-chain',
        toolVersion: '1.0.0',
        generator: 'InMemoryGenerator',
      },
    };

    return this.sbomStore.save(sbom);
  }

  /**
   * Get SBOM by ID
   */
  async getSBOM(id: string): Promise<SBOM | null> {
    return this.sbomStore.get(id);
  }

  /**
   * Get latest SBOM for project
   */
  async getLatestSBOM(projectId: string): Promise<SBOM | null> {
    return this.sbomStore.getLatest(projectId);
  }

  /**
   * Compare two SBOMs
   */
  async compareSBOMs(sbomId1: string, sbomId2: string): Promise<SBOMDiff> {
    return this.sbomStore.compare(sbomId1, sbomId2);
  }

  // -------------------------------------------------------------------------
  // Scanning
  // -------------------------------------------------------------------------

  /**
   * Scan project for vulnerabilities
   */
  async scan(
    projectId: string,
    dependencies: Omit<Dependency, 'licenseRisk'>[]
  ): Promise<SupplyChainScanResult> {
    const startTime = Date.now();
    const scanId = `scan_${++this.scanCounter}`;

    // Generate SBOM
    const sbom = await this.generateSBOM(projectId, '1.0.0', dependencies);

    // Scan for vulnerabilities
    const vulnerabilities: VulnerabilityFinding[] = [];
    for (const dep of sbom.dependencies) {
      const findings = await this.vulnDb.query(dep.name, dep.version);
      vulnerabilities.push(...findings);
    }

    // Check licenses
    const licenseIssues = this.checkLicenses(sbom.dependencies);

    // Calculate summary
    const directDeps = sbom.dependencies.filter((d) => d.type === 'direct').length;
    const transitDeps = sbom.dependencies.filter((d) => d.type === 'transitive').length;

    const summary = {
      totalDependencies: sbom.dependencies.length,
      directDependencies: directDeps,
      transitDependencies: transitDeps,
      vulnerableCount: vulnerabilities.length,
      criticalCount: vulnerabilities.filter((v) => v.severity === 'critical').length,
      highCount: vulnerabilities.filter((v) => v.severity === 'high').length,
      licenseIssueCount: licenseIssues.length,
    };

    // Calculate risk score
    const riskScore = this.calculateRiskScore(vulnerabilities, licenseIssues);

    // Generate recommendations
    const recommendations = this.generateRecommendations(vulnerabilities, licenseIssues);

    return {
      id: scanId,
      projectId,
      scannedAt: new Date(),
      durationMs: Date.now() - startTime,
      sbom,
      vulnerabilities,
      licenseIssues,
      summary,
      riskScore,
      recommendations,
    };
  }

  // -------------------------------------------------------------------------
  // License Policy
  // -------------------------------------------------------------------------

  /**
   * Create license policy
   */
  async createLicensePolicy(
    policy: Omit<LicensePolicy, 'id' | 'createdAt'>
  ): Promise<LicensePolicy> {
    const id = `policy_${++this.policyCounter}`;
    const licensePolicy: LicensePolicy = { ...policy, id, createdAt: new Date() };
    this.policies.set(id, licensePolicy);
    return licensePolicy;
  }

  /**
   * Get license policy
   */
  async getLicensePolicy(id: string): Promise<LicensePolicy | null> {
    return this.policies.get(id) || null;
  }

  /**
   * Evaluate dependencies against license policy
   */
  async evaluateLicensePolicy(
    policyId: string,
    dependencies: Dependency[]
  ): Promise<{
    passed: boolean;
    violations: LicenseIssue[];
    requiresApproval: LicenseIssue[];
  }> {
    const policy = this.policies.get(policyId);
    if (!policy) throw new Error(`Policy ${policyId} not found`);

    const violations: LicenseIssue[] = [];
    const requiresApproval: LicenseIssue[] = [];

    for (const dep of dependencies) {
      const license = dep.license || 'unknown';

      if (policy.blockedLicenses.includes(license)) {
        violations.push({
          dependencyName: dep.name,
          dependencyVersion: dep.version,
          license,
          risk: 'critical',
          reason: 'License is blocked by policy',
          recommendation: 'Find an alternative dependency with an approved license',
        });
      } else if (policy.requireApprovalLicenses.includes(license)) {
        requiresApproval.push({
          dependencyName: dep.name,
          dependencyVersion: dep.version,
          license,
          risk: 'medium',
          reason: 'License requires approval',
          recommendation: 'Request approval for this license',
        });
      } else if (
        policy.allowedLicenses.length > 0 &&
        !policy.allowedLicenses.includes(license)
      ) {
        violations.push({
          dependencyName: dep.name,
          dependencyVersion: dep.version,
          license,
          risk: 'high',
          reason: 'License is not in allowed list',
          recommendation: 'Use a dependency with an approved license',
        });
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      requiresApproval,
    };
  }

  // -------------------------------------------------------------------------
  // Update Detection
  // -------------------------------------------------------------------------

  /**
   * Check for available updates
   */
  async checkUpdates(dependencies: Dependency[]): Promise<DependencyUpdate[]> {
    const updates: DependencyUpdate[] = [];

    for (const dep of dependencies) {
      // Simulate update check
      const latestVersion = this.simulateLatestVersion(dep.version);
      if (latestVersion !== dep.version) {
        updates.push({
          dependencyName: dep.name,
          currentVersion: dep.version,
          latestVersion,
          recommendedVersion: latestVersion,
          updateType: this.getUpdateType(dep.version, latestVersion),
          breakingChanges: this.getUpdateType(dep.version, latestVersion) === 'major',
          vulnerabilitiesFixed: [],
        });
      }
    }

    return updates;
  }

  // -------------------------------------------------------------------------
  // Internal Methods
  // -------------------------------------------------------------------------

  private assessLicenseRisk(license?: string): LicenseRisk {
    if (!license) return 'unknown';

    for (const [risk, licenses] of Object.entries(LICENSE_CATEGORIES)) {
      if (licenses.includes(license)) {
        return risk as LicenseRisk;
      }
    }

    return 'unknown';
  }

  private checkLicenses(dependencies: Dependency[]): LicenseIssue[] {
    const issues: LicenseIssue[] = [];

    for (const dep of dependencies) {
      if (dep.licenseRisk === 'high' || dep.licenseRisk === 'critical') {
        issues.push({
          dependencyName: dep.name,
          dependencyVersion: dep.version,
          license: dep.license || 'unknown',
          risk: dep.licenseRisk,
          reason: `${dep.licenseRisk} risk license`,
          recommendation: dep.licenseRisk === 'critical'
            ? 'Remove this dependency or get legal approval'
            : 'Review license compatibility',
        });
      } else if (dep.licenseRisk === 'unknown') {
        issues.push({
          dependencyName: dep.name,
          dependencyVersion: dep.version,
          license: 'unknown',
          risk: 'unknown',
          reason: 'Unknown license',
          recommendation: 'Verify license before using in production',
        });
      }
    }

    return issues;
  }

  private calculateRiskScore(
    vulnerabilities: VulnerabilityFinding[],
    licenseIssues: LicenseIssue[]
  ): number {
    let score = 0;

    for (const vuln of vulnerabilities) {
      switch (vuln.severity) {
        case 'critical':
          score += 40;
          break;
        case 'high':
          score += 25;
          break;
        case 'medium':
          score += 10;
          break;
        case 'low':
          score += 5;
          break;
      }
    }

    for (const issue of licenseIssues) {
      switch (issue.risk) {
        case 'critical':
          score += 30;
          break;
        case 'high':
          score += 20;
          break;
        case 'medium':
          score += 10;
          break;
        default:
          score += 5;
      }
    }

    return Math.min(100, score);
  }

  private generateRecommendations(
    vulnerabilities: VulnerabilityFinding[],
    licenseIssues: LicenseIssue[]
  ): string[] {
    const recommendations: string[] = [];

    const criticalVulns = vulnerabilities.filter((v) => v.severity === 'critical');
    if (criticalVulns.length > 0) {
      recommendations.push(
        `Immediate action required: ${criticalVulns.length} critical vulnerabilities found`
      );
    }

    const fixable = vulnerabilities.filter((v) => v.fixedVersions.length > 0);
    if (fixable.length > 0) {
      recommendations.push(`${fixable.length} vulnerabilities can be fixed by updating`);
    }

    const criticalLicense = licenseIssues.filter((i) => i.risk === 'critical');
    if (criticalLicense.length > 0) {
      recommendations.push(
        `${criticalLicense.length} dependencies have critical license issues`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('No critical issues found');
    }

    return recommendations;
  }

  private simulateLatestVersion(currentVersion: string): string {
    const parts = currentVersion.split('.');
    if (parts.length >= 3) {
      parts[2] = String(parseInt(parts[2], 10) + 1);
    }
    return parts.join('.');
  }

  private getUpdateType(current: string, latest: string): 'major' | 'minor' | 'patch' {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    if (latestParts[0] > currentParts[0]) return 'major';
    if (latestParts[1] > currentParts[1]) return 'minor';
    return 'patch';
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a Supply Chain Manager with in-memory stores
 */
export function createSupplyChainManager(
  config: Partial<SupplyChainConfig> = {}
): SupplyChainManager {
  return new SupplyChainManager(
    new InMemorySBOMStore(),
    new InMemoryVulnerabilityDB(),
    { ...DEFAULT_SUPPLY_CHAIN_CONFIG, ...config }
  );
}

/**
 * Create SBOM store
 */
export function createSBOMStore(): InMemorySBOMStore {
  return new InMemorySBOMStore();
}

/**
 * Create vulnerability database
 */
export function createVulnerabilityDB(): InMemoryVulnerabilityDB {
  return new InMemoryVulnerabilityDB();
}
