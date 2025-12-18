#!/usr/bin/env npx tsx
/**
 * ARV: OpenAPI Specification Gate
 *
 * Phase 30.1: Validates OpenAPI spec exists and is well-formed.
 *
 * Tests:
 * - Spec file exists at apps/gateway/openapi.yaml
 * - Spec is valid YAML
 * - Spec has required OpenAPI 3.x fields
 * - All paths have operationIds
 * - All responses have schemas
 * - Security schemes are defined
 *
 * @module arv/openapi-gate
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

// =============================================================================
// Types
// =============================================================================

interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
    responses?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  };
  tags?: Array<{ name: string; description?: string }>;
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  delete?: Operation;
  patch?: Operation;
  options?: Operation;
  head?: Operation;
  trace?: Operation;
}

interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: Record<string, ResponseObject>;
  security?: unknown[];
}

interface ResponseObject {
  description?: string;
  content?: Record<string, { schema?: unknown }>;
  $ref?: string;
}

interface ValidationResult {
  name: string;
  passed: boolean;
  message?: string;
  details?: string[];
}

// =============================================================================
// Validation Functions
// =============================================================================

function validateSpecExists(specPath: string): ValidationResult {
  const exists = existsSync(specPath);
  return {
    name: 'Spec file exists',
    passed: exists,
    message: exists ? `Found at ${specPath}` : `Not found at ${specPath}`,
  };
}

function validateYamlParsing(content: string): ValidationResult {
  try {
    yaml.load(content);
    return {
      name: 'Valid YAML syntax',
      passed: true,
    };
  } catch (error) {
    return {
      name: 'Valid YAML syntax',
      passed: false,
      message: error instanceof Error ? error.message : 'Parse error',
    };
  }
}

function validateOpenApiVersion(spec: OpenApiSpec): ValidationResult {
  const version = spec.openapi;
  const isValid = version && (version.startsWith('3.0') || version.startsWith('3.1'));
  return {
    name: 'OpenAPI 3.x version',
    passed: isValid,
    message: isValid ? `Version: ${version}` : `Invalid version: ${version}`,
  };
}

function validateRequiredFields(spec: OpenApiSpec): ValidationResult {
  const missing: string[] = [];

  if (!spec.info) missing.push('info');
  if (!spec.info?.title) missing.push('info.title');
  if (!spec.info?.version) missing.push('info.version');
  if (!spec.paths) missing.push('paths');

  return {
    name: 'Required fields present',
    passed: missing.length === 0,
    message: missing.length === 0 ? 'All required fields present' : `Missing: ${missing.join(', ')}`,
    details: missing.length > 0 ? missing : undefined,
  };
}

function validateOperationIds(spec: OpenApiSpec): ValidationResult {
  const missingOperationIds: string[] = [];
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'] as const;

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (operation && !operation.operationId) {
        missingOperationIds.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }

  return {
    name: 'All operations have operationId',
    passed: missingOperationIds.length === 0,
    message: missingOperationIds.length === 0
      ? 'All operations have operationIds'
      : `${missingOperationIds.length} operations missing operationId`,
    details: missingOperationIds.length > 0 ? missingOperationIds : undefined,
  };
}

function validateResponseSchemas(spec: OpenApiSpec): ValidationResult {
  const missingSchemas: string[] = [];
  const methods = ['get', 'post', 'put', 'delete', 'patch'] as const;

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (operation?.responses) {
        for (const [statusCode, response] of Object.entries(operation.responses)) {
          // Skip checking if it's a $ref
          if (response.$ref) continue;

          // Only check success responses (2xx) for missing schemas
          if (statusCode.startsWith('2') && !response.content) {
            // Binary responses (like tarballs) may not have schema
            if (!operation.operationId?.includes('Tarball')) {
              missingSchemas.push(`${method.toUpperCase()} ${path} (${statusCode})`);
            }
          }
        }
      }
    }
  }

  return {
    name: 'Success responses have content',
    passed: missingSchemas.length === 0,
    message: missingSchemas.length === 0
      ? 'All success responses define content'
      : `${missingSchemas.length} responses missing content`,
    details: missingSchemas.length > 0 ? missingSchemas : undefined,
  };
}

function validateSecuritySchemes(spec: OpenApiSpec): ValidationResult {
  const hasSecuritySchemes = spec.components?.securitySchemes &&
    Object.keys(spec.components.securitySchemes).length > 0;

  return {
    name: 'Security schemes defined',
    passed: hasSecuritySchemes,
    message: hasSecuritySchemes
      ? `Defined: ${Object.keys(spec.components!.securitySchemes!).join(', ')}`
      : 'No security schemes defined',
  };
}

function validatePathCount(spec: OpenApiSpec): ValidationResult {
  const pathCount = Object.keys(spec.paths).length;
  // We expect at least 8 marketplace endpoints + 1 openapi endpoint
  const minPaths = 9;

  return {
    name: 'Minimum path coverage',
    passed: pathCount >= minPaths,
    message: `${pathCount} paths defined (minimum: ${minPaths})`,
  };
}

function validateTagsUsed(spec: OpenApiSpec): ValidationResult {
  const definedTags = new Set(spec.tags?.map(t => t.name) || []);
  const usedTags = new Set<string>();
  const methods = ['get', 'post', 'put', 'delete', 'patch'] as const;

  for (const pathItem of Object.values(spec.paths)) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (operation?.tags) {
        operation.tags.forEach(tag => usedTags.add(tag));
      }
    }
  }

  const unusedTags = [...definedTags].filter(t => !usedTags.has(t));
  const undefinedTags = [...usedTags].filter(t => !definedTags.has(t));

  const passed = unusedTags.length === 0 && undefinedTags.length === 0;

  return {
    name: 'Tags consistency',
    passed,
    message: passed
      ? `${definedTags.size} tags defined and used`
      : `Unused: ${unusedTags.join(', ')}; Undefined: ${undefinedTags.join(', ')}`,
  };
}

// =============================================================================
// Main
// =============================================================================

async function runOpenApiGate(): Promise<{ passed: boolean; results: ValidationResult[] }> {
  const results: ValidationResult[] = [];
  const specPath = join(process.cwd(), 'apps/gateway/openapi.yaml');

  // Check file exists
  results.push(validateSpecExists(specPath));
  if (!results[results.length - 1].passed) {
    return { passed: false, results };
  }

  // Read and parse
  const content = readFileSync(specPath, 'utf-8');
  results.push(validateYamlParsing(content));
  if (!results[results.length - 1].passed) {
    return { passed: false, results };
  }

  const spec = yaml.load(content) as OpenApiSpec;

  // Structural validation
  results.push(validateOpenApiVersion(spec));
  results.push(validateRequiredFields(spec));
  results.push(validateOperationIds(spec));
  results.push(validateResponseSchemas(spec));
  results.push(validateSecuritySchemes(spec));
  results.push(validatePathCount(spec));
  results.push(validateTagsUsed(spec));

  const passed = results.every(r => r.passed);
  return { passed, results };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('OpenAPI Specification Gate');
  console.log('='.repeat(60));

  runOpenApiGate().then(({ passed, results }) => {
    console.log('\nResults:\n');

    for (const result of results) {
      const icon = result.passed ? '\u2705' : '\u274C';
      console.log(`${icon} ${result.name}`);
      if (result.message) {
        console.log(`   ${result.message}`);
      }
      if (result.details && result.details.length > 0) {
        result.details.slice(0, 5).forEach(d => console.log(`   - ${d}`));
        if (result.details.length > 5) {
          console.log(`   ... and ${result.details.length - 5} more`);
        }
      }
    }

    const passedCount = results.filter(r => r.passed).length;
    console.log('\n' + '='.repeat(60));
    console.log(`\nOverall: ${passedCount}/${results.length} checks passed`);
    console.log(passed ? '\n\u2705 OPENAPI GATE PASSED' : '\n\u274C OPENAPI GATE FAILED');

    process.exit(passed ? 0 : 1);
  });
}

export { runOpenApiGate, type ValidationResult };
