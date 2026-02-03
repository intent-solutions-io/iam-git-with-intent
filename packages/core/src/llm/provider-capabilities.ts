/**
 * Provider Capabilities and Cost Metadata
 *
 * EPIC 004: Formalized provider interface contract with:
 * - Cost metadata for budgeting
 * - Capability flags for selection
 * - Retry policies for reliability
 */

import { z } from 'zod';

// =============================================================================
// Cost Metadata
// =============================================================================

/**
 * Cost per token (in USD)
 */
export const TokenCostSchema = z.object({
  /** Cost per input token (in USD) */
  inputPerToken: z.number().min(0),
  /** Cost per output token (in USD) */
  outputPerToken: z.number().min(0),
  /** Minimum cost per request (if any) */
  minRequestCost: z.number().min(0).optional(),
});

export type TokenCost = z.infer<typeof TokenCostSchema>;

/**
 * Provider cost metadata
 */
export const ProviderCostMetadataSchema = z.object({
  /** Provider identifier */
  provider: z.string(),
  /** Model identifier */
  model: z.string(),
  /** Cost per token */
  cost: TokenCostSchema,
  /** Cost tier (1=cheapest, 5=most expensive) */
  tier: z.number().min(1).max(5),
  /** Last updated timestamp */
  updatedAt: z.string().datetime(),
});

export type ProviderCostMetadata = z.infer<typeof ProviderCostMetadataSchema>;

/**
 * Built-in cost metadata for known models (as of 2025)
 */
export const PROVIDER_COSTS: Record<string, ProviderCostMetadata> = {
  // Google Gemini
  'google:gemini-2.0-flash': {
    provider: 'google',
    model: 'gemini-2.0-flash',
    cost: { inputPerToken: 0.000000075, outputPerToken: 0.0000003 },
    tier: 1,
    updatedAt: '2025-01-01T00:00:00Z',
  },
  'google:gemini-1.5-pro': {
    provider: 'google',
    model: 'gemini-1.5-pro',
    cost: { inputPerToken: 0.00000125, outputPerToken: 0.000005 },
    tier: 3,
    updatedAt: '2025-01-01T00:00:00Z',
  },
  // Anthropic Claude
  'anthropic:claude-sonnet-4-20250514': {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    cost: { inputPerToken: 0.000003, outputPerToken: 0.000015 },
    tier: 3,
    updatedAt: '2025-01-01T00:00:00Z',
  },
  'anthropic:claude-opus-4-20250514': {
    provider: 'anthropic',
    model: 'claude-opus-4-20250514',
    cost: { inputPerToken: 0.000015, outputPerToken: 0.000075 },
    tier: 5,
    updatedAt: '2025-01-01T00:00:00Z',
  },
  'anthropic:claude-3-5-haiku-20241022': {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    cost: { inputPerToken: 0.0000008, outputPerToken: 0.000004 },
    tier: 1,
    updatedAt: '2025-01-01T00:00:00Z',
  },
  // OpenAI
  'openai:gpt-4o': {
    provider: 'openai',
    model: 'gpt-4o',
    cost: { inputPerToken: 0.0000025, outputPerToken: 0.00001 },
    tier: 3,
    updatedAt: '2025-01-01T00:00:00Z',
  },
  'openai:gpt-4o-mini': {
    provider: 'openai',
    model: 'gpt-4o-mini',
    cost: { inputPerToken: 0.00000015, outputPerToken: 0.0000006 },
    tier: 1,
    updatedAt: '2025-01-01T00:00:00Z',
  },
  'openai:gpt-4-turbo': {
    provider: 'openai',
    model: 'gpt-4-turbo',
    cost: { inputPerToken: 0.00001, outputPerToken: 0.00003 },
    tier: 4,
    updatedAt: '2025-01-01T00:00:00Z',
  },
  'openai:o1': {
    provider: 'openai',
    model: 'o1',
    cost: { inputPerToken: 0.000015, outputPerToken: 0.00006 },
    tier: 5,
    updatedAt: '2025-01-01T00:00:00Z',
  },
};

/**
 * Get cost metadata for a provider/model combination
 */
export function getProviderCost(provider: string, model: string): ProviderCostMetadata | undefined {
  return PROVIDER_COSTS[`${provider}:${model}`];
}

