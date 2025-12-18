/**
 * Onboarding Wizard Component
 *
 * Phase 33: Multi-step onboarding wizard with progress tracking.
 *
 * Features:
 * - Progress indicator showing completed/pending steps
 * - Step-by-step guidance
 * - Integration with onboarding API
 * - Skip option for optional steps
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Step identifiers matching API
type OnboardingStep =
  | 'github_app_installed'
  | 'first_repo_connected'
  | 'sso_configured'
  | 'first_run_completed'
  | 'team_invited'
  | 'policies_configured';

interface ChecklistItem {
  step: OnboardingStep;
  title: string;
  description: string;
  required: boolean;
  completed: boolean;
  completedAt: string | null;
  docLink: string;
}

interface OnboardingStatus {
  tenantId: string;
  orgName?: string;
  plan?: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'skipped';
  startedAt?: string;
  completedAt?: string | null;
  completedSteps: number;
  totalSteps: number;
  percentComplete: number;
  steps?: Record<OnboardingStep, { completed: boolean; completedAt: string | null }>;
}

interface OnboardingWizardProps {
  tenantId: string;
  onComplete?: () => void;
  onSkip?: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export function OnboardingWizard({ tenantId, onComplete, onSkip }: OnboardingWizardProps) {
  const { user } = useAuth();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<OnboardingStep | null>(null);

  // Fetch onboarding status on mount
  useEffect(() => {
    fetchStatus();
  }, [tenantId]);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/v1/onboarding/status?tenantId=${tenantId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch onboarding status');
      }

      const data = await response.json() as OnboardingStatus;
      setStatus(data);

      // Fetch checklist
      const checklistResponse = await fetch(`${API_BASE}/v1/onboarding/checklist?tenantId=${tenantId}`);
      if (checklistResponse.ok) {
        const checklistData = await checklistResponse.json();
        setChecklist(checklistData.checklist || []);

        // Find first incomplete step
        const nextIncomplete = checklistData.checklist?.find((item: ChecklistItem) => !item.completed);
        setCurrentStep(nextIncomplete?.step || null);
      }

      // If status is completed or skipped, call onComplete
      if (data.status === 'completed' || data.status === 'skipped') {
        onComplete?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const startOnboarding = async (orgName: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/v1/onboarding/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          orgName,
          plan: 'free',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start onboarding');
      }

      // Refresh status
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const completeStep = async (step: OnboardingStep, metadata?: Record<string, unknown>) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/v1/onboarding/steps/${step}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          metadata,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to complete step');
      }

      const result = await response.json();

      // Check if onboarding is complete
      if (result.onboardingComplete) {
        onComplete?.();
      }

      // Refresh status
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const skipOnboarding = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/v1/onboarding/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to skip onboarding');
      }

      onSkip?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Not started - show start screen
  if (status?.status === 'not_started') {
    return (
      <NotStartedView
        user={user}
        error={error}
        onStart={startOnboarding}
        onSkip={skipOnboarding}
      />
    );
  }

  // In progress - show wizard
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Get Started with Git With Intent</h1>
        <p className="text-gray-600">
          Complete these steps to set up your workspace
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Progress: {status?.completedSteps || 0} of {status?.totalSteps || 6} steps
          </span>
          <span className="text-sm font-medium text-blue-600">
            {status?.percentComplete || 0}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${status?.percentComplete || 0}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Checklist */}
      <div className="space-y-4">
        {checklist.map((item) => (
          <StepCard
            key={item.step}
            item={item}
            isActive={currentStep === item.step}
            onComplete={() => completeStep(item.step)}
          />
        ))}
      </div>

      {/* Skip button */}
      <div className="mt-8 pt-6 border-t border-gray-200 text-center">
        <button
          onClick={skipOnboarding}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          Skip setup and go to dashboard
        </button>
      </div>
    </div>
  );
}

// Not started view component
interface NotStartedViewProps {
  user: { displayName?: string | null; email?: string | null; photoURL?: string | null } | null;
  error: string | null;
  onStart: (orgName: string) => void;
  onSkip: () => void;
}

function NotStartedView({ user, error, onStart, onSkip }: NotStartedViewProps) {
  const [orgName, setOrgName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (orgName.trim()) {
      onStart(orgName.trim());
    }
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Git With Intent</h1>
        <p className="text-gray-600">
          Let's get your workspace set up in just a few minutes
        </p>
      </div>

      {user && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            {user.photoURL && (
              <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full" />
            )}
            <div>
              <p className="font-medium text-gray-900">{user.displayName || 'User'}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="org-name" className="block text-sm font-medium text-gray-700 mb-1">
            Organization Name
          </label>
          <input
            type="text"
            id="org-name"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="e.g., My Team or Company Name"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
        </div>

        <button
          type="submit"
          disabled={!orgName.trim()}
          className="w-full bg-blue-600 text-white px-4 py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start Setup
        </button>
      </form>

      <div className="mt-4 text-center">
        <button onClick={onSkip} className="text-gray-500 hover:text-gray-700 text-sm">
          Skip for now
        </button>
      </div>

      {/* What you'll set up */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <h3 className="text-sm font-medium text-gray-900 mb-3">What you'll set up:</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-center">
            <CheckIcon className="w-4 h-4 text-green-500 mr-2" />
            Install GitHub App
          </li>
          <li className="flex items-center">
            <CheckIcon className="w-4 h-4 text-green-500 mr-2" />
            Connect your first repository
          </li>
          <li className="flex items-center">
            <CheckIcon className="w-4 h-4 text-green-500 mr-2" />
            Complete your first AI-assisted run
          </li>
          <li className="flex items-center text-gray-400">
            <span className="w-4 h-4 mr-2 text-center">-</span>
            <span className="italic">Optional: SSO, team invites, policies</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

// Step card component
interface StepCardProps {
  item: ChecklistItem;
  isActive: boolean;
  onComplete: () => void;
}

function StepCard({ item, isActive, onComplete }: StepCardProps) {
  const [expanded, setExpanded] = useState(isActive);

  return (
    <div
      className={`border rounded-lg transition-all ${
        item.completed
          ? 'border-green-200 bg-green-50'
          : isActive
          ? 'border-blue-300 bg-blue-50'
          : 'border-gray-200 bg-white'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center">
          {item.completed ? (
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center mr-3">
              <CheckIcon className="w-4 h-4 text-white" />
            </div>
          ) : (
            <div
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mr-3 ${
                isActive ? 'border-blue-500 bg-blue-100' : 'border-gray-300'
              }`}
            >
              {isActive && <div className="w-2 h-2 rounded-full bg-blue-500" />}
            </div>
          )}
          <div>
            <h3 className={`font-medium ${item.completed ? 'text-green-800' : 'text-gray-900'}`}>
              {item.title}
              {!item.required && (
                <span className="ml-2 text-xs text-gray-500 font-normal">(Optional)</span>
              )}
            </h3>
            {item.completedAt && (
              <p className="text-xs text-green-600">
                Completed {new Date(item.completedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        <ChevronIcon className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0">
          <p className="text-sm text-gray-600 mb-4 ml-9">{item.description}</p>

          <div className="ml-9 flex items-center space-x-3">
            {!item.completed && (
              <button
                onClick={onComplete}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
              >
                Mark as Complete
              </button>
            )}
            <a
              href={item.docLink}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
            >
              View Guide
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// Icon components
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default OnboardingWizard;
