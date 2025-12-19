/**
 * GCS Artifact Store (A8: Artifact Model)
 *
 * Cloud Storage-backed artifact storage for multi-tenant run outputs.
 * Provides signed URLs for secure UI access and enforces tenant isolation.
 *
 * Path Layout: gs://{bucket}/{tenantId}/{repoId}/{runId}/{artifactName}
 *
 * Features:
 * - Tenant-isolated artifact storage
 * - Signed URL generation for secure UI access
 * - Secret detection to prevent credential leakage
 * - Integrity hashes for audit/verification
 *
 * @module @gwi/core/run-bundle/gcs-artifact-store
 */

import { Storage, Bucket, File, GetSignedUrlConfig } from '@google-cloud/storage';
import { createHash } from 'crypto';
import type { ArtifactName } from './types.js';

// =============================================================================
// Configuration
// =============================================================================

/**
 * GCS artifact store configuration
 */
export interface GcsArtifactStoreConfig {
  /** GCS bucket name for artifacts */
  bucketName: string;
  /** Signed URL expiration in minutes (default: 15) */
  signedUrlExpiryMinutes?: number;
  /** GCP project ID (optional, uses ADC default) */
  projectId?: string;
}

/**
 * Artifact metadata stored alongside content
 */
export interface ArtifactMetadata {
  tenantId: string;
  repoId: string;
  runId: string;
  artifactName: string;
  contentHash: string;
  contentType: string;
  size: number;
  createdAt: string;
  createdBy?: string;
}

/**
 * Result of uploading an artifact
 */
export interface ArtifactUploadResult {
  path: string;
  hash: string;
  size: number;
  bucket: string;
}

/**
 * Secret detection patterns
 */