/**
 * Calculate cost for a request based on token usage
 */
export function calculateRequestCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costMeta = getProviderCost(provider, model);
  if (!costMeta) {
    return 0; // Unknown cost
  }
  const cost =
    inputTokens * costMeta.cost.inputPerToken + outputTokens * costMeta.cost.outputPerToken;
  return Math.max(cost, costMeta.cost.minRequestCost || 0);
}

// =============================================================================
// Provider Capabilities
// =============================================================================

/**
 * Provider capability flags
 */
export const ProviderCapabilitiesSchema = z.object({
  /** Supports JSON mode / structured output */
  jsonMode: z.boolean(),
  /** Supports function/tool calling */
  functionCalling: z.boolean(),
  /** Supports vision/image input */
  vision: z.boolean(),
  /** Supports streaming responses */
  streaming: z.boolean(),
  /** Supports code execution / interpreter */
  codeExecution: z.boolean(),
  /** Maximum context window (tokens) */
  maxContextTokens: z.number().positive(),
  /** Maximum output tokens */
  maxOutputTokens: z.number().positive(),
  /** Supports system prompts */
  systemPrompts: z.boolean(),
  /** Code-optimized (better for code generation) */
  codeOptimized: z.boolean(),
  /** Reasoning-optimized (better for complex reasoning) */
  reasoningOptimized: z.boolean(),
});

export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;

/**
 * Built-in capabilities for known models
 */
export const PROVIDER_CAPABILITIES: Record<string, ProviderCapabilities> = {
  // Google Gemini
  'google:gemini-2.0-flash': {
    jsonMode: true,
    functionCalling: true,
    vision: true,
    streaming: true,
    codeExecution: false,
    maxContextTokens: 1000000,
    maxOutputTokens: 8192,
    systemPrompts: true,
    codeOptimized: false,
    reasoningOptimized: false,
  },
  'google:gemini-1.5-pro': {
    jsonMode: true,
    functionCalling: true,
    vision: true,
    streaming: true,
    codeExecution: true,
    maxContextTokens: 2000000,
    maxOutputTokens: 8192,
    systemPrompts: true,
    codeOptimized: true,
    reasoningOptimized: true,
  },
  // Anthropic Claude
  'anthropic:claude-sonnet-4-20250514': {
    jsonMode: true,
    functionCalling: true,
    vision: true,
    streaming: true,
    codeExecution: false,
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
    systemPrompts: true,
    codeOptimized: true,
    reasoningOptimized: true,
  },
  'anthropic:claude-opus-4-20250514': {
    jsonMode: true,
    functionCalling: true,
    vision: true,
    streaming: true,
    codeExecution: false,
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
    systemPrompts: true,
    codeOptimized: true,
    reasoningOptimized: true,
  },
  'anthropic:claude-3-5-haiku-20241022': {
    jsonMode: true,
    functionCalling: true,
    vision: true,
    streaming: true,
    codeExecution: false,
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
    systemPrompts: true,
    codeOptimized: false,
    reasoningOptimized: false,
  },
  // OpenAI
  'openai:gpt-4o': {
    jsonMode: true,
    functionCalling: true,
    vision: true,
    streaming: true,
    codeExecution: false,
    maxContextTokens: 128000,
    maxOutputTokens: 16384,
    systemPrompts: true,
    codeOptimized: true,
    reasoningOptimized: true,
  },
  'openai:gpt-4o-mini': {
    jsonMode: true,
    functionCalling: true,
    vision: true,
    streaming: true,
    codeExecution: false,
    maxContextTokens: 128000,
    maxOutputTokens: 16384,
    systemPrompts: true,
    codeOptimized: false,
    reasoningOptimized: false,
  },
  'openai:gpt-4-turbo': {
    jsonMode: true,
    functionCalling: true,
    vision: true,
    streaming: true,
    codeExecution: false,
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
    systemPrompts: true,
    codeOptimized: true,
    reasoningOptimized: true,
  },
  'openai:o1': {
    jsonMode: true,
    functionCalling: false,
    vision: true,
    streaming: false,
    codeExecution: false,
    maxContextTokens: 200000,
    maxOutputTokens: 100000,
    systemPrompts: false,
    codeOptimized: true,
    reasoningOptimized: true,
  },
};

/**
 * Get capabilities for a provider/model combination
 */
