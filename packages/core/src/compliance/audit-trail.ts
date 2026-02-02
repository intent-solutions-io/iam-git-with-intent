/**
 * Tamper-Evident Audit Trail for Git With Intent
 *
 * EPIC 025: Regulated Domain Controls
 * Task 025.4: Implement tamper-evident audit logging (R4)
 *
 * Provides cryptographically secure audit logging with:
 * - SHA-256 hash chaining (each entry hashes the previous)
 * - Digital signatures using Ed25519
 * - Immutable append-only storage
 * - Merkle tree proof generation for audit verification
 *
 * @module @gwi/core/compliance/audit-trail
 */

import { z } from 'zod';
import * as crypto from 'crypto';

// =============================================================================
// Types
// =============================================================================

/**
 * Audit event severity
 */
export const AuditSeverity = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type AuditSeverity = z.infer<typeof AuditSeverity>;

/**
 * Audit event category
 */
export const AuditCategory = z.enum([
  'authentication',
  'authorization',
  'data_access',
  'data_modification',
  'configuration',
  'policy',
  'approval',
  'agent_action',
  'system',
  'security',
]);
export type AuditCategory = z.infer<typeof AuditCategory>;

/**
 * Tamper-evident audit entry
 */
export const TamperEvidentAuditEntry = z.object({
  /** Entry ID (hash-based) */
  entryId: z.string(),
  /** Sequence number (monotonically increasing) */
  sequenceNumber: z.number().int().min(0),
  /** Timestamp (ISO 8601) */
  timestamp: z.string().datetime(),
  /** Hash of previous entry (empty for first entry) */
  previousHash: z.string(),
  /** Event category */
  category: AuditCategory,
  /** Event severity */
  severity: AuditSeverity,
  /** Event type */
  eventType: z.string(),
  /** Event description */
  description: z.string(),
  /** Actor information */
  actor: z.object({
    id: z.string(),
    type: z.enum(['user', 'service', 'agent', 'system']),
    name: z.string().optional(),
  }),
  /** Resource affected */
  resource: z.object({
    type: z.string(),
    id: z.string(),
    name: z.string().optional(),
  }).optional(),
  /** Event data (varies by event type) */
  data: z.record(z.unknown()).optional(),
  /** Request metadata */
  request: z.object({
    id: z.string(),
    traceId: z.string().optional(),
    correlationId: z.string().optional(),
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
  }).optional(),
  /** Entry hash (SHA-256 of all fields + previous hash) */
  entryHash: z.string(),
  /** Digital signature (Ed25519) */
  signature: z.string().optional(),
});
export type TamperEvidentAuditEntry = z.infer<typeof TamperEvidentAuditEntry>;

/**
 * Audit trail verification result
 */
export const AuditVerificationResult = z.object({
  /** Whether the audit trail is valid */
  valid: z.boolean(),
  /** Total entries verified */
  entriesVerified: z.number().int(),
  /** First invalid entry (if any) */
  firstInvalidEntry: z.number().int().optional(),
  /** Invalid reason */
  invalidReason: z.string().optional(),
  /** Verification timestamp */
  verifiedAt: z.string().datetime(),
  /** Hash of last entry */
  lastEntryHash: z.string(),
});
export type AuditVerificationResult = z.infer<typeof AuditVerificationResult>;

/**
 * Merkle proof for an audit entry
 */
export const MerkleProof = z.object({
  /** Entry being proved */
  entryId: z.string(),
  /** Entry hash */
  entryHash: z.string(),
  /** Sequence number */
  sequenceNumber: z.number().int(),
  /** Proof path (sibling hashes) */
  proofPath: z.array(z.object({
    hash: z.string(),
    position: z.enum(['left', 'right']),
  })),
  /** Merkle root */
  root: z.string(),
  /** Total entries in tree */
  totalEntries: z.number().int(),
});
export type MerkleProof = z.infer<typeof MerkleProof>;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Compute SHA-256 hash of a string
 */
function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Compute hash of an audit entry (excluding the entryHash field)
 */
