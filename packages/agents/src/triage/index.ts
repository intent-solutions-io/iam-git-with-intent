/**
 * Triage Agent for Git With Intent
 *
 * Classifies incoming PRs and merge conflicts by complexity.
 * Routes to appropriate handler: auto-resolve, agent-resolve, or human-required.
 *
 * Model: Gemini 2.0 Flash (fast, cheap)
 */

import { BaseAgent, type AgentConfig } from '../base/agent.js';
import { type TaskRequestPayload, MODELS, type IssueMetadata } from '@gwi/core';
import type { PRMetadata, ConflictInfo, ComplexityScore, RouteDecision } from '@gwi/core';

/**
 * Triage input - PR to analyze
 */
export interface TriageInput {
  prMetadata: PRMetadata;
  /** Conflicts for this PR (fetched separately via PRStore.getConflicts) */
  conflicts?: ConflictInfo[];
}

/**
 * Triage input for issues (issue-to-code workflow)
 */
export interface IssueTriageInput {
  issue: IssueMetadata;
  /** Optional repo context for better assessment */
  repoContext?: {
    primaryLanguage?: string;
    frameworks?: string[];
    codebaseSize?: 'small' | 'medium' | 'large';
  };
}

/**
 * Triage output - analysis results
 */
export interface TriageOutput {
  /** Overall complexity score */
  overallComplexity: ComplexityScore;
  /** Per-file complexity */
  fileComplexities: Array<{
    file: string;
    complexity: ComplexityScore;
    reason: string;
  }>;
  /** Routing decision */
  routeDecision: RouteDecision;
  /** Risk assessment */
  riskLevel: 'low' | 'medium' | 'high';
  /** Estimated resolution time in seconds */
  estimatedTimeSec: number;
  /** Explanation for the decision */
  explanation: string;
}

/**
 * Triage agent configuration
 */
const TRIAGE_CONFIG: AgentConfig = {
  name: 'triage',
  description: 'Classifies PRs and merge conflicts by complexity, routes to appropriate handler',
  capabilities: ['triage', 'complexity-scoring', 'routing'],
  defaultModel: {
    provider: 'google',
    model: MODELS.google.flash,
    maxTokens: 2048,
  },
};

/**
 * System prompt for triage analysis
 */
const TRIAGE_SYSTEM_PROMPT = `You are a Triage Agent for Git With Intent, an AI-powered DevOps automation platform.

Your role is to analyze pull requests and merge conflicts to:
1. Score complexity (1-10 scale)
2. Assess risk level
3. Route to appropriate handler

## Complexity Scoring Guide

1-3 (Low):
- Import ordering conflicts
- Formatting differences
- Simple additions (both sides add different code)
- No semantic conflicts

4-6 (Medium):
- Logic modifications in small functions
- Variable renames with cascading changes
- Configuration changes
- Test file conflicts

7-8 (High):
- Business logic conflicts
- API contract changes
- Multiple files with interdependencies
- Database schema changes

9-10 (Critical):
- Security-sensitive code
- Financial calculations
- Authentication/authorization logic
- Requires domain expertise

## Routing Decision

- "auto-resolve": Complexity 1-3, no semantic conflicts
- "agent-resolve": Complexity 4-7, agent can handle with human approval
- "human-required": Complexity 8-10, needs human expertise

## Output Format

Respond with a JSON object matching the TriageOutput interface. Be concise but thorough.`;

/**
 * System prompt for issue triage (issue-to-code workflow)
 */
const ISSUE_TRIAGE_SYSTEM_PROMPT = `You are a Triage Agent for Git With Intent, an AI-powered DevOps automation platform.

Your role is to analyze GitHub issues and determine how complex the implementation will be:
1. Score complexity (1-10 scale)
2. Assess risk level
3. Route to appropriate handler

## Complexity Scoring Guide for Issues

1-3 (Low - Simple Implementation):
- Add a single function or endpoint
- Minor UI changes
- Configuration updates
- Simple bug fixes with clear solutions
- Documentation updates

4-6 (Medium - Moderate Implementation):
- New feature spanning 2-5 files
- Refactoring existing functionality
- API changes with backward compatibility
- Test additions
- Integration with existing systems

7-8 (High - Complex Implementation):
- New feature spanning 5+ files
- Architecture changes
- Database schema changes
- Multi-service coordination
- Performance optimization

9-10 (Critical - Expert Required):
- Security-critical implementations
- Financial/payment processing
- Core authentication changes
- Breaking API changes
- Complex migrations

## Routing Decision

- "auto-resolve": Complexity 1-3, straightforward implementation
- "agent-resolve": Complexity 4-7, agent can implement with human review
- "human-required": Complexity 8-10, needs human design and oversight

## Output Format

Respond with a JSON object:
{
  "overallComplexity": <1-10>,
  "fileComplexities": [{"file": "likely_affected_file.ts", "complexity": <1-10>, "reason": "..."}],
  "routeDecision": "auto-resolve" | "agent-resolve" | "human-required",
  "riskLevel": "low" | "medium" | "high",
  "estimatedTimeSec": <estimated seconds to implement>,
  "explanation": "Brief explanation of the assessment"
}`;

