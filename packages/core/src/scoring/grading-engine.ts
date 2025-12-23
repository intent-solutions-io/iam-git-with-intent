/**
 * Grading Calculation Engine for Auto-Fix Quality Assessment
 *
 * Implements rules-based grading using weighted criteria across 5 dimensions:
 * 1. Code Quality (30%) - lint, typecheck, complexity
 * 2. Test Coverage (25%) - tests run, pass rate, new coverage
 * 3. PR Outcome (25%) - merged, time to merge, edits required
 * 4. Cost Efficiency (10%) - tokens, API costs, duration
 * 5. Documentation (10%) - comments, README updates
 */

import { KeywordMatcher } from './keyword-matcher.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface AutoFixRun {
  id: string;
  prUrl: string;
  status: 'success' | 'failure' | 'partial';

  // Code quality metrics
  lintPassed: boolean;
  typecheckPassed: boolean;
  complexityDelta: number; // Change in cyclomatic complexity
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;

  // Test metrics
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  coverageBefore: number; // Percentage
  coverageAfter: number; // Percentage

  // PR outcome
  merged: boolean;
  timeToMerge?: number; // Hours
  humanEditsRequired: boolean;
  commentsReceived: number;

  // Cost metrics
  tokensUsed: number;
  apiCost: number; // USD
  durationMs: number;

  // Code changes
  commitMessage: string;
  diffContent: string;

  // Documentation
  readmeUpdated: boolean;
  commentsAdded: number;
  docsChanged: boolean;
}

export interface CriterionScore {
  id: string;
  name: string;
  score: number; // 0-100
  maxScore: number;
  weight: number; // 0-1
  weightedScore: number;
  explanation: string;
  subcriteria: SubcriterionScore[];
}

export interface SubcriterionScore {
  id: string;
  name: string;
  score: number;
  maxScore: number;
  passed: boolean;
  explanation: string;
}

export interface GradeResult {
  overallScore: number; // 0-100
  letterGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  criteria: CriterionScore[];
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  metadata: {
    gradedAt: string;
    version: string;
    runId: string;
  };
}

export interface GradingRubric {
  version: string;
  gradeScale: {
    A: [number, number];
    B: [number, number];
    C: [number, number];
    D: [number, number];
    F: [number, number];
  };
}

// ============================================================================
// Default Grading Rubric
// ============================================================================

const DEFAULT_RUBRIC: GradingRubric = {
  version: '1.0.0',
  gradeScale: {
    A: [90, 100],
    B: [80, 89],
    C: [70, 79],
    D: [60, 69],
    F: [0, 59]
  }
};

// ============================================================================
// Criterion Scorers
// ============================================================================

/**
 * Score Code Quality (30% weight)
 */
function scoreCodeQuality(run: AutoFixRun): CriterionScore {
  const subcriteria: SubcriterionScore[] = [];

  // Lint passed (40 points)
  subcriteria.push({
    id: 'lint_passed',
    name: 'Linting Passed',
    score: run.lintPassed ? 40 : 0,
    maxScore: 40,
    passed: run.lintPassed,
    explanation: run.lintPassed ? 'No linting errors' : 'Linting errors detected'
  });

  // Typecheck passed (40 points)
  subcriteria.push({
    id: 'typecheck_passed',
    name: 'Type Check Passed',
    score: run.typecheckPassed ? 40 : 0,
    maxScore: 40,
    passed: run.typecheckPassed,
    explanation: run.typecheckPassed ? 'No type errors' : 'Type errors detected'
  });

  // Complexity delta (20 points - penalize increased complexity)
  const complexityScore = Math.max(0, 20 - Math.abs(run.complexityDelta));
  subcriteria.push({
    id: 'complexity_delta',
    name: 'Complexity Change',
    score: complexityScore,
    maxScore: 20,
    passed: run.complexityDelta <= 0,
    explanation: run.complexityDelta <= 0
      ? `Reduced complexity by ${Math.abs(run.complexityDelta)}`
      : `Increased complexity by ${run.complexityDelta}`
  });

  const totalScore = subcriteria.reduce((sum, s) => sum + s.score, 0);
  const maxScore = 100;

  return {
    id: 'code_quality',
    name: 'Code Quality',
    score: totalScore,
    maxScore,
    weight: 0.30,
    weightedScore: (totalScore / maxScore) * 100 * 0.30,
    explanation: `Code quality: ${run.lintPassed && run.typecheckPassed ? 'excellent' : 'needs improvement'}`,
    subcriteria
  };
}

