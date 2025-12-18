/**
 * Phase 26: Planner Service
 *
 * Orchestrator for the LLM Planner. Handles:
 * - Provider selection and fallback
 * - Plan validation
 * - Caching (optional)
 * - Metrics and telemetry
 */

import { randomUUID } from 'node:crypto';
import type { PatchPlan, PlannerProvider as PlannerProviderType } from './types.js';
import { validatePatchPlan, validatePatchPlanSecurity } from './types.js';
import {
  type PlannerProviderInterface,
  type PlannerProviderInput,
  createPlannerProvider,
} from './providers.js';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Planner service configuration
 */
export interface PlannerConfig {
  /** Primary provider to use */
  provider: PlannerProviderType;
  /** Specific model to use */
  model?: string;
  /** Fallback provider if primary fails */
  fallbackProvider?: PlannerProviderType;
  /** Enable security validation */
  securityValidation?: boolean;
  /** Enable plan caching */
  cacheEnabled?: boolean;
  /** Cache TTL in seconds */
  cacheTtlSec?: number;
  /** Maximum retries on failure */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelayMs?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: PlannerConfig = {
  provider: 'gemini',
  securityValidation: true,
  cacheEnabled: false,
  cacheTtlSec: 3600,
  maxRetries: 2,
  retryDelayMs: 1000,
};

// =============================================================================
// Input/Output Types
// =============================================================================

/**
 * Input to the PlannerService
 */
export interface PlannerInput {
  /** The intent/goal to plan for */
  intent: string;
  /** Repository context */
  repoContext?: {
    files: string[];
    languages: string[];
    hasTests: boolean;
    defaultBranch?: string;
  };
  /** PR/Issue context */
  sourceContext?: {
    type: 'pr' | 'issue' | 'manual';
    url?: string;
    title?: string;
    body?: string;
    diff?: string;
  };
  /** Relevant file contents */
  fileContents?: Map<string, string>;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Tenant ID for multi-tenant */
  tenantId?: string;
}

/**
 * Output from the PlannerService
 */
export interface PlannerOutput {
  /** Whether planning succeeded */
  success: boolean;
  /** The generated plan (if successful) */
  plan?: PatchPlan;
  /** Error message (if failed) */
  error?: string;
  /** Provider that generated the plan */
  provider?: PlannerProviderType;
  /** Model used */
  model?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether fallback was used */
  usedFallback: boolean;
  /** Security validation result */
  securityValidation?: {
    secure: boolean;
    violations: string[];
  };
}

// =============================================================================
// Planner Service
// =============================================================================

/**
 * PlannerService - Main orchestrator for LLM planning
 */
export class PlannerService {
  private config: PlannerConfig;
  private primaryProvider: PlannerProviderInterface;
  private fallbackProvider?: PlannerProviderInterface;
  private cache: Map<string, { plan: PatchPlan; expiresAt: number }>;

  constructor(config?: Partial<PlannerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map();

    // Initialize providers
    this.primaryProvider = createPlannerProvider(this.config.provider, {
      model: this.config.model,
    });

    if (this.config.fallbackProvider) {
      this.fallbackProvider = createPlannerProvider(
        this.config.fallbackProvider
      );
    }
  }

  /**
   * Generate a plan for the given input
   */
  async plan(input: PlannerInput): Promise<PlannerOutput> {
    const startTime = Date.now();
    const requestId = randomUUID();

    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = this.getCachedPlan(input);
      if (cached) {
        return {
          success: true,
          plan: cached,
          provider: cached.provider as PlannerProviderType,
          model: cached.model,
          durationMs: Date.now() - startTime,
          usedFallback: false,
        };
      }
    }

    // Build provider input
    const providerInput: PlannerProviderInput = {
      intent: input.intent,
      repoContext: input.repoContext,
      sourceContext: input.sourceContext,
      fileContents: input.fileContents,
      traceId: input.traceId,
      requestId,
      tenantId: input.tenantId,
    };

    // Try primary provider
    let result = await this.tryProvider(
      this.primaryProvider,
      providerInput,
      false
    );

