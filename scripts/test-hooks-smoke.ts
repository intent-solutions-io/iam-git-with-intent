#!/usr/bin/env npx tsx
/**
 * Hook Smoke Test for git-with-intent
 *
 * This script verifies that both AgentFS and Beads hooks are live and working.
 * It creates a dummy AgentRunContext and runs it through the hook system.
 *
 * Prerequisites:
 *   - AgentFS initialized: npx tsx scripts/agentfs-init.ts
 *   - Beads initialized: bd init && bd doctor
 *
 * Environment Variables (required):
 *   - GWI_AGENTFS_ENABLED=true
 *   - GWI_AGENTFS_ID=gwi
 *   - GWI_BEADS_ENABLED=true
 *
 * Usage:
 *   export GWI_AGENTFS_ENABLED=true GWI_AGENTFS_ID=gwi GWI_BEADS_ENABLED=true
 *   npx tsx scripts/test-hooks-smoke.ts
 *
 * Or via npm:
 *   npm run test:hooks:smoke
 *
 * @internal - For Intent Solutions internal development only
 */

import { buildDefaultHookRunner } from '../packages/engine/src/hooks/index.js';
import type { AgentRunContext } from '../packages/engine/src/hooks/index.js';

async function runSmokeTest() {
  console.log('=== Hook Smoke Test for git-with-intent ===\n');

  // Check environment
  const agentfsEnabled = process.env.GWI_AGENTFS_ENABLED === 'true';
  const agentfsId = process.env.GWI_AGENTFS_ID;
  const beadsEnabled = process.env.GWI_BEADS_ENABLED === 'true';

  console.log('Environment Check:');
  console.log(`  GWI_AGENTFS_ENABLED: ${agentfsEnabled ? 'true' : 'false (not set)'}`);
  console.log(`  GWI_AGENTFS_ID: ${agentfsId || '(not set)'}`);
  console.log(`  GWI_BEADS_ENABLED: ${beadsEnabled ? 'true' : 'false (not set)'}`);
  console.log();

  if (!agentfsEnabled && !beadsEnabled) {
    console.error('ERROR: Neither AgentFS nor Beads is enabled.');
    console.error('Set GWI_AGENTFS_ENABLED=true and/or GWI_BEADS_ENABLED=true');
    process.exit(1);
  }

  // Build the default hook runner (reads config from env)
  console.log('Building hook runner...');
  const runner = await buildDefaultHookRunner();
  const registeredHooks = runner.getRegisteredHooks();
  console.log(`Registered hooks: ${registeredHooks.length > 0 ? registeredHooks.join(', ') : '(none)'}`);
  console.log();

  if (registeredHooks.length === 0) {
    console.error('ERROR: No hooks were registered. Check environment variables and prerequisites.');
    process.exit(1);
  }

  // Construct a dummy context matching the Phase 6 requirements:
  // - runType: RESOLVE
  // - agentRole: CODER
  // - outputSummary: non-empty
  const runId = `hook-smoke-run-${Date.now()}`;
  const ctx: AgentRunContext = {
    runId,
    stepId: 'step-1',
    tenantId: 'internal-smoke-test',
    runType: 'RESOLVE',
    agentRole: 'CODER',
    stepStatus: 'completed',
    timestamp: new Date().toISOString(),
    inputSummary: 'Smoke test input for Phase 6 verification',
    outputSummary: 'Smoke test output - hooks are live and working',
    durationMs: 1234,
    metadata: {
      phase: '6',
      test: true,
      smokeTest: true,
      complexity: 3, // Trigger bead creation
    },
  };

  console.log('Test Context:');
  console.log(`  runId: ${ctx.runId}`);
  console.log(`  runType: ${ctx.runType}`);
  console.log(`  agentRole: ${ctx.agentRole}`);
  console.log(`  stepStatus: ${ctx.stepStatus}`);
  console.log();

  // Run the hooks
  console.log('Running hooks...');
  const startTime = Date.now();

  try {
    // Call afterStep which triggers both AgentFS and Beads hooks
    const result = await runner.afterStep(ctx);

    const elapsed = Date.now() - startTime;
    console.log(`\nHook execution completed in ${elapsed}ms`);
    console.log(`  Total hooks: ${result.totalHooks}`);
    console.log(`  Successful: ${result.successfulHooks}`);
    console.log(`  Failed: ${result.failedHooks}`);

    if (result.failedHooks > 0) {
      console.log('\nFailed hooks:');
      for (const r of result.results.filter(r => !r.success)) {
        console.log(`  - ${r.hookName}: ${r.error}`);
      }
    }

    console.log('\n=== Verification Steps ===\n');

    if (beadsEnabled) {
      console.log('To verify Beads recorded a task:');
      console.log('  bd list --json | jq \'.[0:5]\'');
      console.log();
    }

    if (agentfsEnabled) {
      console.log('To verify AgentFS recorded state:');
      console.log('  ls -la .agentfs/gwi.db*');
      console.log('  sqlite3 .agentfs/gwi.db "SELECT * FROM tool_calls ORDER BY ended_at DESC LIMIT 5;"');
      console.log();
    }

    // Exit with appropriate code
    if (result.failedHooks > 0) {
      console.log('RESULT: PARTIAL SUCCESS (some hooks failed)');
      process.exit(1);
    } else if (result.successfulHooks === 0) {
      console.log('RESULT: NO HOOKS RAN');
      process.exit(1);
    } else {
      console.log('RESULT: SUCCESS - All hooks executed successfully');
      process.exit(0);
    }
  } catch (error) {
    console.error('\nERROR: Hook execution failed:', error);
    process.exit(1);
  }
}

runSmokeTest().catch((error) => {
  console.error('Smoke test failed:', error);
  process.exit(1);
});
