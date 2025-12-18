/**
 * Phase 29: Marketplace Types
 *
 * Data model for connector marketplace catalog and package hosting.
 *
 * @module @gwi/core/marketplace/types
 */

import { z } from 'zod';
import type { ConnectorCapability, ConnectorManifest } from '../connectors/manifest.js';

// =============================================================================
// Published Connector Schema
// =============================================================================

/**
 * Published connector metadata in the marketplace
 */
export const PublishedConnectorSchema = z.object({
  /** Connector ID (unique identifier) */
  id: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/),

  /** Display name */
  displayName: z.string().min(1),

  /** Description */
  description: z.string(),

  /** Author/Publisher */
  author: z.string().min(1),

  /** Repository URL */
  repositoryUrl: z.string().url().optional(),

  /** Documentation URL */
  documentationUrl: z.string().url().optional(),

  /** License SPDX identifier */
  license: z.string().default('MIT'),

  /** Capabilities */
  capabilities: z.array(z.string() as z.ZodType<ConnectorCapability>),

  /** Categories for browsing */
  categories: z.array(z.string()),

  /** Tags for search */
  tags: z.array(z.string()),

  /** Latest published version */
  latestVersion: z.string(),

  /** All available versions */
  versions: z.array(z.string()),

  /** Total download count */
  totalDownloads: z.number().int().nonnegative().default(0),

  /** Verified publisher flag */
  verified: z.boolean().default(false),

  /** Featured in marketplace */
  featured: z.boolean().default(false),

  /** Icon URL */
  iconUrl: z.string().url().optional(),

  /** First published */
  createdAt: z.string().datetime(),

  /** Last updated */
  updatedAt: z.string().datetime(),
});
export type PublishedConnector = z.infer<typeof PublishedConnectorSchema>;

// =============================================================================
// Connector Version Schema
// =============================================================================

/**
 * Connector version metadata
 */
export const ConnectorVersionSchema = z.object({
  /** Connector ID */
  connectorId: z.string(),

  /** Semver version */
  version: z.string(),

  /** Full manifest */
  manifest: z.custom<ConnectorManifest>(),

  /** GCS tarball URL */
  tarballUrl: z.string().url(),

  /** SHA-256 checksum of tarball */
  tarballChecksum: z.string(),

  /** Tarball size in bytes */
  tarballSize: z.number().int().positive(),

  /** Signature file URL */
  signatureUrl: z.string().url(),

  /** Key ID used for signing */
  signingKeyId: z.string(),

  /** Changelog for this version */
  changelog: z.string().optional(),

  /** Release notes */
  releaseNotes: z.string().optional(),

  /** Version download count */
  downloads: z.number().int().nonnegative().default(0),

  /** Pre-release flag */
  prerelease: z.boolean().default(false),

  /** Deprecated flag */
  deprecated: z.boolean().default(false),

  /** Deprecation reason */
  deprecationReason: z.string().optional(),

  /** Minimum GWI version required */
  minGwiVersion: z.string().optional(),

  /** Published timestamp */
  publishedAt: z.string().datetime(),

  /** Publisher user ID */
  publishedBy: z.string(),
});
export type ConnectorVersion = z.infer<typeof ConnectorVersionSchema>;

// =============================================================================
// Installation Record Schema
// =============================================================================

/**
 * Tenant connector installation record
 */
export const ConnectorInstallationSchema = z.object({
  /** Installation ID */
  id: z.string(),

  /** Tenant ID */
  tenantId: z.string(),

  /** Connector ID */
  connectorId: z.string(),

  /** Installed version */
  version: z.string(),

  /** Installation status */
  status: z.enum(['pending', 'installing', 'installed', 'failed', 'uninstalling']),

  /** Configuration provided during install */
  config: z.record(z.unknown()).optional(),

  /** Approval ID (if policy required approval) */
  approvalId: z.string().optional(),

  /** Installed by user ID */
  installedBy: z.string(),

  /** Installation timestamp */
  installedAt: z.string().datetime(),

  /** Last used timestamp */
  lastUsedAt: z.string().datetime().optional(),

  /** Error message if failed */
  error: z.string().optional(),
});
export type ConnectorInstallation = z.infer<typeof ConnectorInstallationSchema>;

// =============================================================================
// Publish Request Schema
// =============================================================================

/**
 * Connector publish request
 */
export const PublishRequestSchema = z.object({
  /** Connector ID */
  connectorId: z.string(),

  /** Version to publish */
  version: z.string(),

  /** Manifest */
  manifest: z.custom<ConnectorManifest>(),

  /** Tarball checksum */
  tarballChecksum: z.string(),

  /** Changelog */
  changelog: z.string().optional(),

  /** Release notes */
  releaseNotes: z.string().optional(),

  /** Pre-release flag */
  prerelease: z.boolean().default(false),
});
export type PublishRequest = z.infer<typeof PublishRequestSchema>;

// =============================================================================
// Search Types
// =============================================================================

/**
 * Marketplace search options
 */
