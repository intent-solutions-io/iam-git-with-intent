/**
 * Local Signed URL Generator
 *
 * Development/testing implementation that returns local file paths or mock URLs.
 * Useful for local development and CI/CD testing without requiring GCS.
 *
 * @module @gwi/core/artifacts/local-signed-url-generator
 */

import { randomUUID } from 'crypto';
import { join } from 'path';
import type {
  SignedUrlGenerator,
  TenantValidator,
  ArtifactAuditLogger,
  ArtifactExistenceChecker,
} from './interfaces.js';
import type {
  ArtifactAccessRequest,
  SignedUrlResult,
  TenantValidationResult,
  SignedUrlConfig,
  ArtifactReference,
  ArtifactAccessAuditEvent,
} from './types.js';
import {
  TenantAccessDeniedError,
  ArtifactNotFoundError,
  InvalidConfigurationError,
  SignedUrlConfigSchema,
} from './types.js';

// =============================================================================
// Default Implementations
// =============================================================================

/**
 * In-memory tenant validator for testing.
 * Can be configured with allowed tenant-run mappings.
 */
class InMemoryTenantValidator implements TenantValidator {
  private readonly allowedMappings: Map<string, Set<string>>;

  constructor(mappings?: Map<string, Set<string>>) {
    this.allowedMappings = mappings ?? new Map();
  }

  async validateRunOwnership(tenantId: string, runId: string): Promise<TenantValidationResult> {
    // If no mappings configured, accept all (permissive for local dev)
    if (this.allowedMappings.size === 0) {
      return { valid: true, tenantId, runId };
    }

    const allowedRuns = this.allowedMappings.get(tenantId);
    if (!allowedRuns || !allowedRuns.has(runId)) {
      return {
        valid: false,
        tenantId,
        runId,
        error: `Tenant ${tenantId} does not own run ${runId}`,
      };
    }

    return { valid: true, tenantId, runId };
  }

  async validateRunOwnershipBatch(tenantId: string, runIds: string[]): Promise<Map<string, TenantValidationResult>> {
    const results = new Map<string, TenantValidationResult>();
    for (const runId of runIds) {
      results.set(runId, await this.validateRunOwnership(tenantId, runId));
    }
    return results;
  }

  /**
   * Add a tenant-run mapping for testing
   */
  addMapping(tenantId: string, runId: string): void {
    if (!this.allowedMappings.has(tenantId)) {
      this.allowedMappings.set(tenantId, new Set());
    }
    this.allowedMappings.get(tenantId)!.add(runId);
  }
}

/**
 * In-memory audit logger for testing
 */
class InMemoryAuditLogger implements ArtifactAuditLogger {
  private readonly events: ArtifactAccessAuditEvent[] = [];

  async logAccess(event: Omit<ArtifactAccessAuditEvent, 'id' | 'timestamp'>): Promise<string> {
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const fullEvent = { ...event, id, timestamp };
    this.events.push(fullEvent);
    return id;
  }

  async logAccessBatch(events: Array<Omit<ArtifactAccessAuditEvent, 'id' | 'timestamp'>>): Promise<string[]> {
    return Promise.all(events.map((event) => this.logAccess(event)));
  }

  async queryAccessEvents(
    runId: string,
    options?: {
      limit?: number;
      offset?: number;
      action?: 'read' | 'write';
      userId?: string;
    }
  ): Promise<ArtifactAccessAuditEvent[]> {
    let filtered = this.events.filter((e) => e.runId === runId);

    if (options?.action) {
      filtered = filtered.filter((e) => e.action === options.action);
    }
    if (options?.userId) {
      filtered = filtered.filter((e) => e.userId === options.userId);
    }

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? filtered.length;

    return filtered.slice(offset, offset + limit);
  }

  /**
   * Get all logged events (for testing)
   */
  getAllEvents(): ArtifactAccessAuditEvent[] {
    return [...this.events];
  }

  /**
   * Clear all events (for testing)
   */
  clear(): void {
    this.events.length = 0;
  }
}

/**
 * Local filesystem existence checker
 */
class LocalExistenceChecker implements ArtifactExistenceChecker {
  private readonly existingArtifacts: Set<string>;

  constructor(existingArtifacts?: Set<string>) {
    this.existingArtifacts = existingArtifacts ?? new Set();
  }

