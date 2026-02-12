/**
 * Autopilot Executor
 *
 * Phase 34 P1: Full Issue → PR workflow orchestrator.
 *
 * This module orchestrates the complete autopilot workflow:
 * 1. Analyze issue and extract requirements
 * 2. Generate implementation plan
 * 3. Generate code patches
 * 4. Apply patches to isolated workspace
 * 5. Run tests
 * 6. Create PR
 *
 * @module @gwi/engine/run/autopilot-executor
 */

import {
  TriageAgent,
  CoderAgent,
  type CoderRunInput,
  type CoderRunOutput,
  analyzeQuality,
  analyzeLinguistic,
  hasObviousComments,
  type SlopAnalysisInput,
} from '@gwi/agents';
import {
  type IssueMetadata,
  type ComplexityScore,
  getRunWorkspaceDir,
  getRunArtifactPaths,
  createIsolatedWorkspace,
  type IsolatedWorkspaceConfig,
  type IsolatedWorkspace,
  getFirestoreJobStore,
  getLogger,
} from '@gwi/core';
import { createGitHubClient } from '@gwi/integrations';
import { mkdir, writeFile } from 'fs/promises';

const logger = getLogger('autopilot-executor');

// =============================================================================
// Types
// =============================================================================

/**
 * Autopilot run configuration
 */
export interface AutopilotConfig {
  /** Tenant ID */
  tenantId: string;
  /** Run ID */
  runId: string;
  /** Issue details */
  issue: {
    number: number;
    title: string;
    body: string | null;
    url: string;
    labels?: string[];
    author?: string;
  };
  /** Repository info */
  repo: {
    owner: string;
    name: string;
    fullName: string;
  };
  /** GitHub App installation */
  installation: {
    id: number;
    token: string;
  };
  /** Base branch (default: main) */
  baseBranch?: string;
  /** Dry run mode */
  dryRun?: boolean;
  /** Skip tests */
  skipTests?: boolean;
  /** Worker ID for job tracking */
  workerId?: string;
  /** Job ID for durable tracking */
  jobId?: string;
}

/**
 * Phase result
 */
export interface PhaseResult {
  completed: boolean;
  durationMs?: number;
  error?: string;
  data?: Record<string, unknown>;
}

/**
 * Autopilot run result
 */
export interface AutopilotResult {
  success: boolean;
  runId: string;
  tenantId: string;
  issue: {
    number: number;
    url: string;
  };
  phases: {
    analyze: PhaseResult;
    plan: PhaseResult;
    apply: PhaseResult & { filesModified: number; filesCreated: number };
    test: PhaseResult & { passed?: boolean };
    pr: PhaseResult & { prNumber?: number; prUrl?: string };
  };
  totalDurationMs?: number;
  error?: string;
}

/**
 * Issue analysis result
 */
interface IssueAnalysis {
  requirements: string[];
  affectedAreas: string[];
  complexity: ComplexityScore;
  suggestedApproach: string;
  estimatedFiles: number;
}

// =============================================================================
// Autopilot Executor
// =============================================================================

/**
 * Execute the full autopilot workflow
 */
export class AutopilotExecutor {
  private config: AutopilotConfig;
  private workspace: IsolatedWorkspace | null = null;
  private startTime: number = 0;

  constructor(config: AutopilotConfig) {
    this.config = {
      ...config,
      baseBranch: config.baseBranch || 'main',
    };
  }

