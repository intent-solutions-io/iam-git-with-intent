/**
 * Foreman Agent for Git With Intent
 *
 * [Task: git-with-intent-hah]
 * EPIC 024: IAM Department Architecture Port
 *
 * The Foreman coordinates the SWE (Software Engineering) pipeline:
 *   audit → issues → plans → fixes → qa → docs
 *
 * Unlike the Orchestrator (which routes high-level workflows),
 * the Foreman runs systematic codebase improvements through
 * a 6-stage pipeline with risk tier controls.
 *
 * Agent Mapping:
 *   - audit/issues: TriageAgent (codebase scanning, issue generation)
 *   - plans/fixes: CoderAgent (fix planning and implementation)
 *   - qa: ReviewerAgent (quality assurance, test validation)
 *   - docs: CoderAgent (documentation updates)
 *
 * TRUE AGENT: Stateful, Autonomous, Collaborative (A2A)
 */

import { BaseAgent, type AgentConfig } from '../base/agent.js';
import { type TaskRequestPayload, MODELS } from '@gwi/core';
import { TriageAgent } from '../triage/index.js';
import { ReviewerAgent } from '../reviewer/index.js';
import { CoderAgent } from '../coder/index.js';
import {
  type PipelineRequest,
  type PipelineResponse,
  type PipelineStageResult,
  type PipelineStage,
  type StageStatus,
  type IssueSpec,
  type FixPlan,
  type FixResult,
  type QAVerdict,
  type DocUpdate,
  type RiskTier,
  meetsRiskTier,
  PipelineRequest as PipelineRequestSchema,
} from '@gwi/core';

/**
 * Pipeline run state
 */
interface PipelineRun {
  id: string;
  request: PipelineRequest;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStage: PipelineStage | null;
  stages: Map<PipelineStage, PipelineStageResult>;
  issues: IssueSpec[];
  plans: FixPlan[];
  fixes: FixResult[];
  verdicts: QAVerdict[];
  docs: DocUpdate[];
  totalTokens: { input: number; output: number };
  startedAt: number;
  completedAt?: number;
  error?: string;
}

/**
 * Foreman configuration
 */
const FOREMAN_CONFIG: AgentConfig = {
  name: 'foreman',
  description: 'SWE pipeline coordinator - runs audit→issues→plans→fixes→qa→docs',
  capabilities: [
    'swe-pipeline',
    'codebase-audit',
    'issue-detection',
    'fix-planning',
    'fix-implementation',
    'qa-verification',
    'doc-generation',
  ],
  defaultModel: {
    provider: 'google',
    model: MODELS.google.flash,
    maxTokens: 4096,
  },
};

/**
 * Pipeline stage order
 */
const STAGE_ORDER: PipelineStage[] = ['audit', 'issues', 'plans', 'fixes', 'qa', 'docs'];

/**
 * Foreman Agent Implementation
 */
export class ForemanAgent extends BaseAgent {
  /** Active pipeline runs */
  private runs: Map<string, PipelineRun> = new Map();

  /** Agent instances (lazy initialized) */
  private triageAgent: TriageAgent | null = null;
  private coderAgent: CoderAgent | null = null;
  private reviewerAgent: ReviewerAgent | null = null;

  constructor() {
    super(FOREMAN_CONFIG);
  }

  /**
   * Initialize the foreman
   */
  protected async onInitialize(): Promise<void> {
    // Load any persisted run state
    const runs = await this.loadState<PipelineRun[]>('active_runs');
    if (runs) {
      for (const run of runs) {
        // Reconstruct Map from serialized data
        run.stages = new Map(Object.entries(run.stages || {})) as Map<PipelineStage, PipelineStageResult>;
        this.runs.set(run.id, run);
      }
    }
  }

  /**
   * Shutdown - persist state and cleanup
   */
  protected async onShutdown(): Promise<void> {
    // Serialize runs for persistence
    const runsToSave = Array.from(this.runs.values()).map(run => ({
      ...run,
      stages: Object.fromEntries(run.stages),
    }));
    await this.saveState('active_runs', runsToSave);

    // Shutdown child agents
    if (this.triageAgent) await this.triageAgent.shutdown();
    if (this.coderAgent) await this.coderAgent.shutdown();
    if (this.reviewerAgent) await this.reviewerAgent.shutdown();
  }

  /**
   * Process incoming task
   */
  protected async processTask(payload: TaskRequestPayload): Promise<PipelineResponse> {
    const request = PipelineRequestSchema.parse(payload.input);
    return this.runPipeline(request);
  }

