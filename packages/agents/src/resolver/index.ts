/**
 * Resolver Agent for Git With Intent
 *
 * [Task: git-with-intent-buy]
 *
 * Resolves merge conflicts using Claude Sonnet/Opus.
 * Selects model based on complexity from Triage.
 *
 * TRUE AGENT: Stateful (state), Autonomous, Collaborative (A2A)
 */

import { BaseAgent, type AgentConfig } from '../base/agent.js';
import { type TaskRequestPayload, MODELS } from '@gwi/core';
import type {
  ConflictInfo,
  ResolutionResult,
  ComplexityScore,
  PRMetadata,
} from '@gwi/core';

/**
 * Resolver input
 */
export interface ResolverInput {
  pr: PRMetadata;
  conflict: ConflictInfo;
  complexity: ComplexityScore;
}

/**
 * Resolver output
 */
export interface ResolverOutput {
  resolution: ResolutionResult;
  tokensUsed: { input: number; output: number };
}

/**
 * Resolution history entry for learning
 */
interface ResolutionHistoryEntry {
  file: string;
  strategy: string;
  success: boolean;
  complexity: ComplexityScore;
  timestamp: number;
}

/**
 * Resolver agent configuration
 */
const RESOLVER_CONFIG: AgentConfig = {
  name: 'resolver',
  description: 'Resolves merge conflicts using deep reasoning with Claude',
  capabilities: ['resolve-conflicts', 'explain-resolution', 'suggest-strategy'],
  defaultModel: {
    provider: 'anthropic',
    model: MODELS.anthropic.sonnet,
    maxTokens: 8192,
  },
};

/**
 * System prompt for conflict resolution
 */
const RESOLVER_SYSTEM_PROMPT = `You are the Resolver Agent for Git With Intent, an AI-powered DevOps automation platform.

Your role is to resolve merge conflicts intelligently by:
1. Understanding the intent of both sides
2. Analyzing the semantic meaning of changes
3. Producing a correct resolution that preserves both intents
4. Explaining your reasoning clearly

## Resolution Strategies

1. **merge-both**: Both changes are additive and compatible
   - Import additions from different modules
   - Independent function additions
   - Non-conflicting config additions

2. **accept-ours**: The head branch changes should take precedence
   - Head has newer/corrected logic
   - Head implements the intended feature

3. **accept-theirs**: The base branch changes should take precedence
   - Base has critical fixes
   - Head changes were experimental/reverted

4. **custom**: Manual merge required
   - Logic conflicts requiring understanding
   - Interleaved changes
   - Semantic conflicts

## Output Requirements

Respond with a JSON object:
{
  "resolvedContent": "// The fully resolved file content",
  "explanation": "Clear explanation of why this resolution is correct",
  "confidence": 85,  // 0-100 confidence score
  "strategy": "merge-both"  // or other strategy
}

## Critical Rules

1. NEVER lose code from either side unless it's truly conflicting
2. Preserve formatting conventions from the base branch
3. Maintain import ordering conventions
4. Test for syntax validity mentally before outputting
5. If confidence < 70, recommend human review`;

/**
 * Resolver Agent Implementation
 */
export class ResolverAgent extends BaseAgent {
  /** Resolution history for pattern learning */
  private history: ResolutionHistoryEntry[] = [];

  /** Successful patterns by file type */
  private patterns: Map<string, string[]> = new Map();

  constructor() {
    super(RESOLVER_CONFIG);
  }

  /**
   * Initialize - load history from state
   */
  protected async onInitialize(): Promise<void> {
    const history = await this.loadState<ResolutionHistoryEntry[]>('resolution_history');
    if (history) {
      this.history = history;
    }

    const patterns = await this.loadState<Record<string, string[]>>('patterns');
    if (patterns) {
      this.patterns = new Map(Object.entries(patterns));
    }
  }

  /**
   * Shutdown - persist state to state
   */
  protected async onShutdown(): Promise<void> {
    await this.saveState('resolution_history', this.history);
    await this.saveState('patterns', Object.fromEntries(this.patterns));
  }

  /**
   * Process a resolution request
   */
  protected async processTask(payload: TaskRequestPayload): Promise<ResolverOutput> {
    if (payload.taskType !== 'resolve') {
      throw new Error(`Unsupported task type: ${payload.taskType}`);
    }

    const input = payload.input as ResolverInput;
    return this.resolve(input.pr, input.conflict, input.complexity);
  }

  /**
   * Resolve a single conflict
   */
  async resolve(
    pr: PRMetadata,
    conflict: ConflictInfo,
    complexity: ComplexityScore
  ): Promise<ResolverOutput> {
    // Select model based on complexity
    const model = this.selectModel(complexity);

    // Build context
    const context = this.buildContext(pr, conflict);

    // Get relevant patterns from history
    const relevantPatterns = this.getRelevantPatterns(conflict.file);

    // Call the model
    const response = await this.chat({
      model,
      messages: [
        { role: 'system', content: RESOLVER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: this.buildPrompt(context, relevantPatterns),
        },
      ],
      temperature: 0.3, // Lower for consistency
    });

    // Parse and validate response
    const result = this.parseResponse(response, conflict);

    // Record in history
    this.recordResolution(conflict, result, complexity);

    return {
      resolution: result,
      tokensUsed: { input: 0, output: 0 }, // Enhancement: Track from model response
    };
  }

