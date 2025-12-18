/**
 * Phase 26: LLM Planner Providers
 *
 * Provider interface and implementations for LLM planners.
 * Each provider takes intent + context and produces a PatchPlan.
 *
 * Supports:
 * - gemini: Google AI (Gemini)
 * - claude: Anthropic (Claude)
 * - openai: OpenAI (GPT)
 * - llm: Generic provider using provider-agnostic LLM interface
 */

import { randomUUID } from 'node:crypto';
import type { PatchPlan, PlannerProvider as PlannerProviderType } from './types.js';
import { PatchPlanSchema } from './types.js';
import type { LLMProvider, LLMProviderConfig } from '../llm/types.js';

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Input to the planner provider
 */
export interface PlannerProviderInput {
  /** The intent/goal to plan for */
  intent: string;
  /** Repository context (file list, structure) */
  repoContext?: {
    files: string[];
    languages: string[];
    hasTests: boolean;
    defaultBranch?: string;
  };
  /** PR/Issue context if available */
  sourceContext?: {
    type: 'pr' | 'issue' | 'manual';
    url?: string;
    title?: string;
    body?: string;
    diff?: string;
  };
  /** Existing files content (for context) */
  fileContents?: Map<string, string>;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Request ID for correlation */
  requestId?: string;
  /** Tenant ID for multi-tenant */
  tenantId?: string;
}

/**
 * Provider interface - all LLM planners must implement this
 */
export interface PlannerProviderInterface {
  /** Provider name */
  readonly name: PlannerProviderType;

  /** Generate a PatchPlan from input */
  plan(input: PlannerProviderInput): Promise<PatchPlan>;

  /** Check if provider is available/configured */
  isAvailable(): boolean;

  /** Get the model being used */
  getModel(): string;
}

// =============================================================================
// System Prompt
// =============================================================================

const PLANNER_SYSTEM_PROMPT = `You are a code planning assistant. Given an intent and repository context, you must produce a detailed PatchPlan in JSON format.

The PatchPlan must include:
1. plan_id: A UUID for the plan
2. created_at: ISO 8601 timestamp
3. provider: Either "gemini" or "claude"
4. model: The model name being used
5. version: Always 1
6. intent_summary: A clear summary of what the plan accomplishes
7. files: Array of files to create/modify/delete with reasons
8. steps: Ordered execution steps with prompts for the coder
9. tests: Tests to validate the changes
10. risk: Risk assessment with overall level and identified risks
11. policy: Policy context (set allowed: true for now)
12. rollback: Instructions for rolling back if needed
13. acceptance_criteria: Success criteria for the plan

CRITICAL RULES:
- All file paths must be RELATIVE (no leading /)
- No path traversal (..) allowed
- No shell injection in test commands
- No secrets or API keys in prompts
- Each step must have a clear, actionable prompt

Output ONLY valid JSON matching the PatchPlan schema. No markdown, no explanation.`;

// =============================================================================
// Gemini Provider
// =============================================================================

/**
 * Gemini-based planner provider
 */
export class GeminiPlannerProvider implements PlannerProviderInterface {
  readonly name: PlannerProviderType = 'gemini';
  private model: string;
  private apiKey: string | undefined;

  constructor(config?: { model?: string; apiKey?: string }) {
    this.model = config?.model || 'gemini-2.0-flash';
    this.apiKey = config?.apiKey || process.env.GOOGLE_AI_API_KEY;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  getModel(): string {
    return this.model;
  }

  async plan(input: PlannerProviderInput): Promise<PatchPlan> {
    if (!this.isAvailable()) {
      throw new Error('Gemini provider not available: GOOGLE_AI_API_KEY not set');
    }

    // Dynamic import to avoid loading if not used
    const { GoogleGenerativeAI } = await import('@google/generative-ai');

    const genAI = new GoogleGenerativeAI(this.apiKey!);
    const model = genAI.getGenerativeModel({
      model: this.model,
      generationConfig: {
        temperature: 0.2, // Low temperature for deterministic output
        topP: 0.8,
        responseMimeType: 'application/json',
      },
    });

    const userPrompt = this.buildUserPrompt(input);

    const result = await model.generateContent([
      { text: PLANNER_SYSTEM_PROMPT },
      { text: userPrompt },
    ]);

    const response = result.response;
    const text = response.text();

    // Parse and validate
    const planData = JSON.parse(text);

    // Ensure provider/model are set correctly
    planData.provider = 'gemini';
    planData.model = this.model;
    planData.plan_id = planData.plan_id || randomUUID();
    planData.created_at = planData.created_at || new Date().toISOString();
    planData.trace_id = input.traceId;
    planData.request_id = input.requestId;
    planData.tenant_id = input.tenantId;

    return PatchPlanSchema.parse(planData);
  }

  private buildUserPrompt(input: PlannerProviderInput): string {
    let prompt = `## Intent\n${input.intent}\n\n`;

    if (input.sourceContext) {
      prompt += `## Source Context\n`;
      prompt += `Type: ${input.sourceContext.type}\n`;
      if (input.sourceContext.url) {
        prompt += `URL: ${input.sourceContext.url}\n`;
      }
      if (input.sourceContext.title) {
        prompt += `Title: ${input.sourceContext.title}\n`;
      }
      if (input.sourceContext.body) {
        prompt += `Body:\n${input.sourceContext.body}\n`;
      }
      if (input.sourceContext.diff) {
        prompt += `\nDiff:\n\`\`\`\n${input.sourceContext.diff}\n\`\`\`\n`;
      }
      prompt += '\n';
    }

    if (input.repoContext) {
      prompt += `## Repository Context\n`;
      prompt += `Languages: ${input.repoContext.languages.join(', ')}\n`;
      prompt += `Has Tests: ${input.repoContext.hasTests}\n`;
      if (input.repoContext.defaultBranch) {
        prompt += `Default Branch: ${input.repoContext.defaultBranch}\n`;
      }
      prompt += `Files (sample): ${input.repoContext.files.slice(0, 50).join(', ')}\n`;
      prompt += '\n';
    }

    if (input.fileContents && input.fileContents.size > 0) {
      prompt += `## Relevant File Contents\n`;
      for (const [path, content] of input.fileContents) {
        prompt += `### ${path}\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\`\n\n`;
      }
    }

    prompt += `\nGenerate a complete PatchPlan JSON for this intent.`;

    return prompt;
  }
}

// =============================================================================
// Claude Provider
// =============================================================================

/**
 * Claude-based planner provider
 */
export class ClaudePlannerProvider implements PlannerProviderInterface {
  readonly name: PlannerProviderType = 'claude';
  private model: string;
  private apiKey: string | undefined;

