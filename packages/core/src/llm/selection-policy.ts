/**
 * Provider Selection Policy
 *
 * EPIC 004: Intelligent provider routing based on:
 * - Task complexity
 * - Cost constraints
 * - Safety requirements
 * - Provider availability
 * - Capability requirements
 */

import { z } from 'zod';
import type { LLMProviderType, LLMProviderConfig } from './types.js';
import {
  getProviderCost,
  getProviderCapabilities,
  PROVIDER_CAPABILITIES,
  type ProviderCapabilities,
  type ProviderCostMetadata,
} from './provider-capabilities.js';

// =============================================================================
// Selection Criteria
// =============================================================================

/**
 * Task complexity level (1-10)
 */
export type ComplexityLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Safety level requirements
 */
export type SafetyLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Task type hints for optimal model selection
 */
export type TaskType =
  | 'triage' // Quick classification/scoring
  | 'code_generation' // Writing code
  | 'code_review' // Reviewing code
  | 'merge_resolution' // Resolving conflicts
  | 'documentation' // Writing docs
  | 'reasoning' // Complex reasoning tasks
  | 'chat' // General chat/Q&A
  | 'json_extraction' // Extracting structured data
  | 'summarization'; // Summarizing content

/**
 * Selection criteria for choosing a provider
 */
export const SelectionCriteriaSchema = z.object({
  /** Task complexity (1-10, higher = more complex) */
  complexity: z.number().min(1).max(10).default(5),
  /** Task type hint */
  taskType: z
    .enum([
      'triage',
      'code_generation',
      'code_review',
      'merge_resolution',
      'documentation',
      'reasoning',
      'chat',
      'json_extraction',
      'summarization',
    ])
    .optional(),
  /** Safety level requirement */
  safetyLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  /** Maximum cost per request (USD) */
  maxCostPerRequest: z.number().positive().optional(),
  /** Maximum cost tier (1-5) */
  maxCostTier: z.number().min(1).max(5).optional(),
  /** Required capabilities */
  requiredCapabilities: z
    .object({
      jsonMode: z.boolean().optional(),
      functionCalling: z.boolean().optional(),
      vision: z.boolean().optional(),
      streaming: z.boolean().optional(),
      codeExecution: z.boolean().optional(),
      codeOptimized: z.boolean().optional(),
      reasoningOptimized: z.boolean().optional(),
    })
    .optional(),
  /** Minimum context window (tokens) */
  minContextTokens: z.number().positive().optional(),
  /** Preferred providers (ordered by preference) */
  preferredProviders: z.array(z.string()).optional(),
  /** Excluded providers */
  excludedProviders: z.array(z.string()).optional(),
  /** Allow fallback to cheaper/faster models if preferred unavailable */
  allowFallback: z.boolean().default(true),
});

export type SelectionCriteria = z.infer<typeof SelectionCriteriaSchema>;

// =============================================================================
// Selection Policy
// =============================================================================

/**
 * Provider candidate with score
 */
export interface ProviderCandidate {
  provider: LLMProviderType;
  model: string;
  score: number;
  cost?: ProviderCostMetadata;
  capabilities?: ProviderCapabilities;
  reasons: string[];
}

/**
 * Selection result
 */
export interface SelectionResult {
  /** Selected provider type */
  provider: LLMProviderType;
  /** Selected model */
  model: string;
  /** All candidates considered */
  candidates: ProviderCandidate[];
  /** Selection reasons */
  reasons: string[];
  /** Fallback options if primary fails */
  fallbacks: ProviderCandidate[];
}

/**
 * Provider availability checker
 */
export type ProviderAvailabilityChecker = (provider: LLMProviderType, model: string) => boolean;

/**
 * Default provider/model mappings by task type and complexity
 */
