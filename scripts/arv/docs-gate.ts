#!/usr/bin/env npx tsx
/**
 * ARV Docs Gate
 *
 * Validates that phase closeout documentation follows standards:
 * - AARs must follow naming convention: NNN-AA-AACR-phase-<n>-*.md
 * - Required metadata fields present
 * - 000-docs/ must be flat (no subdirectories)
 *
 * NOTE: Beads and AgentFS are INTERNAL DEV TOOLS, not product requirements.
 * They are NOT validated by this gate.
 *
 * @module scripts/arv/docs-gate
 */

import { readFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DOCS_DIR = join(PROJECT_ROOT, '000-docs');

interface ValidationResult {
  file: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface DocsGateResult {
  passed: boolean;
  flatnessValid: boolean;
  aarCount: number;
  results: ValidationResult[];
}

/**
 * Required metadata fields in AAR header
 */
const REQUIRED_FIELDS = [
  /\*\*Document ID\*\*:/,
  /\*\*Type\*\*:\s*(After-Action|AACR)/,
  /\*\*Phase\*\*:\s*\d+/,
  /\*\*Status\*\*:\s*(COMPLETE|IN_PROGRESS|BLOCKED)/,
  /\*\*Date\*\*:/,
  /\*\*Author\*\*:/,
];

/**
 * Required sections in AAR (product-relevant only)
 */
const REQUIRED_SECTIONS = [
  '## Executive Summary',
  '## Scope',
  '## Deliverables',
  '## Files Changed',
  '## Verification',
];

/**
 * Check if 000-docs/ is flat (no subdirectories with docs)
 */
async function checkFlatness(): Promise<{ valid: boolean; subdirs: string[] }> {
  const entries = await readdir(DOCS_DIR, { withFileTypes: true });
  const subdirs: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      // Check if subdir contains any markdown files
      const subPath = join(DOCS_DIR, entry.name);
      try {
        const subFiles = await readdir(subPath);
        const hasMd = subFiles.some((f) => f.endsWith('.md'));
        if (hasMd) {
          subdirs.push(entry.name);
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  return { valid: subdirs.length === 0, subdirs };
}

/**
 * Validate a single AAR file
 */
async function validateAAR(filepath: string, filename: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    file: filename,
    valid: true,
    errors: [],
    warnings: [],
  };

  const content = await readFile(filepath, 'utf-8');

  // Check required metadata fields
  for (const pattern of REQUIRED_FIELDS) {
    if (!pattern.test(content)) {
      result.errors.push(`Missing required field: ${pattern.source}`);
      result.valid = false;
    }
  }

  // Check required sections
  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      result.errors.push(`Missing required section: ${section}`);
      result.valid = false;
    }
  }

  // Check filename convention
  const filenamePattern = /^\d{3}-AA-AACR-phase-\d+-[a-z][a-z0-9-]*\.md$/;
  if (!filenamePattern.test(filename)) {
    result.warnings.push(
      `Filename does not match convention: NNN-AA-AACR-phase-<n>-<slug>.md`
    );
  }

  return result;
}

/**
 * Run the docs gate
 */
export async function runDocsGate(): Promise<DocsGateResult> {
  const result: DocsGateResult = {
    passed: true,
    flatnessValid: true,
    aarCount: 0,
    results: [],
  };

  // Check flatness
  const flatness = await checkFlatness();
  result.flatnessValid = flatness.valid;
  if (!flatness.valid) {
    result.passed = false;
    console.log(`\n  000-docs/ is not flat - found subdirectories with docs:`);
    for (const subdir of flatness.subdirs) {
      console.log(`    - ${subdir}/`);
    }
  }

  // Find and validate AARs
  const files = await readdir(DOCS_DIR);
  const aarFiles = files.filter((f) => f.includes('-AA-AACR-') && f.endsWith('.md'));

  result.aarCount = aarFiles.length;

  for (const file of aarFiles) {
    const filepath = join(DOCS_DIR, file);
    const validation = await validateAAR(filepath, file);
    result.results.push(validation);

    if (!validation.valid) {
      result.passed = false;
    }
  }

  return result;
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  console.log('Docs Gate - AAR Validation\n');

  const result = await runDocsGate();

  // Print flatness status
  if (result.flatnessValid) {
    console.log('  000-docs/ flatness: OK');
  } else {
    console.log('  000-docs/ flatness: FAILED');
  }

  console.log(`\n  Found ${result.aarCount} AAR file(s)\n`);

  // Print results
  for (const validation of result.results) {
    const icon = validation.valid ? '  ' : '  ';
    console.log(`${icon} ${validation.file}`);

    for (const error of validation.errors) {
      console.log(`      ${error}`);
    }
    for (const warning of validation.warnings) {
      console.log(`      ${warning}`);
    }
  }

  // Summary
  const passed = result.results.filter((r) => r.valid).length;
  const failed = result.results.filter((r) => !r.valid).length;

  console.log(`\n  Summary: ${passed} valid, ${failed} invalid`);

  if (!result.passed) {
    console.log('\n  FAILED');
    process.exit(1);
  }

  console.log('\n  PASSED');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
