/**
 * Candidates Page
 *
 * Phase 14: PR candidates list showing generated implementation plans
 * awaiting approval.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../contexts/AuthContext';

interface PRCandidate {
  id: string;
  workItemId: string;
  tenantId: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'merged' | 'abandoned';
  confidence: number;
  requiredApprovals: number;
  approvalCount: number;
  risk: {
    level: 'low' | 'medium' | 'high' | 'critical';
  };
  plan: {
    summary: string;
  };
  intentReceipt: {
    proposedBy: string;
    proposedAt: string;
  };
  createdAt: string;
}

export function Candidates() {
  const { currentTenant, loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<PRCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchCandidates = useCallback(async () => {
    if (!currentTenant || !user) {
      setCandidates([]);
      setLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const url = new URL(`${apiUrl}/v1/tenants/${currentTenant.id}/candidates`);
      if (statusFilter !== 'all') {
        url.searchParams.set('status', statusFilter);
      }

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch candidates');
      }

      const data = await res.json();
      setCandidates(data.candidates || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching candidates:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch candidates');
    } finally {
      setLoading(false);
    }
  }, [currentTenant, user, statusFilter]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

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
          Select an organization to view PR candidates.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PR Candidates</h1>
          <p className="text-sm text-gray-500 mt-1">
            Implementation plans awaiting approval before PR creation
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="merged">Merged</option>
          <option value="abandoned">Abandoned</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {candidates.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No PR candidates</p>
          <p className="text-sm text-gray-400 mt-1">
            Generate candidates from the work queue to see them here
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Candidate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Risk
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Approvals
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Proposed
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {/* Actions */}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {candidates.map((candidate) => (
                <tr key={candidate.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link
                      to={`/candidates/${candidate.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {candidate.id.slice(0, 8)}
                    </Link>
                    <p className="text-sm text-gray-500 mt-1 truncate max-w-sm">
                      {candidate.plan.summary}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <CandidateStatusBadge status={candidate.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <RiskBadge level={candidate.risk.level} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <ConfidenceBadge confidence={candidate.confidence} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {candidate.approvalCount || 0} / {candidate.requiredApprovals}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(candidate.intentReceipt.proposedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <Link
                      to={`/candidates/${candidate.id}`}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      View &rarr;
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

function CandidateStatusBadge({ status }: { status: PRCandidate['status'] }) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    pending_approval: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    merged: 'bg-purple-100 text-purple-800',
    abandoned: 'bg-gray-100 text-gray-500',
  };

  const labels: Record<string, string> = {
    draft: 'Draft',
    pending_approval: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    merged: 'Merged',
    abandoned: 'Abandoned',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function RiskBadge({ level }: { level: 'low' | 'medium' | 'high' | 'critical' }) {
  const styles: Record<string, string> = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[level]}`}>
      {level}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  let colorClass = 'bg-gray-100 text-gray-800';
  if (confidence >= 80) {
    colorClass = 'bg-green-100 text-green-800';
  } else if (confidence >= 60) {
    colorClass = 'bg-yellow-100 text-yellow-800';
  } else if (confidence >= 40) {
    colorClass = 'bg-orange-100 text-orange-800';
  } else {
    colorClass = 'bg-red-100 text-red-800';
  }

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colorClass}`}>
      {confidence}%
    </span>
  );
}
