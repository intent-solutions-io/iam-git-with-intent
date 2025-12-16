/**
 * Triage Agent for Git With Intent
 *
 * Classifies incoming PRs and merge conflicts by complexity.
 * Routes to appropriate handler: auto-resolve, agent-resolve, or human-required.
 *
 * Model: Gemini 2.0 Flash (fast, cheap)
 */

import { BaseAgent, type AgentConfig } from '../base/agent.js';
import { type TaskRequestPayload, MODELS } from '@gwi/core';
import type { PRMetadata, ConflictInfo, ComplexityScore, RouteDecision } from '@gwi/core';

/**
 * Triage input - PR to analyze
 */
export interface TriageInput {
  prMetadata: PRMetadata;
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
 * Triage Agent Implementation
 */
export class TriageAgent extends BaseAgent {
  /** History of triage decisions for learning */
  private triageHistory: TriageOutput[] = [];

  constructor() {
    super(TRIAGE_CONFIG);
  }

  /**
   * Initialize - load history from AgentFS
   */
  protected async onInitialize(): Promise<void> {
    const history = await this.loadState<TriageOutput[]>('triage_history');
    if (history) {
      this.triageHistory = history;
    }
  }

  /**
   * Shutdown - save history to AgentFS
   */
  protected async onShutdown(): Promise<void> {
    await this.saveState('triage_history', this.triageHistory);
  }

  /**
   * Process a triage request
   */
  protected async processTask(payload: TaskRequestPayload): Promise<TriageOutput> {
    if (payload.taskType !== 'triage') {
      throw new Error(`Unsupported task type: ${payload.taskType}`);
    }

    const input = payload.input as TriageInput;
    return this.triage(input.prMetadata);
  }

  /**
   * Analyze a PR and return triage results
   */
  async triage(pr: PRMetadata): Promise<TriageOutput> {
    // Build context for the LLM
    const context = this.buildContext(pr);

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
    const result = this.parseResponse(response, pr);

    // Record in history
    this.triageHistory.push(result);

    // Keep history bounded
    if (this.triageHistory.length > 100) {
      this.triageHistory = this.triageHistory.slice(-100);
    }

    // Persist to AgentFS
    await this.saveState('triage_history', this.triageHistory);

    return result;
  }

  /**
   * Build context string for the LLM
   */
  private buildContext(pr: PRMetadata): string {
    const conflictDetails = pr.conflicts.map((c) => ({
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

**Conflicts (${pr.conflicts.length} files):**
${JSON.stringify(conflictDetails, null, 2)}

**Conflict Details:**
${pr.conflicts.map((c) => `
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
  private parseResponse(response: string, pr: PRMetadata): TriageOutput {
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
        fileComplexities: parsed.fileComplexities ?? pr.conflicts.map((c) => ({
          file: c.file,
          complexity: c.complexity,
          reason: 'Default assessment',
        })),
        routeDecision: this.validateRouteDecision(parsed.routeDecision),
        riskLevel: this.validateRiskLevel(parsed.riskLevel),
        estimatedTimeSec: parsed.estimatedTimeSec ?? 60,
        explanation: parsed.explanation ?? 'No explanation provided',
      };
    } catch (error) {
      // Fallback to heuristic-based assessment
      return this.heuristicTriage(pr);
    }
  }

  /**
   * Heuristic-based triage when LLM parsing fails
   */
  private heuristicTriage(pr: PRMetadata): TriageOutput {
    // Calculate complexity from conflict characteristics
    let totalComplexity = 0;
    const fileComplexities = pr.conflicts.map((c) => {
      const complexity = this.calculateFileComplexity(c);
      totalComplexity += complexity;
      return {
        file: c.file,
        complexity,
        reason: this.getComplexityReason(c, complexity),
      };
    });

    const overallComplexity = this.clampComplexity(
      Math.ceil(totalComplexity / Math.max(pr.conflicts.length, 1))
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
    const estimatedTimeSec = overallComplexity * 30 + pr.conflicts.length * 10;

    return {
      overallComplexity,
      fileComplexities,
      routeDecision,
      riskLevel: overallComplexity <= 3 ? 'low' : overallComplexity <= 6 ? 'medium' : 'high',
      estimatedTimeSec,
      explanation: `Heuristic assessment based on ${pr.conflicts.length} conflicts with average complexity ${overallComplexity}`,
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
