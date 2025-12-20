/**
 * Artifact Access Interfaces
 *
 * Core interfaces for signed URL generation and artifact access control.
 *
 * @module @gwi/core/artifacts/interfaces
 */

import type {
  ArtifactAccessRequest,
  SignedUrlResult,
  TenantValidationResult,
  ArtifactReference,
  ArtifactAccessAuditEvent,
} from './types.js';

// =============================================================================
// Signed URL Generator Interface
// =============================================================================

/**
 * Interface for generating signed URLs for artifact access.
 *
 * Implementations:
 * - GcsSignedUrlGenerator: Uses GCS signed URLs for production
 * - LocalSignedUrlGenerator: Returns local file paths or mock URLs for development
 */
export interface SignedUrlGenerator {
  /**
   * Generate a signed URL for artifact access.
   *
   * This method should:
   * 1. Validate tenant ownership of the run
   * 2. Check that the artifact exists (optional, can defer to URL access time)
   * 3. Generate a time-limited signed URL
   * 4. Log the access request for audit
   *
   * @param request - Access request with artifact reference and action
   * @returns Signed URL result with expiration
   * @throws TenantAccessDeniedError if tenant validation fails
   * @throws ArtifactNotFoundError if artifact doesn't exist (optional check)
   * @throws InvalidConfigurationError if generator is misconfigured
   */
  generateSignedUrl(request: ArtifactAccessRequest): Promise<SignedUrlResult>;

  /**
   * Generate signed URLs for multiple artifacts in a batch.
   *
   * This is more efficient than calling generateSignedUrl multiple times
   * when accessing multiple artifacts from the same run.
   *
   * @param requests - Array of access requests
   * @returns Array of signed URL results
   */
  generateSignedUrlBatch(requests: ArtifactAccessRequest[]): Promise<SignedUrlResult[]>;

  /**
   * Validate that a tenant has access to a run.
   *
   * This checks tenant ownership without generating a URL.
   * Useful for pre-validation before showing UI elements.
   *
   * @param tenantId - Tenant ID to validate
   * @param runId - Run ID to check access for
   * @returns Validation result
   */
  validateTenantAccess(tenantId: string, runId: string): Promise<TenantValidationResult>;
}

// =============================================================================
// Tenant Validator Interface
// =============================================================================

/**
 * Interface for validating tenant ownership of runs.
 *
 * This is used by SignedUrlGenerator implementations to verify
 * that the requesting tenant owns the run before generating URLs.
 */
export interface TenantValidator {
  /**
   * Validate that a tenant owns a run.
   *
   * @param tenantId - Tenant ID to validate
   * @param runId - Run ID to check
   * @returns Validation result with success/error
   */
  validateRunOwnership(tenantId: string, runId: string): Promise<TenantValidationResult>;

  /**
   * Validate tenant ownership for multiple runs (batch operation).
   *
   * @param tenantId - Tenant ID to validate
   * @param runIds - Array of run IDs to check
   * @returns Map of runId -> validation result
   */
  validateRunOwnershipBatch(tenantId: string, runIds: string[]): Promise<Map<string, TenantValidationResult>>;
}

// =============================================================================
// Audit Logger Interface
// =============================================================================

/**
 * Interface for logging artifact access events.
 *
 * This is used by SignedUrlGenerator to create an audit trail
 * of all artifact access requests.
 */
export interface ArtifactAuditLogger {
  /**
   * Log an artifact access event.
   *
   * @param event - Audit event to log
   * @returns Event ID (for correlation)
   */
  logAccess(event: Omit<ArtifactAccessAuditEvent, 'id' | 'timestamp'>): Promise<string>;

  /**
   * Log multiple access events in a batch.
   *
   * @param events - Array of events to log
   * @returns Array of event IDs
   */
  logAccessBatch(events: Array<Omit<ArtifactAccessAuditEvent, 'id' | 'timestamp'>>): Promise<string[]>;

  /**
   * Query access events for a run.
   *
   * @param runId - Run ID to query
   * @param options - Query options
   * @returns Array of access events
   */
  queryAccessEvents(
    runId: string,
    options?: {
      limit?: number;
      offset?: number;
      action?: 'read' | 'write';
      userId?: string;
    }
  ): Promise<ArtifactAccessAuditEvent[]>;
}

// =============================================================================
// Artifact Existence Checker Interface
// =============================================================================

/**
 * Interface for checking artifact existence.
 *
 * This is optional - some implementations may defer existence
 * checking to URL access time (404 on signed URL).
 */
export interface ArtifactExistenceChecker {
  /**
   * Check if an artifact exists.
   *
   * @param artifact - Artifact reference
   * @returns true if artifact exists, false otherwise
   */
  artifactExists(artifact: ArtifactReference): Promise<boolean>;

  /**
   * Check existence of multiple artifacts in a batch.
   *
   * @param artifacts - Array of artifact references
   * @returns Map of artifact path -> exists boolean
   */
  artifactExistsBatch(artifacts: ArtifactReference[]): Promise<Map<string, boolean>>;
}
