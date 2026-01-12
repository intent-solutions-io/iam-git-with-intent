/**
 * Cryptographic Chaining for Immutable Audit Log
 *
 * Epic D: Policy & Audit - Story D3: Immutable Audit Log
 * Task D3.2: Implement cryptographic chaining
 *
 * Provides SHA-256 hash chain for tamper-evident audit trails:
 * - Each entry includes hash of previous entry
 * - Content hash computed from canonical JSON
 * - Merkle tree for efficient batch verification
 * - Chain verification functions
 *
 * @module @gwi/core/policy/crypto-chain
 */

import { createHash } from 'crypto';
import { z } from 'zod';
import {
  type ImmutableAuditLogEntry,
  type CreateAuditLogEntry,
  type AuditChainLink,
  type AuditLogContext,
  type SHA256Hash,
  type HashAlgorithm,
  generateAuditLogEntryId,
  CONTEXT_HASH_FIELDS,
} from './audit-log-schema.js';

// =============================================================================
// Hash Computation
// =============================================================================

/**
 * Compute SHA-256 hash of a string
 */
export function sha256(data: string): SHA256Hash {
  return createHash('sha256').update(data, 'utf8').digest('hex') as SHA256Hash;
}

/**
 * Compute SHA-384 hash of a string
 */
export function sha384(data: string): string {
  return createHash('sha384').update(data, 'utf8').digest('hex');
}

/**
 * Compute SHA-512 hash of a string
 */
export function sha512(data: string): string {
  return createHash('sha512').update(data, 'utf8').digest('hex');
}

/**
 * Compute hash using specified algorithm
 */
export function computeHash(data: string, algorithm: HashAlgorithm = 'sha256'): string {
  switch (algorithm) {
    case 'sha256':
      return sha256(data);
    case 'sha384':
      return sha384(data);
    case 'sha512':
      return sha512(data);
    default:
      throw new Error(`Unsupported hash algorithm: ${algorithm}`);
  }
}

/**
 * Convert object to canonical JSON string for hashing
 * - Keys are sorted alphabetically
 * - No extra whitespace
 * - Consistent serialization
 */
export function toCanonicalJson(obj: unknown): string {
  return JSON.stringify(obj, (_, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce((sorted: Record<string, unknown>, key) => {
          sorted[key] = value[key];
          return sorted;
        }, {});
    }
    return value;
  });
}

// =============================================================================
// Entry Content Hash
// =============================================================================

/**
 * Fields included in content hash computation
 * Excludes chain fields (which would create circular dependency)
 */
const CONTENT_HASH_FIELDS = [
  'id',
  'schemaVersion',
  'timestamp',
  'actor',
  'action',
  'resource',
  'outcome',
  'context',
  'tags',
  'highRisk',
  'compliance',
  'details',
] as const;

/**
 * Extract fields for content hash computation
 */
function extractContentFields(entry: Omit<ImmutableAuditLogEntry, 'chain' | 'contextHash'>): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const field of CONTENT_HASH_FIELDS) {
    if (field in entry && entry[field as keyof typeof entry] !== undefined) {
      content[field] = entry[field as keyof typeof entry];
    }
  }
  return content;
}

/**
 * Compute content hash for an entry
 * Uses canonical JSON serialization for deterministic hashing
 */
export function computeContentHash(
  entry: Omit<ImmutableAuditLogEntry, 'chain' | 'contextHash'>,
  algorithm: HashAlgorithm = 'sha256'
): SHA256Hash {
  const content = extractContentFields(entry);
  const canonical = toCanonicalJson(content);
  return computeHash(canonical, algorithm) as SHA256Hash;
}

/**
 * Compute context hash for traceability
 */
export function computeContextHash(
  context: AuditLogContext,
  algorithm: HashAlgorithm = 'sha256'
): { algorithm: HashAlgorithm; value: string; fields: string[] } {
  const hashFields: Record<string, unknown> = {};
  const includedFields: string[] = [];

  for (const field of CONTEXT_HASH_FIELDS) {
    if (field in context && context[field as keyof AuditLogContext] !== undefined) {
      hashFields[field] = context[field as keyof AuditLogContext];
      includedFields.push(field);
    }
  }

  const canonical = toCanonicalJson(hashFields);
  return {
    algorithm,
    value: computeHash(canonical, algorithm),
    fields: includedFields,
  };
}

