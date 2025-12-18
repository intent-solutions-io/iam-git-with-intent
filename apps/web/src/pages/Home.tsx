/**
 * Home Page
 *
 * Landing page for unauthenticated users.
 */


import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function Home() {
  const { user } = useAuth();

  return (
    <div className="text-center py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        Git With Intent
      </h1>
      <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
        AI-powered DevOps automation for PRs, merge conflicts, and issue-to-PR
        workflows. Ship with confidence.
      </p>

      <div className="flex justify-center space-x-4">
        {user ? (
          <Link
            to="/dashboard"
            className="bg-gray-900 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800"
          >
            Go to Dashboard
          </Link>
        ) : (
          <>
            <Link
              to="/login"
              className="bg-gray-900 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800"
            >
              Get Started
            </Link>
            <a
              href="https://github.com/apps/git-with-intent"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-gray-300 text-gray-700 px-6 py-3 rounded-md font-medium hover:bg-gray-50"
            >
              Install GitHub App
            </a>
          </>
        )}
      </div>

      {/* Features */}
      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Merge Conflict Resolution
          </h3>
          <p className="text-gray-600">
            AI agents analyze and resolve merge conflicts with context-aware
            suggestions.
          </p>
        </div>

        <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Intelligent Triage
          </h3>
          <p className="text-gray-600">
            Automatically categorize and prioritize PRs based on complexity and
            risk.
          </p>
        </div>

        <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Human-in-the-Loop
          </h3>
          <p className="text-gray-600">
            Approval gates at the right moments. Automation with oversight.
          </p>
        </div>
      </div>
    </div>
  );
}
