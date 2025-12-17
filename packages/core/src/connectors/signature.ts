/**
 * Connector Signature Verification
 *
 * Phase 9: Ed25519 signature verification for connector packages.
 *
 * Uses @noble/ed25519 for cryptographic operations.
 * Trusted keys are stored in trusted-keys.json.
 *
 * Security model:
 * - Only connectors signed by trusted keys can be installed
 * - Keys can expire
 * - Signature covers the tarball checksum
 *
 * @module @gwi/core/connectors/signature
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

// =============================================================================
// Types
// =============================================================================

/**
 * Signature file format (signature.json)
 */
export interface SignatureFile {
  version: '1.0';
  keyId: string;
  algorithm: 'ed25519';
  checksum: string;
  signature: string;
  signedAt: string;
}

/**
 * Trusted key entry
 */
export interface TrustedKey {
  keyId: string;
  publicKey: string;
  description: string;
  addedAt: string;
  expiresAt?: string;
}

/**
 * Trusted keys configuration
 */
export interface TrustedKeysConfig {
  version: '1.0';
  keys: TrustedKey[];
}

/**
 * Verification result
 */
export interface SignatureVerificationResult {
  valid: boolean;
  keyId?: string;
  error?:
    | 'UNKNOWN_KEY'
    | 'INVALID_SIGNATURE'
    | 'CHECKSUM_MISMATCH'
    | 'KEY_EXPIRED'
    | 'MISSING_SIGNATURE'
    | 'INVALID_FORMAT';
  message?: string;
}

// =============================================================================
// Ed25519 Implementation
// =============================================================================

/**
 * Verify Ed25519 signature
 *
 * Uses @noble/ed25519 if available, otherwise falls back to Node.js crypto
 */
async function verifyEd25519(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): Promise<boolean> {
  try {
    // Try @noble/ed25519 first (preferred, optional dependency)
    // @ts-expect-error Optional dependency - may not be installed
    const ed = await import('@noble/ed25519');
    return await ed.verifyAsync(signature, message, publicKey);
  } catch {
    // Fallback to Node.js crypto
    const crypto = await import('crypto');

    try {
      const keyObject = crypto.createPublicKey({
        key: Buffer.concat([
          // Ed25519 public key DER prefix
          Buffer.from('302a300506032b6570032100', 'hex'),
          Buffer.from(publicKey),
        ]),
        format: 'der',
        type: 'spki',
      });

      return crypto.verify(null, Buffer.from(message), keyObject, Buffer.from(signature));
    } catch {
      return false;
    }
  }
}

// =============================================================================
// Signature Verification
// =============================================================================

/**
 * Verify a signature against a checksum
 */
