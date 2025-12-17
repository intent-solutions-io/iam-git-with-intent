/**
 * Schema Validation Tests
 *
 * Tests for Zod schema validation of agent step outputs.
 */

import { describe, it, expect } from 'vitest';
import {
  // Triage
  TriageResult,
  validateTriageResult,
  parseTriageResult,

  // Plan
  PlanResult,
  validatePlanResult,
  parsePlanResult,

  // Resolve
  ResolveResult,
  validateResolveResult,
  parseResolveResult,

  // Review
  ReviewResult,
  validateReviewResult,
  parseReviewResult,

  // Common
  ComplexityScore,
  ConfidenceScore,
  RiskLevel,
} from '../index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const validTriageResult = {
  version: 1,
  timestamp: '2025-12-16T12:00:00.000Z',
  features: {
    numFiles: 3,
    numHunks: 5,
    totalConflictLines: 100,
    totalAdditions: 50,
    totalDeletions: 30,
    fileTypes: ['ts', 'json'],
    hasSecurityFiles: false,
    hasInfraFiles: false,
    hasConfigFiles: true,
    hasTestFiles: true,
    hasConflictMarkers: true,
    maxHunksPerFile: 3,
    avgHunksPerFile: 1.67,
  },
  baselineScore: 5,
  llmAdjustment: 1,
  finalScore: 6,
  baselineReasons: ['medium_change', 'config_change'],
  llmReasons: ['needs_domain_knowledge'],
  explanation: 'Moderate complexity due to config changes',
  perFile: [
    {
      path: 'src/config.ts',
      hunks: 2,
      additions: 20,
      deletions: 10,
      strategy: 'merge-both',
      fileRisk: 'config',
      scoreContribution: 2,
    },
  ],
  routeDecision: 'agent-resolve',
  riskLevel: 'medium',
  confidence: 85,
  estimatedTimeSec: 120,
};

const validPlanResult = {
  version: 1,
  timestamp: '2025-12-16T12:00:00.000Z',
  summary: 'Plan to resolve 3 file conflicts',
  complexity: 5,
  overallRisk: 'medium',
  confidence: 80,
  steps: [
    {
      order: 1,
      name: 'Resolve config conflicts',
      description: 'Merge configuration changes',
      files: ['src/config.ts'],
      actions: [
        {
          path: 'src/config.ts',
          action: 'resolve',
          strategy: 'merge-both',
          description: 'Merge both config additions',
          risk: 'low',
          confidence: 90,
        },
      ],
      canParallelize: false,
      estimatedDurationSec: 30,
    },
  ],
  totalFiles: 1,
  parallelizable: false,
  fileActions: [
    {
      path: 'src/config.ts',
      action: 'resolve',
      strategy: 'merge-both',
      description: 'Merge both config additions',
      risk: 'low',
      confidence: 90,
    },
  ],
  risks: [
    {
      id: 'risk-1',
      severity: 'low',
      description: 'Config changes may affect runtime behavior',
      affectedFiles: ['src/config.ts'],
      mitigation: 'Test configuration after merge',
      requiresReview: false,
    },
  ],
  requiresHumanReview: false,
  reviewReasons: [],
  estimatedTotalDurationSec: 60,
};

const validResolveResult = {
  version: 1,
  timestamp: '2025-12-16T12:00:00.000Z',
  patchFile: 'patch.diff',
  patchHash: 'sha256:abc123def456',
  summary: 'Resolved 3 conflicts in 2 files',
  overallConfidence: 88,
  complexity: 5,
  files: [
    {
      path: 'src/config.ts',
      status: 'resolved',
      strategy: 'merge-both',
      confidence: 90,
      linesAdded: 15,
      linesRemoved: 5,
      conflictsResolved: 2,
      explanation: 'Merged both configuration additions',
      requiresReview: false,
    },
  ],
  totalFiles: 1,
  filesResolved: 1,
  filesPartial: 0,
  filesFailed: 0,
  filesSkipped: 0,
  totalLinesAdded: 15,
  totalLinesRemoved: 5,
  totalConflictsResolved: 2,
  allResolved: true,
  requiresReview: false,
  reviewReasons: [],
};

