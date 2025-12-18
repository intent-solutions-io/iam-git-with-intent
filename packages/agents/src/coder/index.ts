/**
 * Coder Agent for Git With Intent
 *
 * Phase 4/13: Code generation agent for Issue-to-Code workflow.
 *
 * Generates code from issue descriptions:
 * - Analyzes issue requirements
 * - Understands repo context and patterns
 * - Generates implementation code
 * - Creates/modifies files as needed
 * - Optionally generates tests
 * - Writes artifacts to sandboxed workspace (Phase 4)
 *
 * Uses Claude Sonnet for standard tasks, Opus for complex implementations.
 *
 * TRUE AGENT: Stateful (state), Autonomous, Collaborative (A2A)
 */

import { mkdir, writeFile } from 'fs/promises';
import { BaseAgent, type AgentConfig } from '../base/agent.js';
import {
  type TaskRequestPayload,
  MODELS,
  type IssueMetadata,
  type CodeGenerationResult,
  type ComplexityScore,
  getRunWorkspaceDir,
  getRunArtifactPaths,
  getPatchFilePath,
  type RunArtifacts,
} from '@gwi/core';

/**
 * Coder input
 */
export interface CoderInput {
  /** Issue to implement */
  issue: IssueMetadata;
  /** Triage result with complexity */
  complexity: ComplexityScore;
  /** Repo context */
  repoContext?: {
    primaryLanguage?: string;
    frameworks?: string[];
    existingPatterns?: string[];
    relevantFiles?: Array<{ path: string; content: string }>;
  };
  /** User preferences */
  preferences?: {
    includeTests?: boolean;
    codeStyle?: string;
    maxFilesToCreate?: number;
  };
}

/**
 * Coder output
 */
export interface CoderOutput {
  /** Generated code */
  code: CodeGenerationResult;
  /** Tokens used */
  tokensUsed: { input: number; output: number };
}

/**
 * Extended coder input with runId for workspace file I/O
 */
export interface CoderRunInput extends CoderInput {
  /** Unique run identifier for workspace path */
  runId: string;
  /** Repository reference */
  repoRef?: {
    owner: string;
    name: string;
    branch?: string;
  };
  /** Summary from triage agent */
  triageSummary?: string;
}

/**
 * Extended coder output with workspace artifact paths
 */
export interface CoderRunOutput extends CoderOutput {
  /** Workspace artifacts */
  artifacts: RunArtifacts;
}

/**
 * Code generation history entry
 */
interface CodeGenHistoryEntry {
  issueNumber: number;
  filesGenerated: number;
  complexity: ComplexityScore;
  success: boolean;
  timestamp: number;
}

/**
 * Coder agent configuration
 */
const CODER_CONFIG: AgentConfig = {
  name: 'coder',
  description: 'Generates implementation code from issue descriptions and requirements',
  capabilities: ['code-generation', 'file-creation', 'test-generation', 'pattern-matching'],
  defaultModel: {
    provider: 'anthropic',
    model: MODELS.anthropic.sonnet,
    maxTokens: 16384,
  },
};

/**
 * System prompt for code generation
 */
const CODER_SYSTEM_PROMPT = `You are the Coder Agent for Git With Intent, an AI-powered DevOps automation platform.

Your role is to generate implementation code from issue descriptions. You must:

## Analysis Phase
1. Understand the issue requirements completely
2. Identify affected files and modules
3. Consider existing patterns in the codebase
4. Plan the implementation approach

## Code Generation Rules

### File Operations
- "create": New file that doesn't exist
- "modify": Changes to existing file (provide full new content)
- "delete": Remove a file (rare, only if explicitly requested)

### Code Quality
- Follow existing code patterns and conventions
- Use proper typing (TypeScript) or type hints (Python)
- Include appropriate comments for complex logic
- Ensure imports are correct and complete
- Handle error cases appropriately

### Testing (when requested)
- Generate unit tests alongside implementation
- Follow existing test patterns
- Aim for meaningful coverage, not just line coverage

## Output Format

Respond with a JSON object:
{
  "files": [
    {
      "path": "src/feature/new-file.ts",
      "content": "// Full file content here",
      "action": "create",
      "explanation": "Why this file is needed"
    }
  ],
  "summary": "Brief description of what was implemented",
  "confidence": 85,
  "testsIncluded": true,
  "estimatedComplexity": 5
}

## Critical Rules

1. ALWAYS provide complete file contents, not diffs or patches
2. NEVER modify unrelated code or files
3. ENSURE all imports resolve correctly
4. MAINTAIN consistent code style with the repo
5. If unsure, lower confidence score and explain concerns`;

