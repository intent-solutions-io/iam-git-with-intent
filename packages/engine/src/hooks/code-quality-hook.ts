/**
 * Code Quality Hook
 *
 * Validates agent-generated code quality before it proceeds to commit/apply.
 * Runs the same slop analyzers used for external PR detection on internal
 * agent output, catching low-quality code before it enters the repository.
 *
 * Activates only for CODER agent role steps.
 *
 * @module @gwi/engine/hooks
 */

import { getLogger, type CodeGenerationResult } from '@gwi/core';
import type { AgentHook, AgentRunContext } from './types.js';
import {
  analyzeQuality,
  analyzeLinguistic,
  hasObviousComments,
  type SlopAnalysisInput,
} from '@gwi/agents';

const logger = getLogger('code-quality-hook');

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for the code quality hook
 */
export interface CodeQualityConfig {
  /** Minimum confidence to allow commit (0-100). @default 50 */
  minConfidence: number;
  /** Block on quality signals or just warn. @default true */
  enforceBlocking: boolean;
  /** Run linguistic analysis on generated code. @default true */
  enableLinguisticCheck: boolean;
  /** Run quality analysis on generated code. @default true */
  enableQualityCheck: boolean;
  /** Max combined slop score before blocking (0-100). @default 60 */
  maxSlopScore: number;
  /** Callback when code is blocked */
  onBlocked?: (ctx: AgentRunContext, reason: string) => Promise<void>;
}

/**
 * Quality assessment result attached to context metadata
 */
export interface QualityAssessment {
  confidence: number;
  qualityScore: number;
  linguisticScore: number;
  combinedSlopScore: number;
  passed: boolean;
  signals: string[];
  hasObviousComments: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_CODE_QUALITY_CONFIG: CodeQualityConfig = {
  minConfidence: 50,
  enforceBlocking: true,
  enableLinguisticCheck: true,
  enableQualityCheck: true,
  maxSlopScore: 60,
};

// =============================================================================
// Error
// =============================================================================

/**
 * Error thrown when code quality check fails
 */
export class CodeQualityError extends Error {
  constructor(
    message: string,
    public readonly assessment: QualityAssessment,
  ) {
    super(message);
    this.name = 'CodeQualityError';
  }
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Code Quality Hook
 *
 * Validates generated code by running slop analyzers on the output.
 * Only activates after CODER agent steps where generated files are
 * available in the context metadata.
 */
export class CodeQualityHook implements AgentHook {
  readonly name = 'code-quality';
  private config: CodeQualityConfig;

  constructor(config?: Partial<CodeQualityConfig>) {
    this.config = { ...DEFAULT_CODE_QUALITY_CONFIG, ...config };
  }

  /**
   * Validate code quality after a CODER step completes
   */
  async onAfterStep(ctx: AgentRunContext): Promise<void> {
    // Only activate for CODER role
    if (ctx.agentRole !== 'CODER') {
      return;
    }

    // Extract generated files from metadata
    const generatedFiles = ctx.metadata?.generatedFiles as CodeGenerationResult['files'] | undefined;
    const confidence = ctx.metadata?.confidence as number | undefined;

    // Skip if no generated files in metadata (step may not have produced code)
    if (!generatedFiles || generatedFiles.length === 0) {
      logger.debug('No generated files in CODER step metadata, skipping quality check', {
        runId: ctx.runId,
        stepId: ctx.stepId,
      });
      return;
    }

    const assessment = this.assess(generatedFiles, confidence ?? 0);

    // Attach assessment to context metadata for audit trail
    if (ctx.metadata) {
      ctx.metadata.qualityAssessment = assessment;
    }

    if (assessment.passed) {
      logger.info('Code quality check passed', {
        runId: ctx.runId,
        combinedSlopScore: assessment.combinedSlopScore,
        confidence: assessment.confidence,
      });
      return;
    }

    // Quality check failed
    const reason =
      `Code quality check failed: slop score ${assessment.combinedSlopScore} ` +
      `(max ${this.config.maxSlopScore}), confidence ${assessment.confidence}% ` +
      `(min ${this.config.minConfidence}%). Signals: ${assessment.signals.join(', ')}`;

    if (this.config.enforceBlocking) {
      await this.config.onBlocked?.(ctx, reason);
      throw new CodeQualityError(reason, assessment);
    }

    // Warn-only mode
    logger.warn('Code quality check failed (non-blocking)', {
      runId: ctx.runId,
      assessment,
    });
  }

  /**
   * Check if this hook is enabled
   */
  async isEnabled(): Promise<boolean> {
    return process.env.GWI_CODE_QUALITY_HOOK_ENABLED !== 'false';
  }

  /**
   * Assess code quality using slop analyzers
   */
  assess(
    files: CodeGenerationResult['files'],
    confidence: number,
  ): QualityAssessment {
    // Synthesize a pseudo-diff and file metadata from generated files
    const { diff, slopFiles } = this.synthesizeAnalysisInput(files);

    const analysisInput: SlopAnalysisInput = {
      prUrl: 'internal://agent/coder',
      diff,
      prTitle: 'Agent-generated code',
      prBody: '',
      contributor: 'gwi-coder-agent',
      files: slopFiles,
    };

    let qualityScore = 0;
    let linguisticScore = 0;
    const signals: string[] = [];

    // Quality analysis
    if (this.config.enableQualityCheck) {
      const qualityResult = analyzeQuality(analysisInput);
      qualityScore = qualityResult.totalWeight;
      for (const signal of qualityResult.signals) {
        signals.push(`quality:${signal.signal}`);
      }
    }

    // Linguistic analysis
    if (this.config.enableLinguisticCheck) {
      const linguisticResult = analyzeLinguistic(analysisInput);
      linguisticScore = linguisticResult.totalWeight;
      for (const signal of linguisticResult.signals) {
        signals.push(`linguistic:${signal.signal}`);
      }
    }

    // Check for obvious comments in generated code
    const allContent = files.map((f: CodeGenerationResult['files'][0]) => f.content).join('\n');
    const obviousComments = hasObviousComments(allContent);
    if (obviousComments) {
      signals.push('quality:obvious_comments');
    }

    const combinedSlopScore = Math.min(100, qualityScore + linguisticScore);

    const passed =
      confidence >= this.config.minConfidence &&
      combinedSlopScore <= this.config.maxSlopScore;

    return {
      confidence,
      qualityScore,
      linguisticScore,
      combinedSlopScore,
      passed,
      signals,
      hasObviousComments: obviousComments,
    };
  }

  /**
   * Synthesize a diff and file metadata from generated files
   * so the existing slop analyzers can process them.
   */
  private synthesizeAnalysisInput(
    files: CodeGenerationResult['files'],
  ): { diff: string; slopFiles: SlopAnalysisInput['files'] } {
    const diffLines: string[] = [];
    const slopFiles: SlopAnalysisInput['files'] = [];

    for (const file of files) {
      const contentLines = file.content.split('\n');

      // Build unified diff format
      diffLines.push(`--- /dev/null`);
      diffLines.push(`+++ b/${file.path}`);
      diffLines.push(`@@ -0,0 +1,${contentLines.length} @@`);
      for (const line of contentLines) {
        diffLines.push(`+${line}`);
      }

      slopFiles.push({
        path: file.path,
        additions: contentLines.length,
        deletions: 0,
      });
    }

    return { diff: diffLines.join('\n'), slopFiles };
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a code quality hook
 */
export function createCodeQualityHook(
  config?: Partial<CodeQualityConfig>,
): CodeQualityHook {
  return new CodeQualityHook(config);
}
