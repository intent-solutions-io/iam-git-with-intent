/**
 * GPT-4 Turbo Code-Optimized Provider
 *
 * EPIC 004: Specialized provider for code-intensive tasks.
 * Built on OpenAI API with code-specific optimizations:
 * - System prompts optimized for code generation
 * - JSON mode for structured outputs
 * - Code-aware temperature defaults
 * - Extended context handling
 */

import type {
  LLMProvider,
  LLMProviderConfig,
  LLMJsonCompletionRequest,
  LLMJsonCompletionResponse,
  LLMTextCompletionRequest,
  LLMTextCompletionResponse,
} from '../types.js';
import {
  calculateRetryDelay,
  shouldRetry,
  DEFAULT_LLM_RETRY_POLICY,
  type LLMRetryPolicy,
} from '../provider-capabilities.js';

/**
 * Code task type for prompt optimization
 */
export type CodeTaskType =
  | 'generation' // Writing new code
  | 'review' // Reviewing existing code
  | 'refactor' // Improving code structure
  | 'fix' // Bug fixes
  | 'test' // Writing tests
  | 'documentation' // Code documentation
  | 'merge' // Merge conflict resolution
  | 'explain'; // Explaining code

/**
 * Code-optimized request options
 */
export interface CodeOptimizedOptions {
  /** Type of code task */
  codeTaskType?: CodeTaskType;
  /** Programming languages involved */
  languages?: string[];
  /** Whether to include thinking/reasoning */
  showReasoning?: boolean;
  /** Custom retry policy */
  retryPolicy?: Partial<LLMRetryPolicy>;
}

/**
 * GPT-4 Turbo Code-Optimized Provider
 *
 * Specialized for code generation and analysis tasks.
 */
export class GPT4TurboCodeProvider implements LLMProvider {
  readonly type = 'openai' as const;
  readonly name = 'GPT-4 Turbo (Code-Optimized)';

  private config: LLMProviderConfig;
  private apiKey: string | undefined;
  private baseUrl: string;
  private retryPolicy: LLMRetryPolicy;

  constructor(config: LLMProviderConfig, options?: { retryPolicy?: Partial<LLMRetryPolicy> }) {
    this.config = config;
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.retryPolicy = { ...DEFAULT_LLM_RETRY_POLICY, ...options?.retryPolicy };
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  getModel(): string {
    return this.config.model || 'gpt-4-turbo';
  }

  /**
   * Complete a JSON request with code-optimized prompting
   */
  async completeJson(
    request: LLMJsonCompletionRequest,
    options?: CodeOptimizedOptions
  ): Promise<LLMJsonCompletionResponse> {
    if (!this.isAvailable()) {
      throw new Error('GPT-4 Turbo provider not available: OPENAI_API_KEY not set');
    }

    const startTime = Date.now();
    const systemPrompt = this.buildCodeOptimizedSystemPrompt(request.system, options, true);

    // Build messages
    const messages: Array<{ role: string; content: string }> = [];
    messages.push({ role: 'system', content: systemPrompt });

    for (const msg of request.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Make request with retries
    const data = await this.makeRequestWithRetry({
      model: request.model || this.getModel(),
      messages,
      temperature: request.temperature ?? 0.1, // Lower temperature for code
      max_tokens: request.maxTokens || 4096,
      stop: request.stopSequences,
      response_format: { type: 'json_object' },
    });

    const latencyMs = Date.now() - startTime;
    const raw = data.choices[0]?.message?.content || '';

    // Parse JSON with error handling
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      // Try to extract JSON from markdown
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        json = JSON.parse(jsonMatch[1]);
      } else {
        const objMatch = raw.match(/\{[\s\S]*\}/);
        if (objMatch) {
          json = JSON.parse(objMatch[0]);
        } else {
          throw new Error(`Failed to parse JSON response: ${raw.slice(0, 200)}`);
        }
      }
    }

    return {
      json,
      raw,
      provider: 'openai',
      model: data.model,
      requestId: data.id,
      latencyMs,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      finishReason: data.choices[0]?.finish_reason,
    };
  }