  /**
   * Run the full SWE pipeline
   */
  async runPipeline(request: PipelineRequest): Promise<PipelineResponse> {
    const run = this.createRun(request);
    this.runs.set(run.id, run);

    try {
      run.status = 'running';

      // Determine which stages to run based on pipeline type
      const stagesToRun = this.getStagesToRun(request.type);

      for (const stage of stagesToRun) {
        // Check if we should skip this stage
        if (this.shouldSkipStage(run, stage, request)) {
          this.recordStageResult(run, stage, 'skipped');
          continue;
        }

        run.currentStage = stage;
        const stageResult = await this.executeStage(run, stage, request);

        if (stageResult.status === 'failed') {
          run.status = 'failed';
          run.error = stageResult.error;
          break;
        }

        if (stageResult.status === 'blocked' || stageResult.status === 'waiting_approval') {
          // Pipeline paused - human intervention needed
          break;
        }
      }

      if (run.status === 'running') {
        run.status = 'completed';
      }

      run.completedAt = Date.now();
      return this.buildResponse(run);

    } catch (error) {
      run.status = 'failed';
      run.error = error instanceof Error ? error.message : String(error);
      run.completedAt = Date.now();
      return this.buildResponse(run);
    }
  }

  /**
   * Create a new pipeline run
   */
  private createRun(request: PipelineRequest): PipelineRun {
    return {
      id: request.pipelineId,
      request,
      status: 'pending',
      currentStage: null,
      stages: new Map(),
      issues: [],
      plans: [],
      fixes: [],
      verdicts: [],
      docs: [],
      totalTokens: { input: 0, output: 0 },
      startedAt: Date.now(),
    };
  }

  /**
   * Get stages to run based on pipeline type
   */
  private getStagesToRun(type: PipelineRequest['type']): PipelineStage[] {
    switch (type) {
      case 'full_audit':
        return STAGE_ORDER;
      case 'targeted_fix':
        return ['plans', 'fixes', 'qa', 'docs'];
      case 'security_scan':
        return ['audit', 'issues'];
      case 'docs_refresh':
        return ['docs'];
      case 'test_coverage':
        return ['audit', 'issues', 'plans', 'fixes', 'qa'];
      case 'migration':
        return STAGE_ORDER;
      default:
        return STAGE_ORDER;
    }
  }

  /**
   * Check if a stage should be skipped
   */
  private shouldSkipStage(run: PipelineRun, stage: PipelineStage, request: PipelineRequest): boolean {
    // Skip if no issues found and we're past audit
    if (stage !== 'audit' && stage !== 'issues' && run.issues.length === 0) {
      return true;
    }

    // Skip docs if pipeline type doesn't need them
    if (stage === 'docs' && request.type === 'security_scan') {
      return true;
    }

    return false;
  }

  /**
   * Execute a single pipeline stage
   */
  private async executeStage(
    run: PipelineRun,
    stage: PipelineStage,
    request: PipelineRequest
  ): Promise<PipelineStageResult> {
    const result: PipelineStageResult = {
      stage,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
    };

    try {
      switch (stage) {
        case 'audit':
          await this.executeAuditStage(run, request);
          break;
        case 'issues':
          await this.executeIssuesStage(run, request);
          break;
        case 'plans':
          await this.executePlansStage(run, request);
          break;
        case 'fixes':
          await this.executeFixesStage(run, request);
          break;
        case 'qa':
          await this.executeQAStage(run, request);
          break;
        case 'docs':
          await this.executeDocsStage(run, request);
          break;
      }

      result.status = 'completed';
      result.completedAt = new Date().toISOString();
      result.durationMs = Date.now() - new Date(result.startedAt!).getTime();

    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
      result.completedAt = new Date().toISOString();
      result.durationMs = Date.now() - new Date(result.startedAt!).getTime();
    }

    run.stages.set(stage, result);
    return result;
  }

  /**
   * Record a stage result without executing
   */
  private recordStageResult(run: PipelineRun, stage: PipelineStage, status: StageStatus): void {
    run.stages.set(stage, {
      stage,
      status,
    });
  }

  // =========================================================================
  // Stage Implementations
  // =========================================================================

