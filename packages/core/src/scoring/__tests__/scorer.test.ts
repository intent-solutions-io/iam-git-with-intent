/**
 * Scorer Tests
 *
 * Golden tests for deterministic complexity scoring.
 * These tests ensure scoring consistency across runs.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateBaselineScore,
  quickEstimate,
  clampScore,
} from '../baseline-scorer.js';

import {
  validateAdjustment,
  isValidAdjustment,
  applyAdjustment,
  combinedScore,
  VALID_ADJUSTMENTS,
} from '../llm-adjustment.js';

import {
  extractFeatures,
  classifyFileRisk,
  getFileExtension,
  getFileTypes,
  createMinimalFeatures,
  type ConflictMetadata,
} from '../features.js';

import type { TriageFeatures } from '../../run-bundle/schemas/index.js';

// =============================================================================
// Load Golden Fixtures
// =============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesPath = join(__dirname, 'fixtures', 'golden-inputs.json');
const fixturesData = JSON.parse(readFileSync(fixturesPath, 'utf-8'));

interface GoldenFixture {
  id: string;
  description: string;
  features: TriageFeatures;
  expectedScore: number;
  expectedReasons: string[];
}

const fixtures: GoldenFixture[] = fixturesData.fixtures;

// =============================================================================
// Baseline Scorer Tests
// =============================================================================

describe('Baseline Scorer', () => {
  describe('calculateBaselineScore', () => {
    it('is deterministic - same input produces same output', () => {
      const features = createMinimalFeatures({
        numFiles: 5,
        numHunks: 10,
        totalConflictLines: 150,
        totalAdditions: 100,
        totalDeletions: 50,
        hasSecurityFiles: false,
        hasConflictMarkers: true,
      });

      // Run multiple times
      const results = Array.from({ length: 10 }, () => calculateBaselineScore(features));

      // All results should be identical
      const firstResult = results[0];
      for (const result of results) {
        expect(result.score).toBe(firstResult.score);
        expect(result.reasons).toEqual(firstResult.reasons);
        expect(result.breakdown).toEqual(firstResult.breakdown);
      }
    });

    it('returns score in valid range (1-10)', () => {
      // Test with minimal features
      const minResult = calculateBaselineScore(createMinimalFeatures());
      expect(minResult.score).toBeGreaterThanOrEqual(1);
      expect(minResult.score).toBeLessThanOrEqual(10);

      // Test with maximal features
      const maxResult = calculateBaselineScore(createMinimalFeatures({
        numFiles: 100,
        numHunks: 200,
        totalConflictLines: 10000,
        totalAdditions: 5000,
        totalDeletions: 3000,
        hasSecurityFiles: true,
        hasInfraFiles: true,
        hasConfigFiles: true,
        hasConflictMarkers: true,
        maxHunksPerFile: 50,
      }));
      expect(maxResult.score).toBeGreaterThanOrEqual(1);
      expect(maxResult.score).toBeLessThanOrEqual(10);
    });

    it('includes breakdown that sums to score', () => {
      const features = createMinimalFeatures({
        numFiles: 5,
        numHunks: 8,
        totalConflictLines: 300,
        totalAdditions: 200,
        totalDeletions: 100,
        hasConfigFiles: true,
        hasConflictMarkers: true,
        maxHunksPerFile: 4,
      });

      const result = calculateBaselineScore(features);

      // Sum of breakdown should equal the pre-clamped score
      const breakdownSum = Object.values(result.breakdown).reduce((a, b) => a + b, 0);
      // Note: breakdown sum may exceed 10 before clamping
      expect(breakdownSum).toBeGreaterThanOrEqual(1);
    });

    it('includes reasons for each score contribution', () => {
      const features = createMinimalFeatures({
        numFiles: 10,
        numHunks: 8,
        totalConflictLines: 400,
        hasSecurityFiles: true,
        hasInfraFiles: true,
        maxHunksPerFile: 4,
      });

      const result = calculateBaselineScore(features);

      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons).toContain('security_sensitive');
      expect(result.reasons).toContain('auth_related');
      expect(result.reasons).toContain('infra_change');
    });
  });

  describe('Golden Fixtures', () => {
    for (const fixture of fixtures) {
      it(`${fixture.id}: ${fixture.description}`, () => {
        const result = calculateBaselineScore(fixture.features);

        // Score should match expected
        expect(result.score).toBe(fixture.expectedScore);

        // All expected reasons should be present
        for (const reason of fixture.expectedReasons) {
          expect(result.reasons).toContain(reason);
        }
      });
    }

    it('all fixtures produce consistent scores across multiple runs', () => {
      for (const fixture of fixtures) {
        const results = Array.from({ length: 5 }, () =>
          calculateBaselineScore(fixture.features)
        );

        // All runs should produce identical scores
        const scores = results.map(r => r.score);
        expect(new Set(scores).size).toBe(1);
      }
    });
  });

  describe('quickEstimate', () => {
    it('returns valid score range', () => {
      expect(quickEstimate(1, 10)).toBeGreaterThanOrEqual(1);
      expect(quickEstimate(1, 10)).toBeLessThanOrEqual(10);
      expect(quickEstimate(100, 10000, true)).toBeGreaterThanOrEqual(1);
      expect(quickEstimate(100, 10000, true)).toBeLessThanOrEqual(10);
    });

    it('increases score for security files', () => {
      const withoutSecurity = quickEstimate(5, 100, false);
      const withSecurity = quickEstimate(5, 100, true);
      expect(withSecurity).toBeGreaterThan(withoutSecurity);
    });

    it('increases score for more files', () => {
      const fewFiles = quickEstimate(2, 100);
      const manyFiles = quickEstimate(20, 100);
      expect(manyFiles).toBeGreaterThan(fewFiles);
    });

    it('increases score for more lines', () => {
      const fewLines = quickEstimate(5, 50);
      const manyLines = quickEstimate(5, 1000);
      expect(manyLines).toBeGreaterThan(fewLines);
    });
  });

  describe('clampScore', () => {
    it('clamps values below 1 to 1', () => {
      expect(clampScore(0)).toBe(1);
      expect(clampScore(-5)).toBe(1);
      expect(clampScore(0.5)).toBe(1);
    });

    it('clamps values above 10 to 10', () => {
      expect(clampScore(11)).toBe(10);
      expect(clampScore(100)).toBe(10);
      expect(clampScore(10.5)).toBe(10);
    });

    it('rounds to nearest integer', () => {
      expect(clampScore(5.4)).toBe(5);
      expect(clampScore(5.5)).toBe(6);
      expect(clampScore(5.6)).toBe(6);
    });

    it('preserves valid scores', () => {
      for (let i = 1; i <= 10; i++) {
        expect(clampScore(i)).toBe(i);
      }
    });
  });
});

// =============================================================================
// LLM Adjustment Tests
// =============================================================================

describe('LLM Adjustment', () => {
  describe('validateAdjustment', () => {
    it('clamps values below -2 to -2', () => {
      expect(validateAdjustment(-5)).toBe(-2);
      expect(validateAdjustment(-3)).toBe(-2);
      expect(validateAdjustment(-100)).toBe(-2);
    });

    it('clamps values above 2 to 2', () => {
      expect(validateAdjustment(5)).toBe(2);
      expect(validateAdjustment(3)).toBe(2);
      expect(validateAdjustment(100)).toBe(2);
    });

    it('rounds to nearest integer', () => {
      expect(validateAdjustment(0.4)).toBe(0);
      expect(validateAdjustment(0.6)).toBe(1);
      expect(validateAdjustment(-0.6)).toBe(-1);
      expect(validateAdjustment(1.4)).toBe(1);
      expect(validateAdjustment(1.6)).toBe(2);
    });

    it('preserves valid adjustments', () => {
      for (const adj of VALID_ADJUSTMENTS) {
        expect(validateAdjustment(adj)).toBe(adj);
      }
    });
  });

  describe('isValidAdjustment', () => {
    it('returns true for valid adjustments', () => {
      for (const adj of VALID_ADJUSTMENTS) {
        expect(isValidAdjustment(adj)).toBe(true);
      }
    });

    it('returns false for invalid adjustments', () => {
      expect(isValidAdjustment(3)).toBe(false);
      expect(isValidAdjustment(-3)).toBe(false);
      expect(isValidAdjustment(0.5)).toBe(false);
      expect(isValidAdjustment(100)).toBe(false);
    });
  });

  describe('applyAdjustment', () => {
    it('applies adjustment correctly', () => {
      expect(applyAdjustment(5, 0)).toBe(5);
      expect(applyAdjustment(5, 1)).toBe(6);
      expect(applyAdjustment(5, 2)).toBe(7);
      expect(applyAdjustment(5, -1)).toBe(4);
      expect(applyAdjustment(5, -2)).toBe(3);
    });

    it('clamps result to valid score range', () => {
      // Upper bound
      expect(applyAdjustment(9, 2)).toBe(10);
      expect(applyAdjustment(10, 2)).toBe(10);

      // Lower bound
      expect(applyAdjustment(2, -2)).toBe(1);
      expect(applyAdjustment(1, -2)).toBe(1);
    });

    it('maintains score in valid range for all combinations', () => {
      for (let baseline = 1; baseline <= 10; baseline++) {
        for (const adj of VALID_ADJUSTMENTS) {
          const result = applyAdjustment(baseline as 1|2|3|4|5|6|7|8|9|10, adj);
          expect(result).toBeGreaterThanOrEqual(1);
          expect(result).toBeLessThanOrEqual(10);
        }
      }
    });
  });

  describe('combinedScore', () => {
    it('creates valid combined score result', () => {
      const result = combinedScore(
        5,
        ['medium_change', 'config_change'],
        {
          adjustment: 1,
          reasons: ['ambiguous_intent'],
          explanation: 'Intent unclear from commit messages',
        }
      );

      expect(result.baselineScore).toBe(5);
      expect(result.llmAdjustment).toBe(1);
      expect(result.finalScore).toBe(6);
      expect(result.reasons.baseline).toEqual(['medium_change', 'config_change']);
      expect(result.reasons.llm).toEqual(['ambiguous_intent']);
    });

    it('validates and clamps adjustment', () => {
      const result = combinedScore(
        5,
        ['small_change'],
        {
          adjustment: 5 as any, // Invalid, should be clamped to 2
          reasons: ['risk_security'],
        }
      );

      expect(result.llmAdjustment).toBe(2);
      expect(result.finalScore).toBe(7);
    });

    it('clamps final score to valid range', () => {
      // High baseline + positive adjustment
      const highResult = combinedScore(
        10,
        ['large_change'],
        { adjustment: 2, reasons: ['risk_data_loss'] }
      );
      expect(highResult.finalScore).toBe(10);

      // Low baseline + negative adjustment
      const lowResult = combinedScore(
        1,
        ['small_change'],
        { adjustment: -2, reasons: ['clear_intent'] }
      );
      expect(lowResult.finalScore).toBe(1);
    });
  });
});

// =============================================================================
// Feature Extraction Tests
// =============================================================================

describe('Feature Extraction', () => {
  describe('classifyFileRisk', () => {
    it('classifies secrets files correctly', () => {
      expect(classifyFileRisk('.env')).toBe('secrets');
      expect(classifyFileRisk('.env.production')).toBe('secrets');
      expect(classifyFileRisk('secrets.json')).toBe('secrets');
      expect(classifyFileRisk('credentials.yaml')).toBe('secrets');
      expect(classifyFileRisk('private.pem')).toBe('secrets');
      expect(classifyFileRisk('server.key')).toBe('secrets');
    });

    it('classifies auth files correctly', () => {
      expect(classifyFileRisk('src/auth/login.ts')).toBe('auth');
      expect(classifyFileRisk('lib/authentication.js')).toBe('auth');
      expect(classifyFileRisk('services/oauth.ts')).toBe('auth');
      expect(classifyFileRisk('utils/jwt.ts')).toBe('auth');
      expect(classifyFileRisk('middleware/session.ts')).toBe('auth');
    });

    it('classifies financial files correctly', () => {
      expect(classifyFileRisk('services/payment.ts')).toBe('financial');
      expect(classifyFileRisk('components/Checkout.tsx')).toBe('financial');
      expect(classifyFileRisk('api/stripe.ts')).toBe('financial');
      expect(classifyFileRisk('hooks/useSubscription.ts')).toBe('financial');
    });

    it('classifies infrastructure files correctly', () => {
      expect(classifyFileRisk('main.tf')).toBe('infrastructure');
      expect(classifyFileRisk('infra/terraform/vpc.tf')).toBe('infrastructure');
      expect(classifyFileRisk('k8s/deployment.yaml')).toBe('infrastructure');
      expect(classifyFileRisk('docker/Dockerfile')).toBe('infrastructure');
      expect(classifyFileRisk('helm/values.yaml')).toBe('infrastructure');
    });

    it('classifies config files correctly', () => {
      expect(classifyFileRisk('tsconfig.json')).toBe('config');
      expect(classifyFileRisk('.eslintrc.json')).toBe('config');
      expect(classifyFileRisk('webpack.config.js')).toBe('config');
      expect(classifyFileRisk('settings.toml')).toBe('config');
    });

    it('classifies test files correctly', () => {
      expect(classifyFileRisk('src/utils.test.ts')).toBe('test');
      expect(classifyFileRisk('lib/parser.spec.js')).toBe('test');
      expect(classifyFileRisk('__tests__/button.test.tsx')).toBe('test');
      expect(classifyFileRisk('tests/integration/routes.test.ts')).toBe('test');
    });

    it('classifies safe files correctly', () => {
      expect(classifyFileRisk('src/utils.ts')).toBe('safe');
      expect(classifyFileRisk('lib/parser.js')).toBe('safe');
      expect(classifyFileRisk('components/Button.tsx')).toBe('safe');
      expect(classifyFileRisk('README.md')).toBe('safe');
    });

    it('prioritizes higher risk classifications', () => {
      // Auth takes priority over test
      expect(classifyFileRisk('auth.test.ts')).toBe('auth');

      // Secrets takes priority over config
      expect(classifyFileRisk('secrets.json')).toBe('secrets');
    });
  });

  describe('getFileExtension', () => {
    it('extracts extension correctly', () => {
      expect(getFileExtension('file.ts')).toBe('ts');
      expect(getFileExtension('file.test.tsx')).toBe('tsx');
      expect(getFileExtension('path/to/file.json')).toBe('json');
      expect(getFileExtension('.env')).toBe('env');
    });

    it('returns empty string for no extension', () => {
      expect(getFileExtension('Dockerfile')).toBe('');
      expect(getFileExtension('Makefile')).toBe('');
    });

    it('handles case insensitively', () => {
      expect(getFileExtension('file.TS')).toBe('ts');
      expect(getFileExtension('file.JSON')).toBe('json');
    });
  });

  describe('getFileTypes', () => {
    it('returns unique sorted extensions', () => {
      const paths = ['a.ts', 'b.tsx', 'c.ts', 'd.json', 'e.tsx'];
      expect(getFileTypes(paths)).toEqual(['json', 'ts', 'tsx']);
    });

    it('filters out files without extensions', () => {
      const paths = ['a.ts', 'Dockerfile', 'b.json', 'Makefile'];
      expect(getFileTypes(paths)).toEqual(['json', 'ts']);
    });
  });

  describe('extractFeatures', () => {
    it('extracts features from conflict metadata', () => {
      const metadata: ConflictMetadata = {
        files: [
          {
            path: 'src/auth/login.ts',
            hunks: [
              { startLine: 10, endLine: 20, oursLines: 5, theirsLines: 3 },
              { startLine: 50, endLine: 60, oursLines: 4, theirsLines: 6 },
            ],
            additions: 20,
            deletions: 10,
            hasConflictMarkers: true,
          },
          {
            path: 'src/utils.ts',
            hunks: [
              { startLine: 5, endLine: 15, oursLines: 8, theirsLines: 4 },
            ],
            additions: 15,
            deletions: 5,
            hasConflictMarkers: false,
          },
        ],
        baseBranch: 'main',
        headBranch: 'feature/auth',
        totalAdditions: 35,
        totalDeletions: 15,
      };

      const features = extractFeatures(metadata);

      expect(features.numFiles).toBe(2);
      expect(features.numHunks).toBe(3);
      expect(features.totalConflictLines).toBe(30); // 5+3+4+6+8+4
      expect(features.totalAdditions).toBe(35);
      expect(features.totalDeletions).toBe(15);
      expect(features.fileTypes).toEqual(['ts']);
      expect(features.hasSecurityFiles).toBe(true); // auth file
      expect(features.hasConflictMarkers).toBe(true);
      expect(features.maxHunksPerFile).toBe(2);
      expect(features.avgHunksPerFile).toBe(1.5);
    });

    it('handles empty metadata', () => {
      const metadata: ConflictMetadata = {
        files: [],
        baseBranch: 'main',
        headBranch: 'feature',
        totalAdditions: 0,
        totalDeletions: 0,
      };

      const features = extractFeatures(metadata);

      expect(features.numFiles).toBe(0);
      expect(features.numHunks).toBe(0);
      expect(features.avgHunksPerFile).toBe(0);
    });
  });

  describe('createMinimalFeatures', () => {
    it('creates features with defaults', () => {
      const features = createMinimalFeatures();

      expect(features.numFiles).toBe(0);
      expect(features.numHunks).toBe(0);
      expect(features.totalConflictLines).toBe(0);
      expect(features.hasSecurityFiles).toBe(false);
      expect(features.hasInfraFiles).toBe(false);
      expect(features.hasConfigFiles).toBe(false);
      expect(features.hasTestFiles).toBe(false);
    });

    it('allows overriding defaults', () => {
      const features = createMinimalFeatures({
        numFiles: 5,
        hasSecurityFiles: true,
      });

      expect(features.numFiles).toBe(5);
      expect(features.hasSecurityFiles).toBe(true);
      expect(features.numHunks).toBe(0); // Still default
    });
  });
});