export interface MarketplaceSearchOptions {
  query?: string;
  categories?: string[];
  capabilities?: ConnectorCapability[];
  tags?: string[];
  verified?: boolean;
  featured?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: 'downloads' | 'updated' | 'name';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Search result
 */
export interface MarketplaceSearchResult {
  connectors: PublishedConnector[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// =============================================================================
// Install Request Schema
// =============================================================================

/**
 * Connector install request
 */
export const InstallRequestSchema = z.object({
  /** Connector ID */
  connectorId: z.string(),

  /** Version to install (or 'latest') */
  version: z.string().default('latest'),

  /** Configuration for the connector */
  config: z.record(z.unknown()).optional(),
});
export type InstallRequest = z.infer<typeof InstallRequestSchema>;

// =============================================================================
// Pending Install Request Schema (Phase 30 fixup: Firestore persistence)
// =============================================================================

/**
 * Pending connector install request (requires approval)
 */
export const PendingInstallRequestSchema = z.object({
  /** Request ID */
  id: z.string(),

  /** Tenant ID */
  tenantId: z.string(),

  /** Connector ID */
  connectorId: z.string(),

  /** Version to install */
  version: z.string(),

  /** Requested by user ID */
  requestedBy: z.string(),

  /** Request timestamp */
  requestedAt: z.string().datetime(),

  /** Required number of approvals */
  requiredApprovals: z.number().int().positive(),

  /** Current approvals count */
  currentApprovalCount: z.number().int().nonnegative().default(0),

  /** Approval IDs */
  approvalIds: z.array(z.string()).default([]),

  /** Policy ID that triggered approval requirement */
  policyId: z.string(),

  /** Request status */
  status: z.enum(['pending', 'approved', 'denied', 'expired']),

  /** Denial reason (if denied) */
  denialReason: z.string().optional(),

  /** Expiration timestamp */
  expiresAt: z.string().datetime(),

  /** Idempotency key for deduplication */
  idempotencyKey: z.string(),

  /** Created timestamp */
  createdAt: z.string().datetime(),

  /** Updated timestamp */
  updatedAt: z.string().datetime(),
});
export type PendingInstallRequestRecord = z.infer<typeof PendingInstallRequestSchema>;

// =============================================================================
// Publisher Schema (Phase 30 fixup: Key registry + revocation)
// =============================================================================

/**
 * Publisher public key record
 */
export const PublisherKeySchema = z.object({
  /** Key ID */
  keyId: z.string(),

  /** Public key (base64-encoded Ed25519) */
  publicKey: z.string(),

  /** Key status */
  status: z.enum(['active', 'revoked', 'expired']),

  /** Key fingerprint (SHA256 of public key) */
  fingerprint: z.string(),

  /** Created timestamp */
  createdAt: z.string().datetime(),

  /** Revoked timestamp (if revoked) */
  revokedAt: z.string().datetime().optional(),

  /** Revocation reason */
  revocationReason: z.string().optional(),

  /** Expiration timestamp */
  expiresAt: z.string().datetime().optional(),
});
export type PublisherKey = z.infer<typeof PublisherKeySchema>;

/**
 * Publisher record in registry
 */
export const PublisherSchema = z.object({
  /** Publisher ID (same as user ID or org ID) */
  id: z.string(),

  /** Display name */
  displayName: z.string(),

  /** Email */
  email: z.string().email(),

  /** Verified publisher flag */
  verified: z.boolean().default(false),

  /** Verification timestamp */
  verifiedAt: z.string().datetime().optional(),

  /** Active public keys */
  publicKeys: z.array(PublisherKeySchema),

  /** Revoked keys (kept for audit) */
  revokedKeys: z.array(PublisherKeySchema).default([]),

  /** Organization ID (if org publisher) */
  organizationId: z.string().optional(),

  /** URL to publisher page */
  url: z.string().url().optional(),

  /** Publisher status */
  status: z.enum(['active', 'suspended', 'banned']).default('active'),

  /** Suspension reason */
  suspensionReason: z.string().optional(),

  /** Created timestamp */
  createdAt: z.string().datetime(),

  /** Updated timestamp */
  updatedAt: z.string().datetime(),
});
export type Publisher = z.infer<typeof PublisherSchema>;

// =============================================================================
// Categories
// =============================================================================

/**
 * Standard marketplace categories
 */
export const MARKETPLACE_CATEGORIES = [
  'version-control',
  'ci-cd',
  'monitoring',
  'security',
  'testing',
  'documentation',
  'communication',
  'project-management',
  'data',
  'infrastructure',
  'other',
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

// =============================================================================
// Validation
// =============================================================================

export function validatePublishedConnector(data: unknown): {
  valid: boolean;
  connector?: PublishedConnector;
  errors?: string[];
} {
  const result = PublishedConnectorSchema.safeParse(data);
  if (result.success) {
    return { valid: true, connector: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}

export function validateConnectorVersion(data: unknown): {
  valid: boolean;
  version?: ConnectorVersion;
  errors?: string[];
} {
  const result = ConnectorVersionSchema.safeParse(data);
  if (result.success) {
    return { valid: true, version: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}
