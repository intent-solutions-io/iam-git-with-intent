/**
 * Type declarations for @google/generative-ai
 *
 * Minimal stubs to satisfy TypeScript compiler.
 * The package (v0.21.0) doesn't include complete type definitions.
 */

declare module '@google/generative-ai' {
  export interface GenerationConfig {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    stopSequences?: string[];
  }

  export interface UsageMetadata {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  }

  export interface Candidate {
    finishReason?: string;
    content?: {
      parts: Array<{ text: string }>;
    };
  }

  export interface GenerateContentResult {
    response: {
      text(): string;
      usageMetadata?: UsageMetadata;
      candidates?: Candidate[];
    };
  }

  export interface GenerativeModel {
    generateContent(parts: Array<{ text: string }>): Promise<GenerateContentResult>;
  }

  export interface GetGenerativeModelOptions {
    model: string;
    generationConfig?: GenerationConfig;
  }

  export class GoogleGenerativeAI {
    constructor(apiKey: string);
    getGenerativeModel(options: GetGenerativeModelOptions): GenerativeModel;
  }
}
