/**
 * Browser Evidence Capture Schema & Types
 *
 * Code Factory Pattern 7: Browser evidence as first-class proof.
 * Defines the evidence manifest format and verification utilities
 * for Playwright-captured UI screenshots/videos.
 *
 * @module @gwi/core/evidence/browser-evidence
 */

import { z } from 'zod';
import { createHash } from 'crypto';

// =============================================================================
// Evidence Item Schema
// =============================================================================

/**
 * A single piece of browser evidence (screenshot or video).
 */
export const BrowserEvidenceItemSchema = z.object({
  /** Unique evidence item ID */
  id: z.string(),
  /** Type of evidence */
  type: z.enum(['screenshot', 'video', 'trace', 'accessibility-audit']),
  /** Relative file path from evidence root */
  path: z.string(),
  /** SHA-256 hash of the file content */
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  /** File size in bytes */
  sizeBytes: z.number().int().positive(),
  /** When the evidence was captured */
  capturedAt: z.string().datetime(),
  /** Which UI flow this belongs to */
  flow: z.string(),
  /** Step within the flow */
  step: z.string(),
  /** Browser viewport used */
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  /** Browser name and version */
  browser: z.string().optional(),
  /** Page URL at time of capture */
  url: z.string().optional(),
  /** Duration in milliseconds (for videos) */
  durationMs: z.number().int().optional(),
  /** Whether the evidence passed visual regression check */
  visualRegressionPassed: z.boolean().optional(),
});

export type BrowserEvidenceItem = z.infer<typeof BrowserEvidenceItemSchema>;

// =============================================================================
// Evidence Manifest Schema
// =============================================================================

/**
 * Manifest that tracks all browser evidence for a test run.
 * This is the "first-class proof" document verified in CI.
 */
