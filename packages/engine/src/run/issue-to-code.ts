/**
 * Issue-to-Code Workflow Entrypoint
 *
 * Phase 4: Provides a single entrypoint for the issue-to-code workflow.
 *
 * This module:
 * - Parses GitHub issue URLs
 * - Fetches issue metadata
 * - Runs triage
 * - Generates code via CoderAgent
 * - Returns paths to workspace artifacts
 *
 * @module @gwi/engine/run/issue-to-code
 */

import {
  TriageAgent,
  CoderAgent,
  type CoderRunInput,
  type CoderRunOutput,
} from '@gwi/agents';
import {
  type IssueMetadata,
  type ComplexityScore,
  getRunWorkspaceDir,
} from '@gwi/core';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the issue-to-code workflow
 */
export interface IssueToCodeOptions {
  /** Override the run ID (auto-generated if not provided) */
  runId?: string;
  /** Dry run mode - don't call LLMs */
  dryRun?: boolean;
  /** Skip triage and use this complexity */
  skipTriage?: ComplexityScore;
  /** Additional context from the repo */
  repoContext?: {
    primaryLanguage?: string;
    frameworks?: string[];
    existingPatterns?: string[];
  };
  /** User preferences */
  preferences?: {
    includeTests?: boolean;
    codeStyle?: string;
    maxFilesToCreate?: number;
  };
}

/**
 * Result from the issue-to-code workflow
 */
export interface IssueToCodeResult {
  /** Whether the workflow succeeded */
  success: boolean;
  /** Unique run identifier */
  runId: string;
  /** Workspace directory path */
  workspaceDir: string;
  /** Triage summary */
  triageSummary: string;
  /** Complexity score */
  complexity: ComplexityScore;
  /** Plan file path */
  planPath: string;
  /** Patch file paths */
  patchPaths: string[];
  /** Number of files generated */
  filesGenerated: number;
  /** Confidence score (0-100) */
  confidence: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Parsed GitHub issue URL
 */
export interface ParsedGitHubIssue {
  owner: string;
  repo: string;
  issueNumber: number;
  fullName: string;
}

// =============================================================================
// URL Parsing
// =============================================================================

/**
 * Parse a GitHub issue URL
 *
 * Supports formats:
 * - https://github.com/owner/repo/issues/123
 * - github.com/owner/repo/issues/123
 * - owner/repo#123
 *
 * @param url - GitHub issue URL or shorthand
 * @returns Parsed issue info or null if invalid
 */
export function parseGitHubIssueUrl(url: string): ParsedGitHubIssue | null {
  // Full URL format: https://github.com/owner/repo/issues/123
  const fullUrlMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (fullUrlMatch) {
    const [, owner, repo, issueNumber] = fullUrlMatch;
    return {
      owner,
      repo,
      issueNumber: parseInt(issueNumber, 10),
      fullName: `${owner}/${repo}`,
    };
  }

  // Shorthand format: owner/repo#123
  const shorthandMatch = url.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (shorthandMatch) {
    const [, owner, repo, issueNumber] = shorthandMatch;
    return {
      owner,
      repo,
      issueNumber: parseInt(issueNumber, 10),
      fullName: `${owner}/${repo}`,
    };
  }

  return null;
}

// =============================================================================
// Run ID Generation
// =============================================================================

/**
 * Generate a unique run ID
 */
function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `run-${timestamp}-${random}`;
}

// =============================================================================
// Mock Issue Fetching (for dry-run mode)
// =============================================================================

/**
 * Create a mock issue for dry-run mode
 */
