/**
 * Orchestrator Agent for Git With Intent
 *
 * [Task: git-with-intent-bzs]
 *
 * Central coordinator that routes work between agents:
 * - Receives incoming requests (PR resolution, issue-to-code, etc.)
 * - Routes to appropriate agents based on task type
 * - Manages workflow state and tracks progress
 * - Handles escalations and failures
 * - Monitors agent health
 *
 * Uses Gemini Flash for fast routing decisions.
 *
 * TRUE AGENT: Stateful (AgentFS), Autonomous, Collaborative (A2A)
 */

import { BaseAgent, type AgentConfig } from '../base/agent.js';
import { type TaskRequestPayload, MODELS } from '@gwi/core';

/**
 * Workflow types supported by the orchestrator
 */
export type WorkflowType = 'pr-resolve' | 'issue-to-code' | 'pr-review' | 'test-gen' | 'docs-update';

/**
 * Workflow status
 */
export type WorkflowStatus = 'pending' | 'in_progress' | 'waiting_approval' | 'completed' | 'failed' | 'escalated';

/**
 * Workflow step
 */
export interface WorkflowStep {
  agent: string;
  status: WorkflowStatus;
  startedAt?: number;
  completedAt?: number;
  result?: unknown;
  error?: string;
}

/**
 * Workflow instance
 */
export interface Workflow {
  id: string;
  type: WorkflowType;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  input: unknown;
  output?: unknown;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
}

/**
 * Orchestrator input
 */
export interface OrchestratorInput {
  workflowType: WorkflowType;
  payload: unknown;
}

/**
 * Orchestrator output
 */
export interface OrchestratorOutput {
  workflowId: string;
  status: WorkflowStatus;
  currentStep?: string;
  result?: unknown;
}

/**
 * Agent registry entry
 */
interface AgentEntry {
  id: string;
  name: string;
  status: 'available' | 'busy' | 'offline';
  capabilities: string[];
  lastHeartbeat: number;
}

/**
 * Orchestrator agent configuration
 */
const ORCHESTRATOR_CONFIG: AgentConfig = {
  name: 'orchestrator',
  description: 'Central coordinator that routes work between agents and manages workflows',
  capabilities: ['workflow-management', 'agent-routing', 'escalation-handling', 'health-monitoring'],
  defaultModel: {
    provider: 'google',
    model: MODELS.google.flash,
    maxTokens: 2048,
  },
};

/**
 * Workflow definitions - what agents to call in what order
 */
const WORKFLOW_DEFINITIONS: Record<WorkflowType, string[]> = {
  'pr-resolve': ['triage', 'resolver', 'reviewer'],
  'issue-to-code': ['triage', 'coder', 'reviewer', 'test'],
  'pr-review': ['reviewer'],
  'test-gen': ['test'],
  'docs-update': ['docs'],
};

/**
 * System prompt for routing decisions
 */
const ROUTING_SYSTEM_PROMPT = `You are the Orchestrator Agent for Git With Intent.

Your role is to make routing decisions for incoming tasks. Given a task description, determine:
1. The workflow type (pr-resolve, issue-to-code, pr-review, test-gen, docs-update)
2. Priority level (1=critical, 2=high, 3=normal, 4=low)
3. Any special handling requirements

Respond with JSON:
{
  "workflowType": "pr-resolve",
  "priority": 1,
  "specialHandling": null
}`;

/**
 * Orchestrator Agent Implementation
 */
export class OrchestratorAgent extends BaseAgent {
  /** Active workflows */
  private workflows: Map<string, Workflow> = new Map();

  /** Agent registry */
  private agents: Map<string, AgentEntry> = new Map();

  constructor() {
    super(ORCHESTRATOR_CONFIG);
  }

  /**
   * Initialize - load state from AgentFS
   */
  protected async onInitialize(): Promise<void> {
    // Load active workflows
    const workflows = await this.loadState<Workflow[]>('active_workflows');
    if (workflows) {
      for (const wf of workflows) {
        this.workflows.set(wf.id, wf);
      }
    }

    // Load agent registry
    const agents = await this.loadState<AgentEntry[]>('agent_registry');
    if (agents) {
      for (const agent of agents) {
        this.agents.set(agent.id, agent);
      }
    }

    // Register known agents
    this.registerAgent('triage', ['complexity-analysis', 'routing']);
    this.registerAgent('resolver', ['conflict-resolution', 'code-merge']);
    this.registerAgent('reviewer', ['code-review', 'security-scan']);
  }

