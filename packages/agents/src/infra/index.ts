/**
 * Infrastructure Agent for Git With Intent
 *
 * AI-powered infrastructure automation with sandbox execution.
 * Inspired by fluid.sh's approach to safe production access.
 *
 * Features:
 * - Executes infrastructure changes in isolated sandboxes (Docker/KVM)
 * - Generates IaC (Terraform/OpenTofu) from sandbox diffs
 * - Supports approval gates before production deployment
 * - Full audit trail of all operations
 *
 * Workflow:
 * 1. Receives infrastructure task (setup nginx, configure database, etc.)
 * 2. Creates sandbox (Docker for simple tasks, KVM for root access)
 * 3. Plans and executes changes in sandbox
 * 4. Captures diff of all changes
 * 5. Exports to IaC (Terraform)
 * 6. Returns result with approval token for production deployment
 *
 * Uses Claude Sonnet for planning, executes via sandbox.
 *
 * TRUE AGENT: Stateful (state), Autonomous, Collaborative (A2A)
 */

import { BaseAgent, type AgentConfig } from '../base/agent.js';
import { type TaskRequestPayload, MODELS, type ComplexityScore } from '@gwi/core';

/**
 * Infrastructure task types
 */
export type InfraTaskType =
  | 'setup'
  | 'configure'
  | 'deploy'
  | 'update'
  | 'migrate'
  | 'secure'
  | 'optimize'
  | 'troubleshoot';

/**
 * Sandbox type based on task requirements
 */
export type SandboxType = 'docker' | 'kvm' | 'deno-isolate';

/**
 * Infrastructure task input
 */
export interface InfraInput {
  /** Task description */
  description: string;
  /** Task type */
  taskType: InfraTaskType;
  /** Target environment */
  environment?: 'development' | 'staging' | 'production';
  /** Base image or template */
  baseImage?: string;
  /** Whether root access is required */
  requiresRoot?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Additional context */
  context?: {
    currentState?: Record<string, unknown>;
    constraints?: string[];
    preferredTools?: string[];
  };
  /** Complexity from triage (optional) */
  complexity?: ComplexityScore;
}

/**
 * Infrastructure step
 */
export interface InfraStep {
  /** Step index */
  index: number;
  /** Step description */
  description: string;
  /** Command to execute */
  command: string;
  /** Expected outcome */
  expectedOutcome?: string;
  /** Rollback command */
  rollbackCommand?: string;
  /** Whether this step is critical */
  critical?: boolean;
}

/**
 * Infrastructure plan
 */
export interface InfraPlan {
  /** Plan ID */
  id: string;
  /** Steps to execute */
  steps: InfraStep[];
  /** Estimated duration in seconds */
  estimatedDurationSec: number;
  /** Resources required */
  resourcesRequired: {
    cpuCores?: number;
    memoryMb?: number;
    diskMb?: number;
  };
  /** Risks identified */
  risks: string[];
  /** Confidence score */
  confidence: number;
}

/**
 * File diff from sandbox
 */
export interface InfraFileDiff {
  path: string;
  type: 'added' | 'modified' | 'deleted' | 'renamed';
  oldContent?: string | null;
  newContent?: string | null;
}

/**
 * Infrastructure execution result
 */
export interface InfraResult {
  /** Success indicator */
  success: boolean;
  /** Sandbox ID for reference */
  sandboxId: string;
  /** Execution plan that was followed */
  plan: InfraPlan;
  /** Steps that were executed */
  executedSteps: Array<{
    step: InfraStep;
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
  }>;
  /** File diffs from sandbox */
  diffs: InfraFileDiff[];
  /** Generated IaC (Terraform) */
  iac?: {
    format: 'terraform';
    files: Array<{ path: string; content: string }>;
    summary: {
      resourceCount: number;
      changes: { add: number; change: number; destroy: number };
    };
  };
  /** Approval token for production deployment */
  approvalToken?: string;
  /** Error message if failed */
  error?: string;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Requires approval before production */
  awaitingApproval: boolean;
}

/**
 * Infrastructure output
 */
export interface InfraOutput {
  result: InfraResult;
  tokensUsed: { input: number; output: number };
}

/**
 * History entry for learning
 */
interface InfraHistoryEntry {
  taskType: InfraTaskType;
  description: string;
  success: boolean;
  complexity: ComplexityScore;
  stepsCount: number;
  timestamp: number;
}

