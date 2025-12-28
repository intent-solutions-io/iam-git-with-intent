/**
 * AI-Powered Auto-Fix Grading Service
 *
 * Provides AI-assisted grading for auto-fix quality using:
 * - Gemini Flash for fast triage and scoring
 * - Claude Sonnet for detailed code quality analysis
 * - Structured rubric-based evaluation
 */

import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import { GradingEngine, type AutoFixRun, type GradeResult } from '../scoring/grading-engine.js';

// ============================================================================
// Schemas
// ============================================================================

const GradingRubricSchema = z.object({
  version: z.string(),
  metadata: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    repository: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }).optional(),
  criteria: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    weight: z.number().min(0).max(1),
    subcriteria: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      points: z.number().min(0),
      evaluationMethod: z.enum(['rule_based', 'llm_assisted', 'metric_threshold', 'keyword_match']),
      threshold: z.union([z.string(), z.number(), z.object({
        operator: z.enum(['==', '!=', '<', '<=', '>', '>=']),
        value: z.number(),
      })]).optional(),
      scoringFunction: z.string().optional(),
    })),
  })),
  gradeScale: z.object({
    A: z.tuple([z.number(), z.number()]),
    B: z.tuple([z.number(), z.number()]),
    C: z.tuple([z.number(), z.number()]),
    D: z.tuple([z.number(), z.number()]),
    F: z.tuple([z.number(), z.number()]),
  }),
  keywords: z.object({
    positive: z.array(z.object({
      keywords: z.array(z.string()),
      weight: z.number(),
      category: z.enum(['security', 'quality', 'warning', 'critical', 'documentation']).optional(),
      requiresContext: z.boolean().optional(),
    })).optional(),
    negative: z.array(z.object({
      keywords: z.array(z.string()),
      weight: z.number(),
      category: z.enum(['security', 'quality', 'warning', 'critical', 'documentation']).optional(),
      requiresContext: z.boolean().optional(),
    })).optional(),
  }).optional(),
  patterns: z.object({
    complexity: z.object({
      threshold: z.number().optional(),
      penaltyPerPoint: z.number().optional(),
    }).optional(),
    churn: z.object({
      highRiskThreshold: z.number().optional(),
      penaltyMultiplier: z.number().optional(),
    }).optional(),
  }).optional(),
});

export type GradingRubric = z.infer<typeof GradingRubricSchema>;

// ============================================================================
// AI Provider Interfaces
// ============================================================================

export interface AIProvider {
  name: string;
  analyzeCodeQuality(diff: string, metrics: CodeMetrics): Promise<CodeQualityAnalysis>;
  analyzeCommitMessage(message: string): Promise<CommitMessageAnalysis>;
}

export interface CodeMetrics {
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  complexityDelta: number;
  lintPassed: boolean;
  typecheckPassed: boolean;
}

export interface CodeQualityAnalysis {
  score: number; // 0-100
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface CommitMessageAnalysis {
  clarity: number; // 0-100
  completeness: number; // 0-100
  keywords: {
    positive: string[];
    negative: string[];
  };
  sentiment: 'positive' | 'neutral' | 'negative';
}

// ============================================================================
// Mock AI Provider (for testing without API keys)
// ============================================================================

class MockAIProvider implements AIProvider {
  name = 'mock';

  async analyzeCodeQuality(_diff: string, metrics: CodeMetrics): Promise<CodeQualityAnalysis> {
    // Simple rule-based analysis
    const score = metrics.lintPassed && metrics.typecheckPassed ? 80 : 60;

    return {
      score,
      strengths: metrics.lintPassed ? ['Clean code passes linting'] : [],
      weaknesses: !metrics.typecheckPassed ? ['Type errors detected'] : [],
      suggestions: metrics.complexityDelta > 5 ? ['Consider refactoring to reduce complexity'] : [],
      riskLevel: metrics.complexityDelta > 10 ? 'high' : 'low',
    };
  }

