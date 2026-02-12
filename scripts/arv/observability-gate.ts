#!/usr/bin/env npx tsx
/**
 * ARV Observability Gate
 *
 * Phase 23: Production Observability
 *
 * Verifies telemetry infrastructure is correctly implemented:
 * - Telemetry context and ID generation
 * - Structured logging with Cloud Logging format
 * - Distributed tracing
 * - Metrics and SLOs
 * - HTTP middleware
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// =============================================================================
// Types
// =============================================================================

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

// =============================================================================
// Check Functions
// =============================================================================

function checkFileExists(path: string, description: string): CheckResult {
  const exists = existsSync(path);
  return {
    name: description,
    passed: exists,
    message: exists ? `Found ${path}` : `Missing ${path}`,
  };
}

function checkFileContains(path: string, patterns: string[], description: string): CheckResult {
  if (!existsSync(path)) {
    return { name: description, passed: false, message: `File not found: ${path}` };
  }

  const content = readFileSync(path, 'utf-8');
  const missing: string[] = [];

  for (const pattern of patterns) {
    if (!content.includes(pattern)) {
      missing.push(pattern);
    }
  }

  if (missing.length > 0) {
    return {
      name: description,
      passed: false,
      message: `Missing patterns in ${path}: ${missing.join(', ')}`,
    };
  }

  return {
    name: description,
    passed: true,
    message: `All patterns found in ${path}`,
  };
}

function checkModuleExports(modulePath: string, exports: string[], description: string): CheckResult {
  try {
    // Read the source file to check exports
    const srcPath = modulePath.replace('/dist/', '/src/').replace('.js', '.ts');
    if (!existsSync(srcPath)) {
      return { name: description, passed: false, message: `Source not found: ${srcPath}` };
    }

    const content = readFileSync(srcPath, 'utf-8');
    const missing: string[] = [];

    for (const exp of exports) {
      // Check for export statements
      if (!content.includes(exp)) {
        missing.push(exp);
      }
    }

    if (missing.length > 0) {
      return {
        name: description,
        passed: false,
        message: `Missing exports: ${missing.join(', ')}`,
      };
    }

    return { name: description, passed: true, message: `All exports found` };
  } catch (error) {
    return {
      name: description,
      passed: false,
      message: `Error checking exports: ${error}`,
    };
  }
}

function checkTypeScript(): CheckResult {
  try {
    execSync('npm run typecheck', {
      cwd: resolve(process.cwd()),
      stdio: 'pipe',
    });
    return { name: 'TypeScript compilation', passed: true, message: 'Type check passed' };
  } catch {
    return { name: 'TypeScript compilation', passed: false, message: 'Type check failed' };
  }
}

// =============================================================================
// Main Gate
// =============================================================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        ARV Observability Gate - Phase 23                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  const results: CheckResult[] = [];
  const coreDir = resolve(process.cwd(), 'packages/core/src/telemetry');

  // Check 1: Telemetry ID generation
  results.push(
    checkFileContains(
      `${coreDir}/ids.ts`,
      ['generateTraceId', 'generateSpanId', 'TraceId', 'SpanId', 'isValidTraceId'],
      'Telemetry ID generation module'
    )
  );

  // Check 2: Telemetry context
  results.push(
    checkFileContains(
      `${coreDir}/context.ts`,
      [
        'TelemetryContext',
        'AsyncLocalStorage',
        'runWithContext',
        'createContextFromRequest',
        'serializeContext',
        'createTraceparent',
      ],
      'Telemetry context module'
    )
  );

  // Check 3: Structured logging
  results.push(
    checkFileContains(
      `${coreDir}/logger.ts`,
      [
        'Logger',
        'LogEntry',
        'getCurrentContext',
        'redact',
        'logging.googleapis.com',
        'requestStart',
        'requestEnd',
        'jobStart',
        'jobEnd',
      ],
      'Structured logging module'
    )
  );

  // Check 4: HTTP middleware
  results.push(
    checkFileContains(
      `${coreDir}/middleware.ts`,
      [
        'createTelemetryMiddleware',
        'createHonoTelemetryMiddleware',
        'wrapJobHandler',
        'wrapWebhookHandler',
        'runWithContextAsync',
      ],
      'HTTP middleware module'
    )
  );

  // Check 5: Distributed tracing
  results.push(
    checkFileContains(
      `${coreDir}/tracing.ts`,
      [
        'Span',
        'Tracer',
        'startSpan',
        'withSpan',
        'instrument',
        'instrumentHttpClient',
        'instrumentLLM',
        'SpanStatus',
        'SpanKind',
      ],
      'Distributed tracing module'
    )
  );

  // Check 6: Metrics
  results.push(
    checkFileContains(
      `${coreDir}/metrics.ts`,
      [
        'Counter',
        'Gauge',
        'Histogram',
        'MetricsRegistry',
        'getGWIMetrics',
        'GWI_SLOS',
        'recordHttpMetrics',
        'recordRunMetrics',
        'recordAgentMetrics',
      ],
      'Metrics module'
    )
  );

  // Check 7: Telemetry index exports
  results.push(
    checkFileContains(
      `${coreDir}/index.ts`,
      [
        "from './ids.js'",
        "from './context.js'",
        "from './logger.js'",
        "from './middleware.js'",
        "from './tracing.js'",
        "from './metrics.js'",
      ],
      'Telemetry index exports all modules'
    )
  );

  // Check 8: Core index exports telemetry
  results.push(
    checkFileContains(
      resolve(process.cwd(), 'packages/core/src/index.ts'),
      ["from './telemetry/index.js'", 'Phase 23: Production Observability'],
      'Core index exports telemetry'
    )
  );

  // Check 9: Secret redaction patterns
  results.push(
    checkFileContains(
      `${coreDir}/logger.ts`,
      ['sk-[a-zA-Z0-9', 'ghp_[a-zA-Z0-9', 'Bearer', 'REDACTED', 'Authorization'],
      'Secret redaction patterns defined'
    )
  );

  // Check 10: SLO definitions
  results.push(
    checkFileContains(
      `${coreDir}/metrics.ts`,
      [
        'api_availability',
        'api_latency_p95',
        'run_success_rate',
        'webhook_processing_success',
        'target: 0.999',
        'target: 0.95',
      ],
      'SLO definitions complete'
    )
  );

  // Check 11: TypeScript compilation
  results.push(checkTypeScript());

  // Check 12: OpenTelemetry API in core dependencies
  results.push(
    checkFileContains(
      resolve(process.cwd(), 'packages/core/package.json'),
      ['@opentelemetry/api'],
      '@opentelemetry/api in core dependencies'
    )
  );

  // Check 13: OTel init module exists
  results.push(
    checkFileExists(
      `${coreDir}/exporters/otel.ts`,
      'OTel SDK initialization module'
    )
  );

  // Check 14: Span bridge exists
  results.push(
    checkFileExists(
      `${coreDir}/exporters/span-bridge.ts`,
      'GWI-to-OTel span bridge module'
    )
  );

  // Check 15: Metrics bridge exists
  results.push(
    checkFileExists(
      `${coreDir}/exporters/metrics-bridge.ts`,
      'GWI-to-OTel metrics bridge module'
    )
  );

  // Print results
  console.log('Results:');
  console.log('─'.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (!result.passed) {
      console.log(`   └─ ${result.message}`);
    }

    if (result.passed) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log('─'.repeat(60));
  console.log(`${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\n❌ Observability Gate FAILED');
    process.exit(1);
  }

  console.log('\n✅ Observability Gate PASSED');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
