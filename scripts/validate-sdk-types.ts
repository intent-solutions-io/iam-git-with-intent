#!/usr/bin/env tsx
/**
 * SDK Type Validation - Validates that SDK types are in sync with OpenAPI spec
 *
 * This script checks that the generated TypeScript types are up-to-date
 * with the OpenAPI specification. It's designed to run in CI/CD to catch
 * drift between the API specification and SDK types.
 *
 * Usage:
 *   npm run validate:sdk-types
 *   npx tsx scripts/validate-sdk-types.ts
 *
 * Exit Codes:
 *   0 - Types are valid and in sync
 *   1 - Validation failed or types are out of sync
 *
 * Features:
 * - Checks if generated types exist
 * - Validates types are current with OpenAPI spec
 * - Detects missing or outdated generated files
 * - Provides clear error messages for fixing issues
 *
 * @module scripts/validate-sdk-types
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

// Get project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Paths
const OPENAPI_SPEC_PATH = resolve(projectRoot, 'apps/gateway/openapi.yaml');
const GENERATED_TYPES_FILE = resolve(projectRoot, 'packages/sdk/src/generated/gateway-types.ts');
const GENERATED_INDEX_FILE = resolve(projectRoot, 'packages/sdk/src/generated/index.ts');

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Calculate SHA256 hash of file content
 */
function hashFile(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Get file modification time
 */
function getModifiedTime(filePath: string): Date {
  const stats = statSync(filePath);
  return stats.mtime;
}

/**
 * Check if generated types exist
 */
function checkGeneratedTypesExist(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(GENERATED_TYPES_FILE)) {
    errors.push(
      `Generated types file not found: ${GENERATED_TYPES_FILE}\n` +
        `  Run: npm run generate:sdk-types`
    );
  }

  if (!existsSync(GENERATED_INDEX_FILE)) {
    errors.push(
      `Generated index file not found: ${GENERATED_INDEX_FILE}\n` +
        `  Run: npm run generate:sdk-types`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if generated types are up-to-date with OpenAPI spec
 */
function checkTypesUpToDate(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(OPENAPI_SPEC_PATH)) {
    errors.push(`OpenAPI specification not found: ${OPENAPI_SPEC_PATH}`);
    return { valid: false, errors, warnings };
  }

  if (!existsSync(GENERATED_TYPES_FILE)) {
    // Already caught by checkGeneratedTypesExist
    return { valid: true, errors, warnings };
  }

  // Compare modification times
  const specModTime = getModifiedTime(OPENAPI_SPEC_PATH);
  const typesModTime = getModifiedTime(GENERATED_TYPES_FILE);

  if (specModTime > typesModTime) {
    const timeDiff = Math.round((specModTime.getTime() - typesModTime.getTime()) / 1000);
    errors.push(
      `Generated types are outdated!\n` +
        `  OpenAPI spec modified: ${specModTime.toISOString()}\n` +
        `  Types last generated: ${typesModTime.toISOString()}\n` +
        `  Time difference: ${timeDiff} seconds ago\n` +
        `  Run: npm run generate:sdk-types`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate that generated types file has expected structure
 */
function checkTypesStructure(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(GENERATED_TYPES_FILE)) {
    // Already caught by checkGeneratedTypesExist
    return { valid: true, errors, warnings };
  }

  const content = readFileSync(GENERATED_TYPES_FILE, 'utf-8');

  // Check for expected header
  if (!content.includes('Generated TypeScript types for Git With Intent Gateway API')) {
    warnings.push('Generated types file missing expected header comment');
  }

  // Check for DO NOT EDIT warning
  if (!content.includes('DO NOT EDIT MANUALLY')) {
    warnings.push('Generated types file missing "DO NOT EDIT" warning');
  }

  // Check for operations type (key indicator of OpenAPI types)
  if (!content.includes('operations')) {
    errors.push(
      'Generated types file missing "operations" type\n' +
        '  This suggests the OpenAPI spec was not properly processed.\n' +
        '  Run: npm run generate:sdk-types --verbose'
    );
  }

  // Check for paths type
  if (!content.includes('paths')) {
    errors.push(
      'Generated types file missing "paths" type\n' +
        '  This suggests the OpenAPI spec was not properly processed.\n' +
        '  Run: npm run generate:sdk-types --verbose'
    );
  }

  // Check for components type
  if (!content.includes('components')) {
    warnings.push('Generated types file missing "components" type (may be optional)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Run all validation checks
 */
function validateTypes(): ValidationResult {
  console.log('\n🔍 Validating SDK types against OpenAPI specification...\n');

  const results: ValidationResult[] = [];

  // Run all checks
  console.log('Checking if generated types exist...');
  results.push(checkGeneratedTypesExist());

  console.log('Checking if types are up-to-date...');
  results.push(checkTypesUpToDate());

  console.log('Checking types file structure...');
  results.push(checkTypesStructure());

  // Aggregate results
  const allErrors = results.flatMap((r) => r.errors);
  const allWarnings = results.flatMap((r) => r.warnings);

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Main validation function
 */
async function main(): Promise<void> {
  const result = validateTypes();

  console.log(); // Empty line for spacing

  // Display warnings
  if (result.warnings.length > 0) {
    console.log('⚠️  Warnings:\n');
    result.warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning}\n`);
    });
  }

  // Display errors
  if (result.errors.length > 0) {
    console.log('❌ Validation Failed:\n');
    result.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}\n`);
    });
    console.log('Fix the above errors and run validation again.\n');
    process.exit(1);
  }

  // Success
  console.log('✅ SDK types are valid and in sync with OpenAPI specification!\n');

  // Display file info
  if (existsSync(GENERATED_TYPES_FILE)) {
    const stats = statSync(GENERATED_TYPES_FILE);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`Generated types file: ${GENERATED_TYPES_FILE}`);
    console.log(`File size: ${sizeKB} KB`);
    console.log(`Last modified: ${stats.mtime.toISOString()}\n`);
  }

  process.exit(0);
}

// Run validation
main().catch((error) => {
  console.error('❌ Unexpected error during validation:\n');
  console.error(error);
  process.exit(1);
});