function createMockIssue(parsed: ParsedGitHubIssue): IssueMetadata {
  return {
    url: `https://github.com/${parsed.fullName}/issues/${parsed.issueNumber}`,
    number: parsed.issueNumber,
    title: `Mock Issue #${parsed.issueNumber}`,
    body: `This is a mock issue for dry-run mode.\n\nRepository: ${parsed.fullName}\nIssue: #${parsed.issueNumber}`,
    author: 'mock-user',
    labels: ['mock'],
    assignees: [],
    milestone: undefined,
    repo: {
      owner: parsed.owner,
      name: parsed.repo,
      fullName: parsed.fullName,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// =============================================================================
// Main Workflow Entrypoint
// =============================================================================

/**
 * Run the issue-to-code workflow from a GitHub issue URL
 *
 * This is the main entrypoint for the issue-to-code workflow.
 * It parses the URL, triages the issue, generates code, and
 * writes artifacts to the workspace.
 *
 * @param url - GitHub issue URL
 * @param options - Workflow options
 * @returns Workflow result with artifact paths
 *
 * @example
 * ```typescript
 * const result = await runIssueToCodeFromGithubUrl(
 *   'https://github.com/owner/repo/issues/123',
 *   { dryRun: true }
 * );
 *
 * console.log('Plan:', result.planPath);
 * console.log('Patches:', result.patchPaths);
 * ```
 */
export async function runIssueToCodeFromGithubUrl(
  url: string,
  options: IssueToCodeOptions = {}
): Promise<IssueToCodeResult> {
  const runId = options.runId || generateRunId();
  const workspaceDir = getRunWorkspaceDir(runId);

  try {
    // Parse the URL
    const parsed = parseGitHubIssueUrl(url);
    if (!parsed) {
      return {
        success: false,
        runId,
        workspaceDir,
        triageSummary: '',
        complexity: 5 as ComplexityScore,
        planPath: '',
        patchPaths: [],
        filesGenerated: 0,
        confidence: 0,
        error: `Invalid GitHub issue URL: ${url}`,
      };
    }

    // Get issue metadata (mock for dry-run, real fetch otherwise)
    let issue: IssueMetadata;
    if (options.dryRun) {
      issue = createMockIssue(parsed);
    } else {
      // TODO: Use @gwi/integrations to fetch real issue
      // For now, use mock in all cases
      issue = createMockIssue(parsed);
    }

    // Run triage (or use provided complexity)
    let complexity: ComplexityScore;
    let triageSummary: string;

    if (options.skipTriage) {
      complexity = options.skipTriage;
      triageSummary = `Skipped triage - using provided complexity: ${complexity}`;
    } else if (options.dryRun) {
      complexity = 5 as ComplexityScore;
      triageSummary = `Dry run - using default complexity: ${complexity}`;
    } else {
      // Run real triage
      const triageAgent = new TriageAgent();
      await triageAgent.initialize();

      const triageResult = await triageAgent.triageIssue(issue);

      complexity = triageResult.overallComplexity;
      triageSummary = triageResult.explanation;

      await triageAgent.shutdown();
    }

    // Run coder
    let coderOutput: CoderRunOutput;

    if (options.dryRun) {
      // Create mock output for dry-run
      const { mkdir, writeFile } = await import('fs/promises');
      const { getRunArtifactPaths, getPatchFilePath } = await import('@gwi/core');

      await mkdir(workspaceDir, { recursive: true });

      const { planPath } = getRunArtifactPaths(runId);
      const mockPlanContent = [
        '# Code Generation Plan (Dry Run)',
        '',
        `**Generated:** ${new Date().toISOString()}`,
        `**Issue:** #${parsed.issueNumber} - ${issue.title}`,
        `**Repository:** ${parsed.fullName}`,
        `**Complexity:** ${complexity}/10`,
        '',
        '## Summary',
        '',
        'This is a dry run. No LLM was called.',
        '',
        '## Triage Summary',
        '',
        triageSummary,
      ].join('\n');

      await writeFile(planPath, mockPlanContent, 'utf-8');

      const patchPath = getPatchFilePath(runId, 1);
      const mockPatchContent = [
        '# Mock Patch (Dry Run)',
        '',
        'This is a placeholder patch for dry-run mode.',
        'No actual code was generated.',
      ].join('\n');

      await writeFile(patchPath, mockPatchContent, 'utf-8');

      coderOutput = {
        code: {
          files: [],
          summary: 'Dry run - no code generated',
          confidence: 100,
          testsIncluded: false,
          estimatedComplexity: complexity,
        },
        tokensUsed: { input: 0, output: 0 },
        artifacts: {
          planPath,
          patchPaths: [patchPath],
          notes: 'Dry run mode - no LLM calls made',
        },
      };
    } else {
      // Run real coder
      const coderAgent = new CoderAgent();
      await coderAgent.initialize();

      const coderInput: CoderRunInput = {
        runId,
        issue,
        complexity,
        triageSummary,
        repoRef: {
          owner: parsed.owner,
          name: parsed.repo,
        },
        repoContext: options.repoContext,
        preferences: options.preferences,
      };

      coderOutput = await coderAgent.generateCodeWithArtifacts(coderInput);

      await coderAgent.shutdown();
    }

    return {
      success: true,
      runId,
      workspaceDir,
      triageSummary,
      complexity,
      planPath: coderOutput.artifacts.planPath,
      patchPaths: coderOutput.artifacts.patchPaths,
      filesGenerated: coderOutput.code.files.length,
      confidence: coderOutput.code.confidence,
    };
  } catch (error) {
    return {
      success: false,
      runId,
      workspaceDir,
      triageSummary: '',
      complexity: 5 as ComplexityScore,
      planPath: '',
      patchPaths: [],
      filesGenerated: 0,
      confidence: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
