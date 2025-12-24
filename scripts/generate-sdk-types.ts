#!/usr/bin/env tsx
/**
 * SDK Type Generator - Generates TypeScript types from OpenAPI specification
 *
 * This script reads the OpenAPI specification from apps/gateway/openapi.yaml
 * and generates TypeScript types for the SDK at packages/sdk/src/generated/
 *
 * Usage:
 *   npm run generate:sdk-types
 *   npx tsx scripts/generate-sdk-types.ts
 *
 * Features:
 * - Generates strongly-typed interfaces from OpenAPI schemas
 * - Handles request/response types for all endpoints
 * - Preserves JSDoc comments from OpenAPI descriptions
 * - Creates separate files for better organization
 * - Validates OpenAPI spec before generation
 *
 * @module scripts/generate-sdk-types
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import openapiTS, { astToString } from 'openapi-typescript';

// Get project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Paths
const OPENAPI_SPEC_PATH = resolve(projectRoot, 'apps/gateway/openapi.yaml');
const OUTPUT_DIR = resolve(projectRoot, 'packages/sdk/src/generated');
const OUTPUT_FILE = resolve(OUTPUT_DIR, 'gateway-types.ts');

interface GenerationOptions {
  verbose?: boolean;
}

/**
 * Validate that the OpenAPI spec exists and is readable
 */
function validateSpecExists(): void {
  if (!existsSync(OPENAPI_SPEC_PATH)) {
    console.error(`❌ OpenAPI specification not found at: ${OPENAPI_SPEC_PATH}`);
    process.exit(1);
  }
  console.log(`✓ Found OpenAPI spec at: ${OPENAPI_SPEC_PATH}`);
}

/**
 * Ensure the output directory exists
 */
function ensureOutputDir(): void {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`✓ Created output directory: ${OUTPUT_DIR}`);
  }
}

/**
 * Generate TypeScript types from OpenAPI spec
 */
async function generateTypes(options: GenerationOptions = {}): Promise<void> {
  const { verbose = false } = options;

  console.log('\n🔄 Generating SDK types from OpenAPI specification...\n');

  try {
    // Validate inputs
    validateSpecExists();
    ensureOutputDir();

    if (verbose) {
      console.log(`Reading OpenAPI spec from: ${OPENAPI_SPEC_PATH}`);
    }

    // Generate types using openapi-typescript v7
    // Convert file path to file:// URL as required by openapi-typescript v7+
    const fileUrl = new URL(`file://${OPENAPI_SPEC_PATH}`);

    if (verbose) {
      console.log(`Generating from: ${fileUrl.href}`);
    }

    // In v7+, openapiTS returns an AST object that needs to be converted to a string
    const ast = await openapiTS(fileUrl, {
      transform: (schemaObject, metadata) => {
        // Custom transformations can be added here
        if (verbose && metadata?.path) {
          console.log(`  Processing: ${metadata.path}`);
        }
        return undefined; // Return undefined to use default transformation
      },
    });

    // Convert AST to TypeScript string
    const output = astToString(ast);

    if (verbose) {
      console.log(`Generated types length: ${output.length} characters`);
      console.log(`Output preview (first 500 chars):\n${output.substring(0, 500)}...`);
    }

    // Add file header with metadata and usage instructions
    const fileHeader = `/**
 * Generated TypeScript types for Git With Intent Gateway API
 *
 * This file is auto-generated from the OpenAPI specification.
 * DO NOT EDIT MANUALLY - changes will be overwritten.
 *
 * Generated on: ${new Date().toISOString()}
 * OpenAPI Spec: apps/gateway/openapi.yaml
 *
 * To regenerate:
 *   npm run generate:sdk-types
 *
 * To validate:
 *   npm run validate:sdk-types
 *
 * @see https://github.com/drwpow/openapi-typescript
 * @module @gwi/sdk/generated
 */

/* eslint-disable */
/* prettier-ignore */

`;

    const finalOutput = fileHeader + output;

    // Write to file
    writeFileSync(OUTPUT_FILE, finalOutput, 'utf-8');

    console.log(`✓ Types generated successfully`);
    console.log(`✓ Output written to: ${OUTPUT_FILE}`);
    console.log(`✓ File size: ${(finalOutput.length / 1024).toFixed(2)} KB\n`);

    // Generate index file for re-exports
    const indexContent = `/**
 * Generated types from OpenAPI specification
 *
 * This barrel file re-exports all generated types for easier imports.
 *
 * @module @gwi/sdk/generated
 */

export type * from './gateway-types.js';
`;

    const indexPath = resolve(OUTPUT_DIR, 'index.ts');
    writeFileSync(indexPath, indexContent, 'utf-8');
    console.log(`✓ Generated index file: ${indexPath}\n`);

    console.log('✅ SDK type generation completed successfully!\n');
  } catch (error) {
    console.error('❌ Failed to generate types:\n');
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      if (verbose && error.stack) {
        console.error(`\nStack trace:\n${error.stack}`);
      }
    } else {
      console.error(String(error));
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');

// Run generation
generateTypes({ verbose }).catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