/**
 * Triage Agent Implementation
 */
export class TriageAgent extends BaseAgent {
  /** History of triage decisions for learning */
  private triageHistory: TriageOutput[] = [];

  constructor() {
    super(TRIAGE_CONFIG);
  }

  /**
   * Initialize - load history from state
   */
  protected async onInitialize(): Promise<void> {
    const history = await this.loadState<TriageOutput[]>('triage_history');
    if (history) {
      this.triageHistory = history;
    }
  }

  /**
   * Shutdown - save history to state
   */
  protected async onShutdown(): Promise<void> {
    await this.saveState('triage_history', this.triageHistory);
  }

  /**
   * Process a triage request
   * Supports both PR triage (pr-resolve) and issue triage (issue-to-code)
   */
  protected async processTask(payload: TaskRequestPayload): Promise<TriageOutput> {
    if (payload.taskType !== 'triage') {
      throw new Error(`Unsupported task type: ${payload.taskType}`);
    }

    const input = payload.input as TriageInput | IssueTriageInput | unknown;

    // Check if this is an issue triage (issue-to-code workflow)
    if (input && typeof input === 'object' && 'issue' in input) {
      const issueInput = input as IssueTriageInput;
      return this.triageIssue(issueInput.issue, issueInput.repoContext);
    }

    // Otherwise, treat as PR triage
    const prInput = input as TriageInput;
    if (!prInput.prMetadata) {
      // Handle raw issue passed from orchestrator (older flow)
      if ('title' in (input as Record<string, unknown>)) {
        return this.triageIssue(input as unknown as IssueMetadata);
      }
      throw new Error('Invalid triage input: missing prMetadata or issue');
    }
    return this.triage(prInput.prMetadata, prInput.conflicts ?? []);
  }