  async analyzeCommitMessage(message: string): Promise<CommitMessageAnalysis> {
    const hasDetails = message.length > 50;

    return {
      clarity: hasDetails ? 80 : 50,
      completeness: hasDetails ? 75 : 40,
      keywords: {
        positive: message.match(/fix|improve|add|update/gi) || [],
        negative: message.match(/hack|todo|fixme/gi) || [],
      },
      sentiment: 'neutral',
    };
  }
}

// ============================================================================
// Gemini Flash Provider
// ============================================================================

class GeminiFlashProvider implements AIProvider {
  name = 'gemini-flash';
  private apiKey: string;
  private endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyzeCodeQuality(diff: string, metrics: CodeMetrics): Promise<CodeQualityAnalysis> {
    try {
      const prompt = `Analyze this code diff for quality. Consider:
- Code complexity and maintainability
- Best practices adherence
- Potential bugs or issues
- Code clarity and readability

Metrics:
- Files changed: ${metrics.filesChanged}
- Lines added: ${metrics.linesAdded}
- Lines deleted: ${metrics.linesDeleted}
- Complexity delta: ${metrics.complexityDelta}
- Lint passed: ${metrics.lintPassed}
- Typecheck passed: ${metrics.typecheckPassed}

Diff:
${diff.substring(0, 2000)}

Respond in JSON format with:
{
  "score": <0-100>,
  "strengths": ["strength 1", "strength 2", ...],
  "weaknesses": ["weakness 1", "weakness 2", ...],
  "suggestions": ["suggestion 1", "suggestion 2", ...],
  "riskLevel": "low" | "medium" | "high"
}`;

      const response = await fetch(`${this.endpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          }
        })
      });

      if (!response.ok) {
        console.warn('Gemini API error, falling back to rules:', response.statusText);
        return new MockAIProvider().analyzeCodeQuality(diff, metrics);
      }

      const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        console.warn('No response from Gemini, falling back to rules');
        return new MockAIProvider().analyzeCodeQuality(diff, metrics);
      }

      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('Invalid JSON from Gemini, falling back to rules');
        return new MockAIProvider().analyzeCodeQuality(diff, metrics);
      }

      const analysis = JSON.parse(jsonMatch[0]);
      return {
        score: Math.max(0, Math.min(100, analysis.score || 75)),
        strengths: Array.isArray(analysis.strengths) ? analysis.strengths : [],
        weaknesses: Array.isArray(analysis.weaknesses) ? analysis.weaknesses : [],
        suggestions: Array.isArray(analysis.suggestions) ? analysis.suggestions : [],
        riskLevel: ['low', 'medium', 'high'].includes(analysis.riskLevel) ? analysis.riskLevel : 'low'
      };
    } catch (error) {
      console.warn('Error calling Gemini API, falling back to rules:', error);
      return new MockAIProvider().analyzeCodeQuality(diff, metrics);
    }
  }

  async analyzeCommitMessage(message: string): Promise<CommitMessageAnalysis> {
    try {
      const prompt = `Analyze this commit message for clarity and completeness:

"${message}"

Respond in JSON format:
{
  "clarity": <0-100>,
  "completeness": <0-100>,
  "keywords": {
    "positive": ["keyword1", ...],
    "negative": ["keyword1", ...]
  },
  "sentiment": "positive" | "neutral" | "negative"
}`;

      const response = await fetch(`${this.endpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 512,
          }
        })
      });

      if (!response.ok) {
        console.warn('Gemini API error, falling back to rules:', response.statusText);
        return new MockAIProvider().analyzeCommitMessage(message);
      }

      const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        console.warn('No response from Gemini, falling back to rules');
        return new MockAIProvider().analyzeCommitMessage(message);
      }

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('Invalid JSON from Gemini, falling back to rules');
        return new MockAIProvider().analyzeCommitMessage(message);
      }

      const analysis = JSON.parse(jsonMatch[0]);
      return {
        clarity: Math.max(0, Math.min(100, analysis.clarity || 50)),
        completeness: Math.max(0, Math.min(100, analysis.completeness || 50)),
        keywords: {
          positive: Array.isArray(analysis.keywords?.positive) ? analysis.keywords.positive : [],
          negative: Array.isArray(analysis.keywords?.negative) ? analysis.keywords.negative : []
        },
        sentiment: ['positive', 'neutral', 'negative'].includes(analysis.sentiment) ? analysis.sentiment : 'neutral'
      };
    } catch (error) {
      console.warn('Error calling Gemini API, falling back to rules:', error);
      return new MockAIProvider().analyzeCommitMessage(message);
    }
  }
}

// ============================================================================
// Claude Provider
// ============================================================================

class ClaudeProvider implements AIProvider {
  name = 'claude';
  private _apiKey: string;
  private _endpoint = 'https://api.anthropic.com/v1/messages';

  constructor(apiKey: string) {
    this._apiKey = apiKey;
  }