  /**
   * Shutdown - persist state
   */
  protected async onShutdown(): Promise<void> {
    await this.saveState('active_workflows', Array.from(this.workflows.values()));
    await this.saveState('agent_registry', Array.from(this.agents.values()));
  }

  /**
   * Process incoming task
   */
  protected async processTask(payload: TaskRequestPayload): Promise<OrchestratorOutput> {
    const input = payload.input as OrchestratorInput;
    return this.startWorkflow(input.workflowType, input.payload);
  }

  /**
   * Start a new workflow
   */
  async startWorkflow(type: WorkflowType, input: unknown): Promise<OrchestratorOutput> {
    const workflowId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const steps = WORKFLOW_DEFINITIONS[type];

    if (!steps) {
      throw new Error(`Unknown workflow type: ${type}`);
    }

    const workflow: Workflow = {
      id: workflowId,
      type,
      status: 'pending',
      steps: steps.map((agent) => ({
        agent,
        status: 'pending' as WorkflowStatus,
      })),
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.workflows.set(workflowId, workflow);
    await this.saveState('active_workflows', Array.from(this.workflows.values()));

    // Start executing the workflow
    return this.executeWorkflow(workflowId);
  }

  /**
   * Execute a workflow
   */
  private async executeWorkflow(workflowId: string): Promise<OrchestratorOutput> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    workflow.status = 'in_progress';
    workflow.updatedAt = Date.now();

    let lastResult: unknown = workflow.input;

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];

      // Check if agent is available
      const agent = this.agents.get(step.agent);
      if (!agent || agent.status === 'offline') {
        workflow.status = 'failed';
        workflow.error = `Agent ${step.agent} is not available`;
        await this.saveState('active_workflows', Array.from(this.workflows.values()));

        return {
          workflowId,
          status: 'failed',
          currentStep: step.agent,
        };
      }

      // Mark step as in progress
      step.status = 'in_progress';
      step.startedAt = Date.now();
      workflow.updatedAt = Date.now();