/**
 * Coder Agent Implementation
 */
export class CoderAgent extends BaseAgent {
  /** History of code generations */
  private history: CodeGenHistoryEntry[] = [];

  /** Learned patterns by language */
  private patterns: Map<string, string[]> = new Map();

  constructor() {
    super(CODER_CONFIG);
  }

  /**
   * Initialize - load history from state
   */
  protected async onInitialize(): Promise<void> {
    const history = await this.loadState<CodeGenHistoryEntry[]>('codegen_history');
    if (history) {
      this.history = history;
    }

    const patterns = await this.loadState<Record<string, string[]>>('patterns');
    if (patterns) {
      this.patterns = new Map(Object.entries(patterns));
    }
  }

  /**
   * Shutdown - persist state
   */
  protected async onShutdown(): Promise<void> {
    await this.saveState('codegen_history', this.history);
    await this.saveState('patterns', Object.fromEntries(this.patterns));
  }

  /**
   * Process a code generation request
   */
  protected async processTask(payload: TaskRequestPayload): Promise<CoderOutput> {
    if (payload.taskType !== 'code' && payload.taskType !== 'coder') {
      throw new Error(`Unsupported task type: ${payload.taskType}`);
    }

    const input = payload.input as CoderInput;
    return this.generateCode(input);
  }

