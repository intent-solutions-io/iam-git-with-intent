/**
 * Install/Getting Started Page
 *
 * Installation instructions and onboarding guide.
 */

import { Link } from 'react-router-dom';

export function Install() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Getting Started
        </h1>
        <p className="text-xl text-gray-600">
          Install Git With Intent in minutes and start automating your workflow
        </p>
      </div>

      {/* Installation Methods */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">Choose Your Installation Method</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <div className="border border-gray-200 rounded-lg p-8 bg-white shadow-md">
            <h3 className="text-2xl font-semibold text-gray-900 mb-4">GitHub App (Recommended)</h3>
            <p className="text-gray-600 mb-6">
              Best for teams and automated workflows. Integrates directly with your GitHub repositories.
            </p>
            <a
              href="https://github.com/apps/git-with-intent"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-gray-900 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800"
            >
              Install GitHub App
            </a>
          </div>

          <div className="border border-gray-200 rounded-lg p-8 bg-white shadow-md">
            <h3 className="text-2xl font-semibold text-gray-900 mb-4">CLI Tool</h3>
            <p className="text-gray-600 mb-6">
              Perfect for individual developers and manual workflows. Works with any Git repository.
            </p>
            <div className="bg-gray-900 text-white p-4 rounded-md font-mono text-sm mb-4">
              npm install -g @gwi/cli
            </div>
            <p className="text-sm text-gray-500">Or use npx: npx @gwi/cli</p>
          </div>
        </div>
      </div>

      {/* GitHub App Setup */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">GitHub App Setup</h2>

        <div className="space-y-6">
          <div className="flex items-start">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-4">
              1
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Install the GitHub App</h3>
              <p className="text-gray-600 mb-3">
                Click the "Install GitHub App" button above and select the repositories you want to enable.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <strong>Permissions Required:</strong> The app needs read access to your code and issues,
                  and write access to pull requests for posting comments and creating branches.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-4">
              2
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Create Your Account</h3>
              <p className="text-gray-600 mb-3">
                After installation, you'll be redirected to create your Git With Intent account.
                Sign in with your GitHub account to link them.
              </p>
              <Link
                to="/login"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Sign in now →
              </Link>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-4">
              3
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Configure Your Organization</h3>
              <p className="text-gray-600 mb-3">
                Complete the onboarding wizard to set up:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li>AI model preferences (Claude Sonnet, Gemini Flash, etc.)</li>
                <li>Approval policies for automated changes</li>
                <li>Team members and permissions</li>
                <li>Repository-specific settings</li>
              </ul>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-4">
              4
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Start Using Git With Intent</h3>
              <p className="text-gray-600 mb-3">
                The app will automatically monitor your PRs and issues. You can also trigger actions manually:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li>Comment <code className="bg-gray-100 px-2 py-1 rounded">@git-with-intent triage</code> on a PR</li>
                <li>Comment <code className="bg-gray-100 px-2 py-1 rounded">@git-with-intent resolve</code> to fix conflicts</li>
                <li>Comment <code className="bg-gray-100 px-2 py-1 rounded">@git-with-intent review</code> for a code review</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* CLI Setup */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">CLI Tool Setup</h2>

        <div className="space-y-6">
          <div className="flex items-start">
            <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold mr-4">
              1
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Install the CLI</h3>
              <div className="bg-gray-900 text-white p-4 rounded-md font-mono text-sm mb-3">
                npm install -g @gwi/cli
              </div>
              <p className="text-gray-600">
                Or use npx without installation: <code className="bg-gray-100 px-2 py-1 rounded">npx @gwi/cli</code>
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold mr-4">
              2
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Set Up API Keys</h3>
              <p className="text-gray-600 mb-3">
                Configure your AI provider API keys (at least one required):
              </p>
              <div className="bg-gray-900 text-white p-4 rounded-md font-mono text-sm space-y-2">
                <div>export ANTHROPIC_API_KEY=sk-ant-...</div>
                <div>export GOOGLE_AI_API_KEY=...</div>
                <div>export GITHUB_TOKEN=ghp_...</div>
              </div>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold mr-4">
              3
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Run CLI Commands</h3>
              <p className="text-gray-600 mb-3">
                Navigate to your Git repository and use gwi commands:
              </p>
              <div className="bg-gray-900 text-white p-4 rounded-md font-mono text-sm space-y-2">
                <div className="text-gray-400"># Analyze a PR</div>
                <div>gwi triage https://github.com/owner/repo/pull/123</div>
                <div className="text-gray-400 mt-3"># Generate implementation plan</div>
                <div>gwi plan https://github.com/owner/repo/issues/456</div>
                <div className="text-gray-400 mt-3"># Resolve merge conflicts</div>
                <div>gwi resolve https://github.com/owner/repo/pull/789</div>
                <div className="text-gray-400 mt-3"># Full autopilot</div>
                <div>gwi autopilot https://github.com/owner/repo/pull/123</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Security Notice */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-16">
        <h3 className="text-lg font-semibold text-yellow-900 mb-2">Security Best Practices</h3>
        <ul className="space-y-2 text-yellow-800">
          <li className="flex items-start">
            <span className="text-yellow-600 mr-2">•</span>
            Store API keys in environment variables, never commit them to your repository
          </li>
          <li className="flex items-start">
            <span className="text-yellow-600 mr-2">•</span>
            Use GitHub's fine-grained personal access tokens with minimal required permissions
          </li>
          <li className="flex items-start">
            <span className="text-yellow-600 mr-2">•</span>
            Review all automated changes before merging
          </li>
          <li className="flex items-start">
            <span className="text-yellow-600 mr-2">•</span>
            Enable approval policies for production repositories
          </li>
        </ul>
      </div>

      {/* Next Steps */}
      <div className="bg-gray-50 rounded-lg p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">What's Next?</h2>
        <p className="text-gray-600 mb-6">
          Explore our documentation and learn how to get the most out of Git With Intent
        </p>
        <div className="flex justify-center space-x-4">
          <Link
            to="/docs"
            className="bg-gray-900 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800"
          >
            Read Documentation
          </Link>
          <Link
            to="/how-it-works"
            className="border border-gray-300 text-gray-700 px-6 py-3 rounded-md font-medium hover:bg-gray-50"
          >
            How It Works
          </Link>
        </div>
      </div>
    </div>
  );
}