  async analyzeCodeQuality(diff: string, metrics: CodeMetrics): Promise<CodeQualityAnalysis> {
    try {
      const prompt = `Analyze this code diff for quality. Consider:
- Code complexity and maintainability
- Best practices adherence
- Potential bugs or issues
- Code clarity and readability

Metrics:
- Files changed: ${metrics.filesChanged}
- Lines added: ${metrics.linesAdded}
- Lines deleted: ${metrics.linesDeleted}
- Complexity delta: ${metrics.complexityDelta}
- Lint passed: ${metrics.lintPassed}
- Typecheck passed: ${metrics.typecheckPassed}

Diff:
${diff.substring(0, 2000)}

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "score": <0-100>,
  "strengths": ["strength 1", "strength 2", ...],
  "weaknesses": ["weakness 1", "weakness 2", ...],
  "suggestions": ["suggestion 1", "suggestion 2", ...],
  "riskLevel": "low" | "medium" | "high"
}`;

      const response = await fetch(this._endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this._apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          temperature: 0.1,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      });

      if (!response.ok) {
        console.warn('Claude API error, falling back to rules:', response.statusText);
        return new MockAIProvider().analyzeCodeQuality(diff, metrics);
      }

      const data = await response.json() as { content?: Array<{ text?: string }> };
      const text = data.content?.[0]?.text;

      if (!text) {
        console.warn('No response from Claude, falling back to rules');
        return new MockAIProvider().analyzeCodeQuality(diff, metrics);
      }

      // Parse JSON response (remove markdown if present)
      const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('Invalid JSON from Claude, falling back to rules');
        return new MockAIProvider().analyzeCodeQuality(diff, metrics);
      }

      const analysis = JSON.parse(jsonMatch[0]);
      return {
        score: Math.max(0, Math.min(100, analysis.score || 75)),
        strengths: Array.isArray(analysis.strengths) ? analysis.strengths : [],
        weaknesses: Array.isArray(analysis.weaknesses) ? analysis.weaknesses : [],
        suggestions: Array.isArray(analysis.suggestions) ? analysis.suggestions : [],
        riskLevel: ['low', 'medium', 'high'].includes(analysis.riskLevel) ? analysis.riskLevel : 'low'
      };
    } catch (error) {
      console.warn('Error calling Claude API, falling back to rules:', error);
      return new MockAIProvider().analyzeCodeQuality(diff, metrics);
    }
  }

  async analyzeCommitMessage(message: string): Promise<CommitMessageAnalysis> {
    try {
      const prompt = `Analyze this commit message for clarity and completeness:

"${message}"

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "clarity": <0-100>,
  "completeness": <0-100>,
  "keywords": {
    "positive": ["keyword1", ...],
    "negative": ["keyword1", ...]
  },
  "sentiment": "positive" | "neutral" | "negative"
}`;

      const response = await fetch(this._endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this._apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 512,
          temperature: 0.1,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      });

      if (!response.ok) {
        console.warn('Claude API error, falling back to rules:', response.statusText);
        return new MockAIProvider().analyzeCommitMessage(message);
      }

      const data = await response.json() as { content?: Array<{ text?: string }> };
      const text = data.content?.[0]?.text;

      if (!text) {
        console.warn('No response from Claude, falling back to rules');
        return new MockAIProvider().analyzeCommitMessage(message);
      }

      const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('Invalid JSON from Claude, falling back to rules');
        return new MockAIProvider().analyzeCommitMessage(message);
      }

      const analysis = JSON.parse(jsonMatch[0]);
      return {
        clarity: Math.max(0, Math.min(100, analysis.clarity || 50)),
        completeness: Math.max(0, Math.min(100, analysis.completeness || 50)),
        keywords: {
          positive: Array.isArray(analysis.keywords?.positive) ? analysis.keywords.positive : [],
          negative: Array.isArray(analysis.keywords?.negative) ? analysis.keywords.negative : []
        },
        sentiment: ['positive', 'neutral', 'negative'].includes(analysis.sentiment) ? analysis.sentiment : 'neutral'
      };
    } catch (error) {
      console.warn('Error calling Claude API, falling back to rules:', error);
      return new MockAIProvider().analyzeCommitMessage(message);
    }
  }
}

// ============================================================================
// Auto-Fix Grading Service
// ============================================================================

export interface GradingOptions {
  rubricPath?: string;
  aiProvider?: 'gemini' | 'claude' | 'mock';
  useAI?: boolean;
}

