#!/usr/bin/env npx tsx
/**
 * Phase 26: LLM Planner ARV Gate
 *
 * Verifies the planner infrastructure is correctly implemented:
 * 1. PatchPlan schema with validation
 * 2. PlannerService with provider abstraction
 * 3. PlanGuard safety checks
 * 4. CLI integration with feature flag
 * 5. Golden tests present
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
  console.log('║       Phase 26: LLM Planner ARV Gate                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  // ==========================================================================
  // Check 1: PatchPlan schema exists with Zod validation
  // ==========================================================================
  const typesPath = join(ROOT, 'packages/core/src/planner/types.ts');
  if (existsSync(typesPath)) {
    const content = readFileSync(typesPath, 'utf-8');
    const hasZod = content.includes("from 'zod'");
    const hasPatchPlanSchema = content.includes('PatchPlanSchema');
    const hasValidation = content.includes('validatePatchPlan');
    const hasSafePath = content.includes('SafeFilePath');
    const hasSecurityValidation = content.includes('validatePatchPlanSecurity');

    check(
      'PatchPlan Schema',
      hasZod && hasPatchPlanSchema && hasValidation && hasSafePath && hasSecurityValidation,
      'PatchPlan schema with Zod validation',
      [
        `Zod import: ${hasZod ? '✓' : '✗'}`,
        `PatchPlanSchema: ${hasPatchPlanSchema ? '✓' : '✗'}`,
        `validatePatchPlan: ${hasValidation ? '✓' : '✗'}`,
        `SafeFilePath: ${hasSafePath ? '✓' : '✗'}`,
        `Security validation: ${hasSecurityValidation ? '✓' : '✗'}`,
      ]
    );
  } else {
    check('PatchPlan Schema', false, 'types.ts not found');
  }

  // ==========================================================================
  // Check 2: PlannerService with provider abstraction
  // ==========================================================================
  const servicePath = join(ROOT, 'packages/core/src/planner/service.ts');
  if (existsSync(servicePath)) {
    const content = readFileSync(servicePath, 'utf-8');
    const hasPlannerService = content.includes('class PlannerService');
    const hasGetPlannerService = content.includes('getPlannerService');
    const hasFeatureFlag = content.includes('GWI_PLANNER_ENABLED');
    const hasProviderConfig = content.includes('getConfiguredProvider');

    check(
      'PlannerService',
      hasPlannerService && hasGetPlannerService && hasFeatureFlag && hasProviderConfig,
      'PlannerService with provider abstraction',
      [
        `PlannerService class: ${hasPlannerService ? '✓' : '✗'}`,
        `getPlannerService singleton: ${hasGetPlannerService ? '✓' : '✗'}`,
        `Feature flag check: ${hasFeatureFlag ? '✓' : '✗'}`,
        `Provider config: ${hasProviderConfig ? '✓' : '✗'}`,
      ]
    );
  } else {
    check('PlannerService', false, 'service.ts not found');
  }

  // ==========================================================================
  // Check 3: Provider implementations
  // ==========================================================================
  const providersPath = join(ROOT, 'packages/core/src/planner/providers.ts');
  if (existsSync(providersPath)) {
    const content = readFileSync(providersPath, 'utf-8');
    const hasInterface = content.includes('PlannerProviderInterface');
    const hasGemini = content.includes('GeminiPlannerProvider');
    const hasClaude = content.includes('ClaudePlannerProvider');
    const hasFactory = content.includes('createPlannerProvider');

    check(
      'Provider Implementations',
      hasInterface && hasGemini && hasClaude && hasFactory,
      'Gemini and Claude provider implementations',
      [
        `Provider interface: ${hasInterface ? '✓' : '✗'}`,
        `Gemini provider: ${hasGemini ? '✓' : '✗'}`,
        `Claude provider: ${hasClaude ? '✓' : '✗'}`,
        `Factory function: ${hasFactory ? '✓' : '✗'}`,
      ]
    );
  } else {
    check('Provider Implementations', false, 'providers.ts not found');
  }

  // ==========================================================================
  // Check 4: PlanGuard safety checks
  // ==========================================================================
  const guardPath = join(ROOT, 'packages/core/src/planner/guard.ts');
  if (existsSync(guardPath)) {
    const content = readFileSync(guardPath, 'utf-8');
    const hasPlanGuard = content.includes('class PlanGuard');
    const hasGetPlanGuard = content.includes('getPlanGuard');
    const hasRiskCheck = content.includes('checkRiskLevel');
    const hasBlockedFiles = content.includes('checkBlockedFiles');
    const hasLimits = content.includes('checkLimits');
    const hasPolicyIntegration = content.includes('checkPolicy');

    check(
      'PlanGuard',
      hasPlanGuard && hasGetPlanGuard && hasRiskCheck && hasBlockedFiles && hasLimits,
      'PlanGuard with safety checks',
      [
        `PlanGuard class: ${hasPlanGuard ? '✓' : '✗'}`,
        `getPlanGuard singleton: ${hasGetPlanGuard ? '✓' : '✗'}`,
        `Risk level check: ${hasRiskCheck ? '✓' : '✗'}`,
        `Blocked files check: ${hasBlockedFiles ? '✓' : '✗'}`,
        `Limits check: ${hasLimits ? '✓' : '✗'}`,
        `Policy integration: ${hasPolicyIntegration ? '✓' : '✗'}`,
      ]
    );
  } else {
    check('PlanGuard', false, 'guard.ts not found');
  }

  // ==========================================================================
  // Check 5: Module exports
  // ==========================================================================
  const indexPath = join(ROOT, 'packages/core/src/planner/index.ts');
  if (existsSync(indexPath)) {
    const content = readFileSync(indexPath, 'utf-8');
    const hasSchemaExport = content.includes('PatchPlanSchema');
    const hasServiceExport = content.includes('PlannerService');
    const hasGuardExport = content.includes('PlanGuard');
    const hasProviderExport = content.includes('createPlannerProvider');

    check(
      'Module Exports',
      hasSchemaExport && hasServiceExport && hasGuardExport && hasProviderExport,
      'All planner components exported',
      [
        `PatchPlanSchema export: ${hasSchemaExport ? '✓' : '✗'}`,
        `PlannerService export: ${hasServiceExport ? '✓' : '✗'}`,
        `PlanGuard export: ${hasGuardExport ? '✓' : '✗'}`,
        `Provider exports: ${hasProviderExport ? '✓' : '✗'}`,
      ]
    );
  } else {
    check('Module Exports', false, 'index.ts not found');
  }

  // ==========================================================================
  // Check 6: CLI integration
  // ==========================================================================
  const cliCommandPath = join(ROOT, 'apps/cli/src/commands/planner.ts');
  const cliIndexPath = join(ROOT, 'apps/cli/src/index.ts');

  if (existsSync(cliCommandPath)) {
    const content = readFileSync(cliCommandPath, 'utf-8');
    const hasGenerate = content.includes('plannerGenerateCommand');
    const hasValidate = content.includes('plannerValidateCommand');
    const hasStatus = content.includes('plannerStatusCommand');
    const hasFeatureCheck = content.includes('isEnabled');

    let cliIntegrated = false;
    if (existsSync(cliIndexPath)) {
      const cliContent = readFileSync(cliIndexPath, 'utf-8');
      cliIntegrated = cliContent.includes("from './commands/planner.js'");
    }

    check(
      'CLI Integration',
      hasGenerate && hasValidate && hasStatus && hasFeatureCheck && cliIntegrated,
      'CLI commands with feature flag gate',
      [
        `Generate command: ${hasGenerate ? '✓' : '✗'}`,
        `Validate command: ${hasValidate ? '✓' : '✗'}`,
        `Status command: ${hasStatus ? '✓' : '✗'}`,
        `Feature flag check: ${hasFeatureCheck ? '✓' : '✗'}`,
        `CLI integration: ${cliIntegrated ? '✓' : '✗'}`,
      ]
    );
  } else {
    check('CLI Integration', false, 'planner.ts CLI command not found');
  }

  // ==========================================================================
  // Check 7: Golden tests exist
  // ==========================================================================
  const goldenTestPath = join(ROOT, 'test/goldens/planner/patch-plan.golden.test.ts');
  const fixturesDir = join(ROOT, 'test/goldens/planner/fixtures');

  if (existsSync(goldenTestPath) && existsSync(fixturesDir)) {
    const content = readFileSync(goldenTestPath, 'utf-8');
    const hasSchemaTests = content.includes('PatchPlan Schema Validation');
    const hasSecurityTests = content.includes('Security Validation');
    const hasGuardTests = content.includes('PlanGuard');

    const validPlanExists = existsSync(join(fixturesDir, 'valid-plan.json'));
    const pathTraversalExists = existsSync(join(fixturesDir, 'invalid-plan-path-traversal.json'));
    const absolutePathExists = existsSync(join(fixturesDir, 'invalid-plan-absolute-path.json'));
    const highRiskExists = existsSync(join(fixturesDir, 'high-risk-plan.json'));

    check(
      'Golden Tests',
      hasSchemaTests && hasSecurityTests && hasGuardTests && validPlanExists && pathTraversalExists,
      'Golden tests with frozen fixtures',
      [
        `Schema validation tests: ${hasSchemaTests ? '✓' : '✗'}`,
        `Security tests: ${hasSecurityTests ? '✓' : '✗'}`,
        `PlanGuard tests: ${hasGuardTests ? '✓' : '✗'}`,
        `valid-plan.json fixture: ${validPlanExists ? '✓' : '✗'}`,
        `path-traversal fixture: ${pathTraversalExists ? '✓' : '✗'}`,
        `absolute-path fixture: ${absolutePathExists ? '✓' : '✗'}`,
        `high-risk fixture: ${highRiskExists ? '✓' : '✗'}`,
      ]
    );
  } else {
    check('Golden Tests', false, 'Golden tests or fixtures not found');
  }

  // ==========================================================================
  // Check 8: Core exports planner module
  // ==========================================================================
  const coreIndexPath = join(ROOT, 'packages/core/src/index.ts');
  if (existsSync(coreIndexPath)) {
    const content = readFileSync(coreIndexPath, 'utf-8');
    const hasPlannerExport = content.includes("from './planner/index.js'");

    check(
      'Core Module Export',
      hasPlannerExport,
      'Planner module exported from @gwi/core',
      [`Planner export: ${hasPlannerExport ? '✓' : '✗'}`]
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
    console.log('❌ PLANNER GATE FAILED');
    process.exit(1);
  }

  console.log();
  console.log('✅ PLANNER GATE PASSED');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
