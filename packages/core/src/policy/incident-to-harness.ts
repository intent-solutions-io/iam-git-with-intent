/**
 * Incident-to-Harness Feedback Loop
 *
 * Code Factory Pattern 8: When a production violation is resolved,
 * automatically generate a golden task (.golden.yaml) that prevents
 * the same class of failure from recurring.
 *
 * Bridges: ViolationDetector → GoldenTask generation
 *
 * SLA Target: Golden task created within 48 hours of incident resolution.
 *
 * @module @gwi/core/policy/incident-to-harness
 */

import { z } from 'zod';
import { createHash } from 'crypto';
import type { Violation, ViolationType, ViolationSeverity } from './violation-schema.js';

// =============================================================================
// Golden Task Schema
// =============================================================================

/**
 * A golden task generated from a resolved violation.
 * Written as YAML to test/goldens/incidents/.
 */
export const GoldenTaskSchema = z.object({
  /** Unique task ID derived from the violation */
  id: z.string(),
  /** Human-readable name */
  name: z.string(),
  /** Description of what this golden task verifies */
  description: z.string(),
  /** Which workflow/pipeline this tests */
  workflow: z.string(),
  /** Source violation that triggered this task */
  source: z.object({
    violationId: z.string(),
    violationType: z.string(),
    severity: z.string(),
    detectedAt: z.string(),
    resolvedAt: z.string(),
    resolutionNotes: z.string().optional(),
  }),
  /** Input to feed through the evaluation harness */
  input: z.object({
    type: z.string(),
    content: z.string(),
    metadata: z.record(z.unknown()).optional(),
  }),
  /** Expected output criteria */
  expectedOutput: z.object({
    /** Minimum quality score */
    minScore: z.number().min(0).max(100).default(70),
    /** Sections that must be present */
    requiredSections: z.array(z.string()).optional(),
    /** Keywords that must appear */
    requiredKeywords: z.array(z.string()).optional(),
    /** Patterns that must NOT appear */
    forbiddenPatterns: z.array(z.string()).optional(),
    /** The violation class that must be detected */
    mustDetectViolationType: z.string().optional(),
  }),
  /** Tags for filtering */
  tags: z.array(z.string()),
  /** SLA tracking */
  sla: z.object({
    /** When the incident was resolved */
    incidentResolvedAt: z.string(),
    /** When this golden task was created */
    taskCreatedAt: z.string(),
    /** Hours between resolution and task creation */
    creationLatencyHours: z.number(),
    /** Whether within 48h SLA target */
    withinSla: z.boolean(),
  }),
});

export type GoldenTask = z.infer<typeof GoldenTaskSchema>;

// =============================================================================
// Harness Generator Configuration
// =============================================================================

export interface HarnessGeneratorConfig {
  /** SLA target in hours for task creation after incident resolution (default: 48) */
  slaTargetHours?: number;
  /** Callback to persist the generated golden task (e.g., write to filesystem) */
  onTaskGenerated?: (task: GoldenTask, yaml: string) => void | Promise<void>;
  /** Minimum severity to generate tasks for (default: 'medium') */
  minimumSeverity?: ViolationSeverity;
  /** Custom workflow mapping by violation type */
  workflowMapping?: Partial<Record<ViolationType, string>>;
}

// =============================================================================
// Default Workflow Mappings
// =============================================================================

const DEFAULT_WORKFLOW_MAP: Record<ViolationType, string> = {
  'policy-denied': 'policy-enforcement',
  'approval-bypassed': 'approval-gate',
  'limit-exceeded': 'rate-limiter',
  'anomaly-detected': 'anomaly-detection',
};

const SEVERITY_RANK: Record<ViolationSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// =============================================================================
// Harness Generator
// =============================================================================

/**
 * Generates golden task YAML from resolved violations.
 *
 * Usage:
 * ```ts
 * const generator = new IncidentHarnessGenerator({
 *   onTaskGenerated: async (task, yaml) => {
 *     await writeFile(`test/goldens/incidents/${task.id}.golden.yaml`, yaml);
 *   },
 * });
 *
 * // Wire into ViolationDetector's onViolationDetected callback
 * // or call directly when a violation is resolved:
 * const result = await generator.generateFromViolation(resolvedViolation);
 * ```
 */
export class IncidentHarnessGenerator {
  private readonly config: Required<Pick<HarnessGeneratorConfig, 'slaTargetHours' | 'minimumSeverity'>> & HarnessGeneratorConfig;
  private readonly generatedIds = new Set<string>();

