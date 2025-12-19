/**
 * How It Works Page
 *
 * Explains the workflow and architecture of Git With Intent.
 */

import { Link } from 'react-router-dom';

export function HowItWorks() {
  return (
    <div className="max-w-6xl mx-auto py-12 px-4">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          How It Works
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Understand the multi-agent architecture and workflow automation behind Git With Intent
        </p>
      </div>

      {/* High-level Overview */}
      <div className="mb-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">The Workflow</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-blue-600">1</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Trigger</h3>
            <p className="text-gray-600">
              PR opened, issue created, or manual command via CLI or comment
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-purple-600">2</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Analysis</h3>
            <p className="text-gray-600">
              AI agents analyze code, context, and requirements
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-green-600">3</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Action</h3>
            <p className="text-gray-600">
              Generate plans, resolve conflicts, or create code changes
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-orange-600">4</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Review</h3>
            <p className="text-gray-600">
              Human approval before changes are committed
            </p>
          </div>
        </div>
      </div>

      {/* Multi-Agent System */}
      <div className="mb-20 bg-gray-50 rounded-lg p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Multi-Agent System</h2>
        <p className="text-gray-600 mb-8">
          Git With Intent uses specialized AI agents that work together, each handling specific tasks in your workflow.
        </p>

        <div className="space-y-8">
          <div className="bg-white rounded-lg p-6 border-l-4 border-blue-500">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Orchestrator Agent</h3>
                <p className="text-gray-600 mb-3">
                  Powered by <strong>Gemini Flash</strong>, the orchestrator coordinates the workflow, routing tasks to specialized agents and managing the overall execution pipeline.
                </p>
                <div className="bg-blue-50 p-3 rounded">
                  <p className="text-sm text-blue-900">
                    <strong>Key Tasks:</strong> Workflow coordination, agent routing, state management, error handling
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 border-l-4 border-purple-500">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Triage Agent</h3>
                <p className="text-gray-600 mb-3">
                  Powered by <strong>Gemini Flash</strong>, the triage agent analyzes PRs and issues to categorize complexity, identify risks, and prioritize work.
                </p>
                <div className="bg-purple-50 p-3 rounded">
                  <p className="text-sm text-purple-900">
                    <strong>Key Tasks:</strong> Complexity scoring, risk assessment, labeling, priority assignment
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 border-l-4 border-green-500">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Coder Agent</h3>
                <p className="text-gray-600 mb-3">
                  Powered by <strong>Claude Sonnet</strong>, the coder agent generates implementation plans and code changes from issue descriptions with deep contextual understanding.
                </p>
                <div className="bg-green-50 p-3 rounded">
                  <p className="text-sm text-green-900">
                    <strong>Key Tasks:</strong> Code generation, implementation planning, pattern matching, documentation
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 border-l-4 border-red-500">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Resolver Agent</h3>
                <p className="text-gray-600 mb-3">
                  Powered by <strong>Claude Sonnet/Opus</strong>, the resolver agent detects and resolves merge conflicts with semantic understanding of code intent.
                </p>
                <div className="bg-red-50 p-3 rounded">
                  <p className="text-sm text-red-900">
                    <strong>Key Tasks:</strong> Conflict detection, semantic analysis, resolution generation, validation
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 border-l-4 border-yellow-500">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Reviewer Agent</h3>
                <p className="text-gray-600 mb-3">
                  Powered by <strong>Claude Sonnet</strong>, the reviewer agent provides comprehensive code reviews with actionable feedback and security analysis.
                </p>
                <div className="bg-yellow-50 p-3 rounded">
                  <p className="text-sm text-yellow-900">
                    <strong>Key Tasks:</strong> Code review, best practice enforcement, security scanning, performance analysis
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Examples */}
      <div className="mb-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Example Workflows</h2>

        <div className="space-y-8">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">Scenario 1: Analyzing a Pull Request</h3>
            </div>
            <div className="p-6">
              <ol className="space-y-4">
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
                  <div>
                    <p className="text-gray-900 font-medium">Developer opens a PR or comments <code className="bg-gray-100 px-2 py-1 rounded">@git-with-intent triage</code></p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>
                  <div>
                    <p className="text-gray-900 font-medium">Orchestrator receives webhook and routes to Triage Agent</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>
                  <div>
                    <p className="text-gray-900 font-medium">Triage Agent analyzes files changed, dependencies, test coverage</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">4</span>
                  <div>
                    <p className="text-gray-900 font-medium">Agent posts summary comment with complexity score, risk level, and recommendations</p>
                  </div>
                </li>
              </ol>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">Scenario 2: Resolving Merge Conflicts</h3>
            </div>
            <div className="p-6">
              <ol className="space-y-4">
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
                  <div>
                    <p className="text-gray-900 font-medium">PR has merge conflicts, developer comments <code className="bg-gray-100 px-2 py-1 rounded">@git-with-intent resolve</code></p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>
                  <div>
                    <p className="text-gray-900 font-medium">Orchestrator routes to Resolver Agent with PR context</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>
                  <div>
                    <p className="text-gray-900 font-medium">Resolver analyzes both branches, understands code intent, generates resolution</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">4</span>
                  <div>
                    <p className="text-gray-900 font-medium">Agent creates new commit with resolved conflicts pending approval</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">5</span>
                  <div>
                    <p className="text-gray-900 font-medium">Developer reviews and approves/rejects the resolution</p>
                  </div>
                </li>
              </ol>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">Scenario 3: Issue to PR (Autopilot)</h3>
            </div>
            <div className="p-6">
              <ol className="space-y-4">
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
                  <div>
                    <p className="text-gray-900 font-medium">Developer runs <code className="bg-gray-100 px-2 py-1 rounded">gwi autopilot &lt;issue-url&gt;</code></p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>
                  <div>
                    <p className="text-gray-900 font-medium">Triage Agent analyzes issue and existing codebase</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>
                  <div>
                    <p className="text-gray-900 font-medium">Coder Agent generates implementation plan and code changes</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">4</span>
                  <div>
                    <p className="text-gray-900 font-medium">Reviewer Agent checks generated code for issues</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">5</span>
                  <div>
                    <p className="text-gray-900 font-medium">Creates PR with implementation, pending human review</p>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Technology Stack */}
      <div className="mb-20 bg-gray-50 rounded-lg p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Technology Stack</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-4">AI Models</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <strong>Claude Sonnet 4.5:</strong> Code generation, conflict resolution, reviews
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <strong>Claude Opus 4.5:</strong> Complex conflict resolution
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <strong>Gemini Flash 2.0:</strong> Fast triage and orchestration
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Infrastructure</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <strong>Cloud Run:</strong> Scalable serverless execution
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <strong>Firestore:</strong> Real-time state management
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <strong>GitHub Actions:</strong> CI/CD automation
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center bg-gray-900 text-white rounded-lg p-12">
        <h2 className="text-3xl font-bold mb-4">Ready to see it in action?</h2>
        <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
          Start automating your workflow today
        </p>
        <div className="flex justify-center space-x-4">
          <Link
            to="/install"
            className="bg-white text-gray-900 px-8 py-3 rounded-md font-medium hover:bg-gray-100"
          >
            Get Started
          </Link>
          <Link
            to="/features"
            className="border border-white text-white px-8 py-3 rounded-md font-medium hover:bg-gray-800"
          >
            View Features
          </Link>
        </div>
      </div>
    </div>
  );
}
