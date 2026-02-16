/**
 * Custom Provider Registry
 *
 * Enables plug-and-play LLM provider configuration.
 * Users can register custom providers with their own API keys,
 * base URLs, capabilities, and cost metadata.
 *
 * This extends the built-in provider system to support:
 * - OpenAI-compatible endpoints (Ollama, vLLM, LM Studio, etc.)
 * - Custom cloud providers (Groq, Together, DeepSeek, etc.)
 * - Self-hosted models
 */

import { z } from 'zod';
import type { LLMProviderFactory } from './types.js';
import {
  type ProviderCapabilities,
  type ProviderCostMetadata,
  type TokenCost,
  PROVIDER_CAPABILITIES,
  PROVIDER_COSTS,
  type ProviderInfo,
} from './provider-capabilities.js';

/**
 * Environment variable mapping for auto-discovery
 */
export const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_AI_API_KEY',
  groq: 'GROQ_API_KEY',
  together: 'TOGETHER_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  cohere: 'COHERE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

/**
 * Custom provider configuration schema
 */
export const CustomProviderConfigSchema = z.object({
  /** Provider identifier (e.g., 'groq', 'together', 'custom') */
  provider: z.string().min(1).max(50),
  /** Model identifier */
  model: z.string().min(1).max(100),
  /** Environment variable name for API key */
  apiKeyEnvVar: z.string().min(1).max(100),
  /** Base URL for the API (required for custom endpoints) */
  baseUrl: z.string().url().optional(),
  /** Provider capabilities */
  capabilities: z.object({
    jsonMode: z.boolean().default(true),
    functionCalling: z.boolean().default(false),
    vision: z.boolean().default(false),
    streaming: z.boolean().default(true),
    codeExecution: z.boolean().default(false),
    maxContextTokens: z.number().positive().default(32000),
    maxOutputTokens: z.number().positive().default(4096),
    systemPrompts: z.boolean().default(true),
    codeOptimized: z.boolean().default(false),
    reasoningOptimized: z.boolean().default(false),
  }),
  /** Token cost for budgeting */
  cost: z.object({
    inputPerToken: z.number().min(0),
    outputPerToken: z.number().min(0),
    minRequestCost: z.number().min(0).optional(),
  }),
  /** Cost tier (1=cheapest, 5=most expensive) */
  costTier: z.number().min(1).max(5).default(3),
  /** Display name for UI */
  displayName: z.string().max(100).optional(),
  /** API compatibility mode */
  apiCompat: z.enum(['openai', 'anthropic', 'google', 'custom']).default('openai'),
});

export type CustomProviderConfig = z.infer<typeof CustomProviderConfigSchema>;

/**
 * Registry entry combining config with runtime state
 */
interface RegistryEntry {
  config: CustomProviderConfig;
  factory?: LLMProviderFactory;
  registeredAt: number;
}

/**
 * Custom Provider Registry
 *
 * Manages user-registered LLM providers alongside built-in providers.
 */
export class CustomProviderRegistry {
  private customProviders = new Map<string, RegistryEntry>();

