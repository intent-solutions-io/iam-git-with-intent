/**
 * GCS Signed URL Generator
 *
 * Production implementation using Google Cloud Storage signed URLs.
 * Validates tenant ownership and logs all access requests.
 *
 * @module @gwi/core/artifacts/gcs-signed-url-generator
 */

import { randomUUID } from 'crypto';
import type { GcsArtifactStore } from '../run-bundle/gcs-artifact-store.js';
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
 * Default tenant validator that accepts all requests.
 * IMPORTANT: Replace with real validator in production!
 */
class PassthroughTenantValidator implements TenantValidator {
  async validateRunOwnership(tenantId: string, runId: string): Promise<TenantValidationResult> {
    return {
      valid: true,
      tenantId,
      runId,
    };
  }

  async validateRunOwnershipBatch(tenantId: string, runIds: string[]): Promise<Map<string, TenantValidationResult>> {
    const results = new Map<string, TenantValidationResult>();
    for (const runId of runIds) {
      results.set(runId, { valid: true, tenantId, runId });
    }
    return results;
  }
}

/**
 * Default audit logger that logs to console.
 * IMPORTANT: Replace with real logger in production!
 */
class ConsoleAuditLogger implements ArtifactAuditLogger {
  async logAccess(event: Omit<ArtifactAccessAuditEvent, 'id' | 'timestamp'>): Promise<string> {
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    console.log('[ARTIFACT_ACCESS]', { ...event, id, timestamp });
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
    console.log('[ARTIFACT_ACCESS_QUERY]', { runId, options });
    return [];
  }
}

/**
 * GCS-backed artifact existence checker
 */
class GcsExistenceChecker implements ArtifactExistenceChecker {
  constructor(private readonly store: GcsArtifactStore) {}

  async artifactExists(artifact: ArtifactReference): Promise<boolean> {
    return this.store.artifactExists(artifact.tenantId, artifact.repoId, artifact.runId, artifact.artifactName);
  }

  async artifactExistsBatch(artifacts: ArtifactReference[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const checks = artifacts.map(async (artifact) => {
      const exists = await this.artifactExists(artifact);
      const key = `${artifact.tenantId}/${artifact.repoId}/${artifact.runId}/${artifact.artifactName}`;
      results.set(key, exists);
    });
    await Promise.all(checks);
    return results;
  }
}

// =============================================================================
// GCS Signed URL Generator
// =============================================================================

/**
 * Configuration for GCS signed URL generator
 */
export interface GcsSignedUrlGeneratorConfig {
  /** GCS artifact store instance */
  artifactStore: GcsArtifactStore;
  /** Signed URL configuration */
  urlConfig?: Partial<SignedUrlConfig>;
  /** Tenant validator (optional, defaults to passthrough) */
  tenantValidator?: TenantValidator;
  /** Audit logger (optional, defaults to console) */
  auditLogger?: ArtifactAuditLogger;
  /** Existence checker (optional, defaults to GCS checker) */
  existenceChecker?: ArtifactExistenceChecker;
  /** Whether to check artifact existence before generating URL (default: false) */
  checkExistence?: boolean;
}

/**
 * GCS-backed signed URL generator.
 *
 * Features:
 * - Validates tenant ownership before generating URLs
 * - Logs all access requests for audit
 * - Optional artifact existence checking
 * - Batch operations for efficiency
 *
 * @example
 * ```typescript
 * const generator = new GcsSignedUrlGenerator({
 *   artifactStore: gcsStore,
 *   urlConfig: { expiryMinutes: 30 },
 *   tenantValidator: customValidator,
 *   auditLogger: customLogger,
 * });
 *
 * const result = await generator.generateSignedUrl({
 *   artifact: {
 *     tenantId: 'tenant-123',
 *     repoId: 'repo-456',
 *     runId: 'run-uuid',
 *     artifactName: 'triage.json',
 *   },
 *   action: 'read',
 *   userId: 'user-789',
 *   source: 'ui',
 * });
 *
 * console.log(result.url); // GCS signed URL
 * console.log(result.expiresAt); // ISO timestamp
 * ```
 */
export class GcsSignedUrlGenerator implements SignedUrlGenerator {
  private readonly artifactStore: GcsArtifactStore;
  private readonly urlConfig: SignedUrlConfig;
  private readonly tenantValidator: TenantValidator;
  private readonly auditLogger: ArtifactAuditLogger;
  private readonly existenceChecker: ArtifactExistenceChecker;
  private readonly checkExistence: boolean;