  /**
   * AUDIT stage - scan codebase for issues
   */
  private async executeAuditStage(run: PipelineRun, request: PipelineRequest): Promise<void> {
    const triage = await this.getTriageAgent();

    const auditRequest = {
      taskType: 'audit' as const,
      repo: request.repo,
      branch: request.branch,
      targets: request.targets,
      riskTier: request.maxRiskTier,
    };

    const message = this.createTaskMessage(triage.agentId, auditRequest);
    const response = await triage.handleMessage(message);

    if (response.payload.success && response.payload.output) {
      const output = response.payload.output as { issues?: IssueSpec[]; filesScanned?: number };
      run.issues = output.issues || [];
      this.addTokens(run, response.payload.tokensUsed);
    } else {
      throw new Error(response.payload.error || 'Audit stage failed');
    }
  }

  /**
   * ISSUES stage - refine and categorize issues
   */
  private async executeIssuesStage(run: PipelineRun, request: PipelineRequest): Promise<void> {
    // Issues are generated in audit stage
    // This stage filters and prioritizes them

    // Filter by risk tier
    run.issues = run.issues.filter(issue => {
      const issueTier = issue.riskTier || 'R1';
      return meetsRiskTier(request.maxRiskTier, issueTier);
    });

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    run.issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Filter by specific issue IDs if provided
    if (request.issueIds && request.issueIds.length > 0) {
      run.issues = run.issues.filter(issue => request.issueIds!.includes(issue.id));
    }
  }

  /**
   * PLANS stage - create fix plans for each issue
   */
  private async executePlansStage(run: PipelineRun, request: PipelineRequest): Promise<void> {
    const coder = await this.getCoderAgent();

    for (const issue of run.issues) {
      // Check token budget
      if (request.tokenBudget && run.totalTokens.input + run.totalTokens.output >= request.tokenBudget) {
        break;
      }

      const planRequest = {
        taskType: 'plan' as const,
        issue,
        repoContext: request.context as { primaryLanguage?: string; frameworks?: string[] },
        riskTier: issue.riskTier || 'R1',
      };

      const message = this.createTaskMessage(coder.agentId, planRequest);
      const response = await coder.handleMessage(message);

      if (response.payload.success && response.payload.output) {
        const output = response.payload.output as { plan?: FixPlan };
        if (output.plan) {
          run.plans.push(output.plan);
        }
        this.addTokens(run, response.payload.tokensUsed);
      }
    }
  }

  /**
   * FIXES stage - implement fixes based on plans
   */
  private async executeFixesStage(run: PipelineRun, request: PipelineRequest): Promise<void> {
    const coder = await this.getCoderAgent();

    for (const plan of run.plans) {
      // Check risk tier - require approval for R2+
      if (meetsRiskTier(plan.riskTier, 'R2') && !meetsRiskTier(request.autoApproveTier, plan.riskTier)) {
        // Would need approval - skip for now
        continue;
      }

      const issue = run.issues.find(i => i.id === plan.issueId);
      if (!issue) continue;

      const fixRequest = {
        taskType: 'fix' as const,
        plan,
        issue,
        riskTier: plan.riskTier,
        dryRun: !meetsRiskTier(request.autoApproveTier, plan.riskTier),
      };

      const message = this.createTaskMessage(coder.agentId, fixRequest);
      const response = await coder.handleMessage(message);

      if (response.payload.success && response.payload.output) {
        const output = response.payload.output as { result?: FixResult };
        if (output.result) {
          run.fixes.push(output.result);
        }
        this.addTokens(run, response.payload.tokensUsed);
      }
    }
  }

  /**
   * QA stage - verify fixes with tests
   */
  private async executeQAStage(run: PipelineRun, _request: PipelineRequest): Promise<void> {
    const reviewer = await this.getReviewerAgent();

    for (const fix of run.fixes) {
      if (!fix.success) continue;

      const plan = run.plans.find(p => p.id === fix.planId);
      const issue = run.issues.find(i => i.id === fix.issueId);
      if (!plan || !issue) continue;

      const qaRequest = {
        taskType: 'qa' as const,
        fixResult: fix,
        issue,
        plan,
        runTests: true,
        runLint: true,
        runTypeCheck: true,
        riskTier: plan.riskTier,
      };

      const message = this.createTaskMessage(reviewer.agentId, qaRequest);
      const response = await reviewer.handleMessage(message);

      if (response.payload.success && response.payload.output) {
        const output = response.payload.output as { verdict?: QAVerdict };
        if (output.verdict) {
          run.verdicts.push(output.verdict);
        }
        this.addTokens(run, response.payload.tokensUsed);
      }
    }
  }

