/**
 * Documentation Page
 *
 * Product documentation and guides.
 */

import { Link } from 'react-router-dom';

export function Docs() {
  return (
    <div className="max-w-6xl mx-auto py-12 px-4">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Documentation
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Complete guides and API reference for Git With Intent
        </p>
      </div>

      {/* Quick Start */}
      <div className="mb-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Quick Start</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900">GitHub App Setup</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Install the GitHub App and configure automated workflows for your repositories.
            </p>
            <Link to="/install" className="text-blue-600 hover:text-blue-700 font-medium">
              Installation Guide →
            </Link>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900">CLI Installation</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Use the command-line tool for manual operations and CI/CD integration.
            </p>
            <div className="bg-gray-900 text-white p-3 rounded-md font-mono text-sm">
              npm install -g @gwi/cli
            </div>
          </div>
        </div>
      </div>

      {/* Core Concepts */}
      <div className="mb-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Core Concepts</h2>

        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Multi-Agent System</h3>
            <p className="text-gray-600 mb-4">
              Git With Intent uses specialized AI agents that work together:
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <div>
                  <strong>Orchestrator:</strong> Coordinates workflow and agent routing
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <div>
                  <strong>Triage Agent:</strong> Analyzes and categorizes PRs/issues
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <div>
                  <strong>Coder Agent:</strong> Generates code and implementation plans
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <div>
                  <strong>Resolver Agent:</strong> Detects and resolves merge conflicts
                </div>
              </li>
            </ul>
            <Link to="/how-it-works" className="text-blue-600 hover:text-blue-700 font-medium mt-4 inline-block">
              Learn more about our architecture →
            </Link>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Runs & Artifacts</h3>
            <p className="text-gray-600 mb-4">
              Every agent operation creates a run with complete audit trail:
            </p>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <strong>Run ID:</strong> Unique identifier for tracking
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <strong>Steps:</strong> Detailed log of each agent action
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <strong>Artifacts:</strong> Generated plans, resolutions, or reviews
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <strong>Metadata:</strong> Timing, model used, tokens consumed
              </li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Approval Gates</h3>
            <p className="text-gray-600 mb-4">
              Human-in-the-loop control ensures safety:
            </p>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-yellow-500 mr-2">⚠</span>
                All code changes require human approval before merge
              </li>
              <li className="flex items-start">
                <span className="text-yellow-500 mr-2">⚠</span>
                Configurable risk thresholds for different repositories
              </li>
              <li className="flex items-start">
                <span className="text-yellow-500 mr-2">⚠</span>
                Team member approval for production changes
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* CLI Commands */}
      <div className="mb-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">CLI Commands</h2>

        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 font-mono">gwi triage &lt;pr-url&gt;</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Analyze a pull request or issue to assess complexity, risk, and priority.
              </p>
              <div className="bg-gray-900 text-white p-4 rounded-md font-mono text-sm mb-4">
                gwi triage https://github.com/owner/repo/pull/123
              </div>
              <p className="text-sm text-gray-500">
                <strong>Output:</strong> Complexity score, risk assessment, file analysis, recommendations
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 font-mono">gwi plan &lt;issue-url&gt;</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Generate an implementation plan from an issue description.
              </p>
              <div className="bg-gray-900 text-white p-4 rounded-md font-mono text-sm mb-4">
                gwi plan https://github.com/owner/repo/issues/456
              </div>
              <p className="text-sm text-gray-500">
                <strong>Output:</strong> Step-by-step implementation plan, file changes needed, test requirements
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 font-mono">gwi resolve &lt;pr-url&gt;</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Detect and resolve merge conflicts in a pull request.
              </p>
              <div className="bg-gray-900 text-white p-4 rounded-md font-mono text-sm mb-4">
                gwi resolve https://github.com/owner/repo/pull/789
              </div>
              <p className="text-sm text-gray-500">
                <strong>Output:</strong> Conflict analysis, proposed resolutions, new commit with fixes
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 font-mono">gwi review &lt;pr-url&gt;</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Generate a comprehensive code review with actionable feedback.
              </p>
              <div className="bg-gray-900 text-white p-4 rounded-md font-mono text-sm mb-4">
                gwi review https://github.com/owner/repo/pull/123
              </div>
              <p className="text-sm text-gray-500">
                <strong>Output:</strong> Code quality analysis, security issues, performance suggestions, best practices
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 font-mono">gwi autopilot &lt;url&gt;</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Run the full pipeline: triage, plan, code generation, and review.
              </p>
              <div className="bg-gray-900 text-white p-4 rounded-md font-mono text-sm mb-4">
                gwi autopilot https://github.com/owner/repo/issues/456
              </div>
              <p className="text-sm text-gray-500">
                <strong>Output:</strong> Complete implementation from issue to PR, pending approval
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* GitHub App Commands */}
      <div className="mb-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">GitHub App Commands</h2>
        <p className="text-gray-600 mb-6">
          Trigger actions by commenting on PRs and issues:
        </p>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="space-y-4">
            <div className="flex items-start">
              <code className="bg-gray-100 px-3 py-1 rounded font-mono text-sm mr-4 flex-shrink-0">
                @git-with-intent triage
              </code>
              <p className="text-gray-600">
                Analyze the current PR/issue
              </p>
            </div>
            <div className="flex items-start">
              <code className="bg-gray-100 px-3 py-1 rounded font-mono text-sm mr-4 flex-shrink-0">
                @git-with-intent plan
              </code>
              <p className="text-gray-600">
                Generate implementation plan from issue
              </p>
            </div>
            <div className="flex items-start">
              <code className="bg-gray-100 px-3 py-1 rounded font-mono text-sm mr-4 flex-shrink-0">
                @git-with-intent resolve
              </code>
              <p className="text-gray-600">
                Resolve merge conflicts
              </p>
            </div>
            <div className="flex items-start">
              <code className="bg-gray-100 px-3 py-1 rounded font-mono text-sm mr-4 flex-shrink-0">
                @git-with-intent review
              </code>
              <p className="text-gray-600">
                Generate code review
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* API Reference */}
      <div className="mb-20 bg-gray-50 rounded-lg p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">API Reference</h2>
        <p className="text-gray-600 mb-6">
          For advanced integrations, use our REST API:
        </p>

        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Authentication</h3>
          <p className="text-gray-600 mb-3">
            Use your API key in the Authorization header:
          </p>
          <div className="bg-gray-900 text-white p-4 rounded-md font-mono text-sm">
            curl -H "Authorization: Bearer YOUR_API_KEY" \<br />
            &nbsp;&nbsp;https://api.gitwithintent.com/v1/runs
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Endpoints</h3>
          <ul className="space-y-2 text-gray-600">
            <li><code className="bg-gray-100 px-2 py-1 rounded">POST /v1/runs</code> - Create a new run</li>
            <li><code className="bg-gray-100 px-2 py-1 rounded">GET /v1/runs/:id</code> - Get run status</li>
            <li><code className="bg-gray-100 px-2 py-1 rounded">GET /v1/runs</code> - List all runs</li>
            <li><code className="bg-gray-100 px-2 py-1 rounded">POST /v1/triage</code> - Analyze PR/issue</li>
            <li><code className="bg-gray-100 px-2 py-1 rounded">POST /v1/resolve</code> - Resolve conflicts</li>
          </ul>
        </div>

        <p className="text-sm text-gray-500">
          Full API documentation coming soon. Contact us for early access.
        </p>
      </div>

      {/* Configuration */}
      <div className="mb-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Configuration</h2>

        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Environment Variables (CLI)</h3>
            <div className="bg-gray-900 text-white p-4 rounded-md font-mono text-sm space-y-2">
              <div className="text-gray-400"># Required (at least one AI provider)</div>
              <div>ANTHROPIC_API_KEY=sk-ant-...</div>
              <div>GOOGLE_AI_API_KEY=...</div>
              <div>GITHUB_TOKEN=ghp_...</div>
              <div className="text-gray-400 mt-4"># Optional</div>
              <div>GWI_STORE_BACKEND=firestore</div>
              <div>GCP_PROJECT_ID=your-project</div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Organization Settings (GitHub App)</h3>
            <p className="text-gray-600 mb-4">
              Configure through the web dashboard:
            </p>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                AI model preferences per repository
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                Approval policies and risk thresholds
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                Team member permissions and roles
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                Webhook configuration and triggers
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="mb-20 bg-yellow-50 border border-yellow-200 rounded-lg p-8">
        <h2 className="text-2xl font-bold text-yellow-900 mb-6">Troubleshooting</h2>

        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-yellow-900 mb-2">CLI Not Finding Git Repository</h3>
            <p className="text-yellow-800 text-sm">
              Ensure you're running the CLI from within a Git repository directory. Use <code className="bg-white px-2 py-1 rounded">git status</code> to verify.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-yellow-900 mb-2">GitHub App Not Responding</h3>
            <p className="text-yellow-800 text-sm">
              Check your repository permissions in GitHub App settings. The app needs read access to code and write access to pull requests.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-yellow-900 mb-2">API Rate Limits</h3>
            <p className="text-yellow-800 text-sm">
              GitHub and AI providers have rate limits. If you hit limits, wait a few minutes or upgrade your plan for higher limits.
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-yellow-300">
          <p className="text-yellow-900 font-medium mb-2">Need more help?</p>
          <p className="text-yellow-800 text-sm">
            Email <a href="mailto:support@gitwithintent.com" className="underline">support@gitwithintent.com</a> or join our community Discord
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center bg-gray-900 text-white rounded-lg p-12">
        <h2 className="text-3xl font-bold mb-4">Ready to dive in?</h2>
        <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
          Install Git With Intent and start automating your workflow
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
