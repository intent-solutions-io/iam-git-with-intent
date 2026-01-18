/**
 * Report Signing Service
 *
 * Epic D: Policy & Audit - Story D4: Compliance Reports
 * Task D4.4: Add report signing
 *
 * Provides cryptographic signing and verification for compliance reports.
 * Ensures report integrity and authenticity through digital signatures.
 *
 * @module @gwi/core/policy/report-signing
 */

import { z } from 'zod';
import { createSign, createVerify, createHash, generateKeyPairSync } from 'crypto';
import type { ComplianceReportTemplate } from './report-templates.js';
import { formatReportAsJSON } from './report-templates.js';

// =============================================================================
// Types and Schemas
// =============================================================================

/**
 * Supported signature algorithms
 */
export const SignatureAlgorithm = z.enum([
  'RSA-SHA256',
  'RSA-SHA384',
  'RSA-SHA512',
]);
export type SignatureAlgorithm = z.infer<typeof SignatureAlgorithm>;

/**
 * Signer identity information
 */
export const SignerIdentity = z.object({
  /** Unique signer ID */
  signerId: z.string().min(1),
  /** Signer name */
  name: z.string().min(1),
  /** Signer title/role */
  title: z.string().optional(),
  /** Signer organization */
  organization: z.string().optional(),
  /** Signer email */
  email: z.string().email().optional(),
});
export type SignerIdentity = z.infer<typeof SignerIdentity>;

/**
 * Key pair information for signing
 */
export const SigningKeyInfo = z.object({
  /** Unique key ID */
  keyId: z.string().min(1),
  /** Key algorithm */
  algorithm: SignatureAlgorithm,
  /** Key creation timestamp */
  createdAt: z.date(),
  /** Key expiration timestamp (optional) */
  expiresAt: z.date().optional(),
  /** Key fingerprint (hash of public key) */
  fingerprint: z.string(),
  /** Signer identity associated with key */
  signer: SignerIdentity.optional(),
});
export type SigningKeyInfo = z.infer<typeof SigningKeyInfo>;

/**
 * Report signature
 */
export const ReportSignature = z.object({
  /** Signature ID */
  signatureId: z.string(),
  /** Signature algorithm used */
  algorithm: SignatureAlgorithm,
  /** Key ID used for signing */
  keyId: z.string(),
  /** Key fingerprint */
  keyFingerprint: z.string(),
  /** Signer identity */
  signer: SignerIdentity,
  /** Timestamp when signed */
  signedAt: z.date(),
  /** Hash of the report content */
  contentHash: z.string(),
  /** Hash algorithm used for content */
  hashAlgorithm: z.enum(['sha256', 'sha384', 'sha512']),
  /** Base64-encoded signature value */
  signatureValue: z.string(),
  /** Report ID that was signed */
  reportId: z.string(),
  /** Report version that was signed */
  reportVersion: z.string(),
});
export type ReportSignature = z.infer<typeof ReportSignature>;

/**
 * Signed report wrapper
 */
export const SignedReport = z.object({
  /** Original report */
  report: z.custom<ComplianceReportTemplate>(),
  /** Report content as JSON string */
  content: z.string(),
  /** Signature information */
  signature: ReportSignature,
  /** Verification status (populated after verification) */
  verified: z.boolean().optional(),
  /** Verification timestamp */
  verifiedAt: z.date().optional(),
});
export type SignedReport = z.infer<typeof SignedReport>;

/**
 * Signature verification result
 */
export const SignatureVerificationResult = z.object({
  /** Whether the signature is valid */
  valid: z.boolean(),
  /** Verification timestamp */
  verifiedAt: z.date(),
  /** Signature that was verified */
  signature: ReportSignature,
  /** Errors if verification failed */
  errors: z.array(z.string()).optional(),
  /** Warnings (e.g., key expiration) */
  warnings: z.array(z.string()).optional(),
});
export type SignatureVerificationResult = z.infer<typeof SignatureVerificationResult>;

/**
 * Signing options
 */
export interface SigningOptions {
  /** Signature algorithm */
  algorithm?: SignatureAlgorithm;
  /** Hash algorithm for content */
  hashAlgorithm?: 'sha256' | 'sha384' | 'sha512';
  /** Additional metadata to include */
  metadata?: Record<string, unknown>;
}

/**
 * Key pair for signing operations
 */
export interface SigningKeyPair {
  /** Key information */
  info: SigningKeyInfo;
  /** PEM-encoded private key */
  privateKey: string;
  /** PEM-encoded public key */
  publicKey: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique signature ID
 */
export function generateSignatureId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `sig-${timestamp}-${random}`;
}

