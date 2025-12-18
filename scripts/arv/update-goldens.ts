/**
 * Update golden test expected values
 * Run with: npx tsx scripts/arv/update-goldens.ts
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateBaselineScore,
  createMinimalFeatures,
} from '../../packages/core/src/scoring/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_FILE = join(__dirname, '../../test/goldens/expected/scoring-outputs.json');

const GOLDEN_CASES = [
  { id: 'minimal', input: {} },
  { id: 'small_change', input: { numFiles: 2, numHunks: 3, totalConflictLines: 30, totalAdditions: 20, totalDeletions: 10 } },
  { id: 'medium_change', input: { numFiles: 4, numHunks: 8, totalConflictLines: 150, totalAdditions: 100, totalDeletions: 50 } },
  { id: 'large_change', input: { numFiles: 8, numHunks: 15, totalConflictLines: 500, totalAdditions: 300, totalDeletions: 200 } },
  { id: 'security_files', input: { numFiles: 3, numHunks: 5, totalConflictLines: 80, totalAdditions: 50, totalDeletions: 30, hasSecurityFiles: true } },
  { id: 'infra_files', input: { numFiles: 2, numHunks: 4, totalConflictLines: 100, totalAdditions: 60, totalDeletions: 40, hasInfraFiles: true } },
  { id: 'test_only', input: { numFiles: 5, numHunks: 10, totalConflictLines: 200, totalAdditions: 150, totalDeletions: 50, hasTestFiles: true } },
  { id: 'config_files', input: { numFiles: 3, numHunks: 4, totalConflictLines: 60, totalAdditions: 40, totalDeletions: 20, hasConfigFiles: true } },
  { id: 'complex_hunks', input: { numFiles: 3, numHunks: 15, totalConflictLines: 120, totalAdditions: 80, totalDeletions: 40, maxHunksPerFile: 8 } },
  { id: 'max_complexity', input: { numFiles: 20, numHunks: 50, totalConflictLines: 2000, totalAdditions: 1500, totalDeletions: 500, hasSecurityFiles: true, hasInfraFiles: true, hasConfigFiles: true, maxHunksPerFile: 10 } },
];

const outputs = GOLDEN_CASES.map((c) => {
  const features = createMinimalFeatures(c.input);
  const result = calculateBaselineScore(features);
  console.log(`${c.id}: score=${result.score}, reasons=[${result.reasons.join(', ')}]`);
  return { id: c.id, score: result.score, reasons: result.reasons.sort() };
});

writeFileSync(GOLDEN_FILE, JSON.stringify({ outputs }, null, 2) + '\n');
console.log(`\nWrote golden file to: ${GOLDEN_FILE}`);