  /**
   * Analyze a PR and return triage results
   */
  async triage(pr: PRMetadata, conflicts: ConflictInfo[] = []): Promise<TriageOutput> {
    // Build context for the LLM
    const context = this.buildContext(pr, conflicts);

    // Call the model
    const response = await this.chat({
      model: this.config.defaultModel,
      messages: [
        { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
        { role: 'user', content: context },
      ],
      temperature: 0.3, // Lower temperature for consistent scoring
    });

    // Parse the response
    const result = this.parseResponse(response, pr, conflicts);

    // Record in history
    this.triageHistory.push(result);

    // Keep history bounded
    if (this.triageHistory.length > 100) {
      this.triageHistory = this.triageHistory.slice(-100);
    }

    // Persist to state
    await this.saveState('triage_history', this.triageHistory);

    return result;
  }

  /**
   * Analyze an issue for the issue-to-code workflow
   */
  async triageIssue(
    issue: IssueMetadata,
    repoContext?: IssueTriageInput['repoContext']
  ): Promise<TriageOutput> {
    // Build context for the LLM
    const context = this.buildIssueContext(issue, repoContext);

    // Call the model
    const response = await this.chat({
      model: this.config.defaultModel,
      messages: [
        { role: 'system', content: ISSUE_TRIAGE_SYSTEM_PROMPT },
        { role: 'user', content: context },
      ],
      temperature: 0.3,
    });

    // Parse the response
    const result = this.parseIssueResponse(response, issue);

    // Record in history
    this.triageHistory.push(result);

    // Keep history bounded
    if (this.triageHistory.length > 100) {
      this.triageHistory = this.triageHistory.slice(-100);
    }

    // Persist to state
    await this.saveState('triage_history', this.triageHistory);

    return result;
  }

  /**
   * Build context string for issue triage
   */
  private buildIssueContext(
    issue: IssueMetadata,
    repoContext?: IssueTriageInput['repoContext']
  ): string {
    let context = `## Issue Analysis Request

**Issue URL:** ${issue.url}
**Issue #:** ${issue.number}
**Title:** ${issue.title}
**Author:** ${issue.author}
**Repository:** ${issue.repo.fullName}
**Labels:** ${issue.labels.join(', ') || 'none'}
**Assignees:** ${issue.assignees.join(', ') || 'unassigned'}

### Issue Description
${issue.body || 'No description provided'}
`;

    if (repoContext) {
      context += `
### Repository Context
- Primary Language: ${repoContext.primaryLanguage || 'unknown'}
- Frameworks: ${repoContext.frameworks?.join(', ') || 'none specified'}
- Codebase Size: ${repoContext.codebaseSize || 'unknown'}
`;
    }

    context += `
Please analyze this issue and provide your triage assessment as a JSON object.`;

    return context;
  }

  /**
   * Parse LLM response for issue triage
   */
  private parseIssueResponse(response: string, issue: IssueMetadata): TriageOutput {
    try {
      // Extract JSON from response (may be wrapped in markdown)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize the response
      return {
        overallComplexity: this.clampComplexity(parsed.overallComplexity ?? 5),
        fileComplexities: parsed.fileComplexities ?? [{
          file: 'estimated',
          complexity: this.clampComplexity(parsed.overallComplexity ?? 5),
          reason: 'Estimated from issue analysis',
        }],
        routeDecision: this.validateRouteDecision(parsed.routeDecision),
        riskLevel: this.validateRiskLevel(parsed.riskLevel),
        estimatedTimeSec: parsed.estimatedTimeSec ?? 300, // Default 5 min for issues
        explanation: parsed.explanation ?? 'No explanation provided',
      };
    } catch {
      // Fallback to heuristic-based assessment
      return this.heuristicIssueTriage(issue);
    }
  }

  /**
   * Heuristic-based issue triage when LLM parsing fails
   */
  private heuristicIssueTriage(issue: IssueMetadata): TriageOutput {
    let complexity = 5; // Default medium

    // Heuristics based on issue content
    const body = (issue.body || '').toLowerCase();
    const title = issue.title.toLowerCase();
    const text = `${title} ${body}`;

    // Simple indicators
    if (text.includes('typo') || text.includes('documentation')) complexity = 2;
    if (text.includes('bug') || text.includes('fix')) complexity = 4;
    if (text.includes('feature') || text.includes('add')) complexity = 5;
    if (text.includes('refactor') || text.includes('redesign')) complexity = 6;
    if (text.includes('security') || text.includes('auth')) complexity = 8;
    if (text.includes('migration') || text.includes('database')) complexity = 7;
    if (text.includes('urgent') || text.includes('critical')) complexity += 1;

    // Label-based adjustments
    if (issue.labels.some(l => l.includes('good first issue'))) complexity = Math.min(complexity, 3);
    if (issue.labels.some(l => l.includes('help wanted'))) complexity = Math.max(complexity, 5);
    if (issue.labels.some(l => l.includes('bug'))) complexity = Math.max(complexity - 1, 1);
    if (issue.labels.some(l => l.includes('enhancement'))) complexity = Math.max(complexity, 4);

    const overallComplexity = this.clampComplexity(complexity);

    // Determine route based on complexity
    let routeDecision: RouteDecision;
    if (overallComplexity <= 3) {
      routeDecision = 'auto-resolve';
    } else if (overallComplexity <= 7) {
      routeDecision = 'agent-resolve';
    } else {
      routeDecision = 'human-required';
    }

    return {
      overallComplexity,
      fileComplexities: [{
        file: 'estimated',
        complexity: overallComplexity,
        reason: 'Heuristic assessment from issue content',
      }],
      routeDecision,
      riskLevel: overallComplexity <= 3 ? 'low' : overallComplexity <= 6 ? 'medium' : 'high',
      estimatedTimeSec: overallComplexity * 60, // Rough estimate: complexity * 1 minute
      explanation: `Heuristic assessment for issue #${issue.number}: ${issue.title.slice(0, 50)}`,
    };
  }

  /**
   * Build context string for the LLM
   */
  private buildContext(pr: PRMetadata, conflicts: ConflictInfo[]): string {
    const conflictDetails = conflicts.map((c) => ({
      file: c.file,
      complexity: c.complexity,
      hasMarkers: !!c.conflictMarkers,
      sizeDelta: c.oursContent.length + c.theirsContent.length,
    }));

    return `## Pull Request Analysis Request

**PR URL:** ${pr.url}
**Title:** ${pr.title}
**Author:** ${pr.author}
**Base Branch:** ${pr.baseBranch}
**Head Branch:** ${pr.headBranch}

**Changes:**
- Files Changed: ${pr.filesChanged}
- Additions: ${pr.additions}
- Deletions: ${pr.deletions}

**Has Conflicts:** ${pr.hasConflicts}
**Conflicts (${conflicts.length} files):**
${JSON.stringify(conflictDetails, null, 2)}

**Conflict Details:**
${conflicts.map((c) => `
### ${c.file}
\`\`\`
${c.conflictMarkers.slice(0, 2000)}${c.conflictMarkers.length > 2000 ? '\n... (truncated)' : ''}
\`\`\`
`).join('\n')}

Please analyze this PR and provide your triage assessment as a JSON object.`;
  }

  /**
   * Parse LLM response into TriageOutput
   */
  private parseResponse(response: string, pr: PRMetadata, conflicts: ConflictInfo[]): TriageOutput {
    try {
      // Extract JSON from response (may be wrapped in markdown)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize the response
      return {
        overallComplexity: this.clampComplexity(parsed.overallComplexity ?? 5),
        fileComplexities: parsed.fileComplexities ?? conflicts.map((c) => ({
          file: c.file,
          complexity: c.complexity,
          reason: 'Default assessment',
        })),
        routeDecision: this.validateRouteDecision(parsed.routeDecision),
        riskLevel: this.validateRiskLevel(parsed.riskLevel),
        estimatedTimeSec: parsed.estimatedTimeSec ?? 60,
        explanation: parsed.explanation ?? 'No explanation provided',
      };
    } catch {
      // Fallback to heuristic-based assessment
      return this.heuristicTriage(pr, conflicts);
    }
  }

  /**
   * Heuristic-based triage when LLM parsing fails
   */
  private heuristicTriage(_pr: PRMetadata, conflicts: ConflictInfo[]): TriageOutput {
    // Calculate complexity from conflict characteristics
    let totalComplexity = 0;
    const fileComplexities = conflicts.map((c) => {
      const complexity = this.calculateFileComplexity(c);
      totalComplexity += complexity;
      return {
        file: c.file,
        complexity,
        reason: this.getComplexityReason(c, complexity),
      };
    });

    const overallComplexity = this.clampComplexity(
      Math.ceil(totalComplexity / Math.max(conflicts.length, 1))
    );

    // Determine route based on complexity
    let routeDecision: RouteDecision;
    if (overallComplexity <= 3) {
      routeDecision = 'auto-resolve';
    } else if (overallComplexity <= 7) {
      routeDecision = 'agent-resolve';
    } else {
      routeDecision = 'human-required';
    }

    // Estimate time
    const estimatedTimeSec = overallComplexity * 30 + conflicts.length * 10;

    return {
      overallComplexity,
      fileComplexities,
      routeDecision,
      riskLevel: overallComplexity <= 3 ? 'low' : overallComplexity <= 6 ? 'medium' : 'high',
      estimatedTimeSec,
      explanation: `Heuristic assessment based on ${conflicts.length} conflicts with average complexity ${overallComplexity}`,
    };
  }

  /**
   * Calculate complexity score for a single file
   */
  private calculateFileComplexity(conflict: ConflictInfo): ComplexityScore {
    let score = 1;

    // Size-based scoring
    const totalSize = conflict.oursContent.length + conflict.theirsContent.length;
    if (totalSize > 1000) score += 1;
    if (totalSize > 5000) score += 2;
    if (totalSize > 10000) score += 2;

    // Marker-based scoring (multiple conflicts = more complex)
    const markerCount = (conflict.conflictMarkers.match(/<<<<<<</g) || []).length;
    score += Math.min(markerCount - 1, 3);

    // File type scoring
    if (conflict.file.includes('test')) score -= 1;
    if (conflict.file.includes('config')) score += 1;
    if (conflict.file.includes('security') || conflict.file.includes('auth')) score += 3;
    if (conflict.file.includes('migration')) score += 2;

    return this.clampComplexity(score);
  }

  /**
   * Get explanation for complexity score
   */
  private getComplexityReason(_conflict: ConflictInfo, complexity: ComplexityScore): string {
    if (complexity <= 3) {
      return 'Simple conflict, likely formatting or imports';
    } else if (complexity <= 6) {
      return 'Moderate conflict requiring careful resolution';
    } else {
      return 'Complex conflict requiring domain expertise';
    }
  }

  /**
   * Clamp value to valid complexity range
   */
  private clampComplexity(value: number): ComplexityScore {
    return Math.min(10, Math.max(1, Math.round(value))) as ComplexityScore;
  }

  /**
   * Validate route decision
   */
  private validateRouteDecision(value: unknown): RouteDecision {
    if (value === 'auto-resolve' || value === 'agent-resolve' || value === 'human-required') {
      return value;
    }
    return 'agent-resolve';
  }

  /**
   * Validate risk level
   */
  private validateRiskLevel(value: unknown): 'low' | 'medium' | 'high' {
    if (value === 'low' || value === 'medium' || value === 'high') {
      return value;
    }
    return 'medium';
  }
}

/**
 * Create a Triage Agent instance
 */
export function createTriageAgent(): TriageAgent {
  return new TriageAgent();
}