  /**
   * Complete a text request with code-optimized prompting
   */
  async completeText(
    request: LLMTextCompletionRequest,
    options?: CodeOptimizedOptions
  ): Promise<LLMTextCompletionResponse> {
    if (!this.isAvailable()) {
      throw new Error('GPT-4 Turbo provider not available: OPENAI_API_KEY not set');
    }

    const startTime = Date.now();
    const systemPrompt = this.buildCodeOptimizedSystemPrompt(request.system, options, false);

    // Build messages
    const messages: Array<{ role: string; content: string }> = [];
    messages.push({ role: 'system', content: systemPrompt });

    for (const msg of request.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Make request with retries
    const data = await this.makeRequestWithRetry({
      model: request.model || this.getModel(),
      messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens || 4096,
      stop: request.stopSequences,
    });

    const latencyMs = Date.now() - startTime;

    return {
      text: data.choices[0]?.message?.content || '',
      provider: 'openai',
      model: data.model,
      requestId: data.id,
      latencyMs,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      finishReason: data.choices[0]?.finish_reason,
    };
  }

  /**
   * Build code-optimized system prompt
   */
  private buildCodeOptimizedSystemPrompt(
    basePrompt: string | undefined,
    options?: CodeOptimizedOptions,
    jsonMode: boolean = false
  ): string {
    const parts: string[] = [];

    // Add code-specific instructions based on task type
    if (options?.codeTaskType) {
      parts.push(this.getTaskTypeInstructions(options.codeTaskType));
    } else {
      parts.push(
        'You are an expert software engineer with deep knowledge of best practices, design patterns, and code quality.'
      );
    }

    // Add language-specific context
    if (options?.languages && options.languages.length > 0) {
      parts.push(
        `You are working with the following programming languages: ${options.languages.join(', ')}.`
      );
    }

    // Add reasoning instructions
    if (options?.showReasoning) {
      parts.push(
        'Think through the problem step by step before providing your solution. Explain your reasoning.'
      );
    }

    // Add base prompt
    if (basePrompt) {
      parts.push(basePrompt);
    }

    // Add JSON mode instructions
    if (jsonMode) {
      parts.push('Respond with valid JSON only. No markdown code fences or explanation text.');
    }

    // Add code quality guidelines
    parts.push(`
Code Quality Guidelines:
- Write clean, readable, and maintainable code
- Follow established patterns and conventions
- Consider edge cases and error handling
- Prefer simplicity over cleverness
- Use meaningful names for variables and functions
- Keep functions focused and single-purpose`);

    return parts.join('\n\n');
  }

  /**
   * Get task-specific instructions
   */
  private getTaskTypeInstructions(taskType: CodeTaskType): string {
    switch (taskType) {
      case 'generation':
        return `You are an expert code generator. Write clean, efficient, and well-documented code that follows best practices.`;
      case 'review':
        return `You are an expert code reviewer. Analyze code for bugs, security issues, performance problems, and style violations. Be thorough but constructive.`;
      case 'refactor':
        return `You are an expert at code refactoring. Improve code structure, readability, and maintainability while preserving behavior.`;
      case 'fix':
        return `You are an expert debugger. Identify the root cause of bugs and provide minimal, targeted fixes that don't introduce new issues.`;
      case 'test':
        return `You are an expert test engineer. Write comprehensive tests that cover edge cases, error conditions, and happy paths.`;
      case 'documentation':
        return `You are an expert technical writer. Write clear, accurate documentation that helps developers understand and use the code.`;
      case 'merge':
        return `You are an expert at resolving merge conflicts. Carefully analyze conflicting changes and produce a merged result that preserves the intent of both sides.`;
      case 'explain':
        return `You are an expert at explaining code. Break down complex code into understandable components and explain the logic clearly.`;
      default:
        return `You are an expert software engineer.`;
    }
  }

  /**
   * Make API request with retry logic
   */
  private async makeRequestWithRetry(
    body: Record<string, unknown>,
    attempt: number = 0
  ): Promise<OpenAIChatCompletionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.retryPolicy.timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`OpenAI API error: ${response.status} ${errorText}`);
        (error as unknown as Record<string, unknown>).status = response.status;
        throw error;
      }

      return (await response.json()) as OpenAIChatCompletionResponse;
    } catch (error) {
      if (shouldRetry(error, attempt, this.retryPolicy)) {
        const delay = calculateRetryDelay(attempt, this.retryPolicy);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.makeRequestWithRetry(body, attempt + 1);
      }
      throw error;
    }
  }
}

/**
 * OpenAI Chat Completion response structure
 */
interface OpenAIChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Create GPT-4 Turbo code-optimized provider
 */
export function createGPT4TurboCodeProvider(
  config?: Partial<LLMProviderConfig>,
  options?: { retryPolicy?: Partial<LLMRetryPolicy> }
): GPT4TurboCodeProvider {
  return new GPT4TurboCodeProvider(
    {
      provider: 'openai',
      model: config?.model || 'gpt-4-turbo',
      ...config,
    },
    options
  );
}

/**
 * Create GPT-4o code-optimized provider (latest model)
 */
export function createGPT4oCodeProvider(
  config?: Partial<LLMProviderConfig>,
  options?: { retryPolicy?: Partial<LLMRetryPolicy> }
): GPT4TurboCodeProvider {
  return new GPT4TurboCodeProvider(
    {
      provider: 'openai',
      model: config?.model || 'gpt-4o',
      ...config,
    },
    options
  );
}