  /**
   * DOCS stage - update documentation
   */
  private async executeDocsStage(run: PipelineRun, _request: PipelineRequest): Promise<void> {
    const coder = await this.getCoderAgent();

    // Only generate docs for successful fixes
    const successfulFixes = run.fixes.filter(f => f.success);
    if (successfulFixes.length === 0) return;

    const docsRequest = {
      taskType: 'docs' as const,
      issues: run.issues.filter(i => successfulFixes.some(f => f.issueId === i.id)),
      fixes: successfulFixes,
      docTypes: ['changelog', 'readme'] as const,
      riskTier: 'R1' as RiskTier,
    };

    const message = this.createTaskMessage(coder.agentId, docsRequest);
    const response = await coder.handleMessage(message);

    if (response.payload.success && response.payload.output) {
      const output = response.payload.output as { updates?: DocUpdate[] };
      if (output.updates) {
        run.docs.push(...output.updates);
      }
      this.addTokens(run, response.payload.tokensUsed);
    }
  }

  // =========================================================================
  // Agent Management
  // =========================================================================

  private async getTriageAgent(): Promise<TriageAgent> {
    if (!this.triageAgent) {
      this.triageAgent = new TriageAgent();
      await this.triageAgent.initialize();
    }
    return this.triageAgent;
  }

  private async getCoderAgent(): Promise<CoderAgent> {
    if (!this.coderAgent) {
      this.coderAgent = new CoderAgent();
      await this.coderAgent.initialize();
    }
    return this.coderAgent;
  }

  private async getReviewerAgent(): Promise<ReviewerAgent> {
    if (!this.reviewerAgent) {
      this.reviewerAgent = new ReviewerAgent();
      await this.reviewerAgent.initialize();
    }
    return this.reviewerAgent;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Create a task message for an agent
   */
  private createTaskMessage(toAgentId: string, input: unknown) {
    // Cast to satisfy A2AMessage type - agentId is always a valid SPIFFE ID
    return {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: this.agentId,
      to: toAgentId as `spiffe://intent.solutions/agent/${string}`,
      type: 'task_request' as const,
      payload: {
        taskType: (input as { taskType: string }).taskType,
        input,
      },
      timestamp: Date.now(),
      priority: 'normal' as const,
    };
  }

  /**
   * Add token usage to run totals
   */
  private addTokens(run: PipelineRun, tokens?: { input: number; output: number }): void {
    if (tokens) {
      run.totalTokens.input += tokens.input;
      run.totalTokens.output += tokens.output;
    }
  }

  /**
   * Build the final pipeline response
   */
  private buildResponse(run: PipelineRun): PipelineResponse {
    const successfulFixes = run.fixes.filter(f => f.success).length;
    const failedFixes = run.fixes.filter(f => !f.success).length;
    const approvedVerdicts = run.verdicts.filter(v => v.verdict === 'approved').length;

    return {
      pipelineId: run.id,
      status: run.status === 'completed' ? 'completed' :
              run.status === 'failed' ? 'failed' :
              run.status === 'cancelled' ? 'cancelled' : 'partial',
      stages: Array.from(run.stages.values()),
      issues: run.issues,
      plans: run.plans,
      fixes: run.fixes,
      verdicts: run.verdicts,
      docs: run.docs,
      summary: {
        totalIssues: run.issues.length,
        issuesFixed: successfulFixes,
        issuesFailed: failedFixes,
        issuesSkipped: run.issues.length - run.plans.length,
        testsRun: run.verdicts.length,
        testsPassed: approvedVerdicts,
        docsUpdated: run.docs.length,
      },
      totalTokens: run.totalTokens,
      totalDurationMs: (run.completedAt || Date.now()) - run.startedAt,
      error: run.error,
    };
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Get run status
   */
  async getRunStatus(pipelineId: string): Promise<PipelineRun | null> {
    return this.runs.get(pipelineId) || null;
  }

  /**
   * List all runs
   */
  async listRuns(status?: PipelineRun['status']): Promise<PipelineRun[]> {
    const runs = Array.from(this.runs.values());
    if (status) {
      return runs.filter(r => r.status === status);
    }
    return runs;
  }

  /**
   * Cancel a running pipeline
   */
  async cancelRun(pipelineId: string): Promise<boolean> {
    const run = this.runs.get(pipelineId);
    if (run && run.status === 'running') {
      run.status = 'cancelled';
      run.completedAt = Date.now();
      return true;
    }
    return false;
  }
}

/**
 * Create a Foreman Agent instance
 */
export function createForemanAgent(): ForemanAgent {
  return new ForemanAgent();
}