/**
 * Score Test Coverage (25% weight)
 */
function scoreTestCoverage(run: AutoFixRun): CriterionScore {
  const subcriteria: SubcriterionScore[] = [];

  // Tests run (30 points)
  const testsRunScore = run.testsRun > 0 ? 30 : 0;
  subcriteria.push({
    id: 'tests_run',
    name: 'Tests Run',
    score: testsRunScore,
    maxScore: 30,
    passed: run.testsRun > 0,
    explanation: `${run.testsRun} tests executed`
  });

  // Tests passed (40 points)
  const passRate = run.testsRun > 0 ? run.testsPassed / run.testsRun : 0;
  const testsPassedScore = passRate * 40;
  subcriteria.push({
    id: 'tests_passed',
    name: 'Tests Passed',
    score: testsPassedScore,
    maxScore: 40,
    passed: passRate >= 0.9,
    explanation: `${run.testsPassed}/${run.testsRun} tests passed (${(passRate * 100).toFixed(1)}%)`
  });

  // Coverage improvement (30 points)
  const coverageDelta = run.coverageAfter - run.coverageBefore;
  const coverageScore = Math.max(0, Math.min(30, coverageDelta * 3));
  subcriteria.push({
    id: 'coverage_improvement',
    name: 'Coverage Improvement',
    score: coverageScore,
    maxScore: 30,
    passed: coverageDelta >= 0,
    explanation: coverageDelta > 0
      ? `Coverage increased by ${coverageDelta.toFixed(1)}%`
      : coverageDelta < 0
        ? `Coverage decreased by ${Math.abs(coverageDelta).toFixed(1)}%`
        : 'No change in coverage'
  });

  const totalScore = subcriteria.reduce((sum, s) => sum + s.score, 0);
  const maxScore = 100;

  return {
    id: 'test_coverage',
    name: 'Test Coverage',
    score: totalScore,
    maxScore,
    weight: 0.25,
    weightedScore: (totalScore / maxScore) * 100 * 0.25,
    explanation: `Test coverage: ${passRate >= 0.9 ? 'comprehensive' : 'needs improvement'}`,
    subcriteria
  };
}

/**
 * Score PR Outcome (25% weight)
 */
function scorePROutcome(run: AutoFixRun): CriterionScore {
  const subcriteria: SubcriterionScore[] = [];

  // PR merged (50 points)
  subcriteria.push({
    id: 'pr_merged',
    name: 'PR Merged',
    score: run.merged ? 50 : 0,
    maxScore: 50,
    passed: run.merged,
    explanation: run.merged ? 'PR successfully merged' : 'PR not merged'
  });

  // Time to merge (25 points - faster is better)
  let timeScore = 0;
  if (run.merged && run.timeToMerge) {
    // Score: 25pts for <1hr, 20pts for <4hrs, 15pts for <24hrs, 10pts for <48hrs, 5pts for >48hrs
    if (run.timeToMerge < 1) timeScore = 25;
    else if (run.timeToMerge < 4) timeScore = 20;
    else if (run.timeToMerge < 24) timeScore = 15;
    else if (run.timeToMerge < 48) timeScore = 10;
    else timeScore = 5;
  }
  subcriteria.push({
    id: 'time_to_merge',
    name: 'Time to Merge',
    score: timeScore,
    maxScore: 25,
    passed: run.timeToMerge !== undefined && run.timeToMerge < 24,
    explanation: run.timeToMerge
      ? `Merged in ${run.timeToMerge.toFixed(1)} hours`
      : 'Not yet merged'
  });

  // Human edits required (25 points - none is better)
  const editsScore = run.humanEditsRequired ? 0 : 25;
  subcriteria.push({
    id: 'human_edits',
    name: 'Human Edits Required',
    score: editsScore,
    maxScore: 25,
    passed: !run.humanEditsRequired,
    explanation: run.humanEditsRequired
      ? 'Human edits were required'
      : 'No human edits needed'
  });

  const totalScore = subcriteria.reduce((sum, s) => sum + s.score, 0);
  const maxScore = 100;

  return {
    id: 'pr_outcome',
    name: 'PR Outcome',
    score: totalScore,
    maxScore,
    weight: 0.25,
    weightedScore: (totalScore / maxScore) * 100 * 0.25,
    explanation: run.merged ? 'Successfully merged' : 'Not merged or needs revision',
    subcriteria
  };
}

