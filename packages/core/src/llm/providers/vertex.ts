/**
 * Vertex AI (Gemini) LLM Provider
 *
 * Adapter for Google Cloud Vertex AI SDK.
 * Uses Application Default Credentials (ADC) for authentication.
 * No API key required - uses gcloud auth.
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
 * Vertex AI Provider (Gemini via GCP)
 */
export class VertexAILLMProvider implements LLMProvider {
  readonly type = 'vertex' as const;
  readonly name = 'Vertex AI (Gemini)';

  private config: LLMProviderConfig;
  private projectId: string | undefined;
  private location: string;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.projectId = config.projectId || process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    this.location = config.location || process.env.VERTEX_LOCATION || 'us-central1';
  }

  isAvailable(): boolean {
    // Vertex AI uses ADC, so we just need a project ID
    return !!this.projectId;
  }

  getModel(): string {
    return this.config.model || 'gemini-2.0-flash';
  }

  async completeJson(request: LLMJsonCompletionRequest): Promise<LLMJsonCompletionResponse> {
    if (!this.isAvailable()) {
      throw new Error('Vertex AI provider not available: GCP_PROJECT_ID not set');
    }

    const startTime = Date.now();
    const { VertexAI } = await import('@google-cloud/vertexai');

    const vertexAI = new VertexAI({
      project: this.projectId!,
      location: this.location,
    });

    const model = vertexAI.getGenerativeModel({
      model: request.model || this.getModel(),
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.maxTokens,
        responseMimeType: 'application/json',
        stopSequences: request.stopSequences,
      },
    });

    const contents = this.buildContents(request);

    const result = await model.generateContent({ contents });
    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

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
      provider: 'vertex',
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
      throw new Error('Vertex AI provider not available: GCP_PROJECT_ID not set');
    }

    const startTime = Date.now();
    const { VertexAI } = await import('@google-cloud/vertexai');

    const vertexAI = new VertexAI({
      project: this.projectId!,
      location: this.location,
    });

    const model = vertexAI.getGenerativeModel({
      model: request.model || this.getModel(),
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens,
        stopSequences: request.stopSequences,
      },
    });

    const contents = this.buildContents(request);

    const result = await model.generateContent({ contents });
    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const latencyMs = Date.now() - startTime;

    return {
      text,
      provider: 'vertex',
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

  private buildContents(
    request: LLMJsonCompletionRequest | LLMTextCompletionRequest
  ): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    // Combine system message with first user message
    const systemText = request.system ? `${request.system}\n\n` : '';

    for (const msg of request.messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const text = contents.length === 0 && role === 'user' && systemText
        ? `${systemText}${msg.content}`
        : msg.content;
      contents.push({ role, parts: [{ text }] });
    }

    return contents;
  }
}

/**
 * Create Vertex AI provider
 */
export function createVertexProvider(config: LLMProviderConfig): LLMProvider {
  return new VertexAILLMProvider(config);
}
