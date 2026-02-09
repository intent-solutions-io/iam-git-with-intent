/**
 * Slop Detector Agent
 *
 * Analyzes PRs for AI-generated low-quality patterns ("AI slop")
 * and assigns a slop score (0-100). Integrates with triage flow
 * to auto-flag or auto-close suspicious PRs.
 *
 * Model: Gemini 2.0 Flash (fast, cost-effective)
 */

import { BaseAgent, type AgentConfig } from '../base/agent.js';
import { type TaskRequestPayload, MODELS } from '@gwi/core';
import {
  type SlopAnalysisInput,
  type SlopAnalysisResult,
  type SlopSignal,
  type SlopThresholds,
  type SlopRecommendation,
  SlopAnalysisInputSchema,
  DEFAULT_THRESHOLDS,
} from './types.js';
import { analyzeLinguistic } from './analyzers/linguistic.js';
import { analyzeContributor, type ContributorContext } from './analyzers/contributor.js';
import { analyzeQuality } from './analyzers/quality.js';

/**
 * Slop detector agent configuration
 */
const SLOP_DETECTOR_CONFIG: AgentConfig = {
  name: 'slop-detector',
  description: 'Detects AI-generated low-quality PRs (AI slop) and assigns risk scores',
  capabilities: ['slop-detection', 'pr-quality', 'spam-detection'],
  defaultModel: {
    provider: 'google',
    model: MODELS.google.flash,
    maxTokens: 2048,
  },
};

/**
 * System prompt for LLM-assisted slop detection
 */
const SLOP_DETECTION_SYSTEM_PROMPT = `You are a Slop Detector Agent for Git With Intent, an AI-powered DevOps platform.

Your role is to analyze pull requests for signs of low-quality AI-generated content ("AI slop").
These are PRs that waste maintainer time with superficial changes that add noise, not value.

## What IS AI Slop
- Unnecessary documentation/comments that restate obvious code
- Cosmetic-only changes (formatting, whitespace) without substance
- Generic "improvements" that don't actually improve anything
- Templated PR descriptions with buzzwords but no specifics
- Changes from first-time contributors with no prior engagement

## What is NOT AI Slop
- Legitimate documentation improvements with actual value
- Code fixes even if small (typo in variable name affecting behavior)
- First-time contributors who engaged in issues first
- PRs that respond to actual issues or discussions

## Analysis Request

Given the signals already detected by rule-based analyzers, provide additional insight:

1. Are the detected signals genuine red flags or false positives?
2. Is there context that changes the interpretation?
3. What is your confidence in the overall assessment?

Respond with JSON:
{
  "adjustedScore": <0-100, your refined score>,
  "confidence": <0-1>,
  "falsePositives": ["signal_name", ...],
  "additionalConcerns": ["concern1", ...],
  "reasoning": "Brief explanation"
}`;

/**
 * Slop history entry for learning
 */
interface SlopHistoryEntry {
  prUrl: string;
  slopScore: number;
  recommendation: SlopRecommendation;
  timestamp: number;
}

/**
 * Slop Detector Agent Implementation
 */
export class SlopDetectorAgent extends BaseAgent {
  /** History of slop detections */
  private history: SlopHistoryEntry[] = [];

  /** Configurable thresholds */
  private thresholds: SlopThresholds = DEFAULT_THRESHOLDS;

  constructor(thresholds?: Partial<SlopThresholds>) {
    super(SLOP_DETECTOR_CONFIG);
    if (thresholds) {
      this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    }
  }

  /**
   * Initialize - load history from state
   */
  protected async onInitialize(): Promise<void> {
    const history = await this.loadState<SlopHistoryEntry[]>('slop_history');
    if (history) {
      this.history = history;
    }
  }

  /**
   * Shutdown - save history to state
   */
  protected async onShutdown(): Promise<void> {
    await this.saveState('slop_history', this.history);
  }

  /**
   * Process a slop detection request via A2A
   */
  protected async processTask(payload: TaskRequestPayload): Promise<SlopAnalysisResult> {
    if (payload.taskType !== 'slop-detection') {
      throw new Error(`Unsupported task type: ${payload.taskType}`);
    }

    // Validate input
    const parseResult = SlopAnalysisInputSchema.safeParse(payload.input);
    if (!parseResult.success) {
      throw new Error(`Invalid slop analysis input: ${parseResult.error.message}`);
    }

    return this.analyze(parseResult.data);
  }

