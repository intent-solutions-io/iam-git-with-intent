/**
 * Approval Signature Module
 *
 * Phase 25: Approval Commands + Policy-as-Code Enforcement
 *
 * Cryptographic signing and verification of approval records
 * using Ed25519 signatures.
 *
 * @module @gwi/core/approvals/signature
 */

import { createHash, randomBytes, sign, verify, generateKeyPairSync } from 'node:crypto';
import type { SignedApproval, CreateSignedApproval } from './types.js';
import { generateApprovalId } from './types.js';

// =============================================================================
// Key Management Types
// =============================================================================

export interface SigningKeyPair {
  /** Key ID (for lookup) */
  keyId: string;
  /** Public key (base64) */
  publicKey: string;
  /** Private key (base64) - store securely */
  privateKey: string;
  /** Creation timestamp */
  createdAt: string;
  /** Key algorithm */
  algorithm: 'ed25519';
}

export interface PublicKeyRecord {
  keyId: string;
  publicKey: string;
  algorithm: 'ed25519';
  /** Owner of the key (service name, user ID) */
  owner: string;
  /** When key was registered */
  registeredAt: string;
  /** When key expires (optional) */
  expiresAt?: string;
  /** Is key revoked? */
  revoked: boolean;
}

// =============================================================================
// Key Generation
// =============================================================================

/**
 * Generate a new Ed25519 signing key pair
 */
export function generateSigningKeyPair(): SigningKeyPair {
  const keyPair = generateKeyPairSync('ed25519');

  // Export keys
  const publicKey = keyPair.publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64');

  const privateKey = keyPair.privateKey
    .export({ type: 'pkcs8', format: 'der' })
    .toString('base64');

  // Generate key ID
  const keyId = `key-${randomBytes(8).toString('hex')}`;

  return {
    keyId,
    publicKey,
    privateKey,
    createdAt: new Date().toISOString(),
    algorithm: 'ed25519',
  };
}

// =============================================================================
// Payload Canonicalization
// =============================================================================

/**
 * Canonicalize approval payload for signing
 *
 * Creates a deterministic string representation of the approval
 * that can be signed/verified consistently.
 */
