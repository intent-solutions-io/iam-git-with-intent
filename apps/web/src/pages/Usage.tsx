/**
 * Usage & Billing Dashboard
 *
 * Phase 28: Tenant admin view for usage metrics, plan limits, and billing.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import {
  getUsage,
  listInvoices,
  createBillingPortalSession,
  type UsageResponse,
  type Invoice,
} from '../lib/api';

export function Usage() {
  const { currentTenant, loading: tenantLoading } = useTenant();
  const [usageData, setUsageData] = useState<UsageResponse | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!currentTenant) return;

      setLoading(true);
      setError(null);

      try {
        const [usageRes, invoicesRes] = await Promise.all([
          getUsage(currentTenant.id).catch(() => null),
          listInvoices(currentTenant.id).catch(() => ({ invoices: [] })),
        ]);

        setUsageData(usageRes);
        setInvoices(invoicesRes.invoices || []);
      } catch (err) {
        console.error('Failed to fetch usage data:', err);
        setError('Failed to load usage data. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [currentTenant]);

  const handleManageBilling = async () => {
    if (!currentTenant) return;

    try {
      const { url } = await createBillingPortalSession(currentTenant.id);
      window.location.href = url;
    } catch (err) {
      console.error('Failed to open billing portal:', err);
      setError('Failed to open billing portal. Please try again.');
    }
  };

  if (tenantLoading || loading) {
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
          Select an organization to view usage.
        </p>
      </div>
    );
  }

  // Mock data for when API is not available
  const mockStatus = usageData?.status || {
    plan: {
      id: 'free',
      name: 'Free',
      tier: 'free',
      price_usd: 0,
      token_limit: 50000,
      run_limit: 10,
      rate_limit_rpm: 10,
      features: ['Basic PR review', 'Limited triage'],
    },
    token_usage_percent: 0,
    run_usage_percent: 0,
    soft_limit_reached: false,
    hard_limit_reached: false,
    tokens_remaining: 50000,
    runs_remaining: 10,
    period_resets_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const mockAggregate = usageData?.aggregate || {
    tenant_id: currentTenant.id,
    period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    period_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString(),
    total_runs: 0,
    total_llm_calls: 0,
    total_tokens: { input: 0, output: 0, total: 0 },
    total_latency_ms: 0,
    total_cost_usd: 0,
    by_provider: {},
    by_model: {},
    updated_at: new Date().toISOString(),
  };

  return (
    <div className="max-w-6xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usage & Billing</h1>
          <p className="text-gray-600">Monitor your usage and manage your subscription</p>
        </div>
        <button
          onClick={handleManageBilling}
          className="bg-gray-900 text-white px-4 py-2 rounded-md font-medium hover:bg-gray-800"
        >
          Manage Billing
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Plan Info Card */}
      <PlanInfoCard status={mockStatus} />

      {/* Usage Summary */}
      <UsageSummaryCard aggregate={mockAggregate} status={mockStatus} />

      {/* Usage by Provider/Model */}
      <UsageBreakdown aggregate={mockAggregate} />

      {/* Invoice History */}
      <InvoiceHistoryTable invoices={invoices} />
    </div>
  );
}

// =============================================================================
// Plan Info Card
// =============================================================================