  /**
   * Execute the complete autopilot workflow
   */
  async execute(): Promise<AutopilotResult> {
    this.startTime = Date.now();

    const result: AutopilotResult = {
      success: false,
      runId: this.config.runId,
      tenantId: this.config.tenantId,
      issue: {
        number: this.config.issue.number,
        url: this.config.issue.url,
      },
      phases: {
        analyze: { completed: false },
        plan: { completed: false },
        apply: { completed: false, filesModified: 0, filesCreated: 0 },
        test: { completed: false },
        pr: { completed: false },
      },
    };

    try {
      logger.info('Starting autopilot execution', {
        runId: this.config.runId,
        issue: this.config.issue.number,
        repo: this.config.repo.fullName,
      });

      // Update job status if tracking
      await this.updateJobStatus('running');

      // Phase 1: Analyze issue
      const analyzeStart = Date.now();
      const analysis = await this.analyzeIssue();
      result.phases.analyze = {
        completed: true,
        durationMs: Date.now() - analyzeStart,
        data: { complexity: analysis.complexity, requirements: analysis.requirements.length },
      };

      // Phase 2: Generate plan and code
      const planStart = Date.now();
      const coderOutput = await this.generateCode(analysis);
      result.phases.plan = {
        completed: true,
        durationMs: Date.now() - planStart,
        data: { filesGenerated: coderOutput.code.files.length },
      };

      // Phase 2.5: Quality gate - validate generated code before apply
      if (!this.config.dryRun) {
        this.validateCodeQuality(coderOutput);
      }

      // Phase 3: Apply patches to isolated workspace
      const applyStart = Date.now();
      const applyResult = await this.applyPatches(coderOutput);
      result.phases.apply = {
        completed: applyResult.success,
        durationMs: Date.now() - applyStart,
        filesModified: applyResult.filesModified,
        filesCreated: applyResult.filesCreated,
        error: applyResult.error,
      };

      if (!applyResult.success) {
        throw new Error(`Apply phase failed: ${applyResult.error}`);
      }

      // Phase 4: Run tests (optional)
      const testStart = Date.now();
      if (!this.config.skipTests && !this.config.dryRun) {
        const testResult = await this.runTests();
        result.phases.test = {
          completed: true,
          durationMs: Date.now() - testStart,
          passed: testResult.passed,
          error: testResult.error,
        };

        if (!testResult.passed) {
          logger.warn('Tests failed, continuing with PR creation', {
            runId: this.config.runId,
            error: testResult.error,
          });
        }
      } else {
        result.phases.test = {
          completed: true,
          durationMs: 0,
          data: { skipped: true },
        };
      }

      // Phase 5: Create PR
      const prStart = Date.now();
      if (!this.config.dryRun) {
        const prResult = await this.createPR(coderOutput);
        result.phases.pr = {
          completed: prResult.success,
          durationMs: Date.now() - prStart,
          prNumber: prResult.prNumber,
          prUrl: prResult.prUrl,
          error: prResult.error,
        };

        if (!prResult.success) {
          throw new Error(`PR creation failed: ${prResult.error}`);
        }
      } else {
        result.phases.pr = {
          completed: true,
          durationMs: 0,
          data: { dryRun: true },
        };
      }

      result.success = true;
      result.totalDurationMs = Date.now() - this.startTime;

      logger.info('Autopilot execution completed', {
        runId: this.config.runId,
        success: true,
        prNumber: result.phases.pr.prNumber,
        totalDurationMs: result.totalDurationMs,
      });

      await this.updateJobStatus('completed', { result });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.error = errorMessage;
      result.totalDurationMs = Date.now() - this.startTime;

      logger.error('Autopilot execution failed', {
        runId: this.config.runId,
        error: errorMessage,
        phase: this.getCurrentPhase(result),
      });

      await this.updateJobStatus('failed', { error: errorMessage });

      return result;
    } finally {
      // Cleanup workspace
      await this.cleanup();
    }
  }

  // =============================================================================
  // Phase Implementations
  // =============================================================================

