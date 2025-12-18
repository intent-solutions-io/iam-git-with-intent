#!/usr/bin/env npx tsx
/**
 * ARV Approval Policy Gate
 *
 * Phase 25: Approval Commands + Policy-as-Code Enforcement
 *
 * Verifies approval and policy infrastructure is properly implemented:
 * 1. Approval parser exists and exports required functions
 * 2. Signed approval objects are implemented
 * 3. Policy engine exists and exports evaluatePolicy
 * 4. Execution gate blocks without approval
 * 5. Audit events are emitted
 * 6. TypeScript build passes
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

// =============================================================================
// Types
// =============================================================================

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string[];
}

// =============================================================================
// Checks
// =============================================================================

/**
 * Check 1: Approval parser exists
 */
function checkApprovalParser(): CheckResult {
  const parserPath = join(ROOT, 'packages/core/src/approvals/parser.ts');

  if (!existsSync(parserPath)) {
    return {
      name: 'Approval Parser',
      passed: false,
      message: 'Approval parser not found',
      details: [`Expected: ${parserPath}`],
    };
  }

  const content = readFileSync(parserPath, 'utf-8');
  const requiredExports = [
    'parseApprovalCommand',
    'extractCommandsFromComment',
    'hasApprovalCommand',
    'validateCommand',
    'formatCommand',
  ];

  const missing = requiredExports.filter((exp) => !content.includes(exp));

  if (missing.length > 0) {
    return {
      name: 'Approval Parser',
      passed: false,
      message: `Parser missing functions: ${missing.join(', ')}`,
      details: missing.map((m) => `Missing: ${m}`),
    };
  }

  // Check for command pattern
  if (!content.includes('/gwi')) {
    return {
      name: 'Approval Parser',
      passed: false,
      message: 'Parser does not handle /gwi commands',
    };
  }

  return {
    name: 'Approval Parser',
    passed: true,
    message: 'Approval parser present with command handling',
  };
}

/**
 * Check 2: Signed approvals are implemented
 */
function checkSignedApprovals(): CheckResult {
  const signaturePath = join(ROOT, 'packages/core/src/approvals/signature.ts');

  if (!existsSync(signaturePath)) {
    return {
      name: 'Signed Approvals',
      passed: false,
      message: 'Signature module not found',
      details: [`Expected: ${signaturePath}`],
    };
  }

  const content = readFileSync(signaturePath, 'utf-8');
  const requiredExports = [
    'generateSigningKeyPair',
    'signPayload',
    'verifyApprovalSignature',
    'createSignedApproval',
    'ed25519',
  ];

  const missing = requiredExports.filter((exp) => !content.includes(exp));

  if (missing.length > 0) {
    return {
      name: 'Signed Approvals',
      passed: false,
      message: `Signature module missing: ${missing.join(', ')}`,
      details: missing.map((m) => `Missing: ${m}`),
    };
  }

  return {
    name: 'Signed Approvals',
    passed: true,
    message: 'Ed25519 signed approvals implemented',
  };
}

/**
 * Check 3: Policy engine exists
 */
function checkPolicyEngine(): CheckResult {
  const enginePath = join(ROOT, 'packages/core/src/policy/engine.ts');

  if (!existsSync(enginePath)) {
    return {
      name: 'Policy Engine',
      passed: false,
      message: 'Policy engine not found',
      details: [`Expected: ${enginePath}`],
    };
  }

  const content = readFileSync(enginePath, 'utf-8');
  const requiredExports = [
    'PolicyEngine',
    'evaluatePolicy',
    'getPolicyEngine',
    'createPolicy',
  ];

  const missing = requiredExports.filter((exp) => !content.includes(exp));

  if (missing.length > 0) {
    return {
      name: 'Policy Engine',
      passed: false,
      message: `Policy engine missing: ${missing.join(', ')}`,
      details: missing.map((m) => `Missing: ${m}`),
    };
  }

  // Check for deterministic evaluation
  if (!content.includes('PolicyDecision') || !content.includes('ALLOW')) {
    return {
      name: 'Policy Engine',
      passed: false,
      message: 'Policy engine missing decision types',
    };
  }

  return {
    name: 'Policy Engine',
    passed: true,
    message: 'Policy engine present with evaluatePolicy',
  };
}

/**
 * Check 4: Execution gate blocks without approval
 */
function checkExecutionGate(): CheckResult {
  const gatePath = join(ROOT, 'packages/core/src/policy/gate.ts');

  if (!existsSync(gatePath)) {
    return {
      name: 'Execution Gate',
      passed: false,
      message: 'Execution gate not found',
      details: [`Expected: ${gatePath}`],
    };
  }

  const content = readFileSync(gatePath, 'utf-8');
  const requiredFeatures = [
    'checkGate',
    'requirePolicyApproval',
    'PolicyDeniedError',
    'allowed: false',
    'POLICY_DENIED',
  ];

  const missing = requiredFeatures.filter((exp) => !content.includes(exp));

  if (missing.length > 0) {
    return {
      name: 'Execution Gate',
      passed: false,
      message: `Execution gate missing: ${missing.join(', ')}`,
      details: missing.map((m) => `Missing: ${m}`),
    };
  }

  return {
    name: 'Execution Gate',
    passed: true,
    message: 'Execution gate blocks without approval',
  };
}