/**
 * Score Cost Efficiency (10% weight)
 */
function scoreCostEfficiency(run: AutoFixRun): CriterionScore {
  const subcriteria: SubcriterionScore[] = [];

  // API cost (50 points - cheaper is better, $0.10 threshold)
  const costThreshold = 0.10;
  const costScore = Math.max(0, 50 * (1 - run.apiCost / costThreshold));
  subcriteria.push({
    id: 'api_cost',
    name: 'API Cost',
    score: costScore,
    maxScore: 50,
    passed: run.apiCost <= costThreshold,
    explanation: `API cost: $${run.apiCost.toFixed(4)}`
  });

  // Duration (50 points - faster is better, 60s threshold)
  const durationThreshold = 60000; // 60 seconds
  const durationScore = Math.max(0, 50 * (1 - run.durationMs / durationThreshold));
  subcriteria.push({
    id: 'duration',
    name: 'Execution Duration',
    score: durationScore,
    maxScore: 50,
    passed: run.durationMs <= durationThreshold,
    explanation: `Completed in ${(run.durationMs / 1000).toFixed(1)}s`
  });

  const totalScore = subcriteria.reduce((sum, s) => sum + s.score, 0);
  const maxScore = 100;

  return {
    id: 'cost_efficiency',
    name: 'Cost Efficiency',
    score: totalScore,
    maxScore,
    weight: 0.10,
    weightedScore: (totalScore / maxScore) * 100 * 0.10,
    explanation: `Cost: $${run.apiCost.toFixed(4)}, Duration: ${(run.durationMs / 1000).toFixed(1)}s`,
    subcriteria
  };
}

/**
 * Score Documentation (10% weight)
 */
function scoreDocumentation(run: AutoFixRun): CriterionScore {
  const subcriteria: SubcriterionScore[] = [];

  // README updated (40 points)
  subcriteria.push({
    id: 'readme_updated',
    name: 'README Updated',
    score: run.readmeUpdated ? 40 : 0,
    maxScore: 40,
    passed: run.readmeUpdated,
    explanation: run.readmeUpdated ? 'README was updated' : 'README not updated'
  });

  // Comments added (30 points)
  const commentsScore = Math.min(30, run.commentsAdded * 3);
  subcriteria.push({
    id: 'comments_added',
    name: 'Comments Added',
    score: commentsScore,
    maxScore: 30,
    passed: run.commentsAdded >= 5,
    explanation: `${run.commentsAdded} comments added`
  });

  // Docs changed (30 points)
  subcriteria.push({
    id: 'docs_changed',
    name: 'Documentation Changed',
    score: run.docsChanged ? 30 : 0,
    maxScore: 30,
    passed: run.docsChanged,
    explanation: run.docsChanged ? 'Documentation updated' : 'No documentation changes'
  });

  const totalScore = subcriteria.reduce((sum, s) => sum + s.score, 0);
  const maxScore = 100;

  return {
    id: 'documentation',
    name: 'Documentation',
    score: totalScore,
    maxScore,
    weight: 0.10,
    weightedScore: (totalScore / maxScore) * 100 * 0.10,
    explanation: run.readmeUpdated || run.docsChanged
      ? 'Good documentation'
      : 'Documentation needs improvement',
    subcriteria
  };
}

// ============================================================================
// Grading Engine
// ============================================================================

export class GradingEngine {
  private rubric: GradingRubric;
  private keywordMatcher?: KeywordMatcher;