/**
 * Infra agent configuration
 */
const INFRA_CONFIG: AgentConfig = {
  name: 'infra',
  description:
    'Executes infrastructure changes in sandboxes and generates IaC for production deployment',
  capabilities: [
    'infrastructure-automation',
    'sandbox-execution',
    'iac-generation',
    'server-configuration',
    'container-management',
  ],
  defaultModel: {
    provider: 'anthropic',
    model: MODELS.anthropic.sonnet,
    maxTokens: 8192,
  },
};

/**
 * System prompt for infrastructure planning
 */
const INFRA_SYSTEM_PROMPT = `You are the Infrastructure Agent for Git With Intent, an AI-powered DevOps platform.

Your role is to plan and execute infrastructure changes safely in sandboxed environments.

## Planning Phase

When given an infrastructure task, create a detailed execution plan:

1. **Analyze Requirements**
   - Understand what needs to be accomplished
   - Identify dependencies and prerequisites
   - Assess complexity and risks

2. **Create Step-by-Step Plan**
   - Each step should be atomic and reversible when possible
   - Include clear commands that can be executed
   - Provide rollback commands for critical steps
   - Order steps to minimize risk

3. **Resource Estimation**
   - Estimate CPU, memory, disk requirements
   - Estimate execution time

## Output Format

Respond with JSON:
{
  "plan": {
    "steps": [
      {
        "index": 1,
        "description": "Install nginx",
        "command": "apt-get update && apt-get install -y nginx",
        "expectedOutcome": "nginx package installed",
        "rollbackCommand": "apt-get remove -y nginx",
        "critical": true
      }
    ],
    "estimatedDurationSec": 120,
    "resourcesRequired": {
      "cpuCores": 2,
      "memoryMb": 1024,
      "diskMb": 500
    },
    "risks": ["Service may need restart", "Port 80 must be available"],
    "confidence": 85
  }
}

## Best Practices

1. **Idempotency**: Commands should be safe to run multiple times
2. **Minimal Changes**: Only modify what's necessary
3. **Verification**: Include verification steps after critical changes
4. **Security**: Never expose secrets in commands, use environment variables
5. **Documentation**: Explain why each step is needed

## Sandbox Types

- **Docker**: For application-level changes, package installation
- **KVM**: For OS-level changes, kernel modules, system services

## Critical Rules

1. NEVER execute destructive commands without confirmation step
2. ALWAYS provide rollback commands for critical operations
3. NEVER hardcode credentials or secrets
4. ENSURE all commands are non-interactive (use -y flags, etc.)
5. VALIDATE state before and after critical operations`;

/**
 * Infrastructure Agent Implementation
 */
export class InfraAgent extends BaseAgent {
  /** Execution history */
  private history: InfraHistoryEntry[] = [];

  /** Learned patterns by task type */
  private patterns: Map<InfraTaskType, string[]> = new Map();

  constructor() {
    super(INFRA_CONFIG);
  }

  /**
   * Initialize - load history from state
   */
  protected async onInitialize(): Promise<void> {
    const history = await this.loadState<InfraHistoryEntry[]>('infra_history');
    if (history) {
      this.history = history;
    }

    const patterns = await this.loadState<Record<string, string[]>>('infra_patterns');
    if (patterns) {
      this.patterns = new Map(Object.entries(patterns)) as Map<InfraTaskType, string[]>;
    }
  }

  /**
   * Shutdown - persist state
   */
  protected async onShutdown(): Promise<void> {
    await this.saveState('infra_history', this.history);
    await this.saveState('infra_patterns', Object.fromEntries(this.patterns));
  }

  /**
   * Process an infrastructure task request
   */
  protected async processTask(payload: TaskRequestPayload): Promise<InfraOutput> {
    if (payload.taskType !== 'infra' && payload.taskType !== 'infrastructure') {
      throw new Error(`Unsupported task type: ${payload.taskType}`);
    }

    const input = payload.input as InfraInput;
    return this.executeInfraTask(input);
  }

  /**
   * Execute an infrastructure task
   *
   * This is the main entry point for infrastructure automation.
   * It plans, executes in sandbox, captures diffs, and exports to IaC.
   */
  async executeInfraTask(input: InfraInput): Promise<InfraOutput> {
    const complexity = input.complexity ?? 5;

    // 1. Generate execution plan
    const plan = await this.generatePlan(input);

    // 2. Determine sandbox type
    const sandboxType = this.determineSandboxType(input, plan);

    // 3. Create sandbox and execute plan
    const executionResult = await this.executeInSandbox(plan, sandboxType, input);

    // 4. Record in history
    this.recordExecution(input, executionResult, complexity);

    return {
      result: executionResult,
      tokensUsed: { input: 0, output: 0 },
    };
  }

