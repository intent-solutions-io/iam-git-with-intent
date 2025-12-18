/**
 * Run Detail Page
 *
 * Phase 11: Shows run details, audit timeline, and approve/reject buttons.
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../contexts/AuthContext';

interface ProposedChange {
  file: string;
  action: 'create' | 'modify' | 'delete';
  diff?: string;
  summary?: string;
}

interface AuditEvent {
  id: string;
  eventType: string;
  timestamp: Date;
  actor?: string;
  details: Record<string, unknown>;
  who?: string;
  what?: string;
  when?: string;
  where?: string;
  why?: string;
}

/** Phase 12: Policy evaluation result for tool invocation */
interface PolicyDecision {
  toolName: string;
  effect: 'allow' | 'deny';
  reason: string;
  ruleId?: string;
  policyClass: 'READ' | 'WRITE_NON_DESTRUCTIVE' | 'DESTRUCTIVE';
  timestamp: Date;
}

interface Run {
  id: string;
  type: 'resolve' | 'autopilot' | 'issue_to_pr' | 'triage' | 'review';
  status: 'pending' | 'running' | 'completed' | 'failed';
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  approvalReason?: string;
  prUrl?: string;
  prNumber?: number;
  repoId: string;
  proposedChanges?: ProposedChange[];
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  /** Phase 12: Policy evaluation outcomes */
  policyDecisions?: PolicyDecision[];
}