export function canonicalizeApprovalPayload(
  approval: Omit<SignedApproval, 'signature' | 'signingKeyId'>
): string {
  // Build canonical object with sorted keys
  const canonical = {
    approvalId: approval.approvalId,
    approver: {
      email: approval.approver.email,
      githubUsername: approval.approver.githubUsername,
      id: approval.approver.id,
      organization: approval.approver.organization,
      type: approval.approver.type,
    },
    approverRole: approval.approverRole,
    comment: approval.comment,
    createdAt: approval.createdAt,
    decision: approval.decision,
    expiresAt: approval.expiresAt,
    intentHash: approval.intentHash,
    patchHash: approval.patchHash,
    reason: approval.reason,
    requestId: approval.requestId,
    scopesApproved: [...approval.scopesApproved].sort(),
    source: approval.source,
    target: {
      candidateId: approval.target.candidateId,
      prNumber: approval.target.prNumber,
      repo: approval.target.repo,
      runId: approval.target.runId,
    },
    targetType: approval.targetType,
    tenantId: approval.tenantId,
    traceId: approval.traceId,
  };

  // JSON stringify with sorted keys
  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

/**
 * Compute hash of approval payload
 */
export function computePayloadHash(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

// =============================================================================
// Signing
// =============================================================================

/**
 * Sign an approval payload
 *
 * @param payload - Canonicalized payload string
 * @param privateKeyBase64 - Base64-encoded private key
 * @returns Base64-encoded signature
 */
export function signPayload(payload: string, privateKeyBase64: string): string {
  // Import private key
  const privateKeyDer = Buffer.from(privateKeyBase64, 'base64');
  const privateKey = {
    key: privateKeyDer,
    format: 'der' as const,
    type: 'pkcs8' as const,
  };

  // Sign
  const signature = sign(null, Buffer.from(payload, 'utf8'), privateKey);

  return signature.toString('base64');
}

/**
 * Create a signed approval from input
 */
export function createSignedApproval(
  input: CreateSignedApproval,
  keyPair: SigningKeyPair
): SignedApproval {
  const approvalId = generateApprovalId();
  const createdAt = new Date().toISOString();

  // Build approval without signature
  const unsignedApproval: Omit<SignedApproval, 'signature' | 'signingKeyId'> = {
    ...input,
    approvalId,
    createdAt,
  };

  // Canonicalize and sign
  const payload = canonicalizeApprovalPayload(unsignedApproval);
  const signature = signPayload(payload, keyPair.privateKey);

  return {
    ...unsignedApproval,
    signature,
    signingKeyId: keyPair.keyId,
  };
}

// =============================================================================
// Verification
// =============================================================================

/**
 * Verify an approval signature
 *
 * @param approval - The signed approval to verify
 * @param publicKeyBase64 - Base64-encoded public key
 * @returns Verification result
 */
export function verifyApprovalSignature(
  approval: SignedApproval,
  publicKeyBase64: string
): VerificationResult {
  try {
    // Import public key
    const publicKeyDer = Buffer.from(publicKeyBase64, 'base64');
    const publicKey = {
      key: publicKeyDer,
      format: 'der' as const,
      type: 'spki' as const,
    };

    // Rebuild canonical payload (without signature fields)
    const { signature, signingKeyId, ...unsignedApproval } = approval;
    const payload = canonicalizeApprovalPayload(unsignedApproval);

    // Verify signature
    const signatureBuffer = Buffer.from(signature, 'base64');
    const isValid = verify(null, Buffer.from(payload, 'utf8'), publicKey, signatureBuffer);

    return {
      valid: isValid,
      error: isValid ? undefined : 'Signature verification failed',
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Verification error',
    };
  }
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
}

// =============================================================================
// Intent Hash
// =============================================================================

/**
 * Compute intent hash from plan/intent document
 */
export function computeIntentHash(intentContent: string): string {
  return createHash('sha256').update(intentContent, 'utf8').digest('hex');
}

/**
 * Compute patch hash from diff content
 */
export function computePatchHash(patchContent: string): string {
  return createHash('sha256').update(patchContent, 'utf8').digest('hex');
}

// =============================================================================
// Key Store Interface
// =============================================================================

/**
 * Interface for key storage/retrieval
 */
export interface KeyStore {
  /** Get public key by ID */
  getPublicKey(keyId: string): Promise<PublicKeyRecord | null>;

  /** Register a new public key */
  registerPublicKey(record: PublicKeyRecord): Promise<void>;

  /** Revoke a key */
  revokeKey(keyId: string): Promise<void>;

  /** List keys for owner */
  listKeys(owner: string): Promise<PublicKeyRecord[]>;
}

/**
 * In-memory key store for testing
 */
export class InMemoryKeyStore implements KeyStore {
  private keys = new Map<string, PublicKeyRecord>();

  async getPublicKey(keyId: string): Promise<PublicKeyRecord | null> {
    return this.keys.get(keyId) || null;
  }

  async registerPublicKey(record: PublicKeyRecord): Promise<void> {
    this.keys.set(record.keyId, record);
  }

  async revokeKey(keyId: string): Promise<void> {
    const key = this.keys.get(keyId);
    if (key) {
      key.revoked = true;
    }
  }

  async listKeys(owner: string): Promise<PublicKeyRecord[]> {
    return Array.from(this.keys.values()).filter((k) => k.owner === owner);
  }

  // Testing helper
  clear(): void {
    this.keys.clear();
  }
}

// =============================================================================
// Verification with Key Lookup
// =============================================================================

/**
 * Verify approval with key lookup
 */
export async function verifyApprovalWithKeyStore(
  approval: SignedApproval,
  keyStore: KeyStore
): Promise<VerificationResult> {
  // Look up public key
  const keyRecord = await keyStore.getPublicKey(approval.signingKeyId);

  if (!keyRecord) {
    return {
      valid: false,
      error: `Signing key not found: ${approval.signingKeyId}`,
    };
  }

  if (keyRecord.revoked) {
    return {
      valid: false,
      error: `Signing key has been revoked: ${approval.signingKeyId}`,
    };
  }

  if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
    return {
      valid: false,
      error: `Signing key has expired: ${approval.signingKeyId}`,
    };
  }

  // Verify signature
  return verifyApprovalSignature(approval, keyRecord.publicKey);
}
