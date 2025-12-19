/**
 * Features Page
 *
 * Detailed feature descriptions for Git With Intent.
 */

import { Link } from 'react-router-dom';

export function Features() {
  return (
    <div className="max-w-6xl mx-auto py-12 px-4">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Features
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          AI-powered automation for every step of your development workflow
        </p>
      </div>

      {/* Core Features */}
      <div className="mb-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Core Capabilities</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-8 bg-white rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-gray-900">Intelligent Triage</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Automatically analyze PRs and issues to categorize complexity, identify risks, and suggest priorities.
            </p>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Complexity scoring based on files changed and dependencies
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Risk assessment for breaking changes
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Automatic labeling and assignment suggestions
              </li>
            </ul>
          </div>

          <div className="p-8 bg-white rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-gray-900">Code Generation</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Generate implementation plans and code changes from issue descriptions with context awareness.
            </p>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Analyzes existing codebase patterns and conventions
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Creates detailed implementation plans
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Generates production-ready code changes
              </li>
            </ul>
          </div>

          <div className="p-8 bg-white rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-gray-900">Conflict Resolution</h3>
            </div>
            <p className="text-gray-600 mb-4">
              AI-powered merge conflict detection and resolution with semantic understanding.
            </p>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Detects conflicts before they happen
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Suggests context-aware resolutions
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Validates resolutions against tests
              </li>
            </ul>
          </div>

          <div className="p-8 bg-white rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-gray-900">Code Review</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Comprehensive code reviews with actionable feedback and security analysis.
            </p>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Best practice enforcement
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Security vulnerability detection
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Performance optimization suggestions
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Multi-Agent Architecture */}
      <div className="mb-20 bg-gray-50 rounded-lg p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Multi-Agent Architecture</h2>
        <p className="text-gray-600 mb-6">
          Specialized AI agents work together to handle different aspects of your workflow:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-2">Orchestrator</h4>
            <p className="text-sm text-gray-600">Coordinates agent workflow and task routing</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-2">Triage Agent</h4>
            <p className="text-sm text-gray-600">Analyzes and categorizes PRs and issues</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-2">Coder Agent</h4>
            <p className="text-sm text-gray-600">Generates implementation plans and code</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-2">Resolver Agent</h4>
            <p className="text-sm text-gray-600">Detects and resolves merge conflicts</p>
          </div>
        </div>
      </div>

      {/* Human-in-the-Loop */}
      <div className="mb-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Human-in-the-Loop Control</h2>
        <p className="text-gray-600 mb-8">
          Maintain control with approval gates at critical decision points. Automation with oversight.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h4 className="font-semibold text-blue-900 mb-2">Review Before Merge</h4>
              <p className="text-sm text-blue-700">
                All automated changes require human approval before merging
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-blue-900 mb-2">Configurable Policies</h4>
              <p className="text-sm text-blue-700">
                Set approval requirements based on risk level and complexity
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-blue-900 mb-2">Audit Trail</h4>
              <p className="text-sm text-blue-700">
                Complete history of all agent actions and decisions
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Integration */}
      <div className="mb-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Seamless Integration</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-6 bg-white rounded-lg shadow-md border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">GitHub Integration</h3>
            <p className="text-gray-600 mb-4">
              Native GitHub App integration for seamless workflow automation.
            </p>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Webhook-driven real-time processing
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Fine-grained repository permissions
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                PR comments and status checks
              </li>
            </ul>
          </div>

          <div className="p-6 bg-white rounded-lg shadow-md border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">CLI Tool</h3>
            <p className="text-gray-600 mb-4">
              Powerful command-line interface for manual operations.
            </p>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Works with any Git repository
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Offline analysis capabilities
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                CI/CD pipeline integration
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center bg-gray-900 text-white rounded-lg p-12">
        <h2 className="text-3xl font-bold mb-4">Ready to accelerate your workflow?</h2>
        <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
          Get started with Git With Intent today. Free during beta.
        </p>
        <div className="flex justify-center space-x-4">
          <Link
            to="/install"
            className="bg-white text-gray-900 px-8 py-3 rounded-md font-medium hover:bg-gray-100"
          >
            Get Started
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
