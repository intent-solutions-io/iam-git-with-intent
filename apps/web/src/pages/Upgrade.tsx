/**
 * Plan Upgrade Page
 *
 * Phase 28: Plan selection and Stripe checkout flow.
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { createCheckoutSession } from '../lib/api';

// Plan definitions matching @gwi/core metering DEFAULT_PLANS
const PLANS = [
  {
    id: 'free',
    name: 'Free',
    tier: 'free',
    price_usd: 0,
    token_limit: 50000,
    run_limit: 10,
    rate_limit_rpm: 10,
    features: ['Basic PR review', 'Limited triage', '50K tokens/month', '10 runs/month'],
    popular: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    tier: 'starter',
    price_usd: 29,
    token_limit: 500000,
    run_limit: 100,
    rate_limit_rpm: 30,
    features: [
      'Full PR review',
      'Triage + autopilot',
      '500K tokens/month',
      '100 runs/month',
      'Email support',
    ],
    popular: true,
  },
  {
    id: 'professional',
    name: 'Professional',
    tier: 'professional',
    price_usd: 99,
    token_limit: 2000000,
    run_limit: 500,
    rate_limit_rpm: 60,
    features: [
      'Everything in Starter',
      '2M tokens/month',
      '500 runs/month',
      'Custom policies',
      'Priority support',
      'Advanced analytics',
    ],
    popular: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tier: 'enterprise',
    price_usd: 499,
    token_limit: 10000000,
    run_limit: 2000,
    rate_limit_rpm: 120,
    features: [
      'Everything in Pro',
      '10M tokens/month',
      '2000 runs/month',
      'Custom integrations',
      'SLA guarantee',
      'Dedicated support',
      'Audit logs',
    ],
    popular: false,
  },
];

export function Upgrade() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentTenant, loading: tenantLoading } = useTenant();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for success/cancel from Stripe redirect
  const success = searchParams.get('success') === '1';
  const canceled = searchParams.get('canceled') === '1';

  useEffect(() => {
    // If success, redirect to usage after a delay
    if (success) {
      const timeout = setTimeout(() => {
        navigate('/usage');
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [success, navigate]);

  const handleUpgrade = async (planId: string) => {
    if (!currentTenant) return;
    if (planId === 'free') return; // Can't "upgrade" to free

    setLoading(true);
    setError(null);
    setSelectedPlan(planId);

    try {
      const { url } = await createCheckoutSession(currentTenant.id, planId, interval);
      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (err) {
      console.error('Failed to create checkout session:', err);
      setError('Failed to start checkout. Please try again.');
      setLoading(false);
    }
  };

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!currentTenant) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          No Organization Selected
        </h2>
        <p className="text-gray-600">
          Select an organization to upgrade your plan.
        </p>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Upgrade Successful!
        </h1>
        <p className="text-gray-600 mb-6">
          Your plan has been upgraded. Your new limits are now active.
        </p>
        <p className="text-sm text-gray-500">
          Redirecting to usage dashboard...
        </p>
      </div>
    );
  }

  // Canceled state
  if (canceled) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-yellow-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Checkout Canceled
        </h1>
        <p className="text-gray-600 mb-6">
          No worries! You can upgrade anytime when you're ready.
        </p>
        <button
          onClick={() => navigate('/upgrade')}
          className="bg-gray-900 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800"
        >
          View Plans
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Choose Your Plan
        </h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Scale your AI-powered PR automation with the plan that fits your needs.
          All plans include our core features with different usage limits.
        </p>
      </div>

      {error && (
        <div className="max-w-md mx-auto mb-6 p-3 rounded-md bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Billing interval toggle */}
      <div className="flex justify-center mb-8">
        <div className="bg-gray-100 p-1 rounded-lg inline-flex">
          <button
            onClick={() => setInterval('monthly')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              interval === 'monthly'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval('yearly')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              interval === 'yearly'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Yearly
            <span className="ml-1 text-green-600 text-xs">Save 17%</span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {PLANS.map((plan) => {
          const isCurrentPlan = currentTenant.plan.toLowerCase() === plan.tier;
          const yearlyPrice = Math.round(plan.price_usd * 10); // 2 months free
          const displayPrice = interval === 'yearly' ? yearlyPrice : plan.price_usd;
          const perMonth = interval === 'yearly' ? plan.price_usd * 10 / 12 : plan.price_usd;

          return (
            <div
              key={plan.id}
              className={`relative bg-white rounded-lg shadow-sm border-2 p-6 flex flex-col ${
                plan.popular
                  ? 'border-blue-500'
                  : isCurrentPlan
                  ? 'border-green-500'
                  : 'border-gray-200'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              {isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-green-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                    Current Plan
                  </span>
                </div>
              )}

              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {plan.name}
              </h3>

              <div className="mb-4">
                <span className="text-3xl font-bold text-gray-900">
                  ${displayPrice}
                </span>
                {plan.price_usd > 0 && (
                  <span className="text-gray-500">
                    /{interval === 'yearly' ? 'year' : 'month'}
                  </span>
                )}
                {interval === 'yearly' && plan.price_usd > 0 && (
                  <div className="text-sm text-gray-500">
                    ${perMonth.toFixed(0)}/month billed annually
                  </div>
                )}
              </div>

              <ul className="space-y-2 mb-6 flex-grow">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start text-sm text-gray-600">
                    <svg
                      className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isCurrentPlan || plan.id === 'free' || loading}
                className={`w-full py-2 px-4 rounded-md font-medium transition ${
                  isCurrentPlan
                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                    : plan.id === 'free'
                    ? 'bg-gray-100 text-gray-600 cursor-not-allowed'
                    : plan.popular
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                } ${loading && selectedPlan === plan.id ? 'opacity-50' : ''}`}
              >
                {loading && selectedPlan === plan.id ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin h-4 w-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Processing...
                  </span>
                ) : isCurrentPlan ? (
                  'Current Plan'
                ) : plan.id === 'free' ? (
                  'Free Forever'
                ) : (
                  'Upgrade'
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* FAQ / Trust signals */}
      <div className="mt-12 text-center text-gray-600">
        <p className="text-sm">
          All plans include SSL security, GitHub integration, and 24/7 monitoring.
          <br />
          Questions? Contact us at{' '}
          <a href="mailto:support@gitwithintent.com" className="text-blue-600 hover:underline">
            support@gitwithintent.com
          </a>
        </p>
      </div>
    </div>
  );
}