/**
 * Compute key fingerprint from public key
 */
export function computeKeyFingerprint(publicKey: string): string {
  const hash = createHash('sha256');
  hash.update(publicKey);
  return hash.digest('hex').substring(0, 32);
}

/**
 * Compute content hash
 */
export function computeReportHash(
  content: string,
  algorithm: 'sha256' | 'sha384' | 'sha512' = 'sha256'
): string {
  const hash = createHash(algorithm);
  hash.update(content, 'utf8');
  return hash.digest('hex');
}

/**
 * Canonicalize report content for consistent hashing
 */
export function canonicalizeReportContent(report: ComplianceReportTemplate): string {
  // Use the standard JSON formatter for consistency
  return formatReportAsJSON(report);
}

/**
 * Map hash algorithm to signature algorithm suffix
 */
function getSignatureAlgorithmForHash(
  hashAlgorithm: 'sha256' | 'sha384' | 'sha512'
): SignatureAlgorithm {
  switch (hashAlgorithm) {
    case 'sha256':
      return 'RSA-SHA256';
    case 'sha384':
      return 'RSA-SHA384';
    case 'sha512':
      return 'RSA-SHA512';
    default:
      return 'RSA-SHA256';
  }
}

// =============================================================================
// Key Generation
// =============================================================================

/**
 * Generate a new signing key pair
 */