// =============================================================================
// Chain Builder
// =============================================================================

/**
 * State for building a chain of entries
 */
export interface ChainState {
  /** Current sequence number */
  sequence: number;
  /** Hash of the last entry (null if chain is empty) */
  lastHash: SHA256Hash | null;
  /** Hash algorithm being used */
  algorithm: HashAlgorithm;
}

/**
 * Create initial chain state
 */
export function createChainState(algorithm: HashAlgorithm = 'sha256'): ChainState {
  return {
    sequence: 0,
    lastHash: null,
    algorithm,
  };
}

/**
 * Build chain link for a new entry
 */
export function buildChainLink(
  state: ChainState,
  contentHash: SHA256Hash
): AuditChainLink {
  return {
    sequence: state.sequence,
    prevHash: state.lastHash,
    contentHash,
    algorithm: state.algorithm,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Advance chain state after adding an entry
 */
export function advanceChainState(
  state: ChainState,
  contentHash: SHA256Hash
): ChainState {
  return {
    sequence: state.sequence + 1,
    lastHash: contentHash,
    algorithm: state.algorithm,
  };
}

/**
 * Chain builder class for managing entry creation
 */
export class AuditChainBuilder {
  private state: ChainState;

  constructor(
    initialState?: ChainState,
    algorithm: HashAlgorithm = 'sha256'
  ) {
    this.state = initialState ?? createChainState(algorithm);
  }

  /**
   * Get current chain state
   */
  getState(): Readonly<ChainState> {
    return { ...this.state };
  }

  /**
   * Get current sequence number
   */
  getSequence(): number {
    return this.state.sequence;
  }

  /**
   * Get hash of the last entry
   */
  getLastHash(): SHA256Hash | null {
    return this.state.lastHash;
  }

  /**
   * Build a complete entry from create input
   */
  buildEntry(input: CreateAuditLogEntry): ImmutableAuditLogEntry {
    const id = generateAuditLogEntryId(this.state.sequence);
    const timestamp = input.timestamp ?? new Date().toISOString();

    // Build partial entry for content hash computation
    const partialEntry = {
      id,
      schemaVersion: '1.0' as const,
      timestamp,
      actor: input.actor,
      action: input.action,
      resource: input.resource,
      outcome: input.outcome,
      context: input.context,
      tags: input.tags ?? [],
      highRisk: input.highRisk ?? false,
      compliance: input.compliance ?? [],
      details: input.details ?? {},
    };

    // Compute content hash
    const contentHash = computeContentHash(partialEntry, this.state.algorithm);

    // Build chain link
    const chain = buildChainLink(this.state, contentHash);

    // Compute context hash
    const contextHash = computeContextHash(input.context, this.state.algorithm);

    // Advance state
    this.state = advanceChainState(this.state, contentHash);

    // Return complete entry
    return {
      ...partialEntry,
      receivedAt: new Date().toISOString(),
      chain,
      contextHash,
    };
  }

  /**
   * Build multiple entries atomically
   */
  buildEntries(inputs: CreateAuditLogEntry[]): ImmutableAuditLogEntry[] {
    return inputs.map(input => this.buildEntry(input));
  }

  /**
   * Reset chain state (for testing or re-initialization)
   */
  reset(algorithm: HashAlgorithm = 'sha256'): void {
    this.state = createChainState(algorithm);
  }

  /**
   * Initialize from existing chain state
   */
  initializeFrom(sequence: number, lastHash: SHA256Hash | null): void {
    this.state = {
      ...this.state,
      sequence,
      lastHash,
    };
  }
}

// =============================================================================
// Chain Verification
// =============================================================================

/**
 * Result of verifying a single entry
 */
export interface EntryVerificationResult {
  /** Entry ID */
  entryId: string;
  /** Sequence number */
  sequence: number;
  /** Whether content hash is valid */
  contentHashValid: boolean;
  /** Whether chain link is valid (prevHash matches) */
  chainLinkValid: boolean;
  /** Expected content hash */
  expectedContentHash: SHA256Hash;
  /** Actual content hash from entry */
  actualContentHash: SHA256Hash;
  /** Error message if verification failed */
  error?: string;
}

/**
 * Result of verifying a chain of entries
 */
export interface ChainVerificationResult {
  /** Whether the entire chain is valid */
  valid: boolean;
  /** Number of entries verified */
  entriesVerified: number;
  /** Sequence of first invalid entry (if any) */
  firstInvalidSequence?: number;
  /** ID of first invalid entry (if any) */
  firstInvalidId?: string;
  /** Detailed results for each entry */
  details: EntryVerificationResult[];
  /** Overall error message */
  error?: string;
  /** Verification duration in milliseconds */
  durationMs: number;
}

/**
 * Verify a single entry's content hash
 */
export function verifyEntryContentHash(
  entry: ImmutableAuditLogEntry
): EntryVerificationResult {
  const expectedHash = computeContentHash(entry, entry.chain.algorithm);
  const actualHash = entry.chain.contentHash;
  const contentHashValid = expectedHash === actualHash;

  return {
    entryId: entry.id,
    sequence: entry.chain.sequence,
    contentHashValid,
    chainLinkValid: true, // Will be set by chain verification
    expectedContentHash: expectedHash,
    actualContentHash: actualHash,
    error: contentHashValid ? undefined : 'Content hash mismatch',
  };
}

/**
 * Verify chain link between two consecutive entries
 */
export function verifyChainLink(
  current: ImmutableAuditLogEntry,
  previous: ImmutableAuditLogEntry | null
): boolean {
  if (previous === null) {
    // First entry should have null prevHash
    return current.chain.prevHash === null;
  }

  // Current entry's prevHash should match previous entry's contentHash
  return current.chain.prevHash === previous.chain.contentHash;
}

/**
 * Verify a chain of entries
 *
 * Entries must be provided in sequence order (ascending)
 */
export function verifyChain(
  entries: ImmutableAuditLogEntry[],
  options: {
    /** Expected starting sequence (default: 0) */
    startSequence?: number;
    /** Expected prevHash for first entry (default: null) */
    expectedFirstPrevHash?: SHA256Hash | null;
  } = {}
): ChainVerificationResult {
  const startTime = Date.now();
  const details: EntryVerificationResult[] = [];
  const startSequence = options.startSequence ?? 0;
  const expectedFirstPrevHash = options.expectedFirstPrevHash ?? null;

  if (entries.length === 0) {
    return {
      valid: true,
      entriesVerified: 0,
      details: [],
      durationMs: Date.now() - startTime,
    };
  }

  let previousEntry: ImmutableAuditLogEntry | null = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedSequence = startSequence + i;

    // Verify sequence number
    if (entry.chain.sequence !== expectedSequence) {
      return {
        valid: false,
        entriesVerified: i,
        firstInvalidSequence: entry.chain.sequence,
        firstInvalidId: entry.id,
        details,
        error: `Sequence mismatch: expected ${expectedSequence}, got ${entry.chain.sequence}`,
        durationMs: Date.now() - startTime,
      };
    }

    // Verify content hash
    const contentResult = verifyEntryContentHash(entry);

    // Verify chain link
    let chainLinkValid: boolean;
    if (i === 0) {
      // First entry - check against expected first prevHash
      chainLinkValid = entry.chain.prevHash === expectedFirstPrevHash;
    } else {
      chainLinkValid = verifyChainLink(entry, previousEntry);
    }

    contentResult.chainLinkValid = chainLinkValid;
    if (!chainLinkValid) {
      contentResult.error = contentResult.error
        ? `${contentResult.error}; Chain link broken`
        : 'Chain link broken';
    }

    details.push(contentResult);

    // Check for any failure
    if (!contentResult.contentHashValid || !chainLinkValid) {
      return {
        valid: false,
        entriesVerified: i + 1,
        firstInvalidSequence: entry.chain.sequence,
        firstInvalidId: entry.id,
        details,
        error: contentResult.error,
        durationMs: Date.now() - startTime,
      };
    }

    previousEntry = entry;
  }

  return {
    valid: true,
    entriesVerified: entries.length,
    details,
    durationMs: Date.now() - startTime,
  };
}

// =============================================================================
// Merkle Tree for Batch Verification
// =============================================================================

/**
 * Merkle tree node
 */
export interface MerkleNode {
  /** Hash at this node */
  hash: string;
  /** Left child (null for leaf nodes) */
  left: MerkleNode | null;
  /** Right child (null for leaf nodes) */
  right: MerkleNode | null;
  /** Entry ID (only for leaf nodes) */
  entryId?: string;
  /** Sequence number (only for leaf nodes) */
  sequence?: number;
}

/**
 * Merkle proof for a single entry
 */
export interface MerkleProof {
  /** Entry ID */
  entryId: string;
  /** Entry's content hash (leaf hash) */
  leafHash: string;
  /** Sibling hashes from leaf to root */
  siblings: Array<{
    hash: string;
    position: 'left' | 'right';
  }>;
  /** Root hash */
  rootHash: string;
}

/**
 * Merkle tree for batch verification
 */
export class MerkleTree {
  private root: MerkleNode | null = null;
  private leaves: MerkleNode[] = [];
  private readonly algorithm: HashAlgorithm;

  constructor(algorithm: HashAlgorithm = 'sha256') {
    this.algorithm = algorithm;
  }

  /**
   * Build Merkle tree from entries
   */
  build(entries: ImmutableAuditLogEntry[]): void {
    if (entries.length === 0) {
      this.root = null;
      this.leaves = [];
      return;
    }

    // Create leaf nodes
    this.leaves = entries.map(entry => ({
      hash: entry.chain.contentHash,
      left: null,
      right: null,
      entryId: entry.id,
      sequence: entry.chain.sequence,
    }));

    // Build tree bottom-up
    this.root = this.buildTree(this.leaves);
  }

  /**
   * Build tree recursively
   */
  private buildTree(nodes: MerkleNode[]): MerkleNode {
    if (nodes.length === 1) {
      return nodes[0];
    }

    const parentNodes: MerkleNode[] = [];

    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = nodes[i + 1] ?? left; // Duplicate last node if odd

      const combinedHash = computeHash(
        left.hash + right.hash,
        this.algorithm
      );

      parentNodes.push({
        hash: combinedHash,
        left,
        right: nodes[i + 1] ? right : null, // null if duplicated
      });
    }

    return this.buildTree(parentNodes);
  }

  /**
   * Get root hash
   */
  getRootHash(): string | null {
    return this.root?.hash ?? null;
  }

  /**
   * Get proof for an entry
   */
  getProof(entryId: string): MerkleProof | null {
    const leafIndex = this.leaves.findIndex(l => l.entryId === entryId);
    if (leafIndex === -1 || !this.root) {
      return null;
    }

    const leaf = this.leaves[leafIndex];
    const siblings: MerkleProof['siblings'] = [];

    // Traverse from leaf to root collecting siblings
    this.collectSiblings(this.root, leaf.hash, siblings);

    return {
      entryId,
      leafHash: leaf.hash,
      siblings,
      rootHash: this.root.hash,
    };
  }

  /**
   * Collect sibling hashes along path to leaf
   */
  private collectSiblings(
    node: MerkleNode,
    targetHash: string,
    siblings: MerkleProof['siblings']
  ): boolean {
    // Found the target
    if (node.hash === targetHash && node.left === null) {
      return true;
    }

    // Leaf node but not target
    if (node.left === null) {
      return false;
    }

    // Check left subtree
    if (node.left && this.containsHash(node.left, targetHash)) {
      if (node.right) {
        siblings.unshift({ hash: node.right.hash, position: 'right' });
      }
      return this.collectSiblings(node.left, targetHash, siblings);
    }

    // Check right subtree
    if (node.right && this.containsHash(node.right, targetHash)) {
      siblings.unshift({ hash: node.left.hash, position: 'left' });
      return this.collectSiblings(node.right, targetHash, siblings);
    }

    return false;
  }

  /**
   * Check if subtree contains hash
   */
  private containsHash(node: MerkleNode, hash: string): boolean {
    if (node.hash === hash) return true;
    if (node.left && this.containsHash(node.left, hash)) return true;
    if (node.right && this.containsHash(node.right, hash)) return true;
    return false;
  }

  /**
   * Verify a proof
   */
  verifyProof(proof: MerkleProof): boolean {
    let currentHash = proof.leafHash;

    for (const sibling of proof.siblings) {
      if (sibling.position === 'left') {
        currentHash = computeHash(sibling.hash + currentHash, this.algorithm);
      } else {
        currentHash = computeHash(currentHash + sibling.hash, this.algorithm);
      }
    }

    return currentHash === proof.rootHash;
  }

  /**
   * Get all leaf nodes
   */
  getLeaves(): ReadonlyArray<MerkleNode> {
    return this.leaves;
  }

  /**
   * Get tree depth
   */
  getDepth(): number {
    if (!this.root) return 0;
    return Math.ceil(Math.log2(this.leaves.length)) + 1;
  }
}

