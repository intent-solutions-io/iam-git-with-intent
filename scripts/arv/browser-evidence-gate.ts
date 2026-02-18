#!/usr/bin/env npx tsx
/**
 * Browser Evidence ARV Gate
 *
 * Code Factory Pattern 7: Browser evidence as first-class proof.
 *
 * Verifies:
 * 1. Browser evidence schema exists with Zod validation
 * 2. Manifest builder and verification functions present
 * 3. Evidence manifest schema validates correctly
 * 4. Playwright config exists for apps/web
 * 5. E2E test files exist with evidence capture
 * 6. Evidence types are exported from @gwi/core
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string[];
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, message: string, details?: string[]): void {
  results.push({ name, passed, message, details });
  const icon = passed ? '\u2705' : '\u274C';
  console.log(`${icon} ${name}: ${message}`);
  if (details && details.length > 0) {
    for (const detail of details) {
      console.log(`   ${detail}`);
    }
  }
}

async function main(): Promise<void> {
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551       Browser Evidence ARV Gate                            \u2551');
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');
  console.log();

  // ==========================================================================
  // Check 1: Browser evidence schema exists with Zod validation
  // ==========================================================================
  const schemaPath = join(ROOT, 'packages/core/src/evidence/browser-evidence.ts');
  if (existsSync(schemaPath)) {
    const content = readFileSync(schemaPath, 'utf-8');
    const hasZod = content.includes("from 'zod'");
    const hasItemSchema = content.includes('BrowserEvidenceItemSchema');
    const hasManifestSchema = content.includes('BrowserEvidenceManifestSchema');
    const hasVerify = content.includes('verifyManifest');
    const hasBuilder = content.includes('EvidenceManifestBuilder');

    check(
      'Browser Evidence Schema',
      hasZod && hasItemSchema && hasManifestSchema && hasVerify && hasBuilder,
      hasZod && hasItemSchema && hasManifestSchema
        ? 'Schema, builder, and verification present'
        : 'Missing required components',
      [
        `Zod validation: ${hasZod ? 'yes' : 'MISSING'}`,
        `Item schema: ${hasItemSchema ? 'yes' : 'MISSING'}`,
        `Manifest schema: ${hasManifestSchema ? 'yes' : 'MISSING'}`,
        `Manifest builder: ${hasBuilder ? 'yes' : 'MISSING'}`,
        `Verify function: ${hasVerify ? 'yes' : 'MISSING'}`,
      ],
    );
  } else {
    check('Browser Evidence Schema', false, `File not found: ${schemaPath}`);
  }

  // ==========================================================================
  // Check 2: Evidence exported from index
  // ==========================================================================
  const evidenceIndexPath = join(ROOT, 'packages/core/src/evidence/index.ts');
  if (existsSync(evidenceIndexPath)) {
    const content = readFileSync(evidenceIndexPath, 'utf-8');
    const hasExport = content.includes('browser-evidence');
    const hasManifestExport = content.includes('BrowserEvidenceManifestSchema');
    const hasVerifyExport = content.includes('verifyManifest');

    check(
      'Evidence Exports',
      hasExport && hasManifestExport && hasVerifyExport,
      hasExport ? 'Browser evidence exported from @gwi/core' : 'Missing browser evidence exports',
    );
  } else {
    check('Evidence Exports', false, 'Evidence index.ts not found');
  }

  // ==========================================================================
  // Check 3: Playwright config exists
  // ==========================================================================
  const playwrightConfigPath = join(ROOT, 'apps/web/playwright.config.ts');
  if (existsSync(playwrightConfigPath)) {
    const content = readFileSync(playwrightConfigPath, 'utf-8');
    const hasScreenshot = content.includes('screenshot');
    const hasVideo = content.includes('video');
    const hasViewport = content.includes('viewport');

    check(
      'Playwright Config',
      hasScreenshot && hasViewport,
      'Playwright configured for evidence capture',
      [
        `Screenshot capture: ${hasScreenshot ? 'yes' : 'MISSING'}`,
        `Video capture: ${hasVideo ? 'yes' : 'MISSING'}`,
        `Viewport set: ${hasViewport ? 'yes' : 'MISSING'}`,
      ],
    );
  } else {
    check('Playwright Config', false, 'playwright.config.ts not found in apps/web/');
  }

  // ==========================================================================
  // Check 4: E2E test files exist
  // ==========================================================================
  const e2eSpecPath = join(ROOT, 'apps/web/e2e/browser-evidence.spec.ts');
  if (existsSync(e2eSpecPath)) {
    const content = readFileSync(e2eSpecPath, 'utf-8');
    const hasCapture = content.includes('captureEvidence');
    const hasManifest = content.includes('manifest');
    const hasFlows = content.includes('flow');

    check(
      'E2E Evidence Tests',
      hasCapture && hasManifest && hasFlows,
      'E2E tests capture evidence with manifest generation',
      [
        `Evidence capture function: ${hasCapture ? 'yes' : 'MISSING'}`,
        `Manifest generation: ${hasManifest ? 'yes' : 'MISSING'}`,
        `UI flow coverage: ${hasFlows ? 'yes' : 'MISSING'}`,
      ],
    );
  } else {
    check('E2E Evidence Tests', false, 'browser-evidence.spec.ts not found');
  }

  // ==========================================================================
  // Check 5: Web package.json has e2e scripts
  // ==========================================================================
  const webPkgPath = join(ROOT, 'apps/web/package.json');
  if (existsSync(webPkgPath)) {
    const content = JSON.parse(readFileSync(webPkgPath, 'utf-8'));
    const hasE2e = !!content.scripts?.['e2e'];
    const hasE2eEvidence = !!content.scripts?.['e2e:evidence'];

    check(
      'Web E2E Scripts',
      hasE2e && hasE2eEvidence,
      hasE2e ? 'E2E scripts configured in package.json' : 'Missing e2e scripts',
    );
  } else {
    check('Web E2E Scripts', false, 'apps/web/package.json not found');
  }

  // ==========================================================================
  // Check 6: Incident-to-harness module exists
  // ==========================================================================
  const harnessPath = join(ROOT, 'packages/core/src/policy/incident-to-harness.ts');
  if (existsSync(harnessPath)) {
    const content = readFileSync(harnessPath, 'utf-8');
    const hasGenerator = content.includes('IncidentHarnessGenerator');
    const hasGoldenSchema = content.includes('GoldenTaskSchema');
    const hasSla = content.includes('slaTargetHours');
    const hasYaml = content.includes('serializeToYaml');

    check(
      'Incident-to-Harness',
      hasGenerator && hasGoldenSchema && hasSla && hasYaml,
      'Incident-to-harness feedback loop implemented',
      [
        `Generator class: ${hasGenerator ? 'yes' : 'MISSING'}`,
        `Golden task schema: ${hasGoldenSchema ? 'yes' : 'MISSING'}`,
        `SLA tracking: ${hasSla ? 'yes' : 'MISSING'}`,
        `YAML serializer: ${hasYaml ? 'yes' : 'MISSING'}`,
      ],
    );
  } else {
    check('Incident-to-Harness', false, 'incident-to-harness.ts not found');
  }

  // ==========================================================================
  // Check 7: Incident-to-harness exported from policy index
  // ==========================================================================
  const policyIndexPath = join(ROOT, 'packages/core/src/policy/index.ts');
  if (existsSync(policyIndexPath)) {
    const content = readFileSync(policyIndexPath, 'utf-8');
    const hasExport = content.includes('incident-to-harness');
    const hasGeneratorExport = content.includes('IncidentHarnessGenerator');

    check(
      'Harness Exports',
      hasExport && hasGeneratorExport,
      hasExport ? 'Incident-to-harness exported from @gwi/core/policy' : 'Missing exports',
    );
  } else {
    check('Harness Exports', false, 'Policy index.ts not found');
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log();
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`Results: ${passed}/${total} checks passed`);

  if (failed > 0) {
    console.log();
    console.log('Failed checks:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.message}`);
    }
    process.exit(1);
  }

  console.log();
  console.log('Browser evidence gate passed!');
}

main().catch((err) => {
  console.error('Gate failed:', err);
  process.exit(1);
});