  /**
   * Analyze a PR for AI slop
   */
  async analyze(
    input: SlopAnalysisInput,
    contributorContext?: ContributorContext
  ): Promise<SlopAnalysisResult> {
    // Run all analyzers
    const linguisticResult = analyzeLinguistic(input);
    const contributorResult = analyzeContributor(input, contributorContext);
    const qualityResult = analyzeQuality(input);

    // Combine signals
    const allSignals: SlopSignal[] = [
      ...linguisticResult.signals,
      ...contributorResult.signals,
      ...qualityResult.signals,
    ];

    // Calculate raw score (sum of weights, capped at 100)
    const rawScore = Math.min(
      100,
      linguisticResult.totalWeight +
      contributorResult.totalWeight +
      qualityResult.totalWeight
    );

    // Determine if we need LLM refinement
    // Only use LLM for borderline cases (30-75) to save costs
    let finalScore = rawScore;
    let confidence = this.calculateConfidence(allSignals, rawScore);
    let reasoning = this.generateReasoning(allSignals, rawScore);

    if (rawScore >= 30 && rawScore <= 75 && allSignals.length > 0) {
      try {
        const llmResult = await this.refineWithLLM(input, allSignals, rawScore);
        finalScore = llmResult.adjustedScore;
        confidence = llmResult.confidence;
        reasoning = llmResult.reasoning;

        // Remove false positives from signals
        const filteredSignals = allSignals.filter(
          s => !llmResult.falsePositives.includes(s.signal)
        );
        allSignals.length = 0;
        allSignals.push(...filteredSignals);

        // Add any additional concerns as signals
        for (const concern of llmResult.additionalConcerns) {
          allSignals.push({
            type: 'quality',
            signal: 'llm_concern',
            weight: 5,
            evidence: concern,
          });
        }
      } catch {
        // LLM failed, use rule-based score
        reasoning += ' (LLM refinement failed, using rule-based analysis)';
      }
    }

    // Determine recommendation
    const recommendation = this.determineRecommendation(finalScore);

    // Build result
    const result: SlopAnalysisResult = {
      slopScore: Math.round(finalScore),
      confidence,
      signals: allSignals,
      recommendation,
      reasoning,
    };

    // Record in history
    this.recordHistory(input.prUrl, result);

    return result;
  }

