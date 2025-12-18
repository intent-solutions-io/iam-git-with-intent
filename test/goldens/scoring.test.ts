/**
 * Golden Tests - Scoring Determinism
 *
 * Ensures scoring produces consistent, deterministic outputs.
 * These tests verify that the same input always produces the same output.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateBaselineScore,
  createMinimalFeatures,
} from '../../packages/core/src/scoring/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPECTED_DIR = join(__dirname, 'expected');
const SCORING_GOLDEN_FILE = join(EXPECTED_DIR, 'scoring-outputs.json');

// =============================================================================
// Golden Test Fixtures
// =============================================================================

interface ScoringGoldenCase {
  id: string;
  description: string;
  input: Parameters<typeof createMinimalFeatures>[0];
  expectedScore: number;
  expectedReasons: string[];
}

const GOLDEN_CASES: ScoringGoldenCase[] = [
  {
    id: 'minimal',
    description: 'Minimal empty change',
    input: {},
    expectedScore: 1,
    expectedReasons: ['small_change', 'simple_conflict'],
  },
  {
    id: 'small_change',
    description: 'Small change under 50 lines',
    input: {
      numFiles: 2,
      numHunks: 3,
      totalConflictLines: 30,
      totalAdditions: 20,
      totalDeletions: 10,
    },
    expectedScore: 1,
    expectedReasons: [],
  },
  {
    id: 'medium_change',
    description: 'Medium change with many hunks triggers logic_conflict',
    input: {
      numFiles: 4,
      numHunks: 8,
      totalConflictLines: 150,
      totalAdditions: 100,
      totalDeletions: 50,
    },
    expectedScore: 4,
    expectedReasons: ['medium_change', 'logic_conflict'],
  },
  {
    id: 'large_change',
    description: 'Large change over 500 lines with many hunks',
    input: {
      numFiles: 8,
      numHunks: 15,
      totalConflictLines: 500,
      totalAdditions: 300,
      totalDeletions: 200,
    },
    expectedScore: 5,
    expectedReasons: ['large_change', 'logic_conflict'],
  },
  {
    id: 'security_files',
    description: 'Change with security-sensitive files',
    input: {
      numFiles: 3,
      numHunks: 5,
      totalConflictLines: 80,
      totalAdditions: 50,
      totalDeletions: 30,
      hasSecurityFiles: true,
    },
    expectedScore: 4,
    expectedReasons: ['security_sensitive', 'auth_related'],
  },
  {
    id: 'infra_files',
    description: 'Infrastructure file changes',
    input: {
      numFiles: 2,
      numHunks: 4,
      totalConflictLines: 100,
      totalAdditions: 60,
      totalDeletions: 40,
      hasInfraFiles: true,
    },
    expectedScore: 3,
    expectedReasons: ['infra_change'],
  },
  {
    id: 'test_only',
    description: 'Test files with many hunks (no reduction for multi-file)',
    input: {
      numFiles: 5,
      numHunks: 10,
      totalConflictLines: 200,
      totalAdditions: 150,
      totalDeletions: 50,
      hasTestFiles: true,
    },
    expectedScore: 4,
    expectedReasons: ['medium_change', 'logic_conflict'],
  },
  {
    id: 'config_files',
    description: 'Configuration file changes (small line count)',
    input: {
      numFiles: 3,
      numHunks: 4,
      totalConflictLines: 60,
      totalAdditions: 40,
      totalDeletions: 20,
      hasConfigFiles: true,
    },
    expectedScore: 2,
    expectedReasons: ['config_change'],
  },
  {
    id: 'complex_hunks',
    description: 'Many hunks per file triggers logic_conflict',
    input: {
      numFiles: 3,
      numHunks: 15,
      totalConflictLines: 120,
      totalAdditions: 80,
      totalDeletions: 40,
      maxHunksPerFile: 8,
    },
    expectedScore: 4,
    expectedReasons: ['medium_change', 'logic_conflict'],
  },
  {
    id: 'max_complexity',
    description: 'Maximum complexity scenario',
    input: {
      numFiles: 20,
      numHunks: 50,
      totalConflictLines: 2000,
      totalAdditions: 1500,
      totalDeletions: 500,
      hasSecurityFiles: true,
      hasInfraFiles: true,
      hasConfigFiles: true,
      maxHunksPerFile: 10,
    },
    expectedScore: 10,
    expectedReasons: [
      'large_change',
      'many_files',
      'logic_conflict',
      'config_change',
      'security_sensitive',
      'auth_related',
      'infra_change',
    ],
  },
];

// =============================================================================
// Golden Tests
// =============================================================================

describe('Scoring Golden Tests', () => {
  describe('Determinism', () => {
    for (const goldenCase of GOLDEN_CASES) {
      it(`${goldenCase.id}: produces consistent output`, () => {
        const features = createMinimalFeatures(goldenCase.input);

        // Run multiple times to verify determinism
        const results = Array.from({ length: 5 }, () => calculateBaselineScore(features));

        // All scores should match
        const scores = new Set(results.map((r) => r.score));
        expect(scores.size).toBe(1);

        // All reasons should match
        const reasonSets = results.map((r) => JSON.stringify(r.reasons.sort()));
        const uniqueReasonSets = new Set(reasonSets);
        expect(uniqueReasonSets.size).toBe(1);
      });
    }
  });

  describe('Expected Outputs', () => {
    for (const goldenCase of GOLDEN_CASES) {
      it(`${goldenCase.id}: ${goldenCase.description}`, () => {
        const features = createMinimalFeatures(goldenCase.input);
        const result = calculateBaselineScore(features);

        // Score should match expected
        expect(result.score).toBe(goldenCase.expectedScore);

        // All expected reasons should be present
        for (const reason of goldenCase.expectedReasons) {
          expect(result.reasons).toContain(reason);
        }
      });
    }
  });

  describe('Golden File Comparison', () => {
    it('matches stored golden outputs', () => {
      // Generate current outputs
      const currentOutputs = GOLDEN_CASES.map((goldenCase) => {
        const features = createMinimalFeatures(goldenCase.input);
        const result = calculateBaselineScore(features);
        return {
          id: goldenCase.id,
          score: result.score,
          reasons: result.reasons.sort(),
        };
      });

      // Check if golden file exists
      if (!existsSync(SCORING_GOLDEN_FILE)) {
        // Create it for the first time
        writeFileSync(
          SCORING_GOLDEN_FILE,
          JSON.stringify({ outputs: currentOutputs }, null, 2)
        );
        console.log(`Created golden file: ${SCORING_GOLDEN_FILE}`);
        return;
      }

      // Load and compare
      const storedData = JSON.parse(readFileSync(SCORING_GOLDEN_FILE, 'utf-8'));
      const storedOutputs = storedData.outputs;

      for (let i = 0; i < currentOutputs.length; i++) {
        const current = currentOutputs[i];
        const stored = storedOutputs.find((s: any) => s.id === current.id);

        if (!stored) {
          throw new Error(
            `Missing golden output for case: ${current.id}. ` +
              `Run tests to regenerate golden file.`
          );
        }

        expect(current.score).toBe(stored.score);
        expect(current.reasons).toEqual(stored.reasons);
      }
    });
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Scoring Edge Cases', () => {
  it('handles zero values gracefully', () => {
    const features = createMinimalFeatures({
      numFiles: 0,
      numHunks: 0,
      totalConflictLines: 0,
    });

    const result = calculateBaselineScore(features);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('handles very large values gracefully', () => {
    const features = createMinimalFeatures({
      numFiles: 10000,
      numHunks: 100000,
      totalConflictLines: 1000000,
    });

    const result = calculateBaselineScore(features);
    // Should clamp to valid range (1-10), exact score depends on feature weights
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('handles floating point inputs', () => {
    const features = createMinimalFeatures({
      avgHunksPerFile: 2.5,
    });

    const result = calculateBaselineScore(features);
    expect(Number.isInteger(result.score)).toBe(true);
  });
});
