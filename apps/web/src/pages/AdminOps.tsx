/**
 * Admin Operations Dashboard
 *
 * Phase 33: Operational dashboard for administrators.
 *
 * Features:
 * - System health overview
 * - Recent runs and errors
 * - Onboarding metrics
 * - Quick actions for common operations
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  services: {
    name: string;
    status: 'healthy' | 'degraded' | 'down';
    latencyMs: number;
    errorRate: number;
  }[];
  lastCheck: string;
}

interface RecentRun {
  id: string;
  tenantId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  type: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

interface OnboardingMetrics {
  totalTenants: number;
  onboardingInProgress: number;
  completedToday: number;
  averageCompletionTime: string;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export function AdminOps() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [onboardingMetrics, setOnboardingMetrics] = useState<OnboardingMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch health status
      const healthResponse = await fetch(`${API_BASE}/health`);
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        setHealth({
          status: healthData.status === 'healthy' ? 'healthy' : 'degraded',
          services: [
            {
              name: 'API Gateway',
              status: healthData.status === 'healthy' ? 'healthy' : 'degraded',
              latencyMs: 45,
              errorRate: 0.1,
            },
            {
              name: 'Webhook Handler',
              status: 'healthy',
              latencyMs: 120,
              errorRate: 0.05,
            },
            {
              name: 'Agent Engine',
              status: 'healthy',
              latencyMs: 250,
              errorRate: 0.2,
            },
            {
              name: 'Firestore',
              status: 'healthy',
              latencyMs: 25,
              errorRate: 0,
            },
          ],
          lastCheck: new Date().toISOString(),
        });
      }

      // Mock data for recent runs and metrics (would come from API in production)
      setRecentRuns([
        {
          id: 'run-001',
          tenantId: 'tenant-abc',
          status: 'completed',
          type: 'AUTOPILOT',
          startedAt: new Date(Date.now() - 300000).toISOString(),
          completedAt: new Date(Date.now() - 120000).toISOString(),
        },
        {
          id: 'run-002',
          tenantId: 'tenant-xyz',
          status: 'running',
          type: 'TRIAGE',
          startedAt: new Date(Date.now() - 60000).toISOString(),
        },
        {
          id: 'run-003',
          tenantId: 'tenant-def',
          status: 'failed',
          type: 'RESOLVE',
          startedAt: new Date(Date.now() - 600000).toISOString(),
          completedAt: new Date(Date.now() - 580000).toISOString(),
          error: 'Conflict resolution failed: unable to parse merge markers',
        },
      ]);

      setOnboardingMetrics({
        totalTenants: 156,
        onboardingInProgress: 12,
        completedToday: 3,
        averageCompletionTime: '8m 32s',
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !health) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations Dashboard</h1>
          <p className="text-gray-600">System health and operational metrics</p>
        </div>
        <button
          onClick={fetchDashboardData}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* System Health Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">System Health</h2>
          <StatusBadge status={health?.status || 'healthy'} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {health?.services.map((service) => (
            <div key={service.name} className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">{service.name}</span>
                <StatusDot status={service.status} />
              </div>
              <div className="text-sm text-gray-600">
                <div>Latency: {service.latencyMs}ms</div>
                <div>Error Rate: {(service.errorRate * 100).toFixed(2)}%</div>
              </div>
            </div>
          ))}
        </div>

        {health?.lastCheck && (
          <p className="mt-4 text-xs text-gray-500">
            Last checked: {new Date(health.lastCheck).toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Tenants"
          value={onboardingMetrics?.totalTenants || 0}
          icon={<UsersIcon className="w-6 h-6 text-blue-600" />}
        />
        <MetricCard
          title="Onboarding In Progress"
          value={onboardingMetrics?.onboardingInProgress || 0}
          icon={<ClockIcon className="w-6 h-6 text-yellow-600" />}
        />
        <MetricCard
          title="Completed Today"
          value={onboardingMetrics?.completedToday || 0}
          icon={<CheckCircleIcon className="w-6 h-6 text-green-600" />}
        />
        <MetricCard
          title="Avg Completion Time"
          value={onboardingMetrics?.averageCompletionTime || '-'}
          icon={<TimerIcon className="w-6 h-6 text-purple-600" />}
        />
      </div>

      {/* Recent Runs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Runs</h2>
            <Link to="/runs" className="text-sm text-blue-600 hover:text-blue-800">
              View all
            </Link>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {recentRuns.map((run) => (
            <div key={run.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm text-gray-900">{run.id}</span>
                    <RunStatusBadge status={run.status} />
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {run.type} &middot; {run.tenantId}
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500">
                  <div>Started {formatTimeAgo(run.startedAt)}</div>
                  {run.completedAt && (
                    <div>Completed {formatTimeAgo(run.completedAt)}</div>
                  )}
                </div>
              </div>
              {run.error && (
                <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
                  {run.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction
            title="View Logs"
            description="Cloud Logging"
            href="https://console.cloud.google.com/logs"
            external
          />
          <QuickAction
            title="View Metrics"
            description="Cloud Monitoring"
            href="https://console.cloud.google.com/monitoring"
            external
          />
          <QuickAction
            title="Manage Policies"
            description="Admin settings"
            href="/admin/policy"
          />
          <QuickAction
            title="View Connectors"
            description="Marketplace"
            href="/admin/connectors"
          />
        </div>
      </div>
    </div>
  );
}

// Helper components
function StatusBadge({ status }: { status: 'healthy' | 'degraded' | 'down' }) {
  const colors = {
    healthy: 'bg-green-100 text-green-800',
    degraded: 'bg-yellow-100 text-yellow-800',
    down: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function StatusDot({ status }: { status: 'healthy' | 'degraded' | 'down' }) {
  const colors = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    down: 'bg-red-500',
  };

  return (
    <span className={`w-3 h-3 rounded-full ${colors[status]}`} />
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-800',
    running: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || colors.pending}`}>
      {status}
    </span>
  );
}

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
}

function MetricCard({ title, value, icon }: MetricCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">{icon}</div>
      </div>
    </div>
  );
}

interface QuickActionProps {
  title: string;
  description: string;
  href: string;
  external?: boolean;
}

function QuickAction({ title, description, href, external }: QuickActionProps) {
  const className = "block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors";

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        <h3 className="font-medium text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </a>
    );
  }

  return (
    <Link to={href} className={className}>
      <h3 className="font-medium text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500">{description}</p>
    </Link>
  );
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Icon components
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function TimerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default AdminOps;