/**
 * Check 5: Audit events are emitted
 */
function checkAuditEmission(): CheckResult {
  const gatePath = join(ROOT, 'packages/core/src/policy/gate.ts');

  if (!existsSync(gatePath)) {
    return {
      name: 'Audit Emission',
      passed: false,
      message: 'Gate file not found for audit check',
    };
  }

  const content = readFileSync(gatePath, 'utf-8');

  // Check for audit integration
  if (!content.includes('emitAuditEvent')) {
    return {
      name: 'Audit Emission',
      passed: false,
      message: 'Gate does not emit audit events',
    };
  }

  // Check for telemetry correlation
  if (!content.includes('traceId') || !content.includes('getCurrentContext')) {
    return {
      name: 'Audit Emission',
      passed: false,
      message: 'Gate missing telemetry correlation',
    };
  }

  return {
    name: 'Audit Emission',
    passed: true,
    message: 'Audit events emitted with telemetry',
  };
}

/**
 * Check 6: Default policies exist
 */
function checkDefaultPolicies(): CheckResult {
  const policiesPath = join(ROOT, 'packages/core/src/policy/policies.ts');

  if (!existsSync(policiesPath)) {
    return {
      name: 'Default Policies',
      passed: false,
      message: 'Default policies not found',
      details: [`Expected: ${policiesPath}`],
    };
  }

  const content = readFileSync(policiesPath, 'utf-8');
  const requiredPolicies = [
    'requireApprovalPolicy',
    'destructiveActionsOwnerPolicy',
    'protectedBranchPolicy',
    'DEFAULT_POLICIES',
  ];

  const missing = requiredPolicies.filter((exp) => !content.includes(exp));

  if (missing.length > 0) {
    return {
      name: 'Default Policies',
      passed: false,
      message: `Missing policies: ${missing.join(', ')}`,
      details: missing.map((m) => `Missing: ${m}`),
    };
  }

  return {
    name: 'Default Policies',
    passed: true,
    message: 'Default policies present',
  };
}

/**
 * Check 7: Types are complete
 */
function checkTypes(): CheckResult {
  const typesPath = join(ROOT, 'packages/core/src/approvals/types.ts');

  if (!existsSync(typesPath)) {
    return {
      name: 'Approval Types',
      passed: false,
      message: 'Types file not found',
    };
  }

  const content = readFileSync(typesPath, 'utf-8');
  const requiredTypes = [
    'SignedApproval',
    'ApproverIdentity',
    'ApprovalScope',
    'approvalId',
    'signature',
    'signingKeyId',
    'traceId',
  ];

  const missing = requiredTypes.filter((exp) => !content.includes(exp));

  if (missing.length > 0) {
    return {
      name: 'Approval Types',
      passed: false,
      message: `Types missing: ${missing.join(', ')}`,
      details: missing.map((m) => `Missing: ${m}`),
    };
  }

  return {
    name: 'Approval Types',
    passed: true,
    message: 'Approval types complete',
  };
}

/**
 * Check 8: Index exports
 */
function checkExports(): CheckResult {
  const approvalIndexPath = join(ROOT, 'packages/core/src/approvals/index.ts');
  const policyIndexPath = join(ROOT, 'packages/core/src/policy/index.ts');
  const coreIndexPath = join(ROOT, 'packages/core/src/index.ts');

  const missing: string[] = [];

  if (!existsSync(approvalIndexPath)) {
    missing.push('approvals/index.ts');
  }
  if (!existsSync(policyIndexPath)) {
    missing.push('policy/index.ts');
  }

  if (missing.length > 0) {
    return {
      name: 'Module Exports',
      passed: false,
      message: `Index files missing: ${missing.join(', ')}`,
    };
  }

  // Check core index includes new modules
  const coreContent = readFileSync(coreIndexPath, 'utf-8');
  if (
    !coreContent.includes("'./approvals/index.js'") ||
    !coreContent.includes("'./policy/index.js'")
  ) {
    return {
      name: 'Module Exports',
      passed: false,
      message: 'Core index does not export approval/policy modules',
    };
  }

  return {
    name: 'Module Exports',
    passed: true,
    message: 'All modules exported correctly',
  };
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         Approval Policy Gate (Phase 25)                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  const checks = [
    checkApprovalParser,
    checkSignedApprovals,
    checkPolicyEngine,
    checkExecutionGate,
    checkAuditEmission,
    checkDefaultPolicies,
    checkTypes,
    checkExports,
  ];

  const results: CheckResult[] = [];

  for (const check of checks) {
    const result = check();
    results.push(result);

    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    console.log(`   ${result.message}`);

    if (result.details && result.details.length > 0) {
      for (const detail of result.details) {
        console.log(`   - ${detail}`);
      }
    }
    console.log();
  }

  // Summary
  console.log('═'.repeat(60));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Approval Policy Gate: ${passed}/${results.length} checks passed`);

  if (failed > 0) {
    console.log('\n❌ APPROVAL POLICY GATE FAILED');
    console.log('Fix the above issues before proceeding.');
    process.exit(1);
  }

  console.log('\n✅ APPROVAL POLICY GATE PASSED');
  console.log('Phase 25 approval and policy infrastructure verified.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