const validReviewResult = {
  version: 1,
  timestamp: '2025-12-16T12:00:00.000Z',
  approved: true,
  confidence: 92,
  summary: 'All checks passed, code is ready to merge',
  checksPerformed: [
    {
      name: 'syntax_validation',
      passed: true,
      details: 'No syntax errors found',
      duration_ms: 50,
    },
    {
      name: 'security_scan',
      passed: true,
      details: 'No security issues found',
      duration_ms: 100,
    },
  ],
  allChecksPassed: true,
  findings: [],
  totalFindings: 0,
  blockerCount: 0,
  errorCount: 0,
  warningCount: 0,
  securityIssues: [],
  hasSecurityIssues: false,
  criticalSecurityIssues: 0,
  fileReviews: [
    {
      path: 'src/config.ts',
      reviewed: true,
      passed: true,
      findings: [],
    },
  ],
  filesReviewed: 1,
  filesPassed: 1,
  filesFailed: 0,
  syntaxValid: true,
  syntaxErrors: [],
  codeLossDetected: false,
  requiresHuman: false,
  humanReviewReasons: [],
  recommendedNextState: 'awaiting_approval',
  suggestions: ['Consider adding unit tests for new configuration'],
};

// =============================================================================
// Common Schema Tests
// =============================================================================

describe('Common Schemas', () => {
  describe('ComplexityScore', () => {
    it('should accept valid scores 1-10', () => {
      for (let i = 1; i <= 10; i++) {
        expect(ComplexityScore.safeParse(i).success).toBe(true);
      }
    });

    it('should reject scores outside 1-10', () => {
      expect(ComplexityScore.safeParse(0).success).toBe(false);
      expect(ComplexityScore.safeParse(11).success).toBe(false);
      expect(ComplexityScore.safeParse(-1).success).toBe(false);
    });

    it('should reject non-integers', () => {
      expect(ComplexityScore.safeParse(5.5).success).toBe(false);
      expect(ComplexityScore.safeParse('5').success).toBe(false);
    });
  });

  describe('ConfidenceScore', () => {
    it('should accept valid scores 0-100', () => {
      expect(ConfidenceScore.safeParse(0).success).toBe(true);
      expect(ConfidenceScore.safeParse(50).success).toBe(true);
      expect(ConfidenceScore.safeParse(100).success).toBe(true);
    });

    it('should reject scores outside 0-100', () => {
      expect(ConfidenceScore.safeParse(-1).success).toBe(false);
      expect(ConfidenceScore.safeParse(101).success).toBe(false);
    });
  });

  describe('RiskLevel', () => {
    it('should accept valid risk levels', () => {
      expect(RiskLevel.safeParse('low').success).toBe(true);
      expect(RiskLevel.safeParse('medium').success).toBe(true);
      expect(RiskLevel.safeParse('high').success).toBe(true);
      expect(RiskLevel.safeParse('critical').success).toBe(true);
    });

    it('should reject invalid risk levels', () => {
      expect(RiskLevel.safeParse('very_high').success).toBe(false);
      expect(RiskLevel.safeParse('').success).toBe(false);
    });
  });
});

// =============================================================================
// Triage Schema Tests
// =============================================================================

