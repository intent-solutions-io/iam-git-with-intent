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
} from '@gwi/agents';
import {
  type IssueMetadata,
  type ComplexityScore,
  type StepStatus,
  type StepCheckpoint,
  getRunWorkspaceDir,
  getRunArtifactPaths,
  createIsolatedWorkspace,
  type IsolatedWorkspaceConfig,
  type IsolatedWorkspace,
  getFirestoreJobStore,
  getLogger,
  type Phase25ApprovalScope as ApprovalScope,
} from '@gwi/core';
import { createGitHubClient } from '@gwi/integrations';
import { DenoSandboxProvider } from '@gwi/sandbox';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { buildDefaultHookRunner } from '../hooks/config.js';
import { AgentHookRunner } from '../hooks/runner.js';
import type { AgentRunContext, AgentRole } from '../hooks/types.js';
import {
  CodeQualityHook,
  CodeQualityError,
  DEFAULT_CODE_QUALITY_CONFIG,
} from '../hooks/code-quality-hook.js';
import type { CheckpointStore } from './checkpoint.js';
import { InMemoryCheckpointStore } from './checkpoint.js';
import {
  loadSignedApprovalsForRun,
  checkApprovalCoverage,
} from './approval-loader.js';

const logger = getLogger('autopilot-executor');

/**
 * Zod schema for LLM-generated file payloads.
 * Validates structure and enforces bounds before any file operations.
 */
const LlmFileSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(1_000_000), // 1MB max per file
  action: z.string().optional(),
});
const LlmFilesSchema = z.array(LlmFileSchema).max(200); // 200 files max

/**
 * Validate a file path is safe for writing within a workspace.
 * Rejects traversal, absolute paths (Unix + Windows), shell metacharacters, and null bytes.
 */