  /**
   * Generate code from issue
   */
  async generateCode(input: CoderInput): Promise<CoderOutput> {
    const { issue, complexity, repoContext, preferences } = input;

    // Select model based on complexity
    const model = this.selectModel(complexity);

    // Build context
    const context = this.buildContext(issue, repoContext, preferences);

    // Get relevant patterns
    const language = repoContext?.primaryLanguage || this.detectLanguage(issue);
    const relevantPatterns = this.patterns.get(language) || [];

    // Build prompt
    const prompt = this.buildPrompt(context, relevantPatterns);

    // Call the model
    const response = await this.chat({
      model,
      messages: [
        { role: 'system', content: CODER_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4, // Slightly higher for creative code generation
    });

    // Parse response
    const result = this.parseResponse(response, issue, complexity);

    // Record in history
    this.recordGeneration(issue, result, complexity);

    return {
      code: result,
      tokensUsed: { input: 0, output: 0 }, // TODO: Track from response
    };
  }

  /**
   * Generate code and write artifacts to workspace (Phase 4)
   *
   * This is the main entry point for the issue-to-code workflow.
   * It generates code via LLM and writes all artifacts to the sandbox.
   *
   * @param input - Extended input with runId for workspace path
   * @returns Extended output with artifact paths
   */
  async generateCodeWithArtifacts(input: CoderRunInput): Promise<CoderRunOutput> {
    const { runId, triageSummary } = input;

    // Generate code using the base method
    const output = await this.generateCode(input);

    // Create workspace directory
    const runDir = getRunWorkspaceDir(runId);
    await mkdir(runDir, { recursive: true });

    // Write plan.md
    const { planPath } = getRunArtifactPaths(runId);
    const planContent = this.formatPlan(output.code, triageSummary);
    await writeFile(planPath, planContent, 'utf-8');

    // Write patch files for each generated file
    const patchPaths: string[] = [];
    for (let i = 0; i < output.code.files.length; i++) {
      const file = output.code.files[i];
      const patchPath = getPatchFilePath(runId, i + 1);
      const patchContent = this.formatPatch(file);
      await writeFile(patchPath, patchContent, 'utf-8');
      patchPaths.push(patchPath);
    }

    return {
      ...output,
      artifacts: {
        planPath,
        patchPaths,
        notes: `Generated ${output.code.files.length} file(s) with ${output.code.confidence}% confidence`,
      },
    };
  }

  /**
   * Format the plan.md content
   */
  private formatPlan(code: CodeGenerationResult, triageSummary?: string): string {
    const lines: string[] = [
      '# Code Generation Plan',
      '',
      `**Generated:** ${new Date().toISOString()}`,
      `**Confidence:** ${code.confidence}%`,
      `**Estimated Complexity:** ${code.estimatedComplexity}/10`,
      `**Tests Included:** ${code.testsIncluded ? 'Yes' : 'No'}`,
      '',
    ];

    if (triageSummary) {
      lines.push('## Triage Summary', '', triageSummary, '');
    }

    lines.push('## Summary', '', code.summary, '');

    lines.push('## Files to Generate', '');
    for (const file of code.files) {
      lines.push(`### ${file.path}`);
      lines.push(`- **Action:** ${file.action}`);
      lines.push(`- **Explanation:** ${file.explanation}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format a patch file content
   */
  private formatPatch(file: CodeGenerationResult['files'][0]): string {
    const lines: string[] = [
      `# Patch for: ${file.path}`,
      `# Action: ${file.action}`,
      `# Explanation: ${file.explanation}`,
      '',
      '--- /dev/null' + (file.action === 'create' ? '' : ` (${file.action})`),
      `+++ ${file.path}`,
      '',
      '```',
      file.content,
      '```',
    ];

    return lines.join('\n');
  }

  /**
   * Select model based on complexity
   */
  private selectModel(complexity: ComplexityScore) {
    if (complexity <= 5) {
      return {
        provider: 'anthropic' as const,
        model: MODELS.anthropic.sonnet,
        maxTokens: 16384,
      };
    }
    // High complexity - use Opus
    return {
      provider: 'anthropic' as const,
      model: MODELS.anthropic.opus,
      maxTokens: 32768,
    };
  }

  /**
   * Build context for code generation
   */
  private buildContext(
    issue: IssueMetadata,
    repoContext?: CoderInput['repoContext'],
    preferences?: CoderInput['preferences']
  ): string {
    let context = `## Code Generation Request

**Issue:** #${issue.number} - ${issue.title}
**Repository:** ${issue.repo.fullName}
**Author:** ${issue.author}
**Labels:** ${issue.labels.join(', ') || 'none'}

### Issue Description
${issue.body}
`;

    if (repoContext) {
      context += `\n### Repository Context\n`;
      if (repoContext.primaryLanguage) {
        context += `- Primary Language: ${repoContext.primaryLanguage}\n`;
      }
      if (repoContext.frameworks?.length) {
        context += `- Frameworks: ${repoContext.frameworks.join(', ')}\n`;
      }
      if (repoContext.existingPatterns?.length) {
        context += `- Code Patterns: ${repoContext.existingPatterns.join(', ')}\n`;
      }
      if (repoContext.relevantFiles?.length) {
        context += `\n### Relevant Existing Files\n`;
        for (const file of repoContext.relevantFiles.slice(0, 5)) {
          context += `\n#### ${file.path}\n\`\`\`\n${file.content.slice(0, 2000)}${file.content.length > 2000 ? '\n...(truncated)' : ''}\n\`\`\`\n`;
        }
      }
    }

    if (preferences) {
      context += `\n### Preferences\n`;
      if (preferences.includeTests !== undefined) {
        context += `- Include Tests: ${preferences.includeTests}\n`;
      }
      if (preferences.codeStyle) {
        context += `- Code Style: ${preferences.codeStyle}\n`;
      }
      if (preferences.maxFilesToCreate) {
        context += `- Max Files: ${preferences.maxFilesToCreate}\n`;
      }
    }

    return context;
  }

  /**
   * Build full prompt with patterns
   */
  private buildPrompt(context: string, patterns: string[]): string {
    let prompt = context;

    if (patterns.length > 0) {
      prompt += `\n### Learned Patterns from Similar Tasks\n`;
      prompt += patterns.slice(0, 5).map((p, i) => `${i + 1}. ${p}`).join('\n');
    }

    prompt += `\n\nPlease generate the implementation code as a JSON object.`;

    return prompt;
  }

  /**
   * Detect language from issue content
   */
  private detectLanguage(issue: IssueMetadata): string {
    const text = `${issue.title} ${issue.body}`.toLowerCase();

    if (text.includes('typescript') || text.includes('.ts')) return 'typescript';
    if (text.includes('javascript') || text.includes('.js')) return 'javascript';
    if (text.includes('python') || text.includes('.py')) return 'python';
    if (text.includes('rust') || text.includes('.rs')) return 'rust';
    if (text.includes('go') || text.includes('.go')) return 'go';
    if (text.includes('java')) return 'java';

    return 'typescript'; // Default
  }

  /**
   * Parse response into CodeGenerationResult
   */
  private parseResponse(
    response: string,
    issue: IssueMetadata,
    complexity: ComplexityScore
  ): CodeGenerationResult {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize
      const files = (parsed.files || []).map((f: any) => ({
        path: f.path || '',
        content: f.content || '',
        action: this.validateAction(f.action),
        explanation: f.explanation || 'No explanation provided',
      }));

      return {
        files,
        summary: parsed.summary || `Implementation for issue #${issue.number}`,
        confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
        testsIncluded: parsed.testsIncluded || files.some((f: any) => f.path.includes('test')),
        estimatedComplexity: this.clampComplexity(parsed.estimatedComplexity || complexity),
      };
    } catch (error) {
      // Return a low-confidence fallback
      return {
        files: [],
        summary: `Failed to generate code for issue #${issue.number}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0,
        testsIncluded: false,
        estimatedComplexity: complexity,
      };
    }
  }

  /**
   * Validate action type
   */
  private validateAction(action: unknown): 'create' | 'modify' | 'delete' {
    if (action === 'create' || action === 'modify' || action === 'delete') {
      return action;
    }
    return 'create';
  }

  /**
   * Clamp complexity to valid range
   */
  private clampComplexity(value: number): ComplexityScore {
    return Math.min(10, Math.max(1, Math.round(value))) as ComplexityScore;
  }

  /**
   * Record generation in history
   */
  private recordGeneration(
    issue: IssueMetadata,
    result: CodeGenerationResult,
    complexity: ComplexityScore
  ): void {
    const entry: CodeGenHistoryEntry = {
      issueNumber: issue.number,
      filesGenerated: result.files.length,
      complexity,
      success: result.confidence >= 70,
      timestamp: Date.now(),
    };

    this.history.push(entry);

    // Keep history bounded
    if (this.history.length > 200) {
      this.history = this.history.slice(-200);
    }

    // Update patterns for successful generations
    if (entry.success && result.files.length > 0) {
      const language = this.detectLanguageFromFiles(result.files);
      const patterns = this.patterns.get(language) || [];

      // Extract pattern from this generation
      const pattern = `Issue pattern: "${issue.title.slice(0, 50)}" → ${result.files.length} files, ${result.summary.slice(0, 50)}`;
      patterns.push(pattern);

      if (patterns.length > 20) {
        patterns.shift();
      }

      this.patterns.set(language, patterns);
    }

    // Persist
    this.saveState('codegen_history', this.history);
    this.saveState('patterns', Object.fromEntries(this.patterns));
  }

  /**
   * Detect language from generated files
   */
  private detectLanguageFromFiles(files: CodeGenerationResult['files']): string {
    for (const file of files) {
      if (file.path.endsWith('.ts') || file.path.endsWith('.tsx')) return 'typescript';
      if (file.path.endsWith('.js') || file.path.endsWith('.jsx')) return 'javascript';
      if (file.path.endsWith('.py')) return 'python';
      if (file.path.endsWith('.rs')) return 'rust';
      if (file.path.endsWith('.go')) return 'go';
      if (file.path.endsWith('.java')) return 'java';
    }
    return 'unknown';
  }

  /**
   * Get generation statistics
   */
  async getStats(): Promise<{
    total: number;
    successful: number;
    avgFilesPerGeneration: number;
    byComplexity: Record<number, number>;
  }> {
    const byComplexity: Record<number, number> = {};
    let totalFiles = 0;

    for (const entry of this.history) {
      byComplexity[entry.complexity] = (byComplexity[entry.complexity] || 0) + 1;
      totalFiles += entry.filesGenerated;
    }

    return {
      total: this.history.length,
      successful: this.history.filter((e) => e.success).length,
      avgFilesPerGeneration: this.history.length > 0 ? totalFiles / this.history.length : 0,
      byComplexity,
    };
  }
}

/**
 * Create a Coder Agent instance
 */
export function createCoderAgent(): CoderAgent {
  return new CoderAgent();
}