  constructor(config: HarnessGeneratorConfig = {}) {
    this.config = {
      slaTargetHours: config.slaTargetHours ?? 48,
      minimumSeverity: config.minimumSeverity ?? 'medium',
      ...config,
    };
  }

  /**
   * Generate a golden task from a resolved violation.
   * Returns null if the violation doesn't qualify.
   */
  async generateFromViolation(violation: Violation): Promise<GenerationResult> {
    // Only generate for resolved/dismissed violations
    if (violation.status !== 'resolved' && violation.status !== 'dismissed') {
      return {
        generated: false,
        reason: `Violation status is '${violation.status}', expected 'resolved' or 'dismissed'`,
      };
    }

    // Check severity threshold
    if (SEVERITY_RANK[violation.severity] < SEVERITY_RANK[this.config.minimumSeverity]) {
      return {
        generated: false,
        reason: `Severity '${violation.severity}' below minimum '${this.config.minimumSeverity}'`,
      };
    }

    // Deduplicate: don't generate twice for the same violation
    const dedupeKey = this.buildDedupeKey(violation);
    if (this.generatedIds.has(dedupeKey)) {
      return {
        generated: false,
        reason: 'Golden task already generated for this violation',
        dedupeKey,
      };
    }

    // Build the golden task
    const now = new Date();
    const resolvedAt = violation.metadata.updatedAt;
    const latencyMs = now.getTime() - resolvedAt.getTime();
    const latencyHours = latencyMs / (1000 * 60 * 60);

    const task = this.buildGoldenTask(violation, now, resolvedAt, latencyHours);

    // Serialize to YAML
    const yaml = this.serializeToYaml(task);

    // Mark as generated
    this.generatedIds.add(dedupeKey);

    // Invoke callback
    if (this.config.onTaskGenerated) {
      await this.config.onTaskGenerated(task, yaml);
    }

    return {
      generated: true,
      task,
      yaml,
      sla: {
        targetHours: this.config.slaTargetHours,
        actualHours: latencyHours,
        withinSla: latencyHours <= this.config.slaTargetHours,
      },
    };
  }

  /**
   * Build a GoldenTask object from a violation.
   */
  private buildGoldenTask(
    violation: Violation,
    createdAt: Date,
    resolvedAt: Date,
    latencyHours: number,
  ): GoldenTask {
    const taskId = this.generateTaskId(violation);
    const workflow = this.config.workflowMapping?.[violation.type]
      ?? DEFAULT_WORKFLOW_MAP[violation.type]
      ?? 'unknown';

    return {
      id: taskId,
      name: this.generateTaskName(violation),
      description: this.generateDescription(violation),
      workflow,
      source: {
        violationId: violation.id,
        violationType: violation.type,
        severity: violation.severity,
        detectedAt: violation.detectedAt.toISOString(),
        resolvedAt: resolvedAt.toISOString(),
        resolutionNotes: violation.metadata.resolutionNotes,
      },
      input: this.generateInput(violation),
      expectedOutput: this.generateExpectedOutput(violation),
      tags: this.generateTags(violation),
      sla: {
        incidentResolvedAt: resolvedAt.toISOString(),
        taskCreatedAt: createdAt.toISOString(),
        creationLatencyHours: Math.round(latencyHours * 100) / 100,
        withinSla: latencyHours <= this.config.slaTargetHours,
      },
    };
  }

  /**
   * Generate a deterministic task ID from the violation.
   */
  private generateTaskId(violation: Violation): string {
    const hash = createHash('sha256')
      .update(`${violation.id}:${violation.type}:${violation.tenantId}`)
      .digest('hex')
      .substring(0, 8);
    return `incident-${violation.type}-${hash}`;
  }

  /**
   * Generate a human-readable task name.
   */
  private generateTaskName(violation: Violation): string {
    const typeNames: Record<ViolationType, string> = {
      'policy-denied': 'Policy Denial',
      'approval-bypassed': 'Approval Bypass',
      'limit-exceeded': 'Rate Limit Exceeded',
      'anomaly-detected': 'Anomaly Detection',
    };
    const typeName = typeNames[violation.type] ?? violation.type;
    return `Regression Guard: ${typeName} (${violation.severity})`;
  }

  /**
   * Generate a description for the golden task.
   */
  private generateDescription(violation: Violation): string {
    return [
      `Auto-generated from resolved incident ${violation.id}.`,
      `Ensures the ${violation.type} scenario is caught by the evaluation harness.`,
      violation.summary,
      violation.metadata.resolutionNotes
        ? `Resolution: ${violation.metadata.resolutionNotes}`
        : undefined,
    ].filter(Boolean).join('\n');
  }

