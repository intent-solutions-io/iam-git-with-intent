/**
 * Multi-Model Client for Git With Intent
 *
 * Provides abstraction over Anthropic (Claude) and Google (Gemini) models.
 * Implements model selection based on task complexity.
 */

import type { ModelConfig, ModelProvider, ComplexityScore } from '../types.js';

/**
 * Model identifiers
 */
export const MODELS = {
  anthropic: {
    haiku: 'claude-3-haiku-20240307',
    sonnet: 'claude-sonnet-4-20250514',
    opus: 'claude-opus-4-20250514',
  },
  google: {
    flash: 'gemini-2.0-flash-exp',
    pro: 'gemini-1.5-pro',
  },
} as const;

/**
 * Chat message format
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Chat completion options
 */
export interface ChatOptions {
  messages: ChatMessage[];
  model?: ModelConfig;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

/**
 * Chat completion response
 */
export interface ChatResponse {
  content: string;
  model: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  finishReason: 'stop' | 'length' | 'error';
}

/**
 * Model client interface
 */
export interface ModelClient {
  chat(options: ChatOptions): Promise<ChatResponse>;
  provider: ModelProvider;
}

/**
 * Create an Anthropic client
 */
export async function createAnthropicClient(): Promise<ModelClient> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  const { Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  return {
    provider: 'anthropic',
    async chat(options: ChatOptions): Promise<ChatResponse> {
      const model = options.model?.model ?? MODELS.anthropic.sonnet;
      const systemMessage = options.messages.find((m) => m.role === 'system');
      const userMessages = options.messages.filter((m) => m.role !== 'system');

      const response = await client.messages.create({
        model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        system: systemMessage?.content,
        messages: userMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        stop_sequences: options.stopSequences,
      });

      const textContent = response.content.find((c) => c.type === 'text');

      return {
        content: textContent?.type === 'text' ? textContent.text : '',
        model,
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
        finishReason: response.stop_reason === 'end_turn' ? 'stop' : 'length',
      };
    },
  };
}

/**
 * Create a Google (Gemini) client
 */
export async function createGoogleClient(): Promise<ModelClient> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY environment variable is required');
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);

  return {
    provider: 'google',
    async chat(options: ChatOptions): Promise<ChatResponse> {
      const modelId = options.model?.model ?? MODELS.google.flash;
      const model = genAI.getGenerativeModel({ model: modelId });

      // Combine system message with first user message for Gemini
      const systemMessage = options.messages.find((m) => m.role === 'system');
      const userMessages = options.messages.filter((m) => m.role !== 'system');

      const contents = userMessages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      // Prepend system message to first user message
      if (systemMessage && contents.length > 0 && contents[0].role === 'user') {
        contents[0].parts[0].text = `${systemMessage.content}\n\n${contents[0].parts[0].text}`;
      }

      const result = await model.generateContent({
        contents,
        generationConfig: {
          maxOutputTokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.7,
          stopSequences: options.stopSequences,
        },
      });

      const response = result.response;
      const text = response.text();
      const usage = response.usageMetadata;

      return {
        content: text,
        model: modelId,
        tokensUsed: {
          input: usage?.promptTokenCount ?? 0,
          output: usage?.candidatesTokenCount ?? 0,
        },
        finishReason: 'stop',
      };
    },
  };
}

/**
 * Model selector based on task complexity
 */
export class ModelSelector {
  private anthropicClient?: ModelClient;
  private googleClient?: ModelClient;

  /**
   * Initialize clients lazily
   */
  private async getClient(provider: ModelProvider): Promise<ModelClient> {
    if (provider === 'anthropic') {
      if (!this.anthropicClient) {
        this.anthropicClient = await createAnthropicClient();
      }
      return this.anthropicClient;
    } else if (provider === 'google') {
      if (!this.googleClient) {
        this.googleClient = await createGoogleClient();
      }
      return this.googleClient;
    }
    throw new Error(`Unsupported provider: ${provider}`);
  }

  /**
   * Select a model based on complexity
   */
  selectModel(complexity: ComplexityScore, taskType: 'triage' | 'resolve' | 'review'): ModelConfig {
    // Triage always uses fast model
    if (taskType === 'triage') {
      return {
        provider: 'google',
        model: MODELS.google.flash,
        maxTokens: 2048,
      };
    }

    // Low complexity - use fast models
    if (complexity <= 3) {
      return {
        provider: 'google',
        model: MODELS.google.flash,
        maxTokens: 4096,
      };
    }

    // Medium complexity - use Claude Sonnet
    if (complexity <= 6) {
      return {
        provider: 'anthropic',
        model: MODELS.anthropic.sonnet,
        maxTokens: 8192,
      };
    }

    // High complexity - use Claude Opus
    return {
      provider: 'anthropic',
      model: MODELS.anthropic.opus,
      maxTokens: 16384,
    };
  }

  /**
   * Execute a chat completion with the selected model
   */
  async chat(options: ChatOptions): Promise<ChatResponse> {
    const provider = options.model?.provider ?? 'anthropic';
    const client = await this.getClient(provider);
    return client.chat(options);
  }
}

/**
 * Create a model selector instance
 */
export function createModelSelector(): ModelSelector {
  return new ModelSelector();
}
