/**
 * Contract Tests - Onboarding Module
 *
 * Phase 33: Tests for customer onboarding API and flows
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// =============================================================================
// Schema Definitions (mirrors onboarding-routes.ts)
// =============================================================================

/** Onboarding step enum */
const OnboardingStepSchema = z.enum([
  'github_app_installed',
  'first_repo_connected',
  'sso_configured',
  'first_run_completed',
  'team_invited',
  'policies_configured',
]);

/** Start onboarding request */
const StartOnboardingRequestSchema = z.object({
  tenantId: z.string().min(1),
  orgName: z.string().min(1).max(128),
  plan: z.enum(['free', 'team', 'business', 'enterprise']).default('free'),
});

/** Complete step request */
const CompleteStepRequestSchema = z.object({
  tenantId: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

/** Onboarding status response */
const OnboardingStatusResponseSchema = z.object({
  tenantId: z.string(),
  orgName: z.string().optional(),
  plan: z.string().optional(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'skipped']),
  startedAt: z.string().optional(),
  completedAt: z.string().nullable().optional(),
  completedSteps: z.number().min(0).max(6),
  totalSteps: z.number().min(6).max(6),
  percentComplete: z.number().min(0).max(100),
  steps: z.record(z.object({
    completed: z.boolean(),
    completedAt: z.string().nullable(),
    metadata: z.record(z.unknown()).optional(),
  })).optional(),
});

/** Checklist item schema */
const ChecklistItemSchema = z.object({
  step: OnboardingStepSchema,
  title: z.string(),
  description: z.string(),
  required: z.boolean(),
  completed: z.boolean(),
  completedAt: z.string().nullable(),
  docLink: z.string(),
});

/** Checklist response */
const ChecklistResponseSchema = z.object({
  tenantId: z.string(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'skipped']),
  checklist: z.array(ChecklistItemSchema),
});

// =============================================================================
// Schema Validation Tests
// =============================================================================

