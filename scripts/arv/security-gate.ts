#!/usr/bin/env npx tsx
/**
 * ARV Security Gate
 *
 * Phase 24: Security & Compliance Hardening
 *
 * Verifies security controls are properly implemented:
 * 1. RBAC module exports are present
 * 2. Audit log module exports are present
 * 3. Secret scanning module exports are present
 * 4. No hardcoded secrets in codebase
 * 5. Threat model document exists
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
// Secret Patterns (same as secrets.ts)
// =============================================================================

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'anthropic_api_key', pattern: /sk-ant-[a-zA-Z0-9_-]{80,}/g },
  { name: 'openai_api_key', pattern: /sk-[a-zA-Z0-9]{48,}/g },
  { name: 'google_api_key', pattern: /AIza[a-zA-Z0-9_-]{35}/g },
  { name: 'github_pat', pattern: /ghp_[a-zA-Z0-9]{36,}/g },
  { name: 'github_oauth', pattern: /gho_[a-zA-Z0-9]{36,}/g },
  { name: 'stripe_secret_key', pattern: /sk_live_[a-zA-Z0-9]{24,}/g },
  { name: 'stripe_webhook_secret', pattern: /whsec_[a-zA-Z0-9]{32,}/g },
  { name: 'aws_access_key', pattern: /AKIA[A-Z0-9]{16}/g },
  { name: 'private_key_pem', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g },
];

// =============================================================================
// Checks
// =============================================================================

/**
 * Check 1: RBAC module exists and has required exports
 */
function checkRBACModule(): CheckResult {
  const rbacPath = join(ROOT, 'packages/core/src/security/rbac.ts');

  if (!existsSync(rbacPath)) {
    return {
      name: 'RBAC Module',
      passed: false,
      message: 'RBAC module not found',
      details: [`Expected: ${rbacPath}`],
    };
  }

  const content = readFileSync(rbacPath, 'utf-8');
  const requiredExports = [
    'RBACRole',
    'RBACAction',
    'RBAC_PERMISSIONS',
    'requireRole',
    'requirePermission',
    'expressRequireAuth',
    'HIGH_RISK_ACTIONS',
  ];

  const missing = requiredExports.filter(exp => !content.includes(exp));

  if (missing.length > 0) {
    return {
      name: 'RBAC Module',
      passed: false,
      message: `RBAC module missing exports: ${missing.join(', ')}`,
      details: missing.map(m => `Missing: ${m}`),
    };
  }

  return {
    name: 'RBAC Module',
    passed: true,
    message: 'RBAC module present with all required exports',
  };
}

/**
 * Check 2: Audit log module exists and has required exports
 */
function checkAuditModule(): CheckResult {
  const auditIndexPath = join(ROOT, 'packages/core/src/security/audit/index.ts');

  if (!existsSync(auditIndexPath)) {
    return {
      name: 'Audit Module',
      passed: false,
      message: 'Audit module not found',
      details: [`Expected: ${auditIndexPath}`],
    };
  }

  const content = readFileSync(auditIndexPath, 'utf-8');
  const requiredExports = [
    'SecurityAuditEvent',
    'SecurityAuditStore',
    'emitAuditEvent',
    'getSecurityAuditStore',
  ];

  const missing = requiredExports.filter(exp => !content.includes(exp));

  if (missing.length > 0) {
    return {
      name: 'Audit Module',
      passed: false,
      message: `Audit module missing exports: ${missing.join(', ')}`,
      details: missing.map(m => `Missing: ${m}`),
    };
  }

  // Check for telemetry correlation
  const emitterPath = join(ROOT, 'packages/core/src/security/audit/emitter.ts');
  if (existsSync(emitterPath)) {
    const emitterContent = readFileSync(emitterPath, 'utf-8');
    if (!emitterContent.includes('traceId') || !emitterContent.includes('getCurrentContext')) {
      return {
        name: 'Audit Module',
        passed: false,
        message: 'Audit emitter missing telemetry correlation',
        details: ['Expected: traceId integration with Phase 23 telemetry'],
      };
    }
  }

  return {
    name: 'Audit Module',
    passed: true,
    message: 'Audit module present with telemetry correlation',
  };
}

/**
 * Check 3: Secrets module exists and has required exports
 */
function checkSecretsModule(): CheckResult {
  const secretsPath = join(ROOT, 'packages/core/src/security/secrets.ts');

  if (!existsSync(secretsPath)) {
    return {
      name: 'Secrets Module',
      passed: false,
      message: 'Secrets module not found',
      details: [`Expected: ${secretsPath}`],
    };
  }

  const content = readFileSync(secretsPath, 'utf-8');
  const requiredExports = [
    'SECRET_PATTERNS',
    'scanForSecrets',
    'redactSecret',
    'assertNoSecrets',
    'safeStringify',
  ];

  const missing = requiredExports.filter(exp => !content.includes(exp));

  if (missing.length > 0) {
    return {
      name: 'Secrets Module',
      passed: false,
      message: `Secrets module missing exports: ${missing.join(', ')}`,
      details: missing.map(m => `Missing: ${m}`),
    };
  }

  return {
    name: 'Secrets Module',
    passed: true,
    message: 'Secrets module present with scanning and redaction',
  };
}

