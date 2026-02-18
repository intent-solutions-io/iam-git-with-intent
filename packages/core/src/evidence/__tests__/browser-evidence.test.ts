/**
 * Tests for Browser Evidence Schema & Manifest Verification
 *
 * Code Factory Pattern 7: Browser evidence as first-class proof.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BrowserEvidenceItemSchema,
  BrowserEvidenceManifestSchema,
  EvidenceManifestBuilder,
  verifyManifest,
  createScreenshotEvidence,
  createVideoEvidence,
  resetEvidenceCounter,
  type BrowserEvidenceItem,
  type BrowserEvidenceManifest,
} from '../browser-evidence.js';

// =============================================================================
// Test Helpers
// =============================================================================

function makeSampleItem(overrides: Partial<BrowserEvidenceItem> = {}): BrowserEvidenceItem {
  return {
    id: 'ev-ss-1',
    type: 'screenshot',
    path: 'evidence/login--01-load.png',
    sha256: 'a'.repeat(64),
    sizeBytes: 12345,
    capturedAt: new Date().toISOString(),
    flow: 'login',
    step: '01-load',
    viewport: { width: 1280, height: 720 },
    url: 'http://localhost:5173/login',
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('BrowserEvidenceItemSchema', () => {
  it('should validate a well-formed screenshot item', () => {
    const item = makeSampleItem();
    const result = BrowserEvidenceItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('should validate a video item with duration', () => {
    const item = makeSampleItem({
      type: 'video',
      path: 'evidence/login-flow.webm',
      durationMs: 5000,
    });
    const result = BrowserEvidenceItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('should reject invalid sha256', () => {
    const item = makeSampleItem({ sha256: 'invalid-hash' });
    const result = BrowserEvidenceItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it('should reject negative size', () => {
    const item = makeSampleItem({ sizeBytes: -1 });
    const result = BrowserEvidenceItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });
});

describe('EvidenceManifestBuilder', () => {
  let builder: EvidenceManifestBuilder;

  beforeEach(() => {
    builder = new EvidenceManifestBuilder({
      commitSha: 'a'.repeat(40),
      evidenceDir: 'e2e/results/evidence',
      branch: 'main',
      ciRunId: 'run-123',
    });
  });

  it('should build a manifest with items', () => {
    builder.addItem(makeSampleItem({ id: 'ev-1', sha256: 'a'.repeat(64) }));
    builder.addItem(makeSampleItem({ id: 'ev-2', sha256: 'b'.repeat(64), flow: 'dashboard' }));

    const manifest = builder.build();

    expect(manifest.version).toBe('1.0');
    expect(manifest.items).toHaveLength(2);
    expect(manifest.summary.totalItems).toBe(2);
    expect(manifest.summary.flowsCovered).toEqual(['dashboard', 'login']);
    expect(manifest.commitSha).toBe('a'.repeat(40));
    expect(manifest.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should build an empty manifest', () => {
    const manifest = builder.build();

    expect(manifest.items).toHaveLength(0);
    expect(manifest.summary.totalItems).toBe(0);
    expect(manifest.summary.flowsCovered).toEqual([]);
  });

  it('should validate against the manifest schema', () => {
    builder.addItem(makeSampleItem());
    const manifest = builder.build();

    const result = BrowserEvidenceManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it('should compute correct manifest hash', () => {
    const item1 = makeSampleItem({ id: 'ev-1', sha256: 'a'.repeat(64) });
    const item2 = makeSampleItem({ id: 'ev-2', sha256: 'b'.repeat(64) });

    builder.addItem(item1);
    builder.addItem(item2);

    const manifest = builder.build();

    // Hash should be deterministic
    const builder2 = new EvidenceManifestBuilder({
      commitSha: 'a'.repeat(40),
      evidenceDir: 'e2e/results/evidence',
    });
    builder2.addItem(item1);
    builder2.addItem(item2);
    const manifest2 = builder2.build();

    expect(manifest.manifestHash).toBe(manifest2.manifestHash);
  });

  it('should track flow pass/fail based on visual regression', () => {
    builder.addItem(makeSampleItem({ id: 'ev-1', flow: 'login', visualRegressionPassed: true }));
    builder.addItem(makeSampleItem({ id: 'ev-2', flow: 'login', visualRegressionPassed: true }));
    builder.addItem(makeSampleItem({ id: 'ev-3', flow: 'dashboard', visualRegressionPassed: false }));

    const manifest = builder.build();

    expect(manifest.summary.flowsPassed).toBe(1); // login passed
    expect(manifest.summary.flowsFailed).toBe(1); // dashboard failed
  });
});

describe('verifyManifest', () => {
  it('should pass for a valid manifest', () => {
    const builder = new EvidenceManifestBuilder({
      commitSha: 'a'.repeat(40),
      evidenceDir: 'test',
    });
    builder.addItem(makeSampleItem());
    const manifest = builder.build();

    const result = verifyManifest(manifest);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.itemsVerified).toBe(1);
  });

  it('should detect manifest hash tampering', () => {
    const builder = new EvidenceManifestBuilder({
      commitSha: 'a'.repeat(40),
      evidenceDir: 'test',
    });
    builder.addItem(makeSampleItem());
    const manifest = builder.build();

    // Tamper with the hash
    manifest.manifestHash = 'f'.repeat(64);

    const result = verifyManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('hash mismatch'))).toBe(true);
  });

  it('should detect item count mismatch', () => {
    const builder = new EvidenceManifestBuilder({
      commitSha: 'a'.repeat(40),
      evidenceDir: 'test',
    });
    builder.addItem(makeSampleItem());
    const manifest = builder.build();

    // Tamper with summary
    manifest.summary.totalItems = 5;

    const result = verifyManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Item count mismatch'))).toBe(true);
  });

  it('should detect duplicate item IDs', () => {
    const builder = new EvidenceManifestBuilder({
      commitSha: 'a'.repeat(40),
      evidenceDir: 'test',
    });
    builder.addItem(makeSampleItem({ id: 'dup-1' }));
    builder.addItem(makeSampleItem({ id: 'dup-1', sha256: 'b'.repeat(64) }));
    const manifest = builder.build();

    const result = verifyManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Duplicate item ID'))).toBe(true);
  });

  it('should warn on empty manifest', () => {
    const builder = new EvidenceManifestBuilder({
      commitSha: 'a'.repeat(40),
      evidenceDir: 'test',
    });
    const manifest = builder.build();

    const result = verifyManifest(manifest);

    expect(result.valid).toBe(true); // Empty is valid but warned
    expect(result.warnings.some((w) => w.includes('no evidence items'))).toBe(true);
  });
});

describe('Factory functions', () => {
  beforeEach(() => {
    resetEvidenceCounter();
  });

  it('should create screenshot evidence with defaults', () => {
    const item = createScreenshotEvidence({
      flow: 'login',
      step: '01-load',
      path: 'evidence/login--01-load.png',
      sha256: 'a'.repeat(64),
      sizeBytes: 10000,
    });

    expect(item.type).toBe('screenshot');
    expect(item.viewport).toEqual({ width: 1280, height: 720 });
    expect(item.id).toMatch(/^ev-ss-/);

    const result = BrowserEvidenceItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('should create video evidence', () => {
    const item = createVideoEvidence({
      flow: 'login',
      step: 'full-flow',
      path: 'evidence/login-flow.webm',
      sha256: 'b'.repeat(64),
      sizeBytes: 500000,
      durationMs: 5000,
    });

    expect(item.type).toBe('video');
    expect(item.durationMs).toBe(5000);
    expect(item.id).toMatch(/^ev-vid-/);

    const result = BrowserEvidenceItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('should increment counter across calls', () => {
    const ss1 = createScreenshotEvidence({
      flow: 'a', step: '1', path: 'a.png', sha256: 'a'.repeat(64), sizeBytes: 1,
    });
    const ss2 = createScreenshotEvidence({
      flow: 'b', step: '2', path: 'b.png', sha256: 'b'.repeat(64), sizeBytes: 2,
    });

    expect(ss1.id).not.toBe(ss2.id);
  });
});
