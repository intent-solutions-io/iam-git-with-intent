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
    <div className="py-16">
      {/* Hero Section */}
      <div className="text-center mb-20">
        <h1 className="text-5xl font-bold text-gray-900 mb-6">
          Git With Intent
        </h1>
        <p className="text-2xl text-gray-600 mb-8 max-w-3xl mx-auto">
          AI-powered DevOps automation for PRs, merge conflicts, and issue-to-PR
          workflows. Ship with confidence.
        </p>

        <div className="flex justify-center space-x-4 mb-8">
          {user ? (
            <Link
              to="/dashboard"
              className="bg-gray-900 text-white px-8 py-4 rounded-md font-medium hover:bg-gray-800 text-lg"
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/install"
                className="bg-gray-900 text-white px-8 py-4 rounded-md font-medium hover:bg-gray-800 text-lg"
              >
                Get Started
              </Link>
              <a
                href="https://github.com/apps/git-with-intent"
                target="_blank"
                rel="noopener noreferrer"
                className="border border-gray-300 text-gray-700 px-8 py-4 rounded-md font-medium hover:bg-gray-50 text-lg"
              >
                Install GitHub App
              </a>
            </>
          )}
        </div>

        <p className="text-gray-500">
          Free during beta • No credit card required
        </p>
      </div>

      {/* Features Grid */}
      <div className="mb-20 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
          Automate Your Entire Workflow
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-8 bg-white rounded-lg shadow-md border border-gray-200">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              Intelligent Triage
            </h3>
            <p className="text-gray-600 mb-4">
              Automatically categorize and prioritize PRs based on complexity and
              risk. Know what needs attention first.
            </p>
            <Link to="/features" className="text-blue-600 hover:text-blue-700 font-medium">
              Learn more →
            </Link>
          </div>

          <div className="p-8 bg-white rounded-lg shadow-md border border-gray-200">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              Conflict Resolution
            </h3>
            <p className="text-gray-600 mb-4">
              AI agents analyze and resolve merge conflicts with semantic
              understanding. No more manual git archaeology.
            </p>
            <Link to="/features" className="text-blue-600 hover:text-blue-700 font-medium">
              Learn more →
            </Link>
          </div>

          <div className="p-8 bg-white rounded-lg shadow-md border border-gray-200">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              Code Generation
            </h3>
            <p className="text-gray-600 mb-4">
              Turn issues into pull requests automatically. Generate implementation
              plans and production-ready code.
            </p>
            <Link to="/features" className="text-blue-600 hover:text-blue-700 font-medium">
              Learn more →
            </Link>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="mb-20 max-w-6xl mx-auto bg-gray-50 rounded-lg p-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              1
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Connect</h3>
            <p className="text-gray-600 text-sm">
              Install the GitHub App or use the CLI
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              2
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Analyze</h3>
            <p className="text-gray-600 text-sm">
              AI agents analyze your code and context
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              3
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Automate</h3>
            <p className="text-gray-600 text-sm">
              Generate plans, resolve conflicts, review code
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              4
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Approve</h3>
            <p className="text-gray-600 text-sm">
              Review and approve changes before merge
            </p>
          </div>
        </div>
        <div className="text-center">
          <Link
            to="/how-it-works"
            className="inline-block bg-gray-900 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800"
          >
            Learn More About Our Architecture
          </Link>
        </div>
      </div>

      {/* Social Proof / Stats */}
      <div className="mb-20 max-w-6xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-12">
          Built for Modern Development Teams
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="text-4xl font-bold text-blue-600 mb-2">Multi-Agent</div>
            <p className="text-gray-600">Specialized AI agents working together</p>
          </div>
          <div>
            <div className="text-4xl font-bold text-blue-600 mb-2">Human-in-Loop</div>
            <p className="text-gray-600">Approval gates ensure safety and control</p>
          </div>
          <div>
            <div className="text-4xl font-bold text-blue-600 mb-2">Open Source</div>
            <p className="text-gray-600">CLI tool available on GitHub</p>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="mb-20 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white border border-gray-200 rounded-lg p-8">
            <h3 className="text-2xl font-semibold text-gray-900 mb-4">For Developers</h3>
            <ul className="space-y-3 mb-6">
              <li>
                <Link to="/install" className="text-blue-600 hover:text-blue-700 font-medium">
                  → Installation Guide
                </Link>
              </li>
              <li>
                <Link to="/docs" className="text-blue-600 hover:text-blue-700 font-medium">
                  → Documentation & API
                </Link>
              </li>
              <li>
                <a href="https://github.com/git-with-intent" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 font-medium">
                  → View on GitHub
                </a>
              </li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-8">
            <h3 className="text-2xl font-semibold text-gray-900 mb-4">Learn More</h3>
            <ul className="space-y-3 mb-6">
              <li>
                <Link to="/features" className="text-blue-600 hover:text-blue-700 font-medium">
                  → All Features
                </Link>
              </li>
              <li>
                <Link to="/security" className="text-blue-600 hover:text-blue-700 font-medium">
                  → Security & Privacy
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="text-blue-600 hover:text-blue-700 font-medium">
                  → Pricing
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="text-center bg-gray-900 text-white rounded-lg p-12 max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold mb-4">Ready to accelerate your workflow?</h2>
        <p className="text-xl text-gray-300 mb-8">
          Start automating your PR workflow today. Free during beta.
        </p>
        <div className="flex justify-center space-x-4">
          <Link
            to="/install"
            className="bg-white text-gray-900 px-8 py-3 rounded-md font-medium hover:bg-gray-100"
          >
            Get Started Free
          </Link>
          <a
            href="https://github.com/apps/git-with-intent"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-white text-white px-8 py-3 rounded-md font-medium hover:bg-gray-800"
          >
            Install GitHub App
          </a>
        </div>
      </div>
    </div>
  );
}
