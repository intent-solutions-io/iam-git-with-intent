/**
 * Pricing Page
 *
 * Pricing tiers and plan information.
 */

import { Link } from 'react-router-dom';

export function Pricing() {
  return (
    <div className="max-w-6xl mx-auto py-12 px-4">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Pricing
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Simple, transparent pricing. Free during beta.
        </p>
      </div>

      {/* Beta Notice */}
      <div className="mb-16 bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-blue-900 mb-3">Free During Beta</h2>
        <p className="text-blue-800 max-w-2xl mx-auto">
          Git With Intent is currently in beta. All features are available for free while we refine the product based on your feedback.
          Early adopters will receive special pricing when we launch.
        </p>
      </div>

      {/* Planned Pricing Tiers */}
      <div className="mb-16">
        <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">Planned Pricing Tiers</h2>
        <p className="text-gray-600 mb-12 text-center max-w-2xl mx-auto">
          These are our planned pricing tiers after the beta period ends. Prices and features may change.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Individual */}
          <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-md">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Individual</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-gray-900">Free</span>
              <span className="text-gray-600 ml-2">forever</span>
            </div>
            <p className="text-gray-600 mb-6">
              Perfect for individual developers and side projects
            </p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">Up to 5 repositories</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">100 AI operations/month</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">CLI tool access</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">GitHub App integration</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">Community support</span>
              </li>
            </ul>
            <Link
              to="/install"
              className="block w-full text-center bg-gray-100 text-gray-900 px-6 py-3 rounded-md font-medium hover:bg-gray-200"
            >
              Get Started Free
            </Link>
          </div>

          {/* Team */}
          <div className="bg-white border-2 border-blue-600 rounded-lg p-8 shadow-lg relative">
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                Most Popular
              </span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Team</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-gray-900">$29</span>
              <span className="text-gray-600 ml-2">/user/month</span>
            </div>
            <p className="text-gray-600 mb-6">
              For small to medium teams collaborating on multiple projects
            </p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">Unlimited repositories</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">1,000 AI operations/user/month</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">All Individual features</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">Team collaboration features</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">Priority support</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">Audit logs</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">Custom approval policies</span>
              </li>
            </ul>
            <Link
              to="/install"
              className="block w-full text-center bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700"
            >
              Start Free Trial
            </Link>
          </div>

          {/* Enterprise */}
          <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-md">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Enterprise</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-gray-900">Custom</span>
            </div>
            <p className="text-gray-600 mb-6">
              For large organizations with advanced security and compliance needs
            </p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">Unlimited everything</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">All Team features</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">Dedicated support</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">SLA guarantees</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">SOC 2 compliance</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">Custom integrations</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span className="text-gray-600">On-premise deployment option</span>
              </li>
            </ul>
            <a
              href="mailto:sales@gitwithintent.com"
              className="block w-full text-center bg-gray-100 text-gray-900 px-6 py-3 rounded-md font-medium hover:bg-gray-200"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </div>

      {/* Usage-Based Pricing */}
      <div className="mb-16 bg-gray-50 rounded-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Usage-Based Add-Ons</h2>
        <p className="text-gray-600 mb-6">
          Need more AI operations? Add-on packs available for all paid tiers.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Starter Pack</h3>
            <p className="text-3xl font-bold text-gray-900 mb-2">$10</p>
            <p className="text-gray-600">500 additional AI operations</p>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Pro Pack</h3>
            <p className="text-3xl font-bold text-gray-900 mb-2">$50</p>
            <p className="text-gray-600">3,000 additional AI operations</p>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Enterprise Pack</h3>
            <p className="text-3xl font-bold text-gray-900 mb-2">Custom</p>
            <p className="text-gray-600">Unlimited operations with volume discounts</p>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="mb-16">
        <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Frequently Asked Questions</h2>

        <div className="space-y-6 max-w-3xl mx-auto">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">What counts as an AI operation?</h3>
            <p className="text-gray-600">
              An AI operation is any action that uses our AI agents: PR triage, code generation, conflict resolution, or code review.
              Simple webhook processing and dashboard access don't count.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Can I upgrade or downgrade anytime?</h3>
            <p className="text-gray-600">
              Yes! You can change your plan at any time. Upgrades take effect immediately, and downgrades take effect at the end of your billing period.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">What happens if I exceed my AI operation limit?</h3>
            <p className="text-gray-600">
              You'll receive a notification when you're approaching your limit. Operations will pause until you purchase an add-on pack or upgrade your plan.
              We'll never charge you without explicit approval.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Do you offer annual billing?</h3>
            <p className="text-gray-600">
              Yes! Annual plans receive a 20% discount. Contact us for details on annual billing for Team and Enterprise plans.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">What AI models do you use?</h3>
            <p className="text-gray-600">
              We use Anthropic's Claude (Sonnet/Opus) for code generation and complex reasoning, and Google's Gemini Flash for fast triage and orchestration.
              You can configure model preferences in your settings.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Can I use my own AI API keys?</h3>
            <p className="text-gray-600">
              Yes! The CLI tool supports using your own Anthropic or Google AI API keys. This doesn't count against your operation limits.
            </p>
          </div>
        </div>
      </div>

      {/* Early Adopter Benefit */}
      <div className="mb-16 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg p-12 text-center">
        <h2 className="text-3xl font-bold mb-4">Early Adopter Benefits</h2>
        <p className="text-xl mb-8 max-w-2xl mx-auto">
          Sign up during beta and receive:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-8">
          <div>
            <div className="text-4xl font-bold mb-2">50%</div>
            <div className="text-white/90">off first year on any paid plan</div>
          </div>
          <div>
            <div className="text-4xl font-bold mb-2">2x</div>
            <div className="text-white/90">AI operation limits forever</div>
          </div>
          <div>
            <div className="text-4xl font-bold mb-2">Free</div>
            <div className="text-white/90">priority support during beta</div>
          </div>
        </div>
        <Link
          to="/install"
          className="inline-block bg-white text-blue-600 px-8 py-3 rounded-md font-medium hover:bg-gray-100"
        >
          Get Early Adopter Benefits
        </Link>
      </div>

      {/* CTA */}
      <div className="text-center bg-gray-900 text-white rounded-lg p-12">
        <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
        <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
          Start using Git With Intent today. Free during beta.
        </p>
        <div className="flex justify-center space-x-4">
          <Link
            to="/install"
            className="bg-white text-gray-900 px-8 py-3 rounded-md font-medium hover:bg-gray-100"
          >
            Get Started Free
          </Link>
          <a
            href="mailto:sales@gitwithintent.com"
            className="border border-white text-white px-8 py-3 rounded-md font-medium hover:bg-gray-800"
          >
            Contact Sales
          </a>
        </div>
      </div>
    </div>
  );
}