  async artifactExists(artifact: ArtifactReference): Promise<boolean> {
    const key = this.getKey(artifact);
    return this.existingArtifacts.has(key);
  }

  async artifactExistsBatch(artifacts: ArtifactReference[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const artifact of artifacts) {
      const key = this.getKey(artifact);
      results.set(key, this.existingArtifacts.has(key));
    }
    return results;
  }

  /**
   * Add an artifact to the existence set (for testing)
   */
  addArtifact(artifact: ArtifactReference): void {
    this.existingArtifacts.add(this.getKey(artifact));
  }

  /**
   * Clear all artifacts (for testing)
   */
  clear(): void {
    this.existingArtifacts.clear();
  }

  private getKey(artifact: ArtifactReference): string {
    return `${artifact.tenantId}/${artifact.repoId}/${artifact.runId}/${artifact.artifactName}`;
  }
}

// =============================================================================
// Local Signed URL Generator
// =============================================================================

/**
 * URL mode for local generator
 */
export type LocalUrlMode = 'file' | 'http' | 'mock';

/**
 * Configuration for local signed URL generator
 */
export interface LocalSignedUrlGeneratorConfig {
  /** URL mode */
  mode?: LocalUrlMode;
  /** Base path for file mode (default: .gwi/runs) */
  basePath?: string;
  /** Base URL for http mode (default: http://localhost:3000) */
  baseUrl?: string;
  /** Signed URL configuration */
  urlConfig?: Partial<SignedUrlConfig>;
  /** Tenant validator (optional, defaults to permissive in-memory) */
  tenantValidator?: TenantValidator;
  /** Audit logger (optional, defaults to in-memory) */
  auditLogger?: ArtifactAuditLogger;
  /** Existence checker (optional, defaults to permissive in-memory) */
  existenceChecker?: ArtifactExistenceChecker;
  /** Whether to check artifact existence before generating URL (default: false) */
  checkExistence?: boolean;
}

/**
 * Local signed URL generator for development and testing.
 *
 * Modes:
 * - 'file': Returns file:// URLs pointing to local filesystem
 * - 'http': Returns http:// URLs pointing to local server
 * - 'mock': Returns mock URLs (for testing only)
 *
 * @example
 * ```typescript
 * // File mode (for CLI)
 * const generator = new LocalSignedUrlGenerator({
 *   mode: 'file',
 *   basePath: '.gwi/runs',
 * });
 *
 * const result = await generator.generateSignedUrl({
 *   artifact: {
 *     tenantId: 'local',
 *     repoId: 'repo-1',
 *     runId: 'run-uuid',
 *     artifactName: 'triage.json',
 *   },
 *   action: 'read',
 * });
 *
 * console.log(result.url); // file://.gwi/runs/local/repo-1/run-uuid/triage.json
 * ```
 *
 * @example
 * ```typescript
 * // HTTP mode (for local server)
 * const generator = new LocalSignedUrlGenerator({
 *   mode: 'http',
 *   baseUrl: 'http://localhost:3000',
 * });
 *
 * const result = await generator.generateSignedUrl({
 *   artifact: {
 *     tenantId: 'local',
 *     repoId: 'repo-1',
 *     runId: 'run-uuid',
 *     artifactName: 'triage.json',
 *   },
 *   action: 'read',
 * });
 *
 * console.log(result.url); // http://localhost:3000/artifacts/local/repo-1/run-uuid/triage.json?expires=...
 * ```
 */
export class LocalSignedUrlGenerator implements SignedUrlGenerator {
  private readonly mode: LocalUrlMode;
  private readonly basePath: string;
  private readonly baseUrl: string;
  private readonly urlConfig: SignedUrlConfig;
  private readonly tenantValidator: TenantValidator;
  private readonly auditLogger: ArtifactAuditLogger;
  private readonly existenceChecker: ArtifactExistenceChecker;
  private readonly checkExistence: boolean;

