/**
 * Artifact Access Types
 *
 * Type definitions for secure artifact access and signed URL generation.
 * Supports both GCS (production) and local/mock (development) backends.
 *
 * @module @gwi/core/artifacts/types
 */

import { z } from 'zod';

// =============================================================================
// Configuration Schemas
// =============================================================================

/**
 * Signed URL configuration schema
 */
export const SignedUrlConfigSchema = z.object({
  /** URL expiration time in minutes (default: 15) */
  expiryMinutes: z.number().int().min(1).max(1440).default(15),
  /** GCS bucket name (for GCS backend) */
  bucketName: z.string().optional(),
  /** GCP project ID (for GCS backend) */
  projectId: z.string().optional(),
  /** Base URL for local/mock URLs (for local backend) */
  baseUrl: z.string().url().optional(),
});

export type SignedUrlConfig = z.infer<typeof SignedUrlConfigSchema>;

// =============================================================================
// Artifact Reference
// =============================================================================

/**
 * Artifact reference schema
 */
export const ArtifactReferenceSchema = z.object({
  /** Tenant ID (for multi-tenant isolation) */
  tenantId: z.string().min(1),
  /** Repository ID */
  repoId: z.string().min(1),
  /** Run ID (UUID) */
  runId: z.string().uuid(),
  /** Artifact name (e.g., 'triage.json', 'patch.diff') */
  artifactName: z.string().min(1),
});

export type ArtifactReference = z.infer<typeof ArtifactReferenceSchema>;

// =============================================================================
// Access Request
// =============================================================================

/**
 * Access action types
 */
export const AccessAction = z.enum(['read', 'write']);
export type AccessAction = z.infer<typeof AccessAction>;

/**
 * Artifact access request schema
 */
export const ArtifactAccessRequestSchema = z.object({
  /** Artifact reference */
  artifact: ArtifactReferenceSchema,
  /** Access action */
  action: AccessAction.default('read'),
  /** Requesting user ID (for audit) */
  userId: z.string().optional(),
  /** Request source (e.g., 'ui', 'api', 'cli') */
  source: z.string().optional(),
  /** Custom expiry override (minutes) */
  expiryMinutes: z.number().int().min(1).max(1440).optional(),
});

export type ArtifactAccessRequest = z.infer<typeof ArtifactAccessRequestSchema>;

// =============================================================================
// Signed URL Result
// =============================================================================

/**
 * Signed URL result schema
 */
export const SignedUrlResultSchema = z.object({
  /** The signed URL */
  url: z.string().url(),
  /** Expiration timestamp (ISO 8601) */
  expiresAt: z.string().datetime(),
  /** Artifact reference */
  artifact: ArtifactReferenceSchema,
  /** Access action */
  action: AccessAction,
  /** Backend type that generated the URL */
  backend: z.enum(['gcs', 'local', 'mock']),
  /** Audit event ID (if logged) */
  auditEventId: z.string().optional(),
});

export type SignedUrlResult = z.infer<typeof SignedUrlResultSchema>;

// =============================================================================
// Audit Event
// =============================================================================

/**
 * Artifact access audit event schema
 */
export const ArtifactAccessAuditEventSchema = z.object({
  /** Event ID */
  id: z.string().uuid(),
  /** Timestamp */
  timestamp: z.string().datetime(),
  /** Tenant ID */
  tenantId: z.string(),
  /** Repository ID */
  repoId: z.string(),
  /** Run ID */
  runId: z.string().uuid(),
  /** Artifact name */
  artifactName: z.string(),
  /** Access action */
  action: AccessAction,
  /** User ID (if available) */
  userId: z.string().optional(),
  /** Request source */
  source: z.string().optional(),
  /** Signed URL expiration */
  expiresAt: z.string().datetime(),
  /** Whether tenant ownership was validated */
  tenantValidated: z.boolean(),
  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type ArtifactAccessAuditEvent = z.infer<typeof ArtifactAccessAuditEventSchema>;

// =============================================================================
// Validation Result
// =============================================================================

/**
 * Tenant validation result
 */
export interface TenantValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation error message (if invalid) */
  error?: string;
  /** Tenant ID that was validated */
  tenantId: string;
  /** Run ID that was validated */
  runId: string;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Base error for artifact access errors
 */
export class ArtifactAccessError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly artifact?: ArtifactReference
  ) {
    super(message);
    this.name = 'ArtifactAccessError';
  }
}

/**
 * Error thrown when tenant validation fails
 */
export class TenantAccessDeniedError extends ArtifactAccessError {
  constructor(message: string, artifact?: ArtifactReference) {
    super(message, 'TENANT_ACCESS_DENIED', artifact);
    this.name = 'TenantAccessDeniedError';
  }
}

/**
 * Error thrown when artifact is not found
 */
export class ArtifactNotFoundError extends ArtifactAccessError {
  constructor(message: string, artifact?: ArtifactReference) {
    super(message, 'ARTIFACT_NOT_FOUND', artifact);
    this.name = 'ArtifactNotFoundError';
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class InvalidConfigurationError extends ArtifactAccessError {
  constructor(message: string) {
    super(message, 'INVALID_CONFIGURATION');
    this.name = 'InvalidConfigurationError';
  }
}
