/**
 * Provider-Agnostic LLM Module
 *
 * Phase 26 Fixup: Generic LLM interface supporting multiple providers.
 *
 * Supported providers:
 * - google: Google AI (Gemini)
 * - anthropic: Anthropic (Claude)
 * - openai: OpenAI (GPT)
 * - openai_compat: OpenAI-compatible endpoints (Azure, Ollama, vLLM, LM Studio)
 *
 * Environment variables:
 * - GWI_LLM_PROVIDER: Provider type (google, anthropic, openai, openai_compat)
 * - GWI_LLM_MODEL: Model identifier
 * - GWI_LLM_BASE_URL: Base URL for API (required for openai_compat)
 * - GWI_LLM_API_KEY: API key (or use provider-specific env vars)
 *
 * Provider-specific env vars:
 * - GOOGLE_AI_API_KEY: Google AI API key
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - OPENAI_API_KEY: OpenAI API key
 * - OPENAI_BASE_URL: OpenAI base URL (defaults to api.openai.com)
 */

// Re-export types
export type {
  LLMProviderType,
  LLMProviderConfig,
  MessageRole,
  LLMMessage,
  LLMJsonCompletionRequest,
  LLMJsonCompletionResponse,
  LLMTextCompletionRequest,
  LLMTextCompletionResponse,
  LLMUsage,
  LLMProvider,
  LLMProviderFactory,
  LLMProviderRegistry,
} from './types.js';

// Re-export provider implementations
export {
  GoogleLLMProvider,
  createGoogleProvider,
  AnthropicLLMProvider,
  createAnthropicProvider,
  OpenAICompatLLMProvider,
  createOpenAIProvider,
  createOpenAICompatProvider,
  GPT4TurboCodeProvider,
  createGPT4TurboCodeProvider,
  createGPT4oCodeProvider,
  type CodeTaskType,
  type CodeOptimizedOptions,
} from './providers/index.js';

// Re-export provider capabilities and cost metadata
export {
  type TokenCost,
  type ProviderCostMetadata,
  type ProviderCapabilities,
  type LLMRetryPolicy,
  type ProviderInfo,
  PROVIDER_COSTS,
  PROVIDER_CAPABILITIES,
  DEFAULT_LLM_RETRY_POLICY,
  getProviderCost,
  getProviderCapabilities,
  getProviderInfo,
  calculateRequestCost,
  calculateRetryDelay,
  shouldRetry,
} from './provider-capabilities.js';

// Re-export selection policy
export {
  type ComplexityLevel,
  type SafetyLevel,
  type TaskType,
  type SelectionCriteria,
  type ProviderCandidate,
  type SelectionResult,
  type ProviderAvailabilityChecker,
  ProviderSelectionPolicy,
  createSelectionPolicy,
  selectForTask,
  selectionToConfig,
} from './selection-policy.js';

// Re-export custom provider registry
export {
  type CustomProviderConfig,
  CustomProviderRegistry,
  customProviderRegistry,
  registerCustomProvider,
  unregisterCustomProvider,
  getAllProviders,
  PROVIDER_ENV_VARS,
} from './provider-registry.js';

// Re-export provider discovery
export {
  type ProviderAvailability,
  discoverProviders,
  getAvailableProviderTypes,
  isProviderAvailable,
  getProviderApiKey,
  getDefaultModel as getDefaultModelForProvider,
  getProviderSummary,
  autoSelectProvider,
  validateRequiredProviders,
} from './provider-discovery.js';

// Internal import for getDefaultModel delegation (used by local getDefaultModel below)
import { getDefaultModel as getDefaultModelForProvider } from './provider-discovery.js';

// Re-export evaluation hooks
export {
  type EvaluationHookConfig,
  type EvaluationHookResult,
  type EvaluationHook,
  type EvaluationContext,
  type LLMJsonCompletionResponseWithEval,
  type LLMTextCompletionResponseWithEval,
  evaluationHookRegistry,
  wrapProviderWithEvaluation,
  configureEvaluationHooks,
  registerEvaluationHook,
  evaluateOutput,
  jsonStructureHook,
  codeSyntaxHook,
  createLengthHook,
} from './evaluation-hooks.js';

import type {
  LLMProvider,
  LLMProviderConfig,
  LLMProviderType,
  LLMProviderFactory,
  LLMProviderRegistry,
} from './types.js';

