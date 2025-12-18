/**
 * OpenAI-Compatible LLM Provider
 *
 * Adapter for OpenAI and OpenAI-compatible APIs:
 * - OpenAI
 * - Azure OpenAI
 * - Local gateways (Ollama, vLLM, LM Studio)
 * - Other vendors with OpenAI-compatible endpoints
 */

import type {
  LLMProvider,
  LLMProviderConfig,
  LLMProviderType,
  LLMJsonCompletionRequest,
  LLMJsonCompletionResponse,
  LLMTextCompletionRequest,
  LLMTextCompletionResponse,
} from '../types.js';

/**
 * OpenAI-Compatible Provider
 */
export class OpenAICompatLLMProvider implements LLMProvider {
  readonly type: LLMProviderType;
  readonly name: string;

  private config: LLMProviderConfig;
  private apiKey: string | undefined;
  private baseUrl: string | undefined;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.type = config.provider;
    this.name = this.getProviderName(config);

    // API key from config or environment
    this.apiKey =
      config.apiKey ||
      process.env.GWI_LLM_API_KEY ||
      process.env.OPENAI_API_KEY;

    // Base URL from config or environment
    this.baseUrl =
      config.baseUrl ||
      process.env.GWI_LLM_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      'https://api.openai.com/v1';
  }

  private getProviderName(config: LLMProviderConfig): string {
    if (config.provider === 'openai') {
      return 'OpenAI';
    }
    if (config.baseUrl?.includes('azure')) {
      return 'Azure OpenAI';
    }
    if (config.baseUrl?.includes('localhost') || config.baseUrl?.includes('127.0.0.1')) {
      return 'Local LLM';
    }
    return 'OpenAI-Compatible';
  }

  isAvailable(): boolean {
    // Local endpoints may not require API key
    if (this.isLocalEndpoint()) {
      return !!this.baseUrl;
    }
    return !!this.apiKey && !!this.baseUrl;
  }

  private isLocalEndpoint(): boolean {
    return (
      !!this.baseUrl &&
      (this.baseUrl.includes('localhost') ||
        this.baseUrl.includes('127.0.0.1') ||
        this.baseUrl.includes('0.0.0.0'))
    );
  }

  getModel(): string {
    return this.config.model || 'gpt-4o';
  }

  async completeJson(request: LLMJsonCompletionRequest): Promise<LLMJsonCompletionResponse> {
    if (!this.isAvailable()) {
      throw new Error(
        `OpenAI-compatible provider not available: ${
          this.isLocalEndpoint() ? 'base URL not set' : 'API key not set'
        }`
      );
    }

    const startTime = Date.now();

    // Build messages
    const messages: Array<{ role: string; content: string }> = [];
    if (request.system) {
      messages.push({
        role: 'system',
        content: request.system + '\n\nRespond with valid JSON only.',
      });
    }
    for (const msg of request.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Build request body
    const body: Record<string, unknown> = {
      model: request.model || this.getModel(),
      messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens,
      stop: request.stopSequences,
    };

    // Add response format for JSON if supported
    if (!this.isLocalEndpoint()) {
      body.response_format = { type: 'json_object' };
    }

    // Make request
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as OpenAIChatCompletionResponse;
    const latencyMs = Date.now() - startTime;

    const raw = data.choices[0]?.message?.content || '';

    // Parse JSON
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
      provider: this.type,
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

  async completeText(request: LLMTextCompletionRequest): Promise<LLMTextCompletionResponse> {
    if (!this.isAvailable()) {
      throw new Error(
        `OpenAI-compatible provider not available: ${
          this.isLocalEndpoint() ? 'base URL not set' : 'API key not set'
        }`
      );
    }

    const startTime = Date.now();

    // Build messages
    const messages: Array<{ role: string; content: string }> = [];
    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }
    for (const msg of request.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Make request
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: request.model || this.getModel(),
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stop: request.stopSequences,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as OpenAIChatCompletionResponse;
    const latencyMs = Date.now() - startTime;

    return {
      text: data.choices[0]?.message?.content || '',
      provider: this.type,
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
 * Create OpenAI provider
 */
export function createOpenAIProvider(config: LLMProviderConfig): LLMProvider {
  return new OpenAICompatLLMProvider({ ...config, provider: 'openai' });
}

/**
 * Create OpenAI-compatible provider
 */
export function createOpenAICompatProvider(config: LLMProviderConfig): LLMProvider {
  return new OpenAICompatLLMProvider(config);
}
