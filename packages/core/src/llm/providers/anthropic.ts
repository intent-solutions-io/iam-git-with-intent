/**
 * Anthropic (Claude) LLM Provider
 *
 * Adapter for Anthropic's Claude SDK.
 */

import type {
  LLMProvider,
  LLMProviderConfig,
  LLMJsonCompletionRequest,
  LLMJsonCompletionResponse,
  LLMTextCompletionRequest,
  LLMTextCompletionResponse,
} from '../types.js';

/**
 * Anthropic Provider (Claude)
 */
export class AnthropicLLMProvider implements LLMProvider {
  readonly type = 'anthropic' as const;
  readonly name = 'Anthropic (Claude)';

  private config: LLMProviderConfig;
  private apiKey: string | undefined;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  getModel(): string {
    return this.config.model || 'claude-sonnet-4-20250514';
  }

  async completeJson(request: LLMJsonCompletionRequest): Promise<LLMJsonCompletionResponse> {
    if (!this.isAvailable()) {
      throw new Error('Anthropic provider not available: ANTHROPIC_API_KEY not set');
    }

    const startTime = Date.now();
    const Anthropic = (await import('@anthropic-ai/sdk')).default;

    const client = new Anthropic({ apiKey: this.apiKey });

    const messages = request.messages.map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }));

    // Add JSON instruction to system prompt
    let systemPrompt = request.system || '';
    systemPrompt += '\n\nRespond with valid JSON only. No markdown fences or explanation.';

    const message = await client.messages.create({
      model: request.model || this.getModel(),
      max_tokens: request.maxTokens || 8192,
      system: systemPrompt,
      messages,
      temperature: request.temperature ?? 0.2,
      stop_sequences: request.stopSequences,
    });

    const latencyMs = Date.now() - startTime;

    // Extract text
    const textContent = message.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    const raw = textContent.text;

    // Parse JSON, handling potential markdown wrapping
    let jsonText = raw;
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else {
      const objMatch = raw.match(/\{[\s\S]*\}/);
      if (objMatch) {
        jsonText = objMatch[0];
      }
    }

    let json: unknown;
    try {
      json = JSON.parse(jsonText);
    } catch {
      throw new Error(`Failed to parse JSON response: ${raw.slice(0, 200)}`);
    }

    return {
      json,
      raw,
      provider: 'anthropic',
      model: message.model,
      requestId: message.id,
      latencyMs,
      usage: {
        promptTokens: message.usage.input_tokens,
        completionTokens: message.usage.output_tokens,
        totalTokens: message.usage.input_tokens + message.usage.output_tokens,
      },
      finishReason: message.stop_reason || undefined,
    };
  }

  async completeText(request: LLMTextCompletionRequest): Promise<LLMTextCompletionResponse> {
    if (!this.isAvailable()) {
      throw new Error('Anthropic provider not available: ANTHROPIC_API_KEY not set');
    }

    const startTime = Date.now();
    const Anthropic = (await import('@anthropic-ai/sdk')).default;

    const client = new Anthropic({ apiKey: this.apiKey });

    const messages = request.messages.map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }));

    const message = await client.messages.create({
      model: request.model || this.getModel(),
      max_tokens: request.maxTokens || 8192,
      system: request.system,
      messages,
      temperature: request.temperature ?? 0.7,
      stop_sequences: request.stopSequences,
    });

    const latencyMs = Date.now() - startTime;

    const textContent = message.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    return {
      text: textContent.text,
      provider: 'anthropic',
      model: message.model,
      requestId: message.id,
      latencyMs,
      usage: {
        promptTokens: message.usage.input_tokens,
        completionTokens: message.usage.output_tokens,
        totalTokens: message.usage.input_tokens + message.usage.output_tokens,
      },
      finishReason: message.stop_reason || undefined,
    };
  }
}

/**
 * Create Anthropic provider
 */
export function createAnthropicProvider(config: LLMProviderConfig): LLMProvider {
  return new AnthropicLLMProvider(config);
}
