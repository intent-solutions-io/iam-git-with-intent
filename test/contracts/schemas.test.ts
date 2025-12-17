/**
 * Contract Tests - Schema Validation
 *
 * Validates that all tool schemas are valid and properly structured.
 * Uses Zod for runtime validation (AJV alternative for Zod-based schemas).
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Import all schemas from core
import {
  TriageResultSchema,
  PlanResultSchema,
  ResolveResultSchema,
  ReviewResultSchema,
  ComplexityScoreSchema,
  RiskLevelSchema,
  RouteDecisionSchema,
} from '../../packages/core/src/run-bundle/schemas/index.js';

// =============================================================================
// Schema Structure Tests
// =============================================================================

describe('Schema Structure', () => {
  describe('TriageResultSchema', () => {
    it('is a valid Zod schema', () => {
      expect(TriageResultSchema).toBeDefined();
      expect(TriageResultSchema._def).toBeDefined();
    });

    it('has required version field', () => {
      const result = TriageResultSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues.map((i) => i.path.join('.'));
        expect(issues).toContain('version');
      }
    });

    it('accepts valid triage result', () => {
      const validResult = {
        version: 1,
        timestamp: new Date().toISOString(),
        features: {
          numFiles: 3,
          numHunks: 5,
          totalConflictLines: 100,
          totalAdditions: 50,
          totalDeletions: 30,
          fileTypes: ['ts', 'tsx'],
          hasSecurityFiles: false,
          hasInfraFiles: false,
          hasConfigFiles: true,
          hasTestFiles: false,
          hasConflictMarkers: true,
          maxHunksPerFile: 3,
          avgHunksPerFile: 1.67,
        },
        baselineScore: 4,
        llmAdjustment: 1,
        finalScore: 5,
        baselineReasons: ['medium_change', 'config_change'],
        llmReasons: ['ambiguous_intent'],
        explanation: 'Medium complexity change with config files',
        routeDecision: 'agent',
      };

      const result = TriageResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });

    it('rejects invalid version', () => {
      const invalidResult = {
        version: 2, // Invalid - must be 1
        timestamp: new Date().toISOString(),
        features: {
          numFiles: 1,
          numHunks: 1,
          totalConflictLines: 10,
          totalAdditions: 5,
          totalDeletions: 3,
          fileTypes: ['ts'],
          hasSecurityFiles: false,
          hasInfraFiles: false,
          hasConfigFiles: false,
          hasTestFiles: false,
          hasConflictMarkers: false,
          maxHunksPerFile: 1,
          avgHunksPerFile: 1,
        },
        baselineScore: 2,
        llmAdjustment: 0,
        finalScore: 2,
        baselineReasons: ['small_change'],
        llmReasons: [],
        explanation: 'Simple change',
        routeDecision: 'auto',
      };

      const result = TriageResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });
  });

  describe('PlanResultSchema', () => {
    it('is a valid Zod schema', () => {
      expect(PlanResultSchema).toBeDefined();
      expect(PlanResultSchema._def).toBeDefined();
    });

    it('accepts valid plan result', () => {
      const validResult = {
        version: 1,
        timestamp: new Date().toISOString(),
        summary: 'Plan to resolve conflicts in auth module',
        steps: [
          {
            order: 1,
            name: 'Analyze conflicts',
            description: 'Review conflict markers in auth.ts',
            type: 'analyze',
            targetFiles: ['src/auth.ts'],
            estimatedImpact: 'low',
          },
        ],
        risks: [
          {
            severity: 'medium',
            description: 'Auth changes may affect login flow',
            mitigation: 'Test login after changes',
          },
        ],
        fileActions: [
          {
            path: 'src/auth.ts',
            action: 'modify',
            reason: 'Resolve conflict markers',
          },
        ],
        estimatedComplexity: 4,
        recommendedApproach: 'agent',
      };

      const result = PlanResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });
  });

  describe('ComplexityScoreSchema', () => {
    it('accepts valid scores 1-10', () => {
      for (let i = 1; i <= 10; i++) {
        const result = ComplexityScoreSchema.safeParse(i);
        expect(result.success).toBe(true);
      }
    });

    it('rejects scores outside range', () => {
      expect(ComplexityScoreSchema.safeParse(0).success).toBe(false);
      expect(ComplexityScoreSchema.safeParse(11).success).toBe(false);
      expect(ComplexityScoreSchema.safeParse(-1).success).toBe(false);
    });
  });

  describe('RiskLevelSchema', () => {
    it('accepts valid risk levels', () => {
      const levels = ['low', 'medium', 'high', 'critical'];
      for (const level of levels) {
        const result = RiskLevelSchema.safeParse(level);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid risk levels', () => {
      expect(RiskLevelSchema.safeParse('unknown').success).toBe(false);
      expect(RiskLevelSchema.safeParse('').success).toBe(false);
    });
  });

  describe('RouteDecisionSchema', () => {
    it('accepts valid route decisions', () => {
      const routes = ['auto', 'agent', 'human'];
      for (const route of routes) {
        const result = RouteDecisionSchema.safeParse(route);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid route decisions', () => {
      expect(RouteDecisionSchema.safeParse('manual').success).toBe(false);
      expect(RouteDecisionSchema.safeParse('').success).toBe(false);
    });
  });
});

// =============================================================================
// Schema Consistency Tests
// =============================================================================

describe('Schema Consistency', () => {
  it('all schemas have version field set to 1', () => {
    // This ensures we're tracking schema versions
    const schemas = [
      { name: 'TriageResult', schema: TriageResultSchema },
      { name: 'PlanResult', schema: PlanResultSchema },
      { name: 'ResolveResult', schema: ResolveResultSchema },
      { name: 'ReviewResult', schema: ReviewResultSchema },
    ];

    for (const { name, schema } of schemas) {
      // Check that version is a literal 1
      const shape = (schema as z.ZodObject<any>).shape;
      expect(shape.version).toBeDefined();
      expect(shape.version._def.typeName).toBe('ZodLiteral');
      expect(shape.version._def.value).toBe(1);
    }
  });

  it('all result schemas have timestamp field', () => {
    const schemas = [
      { name: 'TriageResult', schema: TriageResultSchema },
      { name: 'PlanResult', schema: PlanResultSchema },
      { name: 'ResolveResult', schema: ResolveResultSchema },
      { name: 'ReviewResult', schema: ReviewResultSchema },
    ];

    for (const { name, schema } of schemas) {
      const shape = (schema as z.ZodObject<any>).shape;
      expect(shape.timestamp).toBeDefined();
    }
  });
});

// =============================================================================
// Fixture Validation Tests
// =============================================================================

describe('Fixture Validation', () => {
  const validTriageFixture = {
    version: 1,
    timestamp: '2025-12-16T12:00:00Z',
    features: {
      numFiles: 2,
      numHunks: 3,
      totalConflictLines: 50,
      totalAdditions: 30,
      totalDeletions: 20,
      fileTypes: ['ts'],
      hasSecurityFiles: false,
      hasInfraFiles: false,
      hasConfigFiles: false,
      hasTestFiles: true,
      hasConflictMarkers: true,
      maxHunksPerFile: 2,
      avgHunksPerFile: 1.5,
    },
    baselineScore: 3,
    llmAdjustment: 0,
    finalScore: 3,
    baselineReasons: ['small_change'],
    llmReasons: [],
    explanation: 'Simple test file changes',
    routeDecision: 'auto',
  };

  const invalidTriageFixtures = [
    { name: 'missing version', fixture: { ...validTriageFixture, version: undefined } },
    { name: 'invalid score', fixture: { ...validTriageFixture, finalScore: 15 } },
    { name: 'invalid route', fixture: { ...validTriageFixture, routeDecision: 'invalid' } },
    { name: 'missing features', fixture: { ...validTriageFixture, features: undefined } },
  ];

  it('validates correct fixtures', () => {
    const result = TriageResultSchema.safeParse(validTriageFixture);
    expect(result.success).toBe(true);
  });

  for (const { name, fixture } of invalidTriageFixtures) {
    it(`rejects ${name}`, () => {
      const result = TriageResultSchema.safeParse(fixture);
      expect(result.success).toBe(false);
    });
  }
});