const SECRET_PATTERNS = [
  // API Keys
  /(?:api[_-]?key|apikey)\s*[=:]\s*['"]?[a-zA-Z0-9_-]{20,}/gi,
  /sk-[a-zA-Z0-9]{32,}/g, // OpenAI/Anthropic
  /ghp_[a-zA-Z0-9]{36}/g, // GitHub personal access token
  /gho_[a-zA-Z0-9]{36}/g, // GitHub OAuth token
  /ghu_[a-zA-Z0-9]{36}/g, // GitHub user-to-server token
  /ghs_[a-zA-Z0-9]{36}/g, // GitHub server-to-server token
  /ghr_[a-zA-Z0-9]{36}/g, // GitHub refresh token

  // AWS
  /AKIA[0-9A-Z]{16}/g, // AWS access key
  /(?:aws[_-]?secret|secret[_-]?key)\s*[=:]\s*['"]?[a-zA-Z0-9/+=]{40}/gi,

  // GCP
  /AIza[0-9A-Za-z_-]{35}/g, // Google API key
  /ya29\.[a-zA-Z0-9_-]+/g, // Google OAuth token

  // Generic secrets
  /(?:password|passwd|pwd|secret|token|bearer)\s*[=:]\s*['"]?[^\s'"]{8,}/gi,
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  /-----BEGIN CERTIFICATE-----/g,

  // Stripe
  /sk_live_[a-zA-Z0-9]{24,}/g,
  /sk_test_[a-zA-Z0-9]{24,}/g,
  /rk_live_[a-zA-Z0-9]{24,}/g,
  /rk_test_[a-zA-Z0-9]{24,}/g,

  // Slack
  /xox[baprs]-[0-9]{10,}-[a-zA-Z0-9-]+/g,

  // JWT
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
];

// =============================================================================
// Secret Detection
// =============================================================================

/**
 * Detected secret information
 */
export interface DetectedSecret {
  pattern: string;
  line?: number;
  redacted: string;
}

/**
 * Check content for potential secrets
 *
 * @param content - Content to scan
 * @returns Array of detected secrets (empty if clean)
 */
export function detectSecrets(content: string): DetectedSecret[] {
  const detected: DetectedSecret[] = [];
  const lines = content.split('\n');

  for (const pattern of SECRET_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const matches = line.match(pattern);

      if (matches) {
        for (const match of matches) {
          detected.push({
            pattern: pattern.source.slice(0, 30) + '...',
            line: lineNum + 1,
            redacted: match.slice(0, 4) + '***' + match.slice(-4),
          });
        }
      }
    }
  }

  return detected;
}

/**
 * Validate content doesn't contain secrets
 *
 * @param content - Content to validate
 * @throws Error if secrets are detected
 */
export function validateNoSecrets(content: string): void {
  const secrets = detectSecrets(content);
  if (secrets.length > 0) {
    const summary = secrets
      .slice(0, 3)
      .map((s) => `Line ${s.line}: ${s.redacted}`)
      .join('; ');
    throw new Error(
      `Artifact contains ${secrets.length} potential secret(s). First few: ${summary}. ` +
        'Secrets must not be stored in artifacts. Use Secret Manager for sensitive values.'
    );
  }
}

// =============================================================================
// Integrity Hashing
// =============================================================================

/**
 * Compute SHA256 hash of content
 *
 * @param content - Content to hash
 * @returns Hash in format "sha256:{hex}"
 */
export function computeHash(content: string | Buffer): string {
  const hash = createHash('sha256');
  hash.update(content);
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Verify content matches expected hash
 *
 * @param content - Content to verify
 * @param expectedHash - Expected hash (sha256:...)
 * @returns true if hash matches
 */
export function verifyHash(content: string | Buffer, expectedHash: string): boolean {
  const actualHash = computeHash(content);
  return actualHash === expectedHash;
}

// =============================================================================
// GCS Artifact Store
// =============================================================================

/**
 * GCS-backed artifact store for multi-tenant run outputs
 */
export class GcsArtifactStore {
  private storage: Storage;
  private bucket: Bucket;
  private signedUrlExpiryMinutes: number;

  constructor(config: GcsArtifactStoreConfig) {
    this.storage = new Storage({
      projectId: config.projectId,
    });
    this.bucket = this.storage.bucket(config.bucketName);
    this.signedUrlExpiryMinutes = config.signedUrlExpiryMinutes ?? 15;
  }

  /**
   * Get the GCS path for an artifact
   */
  getArtifactPath(tenantId: string, repoId: string, runId: string, artifactName: string): string {
    return `${tenantId}/${repoId}/${runId}/${artifactName}`;
  }

  /**
   * Get a File object for an artifact
   */
  private getFile(tenantId: string, repoId: string, runId: string, artifactName: string): File {
    const path = this.getArtifactPath(tenantId, repoId, runId, artifactName);
    return this.bucket.file(path);
  }

  /**
   * Write an artifact to GCS
   *
   * @param tenantId - Tenant ID for isolation
   * @param repoId - Repository ID
   * @param runId - Run ID
   * @param artifactName - Artifact file name
   * @param content - Content to write (string or object)
   * @param options - Additional options
   * @returns Upload result with path, hash, and size
   * @throws Error if content contains secrets
   */
  async writeArtifact(
    tenantId: string,
    repoId: string,
    runId: string,
    artifactName: ArtifactName | string,
    content: string | object,
    options?: {
      skipSecretValidation?: boolean;
      createdBy?: string;
    }
  ): Promise<ArtifactUploadResult> {
    // Convert object to JSON string
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    // Validate no secrets (unless explicitly skipped for audit logs)
    if (!options?.skipSecretValidation) {
      validateNoSecrets(contentStr);
    }

    // Compute integrity hash
    const hash = computeHash(contentStr);
    const size = Buffer.byteLength(contentStr, 'utf-8');

    // Determine content type
    const contentType = artifactName.endsWith('.json')
      ? 'application/json'
      : artifactName.endsWith('.diff')
        ? 'text/x-diff'
        : artifactName.endsWith('.md')
          ? 'text/markdown'
          : artifactName.endsWith('.log')
            ? 'application/x-ndjson'
            : 'application/octet-stream';

    // Upload to GCS with metadata
    const file = this.getFile(tenantId, repoId, runId, artifactName);
    await file.save(contentStr, {
      contentType,
      metadata: {
        tenantId,
        repoId,
        runId,
        artifactName,
        contentHash: hash,
        createdAt: new Date().toISOString(),
        createdBy: options?.createdBy ?? 'system',
      },
    });

    return {
      path: this.getArtifactPath(tenantId, repoId, runId, artifactName),
      hash,
      size,
      bucket: this.bucket.name,
    };
  }

  /**
   * Read an artifact from GCS
   *
   * @param tenantId - Tenant ID
   * @param repoId - Repository ID
   * @param runId - Run ID
   * @param artifactName - Artifact file name
   * @returns Content as string, or null if not found
   */
  async readArtifact(
    tenantId: string,
    repoId: string,
    runId: string,
    artifactName: ArtifactName | string
  ): Promise<string | null> {
    const file = this.getFile(tenantId, repoId, runId, artifactName);

    try {
      const [content] = await file.download();
      return content.toString('utf-8');
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Read and parse a JSON artifact
   *
   * @param tenantId - Tenant ID
   * @param repoId - Repository ID
   * @param runId - Run ID
   * @param artifactName - Artifact file name
   * @returns Parsed JSON, or null if not found/invalid
   */
  async readJsonArtifact<T = unknown>(
    tenantId: string,
    repoId: string,
    runId: string,
    artifactName: ArtifactName | string
  ): Promise<T | null> {
    const content = await this.readArtifact(tenantId, repoId, runId, artifactName);
    if (!content) return null;

    try {
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  /**
   * Check if an artifact exists
   */
  async artifactExists(
    tenantId: string,
    repoId: string,
    runId: string,
    artifactName: ArtifactName | string
  ): Promise<boolean> {
    const file = this.getFile(tenantId, repoId, runId, artifactName);
    const [exists] = await file.exists();
    return exists;
  }

  /**
   * List all artifacts for a run
   */
  async listArtifacts(tenantId: string, repoId: string, runId: string): Promise<string[]> {
    const prefix = `${tenantId}/${repoId}/${runId}/`;
    const [files] = await this.bucket.getFiles({ prefix });

    return files.map((file) => {
      // Extract artifact name from full path
      const path = file.name;
      return path.slice(prefix.length);
    });
  }

  /**
   * Get artifact metadata
   */
  async getArtifactMetadata(
    tenantId: string,
    repoId: string,
    runId: string,
    artifactName: ArtifactName | string
  ): Promise<ArtifactMetadata | null> {
    const file = this.getFile(tenantId, repoId, runId, artifactName);

    try {
      const [metadata] = await file.getMetadata();
      return {
        tenantId,
        repoId,
        runId,
        artifactName,
        contentHash: (metadata.metadata?.contentHash as string) ?? '',
        contentType: metadata.contentType ?? 'application/octet-stream',
        size: parseInt(metadata.size as string, 10) || 0,
        createdAt: (metadata.metadata?.createdAt as string) ?? metadata.timeCreated ?? '',
        createdBy: metadata.metadata?.createdBy as string | undefined,
      };
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Verify artifact integrity
   *
   * @param tenantId - Tenant ID
   * @param repoId - Repository ID
   * @param runId - Run ID
   * @param artifactName - Artifact file name
   * @returns true if hash matches stored metadata, false otherwise
   */
  async verifyArtifactIntegrity(
    tenantId: string,
    repoId: string,
    runId: string,
    artifactName: ArtifactName | string
  ): Promise<boolean> {
    const [content, metadata] = await Promise.all([
      this.readArtifact(tenantId, repoId, runId, artifactName),
      this.getArtifactMetadata(tenantId, repoId, runId, artifactName),
    ]);

    if (!content || !metadata || !metadata.contentHash) {
      return false;
    }

    return verifyHash(content, metadata.contentHash);
  }

  /**
   * Generate a signed URL for secure artifact access
   *
   * @param tenantId - Tenant ID (for authorization verification)
   * @param repoId - Repository ID
   * @param runId - Run ID
   * @param artifactName - Artifact file name
   * @param action - 'read' or 'write'
   * @param expiryMinutes - Override default expiry (optional)
   * @returns Signed URL
   */
  async getSignedUrl(
    tenantId: string,
    repoId: string,
    runId: string,
    artifactName: ArtifactName | string,
    action: 'read' | 'write' = 'read',
    expiryMinutes?: number
  ): Promise<string> {
    const file = this.getFile(tenantId, repoId, runId, artifactName);
    const expiry = expiryMinutes ?? this.signedUrlExpiryMinutes;

    const config: GetSignedUrlConfig = {
      action: action === 'read' ? 'read' : 'write',
      expires: Date.now() + expiry * 60 * 1000,
      version: 'v4',
    };

    const [url] = await file.getSignedUrl(config);
    return url;
  }

  /**
   * Delete an artifact
   */
  async deleteArtifact(
    tenantId: string,
    repoId: string,
    runId: string,
    artifactName: ArtifactName | string
  ): Promise<void> {
    const file = this.getFile(tenantId, repoId, runId, artifactName);
    await file.delete({ ignoreNotFound: true });
  }

  /**
   * Delete all artifacts for a run
   */
  async deleteRunArtifacts(tenantId: string, repoId: string, runId: string): Promise<number> {
    const prefix = `${tenantId}/${repoId}/${runId}/`;
    const [files] = await this.bucket.getFiles({ prefix });

    await Promise.all(files.map((file) => file.delete()));
    return files.length;
  }

  /**
   * Copy artifact to another location (for archival)
   */
  async copyArtifact(
    sourceTenantId: string,
    sourceRepoId: string,
    sourceRunId: string,
    sourceArtifactName: string,
    destTenantId: string,
    destRepoId: string,
    destRunId: string,
    destArtifactName: string
  ): Promise<void> {
    const sourceFile = this.getFile(sourceTenantId, sourceRepoId, sourceRunId, sourceArtifactName);
    const destPath = this.getArtifactPath(destTenantId, destRepoId, destRunId, destArtifactName);

    await sourceFile.copy(destPath);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let defaultStore: GcsArtifactStore | null = null;

/**
 * Get or create the default GCS artifact store
 *
 * @param config - Configuration (required on first call)
 * @returns GCS artifact store instance
 */
export function getGcsArtifactStore(config?: GcsArtifactStoreConfig): GcsArtifactStore {
  if (!defaultStore) {
    if (!config) {
      // Try to get from environment
      const bucketName = process.env.GWI_ARTIFACTS_BUCKET;
      if (!bucketName) {
        throw new Error(
          'GCS artifact store not configured. Provide config or set GWI_ARTIFACTS_BUCKET environment variable.'
        );
      }
      defaultStore = new GcsArtifactStore({
        bucketName,
        projectId: process.env.GCP_PROJECT_ID,
        signedUrlExpiryMinutes: parseInt(process.env.GWI_SIGNED_URL_EXPIRY_MINUTES ?? '15', 10),
      });
    } else {
      defaultStore = new GcsArtifactStore(config);
    }
  }
  return defaultStore;
}

/**
 * Reset the default store (for testing)
 */
export function resetGcsArtifactStore(): void {
  defaultStore = null;
}