  constructor(config: LocalSignedUrlGeneratorConfig = {}) {
    this.mode = config.mode ?? 'file';
    this.basePath = config.basePath ?? '.gwi/runs';
    this.baseUrl = config.baseUrl ?? 'http://localhost:3000';

    // Validate and set URL config
    const urlConfigResult = SignedUrlConfigSchema.safeParse(config.urlConfig ?? {});
    if (!urlConfigResult.success) {
      throw new InvalidConfigurationError(`Invalid URL config: ${urlConfigResult.error.message}`);
    }
    this.urlConfig = urlConfigResult.data;

    // Set dependencies (with defaults)
    this.tenantValidator = config.tenantValidator ?? new InMemoryTenantValidator();
    this.auditLogger = config.auditLogger ?? new InMemoryAuditLogger();
    this.existenceChecker = config.existenceChecker ?? new LocalExistenceChecker();
    this.checkExistence = config.checkExistence ?? false;
  }

  /**
   * Generate a signed URL for artifact access.
   */
  async generateSignedUrl(request: ArtifactAccessRequest): Promise<SignedUrlResult> {
    const { artifact, action, userId, source, expiryMinutes } = request;

    // Step 1: Validate tenant ownership
    const validation = await this.tenantValidator.validateRunOwnership(artifact.tenantId, artifact.runId);
    if (!validation.valid) {
      throw new TenantAccessDeniedError(
        validation.error ?? `Tenant ${artifact.tenantId} does not own run ${artifact.runId}`,
        artifact
      );
    }

    // Step 2: Check artifact existence (if enabled)
    if (this.checkExistence) {
      const exists = await this.existenceChecker.artifactExists(artifact);
      if (!exists) {
        throw new ArtifactNotFoundError(
          `Artifact ${artifact.artifactName} not found for run ${artifact.runId}`,
          artifact
        );
      }
    }

    // Step 3: Generate URL based on mode
    const effectiveExpiry = expiryMinutes ?? this.urlConfig.expiryMinutes;
    const url = this.generateUrl(artifact, action, effectiveExpiry);
    const expiresAt = new Date(Date.now() + effectiveExpiry * 60 * 1000).toISOString();

    // Step 4: Log access for audit
    const auditEventId = await this.auditLogger.logAccess({
      tenantId: artifact.tenantId,
      repoId: artifact.repoId,
      runId: artifact.runId,
      artifactName: artifact.artifactName,
      action,
      userId,
      source,
      expiresAt,
      tenantValidated: true,
      metadata: {
        mode: this.mode,
        expiryMinutes: effectiveExpiry,
      },
    });

    return {
      url,
      expiresAt,
      artifact,
      action,
      backend: 'local',
      auditEventId,
    };
  }

  /**
   * Generate signed URLs for multiple artifacts in a batch.
   */
  async generateSignedUrlBatch(requests: ArtifactAccessRequest[]): Promise<SignedUrlResult[]> {
    // For local implementation, just call generateSignedUrl in parallel
    // (more sophisticated batching not needed for local/testing)
    return Promise.all(requests.map((request) => this.generateSignedUrl(request)));
  }

  /**
   * Validate tenant access without generating URL.
   */
  async validateTenantAccess(tenantId: string, runId: string): Promise<TenantValidationResult> {
    return this.tenantValidator.validateRunOwnership(tenantId, runId);
  }

  /**
   * Generate URL based on configured mode
   */
  private generateUrl(artifact: ArtifactReference, action: 'read' | 'write', expiryMinutes: number): string {
    const { tenantId, repoId, runId, artifactName } = artifact;
    const path = `${tenantId}/${repoId}/${runId}/${artifactName}`;

    switch (this.mode) {
      case 'file': {
        const filePath = join(this.basePath, path);
        return `file://${filePath}`;
      }

      case 'http': {
        const expiresAtMs = Date.now() + expiryMinutes * 60 * 1000;
        const params = new URLSearchParams({
          expires: expiresAtMs.toString(),
          action,
        });
        return `${this.baseUrl}/artifacts/${path}?${params.toString()}`;
      }

      case 'mock': {
        return `mock://${path}?expires=${Date.now() + expiryMinutes * 60 * 1000}&action=${action}`;
      }

      default: {
        throw new InvalidConfigurationError(`Unknown URL mode: ${this.mode}`);
      }
    }
  }

  /**
   * Get the audit logger (for testing)
   */
  getAuditLogger(): ArtifactAuditLogger {
    return this.auditLogger;
  }

  /**
   * Get the tenant validator (for testing)
   */
  getTenantValidator(): TenantValidator {
    return this.tenantValidator;
  }

  /**
   * Get the existence checker (for testing)
   */
  getExistenceChecker(): ArtifactExistenceChecker {
    return this.existenceChecker;
  }
}