  constructor(config?: { model?: string; apiKey?: string }) {
    this.model = config?.model || 'claude-sonnet-4-20250514';
    this.apiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  getModel(): string {
    return this.model;
  }

  async plan(input: PlannerProviderInput): Promise<PatchPlan> {
    if (!this.isAvailable()) {
      throw new Error('Claude provider not available: ANTHROPIC_API_KEY not set');
    }

    // Dynamic import to avoid loading if not used
    const Anthropic = (await import('@anthropic-ai/sdk')).default;

    const client = new Anthropic({ apiKey: this.apiKey });

    const userPrompt = this.buildUserPrompt(input);

    const message = await client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: PLANNER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract text from response
    const textContent = message.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    const text = textContent.text;

    // Try to extract JSON from response (Claude might wrap it in markdown)
    let jsonText = text;
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else {
      // Try to find JSON object directly
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        jsonText = objMatch[0];
      }
    }

    // Parse and validate
    const planData = JSON.parse(jsonText);

    // Ensure provider/model are set correctly
    planData.provider = 'claude';
    planData.model = this.model;
    planData.plan_id = planData.plan_id || randomUUID();
    planData.created_at = planData.created_at || new Date().toISOString();
    planData.trace_id = input.traceId;
    planData.request_id = input.requestId;
    planData.tenant_id = input.tenantId;

    return PatchPlanSchema.parse(planData);
  }

  private buildUserPrompt(input: PlannerProviderInput): string {
    let prompt = `## Intent\n${input.intent}\n\n`;

    if (input.sourceContext) {
      prompt += `## Source Context\n`;
      prompt += `Type: ${input.sourceContext.type}\n`;
      if (input.sourceContext.url) {
        prompt += `URL: ${input.sourceContext.url}\n`;
      }
      if (input.sourceContext.title) {
        prompt += `Title: ${input.sourceContext.title}\n`;
      }
      if (input.sourceContext.body) {
        prompt += `Body:\n${input.sourceContext.body}\n`;
      }
      if (input.sourceContext.diff) {
        prompt += `\nDiff:\n\`\`\`\n${input.sourceContext.diff}\n\`\`\`\n`;
      }
      prompt += '\n';
    }

    if (input.repoContext) {
      prompt += `## Repository Context\n`;
      prompt += `Languages: ${input.repoContext.languages.join(', ')}\n`;
      prompt += `Has Tests: ${input.repoContext.hasTests}\n`;
      if (input.repoContext.defaultBranch) {
        prompt += `Default Branch: ${input.repoContext.defaultBranch}\n`;
      }
      prompt += `Files (sample): ${input.repoContext.files.slice(0, 50).join(', ')}\n`;
      prompt += '\n';
    }

    if (input.fileContents && input.fileContents.size > 0) {
      prompt += `## Relevant File Contents\n`;
      for (const [path, content] of input.fileContents) {
        prompt += `### ${path}\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\`\n\n`;
      }
    }

    prompt += `\nGenerate a complete PatchPlan JSON for this intent. Output only JSON, no markdown fences.`;

    return prompt;
  }
}

// =============================================================================
// Generic LLM Provider (Provider-Agnostic)
// =============================================================================

/**
 * Generic LLM planner provider using provider-agnostic interface
 *
 * Supports any provider that implements LLMProvider:
 * - Google AI (Gemini)
 * - Anthropic (Claude)
 * - OpenAI (GPT)
 * - OpenAI-compatible endpoints (Azure, Ollama, vLLM, LM Studio)
 * - Custom providers
 */
export class GenericLLMPlannerProvider implements PlannerProviderInterface {
  readonly name: PlannerProviderType = 'llm';
  private llmProvider: LLMProvider;

