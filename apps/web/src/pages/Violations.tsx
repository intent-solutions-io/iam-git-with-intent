/**
 * Violations Page
 *
 * List of policy violations with filters and trend visualization.
 * Part of Epic D: Policy & Audit - D5.5: Create violation dashboard
 */

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTenant } from '../hooks/useTenant';

// =============================================================================
// Types
// =============================================================================

type ViolationType = 'policy-denied' | 'approval-bypassed' | 'limit-exceeded' | 'anomaly-detected';
type ViolationSeverity = 'low' | 'medium' | 'high' | 'critical';
type ViolationStatus = 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'dismissed' | 'escalated';

interface Violation {
  id: string;
  tenantId: string;
  type: ViolationType;
  severity: ViolationSeverity;
  status: ViolationStatus;
  source: string;
  actor: {
    type: string;
    id: string;
    name?: string;
  };
  resource: {
    type: string;
    id: string;
    name?: string;
  };
  action: {
    type: string;
    description?: string;
  };
  summary: string;
  detectedAt: Date;
}

interface Filters {
  type: ViolationType | 'all';
  severity: ViolationSeverity | 'all';
  status: ViolationStatus | 'all';
  timeRange: '1h' | '24h' | '7d' | '30d' | 'all';
}

// =============================================================================
// Constants
// =============================================================================

const VIOLATION_TYPES: { value: ViolationType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'policy-denied', label: 'Policy Denied' },
  { value: 'approval-bypassed', label: 'Approval Bypassed' },
  { value: 'limit-exceeded', label: 'Limit Exceeded' },
  { value: 'anomaly-detected', label: 'Anomaly Detected' },
];

const SEVERITIES: { value: ViolationSeverity | 'all'; label: string }[] = [
  { value: 'all', label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const STATUSES: { value: ViolationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];

const TIME_RANGES: { value: Filters['timeRange']; label: string }[] = [
  { value: '1h', label: 'Last Hour' },
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'all', label: 'All Time' },
];

const SEVERITY_COLORS: Record<ViolationSeverity, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-green-100 text-green-800 border-green-200',
};

const STATUS_COLORS: Record<ViolationStatus, string> = {
  open: 'bg-blue-100 text-blue-800',
  acknowledged: 'bg-purple-100 text-purple-800',
  investigating: 'bg-indigo-100 text-indigo-800',
  escalated: 'bg-red-100 text-red-800',
  resolved: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-800',
};

const TYPE_LABELS: Record<ViolationType, string> = {
  'policy-denied': 'Policy Denied',
  'approval-bypassed': 'Approval Bypassed',
  'limit-exceeded': 'Limit Exceeded',
  'anomaly-detected': 'Anomaly Detected',
};

// =============================================================================
// Helper Functions
// =============================================================================

