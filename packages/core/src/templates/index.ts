/**
 * Workflow Template System
 *
 * Phase 13: Workflow Catalog - Templates + Instances + Scheduler + Notifications
 *
 * Templates are versioned, immutable workflow definitions.
 * Instances are tenant-configured deployments of templates.
 *
 * @module @gwi/core/templates
 */

import type { WorkflowType } from '../workflows/index.js';

// Re-export instance/schedule types from storage (canonical location)
export type { WorkflowInstance, WorkflowSchedule, ConnectorBinding } from '../storage/interfaces.js';

// =============================================================================
// Template Types
// =============================================================================

/**
 * Input field definition for template configuration
 */
export interface TemplateInputField {
  /** Field name (used as key in configuredInputs) */
  name: string;
  /** Display label */
  label: string;
  /** Field description */
  description?: string;
  /** Input type */
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect' | 'secret-ref' | 'json';
  /** Required field */
  required: boolean;
  /** Default value */
  default?: unknown;
  /** Options for select/multiselect types */
  options?: Array<{ value: string; label: string }>;
  /** Validation pattern (regex for string type) */
  pattern?: string;
  /** Min/max for number type */
  min?: number;
  max?: number;
}

/**
 * Connector requirement for a template
 */
export interface TemplateConnectorRequirement {
  /** Connector type ID */
  connectorType: string;
  /** Display name */
  label: string;
  /** Whether this connector is required */
  required: boolean;
  /** Capabilities needed from this connector */
  capabilities?: string[];
}

/**
 * Step definition within a template
 */
export interface TemplateStep {
  /** Step ID */
  id: string;
  /** Agent to execute */
  agent: string;
  /** Step display name */
  name: string;
  /** Step description */
  description?: string;
  /** Requires approval before proceeding */
  requiresApproval?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    backoffMs: number;
  };
}

/**
 * Workflow Template - immutable, versioned workflow definition
 */
export interface WorkflowTemplate {
  /** Unique template ID (e.g., "issue-to-code", "pr-review") */
  id: string;
  /** Semantic version */
  version: string;
  /** Display name */
  displayName: string;
  /** Template description */
  description: string;
  /** Category for grouping */
  category: 'code-generation' | 'review' | 'maintenance' | 'analysis' | 'custom';
  /** Underlying workflow type */
  workflowType: WorkflowType;
  /** Input schema for configuration */
  inputSchema: TemplateInputField[];
  /** Required connectors */
  requiredConnectors: TemplateConnectorRequirement[];
  /** Steps to execute */
  steps: TemplateStep[];
  /** Tags for filtering */
  tags: string[];
  /** Whether template is enabled */
  enabled: boolean;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Author/source */
  author?: string;
  /** Documentation URL */
  docsUrl?: string;
}

// =============================================================================
// Template Registry
// =============================================================================

/**
 * Built-in workflow templates
 */