  /**
   * Register a custom provider
   * @param config - Provider configuration
   */
  register(config: CustomProviderConfig): void {
    const parsed = CustomProviderConfigSchema.parse(config);
    const key = `${parsed.provider}:${parsed.model}`;

    // Update PROVIDER_CAPABILITIES and PROVIDER_COSTS for selection policy
    const capabilities: ProviderCapabilities = {
      jsonMode: parsed.capabilities.jsonMode,
      functionCalling: parsed.capabilities.functionCalling,
      vision: parsed.capabilities.vision,
      streaming: parsed.capabilities.streaming,
      codeExecution: parsed.capabilities.codeExecution,
      maxContextTokens: parsed.capabilities.maxContextTokens,
      maxOutputTokens: parsed.capabilities.maxOutputTokens,
      systemPrompts: parsed.capabilities.systemPrompts,
      codeOptimized: parsed.capabilities.codeOptimized,
      reasoningOptimized: parsed.capabilities.reasoningOptimized,
    };

    const costMeta: ProviderCostMetadata = {
      provider: parsed.provider,
      model: parsed.model,
      cost: parsed.cost as TokenCost,
      tier: parsed.costTier,
      updatedAt: new Date().toISOString(),
    };

    // Store in our registry
    this.customProviders.set(key, {
      config: parsed,
      registeredAt: Date.now(),
    });

    // Also inject into the static maps for selection policy compatibility
    // Note: This modifies the shared state - be careful in multi-tenant scenarios
    (PROVIDER_CAPABILITIES as Record<string, ProviderCapabilities>)[key] = capabilities;
    (PROVIDER_COSTS as Record<string, ProviderCostMetadata>)[key] = costMeta;
  }

  /**
   * Unregister a custom provider
   * @param providerModel - Key in format "provider:model"
   */
  unregister(providerModel: string): boolean {
    const existed = this.customProviders.delete(providerModel);
    if (existed) {
      delete (PROVIDER_CAPABILITIES as Record<string, ProviderCapabilities>)[providerModel];
      delete (PROVIDER_COSTS as Record<string, ProviderCostMetadata>)[providerModel];
    }
    return existed;
  }

  /**
   * Get a registered custom provider config
   */
  get(providerModel: string): CustomProviderConfig | undefined {
    return this.customProviders.get(providerModel)?.config;
  }

  /**
   * Check if a custom provider is registered
   */
  has(providerModel: string): boolean {
    return this.customProviders.has(providerModel);
  }

  /**
   * Get all custom provider keys
   */
  keys(): string[] {
    return Array.from(this.customProviders.keys());
  }

  /**
   * Get all registered providers (built-in + custom)
   */
  getAll(): ProviderInfo[] {
    const all: ProviderInfo[] = [];

    // Add built-in providers
    for (const key of Object.keys(PROVIDER_CAPABILITIES)) {
      const colonIdx = key.indexOf(':');
      const provider = colonIdx === -1 ? key : key.slice(0, colonIdx);
      const model = colonIdx === -1 ? key : key.slice(colonIdx + 1);
      const capabilities = PROVIDER_CAPABILITIES[key];
      const cost = PROVIDER_COSTS[key];

      all.push({
        provider,
        model,
        displayName: `${provider}/${model}`,
        capabilities,
        cost,
        retryPolicy: {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
          backoffMultiplier: 2,
          retryOnStatusCodes: [429, 500, 502, 503, 504],
          retryOnTimeout: true,
          timeoutMs: 60000,
        },
      });
    }

    return all;
  }

  /**
   * Get custom providers only
   */
  getCustomProviders(): Array<{ key: string; config: CustomProviderConfig }> {
    return Array.from(this.customProviders.entries()).map(([key, entry]) => ({
      key,
      config: entry.config,
    }));
  }

  /**
   * Clear all custom providers
   */
  clear(): void {
    for (const key of this.customProviders.keys()) {
      delete (PROVIDER_CAPABILITIES as Record<string, ProviderCapabilities>)[key];
      delete (PROVIDER_COSTS as Record<string, ProviderCostMetadata>)[key];
    }
    this.customProviders.clear();
  }
}

/**
 * Global custom provider registry instance
 */
export const customProviderRegistry = new CustomProviderRegistry();

/**
 * Register a custom provider in the global registry
 */
export function registerCustomProvider(config: CustomProviderConfig): void {
  customProviderRegistry.register(config);
}

/**
 * Unregister a custom provider from the global registry
 */
export function unregisterCustomProvider(providerModel: string): boolean {
  return customProviderRegistry.unregister(providerModel);
}

/**
 * Get all available providers (built-in + custom)
 */
export function getAllProviders(): ProviderInfo[] {
  return customProviderRegistry.getAll();
}