function getTimeRangeStart(range: Filters['timeRange']): Date | null {
  const now = new Date();
  switch (range) {
    case '1h':
      return new Date(now.getTime() - 60 * 60 * 1000);
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'all':
    default:
      return null;
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// =============================================================================
// Component
// =============================================================================

export function Violations() {
  const { currentTenant, loading: tenantLoading } = useTenant();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    type: 'all',
    severity: 'all',
    status: 'all',
    timeRange: '24h',
  });

  // Fetch violations from Firestore
  useEffect(() => {
    if (!currentTenant) {
      setViolations([]);
      setLoading(false);
      return;
    }

    const violationsQuery = query(
      collection(db, 'gwi_violations'),
      where('tenantId', '==', currentTenant.id),
      orderBy('detectedAt', 'desc'),
      limit(200)
    );

    const unsubscribe = onSnapshot(
      violationsQuery,
      (snapshot) => {
        const fetched = snapshot.docs.map((doc) => {
          const data = doc.data() as Record<string, unknown>;
          return {
            id: doc.id,
            ...data,
            detectedAt: data.detectedAt instanceof Timestamp
              ? data.detectedAt.toDate()
              : new Date(data.detectedAt as string),
          } as Violation;
        });
        setViolations(fetched);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching violations:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentTenant]);

  // Apply client-side filters
  const filteredViolations = useMemo(() => {
    let result = violations;

    if (filters.type !== 'all') {
      result = result.filter((v) => v.type === filters.type);
    }
    if (filters.severity !== 'all') {
      result = result.filter((v) => v.severity === filters.severity);
    }
    if (filters.status !== 'all') {
      result = result.filter((v) => v.status === filters.status);
    }
    if (filters.timeRange !== 'all') {
      const startTime = getTimeRangeStart(filters.timeRange);
      if (startTime) {
        result = result.filter((v) => v.detectedAt >= startTime);
      }
    }

    return result;
  }, [violations, filters]);

  // Calculate stats
  const stats = useMemo(() => {
    const critical = filteredViolations.filter((v) => v.severity === 'critical').length;
    const high = filteredViolations.filter((v) => v.severity === 'high').length;
    const open = filteredViolations.filter((v) => v.status === 'open').length;
    const escalated = filteredViolations.filter((v) => v.status === 'escalated').length;
    return { total: filteredViolations.length, critical, high, open, escalated };
  }, [filteredViolations]);

  // Loading state
  if (tenantLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  // No tenant selected
  if (!currentTenant) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          No Organization Selected
        </h2>
        <p className="text-gray-600">
          Select an organization to view violations.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Violations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Security violations and policy breaches
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-500">Total</div>
        </div>
        <div className="bg-white rounded-lg border border-red-200 p-4">
          <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
          <div className="text-sm text-gray-500">Critical</div>
        </div>
        <div className="bg-white rounded-lg border border-orange-200 p-4">
          <div className="text-2xl font-bold text-orange-600">{stats.high}</div>
          <div className="text-sm text-gray-500">High</div>
        </div>
        <div className="bg-white rounded-lg border border-blue-200 p-4">
          <div className="text-2xl font-bold text-blue-600">{stats.open}</div>
          <div className="text-sm text-gray-500">Open</div>
        </div>
        <div className="bg-white rounded-lg border border-purple-200 p-4">
          <div className="text-2xl font-bold text-purple-600">{stats.escalated}</div>
          <div className="text-sm text-gray-500">Escalated</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value as Filters['type'] })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              {VIOLATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Severity
            </label>
            <select
              value={filters.severity}
              onChange={(e) => setFilters({ ...filters, severity: e.target.value as Filters['severity'] })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as Filters['status'] })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Time Range
            </label>
            <select
              value={filters.timeRange}
              onChange={(e) => setFilters({ ...filters, timeRange: e.target.value as Filters['timeRange'] })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              {TIME_RANGES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Violations Table */}
      {filteredViolations.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-4">🛡️</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Violations Found
          </h3>
          <p className="text-gray-500">
            {violations.length === 0
              ? 'No violations have been detected yet.'
              : 'No violations match the current filters.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Summary
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actor
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredViolations.map((violation) => (
                <tr
                  key={violation.id}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link to={`/violations/${violation.id}`}>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${SEVERITY_COLORS[violation.severity]}`}
                      >
                        {violation.severity}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link to={`/violations/${violation.id}`} className="text-sm text-gray-900">
                      {TYPE_LABELS[violation.type]}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/violations/${violation.id}`} className="text-sm text-gray-900 line-clamp-2 max-w-md">
                      {violation.summary}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link to={`/violations/${violation.id}`} className="text-sm text-gray-500">
                      {violation.actor.name || violation.actor.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link to={`/violations/${violation.id}`}>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[violation.status]}`}
                      >
                        {violation.status}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link to={`/violations/${violation.id}`} className="text-sm text-gray-500">
                      {formatTimeAgo(violation.detectedAt)}
                    </Link>
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
