/**
 * Merge Conflict Test Fixtures Index
 *
 * Phase 20: Provides structured access to all merge conflict test cases.
 *
 * Each fixture contains:
 * - base.txt: Common ancestor content
 * - ours.txt: HEAD branch changes
 * - theirs.txt: Incoming branch changes
 * - expected.txt: Expected merge result (with conflict markers if conflict)
 * - meta.json: Test metadata (expectedStatus, expectedConflicts, category)
 *
 * @module @gwi/core/merge/fixtures
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Fixture metadata from meta.json
 */
export interface FixtureMeta {
  name: string;
  description: string;
  expectedStatus: 'clean' | 'conflict' | 'skipped';
  expectedConflicts: number;
  category: 'auto-merge' | 'true-conflict' | 'partial-merge' | 'edge-case';
  skipReason?: string;
  isBinary?: boolean;
  renameInfo?: {
    oursPath: string;
    theirsPath: string;
    basePath: string;
  };
}

/**
 * Complete fixture data
 */
export interface MergeFixture {
  name: string;
  base: string;
  ours: string;
  theirs: string;
  expected: string | null; // null for skip cases
  meta: FixtureMeta;
}

/**
 * Load a single fixture by name
 */
export function loadFixture(name: string): MergeFixture {
  const fixtureDir = join(__dirname, name);

  if (!existsSync(fixtureDir)) {
    throw new Error(`Fixture not found: ${name}`);
  }

  const base = readFileSync(join(fixtureDir, 'base.txt'), 'utf-8');
  const ours = readFileSync(join(fixtureDir, 'ours.txt'), 'utf-8');
  const theirs = readFileSync(join(fixtureDir, 'theirs.txt'), 'utf-8');
  const meta = JSON.parse(readFileSync(join(fixtureDir, 'meta.json'), 'utf-8')) as FixtureMeta;

  const expectedPath = join(fixtureDir, 'expected.txt');
  const expected = existsSync(expectedPath)
    ? readFileSync(expectedPath, 'utf-8')
    : null;

  return { name, base, ours, theirs, expected, meta };
}

/**
 * Load all fixtures
 */
export function loadAllFixtures(): MergeFixture[] {
  const entries = readdirSync(__dirname, { withFileTypes: true });
  const fixtures: MergeFixture[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && existsSync(join(__dirname, entry.name, 'meta.json'))) {
      fixtures.push(loadFixture(entry.name));
    }
  }

  return fixtures;
}

/**
 * Load fixtures by category
 */
export function loadFixturesByCategory(category: FixtureMeta['category']): MergeFixture[] {
  return loadAllFixtures().filter((f) => f.meta.category === category);
}

/**
 * Load fixtures by expected status
 */
export function loadFixturesByStatus(status: FixtureMeta['expectedStatus']): MergeFixture[] {
  return loadAllFixtures().filter((f) => f.meta.expectedStatus === status);
}

/**
 * Available fixture names
 */
export const FIXTURE_NAMES = [
  'simple-addition',
  'same-line-edit',
  'overlapping-blocks',
  'conflict-markers-in-file',
  'ours-delete-theirs-edit',
  'import-ordering',
  'binary-file',
  'rename-move',
] as const;

export type FixtureName = (typeof FIXTURE_NAMES)[number];