const TASK_TYPE_PREFERENCES: Record<TaskType, { low: string[]; medium: string[]; high: string[] }> =
  {
    triage: {
      low: ['google:gemini-2.0-flash', 'openai:gpt-4o-mini'],
      medium: ['google:gemini-2.0-flash', 'anthropic:claude-3-5-haiku-20241022'],
      high: ['anthropic:claude-sonnet-4-20250514', 'openai:gpt-4o'],
    },
    code_generation: {
      low: ['anthropic:claude-3-5-haiku-20241022', 'openai:gpt-4o-mini'],
      medium: ['anthropic:claude-sonnet-4-20250514', 'openai:gpt-4o'],
      high: ['anthropic:claude-opus-4-20250514', 'openai:o1'],
    },
    code_review: {
      low: ['google:gemini-2.0-flash', 'anthropic:claude-3-5-haiku-20241022'],
      medium: ['anthropic:claude-sonnet-4-20250514', 'openai:gpt-4o'],
      high: ['anthropic:claude-opus-4-20250514', 'openai:gpt-4-turbo'],
    },
    merge_resolution: {
      low: ['anthropic:claude-sonnet-4-20250514', 'openai:gpt-4o'],
      medium: ['anthropic:claude-sonnet-4-20250514', 'openai:gpt-4o'],
      high: ['anthropic:claude-opus-4-20250514', 'openai:o1'],
    },
    documentation: {
      low: ['google:gemini-2.0-flash', 'openai:gpt-4o-mini'],
      medium: ['anthropic:claude-sonnet-4-20250514', 'openai:gpt-4o'],
      high: ['anthropic:claude-sonnet-4-20250514', 'openai:gpt-4o'],
    },
    reasoning: {
      low: ['openai:gpt-4o', 'anthropic:claude-sonnet-4-20250514'],
      medium: ['openai:gpt-4o', 'anthropic:claude-sonnet-4-20250514'],
      high: ['openai:o1', 'anthropic:claude-opus-4-20250514'],
    },
    chat: {
      low: ['google:gemini-2.0-flash', 'openai:gpt-4o-mini'],
      medium: ['openai:gpt-4o', 'anthropic:claude-sonnet-4-20250514'],
      high: ['anthropic:claude-opus-4-20250514', 'openai:gpt-4o'],
    },
    json_extraction: {
      low: ['google:gemini-2.0-flash', 'openai:gpt-4o-mini'],
      medium: ['openai:gpt-4o', 'anthropic:claude-sonnet-4-20250514'],
      high: ['openai:gpt-4o', 'anthropic:claude-sonnet-4-20250514'],
    },
    summarization: {
      low: ['google:gemini-2.0-flash', 'openai:gpt-4o-mini'],
      medium: ['google:gemini-2.0-flash', 'anthropic:claude-3-5-haiku-20241022'],
      high: ['anthropic:claude-sonnet-4-20250514', 'openai:gpt-4o'],
    },
  };

/**
 * Safety level minimum requirements
 */
const SAFETY_REQUIREMENTS: Record<SafetyLevel, { minTier: number; requiredCapabilities: string[] }> =
  {
    low: { minTier: 1, requiredCapabilities: [] },
    medium: { minTier: 2, requiredCapabilities: ['systemPrompts'] },
    high: { minTier: 3, requiredCapabilities: ['systemPrompts', 'jsonMode'] },
    critical: { minTier: 4, requiredCapabilities: ['systemPrompts', 'jsonMode', 'functionCalling'] },
  };

/**
 * Provider Selection Policy
 *
 * Selects optimal provider based on task requirements, cost constraints, and availability.
 */
export class ProviderSelectionPolicy {
  private availabilityChecker?: ProviderAvailabilityChecker;

  constructor(availabilityChecker?: ProviderAvailabilityChecker) {
    this.availabilityChecker = availabilityChecker;
  }