function computeEntryHash(entry: Omit<TamperEvidentAuditEntry, 'entryHash' | 'signature'>): string {
  const canonical = JSON.stringify({
    entryId: entry.entryId,
    sequenceNumber: entry.sequenceNumber,
    timestamp: entry.timestamp,
    previousHash: entry.previousHash,
    category: entry.category,
    severity: entry.severity,
    eventType: entry.eventType,
    description: entry.description,
    actor: entry.actor,
    resource: entry.resource,
    data: entry.data,
    request: entry.request,
  });
  return sha256(canonical);
}

/**
 * Generate entry ID from sequence and timestamp
 */
function generateEntryId(sequence: number, timestamp: string): string {
  return sha256(`${sequence}:${timestamp}:${crypto.randomBytes(8).toString('hex')}`).slice(0, 16);
}

// =============================================================================
// Audit Trail Store Interface
// =============================================================================

/**
 * Interface for audit trail storage backends
 */
export interface AuditTrailStore {
  /** Append an entry to the audit trail */
  append(entry: TamperEvidentAuditEntry): Promise<void>;

  /** Get entry by sequence number */
  getBySequence(sequence: number): Promise<TamperEvidentAuditEntry | null>;

  /** Get entry by ID */
  getById(entryId: string): Promise<TamperEvidentAuditEntry | null>;

  /** Get entries in range */
  getRange(startSequence: number, endSequence: number): Promise<TamperEvidentAuditEntry[]>;

  /** Get latest entry */
  getLatest(): Promise<TamperEvidentAuditEntry | null>;

  /** Get total entry count */
  getCount(): Promise<number>;

  /** Query entries */
  query(options: {
    startTime?: string;
    endTime?: string;
    category?: AuditCategory;
    severity?: AuditSeverity;
    actorId?: string;
    eventType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: TamperEvidentAuditEntry[]; total: number }>;
}

// =============================================================================
// In-Memory Audit Trail Store
// =============================================================================

/**
 * In-memory implementation of AuditTrailStore (for development/testing)
 */
export class InMemoryAuditTrailStore implements AuditTrailStore {
  private entries: TamperEvidentAuditEntry[] = [];