export async function verifySignature(
  checksum: string,
  signature: SignatureFile,
  trustedKeys: TrustedKeysConfig
): Promise<SignatureVerificationResult> {
  // Validate signature format
  if (signature.version !== '1.0') {
    return {
      valid: false,
      error: 'INVALID_FORMAT',
      message: `Unsupported signature version: ${signature.version}`,
    };
  }

  if (signature.algorithm !== 'ed25519') {
    return {
      valid: false,
      error: 'INVALID_FORMAT',
      message: `Unsupported algorithm: ${signature.algorithm}`,
    };
  }

  // Verify checksum matches
  if (signature.checksum !== checksum) {
    return {
      valid: false,
      error: 'CHECKSUM_MISMATCH',
      message: `Checksum mismatch: expected ${checksum}, signature has ${signature.checksum}`,
    };
  }

  // Find trusted key
  const trustedKey = trustedKeys.keys.find((k) => k.keyId === signature.keyId);
  if (!trustedKey) {
    return {
      valid: false,
      keyId: signature.keyId,
      error: 'UNKNOWN_KEY',
      message: `Unknown signing key: ${signature.keyId}`,
    };
  }

  // Check key expiration
  if (trustedKey.expiresAt) {
    const expiresAt = new Date(trustedKey.expiresAt);
    if (expiresAt < new Date()) {
      return {
        valid: false,
        keyId: signature.keyId,
        error: 'KEY_EXPIRED',
        message: `Key expired on ${trustedKey.expiresAt}`,
      };
    }
  }

  // Verify Ed25519 signature
  try {
    const message = new TextEncoder().encode(checksum);
    const signatureBytes = base64ToBytes(signature.signature);
    const publicKeyBytes = base64ToBytes(trustedKey.publicKey);

    const isValid = await verifyEd25519(message, signatureBytes, publicKeyBytes);

    if (!isValid) {
      return {
        valid: false,
        keyId: signature.keyId,
        error: 'INVALID_SIGNATURE',
        message: 'Signature verification failed',
      };
    }

    return {
      valid: true,
      keyId: signature.keyId,
    };
  } catch (error) {
    return {
      valid: false,
      keyId: signature.keyId,
      error: 'INVALID_SIGNATURE',
      message: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// =============================================================================
// Trusted Keys Management
// =============================================================================

/**
 * Get the default trusted keys path
 */
export function getTrustedKeysPath(): string {
  return process.env.GWI_TRUSTED_KEYS ?? join(homedir(), '.gwi', 'trusted-keys.json');
}

/**
 * Load trusted keys from file
 */
export async function loadTrustedKeys(configPath?: string): Promise<TrustedKeysConfig> {
  const path = configPath ?? getTrustedKeysPath();

  if (!existsSync(path)) {
    // Return default config with GWI official key
    return getDefaultTrustedKeys();
  }

  try {
    const content = await readFile(path, 'utf-8');
    const config = JSON.parse(content) as TrustedKeysConfig;

    // Merge with defaults
    const defaults = getDefaultTrustedKeys();
    const merged: TrustedKeysConfig = {
      version: '1.0',
      keys: [...defaults.keys],
    };

    // Add user keys that aren't duplicates
    for (const key of config.keys) {
      if (!merged.keys.some((k) => k.keyId === key.keyId)) {
        merged.keys.push(key);
      }
    }

    return merged;
  } catch (error) {
    throw new Error(
      `Failed to load trusted keys: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Save trusted keys to file
 */
export async function saveTrustedKeys(
  config: TrustedKeysConfig,
  configPath?: string
): Promise<void> {
  const path = configPath ?? getTrustedKeysPath();

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2));
}

/**
 * Add a trusted key
 */
export async function addTrustedKey(key: TrustedKey, configPath?: string): Promise<void> {
  const config = await loadTrustedKeys(configPath);

  // Check for duplicate
  if (config.keys.some((k) => k.keyId === key.keyId)) {
    throw new Error(`Key with ID '${key.keyId}' already exists`);
  }

  config.keys.push(key);
  await saveTrustedKeys(config, configPath);
}

/**
 * Remove a trusted key
 */
export async function removeTrustedKey(keyId: string, configPath?: string): Promise<boolean> {
  const config = await loadTrustedKeys(configPath);

  const index = config.keys.findIndex((k) => k.keyId === keyId);
  if (index === -1) {
    return false;
  }

  // Don't allow removing default keys
  const defaults = getDefaultTrustedKeys();
  if (defaults.keys.some((k) => k.keyId === keyId)) {
    throw new Error(`Cannot remove built-in key: ${keyId}`);
  }

  config.keys.splice(index, 1);
  await saveTrustedKeys(config, configPath);
  return true;
}

/**
 * List trusted keys
 */
export async function listTrustedKeys(configPath?: string): Promise<TrustedKey[]> {
  const config = await loadTrustedKeys(configPath);
  return config.keys;
}

// =============================================================================
// Default Keys
// =============================================================================

/**
 * Get default trusted keys configuration
 *
 * Includes the official GWI signing key
 */
export function getDefaultTrustedKeys(): TrustedKeysConfig {
  return {
    version: '1.0',
    keys: [
      {
        keyId: 'gwi-official-2025',
        // This is a placeholder public key - would be replaced with real key in production
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        description: 'Git With Intent official signing key (2025)',
        addedAt: '2025-01-01T00:00:00Z',
        expiresAt: '2027-01-01T00:00:00Z',
      },
      {
        keyId: 'gwi-dev-local',
        // Local development key for testing
        publicKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
        description: 'Local development signing key (DO NOT USE IN PRODUCTION)',
        addedAt: '2025-01-01T00:00:00Z',
      },
    ],
  };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Convert base64 to bytes
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert bytes to base64
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Create a signature file object (for signing - would be done server-side)
 */
export function createSignatureFile(
  keyId: string,
  checksum: string,
  signatureBase64: string
): SignatureFile {
  return {
    version: '1.0',
    keyId,
    algorithm: 'ed25519',
    checksum,
    signature: signatureBase64,
    signedAt: new Date().toISOString(),
  };
}

// =============================================================================
// Signing Functions (Phase 21: Real Ed25519 signing)
// =============================================================================

/**
 * Sign a checksum with an Ed25519 private key
 *
 * Uses @noble/ed25519 if available, otherwise falls back to Node.js crypto
 */
export async function signChecksum(
  checksum: string,
  privateKeyBase64: string
): Promise<string> {
  const message = new TextEncoder().encode(checksum);
  const privateKey = base64ToBytes(privateKeyBase64);

  try {
    // Try @noble/ed25519 first (preferred, optional dependency)
    // @ts-expect-error Optional dependency - may not be installed
    const ed = await import('@noble/ed25519');
    const signature = await ed.signAsync(message, privateKey.slice(0, 32));
    return bytesToBase64(signature);
  } catch {
    // Fallback to Node.js crypto
    const crypto = await import('crypto');

    const keyObject = crypto.createPrivateKey({
      key: Buffer.concat([
        // Ed25519 private key PKCS8 prefix
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        Buffer.from(privateKey.slice(0, 32)),
      ]),
      format: 'der',
      type: 'pkcs8',
    });

    const signature = crypto.sign(null, Buffer.from(message), keyObject);
    return bytesToBase64(new Uint8Array(signature));
  }
}

/**
 * Generate a new Ed25519 keypair
 */
export async function generateKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  try {
    // Try @noble/ed25519 first
    // @ts-expect-error Optional dependency - may not be installed
    const ed = await import('@noble/ed25519');
    const crypto = await import('crypto');
    const privateKey = crypto.randomBytes(32);
    const publicKey = await ed.getPublicKeyAsync(privateKey);
    return {
      publicKey: bytesToBase64(publicKey),
      privateKey: bytesToBase64(privateKey),
    };
  } catch {
    // Fallback to Node.js crypto
    const crypto = await import('crypto');
    const keyPair = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });

    // Extract raw keys from DER format
    const publicKey = keyPair.publicKey.subarray(12); // Skip DER header
    const privateKey = keyPair.privateKey.subarray(16); // Skip PKCS8 header

    return {
      publicKey: bytesToBase64(publicKey),
      privateKey: bytesToBase64(privateKey),
    };
  }
}

/**
 * Create and sign a signature file
 */
export async function createSignedSignatureFile(
  keyId: string,
  checksum: string,
  privateKeyBase64: string
): Promise<SignatureFile> {
  const signature = await signChecksum(checksum, privateKeyBase64);
  return createSignatureFile(keyId, checksum, signature);
}