export function getProviderCapabilities(
  provider: string,
  model: string
): ProviderCapabilities | undefined {
  return PROVIDER_CAPABILITIES[`${provider}:${model}`];
}

// =============================================================================
// Retry Policy
// =============================================================================

/**
 * LLM retry policy configuration
 */
export const LLMRetryPolicySchema = z.object({
  /** Maximum number of retry attempts */
  maxRetries: z.number().min(0).max(10).default(3),
  /** Initial delay between retries (ms) */
  initialDelayMs: z.number().min(100).max(10000).default(1000),
  /** Maximum delay between retries (ms) */
  maxDelayMs: z.number().min(1000).max(60000).default(30000),
  /** Exponential backoff multiplier */
  backoffMultiplier: z.number().min(1).max(4).default(2),
  /** Retry on these HTTP status codes */
  retryOnStatusCodes: z.array(z.number()).default([429, 500, 502, 503, 504]),
  /** Retry on timeout errors */
  retryOnTimeout: z.boolean().default(true),
  /** Request timeout (ms) */
  timeoutMs: z.number().min(1000).max(300000).default(60000),
});

export type LLMRetryPolicy = z.infer<typeof LLMRetryPolicySchema>;

/**
 * Default retry policy
 */
export const DEFAULT_LLM_RETRY_POLICY: LLMRetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryOnStatusCodes: [429, 500, 502, 503, 504],
  retryOnTimeout: true,
  timeoutMs: 60000,
};

/**
 * Calculate delay for retry attempt with exponential backoff
 */
export function calculateRetryDelay(attempt: number, policy: LLMRetryPolicy = DEFAULT_LLM_RETRY_POLICY): number {
  const delay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt);
  return Math.min(delay, policy.maxDelayMs);
}

/**
 * Check if an error should be retried based on policy
 */
export function shouldRetry(
  error: unknown,
  attempt: number,
  policy: LLMRetryPolicy = DEFAULT_LLM_RETRY_POLICY
): boolean {
  if (attempt >= policy.maxRetries) {
    return false;
  }

  // Check for timeout errors
  if (policy.retryOnTimeout && isTimeoutError(error)) {
    return true;
  }

  // Check for HTTP status codes
  const statusCode = getErrorStatusCode(error);
  if (statusCode && policy.retryOnStatusCodes.includes(statusCode)) {
    return true;
  }

  return false;
}

/**
 * Check if error is a timeout error
 */
function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('etimedout') ||
      message.includes('esockettimedout')
    );
  }
  return false;
}

/**
 * Extract HTTP status code from error
 */
function getErrorStatusCode(error: unknown): number | undefined {
  if (error instanceof Error) {
    // Check for status property
    const anyError = error as unknown as Record<string, unknown>;
    if (typeof anyError.status === 'number') {
      return anyError.status;
    }
    if (typeof anyError.statusCode === 'number') {
      return anyError.statusCode;
    }
    // Check message for status code with context to avoid false positives
    // Matches patterns like "status 404", "status: 500", "HTTP 502", "error 503"
    const match = error.message.match(
      /(?:status(?:\s+code)?|http|error)[\s:]+(\d{3})\b/i
    );
    if (match) {
      const code = parseInt(match[1], 10);
      // Only return if it's a valid HTTP error status code (4xx or 5xx)
      if (code >= 400 && code < 600) {
        return code;
      }
    }
  }
  return undefined;
}

// =============================================================================
// Extended Provider Info
// =============================================================================

/**
 * Complete provider information
 */
export interface ProviderInfo {
  /** Provider type */
  provider: string;
  /** Model identifier */
  model: string;
  /** Display name */
  displayName: string;
  /** Cost metadata */
  cost?: ProviderCostMetadata;
  /** Capabilities */
  capabilities?: ProviderCapabilities;
  /** Default retry policy */
  retryPolicy: LLMRetryPolicy;
}

/**
 * Get complete provider info
 */
export function getProviderInfo(provider: string, model: string): ProviderInfo {
  return {
    provider,
    model,
    displayName: `${provider}/${model}`,
    cost: getProviderCost(provider, model),
    capabilities: getProviderCapabilities(provider, model),
    retryPolicy: DEFAULT_LLM_RETRY_POLICY,
  };
}