export function generateSigningKeyPair(
  signer: SignerIdentity,
  options?: {
    algorithm?: SignatureAlgorithm;
    keySize?: number;
    expiresInDays?: number;
  }
): SigningKeyPair {
  const algorithm = options?.algorithm ?? 'RSA-SHA256';
  const keySize = options?.keySize ?? 2048;
  const expiresInDays = options?.expiresInDays;

  // Generate RSA key pair
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: keySize,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  const fingerprint = computeKeyFingerprint(publicKey);
  const createdAt = new Date();
  const expiresAt = expiresInDays
    ? new Date(createdAt.getTime() + expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;

  const keyId = `key-${fingerprint.substring(0, 8)}-${Date.now().toString(36)}`;

  return {
    info: {
      keyId,
      algorithm,
      createdAt,
      expiresAt,
      fingerprint,
      signer,
    },
    privateKey,
    publicKey,
  };
}

// =============================================================================
// Signing Functions
// =============================================================================

/**
 * Sign a compliance report
 */
export function signReport(
  report: ComplianceReportTemplate,
  privateKey: string,
  keyInfo: SigningKeyInfo,
  options?: SigningOptions
): SignedReport {
  const hashAlgorithm = options?.hashAlgorithm ?? 'sha256';
  const algorithm = options?.algorithm ?? getSignatureAlgorithmForHash(hashAlgorithm);

  // Get canonical content
  const content = canonicalizeReportContent(report);

  // Compute content hash
  const contentHash = computeReportHash(content, hashAlgorithm);

  // Create signature
  const sign = createSign(algorithm);
  sign.update(contentHash);
  sign.end();
  const signatureValue = sign.sign(privateKey, 'base64');

  // Build signature object
  const signature: ReportSignature = {
    signatureId: generateSignatureId(),
    algorithm,
    keyId: keyInfo.keyId,
    keyFingerprint: keyInfo.fingerprint,
    signer: keyInfo.signer ?? {
      signerId: keyInfo.keyId,
      name: 'Unknown Signer',
    },
    signedAt: new Date(),
    contentHash,
    hashAlgorithm,
    signatureValue,
    reportId: report.reportId,
    reportVersion: report.version,
  };

  return {
    report,
    content,
    signature,
  };
}

/**
 * Sign report content directly (for pre-formatted content)
 */
export function signReportContent(
  content: string,
  reportId: string,
  reportVersion: string,
  privateKey: string,
  keyInfo: SigningKeyInfo,
  options?: SigningOptions
): ReportSignature {
  const hashAlgorithm = options?.hashAlgorithm ?? 'sha256';
  const algorithm = options?.algorithm ?? getSignatureAlgorithmForHash(hashAlgorithm);

  // Compute content hash
  const contentHash = computeReportHash(content, hashAlgorithm);

  // Create signature
  const sign = createSign(algorithm);
  sign.update(contentHash);
  sign.end();
  const signatureValue = sign.sign(privateKey, 'base64');

  return {
    signatureId: generateSignatureId(),
    algorithm,
    keyId: keyInfo.keyId,
    keyFingerprint: keyInfo.fingerprint,
    signer: keyInfo.signer ?? {
      signerId: keyInfo.keyId,
      name: 'Unknown Signer',
    },
    signedAt: new Date(),
    contentHash,
    hashAlgorithm,
    signatureValue,
    reportId,
    reportVersion,
  };
}

// =============================================================================
// Verification Functions
// =============================================================================

/**
 * Verify a signed report
 */
export function verifyReportSignature(
  signedReport: SignedReport,
  publicKey: string
): SignatureVerificationResult {
  const { content, signature } = signedReport;

  return verifySignature(content, signature, publicKey);
}

/**
 * Verify a signature against content
 */
export function verifySignature(
  content: string,
  signature: ReportSignature,
  publicKey: string
): SignatureVerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const verifiedAt = new Date();

  try {
    // Verify content hash matches
    const computedHash = computeReportHash(content, signature.hashAlgorithm);
    if (computedHash !== signature.contentHash) {
      errors.push('Content hash mismatch - report may have been modified');
    }

    // Verify key fingerprint
    const computedFingerprint = computeKeyFingerprint(publicKey);
    if (computedFingerprint !== signature.keyFingerprint) {
      warnings.push('Key fingerprint does not match - different key being used for verification');
    }

    // Verify cryptographic signature
    const verify = createVerify(signature.algorithm);
    verify.update(signature.contentHash);
    verify.end();

    const signatureValid = verify.verify(
      publicKey,
      signature.signatureValue,
      'base64'
    );

    if (!signatureValid) {
      errors.push('Cryptographic signature verification failed');
    }

    return {
      valid: errors.length === 0,
      verifiedAt,
      signature,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    errors.push(
      `Verification error: ${error instanceof Error ? error.message : String(error)}`
    );

    return {
      valid: false,
      verifiedAt,
      signature,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

/**
 * Quick verification - returns boolean only
 */
export function isSignatureValid(
  content: string,
  signature: ReportSignature,
  publicKey: string
): boolean {
  const result = verifySignature(content, signature, publicKey);
  return result.valid;
}

// =============================================================================
// Report Signer Service
// =============================================================================

/**
 * Report signer configuration
 */
export interface ReportSignerConfig {
  /** Default signing key pair */
  defaultKeyPair?: SigningKeyPair;
  /** Additional key pairs by ID */
  keyPairs?: Map<string, SigningKeyPair>;
  /** Default signing options */
  defaultOptions?: SigningOptions;
  /** Public keys for verification (by key ID) */
  trustedPublicKeys?: Map<string, string>;
}

/**
 * Report signer service for managing signing operations
 */
export class ReportSigner {
  private defaultKeyPair?: SigningKeyPair;
  private keyPairs: Map<string, SigningKeyPair>;
  private trustedPublicKeys: Map<string, string>;
  private defaultOptions: SigningOptions;

  constructor(config: ReportSignerConfig = {}) {
    this.defaultKeyPair = config.defaultKeyPair;
    this.keyPairs = config.keyPairs ?? new Map();
    this.trustedPublicKeys = config.trustedPublicKeys ?? new Map();
    this.defaultOptions = config.defaultOptions ?? {};

    // Add default key pair to keyPairs map
    if (this.defaultKeyPair) {
      this.keyPairs.set(this.defaultKeyPair.info.keyId, this.defaultKeyPair);
    }
  }

  /**
   * Add a key pair for signing
   */
  addKeyPair(keyPair: SigningKeyPair, setAsDefault = false): void {
    this.keyPairs.set(keyPair.info.keyId, keyPair);
    this.trustedPublicKeys.set(keyPair.info.keyId, keyPair.publicKey);

    if (setAsDefault) {
      this.defaultKeyPair = keyPair;
    }
  }

  /**
   * Remove a key pair
   */
  removeKeyPair(keyId: string): boolean {
    if (this.defaultKeyPair?.info.keyId === keyId) {
      this.defaultKeyPair = undefined;
    }
    this.trustedPublicKeys.delete(keyId);
    return this.keyPairs.delete(keyId);
  }

  /**
   * Add a trusted public key for verification
   */
  addTrustedPublicKey(keyId: string, publicKey: string): void {
    this.trustedPublicKeys.set(keyId, publicKey);
  }

  /**
   * Remove a trusted public key
   */
  removeTrustedPublicKey(keyId: string): boolean {
    return this.trustedPublicKeys.delete(keyId);
  }

  /**
   * Get a key pair by ID
   */
  getKeyPair(keyId: string): SigningKeyPair | undefined {
    return this.keyPairs.get(keyId);
  }

  /**
   * List all key IDs
   */
  listKeyIds(): string[] {
    return Array.from(this.keyPairs.keys());
  }

  /**
   * Sign a report using the default key
   */
  sign(
    report: ComplianceReportTemplate,
    options?: SigningOptions
  ): SignedReport {
    if (!this.defaultKeyPair) {
      throw new Error('No default signing key configured');
    }

    return signReport(
      report,
      this.defaultKeyPair.privateKey,
      this.defaultKeyPair.info,
      { ...this.defaultOptions, ...options }
    );
  }

  /**
   * Sign a report using a specific key
   */
  signWithKey(
    report: ComplianceReportTemplate,
    keyId: string,
    options?: SigningOptions
  ): SignedReport {
    const keyPair = this.keyPairs.get(keyId);
    if (!keyPair) {
      throw new Error(`Key not found: ${keyId}`);
    }

    return signReport(
      report,
      keyPair.privateKey,
      keyPair.info,
      { ...this.defaultOptions, ...options }
    );
  }

  /**
   * Verify a signed report
   */
  verify(signedReport: SignedReport): SignatureVerificationResult {
    const { signature } = signedReport;

    // Look up public key
    let publicKey = this.trustedPublicKeys.get(signature.keyId);

    // Also check key pairs
    if (!publicKey) {
      const keyPair = this.keyPairs.get(signature.keyId);
      if (keyPair) {
        publicKey = keyPair.publicKey;
      }
    }

    if (!publicKey) {
      return {
        valid: false,
        verifiedAt: new Date(),
        signature,
        errors: [`Unknown key ID: ${signature.keyId}. Add the public key to trusted keys.`],
      };
    }

    return verifyReportSignature(signedReport, publicKey);
  }

  /**
   * Verify with an explicit public key
   */
  verifyWithKey(signedReport: SignedReport, publicKey: string): SignatureVerificationResult {
    return verifyReportSignature(signedReport, publicKey);
  }

  /**
   * Generate a new key pair and add it to the signer
   */
  generateKey(
    signer: SignerIdentity,
    options?: {
      algorithm?: SignatureAlgorithm;
      keySize?: number;
      expiresInDays?: number;
      setAsDefault?: boolean;
    }
  ): SigningKeyPair {
    const keyPair = generateSigningKeyPair(signer, options);
    this.addKeyPair(keyPair, options?.setAsDefault);
    return keyPair;
  }

  /**
   * Check if a key has expired
   */
  isKeyExpired(keyId: string): boolean {
    const keyPair = this.keyPairs.get(keyId);
    if (!keyPair) return true;
    if (!keyPair.info.expiresAt) return false;
    return keyPair.info.expiresAt < new Date();
  }

  /**
   * Get key info by ID
   */
  getKeyInfo(keyId: string): SigningKeyInfo | undefined {
    return this.keyPairs.get(keyId)?.info;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a report signer with a new key pair
 */
export function createReportSigner(
  signer: SignerIdentity,
  options?: {
    algorithm?: SignatureAlgorithm;
    keySize?: number;
    expiresInDays?: number;
  }
): ReportSigner {
  const keyPair = generateSigningKeyPair(signer, options);
  return new ReportSigner({ defaultKeyPair: keyPair });
}

/**
 * Create a report signer with an existing key pair
 */
export function createReportSignerWithKey(
  keyPair: SigningKeyPair
): ReportSigner {
  return new ReportSigner({ defaultKeyPair: keyPair });
}

/**
 * Create a verifier-only signer (no private key, just public keys for verification)
 */
export function createReportVerifier(
  trustedPublicKeys: Map<string, string>
): ReportSigner {
  return new ReportSigner({ trustedPublicKeys });
}

// =============================================================================
// Singleton Management
// =============================================================================

let globalReportSigner: ReportSigner | null = null;

/**
 * Initialize the global report signer
 */
export function initializeReportSigner(
  signer: SignerIdentity,
  options?: {
    algorithm?: SignatureAlgorithm;
    keySize?: number;
    expiresInDays?: number;
  }
): ReportSigner {
  globalReportSigner = createReportSigner(signer, options);
  return globalReportSigner;
}

/**
 * Initialize with an existing key pair
 */
export function initializeReportSignerWithKey(keyPair: SigningKeyPair): ReportSigner {
  globalReportSigner = createReportSignerWithKey(keyPair);
  return globalReportSigner;
}

/**
 * Get the global report signer
 */
export function getReportSigner(): ReportSigner {
  if (!globalReportSigner) {
    throw new Error('Report signer not initialized. Call initializeReportSigner first.');
  }
  return globalReportSigner;
}

/**
 * Set the global report signer
 */
export function setReportSigner(signer: ReportSigner): void {
  globalReportSigner = signer;
}

/**
 * Reset the global report signer
 */
export function resetReportSigner(): void {
  globalReportSigner = null;
}
