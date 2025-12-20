/**
 * Artifact Access Module
 *
 * Provides secure artifact access through signed URL generation.
 * Supports both GCS (production) and local/mock (development) backends.
 *
 * @module @gwi/core/artifacts
 */

// Types
export type {
  SignedUrlConfig,
  ArtifactReference,
  ArtifactAccessRequest,
  SignedUrlResult,
  ArtifactAccessAuditEvent,
  TenantValidationResult,
} from './types.js';

export {
  SignedUrlConfigSchema,
  ArtifactReferenceSchema,
  AccessAction,
  ArtifactAccessRequestSchema,
  SignedUrlResultSchema,
  ArtifactAccessAuditEventSchema,
  ArtifactAccessError,
  TenantAccessDeniedError,
  ArtifactNotFoundError,
  InvalidConfigurationError,
} from './types.js';

// Interfaces
export type {
  SignedUrlGenerator,
  TenantValidator,
  ArtifactAuditLogger,
  ArtifactExistenceChecker,
} from './interfaces.js';

// GCS Implementation
export {
  GcsSignedUrlGenerator,
  type GcsSignedUrlGeneratorConfig,
} from './gcs-signed-url-generator.js';

// Local Implementation
export {
  LocalSignedUrlGenerator,
  type LocalSignedUrlGeneratorConfig,
  type LocalUrlMode,
} from './local-signed-url-generator.js';