      try {
        // Route to agent (in real implementation, this would send A2A message)
        const result = await this.routeToAgent(step.agent, lastResult, workflow.type);

        step.status = 'completed';
        step.completedAt = Date.now();
        step.result = result;
        lastResult = result;

        // Check if this step requires approval (reviewer)
        if (step.agent === 'reviewer') {
          const reviewResult = result as { approved: boolean; shouldEscalate: boolean };
          if (reviewResult.shouldEscalate) {
            workflow.status = 'escalated';
            workflow.updatedAt = Date.now();
            await this.saveState('active_workflows', Array.from(this.workflows.values()));

            return {
              workflowId,
              status: 'escalated',
              currentStep: step.agent,
              result: lastResult,
            };
          }
          if (!reviewResult.approved) {
            workflow.status = 'waiting_approval';
            workflow.updatedAt = Date.now();
            await this.saveState('active_workflows', Array.from(this.workflows.values()));

            return {
              workflowId,
              status: 'waiting_approval',
              currentStep: step.agent,
              result: lastResult,
            };
          }
        }
      } catch (error) {
        step.status = 'failed';
        step.error = error instanceof Error ? error.message : String(error);
        workflow.status = 'failed';
        workflow.error = step.error;
        workflow.updatedAt = Date.now();
        await this.saveState('active_workflows', Array.from(this.workflows.values()));

        return {
          workflowId,
          status: 'failed',
          currentStep: step.agent,
        };
      }
    }

    // All steps completed
    workflow.status = 'completed';
    workflow.output = lastResult;
    workflow.completedAt = Date.now();
    workflow.updatedAt = Date.now();
    await this.saveState('active_workflows', Array.from(this.workflows.values()));

    return {
      workflowId,
      status: 'completed',
      result: lastResult,
    };
  }

  /**
   * Route work to a specific agent
   */
  private async routeToAgent(agentName: string, _input: unknown, _workflowType: WorkflowType): Promise<unknown> {
    // In real implementation, this would:
    // 1. Create A2A message
    // 2. Send to agent's message queue
    // 3. Wait for response
    // 4. Return result

    // For now, return mock result indicating routing happened
    const mockResults: Record<string, unknown> = {
      triage: {
        overallComplexity: 5,
        riskLevel: 'medium',
        routeDecision: 'agent-resolve',
        estimatedTimeSec: 120,
        explanation: 'Moderate complexity conflict requiring agent resolution',
        fileComplexities: [],
      },
      resolver: {
        resolution: {
          file: 'example.ts',
          resolvedContent: '// Resolved content',
          explanation: 'Merged both changes',
          confidence: 85,
          strategy: 'merge-both',
        },
        tokensUsed: { input: 1000, output: 500 },
      },
      reviewer: {
        review: {
          approved: true,
          syntaxValid: true,
          codeLossDetected: false,
          securityIssues: [],
          suggestions: [],
          confidence: 90,
        },
        shouldEscalate: false,
      },
    };

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 100));

    return mockResults[agentName] || { status: 'completed' };
  }

  /**
   * Register an agent in the registry
   */
  private registerAgent(name: string, capabilities: string[]): void {
    this.agents.set(name, {
      id: `spiffe://intent.solutions/agent/${name}`,
      name,
      status: 'available',
      capabilities,
      lastHeartbeat: Date.now(),
    });
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<Workflow | null> {
    return this.workflows.get(workflowId) || null;
  }

  /**
   * List active workflows
   */
  async listWorkflows(status?: WorkflowStatus): Promise<Workflow[]> {
    const workflows = Array.from(this.workflows.values());
    if (status) {
      return workflows.filter((wf) => wf.status === status);
    }
    return workflows;
  }

  /**
   * Resume a waiting workflow (after human approval)
   */
  async resumeWorkflow(workflowId: string, approved: boolean): Promise<OrchestratorOutput> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (workflow.status !== 'waiting_approval') {
      throw new Error(`Workflow ${workflowId} is not waiting for approval`);
    }

    if (!approved) {
      workflow.status = 'failed';
      workflow.error = 'Rejected by human reviewer';
      workflow.updatedAt = Date.now();
      await this.saveState('active_workflows', Array.from(this.workflows.values()));

      return {
        workflowId,
        status: 'failed',
      };
    }

    // Find current step and continue
    const currentStepIndex = workflow.steps.findIndex((s) => s.status === 'completed');
    if (currentStepIndex === workflow.steps.length - 1) {
      // All done
      workflow.status = 'completed';
      workflow.completedAt = Date.now();
    } else {
      // Continue with next steps
      return this.executeWorkflow(workflowId);
    }

    workflow.updatedAt = Date.now();
    await this.saveState('active_workflows', Array.from(this.workflows.values()));

    return {
      workflowId,
      status: workflow.status,
      result: workflow.output,
    };
  }

  /**
   * Get agent registry
   */
  async getAgentRegistry(): Promise<AgentEntry[]> {
    return Array.from(this.agents.values());
  }

  /**
   * Update agent status (heartbeat)
   */
  async updateAgentStatus(agentId: string, status: 'available' | 'busy' | 'offline'): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      agent.lastHeartbeat = Date.now();
      await this.saveState('agent_registry', Array.from(this.agents.values()));
    }
  }

  /**
   * Auto-route incoming request to appropriate workflow
   */
  async autoRoute(description: string): Promise<{ workflowType: WorkflowType; priority: number }> {
    const response = await this.chat({
      model: this.config.defaultModel,
      messages: [
        { role: 'system', content: ROUTING_SYSTEM_PROMPT },
        { role: 'user', content: `Route this request: ${description}` },
      ],
      temperature: 0.1,
    });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Default fallback
    }

    return { workflowType: 'pr-resolve', priority: 3 };
  }
}

/**
 * Create an Orchestrator Agent instance
 */
export function createOrchestratorAgent(): OrchestratorAgent {
  return new OrchestratorAgent();
}
