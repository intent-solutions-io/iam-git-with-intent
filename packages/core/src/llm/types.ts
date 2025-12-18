/**
 * Provider-Agnostic LLM Types
 *
 * Phase 26 Fixup: Generic LLM interface for all providers.
 * Supports Gemini, Claude, OpenAI, and OpenAI-compatible endpoints.
 */

// =============================================================================
// Provider Identification
// =============================================================================

/**
 * Known LLM provider types
 */
export type LLMProviderType =
  | 'google' // Google AI (Gemini)
  | 'anthropic' // Anthropic (Claude)
  | 'openai' // OpenAI (GPT)
  | 'openai_compat' // OpenAI-compatible (Azure, Ollama, vLLM, LM Studio, etc.)
  | 'custom'; // Custom provider

/**
 * LLM Provider configuration
 */
export interface LLMProviderConfig {
  /** Provider type */
  provider: LLMProviderType;
  /** Model identifier */
  model: string;
  /** API key (or use environment variable) */
  apiKey?: string;
  /** Base URL for API (required for openai_compat) */
  baseUrl?: string;
  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

// =============================================================================
// Request/Response Types
// =============================================================================

/**
 * Message role in conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * Chat message
 */
export interface LLMMessage {
  role: MessageRole;
  content: string;
}

/**
 * Request for JSON completion
 */
export interface LLMJsonCompletionRequest {
  /** System prompt */
  system?: string;
  /** Conversation messages */
  messages: LLMMessage[];
  /** JSON schema hint for structured output */
  schemaHint?: {
    name?: string;
    description?: string;
    schema?: Record<string, unknown>;
  };
  /** Temperature (0-1, lower = more deterministic) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Model override (uses config.model if not provided) */
  model?: string;
  /** Stop sequences */
  stopSequences?: string[];
}

/**
 * Usage statistics
 */
export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Response from JSON completion
 */
export interface LLMJsonCompletionResponse {
  /** Parsed JSON response */
  json: unknown;
  /** Raw text response */
  raw: string;
  /** Provider name */
  provider: LLMProviderType;
  /** Model used */
  model: string;
  /** Request ID (if available) */
  requestId?: string;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Token usage (if available) */
  usage?: LLMUsage;
  /** Finish reason */
  finishReason?: string;
}

/**
 * Request for text completion (non-JSON)
 */
export interface LLMTextCompletionRequest {
  /** System prompt */
  system?: string;
  /** Conversation messages */
  messages: LLMMessage[];
  /** Temperature */
  temperature?: number;
  /** Maximum tokens */
  maxTokens?: number;
  /** Model override */
  model?: string;
  /** Stop sequences */
  stopSequences?: string[];
}

/**
 * Response from text completion
 */
export interface LLMTextCompletionResponse {
  /** Text response */
  text: string;
  /** Provider name */
  provider: LLMProviderType;
  /** Model used */
  model: string;
  /** Request ID */
  requestId?: string;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Token usage */
  usage?: LLMUsage;
  /** Finish reason */
  finishReason?: string;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * LLM Provider Interface
 *
 * All LLM providers must implement this interface.
 */
export interface LLMProvider {
  /** Provider type */
  readonly type: LLMProviderType;

  /** Provider name for display */
  readonly name: string;

  /** Check if provider is available/configured */
  isAvailable(): boolean;

  /** Get the configured model */
  getModel(): string;

  /**
   * Complete a request expecting JSON output
   *
   * @param request - The completion request
   * @returns JSON completion response
   */
  completeJson(request: LLMJsonCompletionRequest): Promise<LLMJsonCompletionResponse>;

  /**
   * Complete a request expecting text output
   *
   * @param request - The completion request
   * @returns Text completion response
   */
  completeText(request: LLMTextCompletionRequest): Promise<LLMTextCompletionResponse>;
}

// =============================================================================
// Factory Types
// =============================================================================

/**
 * LLM Provider Factory function
 */
export type LLMProviderFactory = (config: LLMProviderConfig) => LLMProvider;

/**
 * Registry of provider factories
 */
export interface LLMProviderRegistry {
  register(type: LLMProviderType, factory: LLMProviderFactory): void;
  get(type: LLMProviderType): LLMProviderFactory | undefined;
  has(type: LLMProviderType): boolean;
  list(): LLMProviderType[];
}