export class AutoFixGradingService {
  private rubric: GradingRubric;
  private gradingEngine: GradingEngine;
  private aiProvider: AIProvider;

  constructor(options: GradingOptions = {}) {
    // Load rubric
    this.rubric = this.loadRubric(options.rubricPath);

    // Initialize grading engine
    this.gradingEngine = new GradingEngine({
      version: this.rubric.version,
      gradeScale: this.rubric.gradeScale as {
        A: [number, number];
        B: [number, number];
        C: [number, number];
        D: [number, number];
        F: [number, number];
      },
    });

    // Initialize AI provider
    this.aiProvider = this.createAIProvider(options.aiProvider);
  }

  /**
   * Load grading rubric from file or use default
   */
  private loadRubric(rubricPath?: string): GradingRubric {
    try {
      if (rubricPath) {
        const content = readFileSync(rubricPath, 'utf-8');
        const rubric = JSON.parse(content);
        return GradingRubricSchema.parse(rubric);
      }

      // Try to load default rubric
      const defaultPath = join(process.cwd(), 'examples', 'default-rubric.json');
      const content = readFileSync(defaultPath, 'utf-8');
      const rubric = JSON.parse(content);
      return GradingRubricSchema.parse(rubric);
    } catch (error) {
      console.warn('Failed to load rubric, using minimal default:', error);

      // Fallback to minimal rubric
      return {
        version: '1.0.0',
        criteria: [],
        gradeScale: {
          A: [90, 100],
          B: [80, 89],
          C: [70, 79],
          D: [60, 69],
          F: [0, 59],
        },
      };
    }
  }

  /**
   * Create AI provider instance
   */
  private createAIProvider(providerName?: 'gemini' | 'claude' | 'mock'): AIProvider {
    const provider = providerName || 'mock';

    switch (provider) {
      case 'gemini': {
        const apiKey = process.env.GOOGLE_AI_API_KEY;
        if (!apiKey) {
          console.warn('GOOGLE_AI_API_KEY not set, falling back to mock provider');
          return new MockAIProvider();
        }
        return new GeminiFlashProvider(apiKey);
      }

      case 'claude': {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          console.warn('ANTHROPIC_API_KEY not set, falling back to mock provider');
          return new MockAIProvider();
        }
        return new ClaudeProvider(apiKey);
      }

      case 'mock':
      default:
        return new MockAIProvider();
    }
  }

  /**
   * Grade an auto-fix run with optional AI assistance
   */
  async grade(run: AutoFixRun, useAI = false): Promise<GradeResult> {
    // Get base grade from rules engine
    const baseGrade = this.gradingEngine.grade(run);

    if (!useAI) {
      return baseGrade;
    }

    // Enhance with AI analysis
    const [codeAnalysis] = await Promise.all([
      this.aiProvider.analyzeCodeQuality(run.diffContent, {
        filesChanged: run.filesChanged,
        linesAdded: run.linesAdded,
        linesDeleted: run.linesDeleted,
        complexityDelta: run.complexityDelta,
        lintPassed: run.lintPassed,
        typecheckPassed: run.typecheckPassed,
      }),
      // Future: Use commit message analysis for additional insights
      this.aiProvider.analyzeCommitMessage(run.commitMessage),
    ]);

    // Merge AI insights into grade
    return {
      ...baseGrade,
      strengths: [
        ...baseGrade.strengths,
        ...codeAnalysis.strengths.map(s => `AI: ${s}`),
      ],
      weaknesses: [
        ...baseGrade.weaknesses,
        ...codeAnalysis.weaknesses.map(w => `AI: ${w}`),
      ],
      recommendations: [
        ...baseGrade.recommendations,
        ...codeAnalysis.suggestions,
      ],
    };
  }

  /**
   * Batch grade multiple runs
   */
  async gradeMultiple(runs: AutoFixRun[], useAI = false): Promise<GradeResult[]> {
    return Promise.all(runs.map(run => this.grade(run, useAI)));
  }

  /**
   * Get rubric information
   */
  getRubric(): GradingRubric {
    return this.rubric;
  }

  /**
   * Validate rubric schema
   */
  static validateRubric(rubric: unknown): GradingRubric {
    return GradingRubricSchema.parse(rubric);
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  GradingRubricSchema,
  MockAIProvider,
  GeminiFlashProvider,
  ClaudeProvider,
};