  /**
   * Use LLM to refine the score for borderline cases
   */
  private async refineWithLLM(
    input: SlopAnalysisInput,
    signals: SlopSignal[],
    rawScore: number
  ): Promise<{
    adjustedScore: number;
    confidence: number;
    falsePositives: string[];
    additionalConcerns: string[];
    reasoning: string;
  }> {
    const context = `## PR Analysis

**URL:** ${input.prUrl}
**Title:** ${input.prTitle}
**Contributor:** ${input.contributor}

### PR Description
${input.prBody.slice(0, 1000)}${input.prBody.length > 1000 ? '...(truncated)' : ''}

### Changed Files
${input.files.map(f => `- ${f.path} (+${f.additions}/-${f.deletions})`).join('\n')}

### Diff Preview
\`\`\`
${input.diff.slice(0, 2000)}${input.diff.length > 2000 ? '\n...(truncated)' : ''}
\`\`\`

### Detected Signals (Raw Score: ${rawScore})
${signals.map(s => `- [${s.type}] ${s.signal} (weight: ${s.weight})${s.evidence ? `: ${s.evidence}` : ''}`).join('\n')}

Please analyze and provide your refined assessment.`;

    const response = await this.chat({
      model: this.config.defaultModel,
      messages: [
        { role: 'system', content: SLOP_DETECTION_SYSTEM_PROMPT },
        { role: 'user', content: context },
      ],
      temperature: 0.3,
    });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        adjustedScore: Math.min(100, Math.max(0, parsed.adjustedScore ?? rawScore)),
        confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.7)),
        falsePositives: parsed.falsePositives ?? [],
        additionalConcerns: parsed.additionalConcerns ?? [],
        reasoning: parsed.reasoning ?? 'LLM analysis completed',
      };
    } catch {
      return {
        adjustedScore: rawScore,
        confidence: 0.6,
        falsePositives: [],
        additionalConcerns: [],
        reasoning: 'Could not parse LLM response, using rule-based score',
      };
    }
  }

  /**
   * Calculate confidence based on signals
   */
  private calculateConfidence(signals: SlopSignal[], score: number): number {
    if (signals.length === 0) {
      // No signals = high confidence it's not slop
      return 0.9;
    }

    // More signals = more confidence in the detection
    const signalCount = signals.length;
    const typeCount = new Set(signals.map(s => s.type)).size;

    // Base confidence
    let confidence = 0.5;

    // More signals increase confidence
    confidence += Math.min(0.2, signalCount * 0.05);

    // Multiple analyzer types increase confidence
    confidence += typeCount * 0.1;

    // Very high or very low scores have higher confidence
    if (score < 15 || score > 85) {
      confidence += 0.1;
    }

    return Math.min(0.95, confidence);
  }

  /**
   * Generate human-readable reasoning
   */
  private generateReasoning(signals: SlopSignal[], score: number): string {
    if (signals.length === 0) {
      return 'No AI slop indicators detected. PR appears to be a legitimate contribution.';
    }

    const typeGroups: Record<string, SlopSignal[]> = {
      linguistic: [],
      contributor: [],
      quality: [],
    };

    for (const signal of signals) {
      typeGroups[signal.type].push(signal);
    }

    const parts: string[] = [];

    if (typeGroups.linguistic.length > 0) {
      parts.push(`Linguistic patterns: ${typeGroups.linguistic.map(s => s.signal).join(', ')}`);
    }
    if (typeGroups.contributor.length > 0) {
      parts.push(`Contributor concerns: ${typeGroups.contributor.map(s => s.signal).join(', ')}`);
    }
    if (typeGroups.quality.length > 0) {
      parts.push(`Quality issues: ${typeGroups.quality.map(s => s.signal).join(', ')}`);
    }

    const severity = score < 30 ? 'Low' : score < 60 ? 'Moderate' : score < 75 ? 'High' : 'Critical';

    return `${severity} slop risk (score: ${score}). ${parts.join('. ')}.`;
  }

  /**
   * Determine recommendation based on score and thresholds
   */
  private determineRecommendation(score: number): SlopRecommendation {
    if (score <= this.thresholds.allowMax) {
      return 'allow';
    }
    if (score <= this.thresholds.warnMax) {
      return 'flag';
    }
    return 'auto_close';
  }

  /**
   * Record analysis in history
   */
  private recordHistory(prUrl: string, result: SlopAnalysisResult): void {
    this.history.push({
      prUrl,
      slopScore: result.slopScore,
      recommendation: result.recommendation,
      timestamp: Date.now(),
    });

    // Keep history bounded
    if (this.history.length > 1000) {
      this.history = this.history.slice(-1000);
    }

    // Persist
    this.saveState('slop_history', this.history);
  }

  /**
   * Get detection statistics
   */
  async getStats(): Promise<{
    total: number;
    allowed: number;
    flagged: number;
    closed: number;
    averageScore: number;
  }> {
    const total = this.history.length;
    const allowed = this.history.filter(h => h.recommendation === 'allow').length;
    const flagged = this.history.filter(h => h.recommendation === 'flag').length;
    const closed = this.history.filter(h => h.recommendation === 'auto_close').length;
    const averageScore = total > 0
      ? this.history.reduce((sum, h) => sum + h.slopScore, 0) / total
      : 0;

    return { total, allowed, flagged, closed, averageScore: Math.round(averageScore) };
  }

  /**
   * Update thresholds (for testing or configuration)
   */
  setThresholds(thresholds: Partial<SlopThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }
}

/**
 * Create a Slop Detector Agent instance
 */
export function createSlopDetectorAgent(thresholds?: Partial<SlopThresholds>): SlopDetectorAgent {
  return new SlopDetectorAgent(thresholds);
}