  /**
   * Generate the input fixture for the golden task.
   */
  private generateInput(violation: Violation): GoldenTask['input'] {
    // Build a synthetic input that reproduces the violation scenario
    const inputByType: Record<ViolationType, () => GoldenTask['input']> = {
      'policy-denied': () => ({
        type: 'policy-evaluation',
        content: JSON.stringify({
          actor: { type: violation.actor.type, id: 'test-actor' },
          resource: { type: violation.resource.type, id: 'test-resource' },
          action: violation.action.type,
          details: violation.details,
        }, null, 2),
        metadata: {
          violationType: violation.type,
          originalActorType: violation.actor.type,
          originalResourceType: violation.resource.type,
        },
      }),
      'approval-bypassed': () => ({
        type: 'approval-check',
        content: JSON.stringify({
          actor: { type: violation.actor.type, id: 'test-actor' },
          resource: { type: violation.resource.type, id: 'test-resource' },
          action: violation.action.type,
          details: violation.details,
        }, null, 2),
        metadata: {
          violationType: violation.type,
          bypassMethod: (violation.details as Record<string, unknown>).bypassMethod,
        },
      }),
      'limit-exceeded': () => ({
        type: 'rate-limit-check',
        content: JSON.stringify({
          actor: { type: violation.actor.type, id: 'test-actor' },
          action: violation.action.type,
          details: violation.details,
        }, null, 2),
        metadata: {
          violationType: violation.type,
          limitType: (violation.details as Record<string, unknown>).limitType,
        },
      }),
      'anomaly-detected': () => ({
        type: 'anomaly-evaluation',
        content: JSON.stringify({
          actor: { type: violation.actor.type, id: 'test-actor' },
          resource: { type: violation.resource.type, id: 'test-resource' },
          action: violation.action.type,
          details: violation.details,
        }, null, 2),
        metadata: {
          violationType: violation.type,
          anomalyType: (violation.details as Record<string, unknown>).anomalyType,
        },
      }),
    };

    return inputByType[violation.type]();
  }

  /**
   * Generate expected output criteria based on the violation.
   */
  private generateExpectedOutput(violation: Violation): GoldenTask['expectedOutput'] {
    const base: GoldenTask['expectedOutput'] = {
      minScore: 70,
      mustDetectViolationType: violation.type,
      requiredKeywords: [violation.type, violation.severity],
      forbiddenPatterns: [],
    };

    // Type-specific criteria
    switch (violation.type) {
      case 'policy-denied':
        base.requiredKeywords?.push('policy', 'denied');
        base.requiredSections = ['Violation', 'Policy'];
        break;
      case 'approval-bypassed':
        base.requiredKeywords?.push('approval', 'bypass');
        base.requiredSections = ['Violation', 'Approval'];
        base.minScore = 80; // Higher bar for security-critical
        break;
      case 'limit-exceeded':
        base.requiredKeywords?.push('limit', 'exceeded');
        base.requiredSections = ['Violation', 'Limits'];
        break;
      case 'anomaly-detected':
        base.requiredKeywords?.push('anomaly');
        base.requiredSections = ['Violation', 'Anomaly'];
        base.minScore = 80;
        break;
    }

    return base;
  }

  /**
   * Generate tags for the golden task.
   */
  private generateTags(violation: Violation): string[] {
    const tags = [
      'auto-generated',
      'incident-regression',
      violation.type,
      violation.severity,
    ];
    if (violation.tags) {
      tags.push(...violation.tags.filter(t => !tags.includes(t)));
    }
    return tags;
  }

