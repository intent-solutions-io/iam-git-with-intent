/**
 * Provider Discovery
 *
 * Auto-discovers available LLM providers from environment variables.
 * Provides a unified interface for checking provider availability
 * across built-in and custom providers.
 */

import type { LLMProviderType } from './types.js';
import { PROVIDER_ENV_VARS } from './provider-registry.js';

/**
 * Provider availability status
 */
export interface ProviderAvailability {
  /** Provider identifier */
  provider: string;
  /** Whether the provider is available (API key present) */
  available: boolean;
  /** Environment variable checked */
  envVar: string;
  /** Whether the env var is set (redacted for security) */
  hasApiKey: boolean;
  /** Any additional notes */
  notes?: string;
}

/**
 * Extended provider environment variable mapping
 * Includes common alternative env var names
 */
const EXTENDED_PROVIDER_ENV_VARS: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GOOGLE_AI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  together: ['TOGETHER_API_KEY', 'TOGETHER_AI_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  fireworks: ['FIREWORKS_API_KEY', 'FIREWORKS_AI_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  cohere: ['COHERE_API_KEY', 'CO_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  azure: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_KEY'],
  aws: ['AWS_ACCESS_KEY_ID'], // For Bedrock
  vertex: ['GOOGLE_APPLICATION_CREDENTIALS'], // For Vertex AI
};

/**
 * Default models for each provider
 */
const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
  groq: 'llama-3.3-70b-versatile',
  together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  deepseek: 'deepseek-chat',
  fireworks: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
  mistral: 'mistral-large-latest',
  cohere: 'command-r-plus',
  openrouter: 'anthropic/claude-sonnet-4',
};

/**
 * Check if a specific environment variable is set
 */
function isEnvVarSet(envVar: string): boolean {
  const value = process.env[envVar];
  return value !== undefined && value.trim() !== '';
}

/**
 * Find the first set environment variable from a list
 */
function findSetEnvVar(envVars: string[]): string | undefined {
  return envVars.find(isEnvVarSet);
}

/**
 * Discover which providers are available based on environment variables
 */
export function discoverProviders(): ProviderAvailability[] {
  const results: ProviderAvailability[] = [];

  for (const [provider, envVars] of Object.entries(EXTENDED_PROVIDER_ENV_VARS)) {
    const setVar = findSetEnvVar(envVars);
    const primaryVar = envVars[0];

    results.push({
      provider,
      available: setVar !== undefined,
      envVar: setVar ?? primaryVar,
      hasApiKey: setVar !== undefined,
      notes: setVar && setVar !== primaryVar ? `Using ${setVar}` : undefined,
    });
  }

  return results;
}

/**
 * Get a list of available provider types
 */
export function getAvailableProviderTypes(): LLMProviderType[] {
  const available = discoverProviders()
    .filter((p) => p.available)
    .map((p) => p.provider as LLMProviderType);

  // Map provider names to LLMProviderType
  const providerMap: Record<string, LLMProviderType> = {
    anthropic: 'anthropic',
    openai: 'openai',
    google: 'google',
    groq: 'openai_compat',
    together: 'openai_compat',
    deepseek: 'openai_compat',
    fireworks: 'openai_compat',
    mistral: 'openai_compat',
    cohere: 'custom',
    openrouter: 'openai_compat',
    azure: 'openai_compat',
  };

  return available.map((p) => providerMap[p] ?? 'custom').filter((v, i, a) => a.indexOf(v) === i);
}

/**
 * Check if a specific provider is available
 */
export function isProviderAvailable(provider: string): boolean {
  const extended = EXTENDED_PROVIDER_ENV_VARS[provider];
  const single = PROVIDER_ENV_VARS[provider];
  const envVars = extended ?? (single ? [single] : []);
  if (envVars.length === 0) {
    return false;
  }
  return findSetEnvVar(envVars) !== undefined;
}

/**
 * Get the API key for a provider (from environment)
 */
export function getProviderApiKey(provider: string): string | undefined {
  const extended = EXTENDED_PROVIDER_ENV_VARS[provider];
  const single = PROVIDER_ENV_VARS[provider];
  const envVars = extended ?? (single ? [single] : []);
  if (envVars.length === 0) {
    return undefined;
  }
  const setVar = findSetEnvVar(envVars);
  return setVar ? process.env[setVar] : undefined;
}

/**
 * Get the default model for a provider
 */
export function getDefaultModel(provider: string): string {
  return DEFAULT_MODELS[provider] ?? 'default';
}

/**
 * Get a summary of provider availability
 */
export function getProviderSummary(): {
  available: string[];
  unavailable: string[];
  total: number;
} {
  const discovery = discoverProviders();
  const available = discovery.filter((p) => p.available).map((p) => p.provider);
  const unavailable = discovery.filter((p) => !p.available).map((p) => p.provider);

  return {
    available,
    unavailable,
    total: discovery.length,
  };
}

/**
 * Auto-select the best available provider based on priority
 */
export function autoSelectProvider(): { provider: string; model: string } | null {
  // Priority order for auto-selection
  const priority = [
    'anthropic', // Claude - best for code
    'openai', // GPT-4o - very capable
    'google', // Gemini - fast and capable
    'deepseek', // DeepSeek - good for code, affordable
    'groq', // Groq - fast inference
    'together', // Together - good model selection
    'fireworks', // Fireworks - fast inference
    'mistral', // Mistral - European alternative
    'openrouter', // OpenRouter - aggregator
    'cohere', // Cohere - enterprise focus
  ];

  for (const provider of priority) {
    if (isProviderAvailable(provider)) {
      return {
        provider,
        model: getDefaultModel(provider),
      };
    }
  }

  return null;
}

/**
 * Validate that required providers are available
 */
export function validateRequiredProviders(required: string[]): {
  valid: boolean;
  missing: string[];
  available: string[];
} {
  const missing: string[] = [];
  const available: string[] = [];

  for (const provider of required) {
    if (isProviderAvailable(provider)) {
      available.push(provider);
    } else {
      missing.push(provider);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    available,
  };
}
