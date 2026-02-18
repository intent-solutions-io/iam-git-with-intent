/**
 * Loop Detection Hook
 *
 * Harness Engineering Pattern 3: Loop Detection
 *
 * Tracks consecutive CODER outputs per run to detect when the agent
 * is producing near-identical outputs (semantic loops). When detected,
 * injects a "try different approach" signal into context metadata.
 *
 * @module @gwi/engine/hooks
 */

import { getLogger } from '@gwi/core';
import type { AgentHook, AgentRunContext } from './types.js';

const logger = getLogger('loop-detection-hook');

// =============================================================================
// Types
// =============================================================================

/**
 * Loop detection result attached to context metadata
 */
export interface LoopDetectionResult {
  /** Whether a loop was detected */
  loopDetected: boolean;
  /** Number of similar consecutive outputs */
  similarCount: number;
  /** Similarity score of last two outputs (0-1) */
  lastSimilarity: number;
  /** Suggested action */
  suggestion?: string;
}

/**
 * Configuration for loop detection
 */
export interface LoopDetectionConfig {
  /** Similarity threshold to consider outputs "the same" (0-1). @default 0.8 */
  similarityThreshold: number;
  /** Number of similar outputs before flagging. @default 3 */
  maxSimilarOutputs: number;
  /** Maximum outputs to track per run. @default 10 */
  maxTrackedOutputs: number;
  /** Block on loop detection (throw) or just warn. @default false */
  enforceBlocking: boolean;
  /** Callback when loop is detected */
  onLoopDetected?: (ctx: AgentRunContext, result: LoopDetectionResult) => Promise<void>;
}

/**
 * Default configuration
 */
export const DEFAULT_LOOP_DETECTION_CONFIG: LoopDetectionConfig = {
  similarityThreshold: 0.8,
  maxSimilarOutputs: 3,
  maxTrackedOutputs: 10,
  enforceBlocking: false,
};

// =============================================================================
// Error
// =============================================================================

/**
 * Error thrown when a loop is detected in blocking mode
 */
export class LoopDetectionError extends Error {
  constructor(
    message: string,
    public readonly detection: LoopDetectionResult,
  ) {
    super(message);
    this.name = 'LoopDetectionError';
  }
}

// =============================================================================
// Similarity Calculation
// =============================================================================

/**
 * Calculate bigram-based similarity between two strings.
 * Returns a value between 0 (completely different) and 1 (identical).
 *
 * Uses Dice's coefficient on character bigrams — fast and effective
 * for detecting near-duplicate text without external dependencies.
 */
export function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // Normalize whitespace for comparison
  const normA = a.replace(/\s+/g, ' ').trim();
  const normB = b.replace(/\s+/g, ' ').trim();

  if (normA === normB) return 1;

  const bigramsA = getBigrams(normA);
  const bigramsB = getBigrams(normB);

  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

  let intersectionSize = 0;
  for (const [bigram, countA] of bigramsA) {
    const countB = bigramsB.get(bigram) ?? 0;
    intersectionSize += Math.min(countA, countB);
  }

  const totalSize = sumValues(bigramsA) + sumValues(bigramsB);
  return (2 * intersectionSize) / totalSize;
}

function getBigrams(str: string): Map<string, number> {
  const bigrams = new Map<string, number>();
  for (let i = 0; i < str.length - 1; i++) {
    const bigram = str.substring(i, i + 2);
    bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
  }
  return bigrams;
}

function sumValues(map: Map<string, number>): number {
  let sum = 0;
  for (const v of map.values()) sum += v;
  return sum;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Loop Detection Hook
 *
 * Tracks CODER outputs per run and detects semantic loops
 * where the agent produces near-identical code repeatedly.
 */
export class LoopDetectionHook implements AgentHook {
  readonly name = 'loop-detection';
  private config: LoopDetectionConfig;

  /** Map of runId → list of output summaries for that run */
  private runOutputs = new Map<string, string[]>();

  constructor(config?: Partial<LoopDetectionConfig>) {
    this.config = { ...DEFAULT_LOOP_DETECTION_CONFIG, ...config };
  }

  /**
   * Track CODER outputs and detect loops
   */
  async onAfterStep(ctx: AgentRunContext): Promise<void> {
    // Only track CODER role outputs
    if (ctx.agentRole !== 'CODER') {
      return;
    }

    const output = ctx.outputSummary ?? '';
    if (!output) return;

    // Get or create output history for this run
    let outputs = this.runOutputs.get(ctx.runId);
    if (!outputs) {
      outputs = [];
      this.runOutputs.set(ctx.runId, outputs);
    }

    // Calculate similarity with previous outputs
    let consecutiveSimilar = 0;
    let lastSimilarity = 0;

    for (let i = outputs.length - 1; i >= 0; i--) {
      const similarity = calculateSimilarity(output, outputs[i]);
      if (i === outputs.length - 1) {
        lastSimilarity = similarity;
      }
      if (similarity >= this.config.similarityThreshold) {
        consecutiveSimilar++;
      } else {
        break; // Stop at first dissimilar output
      }
    }

    // Add current output to history
    outputs.push(output);

    // Trim history to max tracked
    if (outputs.length > this.config.maxTrackedOutputs) {
      outputs.splice(0, outputs.length - this.config.maxTrackedOutputs);
    }

    const loopDetected = consecutiveSimilar >= this.config.maxSimilarOutputs - 1;

    const result: LoopDetectionResult = {
      loopDetected,
      similarCount: consecutiveSimilar + 1, // Include current output
      lastSimilarity,
      suggestion: loopDetected
        ? 'Agent appears stuck in a loop producing similar outputs. Consider a fundamentally different approach, different model, or simplified input.'
        : undefined,
    };

    // Attach to metadata
    if (ctx.metadata) {
      ctx.metadata.loopDetection = result;
      if (loopDetected) {
        // Inject nudge for the agent's next iteration
        ctx.metadata.loopNudge =
          'WARNING: You have produced similar output multiple times. ' +
          'Try a fundamentally different approach. Consider: (1) breaking the problem into smaller pieces, ' +
          '(2) using a different algorithm or pattern, (3) simplifying your solution.';
      }
    }

    if (loopDetected) {
      logger.warn('Loop detected in CODER output', {
        runId: ctx.runId,
        similarCount: result.similarCount,
        lastSimilarity: result.lastSimilarity.toFixed(3),
      });

      await this.config.onLoopDetected?.(ctx, result);

      if (this.config.enforceBlocking) {
        throw new LoopDetectionError(
          `Loop detected: ${result.similarCount} similar CODER outputs (similarity: ${result.lastSimilarity.toFixed(3)})`,
          result,
        );
      }
    }
  }

  /**
   * Clean up on run end
   */
  async onRunEnd(ctx: AgentRunContext, _success: boolean): Promise<void> {
    this.runOutputs.delete(ctx.runId);
  }

  /**
   * Check if this hook is enabled
   */
  async isEnabled(): Promise<boolean> {
    return process.env.GWI_LOOP_DETECTION_ENABLED !== 'false';
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a loop detection hook
 */
export function createLoopDetectionHook(
  config?: Partial<LoopDetectionConfig>,
): LoopDetectionHook {
  return new LoopDetectionHook(config);
}
