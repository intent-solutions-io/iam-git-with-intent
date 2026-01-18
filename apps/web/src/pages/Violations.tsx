/**
 * Violations Page
 *
 * List of policy violations with filters and trend visualization.
 * Part of Epic D: Policy & Audit - D5.5: Create violation dashboard
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTenant } from '../hooks/useTenant';
import {
  type Violation,
  type ViolationFilters,
  VIOLATION_TYPES,
  SEVERITIES,
  STATUSES,
  TIME_RANGES,
  SEVERITY_COLORS,
  STATUS_COLORS,
  TYPE_LABELS,
  getTimeRangeStart,
  formatTimeAgo,
  parseViolation,
} from '../types/violations';

// =============================================================================
// Component
// =============================================================================

export function Violations() {
  const navigate = useNavigate();
  const { currentTenant, loading: tenantLoading } = useTenant();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ViolationFilters>({
    type: 'all',
    severity: 'all',
    status: 'all',
    timeRange: '24h',
  });

  // Build Firestore query with server-side filtering
  const buildQuery = useCallback(() => {
    if (!currentTenant) return null;

    const constraints: QueryConstraint[] = [
      where('tenantId', '==', currentTenant.id),
    ];

    // Apply type filter
    if (filters.type !== 'all') {
      constraints.push(where('type', '==', filters.type));
    }

    // Apply severity filter
    if (filters.severity !== 'all') {
      constraints.push(where('severity', '==', filters.severity));
    }

    // Apply status filter
    if (filters.status !== 'all') {
      constraints.push(where('status', '==', filters.status));
    }

    // Apply time range filter
    if (filters.timeRange !== 'all') {
      const startTime = getTimeRangeStart(filters.timeRange);
      if (startTime) {
        constraints.push(where('detectedAt', '>=', startTime));
      }
    }

    // Order by detection time and limit results
    constraints.push(orderBy('detectedAt', 'desc'));
    constraints.push(limit(200));

    return query(collection(db, 'gwi_violations'), ...constraints);
  }, [currentTenant, filters]);

  // Fetch violations from Firestore with server-side filtering
  useEffect(() => {
    if (!currentTenant) {
      setViolations([]);
      setLoading(false);
      return;
    }

    const violationsQuery = buildQuery();
    if (!violationsQuery) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      violationsQuery,
      (snapshot) => {
        const fetched: Violation[] = [];
        snapshot.docs.forEach((doc) => {
          const data = doc.data() as Record<string, unknown>;
          const parsed = parseViolation(data, doc.id);
          if (parsed) {
            fetched.push(parsed);
          }
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
  }, [currentTenant, buildQuery]);

  // Calculate stats from fetched violations
  const stats = useMemo(() => {
    const critical = violations.filter((v) => v.severity === 'critical').length;
    const high = violations.filter((v) => v.severity === 'high').length;
    const open = violations.filter((v) => v.status === 'open').length;
    const escalated = violations.filter((v) => v.status === 'escalated').length;
    return { total: violations.length, critical, high, open, escalated };
  }, [violations]);

  // Handle row click navigation
  const handleRowClick = useCallback((violationId: string) => {
    navigate(`/violations/${violationId}`);
  }, [navigate]);

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
              onChange={(e) => setFilters({ ...filters, type: e.target.value as ViolationFilters['type'] })}
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
              onChange={(e) => setFilters({ ...filters, severity: e.target.value as ViolationFilters['severity'] })}
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
              onChange={(e) => setFilters({ ...filters, status: e.target.value as ViolationFilters['status'] })}
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
              onChange={(e) => setFilters({ ...filters, timeRange: e.target.value as ViolationFilters['timeRange'] })}
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
      {violations.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-4">🛡️</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Violations Found
          </h3>
          <p className="text-gray-500">
            No violations match the current filters.
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
              {violations.map((violation) => (
                <tr
                  key={violation.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleRowClick(violation.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRowClick(violation.id);
                    }
                  }}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${SEVERITY_COLORS[violation.severity]}`}
                    >
                      {violation.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {TYPE_LABELS[violation.type]}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-900 line-clamp-2 max-w-md">
                      {violation.summary}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {violation.actor.name || violation.actor.id}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[violation.status]}`}
                    >
                      {violation.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {formatTimeAgo(violation.detectedAt)}
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