import { createGoogleProvider } from './providers/google.js';
import { createAnthropicProvider } from './providers/anthropic.js';
import {
  createOpenAIProvider,
  createOpenAICompatProvider,
} from './providers/openai-compat.js';

// =============================================================================
// Provider Registry
// =============================================================================

/**
 * Default provider registry with built-in providers
 */
class DefaultProviderRegistry implements LLMProviderRegistry {
  private factories = new Map<LLMProviderType, LLMProviderFactory>();

  constructor() {
    // Register built-in providers
    this.register('google', createGoogleProvider);
    this.register('anthropic', createAnthropicProvider);
    this.register('openai', createOpenAIProvider);
    this.register('openai_compat', createOpenAICompatProvider);
  }

  register(type: LLMProviderType, factory: LLMProviderFactory): void {
    this.factories.set(type, factory);
  }

  get(type: LLMProviderType): LLMProviderFactory | undefined {
    return this.factories.get(type);
  }

  has(type: LLMProviderType): boolean {
    return this.factories.has(type);
  }

  list(): LLMProviderType[] {
    return Array.from(this.factories.keys());
  }
}

/**
 * Global provider registry
 */
export const providerRegistry: LLMProviderRegistry = new DefaultProviderRegistry();

// =============================================================================
// Provider Factory
// =============================================================================

/**
 * Get LLM provider from configuration
 *
 * @param config - Provider configuration (optional, uses env vars if not provided)
 * @returns LLM provider instance
 * @throws Error if provider type is unknown or not available
 */
export function getLLMProvider(config?: Partial<LLMProviderConfig>): LLMProvider {
  // Determine provider type
  const providerType: LLMProviderType =
    (config?.provider as LLMProviderType) ||
    (process.env.GWI_LLM_PROVIDER as LLMProviderType) ||
    detectAvailableProvider();

  // Build full config
  const fullConfig: LLMProviderConfig = {
    provider: providerType,
    model:
      config?.model ||
      process.env.GWI_LLM_MODEL ||
      getDefaultModel(providerType),
    apiKey: config?.apiKey || process.env.GWI_LLM_API_KEY,
    baseUrl: config?.baseUrl || process.env.GWI_LLM_BASE_URL,
    options: config?.options,
  };

  // Get factory
  const factory = providerRegistry.get(providerType);
  if (!factory) {
    throw new Error(
      `Unknown LLM provider type: ${providerType}. Available: ${providerRegistry.list().join(', ')}`
    );
  }

  // Create provider
  const provider = factory(fullConfig);

  // Verify availability
  if (!provider.isAvailable()) {
    throw new Error(
      `LLM provider ${provider.name} is not available. Check API key and configuration.`
    );
  }

  return provider;
}

/**
 * Detect which provider is available based on environment variables
 */
function detectAvailableProvider(): LLMProviderType {
  // Check for provider-specific API keys in priority order
  if (process.env.GOOGLE_AI_API_KEY) {
    return 'google';
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }
  if (process.env.OPENAI_API_KEY) {
    return 'openai';
  }
  if (process.env.GWI_LLM_BASE_URL) {
    return 'openai_compat';
  }

  // Default to google (most common for GWI)
  return 'google';
}

/**
 * Get default model for provider type.
 * Delegates to provider-discovery's getDefaultModel which supports env var overrides.
 */
function getDefaultModel(providerType: LLMProviderType): string {
  // Map LLMProviderType to provider-discovery provider names
  const providerMap: Record<string, string> = {
    google: 'google',
    anthropic: 'anthropic',
    openai: 'openai',
    openai_compat: 'openai',
    custom: 'custom',
  };
  const provider = providerMap[providerType];
  if (!provider) return 'unknown';
  return getDefaultModelForProvider(provider);
}

/**
 * Check if any LLM provider is available
 */
export function isLLMAvailable(): boolean {
  try {
    const provider = getLLMProvider();
    return provider.isAvailable();
  } catch {
    return false;
  }
}

/**
 * List available providers (those with valid configuration)
 */
export function listAvailableProviders(): LLMProviderType[] {
  const available: LLMProviderType[] = [];

  for (const type of providerRegistry.list()) {
    try {
      const factory = providerRegistry.get(type);
      if (factory) {
        const provider = factory({
          provider: type,
          model: getDefaultModel(type),
        });
        if (provider.isAvailable()) {
          available.push(type);
        }
      }
    } catch {
      // Provider not available
    }
  }

  return available;
}