/**
 * Check 4: No hardcoded secrets in codebase
 */
function checkNoHardcodedSecrets(): CheckResult {
  const findings: string[] = [];
  const scannedFiles: string[] = [];

  // Directories to scan
  const scanDirs = [
    'packages',
    'apps',
    'scripts',
  ];

  // File extensions to scan
  const scanExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml'];

  // Files to skip
  const skipPatterns = [
    'node_modules',
    'dist',
    '.git',
    'test',
    '__tests__',
    'fixtures',
    'goldens',
    '.d.ts',
    'package-lock.json',
  ];

  function shouldScan(filePath: string): boolean {
    if (skipPatterns.some(p => filePath.includes(p))) {
      return false;
    }
    return scanExtensions.some(ext => filePath.endsWith(ext));
  }

  function scanDirectory(dir: string): void {
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!skipPatterns.some(p => entry.name === p || entry.name.includes(p))) {
          scanDirectory(fullPath);
        }
      } else if (entry.isFile() && shouldScan(fullPath)) {
        scannedFiles.push(fullPath);
        const content = readFileSync(fullPath, 'utf-8');

        for (const { name, pattern } of SECRET_PATTERNS) {
          pattern.lastIndex = 0;
          const matches = content.match(pattern);
          if (matches) {
            for (const match of matches) {
              // Skip if it's in a pattern definition or test
              if (content.includes(`pattern: /${match}`) ||
                  content.includes(`// ${match}`) ||
                  content.includes(`'${match}'`) && content.includes('test')) {
                continue;
              }
              findings.push(`${fullPath}: Found ${name} pattern`);
            }
          }
        }
      }
    }
  }

  for (const dir of scanDirs) {
    scanDirectory(join(ROOT, dir));
  }

  if (findings.length > 0) {
    return {
      name: 'No Hardcoded Secrets',
      passed: false,
      message: `Found ${findings.length} potential secrets in codebase`,
      details: findings.slice(0, 10), // Limit to first 10
    };
  }

  return {
    name: 'No Hardcoded Secrets',
    passed: true,
    message: `Scanned ${scannedFiles.length} files, no secrets found`,
  };
}

/**
 * Check 5: Threat model document exists
 */
function checkThreatModel(): CheckResult {
  const docsDir = join(ROOT, '000-docs');

  if (!existsSync(docsDir)) {
    return {
      name: 'Threat Model',
      passed: false,
      message: '000-docs directory not found',
    };
  }

  const files = readdirSync(docsDir);
  const threatModelFile = files.find(f =>
    f.includes('TMOD') ||
    f.toLowerCase().includes('threat-model') ||
    f.toLowerCase().includes('threat_model')
  );

  if (!threatModelFile) {
    return {
      name: 'Threat Model',
      passed: false,
      message: 'Threat model document not found in 000-docs',
      details: ['Expected: *TMOD* or *threat-model* file'],
    };
  }

  const content = readFileSync(join(docsDir, threatModelFile), 'utf-8');

  // Check for required sections
  const requiredSections = ['STRIDE', 'Attack', 'Risk', 'Mitigation'];
  const missingSections = requiredSections.filter(s =>
    !content.toLowerCase().includes(s.toLowerCase())
  );

  if (missingSections.length > 0) {
    return {
      name: 'Threat Model',
      passed: false,
      message: `Threat model missing sections: ${missingSections.join(', ')}`,
      details: [`File: ${threatModelFile}`],
    };
  }

  return {
    name: 'Threat Model',
    passed: true,
    message: `Threat model present: ${threatModelFile}`,
  };
}

/**
 * Check 6: Security index exports everything
 */
function checkSecurityExports(): CheckResult {
  const indexPath = join(ROOT, 'packages/core/src/security/index.ts');

  if (!existsSync(indexPath)) {
    return {
      name: 'Security Exports',
      passed: false,
      message: 'Security index not found',
    };
  }

  const content = readFileSync(indexPath, 'utf-8');
  const requiredExports = [
    './rbac.js',
    './audit/index.js',
    './secrets.js',
    'verifyGitHubWebhookSignature',
    'verifyStripeWebhookSignature',
  ];

  const missing = requiredExports.filter(exp => !content.includes(exp));

  if (missing.length > 0) {
    return {
      name: 'Security Exports',
      passed: false,
      message: `Security index missing: ${missing.join(', ')}`,
      details: missing.map(m => `Missing: ${m}`),
    };
  }

  return {
    name: 'Security Exports',
    passed: true,
    message: 'Security index exports all modules',
  };
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║             Security Gate (Phase 24)                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  const checks = [
    checkRBACModule,
    checkAuditModule,
    checkSecretsModule,
    checkNoHardcodedSecrets,
    checkThreatModel,
    checkSecurityExports,
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
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Security Gate: ${passed}/${results.length} checks passed`);

  if (failed > 0) {
    console.log('\n❌ SECURITY GATE FAILED');
    console.log('Fix the above issues before proceeding.');
    process.exit(1);
  }

  console.log('\n✅ SECURITY GATE PASSED');
  console.log('All Phase 24 security controls verified.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
