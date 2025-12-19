/**
 * Reviewer Agent for Git With Intent
 *
 * [Task: git-with-intent-7lx]
 *
 * Validates resolutions from Resolver Agent.
 * Checks: syntax, code loss, security issues.
 *
 * TRUE AGENT: Stateful (state), Autonomous, Collaborative (A2A)
 */

import { BaseAgent, type AgentConfig } from '../base/agent.js';
import { type TaskRequestPayload, MODELS, type IssueMetadata, type CodeGenerationResult } from '@gwi/core';
import type { ResolutionResult, ReviewResult, ConflictInfo } from '@gwi/core';

/**
 * Reviewer input for conflict resolution review
 */
export interface ReviewerInput {
  resolution: ResolutionResult;
  originalConflict: ConflictInfo;
}

/**
 * Reviewer input for code generation review (issue-to-code workflow)
 */
export interface CodeReviewInput {
  codeResult: CodeGenerationResult;
  issue: IssueMetadata;
  workflowType: 'issue-to-code';
}

/**
 * Reviewer input for PR quality review (pr-review workflow)
 */
export interface PRReviewInput {
  triageResult: {
    overallComplexity: number;
    fileAnalyses?: Array<{
      file: string;
      complexity: number;
      riskLevel: string;
      concerns: string[];
    }>;
    recommendations?: string[];
    suggestedStrategy?: string;
  };
  pr: {
    title: string;
    body?: string;
    number: number;
    url: string;
    filesChanged: number;
    additions: number;
    deletions: number;
  };
  changedFiles?: string[];
  focusAreas?: string[];
  workflowType?: 'pr-review';
}

/**
 * Reviewer output
 */
export interface ReviewerOutput {
  review: ReviewResult;
  shouldEscalate: boolean;
  escalationReason?: string;
}

/**
 * Review history entry
 */
interface ReviewHistoryEntry {
  file: string;
  approved: boolean;
  issues: string[];
  timestamp: number;
}

/**
 * Get default model config based on available providers
 * Prefers Vertex AI (Gemini) if GCP_PROJECT_ID is set, falls back to Anthropic
 */
function getDefaultModelConfig(): { provider: 'google' | 'anthropic'; model: string; maxTokens: number } {
  const hasGCP = !!(process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT);
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (hasGCP) {
    return {
      provider: 'google',
      model: MODELS.google.flash25, // Gemini 2.5 Flash with thinking capabilities
      maxTokens: 8192,
    };
  }

  if (hasAnthropic) {
    return {
      provider: 'anthropic',
      model: MODELS.anthropic.sonnet,
      maxTokens: 4096,
    };
  }

  // Default to google (will fail at runtime if not configured)
  return {
    provider: 'google',
    model: MODELS.google.flash25,
    maxTokens: 8192,
  };
}

/**
 * Reviewer agent configuration
 */
const REVIEWER_CONFIG: AgentConfig = {
  name: 'reviewer',
  description: 'Validates merge conflict resolutions for correctness and security',
  capabilities: ['syntax-check', 'code-loss-detection', 'security-scan', 'quality-review'],
  defaultModel: getDefaultModelConfig(),
};

/**
 * System prompt for code review
 */