function PlanInfoCard({ status }: { status: NonNullable<UsageResponse['status']> }) {
  const { plan, token_usage_percent, run_usage_percent, period_resets_at } = status;
  const resetDate = new Date(period_resets_at);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{plan.name} Plan</h2>
          <p className="text-gray-600">
            {plan.price_usd === 0 ? 'Free' : `$${plan.price_usd}/month`}
          </p>
        </div>
        <Link
          to="/upgrade"
          className="text-sm text-blue-600 hover:underline"
        >
          Upgrade Plan
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Token Usage */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600">Tokens</span>
            <span className="text-gray-900">
              {formatNumber(plan.token_limit - status.tokens_remaining)} / {formatNumber(plan.token_limit)}
            </span>
          </div>
          <UsageBar percent={token_usage_percent} />
        </div>

        {/* Run Usage */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600">Runs</span>
            <span className="text-gray-900">
              {plan.run_limit - status.runs_remaining} / {plan.run_limit}
            </span>
          </div>
          <UsageBar percent={run_usage_percent} />
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Usage resets on {resetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </p>

      {status.soft_limit_reached && !status.hard_limit_reached && (
        <div className="mt-4 p-3 bg-yellow-50 text-yellow-800 rounded-md text-sm">
          You're approaching your plan limits. Consider upgrading to avoid interruptions.
        </div>
      )}

      {status.hard_limit_reached && (
        <div className="mt-4 p-3 bg-red-50 text-red-800 rounded-md text-sm">
          You've reached your plan limits. Upgrade now to continue using Git With Intent.
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Usage Summary Card
// =============================================================================

function UsageSummaryCard({
  aggregate,
  status,
}: {
  aggregate: NonNullable<UsageResponse['aggregate']>;
  status: NonNullable<UsageResponse['status']>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <StatCard
        title="Total Runs"
        value={aggregate.total_runs.toString()}
        subtitle={`of ${status.plan.run_limit} limit`}
      />
      <StatCard
        title="LLM Calls"
        value={aggregate.total_llm_calls.toString()}
        subtitle="this period"
      />
      <StatCard
        title="Tokens Used"
        value={formatNumber(aggregate.total_tokens.total)}
        subtitle={`of ${formatNumber(status.plan.token_limit)}`}
      />
      <StatCard
        title="Est. Cost"
        value={`$${aggregate.total_cost_usd.toFixed(2)}`}
        subtitle="this period"
      />
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <p className="text-sm text-gray-600">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}

// =============================================================================
// Usage Breakdown
// =============================================================================

function UsageBreakdown({ aggregate }: { aggregate: NonNullable<UsageResponse['aggregate']> }) {
  const providerEntries = Object.entries(aggregate.by_provider);
  const modelEntries = Object.entries(aggregate.by_model);

  if (providerEntries.length === 0 && modelEntries.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      {/* By Provider */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">By Provider</h3>
        {providerEntries.length === 0 ? (
          <p className="text-gray-500 text-sm">No usage data yet</p>
        ) : (
          <div className="space-y-3">
            {providerEntries.map(([provider, data]) => (
              <div key={provider} className="flex justify-between items-center">
                <span className="text-gray-700 capitalize">{provider}</span>
                <div className="text-right">
                  <span className="text-gray-900 font-medium">{data.calls} calls</span>
                  <span className="text-gray-500 text-sm ml-2">
                    ({formatNumber(data.tokens)} tokens)
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* By Model */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">By Model</h3>
        {modelEntries.length === 0 ? (
          <p className="text-gray-500 text-sm">No usage data yet</p>
        ) : (
          <div className="space-y-3">
            {modelEntries.map(([model, data]) => (
              <div key={model} className="flex justify-between items-center">
                <span className="text-gray-700 font-mono text-sm">{model}</span>
                <div className="text-right">
                  <span className="text-gray-900 font-medium">{data.calls} calls</span>
                  <span className="text-gray-500 text-sm ml-2">
                    ${data.cost_usd.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Invoice History Table
// =============================================================================

function InvoiceHistoryTable({ invoices }: { invoices: Invoice[] }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoice History</h3>

      {invoices.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-4">
          No invoices yet. Invoices will appear here once you upgrade to a paid plan.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {invoice.number}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${(invoice.totalInCents / 100).toFixed(2)} {invoice.currency.toUpperCase()}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <InvoiceStatusBadge status={invoice.status} />
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm">
                    {invoice.hostedInvoiceUrl && (
                      <a
                        href={invoice.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        View
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const statusStyles: Record<string, string> = {
    paid: 'bg-green-100 text-green-800',
    open: 'bg-yellow-100 text-yellow-800',
    draft: 'bg-gray-100 text-gray-800',
    void: 'bg-gray-100 text-gray-500',
    uncollectible: 'bg-red-100 text-red-800',
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${
        statusStyles[status] || 'bg-gray-100 text-gray-800'
      }`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

function UsageBar({ percent }: { percent: number }) {
  const color =
    percent >= 100 ? 'bg-red-500' :
    percent >= 80 ? 'bg-yellow-500' :
    'bg-blue-500';

  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className={`${color} h-2 rounded-full transition-all duration-300`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
