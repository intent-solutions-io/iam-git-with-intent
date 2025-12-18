/**
 * Onboarding Page
 *
 * Phase 12: Create first workspace after signup.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createTenant, signup, ApiError, getGitHubInstallUrl } from '../lib/api';

export function Onboarding() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'sync' | 'workspace'>('sync');
  const [workspaceName, setWorkspaceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [synced, setSynced] = useState(false);

  // Sync user with backend (creates GWI user record if needed)
  const syncUser = async () => {
    if (!user) return;

    setError(null);
    setSubmitting(true);

    try {
      // Try to create user in GWI system
      await signup({
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || 'User',
        githubLogin: (user as unknown as { reloadUserInfo?: { screenName?: string } }).reloadUserInfo?.screenName,
        githubAvatarUrl: user.photoURL || undefined,
      });
      setSynced(true);
      setStep('workspace');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // User already exists, that's fine
        setSynced(true);
        setStep('workspace');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to sync account');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!workspaceName.trim()) {
      setError('Please enter a workspace name');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const result = await createTenant({
        displayName: workspaceName.trim(),
      });

      // Redirect to the new workspace dashboard
      navigate(`/dashboard?tenant=${result.tenant.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!user) {
    navigate('/login', { state: { from: { pathname: '/onboarding' } } });
    return null;
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 w-full max-w-md">
        {step === 'sync' && !synced && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
              Welcome to Git With Intent
            </h1>
            <p className="text-gray-600 text-center mb-6">
              Let's set up your account
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                {user.photoURL && (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="w-12 h-12 rounded-full"
                  />
                )}
                <div>
                  <p className="font-medium text-gray-900">
                    {user.displayName || 'User'}
                  </p>
                  <p className="text-sm text-gray-500">{user.email}</p>
                </div>
              </div>
            </div>

            <button
              onClick={syncUser}
              disabled={submitting}
              className="w-full bg-blue-600 text-white px-4 py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Setting up...' : 'Continue'}
            </button>
          </>
        )}

        {step === 'workspace' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
              Create Your Workspace
            </h1>
            <p className="text-gray-600 text-center mb-6">
              A workspace is where you'll manage your Git automation
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateWorkspace}>
              <div className="mb-4">
                <label
                  htmlFor="workspace-name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Workspace Name
                </label>
                <input
                  type="text"
                  id="workspace-name"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="e.g., My Team or Company Name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !workspaceName.trim()}
                className="w-full bg-blue-600 text-white px-4 py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Creating...' : 'Create Workspace'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-600 text-center mb-3">
                Or connect your GitHub organization directly
              </p>
              <a
                href={getGitHubInstallUrl()}
                className="w-full flex items-center justify-center space-x-2 bg-gray-900 text-white px-4 py-3 rounded-md font-medium hover:bg-gray-800"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Connect GitHub Organization</span>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