const REVIEWER_SYSTEM_PROMPT = `You are the Reviewer Agent for Git With Intent, an AI-powered DevOps automation platform.

Your role is to validate merge conflict resolutions by checking:

## 1. Syntax Validation
- Does the resolved code have valid syntax?
- Are all brackets, braces, parentheses matched?
- Are all strings properly closed?
- Are imports valid?

## 2. Code Loss Detection
- Compare resolved content against BOTH sides of the conflict
- Flag if any non-conflicting code was lost
- Flag if any function/class was completely removed
- Verify all imports from both sides are preserved (unless truly conflicting)

## 3. Security Scan
- Check for hardcoded secrets/credentials
- Check for SQL injection vulnerabilities
- Check for XSS vulnerabilities
- Check for unsafe eval/exec usage
- Check for exposed sensitive data

## 4. Logic Validation
- Does the resolution make semantic sense?
- Are there obvious logic errors?
- Is the merged code coherent?

## Output Format

Respond with a JSON object:
{
  "approved": true/false,
  "syntaxValid": true/false,
  "codeLossDetected": true/false,
  "securityIssues": ["issue1", "issue2"],
  "suggestions": ["suggestion1"],
  "confidence": 85,
  "reasoning": "Explanation of the review decision"
}

## Critical Rules

1. Be STRICT about code loss - this is the most critical check
2. Be STRICT about syntax - invalid syntax = automatic rejection
3. Security issues are warnings unless critical
4. When in doubt, flag for human review (approved: false)
5. Confidence < 70 should always set approved: false`;

/**
 * System prompt for PR quality review (pr-review workflow)
 */
const PR_REVIEW_SYSTEM_PROMPT = `You are the Reviewer Agent for Git With Intent, an AI-powered DevOps automation platform.

Your role is to review a Pull Request and provide quality feedback based on triage analysis.

## 1. Overall Assessment
- Is this PR ready for review?
- What is the risk level?
- Are there any blocking concerns?

## 2. Code Quality
- Are the changes well-structured?
- Is the complexity appropriate?
- Are there any obvious issues?

## 3. Review Recommendations
- What areas should reviewers focus on?
- What tests should be verified?
- Any suggestions for improvement?

## Output Format

Respond with a JSON object:
{
  "approved": true/false,
  "riskLevel": "low" | "medium" | "high",
  "summary": "Brief summary of the PR",
  "focusAreas": ["area1", "area2"],
  "concerns": ["concern1", "concern2"],
  "suggestions": ["suggestion1"],
  "confidence": 85,
  "reasoning": "Explanation of the review decision"
}`;

/**
 * System prompt for code generation review (issue-to-code workflow)
 */
const CODE_REVIEW_SYSTEM_PROMPT = `You are the Reviewer Agent for Git With Intent, an AI-powered DevOps automation platform.

Your role is to review generated code from the Coder Agent. You must check:

## 1. Completeness
- Does the generated code address all requirements from the issue?
- Are all necessary files included?
- Are all imports and dependencies correct?

## 2. Syntax Validation
- Does the code have valid syntax?
- Are all brackets, braces, parentheses matched?
- Are all strings properly closed?

## 3. Code Quality
- Does the code follow best practices?
- Is the code readable and maintainable?
- Are error cases handled appropriately?

## 4. Security Scan
- Check for hardcoded secrets/credentials
- Check for injection vulnerabilities
- Check for unsafe operations

## 5. Issue Alignment
- Does the implementation match the issue requirements?
- Are there any obvious gaps or missing features?

## Output Format

Respond with a JSON object:
{
  "approved": true/false,
  "syntaxValid": true/false,
  "requirementsMet": true/false,
  "securityIssues": ["issue1", "issue2"],
  "suggestions": ["suggestion1"],
  "confidence": 85,
  "reasoning": "Explanation of the review decision"
}`;

/**
 * Reviewer Agent Implementation
 */
export class ReviewerAgent extends BaseAgent {
  /** Review history */
  private history: ReviewHistoryEntry[] = [];

