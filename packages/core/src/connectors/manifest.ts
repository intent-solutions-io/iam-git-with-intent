/**
 * Connector Manifest Schema
 *
 * Phase 6: Defines the packaging format for installable connectors.
 *
 * A connector manifest describes:
 * - Identity (id, version, author)
 * - Entry point and tool definitions
 * - Policy classifications
 * - Checksum for integrity verification
 *
 * @module @gwi/core/connectors/manifest
 */

import { z } from 'zod';
import { ToolPolicyClass } from './types.js';

// =============================================================================
// Connector Manifest Schema
// =============================================================================

/**
 * Connector capability tags
 */
export const ConnectorCapability = z.enum([
  'vcs',              // Version control (GitHub, GitLab)
  'ci-cd',            // CI/CD systems (GitHub Actions, Jenkins)
  'issue-tracking',   // Issue tracking (Jira, Linear)
  'data-integration', // Data pipelines (Airbyte, Fivetran)
  'messaging',        // Messaging (Slack, Discord)
  'monitoring',       // Observability (Datadog, PagerDuty)
  'cloud',            // Cloud providers (AWS, GCP, Azure)
  'database',         // Databases (PostgreSQL, MongoDB)
  'auth',             // Authentication (Auth0, Okta)
  'custom',           // Custom/other
]);

export type ConnectorCapability = z.infer<typeof ConnectorCapability>;

/**
 * Tool definition in manifest
 */
export const ManifestToolDef = z.object({
  /** Tool name (without connector prefix) */
  name: z.string().min(1),

  /** Tool description */
  description: z.string().optional(),

  /** Policy class for this tool */
  policyClass: ToolPolicyClass,
});

export type ManifestToolDef = z.infer<typeof ManifestToolDef>;

/**
 * Connector manifest schema
 *
 * This is the connector.manifest.json file format.
 */
export const ConnectorManifest = z.object({
  /** Manifest schema version */
  manifestVersion: z.literal('1.0'),

  /** Stable connector ID (lowercase, alphanumeric + hyphens) */
  id: z.string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9-]*$/, 'ID must be lowercase alphanumeric with hyphens'),

  /** Semantic version string */
  version: z.string()
    .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/, 'Version must be semver'),

  /** Display name for UI */
  displayName: z.string().min(1).max(128),

  /** Short description */
  description: z.string().max(512).optional(),

  /** Author name or organization */
  author: z.string().min(1).max(128),

  /** SPDX license identifier */
  license: z.string().min(1).max(64),

  /** Path to entry point module (relative to manifest) */
  entrypoint: z.string()
    .min(1)
    .regex(/^[a-zA-Z0-9._/-]+\.(js|mjs|cjs)$/, 'Entrypoint must be a JS module'),

  /** Tool definitions */
  tools: z.array(ManifestToolDef).min(1),

  /** Capability tags */
  capabilities: z.array(ConnectorCapability).min(1),

  /** SHA256 checksum of entrypoint file */
  checksum: z.string()
    .regex(/^sha256:[a-f0-9]{64}$/, 'Checksum must be sha256:hexstring'),

  /** Minimum GWI core version required */
  minCoreVersion: z.string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must be semver')
    .optional(),

  /** Repository URL */
  repository: z.string().url().optional(),

  /** Homepage URL */
  homepage: z.string().url().optional(),

  /** Keywords for search */
  keywords: z.array(z.string()).optional(),

  /** Dependencies on other connectors */
  dependencies: z.record(z.string()).optional(),
});

export type ConnectorManifest = z.infer<typeof ConnectorManifest>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validation result
 */
export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  manifest?: ConnectorManifest;
}

/**
 * Validate a connector manifest
 */
export function validateManifest(data: unknown): ManifestValidationResult {
  const result = ConnectorManifest.safeParse(data);

  if (result.success) {
    return {
      valid: true,
      errors: [],
      manifest: result.data,
    };
  }

  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Parse manifest from JSON string
 */
export function parseManifest(json: string): ManifestValidationResult {
  try {
    const data = JSON.parse(json);
    return validateManifest(data);
  } catch (error) {
    return {
      valid: false,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

/**
 * Get the full tool name (connector.tool)
 */
export function getFullToolName(connectorId: string, toolName: string): string {
  return `${connectorId}.${toolName}`;
}

/**
 * Build a policy class map from manifest
 */
export function buildPolicyClassMap(
  manifest: ConnectorManifest
): Record<string, z.infer<typeof ToolPolicyClass>> {
  const map: Record<string, z.infer<typeof ToolPolicyClass>> = {};

  for (const tool of manifest.tools) {
    const fullName = getFullToolName(manifest.id, tool.name);
    map[fullName] = tool.policyClass;
  }

  return map;
}

// =============================================================================
// Manifest Creation Helpers
// =============================================================================

/**
 * Create a minimal manifest for testing
 */
export function createTestManifest(
  id: string,
  options?: Partial<ConnectorManifest>
): ConnectorManifest {
  return ConnectorManifest.parse({
    manifestVersion: '1.0',
    id,
    version: '0.1.0',
    displayName: `Test ${id} Connector`,
    description: `Test connector for ${id}`,
    author: 'Test Author',
    license: 'MIT',
    entrypoint: 'dist/index.js',
    tools: [
      {
        name: 'testTool',
        description: 'A test tool',
        policyClass: 'READ',
      },
    ],
    capabilities: ['custom'],
    checksum: 'sha256:' + 'a'.repeat(64),
    ...options,
  });
}