export function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const { currentTenant, loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const [run, setRun] = useState<Run | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  useEffect(() => {
    if (!currentTenant || !runId) {
      setLoading(false);
      return;
    }

    // Subscribe to run updates
    const runRef = doc(db, 'gwi_runs', runId);
    const unsubscribe = onSnapshot(
      runRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setRun({
            id: snapshot.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp
              ? data.createdAt.toDate()
              : new Date(data.createdAt),
            completedAt: data.completedAt instanceof Timestamp
              ? data.completedAt.toDate()
              : data.completedAt ? new Date(data.completedAt) : undefined,
          } as Run);
        } else {
          setRun(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching run:', err);
        setError('Failed to load run details');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentTenant, runId]);

  // Fetch audit events
  useEffect(() => {
    if (!currentTenant || !runId) return;

    const fetchAuditEvents = async () => {
      try {
        const token = await user?.getIdToken();
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || ''}/tenants/${currentTenant.id}/runs/${runId}/audit`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (res.ok) {
          const data = await res.json();
          setAuditEvents(
            data.events.map((e: AuditEvent & { timestamp: string }) => ({
              ...e,
              timestamp: new Date(e.timestamp),
            }))
          );
        }
      } catch (err) {
        console.error('Error fetching audit events:', err);
      }
    };

    fetchAuditEvents();
  }, [currentTenant, runId, user]);

  const handleApprove = async () => {
    if (!currentTenant || !runId || !user) return;

    setActionLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/tenants/${currentTenant.id}/runs/${runId}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to approve run');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve run');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!currentTenant || !runId || !user || !rejectReason.trim()) return;

    setActionLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/tenants/${currentTenant.id}/runs/${runId}/reject`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason: rejectReason }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reject run');
      }

      setShowRejectModal(false);
      setRejectReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject run');
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
        <p className="text-gray-600">Select an organization to view run details.</p>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Run Not Found</h2>
        <Link to="/runs" className="text-blue-600 hover:underline">
          Back to Runs
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/runs" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
          &larr; Back to Runs
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {run.prUrl ? `PR #${run.prNumber}` : `Run ${run.id.slice(0, 8)}`}
            </h1>
            <div className="flex gap-2 mt-2">
              <RunTypeBadge type={run.type} />
              <StatusBadge status={run.status} />
              {run.approvalStatus && run.approvalStatus !== 'none' && (
                <ApprovalStatusBadge status={run.approvalStatus} />
              )}
            </div>
          </div>
          {run.prUrl && (
            <a
              href={run.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              View PR
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

      {/* Approval Actions */}
      {run.approvalStatus === 'pending' && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-semibold text-yellow-800 mb-2">Approval Required</h3>
          <p className="text-sm text-yellow-700 mb-4">
            {run.approvalReason || 'This run requires approval before changes can be applied.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading ? 'Processing...' : 'Approve'}
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={actionLoading}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Run Details */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Details</h2>
        </div>
        <div className="p-4 space-y-3">
          <DetailRow label="Run ID" value={run.id} />
          <DetailRow label="Type" value={run.type} />
          <DetailRow label="Status" value={run.status} />
          <DetailRow label="Created" value={run.createdAt.toLocaleString()} />
          {run.completedAt && (
            <DetailRow label="Completed" value={run.completedAt.toLocaleString()} />
          )}
          {run.error && (
            <div className="pt-2">
              <span className="text-sm text-gray-500">Error:</span>
              <p className="text-sm text-red-600 mt-1">{run.error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Proposed Changes */}
      {run.proposedChanges && run.proposedChanges.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Proposed Changes</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {run.proposedChanges.map((change, idx) => (
              <div key={idx} className="p-4">
                <div className="flex items-center gap-2">
                  <ChangeActionBadge action={change.action} />
                  <code className="text-sm text-gray-900">{change.file}</code>
                </div>
                {change.summary && (
                  <p className="text-sm text-gray-600 mt-1">{change.summary}</p>
                )}
                {change.diff && (
                  <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                    {change.diff}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase 12: Policy Decisions */}
      {run.policyDecisions && run.policyDecisions.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Policy Decisions</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {run.policyDecisions.map((decision, idx) => (
              <div key={idx} className="p-4 flex items-start gap-3">
                <div
                  className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                    decision.effect === 'allow' ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-medium text-gray-900">
                      {decision.toolName}
                    </code>
                    <PolicyClassBadge policyClass={decision.policyClass} />
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        decision.effect === 'allow'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {decision.effect}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{decision.reason}</p>
                  {decision.ruleId && (
                    <p className="text-xs text-gray-400 mt-0.5">Rule: {decision.ruleId}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Timeline */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Activity Timeline</h2>
        </div>
        <div className="p-4">
          {auditEvents.length === 0 ? (
            <p className="text-sm text-gray-500">No activity recorded yet</p>
          ) : (
            <div className="space-y-4">
              {auditEvents.map((event) => (
                <div key={event.id} className="flex gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">
                        {formatEventType(event.eventType)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {event.timestamp.toLocaleString()}
                      </span>
                    </div>
                    {event.what && (
                      <p className="text-sm text-gray-600 mt-1">{event.what}</p>
                    )}
                    {event.who && (
                      <p className="text-xs text-gray-500">by {event.who}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Run</h3>
            <p className="text-sm text-gray-600 mb-4">
              Please provide a reason for rejecting this run.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg mb-4"
              rows={3}
              placeholder="Reason for rejection..."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !rejectReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? 'Rejecting...' : 'Reject'}
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
      <span className="text-sm text-gray-500 w-24">{label}:</span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  );
}

function RunTypeBadge({ type }: { type: Run['type'] }) {
  const styles: Record<string, string> = {
    resolve: 'bg-blue-100 text-blue-800',
    autopilot: 'bg-purple-100 text-purple-800',
    issue_to_pr: 'bg-green-100 text-green-800',
    triage: 'bg-yellow-100 text-yellow-800',
    review: 'bg-orange-100 text-orange-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[type] || 'bg-gray-100 text-gray-800'}`}>
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: Run['status'] }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    running: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
      {status}
    </span>
  );
}

function ApprovalStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

function ChangeActionBadge({ action }: { action: ProposedChange['action'] }) {
  const styles: Record<string, string> = {
    create: 'bg-green-100 text-green-800',
    modify: 'bg-yellow-100 text-yellow-800',
    delete: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${styles[action]}`}>
      {action}
    </span>
  );
}

/** Phase 12: Policy class badge */
function PolicyClassBadge({ policyClass }: { policyClass: PolicyDecision['policyClass'] }) {
  const styles: Record<string, string> = {
    READ: 'bg-blue-100 text-blue-800',
    WRITE_NON_DESTRUCTIVE: 'bg-yellow-100 text-yellow-800',
    DESTRUCTIVE: 'bg-red-100 text-red-800',
  };

  const labels: Record<string, string> = {
    READ: 'Read',
    WRITE_NON_DESTRUCTIVE: 'Write',
    DESTRUCTIVE: 'Destructive',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${styles[policyClass]}`}>
      {labels[policyClass]}
    </span>
  );
}

function formatEventType(eventType: string): string {
  return eventType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