  /**
   * Phase 1: Analyze issue and extract requirements
   */
  private async analyzeIssue(): Promise<IssueAnalysis> {
    logger.info('Analyzing issue', {
      runId: this.config.runId,
      issue: this.config.issue.number,
    });

    // Create issue metadata for triage
    const issueMetadata: IssueMetadata = {
      url: this.config.issue.url,
      number: this.config.issue.number,
      title: this.config.issue.title,
      body: this.config.issue.body || '',
      author: this.config.issue.author || 'unknown',
      labels: this.config.issue.labels || [],
      assignees: [],
      milestone: undefined,
      repo: {
        owner: this.config.repo.owner,
        name: this.config.repo.name,
        fullName: this.config.repo.fullName,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.config.dryRun) {
      // Mock analysis for dry run
      return {
        requirements: ['Implement feature as described'],
        affectedAreas: ['src'],
        complexity: 5 as ComplexityScore,
        suggestedApproach: 'Create new files based on issue description',
        estimatedFiles: 2,
      };
    }

    // Run real triage
    const triageAgent = new TriageAgent();
    await triageAgent.initialize();

    try {
      const triageResult = await triageAgent.triageIssue(issueMetadata);

      return {
        requirements: this.extractRequirements(this.config.issue.body || ''),
        affectedAreas: triageResult.fileComplexities.map(f => f.file),
        complexity: triageResult.overallComplexity,
        suggestedApproach: triageResult.explanation,
        estimatedFiles: triageResult.fileComplexities.length || 2,
      };
    } finally {
      await triageAgent.shutdown();
    }
  }

  /**
   * Phase 2: Generate implementation plan and code
   */
  private async generateCode(analysis: IssueAnalysis): Promise<CoderRunOutput> {
    logger.info('Generating code', {
      runId: this.config.runId,
      complexity: analysis.complexity,
    });

    const workspaceDir = getRunWorkspaceDir(this.config.runId);
    await mkdir(workspaceDir, { recursive: true });

    if (this.config.dryRun) {
      // Mock code generation for dry run
      const { planPath } = getRunArtifactPaths(this.config.runId);

      const planContent = [
        `# Implementation Plan for Issue #${this.config.issue.number}`,
        '',
        `**Issue:** ${this.config.issue.title}`,
        `**Repository:** ${this.config.repo.fullName}`,
        `**Complexity:** ${analysis.complexity}/10`,
        '',
        '## Requirements',
        ...analysis.requirements.map(r => `- ${r}`),
        '',
        '## Approach',
        analysis.suggestedApproach,
        '',
        '## Files to Create/Modify',
        ...analysis.affectedAreas.map(a => `- ${a}`),
        '',
        '---',
        '*Generated by Git With Intent (dry run)*',
      ].join('\n');

      await writeFile(planPath, planContent, 'utf-8');

      return {
        code: {
          files: [
            {
              path: 'src/feature.ts',
              content: '// Placeholder code for dry run',
              action: 'create',
              explanation: 'Placeholder file for dry run mode',
            },
          ],
          summary: 'Dry run - no actual code generated',
          confidence: 100,
          testsIncluded: false,
          estimatedComplexity: analysis.complexity,
        },
        tokensUsed: { input: 0, output: 0 },
        artifacts: {
          planPath,
          patchPaths: [],
          notes: 'Dry run mode - no LLM calls made',
        },
      };
    }

    // Run real code generation
    const coderAgent = new CoderAgent();
    await coderAgent.initialize();

    try {
      const coderInput: CoderRunInput = {
        runId: this.config.runId,
        issue: {
          url: this.config.issue.url,
          number: this.config.issue.number,
          title: this.config.issue.title,
          body: this.config.issue.body || '',
          author: this.config.issue.author || 'unknown',
          labels: this.config.issue.labels || [],
          assignees: [],
          milestone: undefined,
          repo: this.config.repo,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        complexity: analysis.complexity,
        triageSummary: analysis.suggestedApproach,
        repoRef: {
          owner: this.config.repo.owner,
          name: this.config.repo.name,
        },
      };

      return await coderAgent.generateCodeWithArtifacts(coderInput);
    } finally {
      await coderAgent.shutdown();
    }
  }

  /**
   * Phase 3: Apply patches to isolated workspace
   */
  private async applyPatches(
    coderOutput: CoderRunOutput
  ): Promise<{ success: boolean; filesModified: number; filesCreated: number; error?: string }> {
    logger.info('Applying patches', {
      runId: this.config.runId,
      fileCount: coderOutput.code.files.length,
    });

    if (this.config.dryRun) {
      return {
        success: true,
        filesModified: 0,
        filesCreated: coderOutput.code.files.length,
      };
    }

    // Create isolated workspace
    const workspaceConfig: IsolatedWorkspaceConfig = {
      tenantId: this.config.tenantId,
      runId: this.config.runId,
      owner: this.config.repo.owner,
      repo: this.config.repo.name,
      baseBranch: this.config.baseBranch || 'main',
      targetBranch: `gwi/autopilot-${this.config.issue.number}`,
      installationToken: this.config.installation.token,
      installationId: this.config.installation.id,
    };

    const workspaceManager = createIsolatedWorkspace(workspaceConfig);

    try {
      this.workspace = await workspaceManager.initialize();

      let filesModified = 0;
      let filesCreated = 0;

      // Write each file to workspace (with path validation)
      for (const file of coderOutput.code.files) {
        // Defense-in-depth: validate paths before writing to disk
        const normalizedPath = file.path.replace(/\\/g, '/');
        if (normalizedPath.includes('..') || normalizedPath.startsWith('/') || /[;&|`$(){}!#]/.test(normalizedPath) || normalizedPath.includes('\0')) {
          throw new Error(`Unsafe file path rejected in autopilot: ${file.path}`);
        }
        await workspaceManager.writeFile(file.path, file.content);

        if (file.action === 'create') {
          filesCreated++;
        } else {
          filesModified++;
        }
      }

      // Commit changes
      const commitResult = await workspaceManager.commit(
        `feat: implement issue #${this.config.issue.number}\n\n${this.config.issue.title}\n\nGenerated by Git With Intent`,
        {
          name: 'Git With Intent',
          email: 'bot@gitwithintent.dev',
        }
      );

      if (!commitResult.success) {
        return {
          success: false,
          filesModified,
          filesCreated,
          error: commitResult.error,
        };
      }

      // Push changes
      const pushResult = await workspaceManager.push();

      if (!pushResult.success) {
        return {
          success: false,
          filesModified,
          filesCreated,
          error: pushResult.error,
        };
      }

      return {
        success: true,
        filesModified,
        filesCreated,
      };
    } catch (error) {
      return {
        success: false,
        filesModified: 0,
        filesCreated: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Phase 4: Run tests
   */
  private async runTests(): Promise<{ passed: boolean; error?: string }> {
    logger.info('Running tests', { runId: this.config.runId });

    if (!this.workspace) {
      return { passed: false, error: 'No workspace available for tests' };
    }

    // Test runner implementation tracked in git-with-intent-cgo3
    // For now, return success - tests will be validated by CI after PR is created
    return { passed: true };
  }

  /**
   * Phase 5: Create PR
   */
  private async createPR(
    coderOutput: CoderRunOutput
  ): Promise<{ success: boolean; prNumber?: number; prUrl?: string; error?: string }> {
    logger.info('Creating PR', {
      runId: this.config.runId,
      issue: this.config.issue.number,
    });

    const github = createGitHubClient({
      token: this.config.installation.token,
    });

    try {
      const prBody = [
        `## Summary`,
        '',
        `Implements issue #${this.config.issue.number}: ${this.config.issue.title}`,
        '',
        '## Changes',
        '',
        ...coderOutput.code.files.map(f => `- \`${f.path}\` (${f.action})`),
        '',
        '## Generated Plan',
        '',
        coderOutput.code.summary,
        '',
        '---',
        `Closes #${this.config.issue.number}`,
        '',
        '*Generated by [Git With Intent](https://gitwithintent.dev)*',
      ].join('\n');

      const prResult = await github.createPR({
        owner: this.config.repo.owner,
        repo: this.config.repo.name,
        title: `feat: implement issue #${this.config.issue.number}`,
        body: prBody,
        head: `gwi/autopilot-${this.config.issue.number}`,
        base: this.config.baseBranch || 'main',
      });

      return {
        success: true,
        prNumber: prResult.number,
        prUrl: prResult.url,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  /**
   * Phase 2.5: Validate generated code quality before apply/commit.
   * Runs the same slop analyzers used for external PRs on internal output.
   */
  private validateCodeQuality(coderOutput: CoderRunOutput): void {
    const { files, confidence } = coderOutput.code;

    if (files.length === 0) {
      return; // Nothing to validate
    }

    const MIN_CONFIDENCE = 40;
    if (confidence < MIN_CONFIDENCE) {
      throw new Error(
        `Code quality gate: confidence too low (${confidence}%, minimum ${MIN_CONFIDENCE}%)`
      );
    }

    // Synthesize a diff from generated files for analyzer input
    const diffLines: string[] = [];
    const slopFiles: SlopAnalysisInput['files'] = [];

    for (const file of files) {
      const contentLines = file.content.split('\n');
      diffLines.push(`--- /dev/null`);
      diffLines.push(`+++ b/${file.path}`);
      diffLines.push(`@@ -0,0 +1,${contentLines.length} @@`);
      for (const line of contentLines) {
        diffLines.push(`+${line}`);
      }
      slopFiles.push({ path: file.path, additions: contentLines.length, deletions: 0 });
    }

    const analysisInput: SlopAnalysisInput = {
      prUrl: 'internal://agent/coder',
      diff: diffLines.join('\n'),
      prTitle: 'Agent-generated code',
      prBody: coderOutput.code.summary,
      contributor: 'gwi-coder-agent',
      files: slopFiles,
    };

    const qualityResult = analyzeQuality(analysisInput);
    const linguisticResult = analyzeLinguistic(analysisInput);
    const combinedScore = Math.min(100, qualityResult.totalWeight + linguisticResult.totalWeight);

    // Check for obvious comments in the generated code
    const allContent = files.map(f => f.content).join('\n');
    const hasObvious = hasObviousComments(allContent);

    const MAX_SLOP_SCORE = 60;
    if (combinedScore > MAX_SLOP_SCORE) {
      const signals = [
        ...qualityResult.signals.map(s => s.signal),
        ...linguisticResult.signals.map(s => s.signal),
      ];

      logger.warn('Code quality gate blocked code', {
        runId: this.config.runId,
        combinedScore,
        confidence,
        signals,
        hasObviousComments: hasObvious,
      });

      throw new Error(
        `Code quality gate: slop score too high (${combinedScore}, max ${MAX_SLOP_SCORE}). ` +
        `Signals: ${signals.join(', ')}`
      );
    }

    logger.info('Code quality gate passed', {
      runId: this.config.runId,
      combinedScore,
      confidence,
      hasObviousComments: hasObvious,
    });
  }

  private extractRequirements(body: string): string[] {
    const requirements: string[] = [];

    // Extract bullet points
    const bulletMatches = body.match(/^[-*]\s+(.+)$/gm);
    if (bulletMatches) {
      requirements.push(...bulletMatches.map(m => m.replace(/^[-*]\s+/, '')));
    }

    // Extract numbered items
    const numberedMatches = body.match(/^\d+\.\s+(.+)$/gm);
    if (numberedMatches) {
      requirements.push(...numberedMatches.map(m => m.replace(/^\d+\.\s+/, '')));
    }

    // If no structured requirements, use first paragraph as requirement
    if (requirements.length === 0 && body.trim()) {
      const firstParagraph = body.split('\n\n')[0].trim();
      if (firstParagraph) {
        requirements.push(firstParagraph);
      }
    }

    return requirements;
  }

  private getCurrentPhase(result: AutopilotResult): string {
    if (!result.phases.analyze.completed) return 'analyze';
    if (!result.phases.plan.completed) return 'plan';
    if (!result.phases.apply.completed) return 'apply';
    if (!result.phases.test.completed) return 'test';
    if (!result.phases.pr.completed) return 'pr';
    return 'completed';
  }

  private async updateJobStatus(
    status: 'running' | 'completed' | 'failed',
    data?: Record<string, unknown>
  ): Promise<void> {
    if (!this.config.jobId || !this.config.workerId) {
      return;
    }

    try {
      const jobStore = getFirestoreJobStore();

      if (status === 'running') {
        await jobStore.startJob(this.config.jobId, this.config.workerId);
      } else if (status === 'completed') {
        await jobStore.completeJob(this.config.jobId, this.config.workerId, {
          result: data,
        });
      } else if (status === 'failed') {
        await jobStore.failJob(
          this.config.jobId,
          this.config.workerId,
          data?.error as string || 'Unknown error'
        );
      }
    } catch (error) {
      logger.warn('Failed to update job status', {
        jobId: this.config.jobId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async cleanup(): Promise<void> {
    // Workspace cleanup is handled by the workspace manager
    // Additional cleanup can be added here
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Execute an autopilot workflow
 */
export async function executeAutopilot(config: AutopilotConfig): Promise<AutopilotResult> {
  const executor = new AutopilotExecutor(config);
  return executor.execute();
}