  /** Known security patterns */
  private securityPatterns: RegExp[] = [
    /password\s*=\s*['"][^'"]+['"]/i,
    /api[_-]?key\s*=\s*['"][^'"]+['"]/i,
    /secret\s*=\s*['"][^'"]+['"]/i,
    /token\s*=\s*['"][^'"]+['"]/i,
    /eval\s*\(/,
    /exec\s*\(/,
    /innerHTML\s*=/,
    /document\.write\s*\(/,
    /\$\{.*\}.*sql/i,
  ];

  constructor() {
    super({
      ...REVIEWER_CONFIG,
      defaultModel: getDefaultModelConfig(),
    });
  }

  /**
   * Initialize - load history from state
   */
  protected async onInitialize(): Promise<void> {
    const history = await this.loadState<ReviewHistoryEntry[]>('review_history');
    if (history) {
      this.history = history;
    }
  }

  /**
   * Shutdown - persist state
   */
  protected async onShutdown(): Promise<void> {
    await this.saveState('review_history', this.history);
  }

  /**
   * Process a review request
   * Supports conflict resolution review, code generation review, and PR quality review
   */
  protected async processTask(payload: TaskRequestPayload): Promise<ReviewerOutput> {
    if (payload.taskType !== 'review') {
      throw new Error(`Unsupported task type: ${payload.taskType}`);
    }

    const input = payload.input as ReviewerInput | CodeReviewInput | PRReviewInput | Record<string, unknown>;

    // Check if this is a code review (issue-to-code workflow)
    if ('workflowType' in input && input.workflowType === 'issue-to-code') {
      const codeInput = input as CodeReviewInput;
      return this.reviewCode(codeInput.codeResult, codeInput.issue);
    }

    // Check if this is a code review by detecting codeResult
    if ('codeResult' in input) {
      const codeInput = input as CodeReviewInput;
      return this.reviewCode(codeInput.codeResult, codeInput.issue);
    }

    // Check if this is a PR quality review (pr-review workflow)
    if ('triageResult' in input && 'pr' in input) {
      const prInput = input as PRReviewInput;
      return this.reviewPR(prInput);
    }

    // Otherwise, treat as conflict resolution review
    const resolveInput = input as ReviewerInput;
    if (!resolveInput.resolution || !resolveInput.originalConflict) {
      throw new Error('Invalid review input: missing resolution or originalConflict');
    }
    return this.review(resolveInput.resolution, resolveInput.originalConflict);
  }

  /**
   * Review a resolution
   */
  async review(
    resolution: ResolutionResult,
    originalConflict: ConflictInfo
  ): Promise<ReviewerOutput> {
    // Quick checks first (no LLM needed)
    const quickChecks = this.performQuickChecks(resolution, originalConflict);

    // If quick checks fail badly, don't even call LLM
    if (!quickChecks.syntaxValid || quickChecks.criticalSecurityIssue) {
      const review: ReviewResult = {
        approved: false,
        syntaxValid: quickChecks.syntaxValid,
        codeLossDetected: quickChecks.codeLossDetected,
        securityIssues: quickChecks.securityIssues,
        suggestions: quickChecks.suggestions,
        confidence: 95,
      };

      this.recordReview(resolution.file, review);

      return {
        review,
        shouldEscalate: true,
        escalationReason: quickChecks.syntaxValid
          ? 'Critical security issue detected'
          : 'Syntax validation failed',
      };
    }

    // Deep review with LLM
    const context = this.buildContext(resolution, originalConflict);

    const response = await this.chat({
      model: this.config.defaultModel,
      messages: [
        { role: 'system', content: REVIEWER_SYSTEM_PROMPT },
        { role: 'user', content: context },
      ],
      temperature: 0.2, // Very low for consistent reviews
    });

    const review = this.parseResponse(response, quickChecks);

    // Record in history
    this.recordReview(resolution.file, review);

    // Determine escalation
    const shouldEscalate =
      !review.approved ||
      review.confidence < 70 ||
      review.securityIssues.length > 0 ||
      review.codeLossDetected;

    return {
      review,
      shouldEscalate,
      escalationReason: shouldEscalate ? this.getEscalationReason(review) : undefined,
    };
  }

  /**
   * Review generated code from issue-to-code workflow
   */
  async reviewCode(
    codeResult: CodeGenerationResult,
    issue: IssueMetadata
  ): Promise<ReviewerOutput> {
    // Quick checks on all generated files
    const quickChecks = this.performCodeQuickChecks(codeResult);

    // If quick checks fail badly, don't even call LLM
    if (!quickChecks.syntaxValid || quickChecks.criticalSecurityIssue) {
      const review: ReviewResult = {
        approved: false,
        syntaxValid: quickChecks.syntaxValid,
        codeLossDetected: false, // Not applicable for code generation
        securityIssues: quickChecks.securityIssues,
        suggestions: quickChecks.suggestions,
        confidence: 95,
      };

      this.recordReview(`issue-${issue.number}`, review);

      return {
        review,
        shouldEscalate: true,
        escalationReason: quickChecks.syntaxValid
          ? 'Critical security issue detected'
          : 'Syntax validation failed',
      };
    }

    // Deep review with LLM
    const context = this.buildCodeReviewContext(codeResult, issue);

    const response = await this.chat({
      model: this.config.defaultModel,
      messages: [
        { role: 'system', content: CODE_REVIEW_SYSTEM_PROMPT },
        { role: 'user', content: context },
      ],
      temperature: 0.2,
    });

    const review = this.parseCodeReviewResponse(response, quickChecks);

    // Record in history
    this.recordReview(`issue-${issue.number}`, review);

    // Determine escalation
    const shouldEscalate =
      !review.approved ||
      review.confidence < 70 ||
      review.securityIssues.length > 0;

    return {
      review,
      shouldEscalate,
      escalationReason: shouldEscalate ? this.getEscalationReason(review) : undefined,
    };
  }

  /**
   * Review a PR quality (pr-review workflow)
   */
  async reviewPR(input: PRReviewInput): Promise<ReviewerOutput> {
    const context = this.buildPRReviewContext(input);

    const response = await this.chat({
      model: this.config.defaultModel,
      messages: [
        { role: 'system', content: PR_REVIEW_SYSTEM_PROMPT },
        { role: 'user', content: context },
      ],
      temperature: 0.3,
    });

    const review = this.parsePRReviewResponse(response, input);

    // Record in history
    this.recordReview(`pr-${input.pr.number}`, review);

    // Determine escalation
    const shouldEscalate =
      !review.approved ||
      review.confidence < 70;

    return {
      review,
      shouldEscalate,
      escalationReason: shouldEscalate ? this.getEscalationReason(review) : undefined,
    };
  }

  /**
   * Build context for PR quality review
   */
  private buildPRReviewContext(input: PRReviewInput): string {
    const { triageResult, pr, changedFiles, focusAreas } = input;

    const fileAnalysisText = triageResult.fileAnalyses
      ? triageResult.fileAnalyses.map(f =>
          `- ${f.file}: complexity ${f.complexity}, risk ${f.riskLevel}${f.concerns.length ? ` (${f.concerns.join(', ')})` : ''}`
        ).join('\n')
      : 'No file analysis available';

    return `## PR Quality Review Request

**PR #${pr.number}:** ${pr.title}
**URL:** ${pr.url}
**Files Changed:** ${pr.filesChanged}
**Additions:** +${pr.additions}
**Deletions:** -${pr.deletions}

### PR Description
${pr.body || 'No description provided'}

### Triage Analysis
**Overall Complexity:** ${triageResult.overallComplexity}/10
**Suggested Strategy:** ${triageResult.suggestedStrategy || 'Not specified'}

### File Analysis
${fileAnalysisText}

### Recommendations from Triage
${triageResult.recommendations?.join('\n- ') || 'None'}

### Changed Files
${changedFiles?.join('\n- ') || 'Not available'}

### Focus Areas
${focusAreas?.join('\n- ') || 'Not specified'}

Please review this PR and provide your assessment as a JSON object.`;
  }

  /**
   * Parse PR review response from LLM
   */
  private parsePRReviewResponse(
    response: string,
    input: PRReviewInput
  ): ReviewResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        approved: parsed.approved ?? true,
        syntaxValid: true, // Not applicable for PR review
        codeLossDetected: false, // Not applicable for PR review
        securityIssues: parsed.concerns?.filter((c: string) =>
          c.toLowerCase().includes('security')
        ) || [],
        suggestions: [
          ...(parsed.suggestions || []),
          ...(parsed.focusAreas || []).map((a: string) => `Focus area: ${a}`),
        ],
        confidence: parsed.confidence || 70,
      };
    } catch {
      // Fallback based on triage complexity
      const isHighRisk = input.triageResult.overallComplexity > 7;
      return {
        approved: !isHighRisk,
        syntaxValid: true,
        codeLossDetected: false,
        securityIssues: [],
        suggestions: ['LLM review failed - manual review recommended'],
        confidence: 50,
      };
    }
  }