  /**
   * Select model based on complexity
   */
  private selectModel(complexity: ComplexityScore) {
    if (complexity <= 4) {
      return {
        provider: 'anthropic' as const,
        model: MODELS.anthropic.sonnet,
        maxTokens: 8192,
      };
    }
    // High complexity - use Opus
    return {
      provider: 'anthropic' as const,
      model: MODELS.anthropic.opus,
      maxTokens: 16384,
    };
  }

  /**
   * Build context for the model
   */
  private buildContext(pr: PRMetadata, conflict: ConflictInfo): string {
    return `## Merge Conflict Resolution Request

**PR:** ${pr.title}
**File:** ${conflict.file}
**Base Branch:** ${pr.baseBranch}
**Head Branch:** ${pr.headBranch}

### Conflict Markers

\`\`\`
${conflict.conflictMarkers}
\`\`\`

### Base Content (before conflict)
\`\`\`
${conflict.baseContent.slice(0, 3000)}${conflict.baseContent.length > 3000 ? '\n... (truncated)' : ''}
\`\`\`

### Ours (HEAD - ${pr.headBranch})
\`\`\`
${conflict.oursContent.slice(0, 3000)}${conflict.oursContent.length > 3000 ? '\n... (truncated)' : ''}
\`\`\`

### Theirs (${pr.baseBranch})
\`\`\`
${conflict.theirsContent.slice(0, 3000)}${conflict.theirsContent.length > 3000 ? '\n... (truncated)' : ''}
\`\`\``;
  }

  /**
   * Build the full prompt with patterns
   */
  private buildPrompt(context: string, patterns: string[]): string {
    let prompt = context;

    if (patterns.length > 0) {
      prompt += `\n\n### Similar Past Resolutions\n`;
      prompt += patterns.map((p, i) => `${i + 1}. ${p}`).join('\n');
    }

    prompt += `\n\nPlease analyze this conflict and provide your resolution as a JSON object.`;

    return prompt;
  }

  /**
   * Get relevant patterns from history
   */
  private getRelevantPatterns(file: string): string[] {
    const ext = file.split('.').pop() || '';
    return this.patterns.get(ext) || [];
  }

  /**
   * Parse model response into ResolutionResult
   */
  private parseResponse(response: string, conflict: ConflictInfo): ResolutionResult {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        file: conflict.file,
        resolvedContent: parsed.resolvedContent || '',
        explanation: parsed.explanation || 'No explanation provided',
        confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
        strategy: this.validateStrategy(parsed.strategy),
      };
    } catch (error) {
      // Fallback - return a low-confidence result requiring human review
      return {
        file: conflict.file,
        resolvedContent: '',
        explanation: `Failed to parse resolution: ${error instanceof Error ? error.message : 'Unknown error'}. Human review required.`,
        confidence: 0,
        strategy: 'custom',
      };
    }
  }

  /**
   * Validate strategy value
   */
  private validateStrategy(
    strategy: unknown
  ): 'merge-both' | 'accept-ours' | 'accept-theirs' | 'custom' {
    const valid = ['merge-both', 'accept-ours', 'accept-theirs', 'custom'];
    if (typeof strategy === 'string' && valid.includes(strategy)) {
      return strategy as ResolutionResult['strategy'];
    }
    return 'custom';
  }

  /**
   * Record resolution in history for learning
   */
  private recordResolution(
    conflict: ConflictInfo,
    result: ResolutionResult,
    complexity: ComplexityScore
  ): void {
    const entry: ResolutionHistoryEntry = {
      file: conflict.file,
      strategy: result.strategy,
      success: result.confidence >= 70,
      complexity,
      timestamp: Date.now(),
    };

    this.history.push(entry);

    // Keep history bounded
    if (this.history.length > 500) {
      this.history = this.history.slice(-500);
    }

    // Update patterns if successful
    if (entry.success) {
      const ext = conflict.file.split('.').pop() || 'unknown';
      const patterns = this.patterns.get(ext) || [];
      patterns.push(`${result.strategy}: ${result.explanation.slice(0, 100)}`);

      // Keep patterns bounded
      if (patterns.length > 10) {
        patterns.shift();
      }

      this.patterns.set(ext, patterns);
    }

    // Persist immediately (important for agent state)
    this.saveState('resolution_history', this.history);
    this.saveState('patterns', Object.fromEntries(this.patterns));
  }

  /**
   * Get resolution statistics
   */
  async getStats(): Promise<{
    total: number;
    successful: number;
    byStrategy: Record<string, number>;
  }> {
    const byStrategy: Record<string, number> = {};

    for (const entry of this.history) {
      byStrategy[entry.strategy] = (byStrategy[entry.strategy] || 0) + 1;
    }

    return {
      total: this.history.length,
      successful: this.history.filter((e) => e.success).length,
      byStrategy,
    };
  }
}

/**
 * Create a Resolver Agent instance
 */
export function createResolverAgent(): ResolverAgent {
  return new ResolverAgent();
}