  constructor(llmProvider: LLMProvider, config: LLMProviderConfig) {
    this.llmProvider = llmProvider;
    // Map LLM provider type to planner provider name
    this.name = this.mapProviderType(config.provider);
  }

  private mapProviderType(type: string): PlannerProviderType {
    switch (type) {
      case 'google':
        return 'gemini';
      case 'anthropic':
        return 'claude';
      case 'openai':
      case 'openai_compat':
        return 'openai';
      default:
        return 'llm';
    }
  }

  isAvailable(): boolean {
    return this.llmProvider.isAvailable();
  }

  getModel(): string {
    return this.llmProvider.getModel();
  }

  async plan(input: PlannerProviderInput): Promise<PatchPlan> {
    if (!this.isAvailable()) {
      throw new Error(
        `LLM provider ${this.llmProvider.name} not available. Check API key and configuration.`
      );
    }

    const userPrompt = this.buildUserPrompt(input);

    // Use completeJson for structured output
    const response = await this.llmProvider.completeJson({
      system: PLANNER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.2,
      maxTokens: 8192,
    });

    const planData = response.json as Record<string, unknown>;

    // Ensure provider/model are set correctly
    planData.provider = this.name;
    planData.model = response.model;
    planData.plan_id = planData.plan_id || randomUUID();
    planData.created_at = planData.created_at || new Date().toISOString();
    planData.trace_id = input.traceId;
    planData.request_id = input.requestId;
    planData.tenant_id = input.tenantId;

    return PatchPlanSchema.parse(planData);
  }

  private buildUserPrompt(input: PlannerProviderInput): string {
    let prompt = `## Intent\n${input.intent}\n\n`;

    if (input.sourceContext) {
      prompt += `## Source Context\n`;
      prompt += `Type: ${input.sourceContext.type}\n`;
      if (input.sourceContext.url) {
        prompt += `URL: ${input.sourceContext.url}\n`;
      }
      if (input.sourceContext.title) {
        prompt += `Title: ${input.sourceContext.title}\n`;
      }
      if (input.sourceContext.body) {
        prompt += `Body:\n${input.sourceContext.body}\n`;
      }
      if (input.sourceContext.diff) {
        prompt += `\nDiff:\n\`\`\`\n${input.sourceContext.diff}\n\`\`\`\n`;
      }
      prompt += '\n';
    }

    if (input.repoContext) {
      prompt += `## Repository Context\n`;
      prompt += `Languages: ${input.repoContext.languages.join(', ')}\n`;
      prompt += `Has Tests: ${input.repoContext.hasTests}\n`;
      if (input.repoContext.defaultBranch) {
        prompt += `Default Branch: ${input.repoContext.defaultBranch}\n`;
      }
      prompt += `Files (sample): ${input.repoContext.files.slice(0, 50).join(', ')}\n`;
      prompt += '\n';
    }

    if (input.fileContents && input.fileContents.size > 0) {
      prompt += `## Relevant File Contents\n`;
      for (const [path, content] of input.fileContents) {
        prompt += `### ${path}\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\`\n\n`;
      }
    }

    prompt += `\nGenerate a complete PatchPlan JSON for this intent.`;

    return prompt;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Extended planner provider type including generic LLM
 */
export type ExtendedPlannerProviderType = PlannerProviderType | 'openai' | 'llm';

/**
 * Create a planner provider by name
 *
 * For 'gemini' and 'claude', uses the built-in providers.
 * For 'openai' or 'llm', requires an LLMProvider instance.
 */
export function createPlannerProvider(
  provider: ExtendedPlannerProviderType,
  config?: { model?: string; apiKey?: string; llmProvider?: LLMProvider; llmConfig?: LLMProviderConfig }
): PlannerProviderInterface {
  switch (provider) {
    case 'gemini':
      return new GeminiPlannerProvider(config);
    case 'claude':
      return new ClaudePlannerProvider(config);
    case 'openai':
    case 'llm':
      if (!config?.llmProvider || !config?.llmConfig) {
        throw new Error(
          `Provider '${provider}' requires llmProvider and llmConfig. Use createPlannerProviderFromLLM() instead.`
        );
      }
      return new GenericLLMPlannerProvider(config.llmProvider, config.llmConfig);
    default:
      throw new Error(`Unknown planner provider: ${provider}`);
  }
}

/**
 * Create a planner provider from a generic LLMProvider
 *
 * This allows using any LLM provider (including OpenAI-compatible endpoints)
 * for planning.
 */
export function createPlannerProviderFromLLM(
  llmProvider: LLMProvider,
  config: LLMProviderConfig
): PlannerProviderInterface {
  return new GenericLLMPlannerProvider(llmProvider, config);
}
