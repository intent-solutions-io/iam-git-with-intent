/**
 * Security Page
 *
 * Security practices, permissions, and compliance information.
 */

import { Link } from 'react-router-dom';

export function Security() {
  return (
    <div className="max-w-6xl mx-auto py-12 px-4">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Security & Privacy
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Your code security and data privacy are our top priorities
        </p>
      </div>

      {/* Core Security Principles */}
      <div className="mb-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Our Security Principles</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-md">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">End-to-End Encryption</h3>
            <p className="text-gray-600">
              All data in transit is encrypted using TLS 1.3. Sensitive data at rest is encrypted using industry-standard AES-256.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-md">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Minimal Permissions</h3>
            <p className="text-gray-600">
              We request only the minimum GitHub permissions needed. You have full control over which repositories we can access.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-md">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Full Transparency</h3>
            <p className="text-gray-600">
              Complete audit logs of all agent actions. You can review what was accessed and when at any time.
            </p>
          </div>
        </div>
      </div>

      {/* GitHub Permissions */}
      <div className="mb-20 bg-gray-50 rounded-lg p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">GitHub App Permissions</h2>
        <p className="text-gray-600 mb-8">
          Our GitHub App requests the following permissions. We follow the principle of least privilege.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <span className="text-green-600 mr-2">✓</span>
              Read Permissions
            </h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <div>
                  <strong>Repository contents:</strong> To analyze code and understand context
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <div>
                  <strong>Issues:</strong> To read issue descriptions and requirements
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <div>
                  <strong>Pull requests:</strong> To analyze changes and detect conflicts
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <div>
                  <strong>Metadata:</strong> Basic repository information
                </div>
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <span className="text-blue-600 mr-2">✓</span>
              Write Permissions
            </h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <div>
                  <strong>Pull requests:</strong> To post comments and status checks
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <div>
                  <strong>Contents (optional):</strong> Only with approval, to create commits/branches
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <div>
                  <strong>Checks:</strong> To create status checks on PRs
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h4 className="font-semibold text-blue-900 mb-2">Repository Selection</h4>
          <p className="text-blue-800">
            You choose which repositories to grant access to. You can add or remove repositories at any time through your GitHub App settings.
          </p>
        </div>
      </div>

      {/* Data Handling */}
      <div className="mb-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Data Handling & Privacy</h2>

        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">What We Store</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <div>
                  <strong>Run metadata:</strong> Timestamps, status, agent actions taken
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <div>
                  <strong>Analysis results:</strong> Complexity scores, risk assessments, recommendations
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <div>
                  <strong>Configuration:</strong> Your approval policies, model preferences, team settings
                </div>
              </li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">What We Don't Store</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-red-500 mr-2">✗</span>
                <div>
                  <strong>Your source code:</strong> We analyze code in real-time but don't persist it
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-red-500 mr-2">✗</span>
                <div>
                  <strong>Secrets or credentials:</strong> These are never sent to our systems
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-red-500 mr-2">✗</span>
                <div>
                  <strong>Private repository content:</strong> Beyond what's needed for active analysis
                </div>
              </li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">AI Model Data Usage</h3>
            <p className="text-gray-600 mb-3">
              Code sent to AI models (Anthropic Claude, Google Gemini) for analysis:
            </p>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <div>
                  <strong>Not used for model training:</strong> We use enterprise API tiers that don't train on customer data
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <div>
                  <strong>Ephemeral processing:</strong> Data is processed in-memory and not persisted by the AI provider
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                <div>
                  <strong>You control the models:</strong> Choose which AI providers to use in your settings
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Human-in-the-Loop */}
      <div className="mb-20 bg-blue-50 border border-blue-200 rounded-lg p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Human-in-the-Loop Control</h2>
        <p className="text-gray-600 mb-6">
          Safety through approval gates and configurable policies.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Approval Requirements</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">✓</span>
                All code changes require human approval before merge
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">✓</span>
                Configurable risk thresholds for automatic vs manual review
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">✓</span>
                Team member approval for production repositories
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Audit & Compliance</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">✓</span>
                Complete audit trail of all agent actions
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">✓</span>
                Exportable logs for compliance requirements
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">✓</span>
                Role-based access control for team settings
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Best Practices */}
      <div className="mb-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Security Best Practices</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">For Teams</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Enable branch protection rules on main/production branches
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Require code owner approval for sensitive files
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Use separate GitHub Apps for dev/staging/prod environments
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Regularly review audit logs and agent activity
              </li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">For Individuals</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Use environment variables for API keys, never commit them
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Generate fine-grained GitHub tokens with minimal scopes
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Review all automated changes before merging
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Keep your GitHub App installation updated
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Compliance */}
      <div className="mb-20 bg-gray-50 rounded-lg p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Compliance & Certifications</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">SOC 2 Type II</h3>
            <p className="text-sm text-gray-600">
              (In Progress) Independent audit of security controls and practices
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">GDPR Compliant</h3>
            <p className="text-sm text-gray-600">
              Full compliance with EU data protection regulations
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Enterprise-Grade AI</h3>
            <p className="text-sm text-gray-600">
              Using Anthropic and Google's enterprise API tiers with enhanced privacy
            </p>
          </div>
        </div>
      </div>

      {/* Vulnerability Reporting */}
      <div className="mb-20 bg-yellow-50 border border-yellow-200 rounded-lg p-8">
        <h2 className="text-2xl font-bold text-yellow-900 mb-4">Security Vulnerability Reporting</h2>
        <p className="text-yellow-800 mb-4">
          Found a security issue? We take security seriously and appreciate responsible disclosure.
        </p>
        <div className="bg-white rounded-lg p-6">
          <p className="text-gray-900 mb-2">
            <strong>Email:</strong> <a href="mailto:security@gitwithintent.com" className="text-blue-600 hover:text-blue-700">security@gitwithintent.com</a>
          </p>
          <p className="text-gray-600 text-sm">
            Please do not open public GitHub issues for security vulnerabilities. We'll respond within 48 hours.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center bg-gray-900 text-white rounded-lg p-12">
        <h2 className="text-3xl font-bold mb-4">Questions about security?</h2>
        <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
          We're happy to answer any security or privacy questions
        </p>
        <div className="flex justify-center space-x-4">
          <a
            href="mailto:security@gitwithintent.com"
            className="bg-white text-gray-900 px-8 py-3 rounded-md font-medium hover:bg-gray-100"
          >
            Contact Security Team
          </a>
          <Link
            to="/install"
            className="border border-white text-white px-8 py-3 rounded-md font-medium hover:bg-gray-800"
          >
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
}
