/**
 * Queue Detail Page
 *
 * Phase 14: Work item detail view with score breakdown, evidence,
 * and actions to generate PR candidates or dismiss.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../contexts/AuthContext';

interface ScoreModifier {
  type: string;
  impact: number;
  reason: string;
}

interface ScoreBreakdown {
  baseScore: number;
  modifiers: ScoreModifier[];
  finalScore: number;
}

interface WorkItemEvidence {
  repo: string;
  resourceType: string;
  resourceNumber?: number;
  resourceUrl?: string;
  labels?: string[];
  assignees?: string[];
  author?: string;
  rawPayload?: Record<string, unknown>;
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
  evidence: WorkItemEvidence;
  candidateId?: string;
  createdAt: string;
  updatedAt: string;
  dismissedAt?: string;
  dismissedBy?: string;
  dismissReason?: string;
}

interface PRCandidate {
  id: string;
  workItemId: string;
  status: string;
  confidence: number;
  risk: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: Array<{ factor: string; severity: string; mitigation?: string }>;
  };
  createdAt: string;
}

export function QueueDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { currentTenant, loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const [workItem, setWorkItem] = useState<WorkItem | null>(null);
  const [candidate, setCandidate] = useState<PRCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [dismissReason, setDismissReason] = useState('');

  const fetchWorkItem = useCallback(async () => {
    if (!currentTenant || !user || !itemId) {
      setLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(
        `${apiUrl}/v1/tenants/${currentTenant.id}/queue/${itemId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        if (res.status === 404) {
          setWorkItem(null);
        } else {
          const data = await res.json();
          throw new Error(data.error || 'Failed to fetch work item');
        }
      } else {
        const data = await res.json();
        setWorkItem(data.item);

        // Fetch candidate if exists
        if (data.item.candidateId) {
          const candRes = await fetch(
            `${apiUrl}/v1/candidates/${data.item.candidateId}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );
          if (candRes.ok) {
            const candData = await candRes.json();
            setCandidate(candData.candidate);
          }
        }
      }
      setError(null);
    } catch (err) {
      console.error('Error fetching work item:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch work item');
    } finally {
      setLoading(false);
    }
  }, [currentTenant, user, itemId]);

  useEffect(() => {
    fetchWorkItem();
  }, [fetchWorkItem]);

  const handleGenerateCandidate = async () => {
    if (!currentTenant || !user || !itemId) return;

    setActionLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(
        `${apiUrl}/v1/tenants/${currentTenant.id}/queue/${itemId}/candidate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate candidate');
      }

      const data = await res.json();
      navigate(`/candidates/${data.candidate.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate candidate');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDismiss = async () => {
    if (!currentTenant || !user || !itemId || !dismissReason.trim()) return;

    setActionLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(
        `${apiUrl}/v1/tenants/${currentTenant.id}/queue/${itemId}/dismiss`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason: dismissReason }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to dismiss item');
      }

      setShowDismissModal(false);
      setDismissReason('');
      fetchWorkItem();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss item');
    } finally {
      setActionLoading(false);
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
        <p className="text-gray-600">Select an organization to view work item details.</p>
      </div>
    );
  }

  if (!workItem) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Work Item Not Found</h2>
        <Link to="/queue" className="text-blue-600 hover:underline">
          Back to Queue
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/queue" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
          &larr; Back to Queue
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{workItem.title}</h1>
            <div className="flex gap-2 mt-2">
              <WorkItemTypeBadge type={workItem.type} />
              <WorkItemStatusBadge status={workItem.status} />
              <ScoreBadge score={workItem.score} />
            </div>
          </div>
          {workItem.evidence.resourceUrl && (
            <a
              href={workItem.evidence.resourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              View on GitHub
            </a>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {/* Actions */}
      {workItem.status === 'pending' && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-2">Ready for Action</h3>
          <p className="text-sm text-blue-700 mb-4">
            Generate a PR candidate to create an implementation plan and patches for this work item.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleGenerateCandidate}
              disabled={actionLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {actionLoading ? 'Generating...' : 'Generate PR Candidate'}
            </button>
            <button
              onClick={() => setShowDismissModal(true)}
              disabled={actionLoading}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Dismissed notice */}
      {workItem.status === 'dismissed' && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="font-semibold text-gray-800 mb-2">Dismissed</h3>
          <p className="text-sm text-gray-600">
            <strong>Reason:</strong> {workItem.dismissReason || 'No reason provided'}
          </p>
          {workItem.dismissedBy && (
            <p className="text-sm text-gray-500 mt-1">
              Dismissed by {workItem.dismissedBy} on {workItem.dismissedAt ? new Date(workItem.dismissedAt).toLocaleString() : 'N/A'}
            </p>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Summary</h2>
        </div>
        <div className="p-4">
          <p className="text-gray-700">{workItem.summary}</p>
        </div>
      </div>

      {/* Score Breakdown */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Score Breakdown</h2>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900">{workItem.score}</div>
              <div className="text-xs text-gray-500">Final Score</div>
            </div>
            <div className="text-gray-400">=</div>
            <div className="text-center">
              <div className="text-xl font-medium text-gray-700">{workItem.scoreBreakdown.baseScore}</div>
              <div className="text-xs text-gray-500">Base Score</div>
            </div>
            <div className="text-gray-400">+</div>
            <div className="text-center">
              <div className="text-xl font-medium text-gray-700">
                {workItem.scoreBreakdown.modifiers.reduce((sum, m) => sum + m.impact, 0)}
              </div>
              <div className="text-xs text-gray-500">Modifiers</div>
            </div>
          </div>

          {workItem.scoreBreakdown.modifiers.length > 0 && (
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Score Modifiers</h4>
              <div className="space-y-2">
                {workItem.scoreBreakdown.modifiers.map((mod, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      mod.impact > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {mod.impact > 0 ? '+' : ''}{mod.impact}
                    </span>
                    <span className="text-gray-600">{mod.reason}</span>
                    <span className="text-gray-400 text-xs">({mod.type})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Evidence */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Evidence</h2>
        </div>
        <div className="p-4 space-y-3">
          <DetailRow label="Repository" value={workItem.evidence.repo} />
          <DetailRow label="Resource Type" value={workItem.evidence.resourceType} />
          {workItem.evidence.resourceNumber && (
            <DetailRow label="Resource Number" value={`#${workItem.evidence.resourceNumber}`} />
          )}
          {workItem.evidence.author && (
            <DetailRow label="Author" value={workItem.evidence.author} />
          )}
          {workItem.evidence.labels && workItem.evidence.labels.length > 0 && (
            <div className="flex">
              <span className="text-sm text-gray-500 w-32">Labels:</span>
              <div className="flex flex-wrap gap-1">
                {workItem.evidence.labels.map((label) => (
                  <span
                    key={label}
                    className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {workItem.evidence.assignees && workItem.evidence.assignees.length > 0 && (
            <DetailRow label="Assignees" value={workItem.evidence.assignees.join(', ')} />
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Details</h2>
        </div>
        <div className="p-4 space-y-3">
          <DetailRow label="Item ID" value={workItem.id} />
          <DetailRow label="Dedupe Key" value={workItem.dedupeKey} />
          <DetailRow label="Signal Count" value={String(workItem.signalIds.length)} />
          <DetailRow label="Created" value={new Date(workItem.createdAt).toLocaleString()} />
          <DetailRow label="Updated" value={new Date(workItem.updatedAt).toLocaleString()} />
        </div>
      </div>

      {/* Linked Candidate */}
      {candidate && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">PR Candidate</h2>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  candidate.status === 'approved' ? 'bg-green-100 text-green-800' :
                  candidate.status === 'rejected' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {candidate.status}
                </span>
                <span className="ml-2 text-sm text-gray-500">
                  Confidence: {candidate.confidence}%
                </span>
                <span className="ml-2 text-sm text-gray-500">
                  Risk: <RiskBadge level={candidate.risk.level} />
                </span>
              </div>
              <Link
                to={`/candidates/${candidate.id}`}
                className="text-blue-600 hover:underline text-sm"
              >
                View Candidate &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Dismiss Modal */}
      {showDismissModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Dismiss Work Item</h3>
            <p className="text-sm text-gray-600 mb-4">
              Please provide a reason for dismissing this work item.
            </p>
            <textarea
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg mb-4"
              rows={3}
              placeholder="Reason for dismissal..."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowDismissModal(false);
                  setDismissReason('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDismiss}
                disabled={actionLoading || !dismissReason.trim()}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              >
                {actionLoading ? 'Dismissing...' : 'Dismiss'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <span className="text-sm text-gray-500 w-32">{label}:</span>
      <span className="text-sm text-gray-900 break-all">{value}</span>
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
    <span className={`px-2 py-1 text-xs font-bold rounded-full ${colorClass}`}>
      Score: {score}
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

function RiskBadge({ level }: { level: 'low' | 'medium' | 'high' | 'critical' }) {
  const styles: Record<string, string> = {
    low: 'text-green-600',
    medium: 'text-yellow-600',
    high: 'text-orange-600',
    critical: 'text-red-600',
  };

  return <span className={`font-medium ${styles[level]}`}>{level}</span>;
}