  constructor(config: GcsSignedUrlGeneratorConfig) {
    this.artifactStore = config.artifactStore;

    // Validate and set URL config
    const urlConfigResult = SignedUrlConfigSchema.safeParse(config.urlConfig ?? {});
    if (!urlConfigResult.success) {
      throw new InvalidConfigurationError(`Invalid URL config: ${urlConfigResult.error.message}`);
    }
    this.urlConfig = urlConfigResult.data;

    // Set dependencies (with defaults)
    this.tenantValidator = config.tenantValidator ?? new PassthroughTenantValidator();
    this.auditLogger = config.auditLogger ?? new ConsoleAuditLogger();
    this.existenceChecker = config.existenceChecker ?? new GcsExistenceChecker(this.artifactStore);
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

    // Step 3: Generate signed URL
    const effectiveExpiry = expiryMinutes ?? this.urlConfig.expiryMinutes;
    const url = await this.artifactStore.getSignedUrl(
      artifact.tenantId,
      artifact.repoId,
      artifact.runId,
      artifact.artifactName,
      action,
      effectiveExpiry
    );

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
        expiryMinutes: effectiveExpiry,
      },
    });

    return {
      url,
      expiresAt,
      artifact,
      action,
      backend: 'gcs',
      auditEventId,
    };
  }

  /**
   * Generate signed URLs for multiple artifacts in a batch.
   */
  async generateSignedUrlBatch(requests: ArtifactAccessRequest[]): Promise<SignedUrlResult[]> {
    // Group by tenant and runId for efficient validation
    const validationMap = new Map<string, Set<string>>();
    for (const request of requests) {
      const { tenantId, runId } = request.artifact;
      const key = tenantId;
      if (!validationMap.has(key)) {
        validationMap.set(key, new Set());
      }
      validationMap.get(key)!.add(runId);
    }

    // Batch validate tenant ownership
    const validationResults = new Map<string, Map<string, TenantValidationResult>>();
    for (const [tenantId, runIds] of validationMap) {
      const results = await this.tenantValidator.validateRunOwnershipBatch(tenantId, Array.from(runIds));
      validationResults.set(tenantId, results);
    }

    // Check existence in batch if enabled
    let existenceMap: Map<string, boolean> | undefined;
    if (this.checkExistence) {
      const artifacts = requests.map((r) => r.artifact);
      existenceMap = await this.existenceChecker.artifactExistsBatch(artifacts);
    }

    // Generate URLs
    const results: SignedUrlResult[] = [];
    const auditEvents: Array<Omit<ArtifactAccessAuditEvent, 'id' | 'timestamp'>> = [];

    for (const request of requests) {
      const { artifact, action, userId, source, expiryMinutes } = request;

      // Check validation
      const validation = validationResults.get(artifact.tenantId)?.get(artifact.runId);
      if (!validation || !validation.valid) {
        throw new TenantAccessDeniedError(
          validation?.error ?? `Tenant ${artifact.tenantId} does not own run ${artifact.runId}`,
          artifact
        );
      }

      // Check existence
      if (this.checkExistence && existenceMap) {
        const key = `${artifact.tenantId}/${artifact.repoId}/${artifact.runId}/${artifact.artifactName}`;
        const exists = existenceMap.get(key) ?? false;
        if (!exists) {
          throw new ArtifactNotFoundError(
            `Artifact ${artifact.artifactName} not found for run ${artifact.runId}`,
            artifact
          );
        }
      }

      // Generate signed URL
      const effectiveExpiry = expiryMinutes ?? this.urlConfig.expiryMinutes;
      const url = await this.artifactStore.getSignedUrl(
        artifact.tenantId,
        artifact.repoId,
        artifact.runId,
        artifact.artifactName,
        action,
        effectiveExpiry
      );

      const expiresAt = new Date(Date.now() + effectiveExpiry * 60 * 1000).toISOString();

      results.push({
        url,
        expiresAt,
        artifact,
        action,
        backend: 'gcs',
      });

      // Prepare audit event
      auditEvents.push({
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
          expiryMinutes: effectiveExpiry,
          batchSize: requests.length,
        },
      });
    }

    // Log all access events
    const auditEventIds = await this.auditLogger.logAccessBatch(auditEvents);

    // Attach audit IDs to results
    for (let i = 0; i < results.length; i++) {
      results[i].auditEventId = auditEventIds[i];
    }

    return results;
  }

  /**
   * Validate tenant access without generating URL.
   */
  async validateTenantAccess(tenantId: string, runId: string): Promise<TenantValidationResult> {
    return this.tenantValidator.validateRunOwnership(tenantId, runId);
  }
}