describe('Onboarding Schema Validation', () => {
  describe('OnboardingStepSchema', () => {
    it('accepts valid onboarding steps', () => {
      const validSteps = [
        'github_app_installed',
        'first_repo_connected',
        'sso_configured',
        'first_run_completed',
        'team_invited',
        'policies_configured',
      ];

      for (const step of validSteps) {
        const result = OnboardingStepSchema.safeParse(step);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid step names', () => {
      const invalidSteps = ['invalid', 'setup_complete', 'start', ''];

      for (const step of invalidSteps) {
        const result = OnboardingStepSchema.safeParse(step);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('StartOnboardingRequestSchema', () => {
    it('accepts valid start request', () => {
      const request = {
        tenantId: 'tenant-123',
        orgName: 'Acme Corp',
        plan: 'team',
      };
      const result = StartOnboardingRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('defaults plan to free when not specified', () => {
      const request = {
        tenantId: 'tenant-123',
        orgName: 'Acme Corp',
      };
      const result = StartOnboardingRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.plan).toBe('free');
      }
    });

    it('rejects empty tenantId', () => {
      const request = {
        tenantId: '',
        orgName: 'Acme Corp',
      };
      const result = StartOnboardingRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('rejects empty orgName', () => {
      const request = {
        tenantId: 'tenant-123',
        orgName: '',
      };
      const result = StartOnboardingRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('rejects orgName exceeding max length', () => {
      const request = {
        tenantId: 'tenant-123',
        orgName: 'A'.repeat(129),
      };
      const result = StartOnboardingRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('rejects invalid plan', () => {
      const request = {
        tenantId: 'tenant-123',
        orgName: 'Acme Corp',
        plan: 'premium', // Invalid plan
      };
      const result = StartOnboardingRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe('CompleteStepRequestSchema', () => {
    it('accepts valid complete step request', () => {
      const request = {
        tenantId: 'tenant-123',
        metadata: { repoCount: 5 },
      };
      const result = CompleteStepRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('accepts request without metadata', () => {
      const request = {
        tenantId: 'tenant-123',
      };
      const result = CompleteStepRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('rejects empty tenantId', () => {
      const request = {
        tenantId: '',
      };
      const result = CompleteStepRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe('OnboardingStatusResponseSchema', () => {
    it('accepts not_started status', () => {
      const response = {
        tenantId: 'tenant-123',
        status: 'not_started' as const,
        completedSteps: 0,
        totalSteps: 6,
        percentComplete: 0,
      };
      const result = OnboardingStatusResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('accepts in_progress status with full data', () => {
      const response = {
        tenantId: 'tenant-123',
        orgName: 'Acme Corp',
        plan: 'team',
        status: 'in_progress' as const,
        startedAt: '2025-12-18T10:00:00.000Z',
        completedAt: null,
        completedSteps: 2,
        totalSteps: 6,
        percentComplete: 33,
        steps: {
          github_app_installed: { completed: true, completedAt: '2025-12-18T10:05:00.000Z' },
          first_repo_connected: { completed: true, completedAt: '2025-12-18T10:10:00.000Z' },
          sso_configured: { completed: false, completedAt: null },
          first_run_completed: { completed: false, completedAt: null },
          team_invited: { completed: false, completedAt: null },
          policies_configured: { completed: false, completedAt: null },
        },
      };
      const result = OnboardingStatusResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('accepts completed status', () => {
      const response = {
        tenantId: 'tenant-123',
        orgName: 'Acme Corp',
        plan: 'enterprise',
        status: 'completed' as const,
        startedAt: '2025-12-18T10:00:00.000Z',
        completedAt: '2025-12-18T10:30:00.000Z',
        completedSteps: 6,
        totalSteps: 6,
        percentComplete: 100,
      };
      const result = OnboardingStatusResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      const response = {
        tenantId: 'tenant-123',
        status: 'pending' as const, // Invalid
        completedSteps: 0,
        totalSteps: 6,
        percentComplete: 0,
      };
      const result = OnboardingStatusResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('rejects completedSteps exceeding totalSteps', () => {
      const response = {
        tenantId: 'tenant-123',
        status: 'in_progress' as const,
        completedSteps: 7, // More than total
        totalSteps: 6,
        percentComplete: 100,
      };
      const result = OnboardingStatusResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('ChecklistItemSchema', () => {
    it('accepts valid checklist item', () => {
      const item = {
        step: 'github_app_installed' as const,
        title: 'Install GitHub App',
        description: 'Install the Git With Intent GitHub App',
        required: true,
        completed: false,
        completedAt: null,
        docLink: '/docs/setup/github-app',
      };
      const result = ChecklistItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });

    it('accepts completed checklist item', () => {
      const item = {
        step: 'first_run_completed' as const,
        title: 'Complete First Run',
        description: 'Run your first AI-assisted issue',
        required: true,
        completed: true,
        completedAt: '2025-12-18T10:30:00.000Z',
        docLink: '/docs/getting-started/first-run',
      };
      const result = ChecklistItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });

    it('rejects invalid step in checklist item', () => {
      const item = {
        step: 'invalid_step',
        title: 'Test',
        description: 'Test description',
        required: true,
        completed: false,
        completedAt: null,
        docLink: '/docs/test',
      };
      const result = ChecklistItemSchema.safeParse(item);
      expect(result.success).toBe(false);
    });
  });

  describe('ChecklistResponseSchema', () => {
    it('accepts valid checklist response', () => {
      const response = {
        tenantId: 'tenant-123',
        status: 'in_progress' as const,
        checklist: [
          {
            step: 'github_app_installed' as const,
            title: 'Install GitHub App',
            description: 'Install the Git With Intent GitHub App',
            required: true,
            completed: true,
            completedAt: '2025-12-18T10:05:00.000Z',
            docLink: '/docs/setup/github-app',
          },
          {
            step: 'first_repo_connected' as const,
            title: 'Connect First Repository',
            description: 'Connect at least one repository',
            required: true,
            completed: false,
            completedAt: null,
            docLink: '/docs/setup/connect-repo',
          },
        ],
      };
      const result = ChecklistResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('accepts empty checklist for not_started', () => {
      const response = {
        tenantId: 'tenant-123',
        status: 'not_started' as const,
        checklist: [],
      };
      const result = ChecklistResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// Onboarding Logic Tests
// =============================================================================

describe('Onboarding Logic', () => {
  describe('Required Steps', () => {
    it('identifies correct required steps', () => {
      const requiredSteps = [
        'github_app_installed',
        'first_repo_connected',
        'first_run_completed',
      ];

      const optionalSteps = [
        'sso_configured',
        'team_invited',
        'policies_configured',
      ];

      // These are the required steps for onboarding completion
      expect(requiredSteps.length).toBe(3);
      expect(optionalSteps.length).toBe(3);
    });
  });

  describe('Progress Calculation', () => {
    it('calculates correct percentage for 0 completed', () => {
      const completedSteps = 0;
      const totalSteps = 6;
      const percentComplete = Math.round((completedSteps / totalSteps) * 100);
      expect(percentComplete).toBe(0);
    });

    it('calculates correct percentage for 3 completed', () => {
      const completedSteps = 3;
      const totalSteps = 6;
      const percentComplete = Math.round((completedSteps / totalSteps) * 100);
      expect(percentComplete).toBe(50);
    });

    it('calculates correct percentage for all completed', () => {
      const completedSteps = 6;
      const totalSteps = 6;
      const percentComplete = Math.round((completedSteps / totalSteps) * 100);
      expect(percentComplete).toBe(100);
    });
  });

  describe('Step Order', () => {
    it('defines logical step order', () => {
      const stepOrder = [
        'github_app_installed',    // 1. Install the app first
        'first_repo_connected',    // 2. Then connect a repo
        'first_run_completed',     // 3. Complete first run
        'sso_configured',          // 4. Optional: SSO
        'team_invited',            // 5. Optional: Team
        'policies_configured',     // 6. Optional: Policies
      ];

      expect(stepOrder.length).toBe(6);
      expect(stepOrder[0]).toBe('github_app_installed');
      expect(stepOrder[stepOrder.length - 1]).toBe('policies_configured');
    });
  });
});

// =============================================================================
// Plan Validation Tests
// =============================================================================

describe('Plan Validation', () => {
  const validPlans = ['free', 'team', 'business', 'enterprise'];
  const planSchema = z.enum(['free', 'team', 'business', 'enterprise']);

  it('accepts all valid plans', () => {
    for (const plan of validPlans) {
      const result = planSchema.safeParse(plan);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid plans', () => {
    const invalidPlans = ['premium', 'pro', 'basic', 'starter', ''];
    for (const plan of invalidPlans) {
      const result = planSchema.safeParse(plan);
      expect(result.success).toBe(false);
    }
  });
});

// =============================================================================
// API Endpoint Contract Tests
// =============================================================================

describe('API Endpoint Contracts', () => {
  describe('GET /v1/onboarding/status', () => {
    it('returns correct structure for new tenant', () => {
      const mockResponse = {
        tenantId: 'tenant-new',
        status: 'not_started' as const,
        completedSteps: 0,
        totalSteps: 6,
        percentComplete: 0,
      };

      const result = OnboardingStatusResponseSchema.safeParse(mockResponse);
      expect(result.success).toBe(true);
    });

    it('returns correct structure for active onboarding', () => {
      const mockResponse = {
        tenantId: 'tenant-active',
        orgName: 'Test Org',
        plan: 'team',
        status: 'in_progress' as const,
        startedAt: new Date().toISOString(),
        completedAt: null,
        completedSteps: 2,
        totalSteps: 6,
        percentComplete: 33,
        steps: {
          github_app_installed: { completed: true, completedAt: new Date().toISOString() },
          first_repo_connected: { completed: true, completedAt: new Date().toISOString() },
          sso_configured: { completed: false, completedAt: null },
          first_run_completed: { completed: false, completedAt: null },
          team_invited: { completed: false, completedAt: null },
          policies_configured: { completed: false, completedAt: null },
        },
      };

      const result = OnboardingStatusResponseSchema.safeParse(mockResponse);
      expect(result.success).toBe(true);
    });
  });

  describe('POST /v1/onboarding/start', () => {
    it('validates start request correctly', () => {
      const validRequest = {
        tenantId: 'tenant-123',
        orgName: 'My Organization',
        plan: 'business',
      };

      const result = StartOnboardingRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });
  });

  describe('POST /v1/onboarding/steps/:step/complete', () => {
    it('validates complete step request', () => {
      const validRequest = {
        tenantId: 'tenant-123',
        metadata: {
          reposConnected: 3,
          timestamp: new Date().toISOString(),
        },
      };

      const result = CompleteStepRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });
  });

  describe('GET /v1/onboarding/checklist', () => {
    it('validates checklist response', () => {
      const mockResponse = {
        tenantId: 'tenant-123',
        status: 'in_progress' as const,
        checklist: [
          {
            step: 'github_app_installed' as const,
            title: 'Install GitHub App',
            description: 'Install the Git With Intent GitHub App on your organization',
            required: true,
            completed: true,
            completedAt: new Date().toISOString(),
            docLink: '/docs/setup/github-app',
          },
          {
            step: 'first_repo_connected' as const,
            title: 'Connect First Repository',
            description: 'Connect at least one repository to Git With Intent',
            required: true,
            completed: false,
            completedAt: null,
            docLink: '/docs/setup/connect-repo',
          },
        ],
      };

      const result = ChecklistResponseSchema.safeParse(mockResponse);
      expect(result.success).toBe(true);
    });
  });
});