export const BUILT_IN_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'issue-to-code',
    version: '1.0.0',
    displayName: 'Issue to Code',
    description: 'Generate code implementation from a GitHub issue description',
    category: 'code-generation',
    workflowType: 'issue-to-code',
    inputSchema: [
      {
        name: 'issueUrl',
        label: 'Issue URL',
        description: 'GitHub issue URL to implement',
        type: 'string',
        required: true,
        pattern: '^https://github\\.com/.+/issues/\\d+$',
      },
      {
        name: 'targetBranch',
        label: 'Target Branch',
        description: 'Branch to create PR against',
        type: 'string',
        required: false,
        default: 'main',
      },
      {
        name: 'includeTests',
        label: 'Include Tests',
        description: 'Generate tests alongside implementation',
        type: 'boolean',
        required: false,
        default: true,
      },
    ],
    requiredConnectors: [
      {
        connectorType: 'github',
        label: 'GitHub',
        required: true,
        capabilities: ['read_issues', 'create_pr'],
      },
    ],
    steps: [
      { id: 'triage', agent: 'triage', name: 'Analyze Issue', description: 'Determine complexity and approach' },
      { id: 'code', agent: 'coder', name: 'Generate Code', description: 'Create implementation', requiresApproval: true },
      { id: 'review', agent: 'reviewer', name: 'Review Code', description: 'Security and quality review' },
    ],
    tags: ['github', 'code-generation', 'ai'],
    enabled: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    author: 'gwi-team',
    docsUrl: 'https://docs.gwi.dev/templates/issue-to-code',
  },
  {
    id: 'pr-resolve',
    version: '1.0.0',
    displayName: 'PR Conflict Resolution',
    description: 'Automatically resolve merge conflicts in a pull request',
    category: 'maintenance',
    workflowType: 'pr-resolve',
    inputSchema: [
      {
        name: 'prUrl',
        label: 'Pull Request URL',
        description: 'GitHub PR URL with conflicts',
        type: 'string',
        required: true,
        pattern: '^https://github\\.com/.+/pull/\\d+$',
      },
      {
        name: 'riskMode',
        label: 'Risk Mode',
        description: 'How aggressively to apply resolutions',
        type: 'select',
        required: false,
        default: 'suggest_patch',
        options: [
          { value: 'comment_only', label: 'Comment Only' },
          { value: 'suggest_patch', label: 'Suggest Patch' },
          { value: 'auto_patch', label: 'Auto Patch (requires approval)' },
        ],
      },
    ],
    requiredConnectors: [
      {
        connectorType: 'github',
        label: 'GitHub',
        required: true,
        capabilities: ['read_pr', 'write_pr'],
      },
    ],
    steps: [
      { id: 'triage', agent: 'triage', name: 'Analyze Conflicts', description: 'Identify conflict patterns' },
      { id: 'resolve', agent: 'resolver', name: 'Resolve Conflicts', description: 'Generate resolutions', requiresApproval: true },
      { id: 'review', agent: 'reviewer', name: 'Review Resolutions', description: 'Verify correctness' },
    ],
    tags: ['github', 'merge-conflicts', 'maintenance'],
    enabled: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    author: 'gwi-team',
    docsUrl: 'https://docs.gwi.dev/templates/pr-resolve',
  },
  {
    id: 'pr-review',
    version: '1.0.0',
    displayName: 'PR Code Review',
    description: 'Automated code review with security and quality analysis',
    category: 'review',
    workflowType: 'pr-review',
    inputSchema: [
      {
        name: 'prUrl',
        label: 'Pull Request URL',
        description: 'GitHub PR URL to review',
        type: 'string',
        required: true,
        pattern: '^https://github\\.com/.+/pull/\\d+$',
      },
      {
        name: 'focusAreas',
        label: 'Focus Areas',
        description: 'What to focus the review on',
        type: 'multiselect',
        required: false,
        default: ['security', 'logic'],
        options: [
          { value: 'security', label: 'Security' },
          { value: 'performance', label: 'Performance' },
          { value: 'logic', label: 'Logic' },
          { value: 'style', label: 'Style' },
          { value: 'tests', label: 'Tests' },
        ],
      },
    ],
    requiredConnectors: [
      {
        connectorType: 'github',
        label: 'GitHub',
        required: true,
        capabilities: ['read_pr', 'write_comments'],
      },
    ],
    steps: [
      { id: 'review', agent: 'reviewer', name: 'Review Code', description: 'Analyze changes and provide feedback' },
    ],
    tags: ['github', 'code-review', 'security'],
    enabled: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    author: 'gwi-team',
    docsUrl: 'https://docs.gwi.dev/templates/pr-review',
  },
  {
    id: 'test-gen',
    version: '1.0.0',
    displayName: 'Test Generation',
    description: 'Generate unit tests for existing code',
    category: 'code-generation',
    workflowType: 'test-gen',
    inputSchema: [
      {
        name: 'targetFiles',
        label: 'Target Files',
        description: 'Files to generate tests for (glob pattern)',
        type: 'string',
        required: true,
      },
      {
        name: 'framework',
        label: 'Test Framework',
        description: 'Testing framework to use',
        type: 'select',
        required: false,
        options: [
          { value: 'jest', label: 'Jest' },
          { value: 'vitest', label: 'Vitest' },
          { value: 'mocha', label: 'Mocha' },
          { value: 'pytest', label: 'pytest' },
        ],
      },
      {
        name: 'coverageTarget',
        label: 'Coverage Target',
        description: 'Target code coverage percentage',
        type: 'number',
        required: false,
        default: 80,
        min: 0,
        max: 100,
      },
    ],
    requiredConnectors: [
      {
        connectorType: 'github',
        label: 'GitHub',
        required: true,
        capabilities: ['read_files'],
      },
    ],
    steps: [
      { id: 'triage', agent: 'triage', name: 'Analyze Code', description: 'Identify testable units' },
      { id: 'code', agent: 'coder', name: 'Generate Tests', description: 'Create test files' },
    ],
    tags: ['testing', 'code-generation'],
    enabled: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    author: 'gwi-team',
    docsUrl: 'https://docs.gwi.dev/templates/test-gen',
  },
  {
    id: 'docs-update',
    version: '1.0.0',
    displayName: 'Documentation Update',
    description: 'Update documentation based on code changes',
    category: 'maintenance',
    workflowType: 'docs-update',
    inputSchema: [
      {
        name: 'changedFiles',
        label: 'Changed Files',
        description: 'Files that were changed (glob pattern)',
        type: 'string',
        required: true,
      },
      {
        name: 'docsPath',
        label: 'Docs Path',
        description: 'Path to documentation directory',
        type: 'string',
        required: false,
        default: 'docs/',
      },
    ],
    requiredConnectors: [
      {
        connectorType: 'github',
        label: 'GitHub',
        required: true,
        capabilities: ['read_files', 'create_pr'],
      },
    ],
    steps: [
      { id: 'code', agent: 'coder', name: 'Update Docs', description: 'Generate documentation updates' },
    ],
    tags: ['documentation', 'maintenance'],
    enabled: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    author: 'gwi-team',
    docsUrl: 'https://docs.gwi.dev/templates/docs-update',
  },
];