  /**
   * Perform quick checks on generated code
   */
  private performCodeQuickChecks(codeResult: CodeGenerationResult): {
    syntaxValid: boolean;
    securityIssues: string[];
    suggestions: string[];
    criticalSecurityIssue: boolean;
  } {
    const securityIssues: string[] = [];
    const suggestions: string[] = [];
    let criticalSecurityIssue = false;
    let syntaxValid = true;

    // Check each generated file
    for (const file of codeResult.files) {
      // Basic syntax check
      const fileSyntaxValid = this.checkBasicSyntax(file.content);
      if (!fileSyntaxValid) {
        syntaxValid = false;
        suggestions.push(`Syntax error detected in ${file.path}`);
      }

      // Security pattern check
      for (const pattern of this.securityPatterns) {
        if (pattern.test(file.content)) {
          const issue = `Security pattern in ${file.path}: ${pattern.source}`;
          securityIssues.push(issue);

          if (/password|secret|api[_-]?key|token/i.test(pattern.source)) {
            criticalSecurityIssue = true;
          }
        }
      }
    }

    // Low confidence from coder is a yellow flag
    if (codeResult.confidence < 50) {
      suggestions.push(`Coder agent had low confidence (${codeResult.confidence}%) - review carefully`);
    }

    return {
      syntaxValid,
      securityIssues,
      suggestions,
      criticalSecurityIssue,
    };
  }