  /**
   * Select optimal provider for given criteria
   */
  select(criteria: Partial<SelectionCriteria>): SelectionResult {
    const parsedCriteria = SelectionCriteriaSchema.parse(criteria);
    const candidates = this.scoreCandidates(parsedCriteria);

    // Sort by score (descending)
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      throw new Error('No suitable provider found for the given criteria');
    }

    const selected = candidates[0];
    const fallbacks = candidates.slice(1, 4); // Top 3 fallbacks

    return {
      provider: selected.provider,
      model: selected.model,
      candidates,
      reasons: selected.reasons,
      fallbacks,
    };
  }

  /**
   * Score all candidate providers
   */
  private scoreCandidates(criteria: SelectionCriteria): ProviderCandidate[] {
    const candidates: ProviderCandidate[] = [];

    // Get preferred providers based on task type and complexity
    const preferredModels = this.getPreferredModels(criteria);

    // Add preferred models as candidates
    for (const modelKey of preferredModels) {
      const candidate = this.scoreCandidate(modelKey, criteria);
      if (candidate) {
        candidates.push(candidate);
      }
    }

    // Add fallback models if allowed
    if (criteria.allowFallback && candidates.length < 3) {
      const fallbackModels = this.getFallbackModels(criteria, preferredModels);
      for (const modelKey of fallbackModels) {
        const candidate = this.scoreCandidate(modelKey, criteria);
        if (candidate && !candidates.find((c) => `${c.provider}:${c.model}` === modelKey)) {
          candidates.push(candidate);
        }
      }
    }

    return candidates;
  }

  /**
   * Get preferred models based on task type and complexity
   */
  private getPreferredModels(criteria: SelectionCriteria): string[] {
    const models: string[] = [];

    // Add user-preferred providers first
    if (criteria.preferredProviders) {
      models.push(...criteria.preferredProviders);
    }

    // Add task-type based preferences
    if (criteria.taskType) {
      const taskPrefs = TASK_TYPE_PREFERENCES[criteria.taskType];
      const complexityBand = this.getComplexityBand(criteria.complexity);
      models.push(...taskPrefs[complexityBand]);
    }

    // Default models by complexity
    if (models.length === 0) {
      const band = this.getComplexityBand(criteria.complexity);
      if (band === 'low') {
        models.push('google:gemini-2.0-flash', 'openai:gpt-4o-mini');
      } else if (band === 'medium') {
        models.push('anthropic:claude-sonnet-4-20250514', 'openai:gpt-4o');
      } else {
        models.push('anthropic:claude-opus-4-20250514', 'openai:o1');
      }
    }

    // Filter excluded providers
    if (criteria.excludedProviders) {
      const excluded = new Set(criteria.excludedProviders);
      return models.filter((m) => !excluded.has(m.split(':')[0]));
    }

    return models;
  }

  /**
   * Get fallback models not in preferred list
   * Dynamically generated from PROVIDER_CAPABILITIES to stay in sync
   */
  private getFallbackModels(_criteria: SelectionCriteria, preferredModels: string[]): string[] {
    const preferredSet = new Set(preferredModels);
    // Dynamically get all models from PROVIDER_CAPABILITIES
    const allModels = Object.keys(PROVIDER_CAPABILITIES);

    return allModels.filter((m) => !preferredSet.has(m));
  }

  /**
   * Score a single candidate
   */
  private scoreCandidate(modelKey: string, criteria: SelectionCriteria): ProviderCandidate | null {
    const [provider, model] = modelKey.split(':') as [LLMProviderType, string];
    const cost = getProviderCost(provider, model);
    const capabilities = getProviderCapabilities(provider, model);
    const reasons: string[] = [];
    let score = 50; // Base score

    // Check availability
    if (this.availabilityChecker && !this.availabilityChecker(provider, model)) {
      return null;
    }

    // Check cost constraints
    if (cost) {
      if (criteria.maxCostTier && cost.tier > criteria.maxCostTier) {
        reasons.push(`Excluded: cost tier ${cost.tier} exceeds max ${criteria.maxCostTier}`);
        return null;
      }
      // Prefer cheaper models (up to +20 points)
      score += (5 - cost.tier) * 4;
      reasons.push(`Cost tier ${cost.tier}/5`);
    }

    // Check capabilities
    if (capabilities) {
      // Check required capabilities
      if (criteria.requiredCapabilities) {
        const reqCaps = criteria.requiredCapabilities as Record<string, boolean | undefined>;
        for (const [cap, required] of Object.entries(reqCaps)) {
          if (required && !capabilities[cap as keyof ProviderCapabilities]) {
            reasons.push(`Excluded: missing required capability ${cap}`);
            return null;
          }
        }
      }

      // Check minimum context
      if (criteria.minContextTokens && capabilities.maxContextTokens < criteria.minContextTokens) {
        reasons.push(
          `Excluded: context ${capabilities.maxContextTokens} < required ${criteria.minContextTokens}`
        );
        return null;
      }

      // Bonus for code-optimized on code tasks
      if (
        capabilities.codeOptimized &&
        (criteria.taskType === 'code_generation' ||
          criteria.taskType === 'code_review' ||
          criteria.taskType === 'merge_resolution')
      ) {
        score += 15;
        reasons.push('Code-optimized model');
      }

      // Bonus for reasoning-optimized on reasoning tasks
      if (capabilities.reasoningOptimized && criteria.taskType === 'reasoning') {
        score += 15;
        reasons.push('Reasoning-optimized model');
      }

      // Bonus for larger context window
      if (capabilities.maxContextTokens >= 200000) {
        score += 5;
        reasons.push('Large context window');
      }
    }

    // Safety level scoring
    const safetyReqs = SAFETY_REQUIREMENTS[criteria.safetyLevel];
    if (cost && cost.tier < safetyReqs.minTier) {
      // Lower tier than safety requires - reduce score but don't exclude
      score -= 10;
      reasons.push(`Safety concern: tier ${cost.tier} below recommended ${safetyReqs.minTier}`);
    }

    // Complexity matching
    const complexityBand = this.getComplexityBand(criteria.complexity);
    const modelBand = this.getModelComplexityBand(cost?.tier || 3);
    if (complexityBand === modelBand) {
      score += 10;
      reasons.push('Complexity matched');
    } else if (
      (complexityBand === 'low' && modelBand === 'high') ||
      (complexityBand === 'high' && modelBand === 'low')
    ) {
      score -= 10;
      reasons.push('Complexity mismatch');
    }

    return {
      provider,
      model,
      score,
      cost,
      capabilities,
      reasons,
    };
  }

  /**
   * Get complexity band from numeric complexity
   */
  private getComplexityBand(complexity: number): 'low' | 'medium' | 'high' {
    if (complexity <= 3) return 'low';
    if (complexity <= 7) return 'medium';
    return 'high';
  }

  /**
   * Get complexity band from cost tier
   */
  private getModelComplexityBand(tier: number): 'low' | 'medium' | 'high' {
    if (tier <= 2) return 'low';
    if (tier <= 4) return 'medium';
    return 'high';
  }
}

/**
 * Create default selection policy
 */
export function createSelectionPolicy(
  availabilityChecker?: ProviderAvailabilityChecker
): ProviderSelectionPolicy {
  return new ProviderSelectionPolicy(availabilityChecker);
}

/**
 * Quick select for common task types
 */
export function selectForTask(
  taskType: TaskType,
  complexity: ComplexityLevel = 5,
  options?: Partial<SelectionCriteria>
): SelectionResult {
  const policy = new ProviderSelectionPolicy();
  return policy.select({
    taskType,
    complexity,
    ...options,
  });
}

/**
 * Get provider config from selection result
 */
export function selectionToConfig(selection: SelectionResult): LLMProviderConfig {
  return {
    provider: selection.provider,
    model: selection.model,
  };
}