  /**
   * Serialize a GoldenTask to YAML string.
   * Uses a simple serializer to avoid adding js-yaml as a dependency.
   */
  serializeToYaml(task: GoldenTask): string {
    const lines: string[] = [];

    lines.push(`# Auto-generated golden task from incident ${task.source.violationId}`);
    lines.push(`# Generated: ${task.sla.taskCreatedAt}`);
    lines.push(`# SLA: ${task.sla.withinSla ? 'WITHIN TARGET' : 'EXCEEDED TARGET'} (${task.sla.creationLatencyHours}h / ${this.config.slaTargetHours}h)`);
    lines.push('');
    lines.push('tasks:');
    lines.push(`  - id: ${task.id}`);
    lines.push(`    name: "${escapeYaml(task.name)}"`);
    lines.push(`    description: |`);
    for (const line of task.description.split('\n')) {
      lines.push(`      ${line}`);
    }
    lines.push(`    workflow: ${task.workflow}`);

    // Source
    lines.push('    source:');
    lines.push(`      violationId: ${task.source.violationId}`);
    lines.push(`      violationType: ${task.source.violationType}`);
    lines.push(`      severity: ${task.source.severity}`);
    lines.push(`      detectedAt: "${task.source.detectedAt}"`);
    lines.push(`      resolvedAt: "${task.source.resolvedAt}"`);
    if (task.source.resolutionNotes) {
      lines.push(`      resolutionNotes: "${escapeYaml(task.source.resolutionNotes)}"`);
    }

    // Input
    lines.push('    input:');
    lines.push(`      type: ${task.input.type}`);
    lines.push('      content: |');
    for (const line of task.input.content.split('\n')) {
      lines.push(`        ${line}`);
    }
    if (task.input.metadata) {
      lines.push('      metadata:');
      for (const [key, value] of Object.entries(task.input.metadata)) {
        if (value !== undefined) {
          lines.push(`        ${key}: ${JSON.stringify(value)}`);
        }
      }
    }

    // Expected output
    lines.push('    expectedOutput:');
    lines.push(`      minScore: ${task.expectedOutput.minScore}`);
    if (task.expectedOutput.mustDetectViolationType) {
      lines.push(`      mustDetectViolationType: ${task.expectedOutput.mustDetectViolationType}`);
    }
    if (task.expectedOutput.requiredSections?.length) {
      lines.push('      requiredSections:');
      for (const s of task.expectedOutput.requiredSections) {
        lines.push(`        - ${s}`);
      }
    }
    if (task.expectedOutput.requiredKeywords?.length) {
      lines.push('      requiredKeywords:');
      for (const k of task.expectedOutput.requiredKeywords) {
        lines.push(`        - ${k}`);
      }
    }
    if (task.expectedOutput.forbiddenPatterns?.length) {
      lines.push('      forbiddenPatterns:');
      for (const p of task.expectedOutput.forbiddenPatterns) {
        lines.push(`        - "${escapeYaml(p)}"`);
      }
    }

    // Tags
    lines.push('    tags:');
    for (const tag of task.tags) {
      lines.push(`      - ${tag}`);
    }

    // SLA
    lines.push('    sla:');
    lines.push(`      incidentResolvedAt: "${task.sla.incidentResolvedAt}"`);
    lines.push(`      taskCreatedAt: "${task.sla.taskCreatedAt}"`);
    lines.push(`      creationLatencyHours: ${task.sla.creationLatencyHours}`);
    lines.push(`      withinSla: ${task.sla.withinSla}`);

    return lines.join('\n') + '\n';
  }

  /**
   * Build a deduplication key for a violation.
   */
  private buildDedupeKey(violation: Violation): string {
    return createHash('sha256')
      .update(`${violation.id}:${violation.type}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Reset deduplication state (for testing).
   */
  resetDeduplication(): void {
    this.generatedIds.clear();
  }
}

// =============================================================================
// Generation Result
// =============================================================================

export interface GenerationResult {
  generated: boolean;
  reason?: string;
  task?: GoldenTask;
  yaml?: string;
  dedupeKey?: string;
  sla?: {
    targetHours: number;
    actualHours: number;
    withinSla: boolean;
  };
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a harness generator with default configuration.
 */
export function createHarnessGenerator(
  config?: HarnessGeneratorConfig,
): IncidentHarnessGenerator {
  return new IncidentHarnessGenerator(config);
}

// =============================================================================
// Singleton Management
// =============================================================================

let harnessGeneratorInstance: IncidentHarnessGenerator | null = null;

export function initializeHarnessGenerator(
  config?: HarnessGeneratorConfig,
): IncidentHarnessGenerator {
  harnessGeneratorInstance = new IncidentHarnessGenerator(config);
  return harnessGeneratorInstance;
}

export function getHarnessGenerator(): IncidentHarnessGenerator {
  if (!harnessGeneratorInstance) {
    throw new Error('HarnessGenerator not initialized. Call initializeHarnessGenerator first.');
  }
  return harnessGeneratorInstance;
}

export function setHarnessGenerator(generator: IncidentHarnessGenerator): void {
  harnessGeneratorInstance = generator;
}

export function resetHarnessGenerator(): void {
  harnessGeneratorInstance = null;
}

// =============================================================================
// Helpers
// =============================================================================

function escapeYaml(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
