#!/usr/bin/env npx tsx
/**
 * Phase 27: Forensics ARV Gate
 *
 * Verifies the forensics infrastructure is correctly implemented:
 * 1. ForensicBundle schema with Zod validation
 * 2. RedactionService with secret/key patterns
 * 3. ForensicCollector for event capture
 * 4. ReplayEngine for deterministic replay
 * 5. CLI integration with feature flag
 * 6. Golden tests present
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
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}: ${message}`);
  if (details && details.length > 0) {
    for (const detail of details) {
      console.log(`   ${detail}`);
    }
  }
}

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       Phase 27: Forensics ARV Gate                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  // ==========================================================================
  // Check 1: ForensicBundle schema exists with Zod validation
  // ==========================================================================
  const typesPath = join(ROOT, 'packages/core/src/forensics/types.ts');
  if (existsSync(typesPath)) {
    const content = readFileSync(typesPath, 'utf-8');
    const hasZod = content.includes("from 'zod'");
    const hasBundleSchema = content.includes('ForensicBundleSchema');
    const hasEventTypes = content.includes('ForensicEventType');
    const hasReplayStatus = content.includes('ReplayStatus');
    const hasValidation = content.includes('validateForensicBundle');

    check(
      'ForensicBundle Schema',
      hasZod && hasBundleSchema && hasEventTypes && hasReplayStatus && hasValidation,
      'ForensicBundle schema with Zod validation',
      [
        `Zod import: ${hasZod ? '✓' : '✗'}`,
        `ForensicBundleSchema: ${hasBundleSchema ? '✓' : '✗'}`,
        `ForensicEventType: ${hasEventTypes ? '✓' : '✗'}`,
        `ReplayStatus: ${hasReplayStatus ? '✓' : '✗'}`,
        `validateForensicBundle: ${hasValidation ? '✓' : '✗'}`,
      ]
    );
  } else {
    check('ForensicBundle Schema', false, 'types.ts not found');
  }

  // ==========================================================================
  // Check 2: RedactionService with secret patterns
  // ==========================================================================
  const redactionPath = join(ROOT, 'packages/core/src/forensics/redaction.ts');
  if (existsSync(redactionPath)) {
    const content = readFileSync(redactionPath, 'utf-8');
    const hasRedactionService = content.includes('class RedactionService');
    const hasGetRedactionService = content.includes('getRedactionService');
    const hasApiKeyPattern = content.includes('OPENAI_KEY') || content.includes('sk-');
    const hasAnthropicPattern = content.includes('ANTHROPIC_KEY');
    const hasGitHubPattern = content.includes('GITHUB_PAT');
    const hasBearerToken = content.includes('BEARER_TOKEN');
    const hasContainsSecrets = content.includes('containsSecrets');

    check(
      'RedactionService',
      hasRedactionService && hasGetRedactionService && hasApiKeyPattern && hasAnthropicPattern,
      'RedactionService with secret detection patterns',
      [
        `RedactionService class: ${hasRedactionService ? '✓' : '✗'}`,
        `getRedactionService singleton: ${hasGetRedactionService ? '✓' : '✗'}`,
        `OpenAI key pattern: ${hasApiKeyPattern ? '✓' : '✗'}`,
        `Anthropic key pattern: ${hasAnthropicPattern ? '✓' : '✗'}`,
        `GitHub PAT pattern: ${hasGitHubPattern ? '✓' : '✗'}`,
        `Bearer token pattern: ${hasBearerToken ? '✓' : '✗'}`,
        `containsSecrets method: ${hasContainsSecrets ? '✓' : '✗'}`,
      ]
    );
  } else {
    check('RedactionService', false, 'redaction.ts not found');
  }

  // ==========================================================================
  // Check 3: ForensicCollector for event capture
  // ==========================================================================
  const collectorPath = join(ROOT, 'packages/core/src/forensics/collector.ts');
  if (existsSync(collectorPath)) {
    const content = readFileSync(collectorPath, 'utf-8');
    const hasCollectorClass = content.includes('class ForensicCollector');
    const hasCreateCollector = content.includes('createForensicCollector');
    const hasStart = content.includes('start(');
    const hasComplete = content.includes('complete(');
    const hasFail = content.includes('fail(');
    const hasLlmRequest = content.includes('llmRequest(');
    const hasLlmResponse = content.includes('llmResponse(');
    const hasBuild = content.includes('build(');
    const hasEventTracking = content.includes('addEvent');

    check(
      'ForensicCollector',
      hasCollectorClass && hasCreateCollector && hasStart && hasComplete && hasBuild,
      'ForensicCollector with event capture methods',
      [
        `ForensicCollector class: ${hasCollectorClass ? '✓' : '✗'}`,
        `createForensicCollector factory: ${hasCreateCollector ? '✓' : '✗'}`,
        `start method: ${hasStart ? '✓' : '✗'}`,
        `complete method: ${hasComplete ? '✓' : '✗'}`,
        `fail method: ${hasFail ? '✓' : '✗'}`,
        `llmRequest method: ${hasLlmRequest ? '✓' : '✗'}`,
        `llmResponse method: ${hasLlmResponse ? '✓' : '✗'}`,
        `build method: ${hasBuild ? '✓' : '✗'}`,
        `Event tracking: ${hasEventTracking ? '✓' : '✗'}`,
      ]
    );
  } else {
    check('ForensicCollector', false, 'collector.ts not found');
  }

  // ==========================================================================
  // Check 4: ReplayEngine for deterministic replay
  // ==========================================================================
  const replayPath = join(ROOT, 'packages/core/src/forensics/replay.ts');
  if (existsSync(replayPath)) {
    const content = readFileSync(replayPath, 'utf-8');
    const hasReplayEngine = content.includes('class ReplayEngine');
    const hasReplay = content.includes('replay(');
    const hasValidateForReplay = content.includes('validateForReplay(');
    const hasMockProvider = content.includes('LLMMockProvider') || content.includes('mockProvider');
    const hasDiffValues = content.includes('diffValues');
    const hasComparisonResult = content.includes('createComparisonResult');
    const hasReplayResult = content.includes('ReplayResult');

    check(
      'ReplayEngine',
      hasReplayEngine && hasReplay && hasValidateForReplay && hasDiffValues,
      'ReplayEngine with deterministic replay',
      [
        `ReplayEngine class: ${hasReplayEngine ? '✓' : '✗'}`,
        `replay method: ${hasReplay ? '✓' : '✗'}`,
        `validateForReplay method: ${hasValidateForReplay ? '✓' : '✗'}`,
        `Mock provider: ${hasMockProvider ? '✓' : '✗'}`,
        `diffValues function: ${hasDiffValues ? '✓' : '✗'}`,
        `createComparisonResult: ${hasComparisonResult ? '✓' : '✗'}`,
        `ReplayResult type: ${hasReplayResult ? '✓' : '✗'}`,
      ]
    );
  } else {
    check('ReplayEngine', false, 'replay.ts not found');
  }

  // ==========================================================================
  // Check 5: Module exports
  // ==========================================================================
  const indexPath = join(ROOT, 'packages/core/src/forensics/index.ts');
  if (existsSync(indexPath)) {
    const content = readFileSync(indexPath, 'utf-8');
    const hasTypesExport = content.includes("from './types.js'");
    const hasRedactionExport = content.includes("from './redaction.js'");
    const hasCollectorExport = content.includes("from './collector.js'");
    const hasReplayExport = content.includes("from './replay.js'");

    check(
      'Module Exports',
      hasTypesExport && hasRedactionExport && hasCollectorExport && hasReplayExport,
      'All forensics components exported',
      [
        `Types export: ${hasTypesExport ? '✓' : '✗'}`,
        `Redaction export: ${hasRedactionExport ? '✓' : '✗'}`,
        `Collector export: ${hasCollectorExport ? '✓' : '✗'}`,
        `Replay export: ${hasReplayExport ? '✓' : '✗'}`,
      ]
    );
  } else {
    check('Module Exports', false, 'index.ts not found');
  }

  // ==========================================================================
  // Check 6: CLI integration
  // ==========================================================================
  const cliCommandPath = join(ROOT, 'apps/cli/src/commands/forensics.ts');
  const cliIndexPath = join(ROOT, 'apps/cli/src/index.ts');

  if (existsSync(cliCommandPath)) {
    const content = readFileSync(cliCommandPath, 'utf-8');
    const hasRegister = content.includes('registerForensicsCommands');
    const hasStatus = content.includes(".command('status')");
    const hasReplay = content.includes(".command('replay");
    const hasTimeline = content.includes(".command('timeline");
    const hasValidate = content.includes(".command('validate");
    const hasDlq = content.includes(".command('dlq')");
    const hasFeatureCheck = content.includes('GWI_FORENSICS_ENABLED') || content.includes('isForensicsEnabled');

    let cliIntegrated = false;
    if (existsSync(cliIndexPath)) {
      const cliContent = readFileSync(cliIndexPath, 'utf-8');
      cliIntegrated = cliContent.includes("from './commands/forensics.js'") ||
                      cliContent.includes('registerForensicsCommands');
    }

    check(
      'CLI Integration',
      hasRegister && hasStatus && hasReplay && cliIntegrated,
      'CLI commands for forensics',
      [
        `registerForensicsCommands: ${hasRegister ? '✓' : '✗'}`,
        `Status command: ${hasStatus ? '✓' : '✗'}`,
        `Replay command: ${hasReplay ? '✓' : '✗'}`,
        `Timeline command: ${hasTimeline ? '✓' : '✗'}`,
        `Validate command: ${hasValidate ? '✓' : '✗'}`,
        `DLQ commands: ${hasDlq ? '✓' : '✗'}`,
        `CLI integration: ${cliIntegrated ? '✓' : '✗'}`,
      ]
    );
  } else {
    check('CLI Integration', false, 'forensics.ts CLI command not found');
  }

  // ==========================================================================
  // Check 7: Golden tests exist
  // ==========================================================================
  const goldenTestPath = join(ROOT, 'test/goldens/forensics/forensic-bundle.golden.test.ts');
  const fixturesDir = join(ROOT, 'test/goldens/forensics/fixtures');

  if (existsSync(goldenTestPath) && existsSync(fixturesDir)) {
    const content = readFileSync(goldenTestPath, 'utf-8');
    const hasSchemaTests = content.includes('ForensicBundle Schema Validation');
    const hasRedactionTests = content.includes('Redaction Service');
    const hasCollectorTests = content.includes('ForensicCollector');
    const hasReplayTests = content.includes('ReplayEngine');
    const hasDiffTests = content.includes('Diff Engine');

    const validBundleExists = existsSync(join(fixturesDir, 'valid-bundle.json'));
    const secretsBundleExists = existsSync(join(fixturesDir, 'bundle-with-secrets.json'));

    check(
      'Golden Tests',
      hasSchemaTests && hasRedactionTests && hasCollectorTests && hasReplayTests && validBundleExists,
      'Golden tests with frozen fixtures',
      [
        `Schema validation tests: ${hasSchemaTests ? '✓' : '✗'}`,
        `Redaction tests: ${hasRedactionTests ? '✓' : '✗'}`,
        `Collector tests: ${hasCollectorTests ? '✓' : '✗'}`,
        `Replay tests: ${hasReplayTests ? '✓' : '✗'}`,
        `Diff engine tests: ${hasDiffTests ? '✓' : '✗'}`,
        `valid-bundle.json fixture: ${validBundleExists ? '✓' : '✗'}`,
        `bundle-with-secrets.json fixture: ${secretsBundleExists ? '✓' : '✗'}`,
      ]
    );
  } else {
    check('Golden Tests', false, 'Golden tests or fixtures not found');
  }

  // ==========================================================================
  // Check 8: Core exports forensics module
  // ==========================================================================
  const coreIndexPath = join(ROOT, 'packages/core/src/index.ts');
  if (existsSync(coreIndexPath)) {
    const content = readFileSync(coreIndexPath, 'utf-8');
    const hasForensicsExport = content.includes("from './forensics/index.js'");

    check(
      'Core Module Export',
      hasForensicsExport,
      'Forensics module exported from @gwi/core',
      [`Forensics export: ${hasForensicsExport ? '✓' : '✗'}`]
    );
  } else {
    check('Core Module Export', false, 'core/index.ts not found');
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log();
  console.log('═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log();
    console.log('❌ FORENSICS GATE FAILED');
    process.exit(1);
  }

  console.log();
  console.log('✅ FORENSICS GATE PASSED');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