/**
 * Template Registry - manages workflow templates
 */
export class TemplateRegistry {
  private templates: Map<string, WorkflowTemplate> = new Map();

  constructor() {
    // Load built-in templates
    for (const template of BUILT_IN_TEMPLATES) {
      this.register(template);
    }
  }

  /**
   * Register a template
   */
  register(template: WorkflowTemplate): void {
    const key = `${template.id}@${template.version}`;
    this.templates.set(key, template);
    // Also register as latest
    this.templates.set(template.id, template);
  }

  /**
   * Get a template by ID (returns latest version)
   */
  get(id: string): WorkflowTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Get a specific version of a template
   */
  getVersion(id: string, version: string): WorkflowTemplate | undefined {
    return this.templates.get(`${id}@${version}`);
  }

  /**
   * Get template by ref (id or id@version)
   */
  getByRef(ref: string): WorkflowTemplate | undefined {
    if (ref.includes('@')) {
      const [id, version] = ref.split('@');
      return this.getVersion(id, version);
    }
    return this.get(ref);
  }

  /**
   * List all templates (latest versions only)
   */
  list(options?: { category?: string; enabled?: boolean; tags?: string[] }): WorkflowTemplate[] {
    const templates: WorkflowTemplate[] = [];
    const seen = new Set<string>();

    for (const [key, template] of this.templates) {
      // Skip versioned entries, only include latest
      if (key.includes('@')) continue;
      if (seen.has(template.id)) continue;
      seen.add(template.id);

      // Apply filters
      if (options?.category && template.category !== options.category) continue;
      if (options?.enabled !== undefined && template.enabled !== options.enabled) continue;
      if (options?.tags?.length && !options.tags.some(t => template.tags.includes(t))) continue;

      templates.push(template);
    }

    return templates.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  /**
   * Check if a template exists
   */
  has(id: string): boolean {
    return this.templates.has(id);
  }
}

// =============================================================================
// Validation Utilities
// =============================================================================

/**
 * Validate configured inputs against template schema
 */
export function validateTemplateInputs(
  template: WorkflowTemplate,
  inputs: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const field of template.inputSchema) {
    const value = inputs[field.name];

    // Check required
    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push(`Missing required field: ${field.label}`);
      continue;
    }

    // Skip validation if not provided and not required
    if (value === undefined || value === null) continue;

    // Type validation
    switch (field.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${field.label} must be a string`);
        } else if (field.pattern && !new RegExp(field.pattern).test(value)) {
          errors.push(`${field.label} format is invalid`);
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          errors.push(`${field.label} must be a number`);
        } else {
          if (field.min !== undefined && value < field.min) {
            errors.push(`${field.label} must be at least ${field.min}`);
          }
          if (field.max !== undefined && value > field.max) {
            errors.push(`${field.label} must be at most ${field.max}`);
          }
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${field.label} must be a boolean`);
        }
        break;

      case 'select':
        if (!field.options?.some(o => o.value === value)) {
          errors.push(`${field.label} must be one of: ${field.options?.map(o => o.value).join(', ')}`);
        }
        break;

      case 'multiselect':
        if (!Array.isArray(value)) {
          errors.push(`${field.label} must be an array`);
        } else if (field.options) {
          const validValues = field.options.map(o => o.value);
          for (const v of value) {
            if (!validValues.includes(v as string)) {
              errors.push(`${field.label} contains invalid value: ${v}`);
            }
          }
        }
        break;

      case 'secret-ref':
        if (typeof value !== 'string') {
          errors.push(`${field.label} must be a string`);
        } else if (!value.includes('://')) {
          errors.push(`${field.label} must be a valid secret reference (e.g., env://SECRET_NAME)`);
        }
        break;

      case 'json':
        // JSON is already parsed if we get here
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Apply default values to inputs
 */
export function applyTemplateDefaults(
  template: WorkflowTemplate,
  inputs: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...inputs };

  for (const field of template.inputSchema) {
    if (result[field.name] === undefined && field.default !== undefined) {
      result[field.name] = field.default;
    }
  }

  return result;
}

// =============================================================================
// Instance Utilities
// =============================================================================

/**
 * Generate instance ID
 */
export function generateInstanceId(): string {
  return `inst_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Generate schedule ID
 */
export function generateScheduleId(): string {
  return `sched_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Parse template ref into id and version
 */
export function parseTemplateRef(ref: string): { id: string; version?: string } {
  if (ref.includes('@')) {
    const [id, version] = ref.split('@');
    return { id, version };
  }
  return { id: ref };
}

// =============================================================================
// Singleton Registry Instance
// =============================================================================

let registryInstance: TemplateRegistry | null = null;

/**
 * Get the global template registry instance
 */
export function getTemplateRegistry(): TemplateRegistry {
  if (!registryInstance) {
    registryInstance = new TemplateRegistry();
  }
  return registryInstance;
}
