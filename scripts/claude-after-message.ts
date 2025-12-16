#!/usr/bin/env npx ts-node
/**
 * Claude After-Message Hook Script
 *
 * INTERNAL USE ONLY - This script is invoked by Claude (the AI assistant)
 * after working on git-with-intent to log activity to AgentFS and/or Beads.
 *
 * This is NOT part of the public gwi CLI. It is an internal audit mechanism
 * that Claude uses to track its own work in this repository.
 *
 * Usage:
 *   npm run claude:after-message -- '<json-context>'
 *
 * Example:
 *   npm run claude:after-message -- '{
 *     "runType": "PLAN",
 *     "agentRole": "FOREMAN",
 *     "inputSummary": "Phase 4 implementation",
 *     "outputSummary": "Created ADR and updated CLAUDE.md",
 *     "metadata": { "phase": "4" }
 *   }'
 *
 * Environment Variables Required:
 *   GWI_AGENTFS_ENABLED=true  - Enable AgentFS auditing
 *   GWI_AGENTFS_ID=gwi-internal  - AgentFS agent identifier
 *   GWI_BEADS_ENABLED=true  - Enable Beads task tracking
 *
 * @internal
 */

import { buildDefaultHookRunner } from '../packages/engine/src/hooks/config.js';
import type { AgentRunContext, AgentRole } from '../packages/engine/src/hooks/types.js';

// Valid run types (uppercase for hook system)
type HookRunType = 'TRIAGE' | 'PLAN' | 'RESOLVE' | 'REVIEW' | 'AUTOPILOT';

// Valid agent roles
const VALID_AGENT_ROLES: AgentRole[] = [
  'FOREMAN',
  'TRIAGE',
  'PLANNER',
  'CODER',
  'VALIDATOR',
  'REVIEWER',
];

// Valid run types
const VALID_RUN_TYPES: HookRunType[] = [
  'TRIAGE',
  'PLAN',
  'RESOLVE',
  'REVIEW',
  'AUTOPILOT',
];

interface ClaudeMessageContext {
  runId?: string;
  stepId?: string;
  tenantId?: string;
  runType?: HookRunType;
  agentRole?: AgentRole;
  inputSummary?: string;
  outputSummary?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

function validateRunType(type: string | undefined): HookRunType {
  if (!type) return 'AUTOPILOT';
  const upper = type.toUpperCase() as HookRunType;
  if (VALID_RUN_TYPES.includes(upper)) {
    return upper;
  }
  console.warn(`[claude-after-message] Invalid runType "${type}", defaulting to AUTOPILOT`);
  return 'AUTOPILOT';
}

function validateAgentRole(role: string | undefined): AgentRole {
  if (!role) return 'FOREMAN';
  const upper = role.toUpperCase() as AgentRole;
  if (VALID_AGENT_ROLES.includes(upper)) {
    return upper;
  }
  console.warn(`[claude-after-message] Invalid agentRole "${role}", defaulting to FOREMAN`);
  return 'FOREMAN';
}

async function main(): Promise<void> {
  // Parse CLI argument (JSON context)
  const rawArg = process.argv[2];

  if (!rawArg || rawArg === '--help' || rawArg === '-h') {
    console.log(`
Claude After-Message Hook

Usage:
  npm run claude:after-message -- '<json-context>'

JSON Context Fields:
  runType       - Type of work: TRIAGE, PLAN, RESOLVE, REVIEW, AUTOPILOT (default: AUTOPILOT)
  agentRole     - Role: FOREMAN, TRIAGE, PLANNER, CODER, VALIDATOR, REVIEWER (default: FOREMAN)
  inputSummary  - What was requested/analyzed
  outputSummary - What was produced/changed
  metadata      - Additional context (e.g., { phase: "4", subPhase: "4.1" })
  runId         - Optional run ID (auto-generated if not provided)
  stepId        - Optional step ID (auto-generated if not provided)

Example:
  npm run claude:after-message -- '{
    "runType": "PLAN",
    "agentRole": "FOREMAN",
    "inputSummary": "Design Claude Internal Hook Protocol",
    "outputSummary": "Created ADR, updated CLAUDE.md, implemented CLI script",
    "metadata": { "phase": "4", "filesCreated": 3 }
  }'

Environment Variables:
  GWI_AGENTFS_ENABLED=true  - Enable AgentFS auditing
  GWI_AGENTFS_ID=...        - AgentFS agent identifier
  GWI_BEADS_ENABLED=true    - Enable Beads task tracking
  GWI_HOOK_DEBUG=true       - Enable debug logging
`);
    process.exit(0);
  }

  let input: ClaudeMessageContext;
  try {
    input = JSON.parse(rawArg);
  } catch (error) {
    console.error('[claude-after-message] Failed to parse JSON context:', error);
    console.error('Received:', rawArg);
    process.exit(1);
  }

  // Build the AgentRunContext
  const ctx: AgentRunContext = {
    runId: input.runId ?? generateId('claude-msg'),
    stepId: input.stepId ?? generateId('step'),
    tenantId: input.tenantId ?? 'internal-claude',
    runType: validateRunType(input.runType) as any, // Hook system uses uppercase
    agentRole: validateAgentRole(input.agentRole),
    stepStatus: 'completed',
    timestamp: new Date().toISOString(),
    inputSummary: input.inputSummary,
    outputSummary: input.outputSummary,
    durationMs: input.durationMs,
    metadata: {
      ...input.metadata,
      source: 'claude-after-message',
      invokedAt: new Date().toISOString(),
    },
  };

  console.log('[claude-after-message] Running post-message audit...');
  console.log(`  Run ID: ${ctx.runId}`);
  console.log(`  Run Type: ${ctx.runType}`);
  console.log(`  Agent Role: ${ctx.agentRole}`);

  if (ctx.inputSummary) {
    console.log(`  Input: ${ctx.inputSummary.substring(0, 80)}${ctx.inputSummary.length > 80 ? '...' : ''}`);
  }
  if (ctx.outputSummary) {
    console.log(`  Output: ${ctx.outputSummary.substring(0, 80)}${ctx.outputSummary.length > 80 ? '...' : ''}`);
  }

  // Build the hook runner (will load AgentFS/Beads hooks if enabled)
  const runner = await buildDefaultHookRunner();

  // Check what hooks are registered
  const hookCount = runner.getHooks().length;
  if (hookCount === 0) {
    console.log('[claude-after-message] No hooks enabled. Set GWI_AGENTFS_ENABLED=true or GWI_BEADS_ENABLED=true');
    return;
  }

  console.log(`[claude-after-message] Running ${hookCount} hook(s)...`);

  // Execute the afterStep hook
  try {
    await runner.afterStep(ctx);
    console.log('[claude-after-message] Post-message audit complete.');
  } catch (error) {
    console.error('[claude-after-message] Hook execution failed:', error);
    // Don't exit with error - hooks should be non-fatal
  }
}

// Run main
main().catch((err) => {
  console.error('[claude-after-message] Unexpected error:', err);
  process.exit(1);
});