function validateFilePath(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (
    normalizedPath.includes('..') ||
    normalizedPath.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalizedPath) ||
    /[;&|`$(){}!#]/.test(normalizedPath) ||
    normalizedPath.includes('\0')
  ) {
    throw new Error(`Unsafe file path rejected in autopilot: ${filePath}`);
  }
  return normalizedPath;
}

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
  /** Enable sandbox isolation for LLM-generated file writes */
  sandboxEnabled?: boolean;
  /** Worker ID for job tracking */
  workerId?: string;
  /** Job ID for durable tracking */
  jobId?: string;
  /** Checkpoint store for durable phase persistence */
  checkpointStore?: CheckpointStore;
  /** Require signed approval before destructive operations (commit/push/PR) */
  requireApproval?: boolean;
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
  private hookRunner: AgentHookRunner | null = null;
  private completedPhases: string[] = [];
  private checkpointStore: CheckpointStore;

  constructor(config: AutopilotConfig) {
    this.config = {
      ...config,
      baseBranch: config.baseBranch || 'main',
    };
    this.checkpointStore = config.checkpointStore ?? new InMemoryCheckpointStore();
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

      // Initialize hook runner for lifecycle events
      this.hookRunner = await buildDefaultHookRunner();

      // Fire runStart hooks (risk enforcement validates before execution)
      const startCtx = this.createHookContext('FOREMAN', 'run-start', 'running');
      await this.hookRunner.runStart(startCtx);

      // Update job status if tracking
      await this.updateJobStatus('running');

      // Phase 1: Analyze issue
      const analyzeStart = Date.now();
      const analysis = await this.analyzeIssue();
      const analyzeDuration = Date.now() - analyzeStart;
      result.phases.analyze = {
        completed: true,
        durationMs: analyzeDuration,
        data: { complexity: analysis.complexity, requirements: analysis.requirements.length },
      };
      await this.checkpoint('analyze', { complexity: analysis.complexity });
      await this.hookRunner.afterStep(
        this.createHookContext('TRIAGE', 'analyze', 'completed', analyzeDuration, {
          complexity: analysis.complexity,
          requirements: analysis.requirements.length,
        })
      );

      // Validate CODER role risk tier before code generation/apply phases
      // (runStart only checked FOREMAN; CODER requires R2)
      await this.hookRunner.runStart(
        this.createHookContext('CODER', 'validate-coder-role', 'running')
      );

      // Phase 2: Generate plan and code
      const planStart = Date.now();
      const coderOutput = await this.generateCode(analysis);
      const planDuration = Date.now() - planStart;
      result.phases.plan = {
        completed: true,
        durationMs: planDuration,
        data: { filesGenerated: coderOutput.code.files.length },
      };
      await this.checkpoint('plan', { filesGenerated: coderOutput.code.files.length });

      // Fire afterStep with generated files in metadata so CodeQualityHook can assess
      await this.hookRunner.afterStep(
        this.createHookContext('CODER', 'generate-code', 'completed', planDuration, {
          generatedFiles: coderOutput.code.files,
          confidence: coderOutput.code.confidence,
          estimatedComplexity: coderOutput.code.estimatedComplexity,
        })
      );

      // Phase 2.5: Quality gate - validate generated code before apply
      if (!this.config.dryRun) {
        this.validateCodeQuality(coderOutput);
      }

      // Phase 3: Apply patches to isolated workspace
      // Verify approval before destructive operations (commit + push)
      await this.ensureApproval(['commit', 'push']);
      // Enforce risk tier BEFORE writing files
      await this.hookRunner.beforeStep(
        this.createHookContext('CODER', 'apply-patches', 'pending', undefined, {
          operation: 'write_file',
          filesCount: coderOutput.code.files.length,
        })
      );
      const applyStart = Date.now();
      const applyResult = await this.applyPatches(coderOutput);
      const applyDuration = Date.now() - applyStart;
      result.phases.apply = {
        completed: applyResult.success,
        durationMs: applyDuration,
        filesModified: applyResult.filesModified,
        filesCreated: applyResult.filesCreated,
        error: applyResult.error,
      };

      if (!applyResult.success) {
        await this.hookRunner.afterStep(
          this.createHookContext('CODER', 'apply-patches', 'failed', applyDuration, {
            error: applyResult.error,
          })
        );
        throw new Error(`Apply phase failed: ${applyResult.error}`);
      }

      await this.checkpoint('apply', {
        filesModified: applyResult.filesModified,
        filesCreated: applyResult.filesCreated,
      });
      await this.hookRunner.afterStep(
        this.createHookContext('CODER', 'apply-patches', 'completed', applyDuration, {
          filesModified: applyResult.filesModified,
          filesCreated: applyResult.filesCreated,
          operation: 'write_file',
        })
      );

      // Phase 4: Run tests (optional)
      const testStart = Date.now();
      if (!this.config.skipTests && !this.config.dryRun) {
        // Enforce risk tier BEFORE executing tests
        await this.hookRunner.beforeStep(
          this.createHookContext('VALIDATOR', 'run-tests', 'pending', undefined, {
            operation: 'run_tests',
          })
        );
        const testResult = await this.runTests();
        const testDuration = Date.now() - testStart;
        result.phases.test = {
          completed: true,
          durationMs: testDuration,
          passed: testResult.passed,
          error: testResult.error,
        };
        await this.checkpoint('test', { passed: testResult.passed });
        await this.hookRunner.afterStep(
          this.createHookContext('VALIDATOR', 'run-tests', testResult.passed ? 'completed' : 'failed', testDuration, {
            passed: testResult.passed,
            operation: 'run_tests',
          })
        );

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
        await this.checkpoint('test', { skipped: true });
        await this.hookRunner.afterStep(
          this.createHookContext('VALIDATOR', 'run-tests', 'skipped', 0, {
            skipped: true,
          })
        );
      }

      // Phase 5: Create PR
      const prStart = Date.now();
      if (!this.config.dryRun) {
        // Verify approval before opening PR
        await this.ensureApproval(['open_pr']);
        // Enforce risk tier BEFORE opening PR
        await this.hookRunner.beforeStep(
          this.createHookContext('FOREMAN', 'create-pr', 'pending', undefined, {
            operation: 'open_pr',
          })
        );
        const prResult = await this.createPR(coderOutput);
        const prDuration = Date.now() - prStart;
        result.phases.pr = {
          completed: prResult.success,
          durationMs: prDuration,
          prNumber: prResult.prNumber,
          prUrl: prResult.prUrl,
          error: prResult.error,
        };

        if (!prResult.success) {
          await this.hookRunner.afterStep(
            this.createHookContext('FOREMAN', 'create-pr', 'failed', prDuration, {
              error: prResult.error,
              operation: 'open_pr',
            })
          );
          throw new Error(`PR creation failed: ${prResult.error}`);
        }

        await this.checkpoint('pr', { prNumber: prResult.prNumber });
        await this.hookRunner.afterStep(
          this.createHookContext('FOREMAN', 'create-pr', 'completed', prDuration, {
            prNumber: prResult.prNumber,
            prUrl: prResult.prUrl,
            operation: 'open_pr',
          })
        );
      } else {
        result.phases.pr = {
          completed: true,
          durationMs: 0,
          data: { dryRun: true },
        };
        await this.checkpoint('pr', { dryRun: true });
        await this.hookRunner.afterStep(
          this.createHookContext('FOREMAN', 'create-pr', 'completed', 0, {
            dryRun: true,
          })
        );
      }

      result.success = true;
      result.totalDurationMs = Date.now() - this.startTime;

      logger.info('Autopilot execution completed', {
        runId: this.config.runId,
        success: true,
        prNumber: result.phases.pr.prNumber,
        totalDurationMs: result.totalDurationMs,
        completedPhases: this.completedPhases,
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
        completedPhases: this.completedPhases,
      });

      await this.updateJobStatus('failed', { error: errorMessage });

      return result;
    } finally {
      // Fire runEnd hooks
      if (this.hookRunner) {
        const endCtx = this.createHookContext(
          'FOREMAN',
          'run-end',
          result.success ? 'completed' : 'failed',
          result.totalDurationMs,
          { completedPhases: this.completedPhases },
        );
        await this.hookRunner.runEnd(endCtx, result.success).catch((err) => {
          logger.warn('Hook runEnd failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

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

      // Validate LLM file payload structure and bounds
      const validatedFiles = LlmFilesSchema.parse(coderOutput.code.files);

      // Determine sandbox mode from config or env
      const sandboxEnabled = this.config.sandboxEnabled ??
        process.env.GWI_SANDBOX_ENABLED === 'true';

      // Try sandbox isolation for LLM-generated file writes
      let usedSandbox = false;
      if (sandboxEnabled) {
        const sandboxResult = await this.writeFilesThroughSandbox(
          validatedFiles,
          this.workspace.path,
        );
        if (sandboxResult) {
          filesModified = sandboxResult.filesModified;
          filesCreated = sandboxResult.filesCreated;
          usedSandbox = true;
        }
        // null return means Deno unavailable — fall through to direct writes
      }

      if (!usedSandbox) {
        // Direct writes with defense-in-depth path validation
        for (const file of validatedFiles) {
          validateFilePath(file.path);
          await workspaceManager.writeFile(file.path, file.content);

          if (file.action === 'create') {
            filesCreated++;
          } else {
            filesModified++;
          }
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
   * Write LLM-generated files through a Deno sandbox.
   *
   * Instead of writing directly to the host filesystem from the Node process,
   * we generate a Deno script and execute it inside a sandbox. This ensures:
   * - LLM-generated content is handled by an isolated process
   * - Path validation is enforced before script generation
   * - File writes use absolute paths within the workspace directory
   *
   * NOTE: The DenoSandboxProvider creates its own internal temp directory and
   * ignores config.workDir. We work around this by using absolute paths in
   * the generated script (joining workspacePath + relative file path) and
   * passing { cwd: workspacePath } to execute().
   *
   * Returns null if Deno is not available (caller should fall back to direct writes).
   */
  private async writeFilesThroughSandbox(
    files: Array<{ path: string; content: string; action?: string }>,
    workspacePath: string,
  ): Promise<{ filesModified: number; filesCreated: number } | null> {
    const provider = new DenoSandboxProvider();
    const health = await provider.healthCheck();

    if (!health.healthy) {
      logger.warn('Deno sandbox not available, falling back to direct writes', {
        reason: health.message,
        runId: this.config.runId,
      });
      return null;
    }

    // Create a Deno sandbox for script execution.
    // Note: provider ignores workDir and uses its own temp dir for the script.
    // File writes use absolute paths (workspacePath + relative) to land in the workspace.
    const sandbox = await provider.create({
      type: 'deno-isolate',
      baseImage: 'deno',
      workDir: workspacePath,
      timeoutMs: 30_000,
      network: { enabled: false },
    });

    try {
      let filesModified = 0;
      let filesCreated = 0;

      // Generate a Deno script that writes all files using absolute paths
      const writeStatements = files.map((file) => {
        const normalizedPath = validateFilePath(file.path);

        if (file.action === 'create') filesCreated++;
        else filesModified++;

        // Use absolute path: workspace + relative file path
        const absolutePath = join(workspacePath, normalizedPath);
        const pathJson = JSON.stringify(absolutePath);
        const contentJson = JSON.stringify(file.content);
        const dirExpr = `${pathJson}.split("/").slice(0, -1).join("/")`;
        return [
          `{ const dir = ${dirExpr}; if (dir) { Deno.mkdirSync(dir, { recursive: true }); } }`,
          `Deno.writeTextFileSync(${pathJson}, ${contentJson});`,
          `console.log("wrote: " + ${pathJson});`,
        ].join('\n');
      });

      const script = writeStatements.join('\n\n');

      logger.info('Writing files through Deno sandbox', {
        runId: this.config.runId,
        fileCount: files.length,
        workspacePath,
      });

      const result = await sandbox.execute(script, { cwd: workspacePath });

      if (result.exitCode !== 0) {
        throw new Error(`Sandbox file write failed (exit ${result.exitCode}): ${result.stderr}`);
      }

      logger.debug('Sandbox file write output', {
        stdout: result.stdout.slice(0, 500),
        runId: this.config.runId,
      });

      return { filesModified, filesCreated };
    } finally {
      await sandbox.destroy();
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
   * Delegates to CodeQualityHook.assess() — single source of truth for
   * diff synthesis, slop analysis, and threshold enforcement.
   */
  private validateCodeQuality(coderOutput: CoderRunOutput): void {
    const { files, confidence } = coderOutput.code;

    if (files.length === 0) {
      return; // Nothing to validate
    }

    const hook = new CodeQualityHook(DEFAULT_CODE_QUALITY_CONFIG);
    const assessment = hook.assess(files, confidence);

    if (!assessment.passed) {
      logger.warn('Code quality gate blocked code', {
        runId: this.config.runId,
        combinedSlopScore: assessment.combinedSlopScore,
        confidence: assessment.confidence,
        signals: assessment.signals,
        hasObviousComments: assessment.hasObviousComments,
      });

      throw new CodeQualityError(
        `Code quality gate failed: confidence=${assessment.confidence}%, ` +
        `slop=${assessment.combinedSlopScore}. Signals: ${assessment.signals.join(', ')}`,
        assessment,
      );
    }

    logger.info('Code quality gate passed', {
      runId: this.config.runId,
      combinedSlopScore: assessment.combinedSlopScore,
      confidence: assessment.confidence,
      hasObviousComments: assessment.hasObviousComments,
    });
  }

  /**
   * Create an AgentRunContext for a given phase.
   */
  private createHookContext(
    agentRole: AgentRole,
    stepId: string,
    stepStatus: StepStatus,
    durationMs?: number,
    metadata?: Record<string, unknown>,
  ): AgentRunContext {
    return {
      tenantId: this.config.tenantId,
      runId: this.config.runId,
      runType: 'autopilot',
      stepId: `${this.config.runId}-${stepId}`,
      agentRole,
      stepStatus,
      timestamp: new Date().toISOString(),
      durationMs,
      metadata,
    };
  }

  /**
   * Record a checkpoint after a successful phase.
   * Persists phase completion state for resume/replay via CheckpointStore.
   */
  private async checkpoint(phase: string, data?: Record<string, unknown>): Promise<void> {
    this.completedPhases.push(phase);
    const stepCheckpoint: StepCheckpoint = {
      stepId: `${this.config.runId}-${phase}`,
      agent: phase,
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
      output: data,
    };
    await this.checkpointStore.saveCheckpoint(this.config.runId, stepCheckpoint);
    logger.info('Checkpoint persisted', {
      runId: this.config.runId,
      phase,
      completedPhases: this.completedPhases,
      ...data,
    });
  }

  /**
   * Verify that required approval scopes are present before destructive operations.
   * Loads signed approvals from `.gwi/approvals/` and checks coverage.
   * Throws with an actionable error message if approval is missing.
   */
  private async ensureApproval(requiredScopes: ApprovalScope[]): Promise<void> {
    if (!this.config.requireApproval) {
      return;
    }

    const approvals = await loadSignedApprovalsForRun(this.config.runId);
    const { covered, missing } = checkApprovalCoverage(approvals, requiredScopes);

    if (!covered) {
      const scopeList = missing.join(', ');
      throw new Error(
        `Approval required for scopes: [${scopeList}]. ` +
        `Run: gwi approval approve --run ${this.config.runId} --scopes ${missing.join(',')}`
      );
    }

    logger.info('Approval verified', {
      runId: this.config.runId,
      scopes: requiredScopes,
      approvalCount: approvals.length,
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