  /**
   * Build context for code generation review
   */
  private buildCodeReviewContext(codeResult: CodeGenerationResult, issue: IssueMetadata): string {
    const filesContext = codeResult.files.map((f) => `
### ${f.path} (${f.action})
**Explanation:** ${f.explanation}
\`\`\`
${f.content.slice(0, 2000)}${f.content.length > 2000 ? '\n...(truncated)' : ''}
\`\`\`
`).join('\n');

    return `## Code Generation Review Request

**Issue #:** ${issue.number}
**Issue Title:** ${issue.title}
**Repository:** ${issue.repo.fullName}

### Issue Description
${issue.body || 'No description provided'}

### Generated Code
**Files Generated:** ${codeResult.files.length}
**Coder Confidence:** ${codeResult.confidence}%
**Tests Included:** ${codeResult.testsIncluded}
**Summary:** ${codeResult.summary}

${filesContext}

Please review this generated code and provide your assessment as a JSON object.`;
  }

  /**
   * Parse code review response from LLM
   */
  private parseCodeReviewResponse(
    response: string,
    quickChecks: ReturnType<typeof this.performCodeQuickChecks>
  ): ReviewResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Merge with quick checks (quick checks are authoritative for security)
      return {
        approved: parsed.approved && quickChecks.syntaxValid && !quickChecks.criticalSecurityIssue,
        syntaxValid: quickChecks.syntaxValid && (parsed.syntaxValid !== false),
        codeLossDetected: false, // Not applicable for code generation
        securityIssues: [
          ...quickChecks.securityIssues,
          ...(parsed.securityIssues || []),
        ],
        suggestions: [
          ...quickChecks.suggestions,
          ...(parsed.suggestions || []),
        ],
        confidence: Math.min(parsed.confidence || 50, quickChecks.syntaxValid ? 100 : 20),
      };
    } catch {
      // Fallback - conservative review
      return {
        approved: false,
        syntaxValid: quickChecks.syntaxValid,
        codeLossDetected: false,
        securityIssues: quickChecks.securityIssues,
        suggestions: ['LLM review failed - manual review required'],
        confidence: 30,
      };
    }
  }

  /**
   * Perform quick checks without LLM
   */
  private performQuickChecks(
    resolution: ResolutionResult,
    originalConflict: ConflictInfo
  ): {
    syntaxValid: boolean;
    codeLossDetected: boolean;
    securityIssues: string[];
    suggestions: string[];
    criticalSecurityIssue: boolean;
  } {
    const securityIssues: string[] = [];
    const suggestions: string[] = [];
    let criticalSecurityIssue = false;

    // Basic syntax check (bracket matching)
    const syntaxValid = this.checkBasicSyntax(resolution.resolvedContent);

    // Code loss detection
    const codeLossDetected = this.detectCodeLoss(
      resolution.resolvedContent,
      originalConflict
    );

    if (codeLossDetected) {
      suggestions.push('Potential code loss detected - verify all changes are preserved');
    }

    // Security pattern check
    for (const pattern of this.securityPatterns) {
      if (pattern.test(resolution.resolvedContent)) {
        const issue = `Security pattern detected: ${pattern.source}`;
        securityIssues.push(issue);

        // Hardcoded credentials are critical
        if (/password|secret|api[_-]?key|token/i.test(pattern.source)) {
          criticalSecurityIssue = true;
        }
      }
    }

    return {
      syntaxValid,
      codeLossDetected,
      securityIssues,
      suggestions,
      criticalSecurityIssue,
    };
  }

  /**
   * Basic syntax validation (bracket matching)
   */
  private checkBasicSyntax(content: string): boolean {
    const brackets: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
    };
    const stack: string[] = [];
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const prevChar = i > 0 ? content[i - 1] : '';

      // Handle string literals
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (inString) continue;

      // Handle brackets
      if (brackets[char]) {
        stack.push(brackets[char]);
      } else if (Object.values(brackets).includes(char)) {
        if (stack.pop() !== char) {
          return false;
        }
      }
    }

    return stack.length === 0 && !inString;
  }

  /**
   * Detect potential code loss
   */
  private detectCodeLoss(resolved: string, original: ConflictInfo): boolean {
    // Extract significant tokens from both sides
    const oursTokens = this.extractSignificantTokens(original.oursContent);
    const theirsTokens = this.extractSignificantTokens(original.theirsContent);
    const resolvedTokens = this.extractSignificantTokens(resolved);

    // Check if significant tokens from either side are missing
    const missingFromOurs = oursTokens.filter(
      (t) => !resolvedTokens.includes(t) && !theirsTokens.includes(t)
    );
    const missingFromTheirs = theirsTokens.filter(
      (t) => !resolvedTokens.includes(t) && !oursTokens.includes(t)
    );

    // If unique tokens from either side are missing, flag code loss
    return missingFromOurs.length > 2 || missingFromTheirs.length > 2;
  }

  /**
   * Extract significant tokens (function names, class names, etc.)
   */
  private extractSignificantTokens(content: string): string[] {
    const tokens: string[] = [];

    // Function declarations
    const funcMatches = content.match(/function\s+(\w+)/g) || [];
    tokens.push(...funcMatches.map((m) => m.replace('function ', '')));

    // Class declarations
    const classMatches = content.match(/class\s+(\w+)/g) || [];
    tokens.push(...classMatches.map((m) => m.replace('class ', '')));

    // Const/let/var declarations
    const varMatches = content.match(/(?:const|let|var)\s+(\w+)/g) || [];
    tokens.push(...varMatches.map((m) => m.split(/\s+/)[1]));

    // Import names
    const importMatches = content.match(/import\s+\{([^}]+)\}/g) || [];
    for (const match of importMatches) {
      const names = match.replace(/import\s+\{|\}/g, '').split(',');
      tokens.push(...names.map((n) => n.trim()));
    }

    return [...new Set(tokens)];
  }

  /**
   * Build context for LLM review
   */
  private buildContext(resolution: ResolutionResult, conflict: ConflictInfo): string {
    return `## Code Review Request

**File:** ${resolution.file}
**Resolution Strategy:** ${resolution.strategy}
**Resolver Confidence:** ${resolution.confidence}%

### Original Conflict (Ours - HEAD)
\`\`\`
${conflict.oursContent.slice(0, 2000)}${conflict.oursContent.length > 2000 ? '\n...(truncated)' : ''}
\`\`\`

### Original Conflict (Theirs - Base)
\`\`\`
${conflict.theirsContent.slice(0, 2000)}${conflict.theirsContent.length > 2000 ? '\n...(truncated)' : ''}
\`\`\`

### Resolved Content
\`\`\`
${resolution.resolvedContent.slice(0, 3000)}${resolution.resolvedContent.length > 3000 ? '\n...(truncated)' : ''}
\`\`\`

### Resolver's Explanation
${resolution.explanation}

Please review this resolution and provide your assessment as a JSON object.`;
  }

  /**
   * Parse LLM response
   */
  private parseResponse(
    response: string,
    quickChecks: ReturnType<typeof this.performQuickChecks>
  ): ReviewResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Merge with quick checks (quick checks are authoritative for security)
      return {
        approved: parsed.approved && quickChecks.syntaxValid && !quickChecks.criticalSecurityIssue,
        syntaxValid: quickChecks.syntaxValid && (parsed.syntaxValid !== false),
        codeLossDetected: quickChecks.codeLossDetected || parsed.codeLossDetected,
        securityIssues: [
          ...quickChecks.securityIssues,
          ...(parsed.securityIssues || []),
        ],
        suggestions: [
          ...quickChecks.suggestions,
          ...(parsed.suggestions || []),
        ],
        confidence: Math.min(parsed.confidence || 50, quickChecks.syntaxValid ? 100 : 20),
      };
    } catch {
      // Fallback - conservative review
      return {
        approved: false,
        syntaxValid: quickChecks.syntaxValid,
        codeLossDetected: quickChecks.codeLossDetected,
        securityIssues: quickChecks.securityIssues,
        suggestions: ['LLM review failed - manual review required'],
        confidence: 30,
      };
    }
  }

  /**
   * Get escalation reason
   */
  private getEscalationReason(review: ReviewResult): string {
    if (!review.syntaxValid) return 'Syntax validation failed';
    if (review.codeLossDetected) return 'Potential code loss detected';
    if (review.securityIssues.length > 0) return `Security issues: ${review.securityIssues.join(', ')}`;
    if (review.confidence < 70) return `Low confidence (${review.confidence}%)`;
    if (!review.approved) return 'Review not approved';
    return 'Unknown reason';
  }

  /**
   * Record review in history
   */
  private recordReview(file: string, review: ReviewResult): void {
    this.history.push({
      file,
      approved: review.approved,
      issues: [...review.securityIssues, ...(review.codeLossDetected ? ['code_loss'] : [])],
      timestamp: Date.now(),
    });

    // Keep bounded
    if (this.history.length > 500) {
      this.history = this.history.slice(-500);
    }

    // Persist
    this.saveState('review_history', this.history);
  }

  /**
   * Get review statistics
   */
  async getStats(): Promise<{
    total: number;
    approved: number;
    rejected: number;
    commonIssues: Record<string, number>;
  }> {
    const commonIssues: Record<string, number> = {};

    for (const entry of this.history) {
      for (const issue of entry.issues) {
        commonIssues[issue] = (commonIssues[issue] || 0) + 1;
      }
    }

    return {
      total: this.history.length,
      approved: this.history.filter((e) => e.approved).length,
      rejected: this.history.filter((e) => !e.approved).length,
      commonIssues,
    };
  }
}

/**
 * Create a Reviewer Agent instance
 */
export function createReviewerAgent(): ReviewerAgent {
  return new ReviewerAgent();
}