describe('TriageResult Schema', () => {
  it('should validate a valid triage result', () => {
    const result = validateTriageResult(validTriageResult);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should parse a valid triage result', () => {
    const parsed = parseTriageResult(validTriageResult);
    expect(parsed.baselineScore).toBe(5);
    expect(parsed.finalScore).toBe(6);
    expect(parsed.routeDecision).toBe('agent-resolve');
  });

  it('should reject missing required fields', () => {
    const invalid = { ...validTriageResult };
    delete (invalid as Record<string, unknown>).features;

    const result = validateTriageResult(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should reject invalid version', () => {
    const invalid = { ...validTriageResult, version: 2 };
    const result = validateTriageResult(invalid);
    expect(result.valid).toBe(false);
  });

  it('should reject llmAdjustment outside -2 to +2', () => {
    const invalid = { ...validTriageResult, llmAdjustment: 5 };
    const result = validateTriageResult(invalid);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid routeDecision', () => {
    const invalid = { ...validTriageResult, routeDecision: 'auto-fix' };
    const result = validateTriageResult(invalid);
    expect(result.valid).toBe(false);
  });

  it('should throw on parse of invalid data', () => {
    expect(() => parseTriageResult({ version: 'invalid' })).toThrow();
  });
});

// =============================================================================
// Plan Schema Tests
// =============================================================================

describe('PlanResult Schema', () => {
  it('should validate a valid plan result', () => {
    const result = validatePlanResult(validPlanResult);
    expect(result.valid).toBe(true);
  });

  it('should parse a valid plan result', () => {
    const parsed = parsePlanResult(validPlanResult);
    expect(parsed.complexity).toBe(5);
    expect(parsed.steps.length).toBe(1);
    expect(parsed.steps[0].order).toBe(1);
  });

  it('should reject missing required fields', () => {
    const invalid = { ...validPlanResult };
    delete (invalid as Record<string, unknown>).steps;

    const result = validatePlanResult(invalid);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid action type', () => {
    const invalid = {
      ...validPlanResult,
      fileActions: [{
        ...validPlanResult.fileActions[0],
        action: 'invalid-action',
      }],
    };
    const result = validatePlanResult(invalid);
    expect(result.valid).toBe(false);
  });

  it('should accept empty arrays', () => {
    const minimal = {
      ...validPlanResult,
      steps: [],
      fileActions: [],
      risks: [],
      reviewReasons: [],
    };
    const result = validatePlanResult(minimal);
    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// Resolve Schema Tests
// =============================================================================

describe('ResolveResult Schema', () => {
  it('should validate a valid resolve result', () => {
    const result = validateResolveResult(validResolveResult);
    expect(result.valid).toBe(true);
  });

  it('should parse a valid resolve result', () => {
    const parsed = parseResolveResult(validResolveResult);
    expect(parsed.allResolved).toBe(true);
    expect(parsed.totalConflictsResolved).toBe(2);
  });

  it('should require patchFile to be patch.diff', () => {
    const invalid = { ...validResolveResult, patchFile: 'other.diff' };
    const result = validateResolveResult(invalid);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid resolution status', () => {
    const invalid = {
      ...validResolveResult,
      files: [{
        ...validResolveResult.files[0],
        status: 'maybe',
      }],
    };
    const result = validateResolveResult(invalid);
    expect(result.valid).toBe(false);
  });

  it('should reject negative line counts', () => {
    const invalid = {
      ...validResolveResult,
      totalLinesAdded: -5,
    };
    const result = validateResolveResult(invalid);
    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// Review Schema Tests
// =============================================================================

describe('ReviewResult Schema', () => {
  it('should validate a valid review result', () => {
    const result = validateReviewResult(validReviewResult);
    expect(result.valid).toBe(true);
  });

  it('should parse a valid review result', () => {
    const parsed = parseReviewResult(validReviewResult);
    expect(parsed.approved).toBe(true);
    expect(parsed.allChecksPassed).toBe(true);
  });

  it('should reject invalid recommendedNextState', () => {
    const invalid = { ...validReviewResult, recommendedNextState: 'unknown_state' };
    const result = validateReviewResult(invalid);
    expect(result.valid).toBe(false);
  });

  it('should accept valid findings', () => {
    const withFindings = {
      ...validReviewResult,
      approved: false,
      findings: [
        {
          id: 'finding-1',
          type: 'security',
          severity: 'error',
          message: 'Hardcoded secret detected',
          autoFixable: false,
        },
      ],
      totalFindings: 1,
      errorCount: 1,
    };
    const result = validateReviewResult(withFindings);
    expect(result.valid).toBe(true);
  });

  it('should accept security issues', () => {
    const withSecurityIssues = {
      ...validReviewResult,
      approved: false,
      hasSecurityIssues: true,
      securityIssues: [
        {
          severity: 'high',
          type: 'hardcoded_secret',
          file: 'src/config.ts',
          line: 42,
          description: 'API key detected in source code',
          recommendation: 'Use environment variables instead',
        },
      ],
      criticalSecurityIssues: 0,
    };
    const result = validateReviewResult(withSecurityIssues);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid severity', () => {
    const invalid = {
      ...validReviewResult,
      findings: [
        {
          id: 'f1',
          type: 'syntax',
          severity: 'catastrophic', // Invalid
          message: 'test',
          autoFixable: false,
        },
      ],
    };
    const result = validateReviewResult(invalid);
    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty strings in arrays', () => {
    const withEmptyStrings = {
      ...validReviewResult,
      syntaxErrors: [''],
      suggestions: [''],
    };
    const result = validateReviewResult(withEmptyStrings);
    expect(result.valid).toBe(true);
  });

  it('should handle maximum complexity score', () => {
    const maxComplexity = {
      ...validTriageResult,
      baselineScore: 10,
      llmAdjustment: 0,
      finalScore: 10,
    };
    const result = validateTriageResult(maxComplexity);
    expect(result.valid).toBe(true);
  });

  it('should handle minimum complexity score', () => {
    const minComplexity = {
      ...validTriageResult,
      baselineScore: 1,
      llmAdjustment: 0,
      finalScore: 1,
    };
    const result = validateTriageResult(minComplexity);
    expect(result.valid).toBe(true);
  });

  it('should handle zero counts', () => {
    const zeroCounts = {
      ...validResolveResult,
      totalFiles: 0,
      filesResolved: 0,
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
      totalConflictsResolved: 0,
      files: [],
    };
    const result = validateResolveResult(zeroCounts);
    expect(result.valid).toBe(true);
  });
});
