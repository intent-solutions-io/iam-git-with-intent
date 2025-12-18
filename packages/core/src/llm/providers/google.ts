/**
 * Google AI (Gemini) LLM Provider
 *
 * Adapter for Google's Generative AI SDK.
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
 * Google AI Provider (Gemini)
 */
export class GoogleLLMProvider implements LLMProvider {
  readonly type = 'google' as const;
  readonly name = 'Google AI (Gemini)';

  private config: LLMProviderConfig;
  private apiKey: string | undefined;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.apiKey = config.apiKey || process.env.GOOGLE_AI_API_KEY;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  getModel(): string {
    return this.config.model || 'gemini-2.0-flash';
  }

  async completeJson(request: LLMJsonCompletionRequest): Promise<LLMJsonCompletionResponse> {
    if (!this.isAvailable()) {
      throw new Error('Google AI provider not available: GOOGLE_AI_API_KEY not set');
    }

    const startTime = Date.now();
    const { GoogleGenerativeAI } = await import('@google/generative-ai');

    const genAI = new GoogleGenerativeAI(this.apiKey!);
    const model = genAI.getGenerativeModel({
      model: request.model || this.getModel(),
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.maxTokens,
        responseMimeType: 'application/json',
        stopSequences: request.stopSequences,
      },
    });

    const messages = this.buildMessages(request);

    const result = await model.generateContent(messages);
    const response = result.response;
    const text = response.text();

    const latencyMs = Date.now() - startTime;

    // Parse JSON
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Failed to parse JSON response: ${text.slice(0, 200)}`);
    }

    return {
      json,
      raw: text,
      provider: 'google',
      model: request.model || this.getModel(),
      latencyMs,
      usage: response.usageMetadata
        ? {
            promptTokens: response.usageMetadata.promptTokenCount || 0,
            completionTokens: response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata.totalTokenCount || 0,
          }
        : undefined,
      finishReason: response.candidates?.[0]?.finishReason,
    };
  }

  async completeText(request: LLMTextCompletionRequest): Promise<LLMTextCompletionResponse> {
    if (!this.isAvailable()) {
      throw new Error('Google AI provider not available: GOOGLE_AI_API_KEY not set');
    }

    const startTime = Date.now();
    const { GoogleGenerativeAI } = await import('@google/generative-ai');

    const genAI = new GoogleGenerativeAI(this.apiKey!);
    const model = genAI.getGenerativeModel({
      model: request.model || this.getModel(),
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens,
        stopSequences: request.stopSequences,
      },
    });

    const messages = this.buildMessages(request);

    const result = await model.generateContent(messages);
    const response = result.response;
    const text = response.text();

    const latencyMs = Date.now() - startTime;

    return {
      text,
      provider: 'google',
      model: request.model || this.getModel(),
      latencyMs,
      usage: response.usageMetadata
        ? {
            promptTokens: response.usageMetadata.promptTokenCount || 0,
            completionTokens: response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata.totalTokenCount || 0,
          }
        : undefined,
      finishReason: response.candidates?.[0]?.finishReason,
    };
  }

  private buildMessages(
    request: LLMJsonCompletionRequest | LLMTextCompletionRequest
  ): Array<{ text: string }> {
    const parts: Array<{ text: string }> = [];

    if (request.system) {
      parts.push({ text: request.system });
    }

    for (const msg of request.messages) {
      parts.push({ text: `${msg.role}: ${msg.content}` });
    }

    return parts;
  }
}

/**
 * Create Google AI provider
 */
export function createGoogleProvider(config: LLMProviderConfig): LLMProvider {
  return new GoogleLLMProvider(config);
}