export const BrowserEvidenceManifestSchema = z.object({
  /** Schema version */
  version: z.literal('1.0'),
  /** Unique manifest ID */
  id: z.string(),
  /** When the evidence was collected */
  createdAt: z.string().datetime(),
  /** Git commit SHA this evidence was captured against */
  commitSha: z.string().regex(/^[a-f0-9]{40}$/),
  /** Branch name */
  branch: z.string().optional(),
  /** CI run ID (GitHub Actions, etc.) */
  ciRunId: z.string().optional(),
  /** Base directory for evidence files */
  evidenceDir: z.string(),
  /** All captured evidence items */
  items: z.array(BrowserEvidenceItemSchema),
  /** Summary statistics */
  summary: z.object({
    /** Total evidence items */
    totalItems: z.number().int(),
    /** Total file size */
    totalSizeBytes: z.number().int(),
    /** Unique flows covered */
    flowsCovered: z.array(z.string()),
    /** Number of flows that passed */
    flowsPassed: z.number().int(),
    /** Number of flows that failed */
    flowsFailed: z.number().int(),
    /** Duration of entire capture session */
    captureSessionMs: z.number().int(),
  }),
  /** SHA-256 hash of the sorted item hashes (integrity check) */
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export type BrowserEvidenceManifest = z.infer<typeof BrowserEvidenceManifestSchema>;

// =============================================================================
// Manifest Builder
// =============================================================================

/**
 * Builds a browser evidence manifest incrementally.
 */
export class EvidenceManifestBuilder {
  private items: BrowserEvidenceItem[] = [];
  private startTime: number;
  private commitSha: string;
  private branch?: string;
  private ciRunId?: string;
  private evidenceDir: string;

  constructor(opts: {
    commitSha: string;
    evidenceDir: string;
    branch?: string;
    ciRunId?: string;
  }) {
    this.commitSha = opts.commitSha;
    this.evidenceDir = opts.evidenceDir;
    this.branch = opts.branch;
    this.ciRunId = opts.ciRunId;
    this.startTime = Date.now();
  }

  /**
   * Add an evidence item to the manifest.
   */
  addItem(item: BrowserEvidenceItem): void {
    this.items.push(item);
  }

  /**
   * Build the final manifest.
   */
  build(): BrowserEvidenceManifest {
    const now = new Date().toISOString();
    const flowResults = this.computeFlowResults();
    const manifestHash = this.computeManifestHash();

    return {
      version: '1.0',
      id: `evidence-${Date.now()}-${createHash('sha256').update(this.commitSha).digest('hex').substring(0, 8)}`,
      createdAt: now,
      commitSha: this.commitSha,
      branch: this.branch,
      ciRunId: this.ciRunId,
      evidenceDir: this.evidenceDir,
      items: this.items,
      summary: {
        totalItems: this.items.length,
        totalSizeBytes: this.items.reduce((sum, i) => sum + i.sizeBytes, 0),
        flowsCovered: flowResults.flows,
        flowsPassed: flowResults.passed,
        flowsFailed: flowResults.failed,
        captureSessionMs: Date.now() - this.startTime,
      },
      manifestHash,
    };
  }

  private computeFlowResults(): { flows: string[]; passed: number; failed: number } {
    const flowMap = new Map<string, boolean>();
    for (const item of this.items) {
      const current = flowMap.get(item.flow);
      // A flow fails if any item failed visual regression
      if (item.visualRegressionPassed === false) {
        flowMap.set(item.flow, false);
      } else if (current === undefined) {
        flowMap.set(item.flow, item.visualRegressionPassed ?? true);
      }
    }

    const flows = [...flowMap.keys()].sort();
    let passed = 0;
    let failed = 0;
    for (const result of flowMap.values()) {
      if (result) passed++;
      else failed++;
    }
    return { flows, passed, failed };
  }

  private computeManifestHash(): string {
    const sortedHashes = this.items
      .map((i) => i.sha256)
      .sort()
      .join(':');
    return createHash('sha256').update(sortedHashes).digest('hex');
  }
}

// =============================================================================
// Manifest Verification
// =============================================================================

/**
 * Result of manifest verification.
 */
export interface ManifestVerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  itemsVerified: number;
  itemsFailed: number;
}

/**
 * Verify the integrity of a browser evidence manifest.
 * Checks that the manifest hash matches the items.
 */
export function verifyManifest(manifest: BrowserEvidenceManifest): ManifestVerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let itemsFailed = 0;

  // Verify manifest hash
  const sortedHashes = manifest.items
    .map((i) => i.sha256)
    .sort()
    .join(':');
  const expectedHash = createHash('sha256').update(sortedHashes).digest('hex');

  if (manifest.manifestHash !== expectedHash) {
    errors.push(
      `Manifest hash mismatch: expected ${expectedHash}, got ${manifest.manifestHash}`,
    );
  }

  // Verify summary counts
  if (manifest.summary.totalItems !== manifest.items.length) {
    errors.push(
      `Item count mismatch: summary says ${manifest.summary.totalItems}, actual ${manifest.items.length}`,
    );
  }

  const totalSize = manifest.items.reduce((s, i) => s + i.sizeBytes, 0);
  if (manifest.summary.totalSizeBytes !== totalSize) {
    warnings.push(
      `Size mismatch: summary says ${manifest.summary.totalSizeBytes}, actual ${totalSize}`,
    );
  }

  // Check for duplicate IDs
  const ids = new Set<string>();
  for (const item of manifest.items) {
    if (ids.has(item.id)) {
      errors.push(`Duplicate item ID: ${item.id}`);
      itemsFailed++;
    }
    ids.add(item.id);
  }

  // Check for empty flows
  if (manifest.items.length === 0) {
    warnings.push('Manifest contains no evidence items');
  }

  // Check flow coverage matches summary
  const flows = new Set(manifest.items.map((i) => i.flow));
  if (flows.size !== manifest.summary.flowsCovered.length) {
    warnings.push(
      `Flow coverage mismatch: items cover ${flows.size} flows, summary lists ${manifest.summary.flowsCovered.length}`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    itemsVerified: manifest.items.length - itemsFailed,
    itemsFailed,
  };
}

// =============================================================================
// Evidence Item Factory
// =============================================================================

let evidenceCounter = 0;

/**
 * Create a screenshot evidence item.
 */
export function createScreenshotEvidence(opts: {
  flow: string;
  step: string;
  path: string;
  sha256: string;
  sizeBytes: number;
  viewport?: { width: number; height: number };
  url?: string;
  browser?: string;
  visualRegressionPassed?: boolean;
}): BrowserEvidenceItem {
  return {
    id: `ev-ss-${Date.now()}-${++evidenceCounter}`,
    type: 'screenshot',
    path: opts.path,
    sha256: opts.sha256,
    sizeBytes: opts.sizeBytes,
    capturedAt: new Date().toISOString(),
    flow: opts.flow,
    step: opts.step,
    viewport: opts.viewport ?? { width: 1280, height: 720 },
    url: opts.url,
    browser: opts.browser,
    visualRegressionPassed: opts.visualRegressionPassed,
  };
}

/**
 * Create a video evidence item.
 */
export function createVideoEvidence(opts: {
  flow: string;
  step: string;
  path: string;
  sha256: string;
  sizeBytes: number;
  durationMs: number;
  viewport?: { width: number; height: number };
  url?: string;
  browser?: string;
}): BrowserEvidenceItem {
  return {
    id: `ev-vid-${Date.now()}-${++evidenceCounter}`,
    type: 'video',
    path: opts.path,
    sha256: opts.sha256,
    sizeBytes: opts.sizeBytes,
    capturedAt: new Date().toISOString(),
    flow: opts.flow,
    step: opts.step,
    viewport: opts.viewport ?? { width: 1280, height: 720 },
    url: opts.url,
    browser: opts.browser,
    durationMs: opts.durationMs,
  };
}

/**
 * Reset the evidence counter (for testing).
 */
export function resetEvidenceCounter(): void {
  evidenceCounter = 0;
}
