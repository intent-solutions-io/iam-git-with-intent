/**
 * Phase 33: Onboarding API Routes
 *
 * Customer onboarding endpoints for Git With Intent.
 *
 * Endpoints:
 * - GET /v1/onboarding/status - Get onboarding status for tenant
 * - POST /v1/onboarding/start - Start onboarding flow
 * - POST /v1/onboarding/steps/:step/complete - Complete an onboarding step
 * - GET /v1/onboarding/checklist - Get onboarding checklist
 * - POST /v1/onboarding/skip - Skip optional onboarding
 *
 * @module @gwi/gateway/onboarding-routes
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getTenantStore } from '@gwi/core';

const router = Router();

// =============================================================================
// Schemas
// =============================================================================

/** Onboarding step enum */
const OnboardingStep = z.enum([
  'github_app_installed',
  'first_repo_connected',
  'sso_configured',
  'first_run_completed',
  'team_invited',
  'policies_configured',
]);

type OnboardingStepType = z.infer<typeof OnboardingStep>;

/** Start onboarding request */
const StartOnboardingSchema = z.object({
  tenantId: z.string().min(1),
  orgName: z.string().min(1).max(128),
  plan: z.enum(['free', 'team', 'business', 'enterprise']).default('free'),
});

/** Complete step request */
const CompleteStepSchema = z.object({
  tenantId: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

// =============================================================================
// In-Memory Onboarding State (replace with Firestore in production)
// =============================================================================

interface OnboardingState {
  tenantId: string;
  orgName: string;
  plan: string;
  startedAt: string;
  completedAt: string | null;
  steps: Record<OnboardingStepType, {
    completed: boolean;
    completedAt: string | null;
    metadata?: Record<string, unknown>;
  }>;
}

const onboardingStore = new Map<string, OnboardingState>();

// Default steps for new tenants
function createDefaultSteps(): OnboardingState['steps'] {
  return {
    github_app_installed: { completed: false, completedAt: null },
    first_repo_connected: { completed: false, completedAt: null },
    sso_configured: { completed: false, completedAt: null },
    first_run_completed: { completed: false, completedAt: null },
    team_invited: { completed: false, completedAt: null },
    policies_configured: { completed: false, completedAt: null },
  };
}

// =============================================================================
// Onboarding Status Endpoint
// =============================================================================

/**
 * GET /v1/onboarding/status - Get onboarding status for tenant
 */
router.get('/v1/onboarding/status', async (req: Request, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId query parameter required' });
    }

    // Check if tenant exists
    const tenantStore = getTenantStore();
    const tenant = await tenantStore.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found', tenantId });
    }

    const state = onboardingStore.get(tenantId);
    if (!state) {
      // Tenant exists but hasn't started onboarding
      return res.json({
        tenantId,
        status: 'not_started',
        completedSteps: 0,
        totalSteps: 6,
        percentComplete: 0,
      });
    }

    // Calculate progress
    const completedSteps = Object.values(state.steps).filter(s => s.completed).length;
    const totalSteps = Object.keys(state.steps).length;
    const percentComplete = Math.round((completedSteps / totalSteps) * 100);

    res.json({
      tenantId,
      orgName: state.orgName,
      plan: state.plan,
      status: state.completedAt ? 'completed' : 'in_progress',
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      completedSteps,
      totalSteps,
      percentComplete,
      steps: state.steps,
    });
  } catch (error) {
    console.error('Get onboarding status error:', error);
    res.status(500).json({
      error: 'Failed to get onboarding status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Start Onboarding Endpoint
// =============================================================================

/**
 * POST /v1/onboarding/start - Start onboarding flow
 */
router.post('/v1/onboarding/start', async (req: Request, res: Response) => {
  try {
    const parseResult = StartOnboardingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const { tenantId, orgName, plan } = parseResult.data;

    // Check if tenant exists
    const tenantStore = getTenantStore();
    const tenant = await tenantStore.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found', tenantId });
    }

    // Check if already onboarding
    if (onboardingStore.has(tenantId)) {
      const existing = onboardingStore.get(tenantId)!;
      return res.status(409).json({
        error: 'Onboarding already started',
        startedAt: existing.startedAt,
        status: existing.completedAt ? 'completed' : 'in_progress',
      });
    }

    // Create onboarding state
    const state: OnboardingState = {
      tenantId,
      orgName,
      plan,
      startedAt: new Date().toISOString(),
      completedAt: null,
      steps: createDefaultSteps(),
    };

    onboardingStore.set(tenantId, state);

    console.log(JSON.stringify({
      type: 'onboarding_started',
      tenantId,
      orgName,
      plan,
      timestamp: state.startedAt,
    }));

    res.status(201).json({
      success: true,
      tenantId,
      status: 'in_progress',
      startedAt: state.startedAt,
      nextStep: 'github_app_installed',
      checklist: getChecklist(state),
    });
  } catch (error) {
    console.error('Start onboarding error:', error);
    res.status(500).json({
      error: 'Failed to start onboarding',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Complete Step Endpoint
// =============================================================================

/**
 * POST /v1/onboarding/steps/:step/complete - Complete an onboarding step
 */
router.post('/v1/onboarding/steps/:step/complete', async (req: Request, res: Response) => {
  try {
    const { step } = req.params;

    // Validate step
    const stepResult = OnboardingStep.safeParse(step);
    if (!stepResult.success) {
      return res.status(400).json({
        error: 'Invalid step',
        validSteps: OnboardingStep.options,
      });
    }

    const parseResult = CompleteStepSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const { tenantId, metadata } = parseResult.data;
    const stepName = stepResult.data;

    // Get onboarding state
    const state = onboardingStore.get(tenantId);
    if (!state) {
      return res.status(404).json({
        error: 'Onboarding not started',
        tenantId,
        hint: 'Call POST /v1/onboarding/start first',
      });
    }

    // Check if already completed
    if (state.steps[stepName].completed) {
      return res.status(409).json({
        error: 'Step already completed',
        step: stepName,
        completedAt: state.steps[stepName].completedAt,
      });
    }

    // Mark step complete
    state.steps[stepName] = {
      completed: true,
      completedAt: new Date().toISOString(),
      metadata,
    };

    console.log(JSON.stringify({
      type: 'onboarding_step_completed',
      tenantId,
      step: stepName,
      timestamp: state.steps[stepName].completedAt,
    }));

    // Check if all required steps complete
    const requiredSteps: OnboardingStepType[] = [
      'github_app_installed',
      'first_repo_connected',
      'first_run_completed',
    ];
    const allRequiredComplete = requiredSteps.every(s => state.steps[s].completed);

    if (allRequiredComplete && !state.completedAt) {
      state.completedAt = new Date().toISOString();
      console.log(JSON.stringify({
        type: 'onboarding_completed',
        tenantId,
        timestamp: state.completedAt,
      }));
    }

    // Get next step
    const nextStep = getNextStep(state);

    res.json({
      success: true,
      step: stepName,
      completedAt: state.steps[stepName].completedAt,
      onboardingComplete: !!state.completedAt,
      nextStep,
      checklist: getChecklist(state),
    });
  } catch (error) {
    console.error('Complete step error:', error);
    res.status(500).json({
      error: 'Failed to complete step',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Checklist Endpoint
// =============================================================================

/**
 * GET /v1/onboarding/checklist - Get onboarding checklist
 */
router.get('/v1/onboarding/checklist', async (req: Request, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId query parameter required' });
    }

    const state = onboardingStore.get(tenantId);
    if (!state) {
      // Return default checklist for tenants that haven't started
      return res.json({
        tenantId,
        status: 'not_started',
        checklist: getDefaultChecklist(),
      });
    }

    res.json({
      tenantId,
      status: state.completedAt ? 'completed' : 'in_progress',
      checklist: getChecklist(state),
    });
  } catch (error) {
    console.error('Get checklist error:', error);
    res.status(500).json({
      error: 'Failed to get checklist',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Skip Onboarding Endpoint
// =============================================================================

/**
 * POST /v1/onboarding/skip - Skip optional onboarding
 */
router.post('/v1/onboarding/skip', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.body;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId required' });
    }

    const state = onboardingStore.get(tenantId);
    if (!state) {
      return res.status(404).json({
        error: 'Onboarding not started',
        tenantId,
      });
    }

    // Mark as completed (user chose to skip)
    state.completedAt = new Date().toISOString();

    console.log(JSON.stringify({
      type: 'onboarding_skipped',
      tenantId,
      timestamp: state.completedAt,
    }));

    res.json({
      success: true,
      tenantId,
      status: 'skipped',
      skippedAt: state.completedAt,
    });
  } catch (error) {
    console.error('Skip onboarding error:', error);
    res.status(500).json({
      error: 'Failed to skip onboarding',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Helpers
// =============================================================================

interface ChecklistItem {
  step: OnboardingStepType;
  title: string;
  description: string;
  required: boolean;
  completed: boolean;
  completedAt: string | null;
  docLink: string;
}

function getChecklist(state: OnboardingState): ChecklistItem[] {
  return [
    {
      step: 'github_app_installed',
      title: 'Install GitHub App',
      description: 'Install the Git With Intent GitHub App on your organization',
      required: true,
      completed: state.steps.github_app_installed.completed,
      completedAt: state.steps.github_app_installed.completedAt,
      docLink: '/docs/setup/github-app',
    },
    {
      step: 'first_repo_connected',
      title: 'Connect First Repository',
      description: 'Connect at least one repository to Git With Intent',
      required: true,
      completed: state.steps.first_repo_connected.completed,
      completedAt: state.steps.first_repo_connected.completedAt,
      docLink: '/docs/setup/connect-repo',
    },
    {
      step: 'sso_configured',
      title: 'Configure SSO (Optional)',
      description: 'Set up OIDC or SAML single sign-on for your team',
      required: false,
      completed: state.steps.sso_configured.completed,
      completedAt: state.steps.sso_configured.completedAt,
      docLink: '/docs/enterprise/sso',
    },
    {
      step: 'first_run_completed',
      title: 'Complete First Run',
      description: 'Create an issue with gwi:autopilot label and see it get processed',
      required: true,
      completed: state.steps.first_run_completed.completed,
      completedAt: state.steps.first_run_completed.completedAt,
      docLink: '/docs/getting-started/first-run',
    },
    {
      step: 'team_invited',
      title: 'Invite Team Members (Optional)',
      description: 'Add your team members to the organization',
      required: false,
      completed: state.steps.team_invited.completed,
      completedAt: state.steps.team_invited.completedAt,
      docLink: '/docs/teams/invite-members',
    },
    {
      step: 'policies_configured',
      title: 'Configure Policies (Optional)',
      description: 'Set up approval policies and risk thresholds',
      required: false,
      completed: state.steps.policies_configured.completed,
      completedAt: state.steps.policies_configured.completedAt,
      docLink: '/docs/policies/configuration',
    },
  ];
}

function getDefaultChecklist(): ChecklistItem[] {
  return getChecklist({
    tenantId: '',
    orgName: '',
    plan: 'free',
    startedAt: '',
    completedAt: null,
    steps: createDefaultSteps(),
  });
}

function getNextStep(state: OnboardingState): OnboardingStepType | null {
  const stepOrder: OnboardingStepType[] = [
    'github_app_installed',
    'first_repo_connected',
    'first_run_completed',
    'sso_configured',
    'team_invited',
    'policies_configured',
  ];

  for (const step of stepOrder) {
    if (!state.steps[step].completed) {
      return step;
    }
  }

  return null;
}

export { router as onboardingRouter };