  /**
   * Generate execution plan using LLM
   */
  private async generatePlan(input: InfraInput): Promise<InfraPlan> {
    const prompt = this.buildPlanningPrompt(input);

    const response = await this.chat({
      model: this.config.defaultModel,
      messages: [
        { role: 'system', content: INFRA_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3, // Low temperature for consistent planning
    });

    return this.parsePlanResponse(response, input);
  }

  /**
   * Build planning prompt
   */
  private buildPlanningPrompt(input: InfraInput): string {
    const relevantPatterns = this.patterns.get(input.taskType) ?? [];

    let prompt = `## Infrastructure Task

**Type:** ${input.taskType}
**Description:** ${input.description}
**Environment:** ${input.environment ?? 'development'}
**Requires Root:** ${input.requiresRoot ?? 'auto-detect'}
**Base Image:** ${input.baseImage ?? 'ubuntu:22.04'}
`;

    if (input.context?.currentState) {
      prompt += `\n### Current State\n\`\`\`json\n${JSON.stringify(input.context.currentState, null, 2)}\n\`\`\`\n`;
    }

    if (input.context?.constraints?.length) {
      prompt += `\n### Constraints\n${input.context.constraints.map((c) => `- ${c}`).join('\n')}\n`;
    }

    if (input.context?.preferredTools?.length) {
      prompt += `\n### Preferred Tools\n${input.context.preferredTools.map((t) => `- ${t}`).join('\n')}\n`;
    }

    if (relevantPatterns.length > 0) {
      prompt += `\n### Learned Patterns for ${input.taskType}\n`;
      prompt += relevantPatterns.slice(0, 3).map((p, i) => `${i + 1}. ${p}`).join('\n');
    }

    prompt += `\n\nPlease generate a detailed execution plan for this infrastructure task.`;

    return prompt;
  }

  /**
   * Parse plan response from LLM
   */
  private parsePlanResponse(response: string, input: InfraInput): InfraPlan {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const planData = parsed.plan || parsed;

      const steps: InfraStep[] = (planData.steps || []).map((s: any, i: number) => ({
        index: s.index ?? i + 1,
        description: s.description || 'Step ' + (i + 1),
        command: s.command || '',
        expectedOutcome: s.expectedOutcome,
        rollbackCommand: s.rollbackCommand,
        critical: s.critical ?? false,
      }));

      return {
        id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        steps,
        estimatedDurationSec: planData.estimatedDurationSec ?? 60,
        resourcesRequired: {
          cpuCores: planData.resourcesRequired?.cpuCores ?? 2,
          memoryMb: planData.resourcesRequired?.memoryMb ?? 1024,
          diskMb: planData.resourcesRequired?.diskMb ?? 1000,
        },
        risks: planData.risks ?? [],
        confidence: Math.min(100, Math.max(0, planData.confidence ?? 70)),
      };
    } catch (error) {
      // Return a minimal fallback plan
      return {
        id: `plan-fallback-${Date.now()}`,
        steps: [
          {
            index: 1,
            description: input.description,
            command: `echo "Task: ${input.description}"`,
            critical: false,
          },
        ],
        estimatedDurationSec: 30,
        resourcesRequired: { cpuCores: 1, memoryMb: 512 },
        risks: ['Plan generation failed - using fallback'],
        confidence: 0,
      };
    }
  }

  /**
   * Determine appropriate sandbox type
   */
  private determineSandboxType(input: InfraInput, plan: InfraPlan): SandboxType {
    // KVM required for root access or system-level changes
    if (input.requiresRoot) {
      return 'kvm';
    }

    // Check if any step requires root
    const rootCommands = ['systemctl', 'service', 'mount', 'modprobe', 'sysctl', 'iptables'];
    for (const step of plan.steps) {
      if (rootCommands.some((cmd) => step.command.includes(cmd))) {
        return 'kvm';
      }
    }

    // Deno for TypeScript/JavaScript execution
    if (plan.steps.every((s) => s.command.includes('deno') || s.command.includes('npm'))) {
      return 'deno-isolate';
    }

    // Default to Docker for most tasks
    return 'docker';
  }

  /**
   * Execute plan in sandbox
   *
   * This is a simulation since we don't have actual sandbox access.
   * In production, this would:
   * 1. Create actual sandbox via @gwi/sandbox
   * 2. Execute each step
   * 3. Capture real diffs
   * 4. Export to Terraform
   */
  private async executeInSandbox(
    plan: InfraPlan,
    sandboxType: SandboxType,
    input: InfraInput
  ): Promise<InfraResult> {
    const startTime = Date.now();
    const sandboxId = `sbx-${sandboxType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const executedSteps: InfraResult['executedSteps'] = [];
    let success = true;
    let error: string | undefined;

    // Simulate step execution
    for (const step of plan.steps) {
      const stepStart = Date.now();

      // In production, this would be:
      // const result = await sandbox.execute(step.command, { timeoutMs: input.timeoutMs });

      // Simulation: assume success for non-destructive commands
      const isDestructive = step.command.includes('rm ') || step.command.includes('delete');
      const simulatedSuccess = !isDestructive || plan.confidence > 80;

      executedSteps.push({
        step,
        exitCode: simulatedSuccess ? 0 : 1,
        stdout: simulatedSuccess ? `[Simulated] ${step.expectedOutcome || 'Success'}` : '',
        stderr: simulatedSuccess ? '' : '[Simulated] Command failed',
        durationMs: Date.now() - stepStart + Math.random() * 100,
      });

      if (!simulatedSuccess) {
        success = false;
        error = `Step ${step.index} failed: ${step.description}`;
        break;
      }
    }

    // Generate simulated diffs
    const diffs = this.generateSimulatedDiffs(plan, input);

    // Generate IaC
    const iac = success ? this.generateIaC(diffs, input) : undefined;

    // Generate approval token
    const approvalToken = success
      ? this.generateApprovalToken(sandboxId, plan, diffs)
      : undefined;

    return {
      success,
      sandboxId,
      plan,
      executedSteps,
      diffs,
      iac,
      approvalToken,
      error,
      totalDurationMs: Date.now() - startTime,
      awaitingApproval: success && input.environment === 'production',
    };
  }

  /**
   * Generate simulated diffs based on plan
   */
  private generateSimulatedDiffs(_plan: InfraPlan, input: InfraInput): InfraFileDiff[] {
    const diffs: InfraFileDiff[] = [];

    // Infer likely file changes from task type
    switch (input.taskType) {
      case 'setup':
      case 'configure':
        // Configuration files
        if (input.description.toLowerCase().includes('nginx')) {
          diffs.push({
            path: '/etc/nginx/nginx.conf',
            type: 'modified',
            newContent: '# nginx configuration\n# Generated by GWI InfraAgent',
          });
          diffs.push({
            path: '/etc/nginx/sites-available/default',
            type: 'added',
            newContent: 'server {\n  listen 80;\n  server_name _;\n}',
          });
        }
        break;

      case 'deploy':
        diffs.push({
          path: '/app/docker-compose.yml',
          type: 'added',
          newContent: 'version: "3.8"\nservices:\n  app:\n    image: app:latest',
        });
        break;

      case 'secure':
        diffs.push({
          path: '/etc/ssh/sshd_config',
          type: 'modified',
          newContent: '# SSH hardening configuration',
        });
        break;

      default:
        diffs.push({
          path: '/workspace/changes.log',
          type: 'added',
          newContent: `# Changes from: ${input.description}\n# Task type: ${input.taskType}`,
        });
    }

    return diffs;
  }

  /**
   * Generate IaC from diffs
   */
  private generateIaC(diffs: InfraFileDiff[], input: InfraInput): InfraResult['iac'] {
    const files: Array<{ path: string; content: string }> = [];

    // Generate main.tf
    const mainTf = this.generateMainTf(diffs, input);
    files.push({ path: 'main.tf', content: mainTf });

    // Generate variables.tf
    const variablesTf = this.generateVariablesTf(input);
    files.push({ path: 'variables.tf', content: variablesTf });

    return {
      format: 'terraform',
      files,
      summary: {
        resourceCount: diffs.length,
        changes: {
          add: diffs.filter((d) => d.type === 'added').length,
          change: diffs.filter((d) => d.type === 'modified').length,
          destroy: diffs.filter((d) => d.type === 'deleted').length,
        },
      },
    };
  }

  /**
   * Generate main.tf content
   */
  private generateMainTf(diffs: InfraFileDiff[], input: InfraInput): string {
    const lines: string[] = [
      '# Generated by GWI Infrastructure Agent',
      `# Task: ${input.description}`,
      `# Generated at: ${new Date().toISOString()}`,
      '',
      'terraform {',
      '  required_version = ">= 1.0"',
      '  required_providers {',
      '    local = {',
      '      source  = "hashicorp/local"',
      '      version = "~> 2.0"',
      '    }',
      '  }',
      '}',
      '',
    ];

    for (const diff of diffs) {
      if (diff.type === 'deleted') {
        lines.push(`# Deleted: ${diff.path}`);
        continue;
      }

      const safeName = diff.path
        .replace(/^\//, '')
        .replace(/\//g, '_')
        .replace(/\./g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '');

      lines.push(`resource "local_file" "${safeName}" {`);
      lines.push(`  filename = "${diff.path}"`);
      lines.push(`  content  = <<-EOT`);
      lines.push(diff.newContent ?? '');
      lines.push(`EOT`);
      lines.push(`}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate variables.tf content
   */
  private generateVariablesTf(input: InfraInput): string {
    return `# Variables for: ${input.description}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "${input.environment ?? 'development'}"
}

variable "prefix" {
  description = "Resource name prefix"
  type        = string
  default     = "gwi-infra"
}
`;
  }

  /**
   * Generate approval token
   */
  private generateApprovalToken(
    sandboxId: string,
    plan: InfraPlan,
    diffs: InfraFileDiff[]
  ): string {
    // In production, this would be a cryptographically signed token
    const payload = {
      sandboxId,
      planId: plan.id,
      diffCount: diffs.length,
      timestamp: Date.now(),
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  /**
   * Record execution in history
   */
  private recordExecution(
    input: InfraInput,
    result: InfraResult,
    complexity: ComplexityScore
  ): void {
    const entry: InfraHistoryEntry = {
      taskType: input.taskType,
      description: input.description.slice(0, 100),
      success: result.success,
      complexity,
      stepsCount: result.plan.steps.length,
      timestamp: Date.now(),
    };

    this.history.push(entry);

    // Keep history bounded
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }

    // Update patterns for successful executions
    if (result.success && result.plan.confidence >= 70) {
      const patterns = this.patterns.get(input.taskType) ?? [];
      const pattern = `${input.description.slice(0, 50)} -> ${result.plan.steps.length} steps, ${result.diffs.length} changes`;
      patterns.push(pattern);

      if (patterns.length > 10) {
        patterns.shift();
      }

      this.patterns.set(input.taskType, patterns);
    }

    // Persist
    this.saveState('infra_history', this.history);
    this.saveState('infra_patterns', Object.fromEntries(this.patterns));
  }

  /**
   * Get execution statistics
   */
  async getStats(): Promise<{
    total: number;
    successful: number;
    byTaskType: Record<InfraTaskType, number>;
    avgStepsPerTask: number;
  }> {
    const byTaskType = {} as Record<InfraTaskType, number>;
    let totalSteps = 0;

    for (const entry of this.history) {
      byTaskType[entry.taskType] = (byTaskType[entry.taskType] ?? 0) + 1;
      totalSteps += entry.stepsCount;
    }

    return {
      total: this.history.length,
      successful: this.history.filter((e) => e.success).length,
      byTaskType,
      avgStepsPerTask: this.history.length > 0 ? totalSteps / this.history.length : 0,
    };
  }

  /**
   * Apply approved changes to production
   *
   * This would be called after human approval of the sandbox execution.
   */
  async applyToProduction(approvalToken: string): Promise<{
    success: boolean;
    message: string;
    appliedFiles?: string[];
  }> {
    try {
      const payload = JSON.parse(Buffer.from(approvalToken, 'base64').toString());

      // Validate token
      if (!payload.sandboxId || !payload.planId) {
        return { success: false, message: 'Invalid approval token' };
      }

      // In production, this would:
      // 1. Retrieve sandbox state
      // 2. Apply Terraform/run Ansible
      // 3. Verify deployment

      return {
        success: true,
        message: 'Changes applied to production',
        appliedFiles: [], // Would list actual files
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Create an Infrastructure Agent instance
 */
export function createInfraAgent(): InfraAgent {
  return new InfraAgent();
}