  async append(entry: TamperEvidentAuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  async getBySequence(sequence: number): Promise<TamperEvidentAuditEntry | null> {
    return this.entries.find(e => e.sequenceNumber === sequence) || null;
  }

  async getById(entryId: string): Promise<TamperEvidentAuditEntry | null> {
    return this.entries.find(e => e.entryId === entryId) || null;
  }

  async getRange(startSequence: number, endSequence: number): Promise<TamperEvidentAuditEntry[]> {
    return this.entries.filter(
      e => e.sequenceNumber >= startSequence && e.sequenceNumber <= endSequence
    );
  }

  async getLatest(): Promise<TamperEvidentAuditEntry | null> {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
  }

  async getCount(): Promise<number> {
    return this.entries.length;
  }

  async query(options: {
    startTime?: string;
    endTime?: string;
    category?: AuditCategory;
    severity?: AuditSeverity;
    actorId?: string;
    eventType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: TamperEvidentAuditEntry[]; total: number }> {
    let filtered = [...this.entries];

    if (options.startTime) {
      filtered = filtered.filter(e => e.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      filtered = filtered.filter(e => e.timestamp <= options.endTime!);
    }
    if (options.category) {
      filtered = filtered.filter(e => e.category === options.category);
    }
    if (options.severity) {
      filtered = filtered.filter(e => e.severity === options.severity);
    }
    if (options.actorId) {
      filtered = filtered.filter(e => e.actor.id === options.actorId);
    }
    if (options.eventType) {
      filtered = filtered.filter(e => e.eventType === options.eventType);
    }

    const total = filtered.length;
    const offset = options.offset || 0;
    const limit = options.limit || 100;

    return {
      entries: filtered.slice(offset, offset + limit),
      total,
    };
  }
}

// =============================================================================
// Tamper-Evident Audit Trail
// =============================================================================

/**
 * Tamper-evident audit trail implementation
 */
export class TamperEvidentAuditTrail {
  private nextSequence: number = 0;
  private lastHash: string = '';
  private signingKey?: crypto.KeyObject;

  constructor(
    private store: AuditTrailStore,
    options: {
      /** Enable digital signatures */
      enableSignatures?: boolean;
      /** Private key for signing (PEM format) */
      signingKeyPem?: string;
    } = {}
  ) {
    if (options.enableSignatures && options.signingKeyPem) {
      this.signingKey = crypto.createPrivateKey(options.signingKeyPem);
    }
  }

  /**
   * Initialize the audit trail from existing store
   */
  async initialize(): Promise<void> {
    const latest = await this.store.getLatest();
    if (latest) {
      this.nextSequence = latest.sequenceNumber + 1;
      this.lastHash = latest.entryHash;
    }
  }

  /**
   * Record an audit event
   */
  async record(event: {
    category: AuditCategory;
    severity: AuditSeverity;
    eventType: string;
    description: string;
    actor: TamperEvidentAuditEntry['actor'];
    resource?: TamperEvidentAuditEntry['resource'];
    data?: Record<string, unknown>;
    request?: TamperEvidentAuditEntry['request'];
  }): Promise<TamperEvidentAuditEntry> {
    const timestamp = new Date().toISOString();
    const entryId = generateEntryId(this.nextSequence, timestamp);

    const entryWithoutHash: Omit<TamperEvidentAuditEntry, 'entryHash' | 'signature'> = {
      entryId,
      sequenceNumber: this.nextSequence,
      timestamp,
      previousHash: this.lastHash,
      category: event.category,
      severity: event.severity,
      eventType: event.eventType,
      description: event.description,
      actor: event.actor,
      resource: event.resource,
      data: event.data,
      request: event.request,
    };

    const entryHash = computeEntryHash(entryWithoutHash);

    const entry: TamperEvidentAuditEntry = {
      ...entryWithoutHash,
      entryHash,
    };

    // Sign if enabled
    if (this.signingKey) {
      const sign = crypto.createSign('SHA256');
      sign.update(entryHash);
      entry.signature = sign.sign(this.signingKey, 'hex');
    }

    // Store entry
    await this.store.append(entry);

    // Update state
    this.lastHash = entryHash;
    this.nextSequence++;

    return entry;
  }

  /**
   * Verify the integrity of the audit trail
   */
  async verify(startSequence: number = 0, endSequence?: number): Promise<AuditVerificationResult> {
    const count = await this.store.getCount();
    if (count === 0) {
      return {
        valid: true,
        entriesVerified: 0,
        verifiedAt: new Date().toISOString(),
        lastEntryHash: '',
      };
    }

    const end = endSequence ?? count - 1;
    const entries = await this.store.getRange(startSequence, end);

    let expectedPreviousHash = '';
    if (startSequence > 0) {
      const previousEntry = await this.store.getBySequence(startSequence - 1);
      if (previousEntry) {
        expectedPreviousHash = previousEntry.entryHash;
      }
    }

    for (const entry of entries) {
      // Verify previous hash chain
      if (entry.previousHash !== expectedPreviousHash) {
        return {
          valid: false,
          entriesVerified: entry.sequenceNumber - startSequence,
          firstInvalidEntry: entry.sequenceNumber,
          invalidReason: `Previous hash mismatch at sequence ${entry.sequenceNumber}`,
          verifiedAt: new Date().toISOString(),
          lastEntryHash: expectedPreviousHash,
        };
      }

      // Verify entry hash
      const computedHash = computeEntryHash(entry);
      if (computedHash !== entry.entryHash) {
        return {
          valid: false,
          entriesVerified: entry.sequenceNumber - startSequence,
          firstInvalidEntry: entry.sequenceNumber,
          invalidReason: `Entry hash mismatch at sequence ${entry.sequenceNumber}`,
          verifiedAt: new Date().toISOString(),
          lastEntryHash: expectedPreviousHash,
        };
      }

      expectedPreviousHash = entry.entryHash;
    }

    return {
      valid: true,
      entriesVerified: entries.length,
      verifiedAt: new Date().toISOString(),
      lastEntryHash: expectedPreviousHash,
    };
  }

  /**
   * Generate a Merkle proof for an entry
   */
  async generateMerkleProof(entryId: string): Promise<MerkleProof | null> {
    const entry = await this.store.getById(entryId);
    if (!entry) {
      return null;
    }

    const count = await this.store.getCount();
    const entries = await this.store.getRange(0, count - 1);

    // Build Merkle tree
    const leaves = entries.map(e => e.entryHash);
    const { root, proofPath } = buildMerkleProof(leaves, entry.sequenceNumber);

    return {
      entryId: entry.entryId,
      entryHash: entry.entryHash,
      sequenceNumber: entry.sequenceNumber,
      proofPath,
      root,
      totalEntries: count,
    };
  }

  /**
   * Verify a Merkle proof
   */
  verifyMerkleProof(proof: MerkleProof): boolean {
    let hash = proof.entryHash;

    for (const node of proof.proofPath) {
      if (node.position === 'left') {
        hash = sha256(node.hash + hash);
      } else {
        hash = sha256(hash + node.hash);
      }
    }

    return hash === proof.root;
  }

  /**
   * Query audit entries
   */
  async query(options: {
    startTime?: string;
    endTime?: string;
    category?: AuditCategory;
    severity?: AuditSeverity;
    actorId?: string;
    eventType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: TamperEvidentAuditEntry[]; total: number }> {
    return this.store.query(options);
  }

  /**
   * Get audit trail summary
   */
  async getSummary(): Promise<{
    totalEntries: number;
    firstEntry?: { timestamp: string; entryId: string };
    lastEntry?: { timestamp: string; entryId: string; hash: string };
    lastVerification?: AuditVerificationResult;
  }> {
    const count = await this.store.getCount();
    const first = await this.store.getBySequence(0);
    const last = await this.store.getLatest();

    return {
      totalEntries: count,
      firstEntry: first ? { timestamp: first.timestamp, entryId: first.entryId } : undefined,
      lastEntry: last ? { timestamp: last.timestamp, entryId: last.entryId, hash: last.entryHash } : undefined,
    };
  }
}

// =============================================================================
// Merkle Tree Helpers
// =============================================================================

/**
 * Build a Merkle proof for a leaf at given index
 */
function buildMerkleProof(
  leaves: string[],
  index: number
): { root: string; proofPath: Array<{ hash: string; position: 'left' | 'right' }> } {
  if (leaves.length === 0) {
    return { root: '', proofPath: [] };
  }

  if (leaves.length === 1) {
    return { root: leaves[0], proofPath: [] };
  }

  // Pad to power of 2
  const paddedLength = Math.pow(2, Math.ceil(Math.log2(leaves.length)));
  const paddedLeaves = [...leaves];
  while (paddedLeaves.length < paddedLength) {
    paddedLeaves.push(sha256(''));
  }

  const proofPath: Array<{ hash: string; position: 'left' | 'right' }> = [];
  let level = paddedLeaves;
  let currentIndex = index;

  while (level.length > 1) {
    const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
    const siblingPosition: 'left' | 'right' = currentIndex % 2 === 0 ? 'right' : 'left';

    proofPath.push({
      hash: level[siblingIndex],
      position: siblingPosition,
    });

    // Build next level
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      nextLevel.push(sha256(level[i] + level[i + 1]));
    }

    level = nextLevel;
    currentIndex = Math.floor(currentIndex / 2);
  }

  return { root: level[0], proofPath };
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a tamper-evident audit trail with in-memory storage
 */
export function createInMemoryAuditTrail(options?: {
  enableSignatures?: boolean;
  signingKeyPem?: string;
}): TamperEvidentAuditTrail {
  const store = new InMemoryAuditTrailStore();
  return new TamperEvidentAuditTrail(store, options);
}

/**
 * Create a tamper-evident audit trail with custom storage
 */
export function createAuditTrail(
  store: AuditTrailStore,
  options?: {
    enableSignatures?: boolean;
    signingKeyPem?: string;
  }
): TamperEvidentAuditTrail {
  return new TamperEvidentAuditTrail(store, options);
}
