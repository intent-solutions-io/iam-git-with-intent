/**
 * Queue Page
 *
 * Phase 14: Work item queue showing signals processed into prioritized work items.
 * Sorted by score (desc) then recency (desc).
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../contexts/AuthContext';

interface ScoreBreakdown {
  baseScore: number;
  modifiers: Array<{
    type: string;
    impact: number;
    reason: string;
  }>;
  finalScore: number;
}

interface WorkItem {
  id: string;
  tenantId: string;
  type: 'issue' | 'pr' | 'alert' | 'scheduled' | 'manual';
  title: string;
  summary: string;
  status: 'pending' | 'in_progress' | 'ready_for_review' | 'approved' | 'merged' | 'dismissed';
  dedupeKey: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  signalIds: string[];
  evidence: {
    repo: string;
    resourceType: string;
    resourceNumber?: number;
    resourceUrl?: string;
    labels?: string[];
    assignees?: string[];
    author?: string;
  };
  createdAt: string;
  updatedAt: string;
  dismissedAt?: string;
  dismissedBy?: string;
  dismissReason?: string;
}

export function Queue() {
  const { currentTenant, loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [processingSignals, setProcessingSignals] = useState(false);

  const fetchQueue = useCallback(async () => {
    if (!currentTenant || !user) {
      setWorkItems([]);
      setLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const url = new URL(`${apiUrl}/v1/tenants/${currentTenant.id}/queue`);
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
        throw new Error(data.error || 'Failed to fetch queue');
      }

      const data = await res.json();
      setWorkItems(data.items || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching queue:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch queue');
    } finally {
      setLoading(false);
    }
  }, [currentTenant, user, statusFilter]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleProcessSignals = async () => {
    if (!currentTenant || !user) return;

    setProcessingSignals(true);
    try {
      const token = await user.getIdToken();
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(
        `${apiUrl}/v1/tenants/${currentTenant.id}/signals/process`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ limit: 50 }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to process signals');
      }

      const data = await res.json();
      alert(`Processed ${data.processed} signals, created ${data.workItemsCreated} work items`);
      fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process signals');
    } finally {
      setProcessingSignals(false);
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
          Select an organization to view the work queue.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Queue</h1>
          <p className="text-sm text-gray-500 mt-1">
            Prioritized work items from GitHub signals, sorted by score
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleProcessSignals}
            disabled={processingSignals}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {processingSignals ? 'Processing...' : 'Process Signals'}
          </button>
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
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="ready_for_review">Ready for Review</option>
          <option value="approved">Approved</option>
          <option value="merged">Merged</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {workItems.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No work items in queue</p>
          <p className="text-sm text-gray-400 mt-1">
            Work items will appear here when signals are processed from GitHub events
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Work Item
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Repo
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {/* Actions */}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {workItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <ScoreBadge score={item.score} />
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      to={`/queue/${item.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {item.title}
                    </Link>
                    <p className="text-sm text-gray-500 mt-1 truncate max-w-md">
                      {item.summary}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <WorkItemTypeBadge type={item.type} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <WorkItemStatusBadge status={item.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {item.evidence.repo}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <Link
                      to={`/queue/${item.id}`}
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

function ScoreBadge({ score }: { score: number }) {
  let colorClass = 'bg-gray-100 text-gray-800';
  if (score >= 80) {
    colorClass = 'bg-red-100 text-red-800';
  } else if (score >= 60) {
    colorClass = 'bg-orange-100 text-orange-800';
  } else if (score >= 40) {
    colorClass = 'bg-yellow-100 text-yellow-800';
  } else if (score >= 20) {
    colorClass = 'bg-blue-100 text-blue-800';
  }

  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold ${colorClass}`}>
      {score}
    </span>
  );
}

function WorkItemTypeBadge({ type }: { type: WorkItem['type'] }) {
  const styles: Record<string, string> = {
    issue: 'bg-green-100 text-green-800',
    pr: 'bg-purple-100 text-purple-800',
    alert: 'bg-red-100 text-red-800',
    scheduled: 'bg-blue-100 text-blue-800',
    manual: 'bg-gray-100 text-gray-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[type]}`}>
      {type}
    </span>
  );
}

function WorkItemStatusBadge({ status }: { status: WorkItem['status'] }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    ready_for_review: 'bg-purple-100 text-purple-800',
    approved: 'bg-green-100 text-green-800',
    merged: 'bg-green-200 text-green-900',
    dismissed: 'bg-gray-100 text-gray-800',
  };

  const labels: Record<string, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    ready_for_review: 'Ready for Review',
    approved: 'Approved',
    merged: 'Merged',
    dismissed: 'Dismissed',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