    // Try fallback if primary failed
    if (!result.success && this.fallbackProvider) {
      result = await this.tryProvider(
        this.fallbackProvider,
        providerInput,
        true
      );
    }

    // Calculate duration
    result.durationMs = Date.now() - startTime;

    // Cache successful results
    if (result.success && result.plan && this.config.cacheEnabled) {
      this.setCachedPlan(input, result.plan);
    }

    return result;
  }

  /**
   * Try a specific provider
   */
  private async tryProvider(
    provider: PlannerProviderInterface,
    input: PlannerProviderInput,
    isFallback: boolean
  ): Promise<PlannerOutput> {
    if (!provider.isAvailable()) {
      return {
        success: false,
        error: `Provider ${provider.name} is not available`,
        durationMs: 0,
        usedFallback: isFallback,
      };
    }

    let lastError: Error | undefined;
    const maxRetries = this.config.maxRetries || 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const plan = await provider.plan(input);

        // Validate the plan
        const validation = validatePatchPlan(plan);
        if (!validation.valid) {
          throw new Error(
            `Plan validation failed: ${validation.errorMessages?.join(', ')}`
          );
        }

        // Security validation
        let securityResult: { secure: boolean; violations: string[] } | undefined;
        if (this.config.securityValidation) {
          securityResult = validatePatchPlanSecurity(plan);
          if (!securityResult.secure) {
            throw new Error(
              `Security validation failed: ${securityResult.violations.join(', ')}`
            );
          }
        }

        return {
          success: true,
          plan,
          provider: provider.name,
          model: provider.getModel(),
          durationMs: 0, // Will be set by caller
          usedFallback: isFallback,
          securityValidation: securityResult,
        };
      } catch (error) {
        lastError = error as Error;

        // Don't retry on validation errors
        if (
          lastError.message.includes('validation failed') ||
          lastError.message.includes('Security validation')
        ) {
          break;
        }

        // Wait before retry
        if (attempt < maxRetries) {
          await this.delay(this.config.retryDelayMs || 1000);
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      provider: provider.name,
      model: provider.getModel(),
      durationMs: 0,
      usedFallback: isFallback,
    };
  }

  /**
   * Get cached plan
   */
  private getCachedPlan(input: PlannerInput): PatchPlan | null {
    const key = this.getCacheKey(input);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.plan;
  }

  /**
   * Set cached plan
   */
  private setCachedPlan(input: PlannerInput, plan: PatchPlan): void {
    const key = this.getCacheKey(input);
    const ttl = (this.config.cacheTtlSec || 3600) * 1000;

    this.cache.set(key, {
      plan,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Generate cache key from input
   */
  private getCacheKey(input: PlannerInput): string {
    // Simple hash based on intent and source
    const parts = [
      input.intent,
      input.sourceContext?.url || '',
      input.tenantId || '',
    ];
    return parts.join('|');
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if the planner is enabled via feature flag
   */
  static isEnabled(): boolean {
    return process.env.GWI_PLANNER_ENABLED === '1';
  }

  /**
   * Get configured provider from environment
   */
  static getConfiguredProvider(): PlannerProviderType {
    const provider = process.env.GWI_PLANNER_PROVIDER;
    if (provider === 'claude' || provider === 'gemini') {
      return provider;
    }
    return 'gemini'; // Default
  }

  /**
   * Get configured model from environment
   */
  static getConfiguredModel(): string | undefined {
    return process.env.GWI_PLANNER_MODEL;
  }
}

// =============================================================================
// Singleton
// =============================================================================

let plannerServiceInstance: PlannerService | null = null;

/**
 * Get the singleton PlannerService instance
 */
export function getPlannerService(
  config?: Partial<PlannerConfig>
): PlannerService {
  if (!plannerServiceInstance || config) {
    plannerServiceInstance = new PlannerService({
      provider: PlannerService.getConfiguredProvider(),
      model: PlannerService.getConfiguredModel(),
      ...config,
    });
  }
  return plannerServiceInstance;
}