  constructor(rubric?: GradingRubric, keywordMatcherPath?: string) {
    this.rubric = rubric || DEFAULT_RUBRIC;

    // Initialize keyword matcher if available
    try {
      this.keywordMatcher = new KeywordMatcher(keywordMatcherPath);
    } catch (error) {
      // Keyword matching is optional
      console.warn('Keyword matcher not available:', error);
    }
  }

  /**
   * Calculate grade for an auto-fix run
   */
  public grade(run: AutoFixRun): GradeResult {
    // Score each criterion
    const criteria: CriterionScore[] = [
      scoreCodeQuality(run),
      scoreTestCoverage(run),
      scorePROutcome(run),
      scoreCostEfficiency(run),
      scoreDocumentation(run)
    ];

    // Apply keyword matching bonus/penalty
    if (this.keywordMatcher) {
      const combinedText = `${run.commitMessage}\n${run.diffContent}`;
      const matches = this.keywordMatcher.match(combinedText);
      const keywordScore = this.keywordMatcher.calculateScore(matches);

      // Add keyword score as a bonus/penalty (capped at ±10 points)
      const keywordBonus = Math.max(-10, Math.min(10, keywordScore / 2));
      if (keywordBonus !== 0) {
        criteria.push({
          id: 'keyword_analysis',
          name: 'Keyword Analysis',
          score: 50 + keywordBonus * 5,
          maxScore: 100,
          weight: 0.05, // Small weight
          weightedScore: (50 + keywordBonus * 5) * 0.05,
          explanation: keywordBonus > 0
            ? `Positive quality signals detected (+${keywordBonus.toFixed(1)})`
            : `Quality concerns detected (${keywordBonus.toFixed(1)})`,
          subcriteria: []
        });

        // Rebalance weights
        const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
        criteria.forEach(c => c.weight = c.weight / totalWeight);
      }
    }

    // Calculate overall score
    const overallScore = criteria.reduce((sum, c) => sum + c.weightedScore, 0);

    // Convert to letter grade
    const letterGrade = this.scoreToLetterGrade(overallScore);

    // Generate explanations
    const { strengths, weaknesses, recommendations } = this.generateExplanations(criteria, run);

    return {
      overallScore,
      letterGrade,
      criteria,
      summary: this.generateSummary(letterGrade, overallScore, run),
      strengths,
      weaknesses,
      recommendations,
      metadata: {
        gradedAt: new Date().toISOString(),
        version: this.rubric.version,
        runId: run.id
      }
    };
  }

  private scoreToLetterGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= this.rubric.gradeScale.A[0]) return 'A';
    if (score >= this.rubric.gradeScale.B[0]) return 'B';
    if (score >= this.rubric.gradeScale.C[0]) return 'C';
    if (score >= this.rubric.gradeScale.D[0]) return 'D';
    return 'F';
  }

  private generateSummary(grade: string, score: number, run: AutoFixRun): string {
    const quality = score >= 90 ? 'excellent' : score >= 70 ? 'good' : score >= 60 ? 'acceptable' : 'needs improvement';
    return `Grade ${grade} (${score.toFixed(1)}/100): ${quality} auto-fix for ${run.prUrl}`;
  }

  private generateExplanations(criteria: CriterionScore[], run: AutoFixRun) {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    for (const criterion of criteria) {
      const percentage = (criterion.score / criterion.maxScore) * 100;

      if (percentage >= 80) {
        strengths.push(`${criterion.name}: ${criterion.explanation}`);
      } else if (percentage < 50) {
        weaknesses.push(`${criterion.name}: ${criterion.explanation}`);

        // Generate recommendations
        if (criterion.id === 'code_quality' && !run.lintPassed) {
          recommendations.push('Fix linting errors before submitting');
        }
        if (criterion.id === 'test_coverage' && run.testsRun === 0) {
          recommendations.push('Add test coverage for new code');
        }
        if (criterion.id === 'documentation' && !run.readmeUpdated) {
          recommendations.push('Update documentation to reflect changes');
        }
      }
    }

    return { strengths, weaknesses, recommendations };
  }
}
