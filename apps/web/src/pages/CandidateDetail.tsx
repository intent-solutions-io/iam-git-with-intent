/**
 * Candidate Detail Page
 *
 * Phase 14: PR candidate detail view with plan steps, risk assessment,
 * patchset preview, and approval workflow.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../contexts/AuthContext';

interface CandidatePlanStep {
  id: string;
  order: number;
  action: 'create' | 'modify' | 'delete' | 'rename';
  file: string;
  description: string;
  rationale?: string;
  estimatedComplexity: 'trivial' | 'simple' | 'moderate' | 'complex';
}

interface PatchChange {
  file: string;
  action: 'add' | 'modify' | 'delete';
  diff?: string;
  content?: string;
}

interface RiskFactor {
  factor: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigation?: string;
}

interface CandidateApproval {
  approvedBy: string;
  approvedAt: string;
  comment?: string;
}

interface CandidateIntentReceipt {
  receiptId: string;
  proposedBy: string;
  proposedAt: string;
  intent: string;
  rationale: string;
  scope: {
    filesAffected: string[];
    estimatedComplexity: string;
  };
  constraints: string[];
  rollbackPlan: string;
}

interface PRCandidate {
  id: string;
  workItemId: string;
  tenantId: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'merged' | 'abandoned';
  plan: {
    summary: string;
    approach: string;
    steps: CandidatePlanStep[];
    estimatedEffort: 'minutes' | 'hours' | 'days';
    alternativesConsidered?: string[];
  };
  patchset?: {
    branch: string;
    baseSha: string;
    changes: PatchChange[];
  };
  risk: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: RiskFactor[];
    requiresHumanReview: boolean;
  };
  confidence: number;
  requiredApprovals: number;
  approvals: CandidateApproval[];
  intentReceipt: CandidateIntentReceipt;
  rejectionReason?: string;
  mergedPrUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export function CandidateDetail() {
  const { candidateId } = useParams<{ candidateId: string }>();
  const { currentTenant, loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const [candidate, setCandidate] = useState<PRCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalComment, setApprovalComment] = useState('');

  const fetchCandidate = useCallback(async () => {
    if (!user || !candidateId) {
      setLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(
        `${apiUrl}/v1/candidates/${candidateId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        if (res.status === 404) {
          setCandidate(null);
        } else {
          const data = await res.json();
          throw new Error(data.error || 'Failed to fetch candidate');
        }
      } else {
        const data = await res.json();
        setCandidate(data.candidate);
      }
      setError(null);
    } catch (err) {
      console.error('Error fetching candidate:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch candidate');
    } finally {
      setLoading(false);
    }
  }, [user, candidateId]);

  useEffect(() => {
    fetchCandidate();
  }, [fetchCandidate]);

  const handleApprove = async () => {
    if (!user || !candidateId) return;

    setActionLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(
        `${apiUrl}/v1/candidates/${candidateId}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'approve',
            comment: approvalComment || undefined,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to approve candidate');
      }

      setApprovalComment('');
      fetchCandidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve candidate');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!user || !candidateId || !rejectReason.trim()) return;

    setActionLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(
        `${apiUrl}/v1/candidates/${candidateId}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'reject',
            reason: rejectReason,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reject candidate');
      }

      setShowRejectModal(false);
      setRejectReason('');
      fetchCandidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject candidate');
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
        <p className="text-gray-600">Select an organization to view candidate details.</p>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Candidate Not Found</h2>
        <Link to="/candidates" className="text-blue-600 hover:underline">
          Back to Candidates
        </Link>
      </div>
    );
  }

  const canApprove = candidate.status === 'pending_approval';
  const approvalProgress = candidate.approvals.length;
  const approvalNeeded = candidate.requiredApprovals;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/candidates" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
          &larr; Back to Candidates
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              PR Candidate {candidate.id.slice(0, 8)}
            </h1>
            <div className="flex gap-2 mt-2">
              <CandidateStatusBadge status={candidate.status} />
              <RiskBadge level={candidate.risk.level} />
              <ConfidenceBadge confidence={candidate.confidence} />
            </div>
          </div>
          {candidate.mergedPrUrl && (
            <a
              href={candidate.mergedPrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
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
      {canApprove && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-semibold text-yellow-800 mb-2">
            Approval Required ({approvalProgress}/{approvalNeeded})
          </h3>
          <p className="text-sm text-yellow-700 mb-4">
            Review the implementation plan and risk assessment before approving.
          </p>
          <div className="mb-3">
            <input
              type="text"
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
              placeholder="Optional approval comment..."
              className="w-full p-2 border border-yellow-300 rounded-lg text-sm"
            />
          </div>
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

      {/* Rejected notice */}
      {candidate.status === 'rejected' && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="font-semibold text-red-800 mb-2">Rejected</h3>
          <p className="text-sm text-red-700">
            <strong>Reason:</strong> {candidate.rejectionReason || 'No reason provided'}
          </p>
        </div>
      )}

      {/* Intent Receipt */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200 bg-blue-50">
          <h2 className="font-semibold text-blue-900">Intent Receipt</h2>
          <p className="text-xs text-blue-700 mt-1">
            Receipt ID: {candidate.intentReceipt.receiptId}
          </p>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <span className="text-sm font-medium text-gray-700">Intent:</span>
            <p className="text-sm text-gray-900 mt-1">{candidate.intentReceipt.intent}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700">Rationale:</span>
            <p className="text-sm text-gray-900 mt-1">{candidate.intentReceipt.rationale}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700">Scope:</span>
            <p className="text-sm text-gray-600 mt-1">
              {candidate.intentReceipt.scope.filesAffected.length} files affected
              ({candidate.intentReceipt.scope.estimatedComplexity} complexity)
            </p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700">Constraints:</span>
            <ul className="list-disc list-inside text-sm text-gray-600 mt-1">
              {candidate.intentReceipt.constraints.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700">Rollback Plan:</span>
            <p className="text-sm text-gray-600 mt-1">{candidate.intentReceipt.rollbackPlan}</p>
          </div>
          <div className="pt-2 border-t border-gray-200 text-xs text-gray-500">
            Proposed by {candidate.intentReceipt.proposedBy} on{' '}
            {new Date(candidate.intentReceipt.proposedAt).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Plan Summary */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Implementation Plan</h2>
        </div>
        <div className="p-4">
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700">Summary</h4>
            <p className="text-sm text-gray-900 mt-1">{candidate.plan.summary}</p>
          </div>
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700">Approach</h4>
            <p className="text-sm text-gray-900 mt-1">{candidate.plan.approach}</p>
          </div>
          <div className="flex gap-4 text-sm text-gray-500">
            <span>
              <strong>Estimated Effort:</strong> {candidate.plan.estimatedEffort}
            </span>
            <span>
              <strong>Steps:</strong> {candidate.plan.steps.length}
            </span>
          </div>
        </div>
      </div>

      {/* Plan Steps */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Plan Steps</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {candidate.plan.steps.map((step, idx) => (
            <div key={step.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <ActionBadge action={step.action} />
                    <code className="text-sm text-gray-900">{step.file}</code>
                    <ComplexityBadge complexity={step.estimatedComplexity} />
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{step.description}</p>
                  {step.rationale && (
                    <p className="text-xs text-gray-500 mt-1">
                      <em>Rationale: {step.rationale}</em>
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Assessment */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Risk Assessment</h2>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <RiskBadge level={candidate.risk.level} />
            {candidate.risk.requiresHumanReview && (
              <span className="text-sm text-orange-600">
                Requires human review
              </span>
            )}
          </div>
          {candidate.risk.factors.length > 0 ? (
            <div className="space-y-3">
              {candidate.risk.factors.map((factor, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={factor.severity} />
                    <span className="text-sm font-medium text-gray-900">{factor.factor}</span>
                  </div>
                  {factor.mitigation && (
                    <p className="text-xs text-gray-600 mt-1">
                      <strong>Mitigation:</strong> {factor.mitigation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No significant risk factors identified</p>
          )}
        </div>
      </div>

      {/* Patchset Preview */}
      {candidate.patchset && candidate.patchset.changes.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Patchset Preview</h2>
            <p className="text-xs text-gray-500 mt-1">
              Branch: {candidate.patchset.branch} | Base: {candidate.patchset.baseSha.slice(0, 7)}
            </p>
          </div>
          <div className="divide-y divide-gray-200">
            {candidate.patchset.changes.map((change, idx) => (
              <div key={idx} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <PatchActionBadge action={change.action} />
                  <code className="text-sm text-gray-900">{change.file}</code>
                </div>
                {change.diff && (
                  <pre className="p-3 bg-gray-50 rounded text-xs overflow-x-auto font-mono">
                    {change.diff}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approvals */}
      {candidate.approvals.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">
              Approvals ({candidate.approvals.length}/{candidate.requiredApprovals})
            </h2>
          </div>
          <div className="divide-y divide-gray-200">
            {candidate.approvals.map((approval, idx) => (
              <div key={idx} className="p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-900">{approval.approvedBy}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(approval.approvedAt).toLocaleString()}
                  </div>
                  {approval.comment && (
                    <p className="text-sm text-gray-600 mt-1">{approval.comment}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Details</h2>
        </div>
        <div className="p-4 space-y-3">
          <DetailRow label="Candidate ID" value={candidate.id} />
          <DetailRow label="Work Item ID" value={candidate.workItemId} />
          <DetailRow label="Created" value={new Date(candidate.createdAt).toLocaleString()} />
          <DetailRow label="Updated" value={new Date(candidate.updatedAt).toLocaleString()} />
          <div className="pt-2">
            <Link
              to={`/queue/${candidate.workItemId}`}
              className="text-blue-600 hover:underline text-sm"
            >
              View Work Item &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Candidate</h3>
            <p className="text-sm text-gray-600 mb-4">
              Please provide a reason for rejecting this PR candidate.
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
      <span className="text-sm text-gray-500 w-32">{label}:</span>
      <span className="text-sm text-gray-900 break-all">{value}</span>
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
    pending_approval: 'Pending Approval',
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
      Risk: {level}
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
      {confidence}% confidence
    </span>
  );
}

function ActionBadge({ action }: { action: CandidatePlanStep['action'] }) {
  const styles: Record<string, string> = {
    create: 'bg-green-100 text-green-800',
    modify: 'bg-yellow-100 text-yellow-800',
    delete: 'bg-red-100 text-red-800',
    rename: 'bg-blue-100 text-blue-800',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${styles[action]}`}>
      {action}
    </span>
  );
}

function PatchActionBadge({ action }: { action: PatchChange['action'] }) {
  const styles: Record<string, string> = {
    add: 'bg-green-100 text-green-800',
    modify: 'bg-yellow-100 text-yellow-800',
    delete: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${styles[action]}`}>
      {action}
    </span>
  );
}

function ComplexityBadge({ complexity }: { complexity: CandidatePlanStep['estimatedComplexity'] }) {
  const styles: Record<string, string> = {
    trivial: 'text-gray-500',
    simple: 'text-blue-500',
    moderate: 'text-yellow-600',
    complex: 'text-red-500',
  };

  return (
    <span className={`text-xs ${styles[complexity]}`}>
      ({complexity})
    </span>
  );
}

function SeverityBadge({ severity }: { severity: RiskFactor['severity'] }) {
  const styles: Record<string, string> = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${styles[severity]}`}>
      {severity}
    </span>
  );
}