/**
 * Build Merkle tree from entries
 */
export function buildMerkleTree(
  entries: ImmutableAuditLogEntry[],
  algorithm: HashAlgorithm = 'sha256'
): MerkleTree {
  const tree = new MerkleTree(algorithm);
  tree.build(entries);
  return tree;
}

/**
 * Verify entry exists in Merkle tree using proof
 */
export function verifyMerkleProof(
  proof: MerkleProof,
  algorithm: HashAlgorithm = 'sha256'
): boolean {
  const tree = new MerkleTree(algorithm);
  return tree.verifyProof(proof);
}

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * Result of batch entry creation
 */
export interface BatchCreateResult {
  /** Created entries */
  entries: ImmutableAuditLogEntry[];
  /** Merkle root for batch */
  merkleRoot: string;
  /** Starting sequence */
  startSequence: number;
  /** Ending sequence */
  endSequence: number;
  /** Batch creation timestamp */
  createdAt: string;
}

/**
 * Create a batch of entries with Merkle root
 */
export function createBatch(
  builder: AuditChainBuilder,
  inputs: CreateAuditLogEntry[]
): BatchCreateResult {
  const startSequence = builder.getSequence();
  const entries = builder.buildEntries(inputs);
  const endSequence = builder.getSequence() - 1;

  const tree = buildMerkleTree(entries);
  const merkleRoot = tree.getRootHash() ?? '';

  return {
    entries,
    merkleRoot,
    startSequence,
    endSequence,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Verify a batch using Merkle root
 */
export function verifyBatch(
  entries: ImmutableAuditLogEntry[],
  expectedMerkleRoot: string,
  options?: {
    startSequence?: number;
    expectedFirstPrevHash?: SHA256Hash | null;
  }
): {
  chainValid: boolean;
  merkleValid: boolean;
  chainResult: ChainVerificationResult;
} {
  // Verify chain integrity (includes content hash verification)
  const chainResult = verifyChain(entries, options);

  // Build Merkle tree using RECOMPUTED content hashes (not stored ones)
  // This ensures tampered entries are detected by both chain and Merkle verification
  const tree = new MerkleTree('sha256');

  // Recompute content hashes for Merkle tree leaves
  const recomputedLeaves = entries.map(entry => {
    const recomputedHash = computeContentHash(entry, 'sha256');
    return {
      hash: recomputedHash,
      left: null,
      right: null,
      entryId: entry.id,
      sequence: entry.chain.sequence,
    };
  });

  // Build tree from recomputed hashes
  if (recomputedLeaves.length > 0) {
    tree['leaves'] = recomputedLeaves;
    tree['root'] = tree['buildTree'](recomputedLeaves);
  }

  const actualRoot = tree.getRootHash();
  const merkleValid = actualRoot === expectedMerkleRoot;

  return {
    chainValid: chainResult.valid,
    merkleValid,
    chainResult,
  };
}

// =============================================================================
// Zod Schemas for Serialization
// =============================================================================

/**
 * Schema for serialized chain state
 */
export const ChainStateSchema = z.object({
  sequence: z.number().int().nonnegative(),
  lastHash: z.string().length(64).nullable(),
  algorithm: z.enum(['sha256', 'sha384', 'sha512']),
});

/**
 * Schema for Merkle proof
 */
export const MerkleProofSchema = z.object({
  entryId: z.string(),
  leafHash: z.string(),
  siblings: z.array(z.object({
    hash: z.string(),
    position: z.enum(['left', 'right']),
  })),
  rootHash: z.string(),
});

/**
 * Schema for batch create result
 */
export const BatchCreateResultSchema = z.object({
  entries: z.array(z.any()), // Full entry validation done elsewhere
  merkleRoot: z.string(),
  startSequence: z.number().int().nonnegative(),
  endSequence: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
});

// Note: All types are exported where they are defined (e.g., ChainState at line 171)
