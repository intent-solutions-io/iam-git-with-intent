/**
 * Violation Detail Page
 *
 * Shows violation details with remediation suggestions and one-click actions.
 * Part of Epic D: Policy & Audit - D5.5: Create violation dashboard
 *
 * NOTE: The client-side remediation generation (generateRemediation) is a
 * temporary implementation. For production, this should be fetched from
 * the backend API to ensure consistency with the core remediation engine
 * in packages/core/src/policy/remediation.ts.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../contexts/AuthContext';
import {
  type Violation,
  type ViolationStatus,
  type RemediationAction,
  type RemediationSuggestion,
  type PolicyLink,
  SEVERITY_COLORS,
  STATUS_COLORS,
  TYPE_LABELS,
  TYPE_ICONS,
  DIFFICULTY_COLORS,
  ACTOR_LABELS,
  parseViolation,
} from '../types/violations';

// =============================================================================
// Remediation Generation (client-side, mirrors backend logic)
// =============================================================================

function generateRemediation(violation: Violation): RemediationSuggestion {
  const actions = generateActions(violation);
  const policyLinks = generatePolicyLinks(violation);
  const { title, explanation, rootCause, impact } = generateExplanation(violation);

  return {
    id: `rem-${violation.id}-${Date.now()}`,
    violationId: violation.id,
    violationType: violation.type,
    title,
    explanation,
    rootCause,
    impact,
    actions,
    policyLinks,
    notes: generateNotes(violation),
    tags: [violation.type, violation.severity, violation.resource.type, violation.action.type],
    generatedAt: new Date(),
  };
}

function generateActions(violation: Violation): RemediationAction[] {
  const baseId = `action-${violation.id}`;

  switch (violation.type) {
    case 'policy-denied':
      return [
        {
          id: `${baseId}-request-approval`,
          type: 'request_approval',
          label: 'Request Approval',
          description: 'Submit a request for approval from authorized approvers',
          actor: 'user',
          difficulty: 'easy',
          oneClick: true,
          estimatedTime: '1-2 minutes',
          requiresConfirmation: true,
        },
        {
          id: `${baseId}-modify-request`,
          type: 'modify_request',
          label: 'Modify Your Request',
          description: 'Adjust your request to comply with policy requirements',
          actor: 'user',
          difficulty: 'easy',
          oneClick: false,
          estimatedTime: '5-10 minutes',
          requiresConfirmation: false,
        },
        {
          id: `${baseId}-add-exception`,
          type: 'add_exception',
          label: 'Add Policy Exception',
          description: 'Create a time-limited exception to the policy',
          actor: 'admin',
          difficulty: 'moderate',
          oneClick: false,
          estimatedTime: '5-10 minutes',
          requiresConfirmation: true,
        },
        {
          id: `${baseId}-contact-admin`,
          type: 'contact_admin',
          label: 'Contact Administrator',
          description: 'Reach out to a system administrator for assistance',
          actor: 'user',
          difficulty: 'easy',
          oneClick: false,
          estimatedTime: '1-24 hours',
          requiresConfirmation: false,
        },
      ];

    case 'approval-bypassed':
      return [
        {
          id: `${baseId}-document`,
          type: 'document_justification',
          label: 'Document Justification',
          description: 'Provide written justification for why this action was necessary',
          actor: 'user',
          difficulty: 'easy',
          oneClick: false,
          estimatedTime: '5-10 minutes',
          requiresConfirmation: false,
        },
        {
          id: `${baseId}-retroactive`,
          type: 'request_approval',
          label: 'Request Retroactive Approval',
          description: 'Request approval from required approvers after the fact',
          actor: 'user',
          difficulty: 'easy',
          oneClick: true,
          estimatedTime: '1-2 minutes',
          requiresConfirmation: true,
        },
        {
          id: `${baseId}-escalate`,
          type: 'escalate',
          label: 'Escalate to Security',
          description: 'Escalate this violation to the security team for review',
          actor: 'approver',
          difficulty: 'easy',
          oneClick: true,
          estimatedTime: '1 minute',
          requiresConfirmation: true,
        },
        {
          id: `${baseId}-acknowledge`,
          type: 'acknowledge',
          label: 'Acknowledge & Dismiss',
          description: 'Acknowledge this violation and dismiss the alert',
          actor: 'approver',
          difficulty: 'easy',
          oneClick: true,
          estimatedTime: '1 minute',
          requiresConfirmation: true,
        },
      ];

    case 'limit-exceeded':
      return [
        {
          id: `${baseId}-wait`,
          type: 'wait_cooldown',
          label: 'Wait for Cooldown',
          description: 'Wait for the rate limit window to reset',
          actor: 'user',
          difficulty: 'easy',
          oneClick: false,
          estimatedTime: 'Varies',
          requiresConfirmation: false,
        },
        {
          id: `${baseId}-quota`,
          type: 'request_quota',
          label: 'Request Quota Increase',
          description: 'Submit a request to increase your rate limit quota',
          actor: 'user',
          difficulty: 'moderate',
          oneClick: false,
          estimatedTime: '1-3 business days',
          requiresConfirmation: false,
        },
        {
          id: `${baseId}-contact-admin`,
          type: 'contact_admin',
          label: 'Contact Administrator',
          description: 'Contact an administrator to discuss rate limit adjustments',
          actor: 'user',
          difficulty: 'easy',
          oneClick: false,
          estimatedTime: '1-24 hours',
          requiresConfirmation: false,
        },
      ];

    case 'anomaly-detected':
      return [
        {
          id: `${baseId}-verify`,
          type: 'verify_identity',
          label: 'Verify Your Identity',
          description: 'Complete identity verification to confirm this was you',
          actor: 'user',
          difficulty: 'easy',
          oneClick: true,
          estimatedTime: '2-5 minutes',
          requiresConfirmation: true,
        },
        {
          id: `${baseId}-review`,
          type: 'review_activity',
          label: 'Review Recent Activity',
          description: 'Review your recent activity for any unauthorized actions',
          actor: 'user',
          difficulty: 'easy',
          oneClick: false,
          estimatedTime: '5-15 minutes',
          requiresConfirmation: false,
        },
        {
          id: `${baseId}-escalate`,
          type: 'escalate',
          label: 'Report Suspicious Activity',
          description: 'Report this activity to the security team for investigation',
          actor: 'approver',
          difficulty: 'easy',
          oneClick: true,
          estimatedTime: '1 minute',
          requiresConfirmation: true,
        },
        {
          id: `${baseId}-acknowledge`,
          type: 'acknowledge',
          label: 'Acknowledge & Dismiss',
          description: 'Confirm this was expected behavior and dismiss the alert',
          actor: 'approver',
          difficulty: 'easy',
          oneClick: true,
          estimatedTime: '1 minute',
          requiresConfirmation: true,
        },
      ];

    default:
      return [
        {
          id: `${baseId}-contact-admin`,
          type: 'contact_admin',
          label: 'Contact Administrator',
          description: 'Reach out to a system administrator for assistance',
          actor: 'user',
          difficulty: 'easy',
          oneClick: false,
          estimatedTime: '1-24 hours',
          requiresConfirmation: false,
        },
      ];
  }
}

function generatePolicyLinks(violation: Violation): PolicyLink[] {
  const links: PolicyLink[] = [];

  switch (violation.type) {
    case 'policy-denied': {
      const details = violation.details as { policyId?: string; policyName?: string } | undefined;
      if (details?.policyId) {
        links.push({
          policyId: details.policyId,
          policyName: details.policyName ?? 'Policy',
          relevance: 'This policy blocked the attempted action',
        });
      }
      break;
    }
    case 'approval-bypassed': {
      const details = violation.details as { workflowId?: string; workflowName?: string } | undefined;
      if (details?.workflowId) {
        links.push({
          policyId: details.workflowId,
          policyName: details.workflowName ?? 'Approval Workflow',
          relevance: 'This workflow requires approval before proceeding',
        });
      }
      break;
    }
    case 'limit-exceeded': {
      const details = violation.details as { limitType?: string } | undefined;
      links.push({
        policyId: 'rate-limits',
        policyName: 'Rate Limiting Policy',
        section: details?.limitType,
        relevance: 'This policy defines rate limits for API operations',
      });
      break;
    }
    case 'anomaly-detected':
      links.push({
        policyId: 'security-monitoring',
        policyName: 'Security Monitoring Policy',
        relevance: 'This policy defines what constitutes anomalous behavior',
      });
      break;
  }

  return links;
}

function generateExplanation(violation: Violation): {
  title: string;
  explanation: string;
  rootCause: string;
  impact: string;
} {
  switch (violation.type) {
    case 'policy-denied': {
      const details = violation.details as { policyName?: string; ruleDescription?: string } | undefined;
      return {
        title: 'Action Blocked by Policy',
        explanation: `Your attempt to ${violation.action.type} on ${violation.resource.name || violation.resource.id} was blocked because it violates ${details?.policyName || 'a security policy'}.`,
        rootCause: details?.ruleDescription || 'The action does not meet the requirements defined in the policy.',
        impact: 'The requested operation was not performed. Your work may be blocked until this is resolved.',
      };
    }
    case 'approval-bypassed': {
      const details = violation.details as { requiredApprovers?: string[]; bypassMethod?: string } | undefined;
      return {
        title: 'Approval Process Bypassed',
        explanation: `The action ${violation.action.type} was performed without required approval from ${details?.requiredApprovers?.join(', ') || 'designated approvers'}.`,
        rootCause: details?.bypassMethod
          ? `Approval was bypassed via: ${details.bypassMethod}`
          : 'The standard approval workflow was not followed.',
        impact: 'This may violate compliance requirements and will be logged for audit purposes.',
      };
    }
    case 'limit-exceeded': {
      const details = violation.details as { limitType?: string; actual?: number; limit?: number } | undefined;
      return {
        title: 'Rate Limit Exceeded',
        explanation: `You have exceeded the ${details?.limitType || 'rate'} limit for ${violation.action.type} operations.`,
        rootCause: details
          ? `Current: ${details.actual}/${details.limit} (${Math.round(((details.actual || 0) / (details.limit || 1)) * 100)}% of limit)`
          : 'Too many requests in a short time period.',
        impact: 'Further requests will be rejected until the rate limit resets.',
      };
    }
    case 'anomaly-detected': {
      const details = violation.details as { anomalyType?: string; baseline?: string; observed?: string } | undefined;
      return {
        title: 'Unusual Activity Detected',
        explanation: `An unusual pattern was detected: ${details?.anomalyType || 'abnormal behavior'} during ${violation.action.type}.`,
        rootCause: details?.baseline && details?.observed
          ? `Expected: ${details.baseline}. Observed: ${details.observed}`
          : 'Activity deviated significantly from normal patterns.',
        impact: 'This has been flagged for security review. Please verify this was intentional.',
      };
    }
    default:
      return {
        title: 'Security Violation',
        explanation: `A security violation occurred during ${violation.action.type} on ${violation.resource.name || violation.resource.id}.`,
        rootCause: 'The action violated security policies.',
        impact: 'This violation has been logged and may require remediation.',
      };
  }
}

function generateNotes(violation: Violation): string[] {
  const notes: string[] = [];

  if (violation.severity === 'critical') {
    notes.push('This is a critical violation and requires immediate attention.');
  } else if (violation.severity === 'high') {
    notes.push('This is a high-severity violation and should be addressed promptly.');
  }

  switch (violation.type) {
    case 'policy-denied':
      notes.push('If you believe this block is incorrect, please contact your administrator.');
      break;
    case 'approval-bypassed':
      notes.push('All bypass events are logged for compliance auditing.');
      notes.push('Consider documenting the reason for the bypass.');
      break;
    case 'limit-exceeded':
      notes.push('Rate limits are designed to protect system stability.');
      notes.push('If you frequently hit limits, consider requesting a quota increase.');
      break;
    case 'anomaly-detected':
      notes.push('If this was you, please verify your identity to clear this alert.');
      notes.push('If this was not you, please report it immediately.');
      break;
  }

  return notes;
}

// =============================================================================
// Component
// =============================================================================

export function ViolationDetail() {
  const { violationId } = useParams<{ violationId: string }>();
  const { currentTenant, loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const [violation, setViolation] = useState<Violation | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolution, setResolution] = useState('');
  const [showActionModal, setShowActionModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<RemediationAction | null>(null);
  const [actionExecuting, setActionExecuting] = useState(false);

  // Generate remediation suggestion
  const remediation = useMemo(() => {
    return violation ? generateRemediation(violation) : null;
  }, [violation]);

  // Fetch violation from Firestore with Zod validation
  useEffect(() => {
    if (!currentTenant || !violationId) {
      setLoading(false);
      return;
    }

    const violationRef = doc(db, 'gwi_violations', violationId);
    const unsubscribe = onSnapshot(
      violationRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as Record<string, unknown>;
          const parsed = parseViolation(data, snapshot.id);
          if (parsed) {
            // Verify tenant access
            if (parsed.tenantId !== currentTenant.id) {
              setError('You do not have access to this violation');
              setViolation(null);
            } else {
              setViolation(parsed);
            }
          } else {
            setError('Failed to parse violation data');
            setViolation(null);
          }
        } else {
          setViolation(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching violation:', err);
        setError('Failed to load violation details');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentTenant, violationId]);

  // Handle one-click action execution
  const handleActionClick = useCallback((action: RemediationAction) => {
    if (action.requiresConfirmation) {
      setPendingAction(action);
      setShowActionModal(true);
    } else {
      executeAction(action);
    }
  }, []);

  const executeAction = useCallback(async (action: RemediationAction) => {
    setActionExecuting(true);
    setError(null);

    try {
      // TODO: In production, call the actual API endpoint
      // For now, simulate the action with a delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Log the action that would be taken
      console.log('Would execute action:', {
        type: action.type,
        label: action.label,
        endpoint: action.endpoint,
        method: action.method,
        violationId: violation?.id,
      });

      // Show success feedback
      // In production, this would update the violation status based on the action result
      setShowActionModal(false);
      setPendingAction(null);

      // Provide user feedback
      setError(null);
    } catch (err) {
      console.error('Error executing action:', err);
      setError(`Failed to execute action: ${action.label}`);
    } finally {
      setActionExecuting(false);
    }
  }, [violation?.id]);

  const cancelAction = useCallback(() => {
    setShowActionModal(false);
    setPendingAction(null);
  }, []);

  // Status update handlers
  const handleStatusChange = async (newStatus: ViolationStatus) => {
    if (!violationId || !user) return;

    setActionLoading(true);
    setError(null);

    try {
      const violationRef = doc(db, 'gwi_violations', violationId);
      const updates: Record<string, unknown> = {
        status: newStatus,
      };

      if (newStatus === 'acknowledged' && !violation?.acknowledgedAt) {
        updates.acknowledgedAt = new Date();
        updates.acknowledgedBy = user.uid;
      }

      await updateDoc(violationRef, updates);
    } catch (err) {
      console.error('Error updating violation:', err);
      setError('Failed to update violation status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!violationId || !user || !resolution.trim()) return;

    setActionLoading(true);
    setError(null);

    try {
      const violationRef = doc(db, 'gwi_violations', violationId);
      await updateDoc(violationRef, {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: user.uid,
        resolution: resolution.trim(),
      });
      setShowResolveModal(false);
      setResolution('');
    } catch (err) {
      console.error('Error resolving violation:', err);
      setError('Failed to resolve violation');
    } finally {
      setActionLoading(false);
    }
  };

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
          Select an organization to view violation details.
        </p>
      </div>
    );
  }

  // Violation not found
  if (!violation) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Violation Not Found</h2>
        <Link to="/violations" className="text-blue-600 hover:underline">
          Back to Violations
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/violations" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
          &larr; Back to Violations
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span>{TYPE_ICONS[violation.type]}</span>
              {remediation?.title || TYPE_LABELS[violation.type]}
            </h1>
            <div className="flex gap-2 mt-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${SEVERITY_COLORS[violation.severity]}`}
              >
                {violation.severity}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[violation.status]}`}
              >
                {violation.status}
              </span>
              <span className="text-sm text-gray-500">
                {violation.detectedAt.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {/* Quick Actions */}
      {violation.status !== 'resolved' && violation.status !== 'dismissed' && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            {violation.status === 'open' && (
              <button
                onClick={() => handleStatusChange('acknowledged')}
                disabled={actionLoading}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
              >
                Acknowledge
              </button>
            )}
            {(violation.status === 'open' || violation.status === 'acknowledged') && (
              <button
                onClick={() => handleStatusChange('investigating')}
                disabled={actionLoading}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                Start Investigation
              </button>
            )}
            <button
              onClick={() => setShowResolveModal(true)}
              disabled={actionLoading}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              Resolve
            </button>
            <button
              onClick={() => handleStatusChange('escalated')}
              disabled={actionLoading}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              Escalate
            </button>
            <button
              onClick={() => handleStatusChange('dismissed')}
              disabled={actionLoading}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Explanation */}
      {remediation && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">What Happened</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-gray-700">{remediation.explanation}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded">
                <h4 className="text-sm font-medium text-gray-900 mb-1">Root Cause</h4>
                <p className="text-sm text-gray-600">{remediation.rootCause}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <h4 className="text-sm font-medium text-gray-900 mb-1">Impact</h4>
                <p className="text-sm text-gray-600">{remediation.impact}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Violation Details */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Details</h2>
        </div>
        <div className="p-4 space-y-3">
          <DetailRow label="Violation ID" value={violation.id} />
          <DetailRow label="Type" value={TYPE_LABELS[violation.type]} />
          <DetailRow label="Source" value={violation.source} />
          <DetailRow label="Actor" value={violation.actor.name || violation.actor.id} />
          <DetailRow label="Actor Type" value={violation.actor.type} />
          <DetailRow label="Resource" value={violation.resource.name || violation.resource.id} />
          <DetailRow label="Resource Type" value={violation.resource.type} />
          <DetailRow label="Action" value={violation.action.type} />
          {violation.action.description && (
            <DetailRow label="Action Details" value={violation.action.description} />
          )}
          <DetailRow label="Detected" value={violation.detectedAt.toLocaleString()} />
          {violation.acknowledgedAt && (
            <DetailRow label="Acknowledged" value={violation.acknowledgedAt.toLocaleString()} />
          )}
          {violation.resolvedAt && (
            <>
              <DetailRow label="Resolved" value={violation.resolvedAt.toLocaleString()} />
              {violation.resolution && (
                <DetailRow label="Resolution" value={violation.resolution} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Remediation Actions */}
      {remediation && remediation.actions.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Recommended Actions</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {remediation.actions.map((action, idx) => (
              <div key={action.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {idx + 1}. {action.label}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${DIFFICULTY_COLORS[action.difficulty]}`}>
                        {action.difficulty}
                      </span>
                      <span className="text-xs text-gray-500">
                        for {ACTOR_LABELS[action.actor]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{action.description}</p>
                    {action.estimatedTime && (
                      <p className="text-xs text-gray-400 mt-1">
                        Estimated time: {action.estimatedTime}
                      </p>
                    )}
                  </div>
                  {action.oneClick && (
                    <button
                      className="ml-4 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                      onClick={() => handleActionClick(action)}
                      disabled={actionExecuting}
                    >
                      {actionExecuting ? 'Executing...' : 'Execute'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Policy Links */}
      {remediation && remediation.policyLinks.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Related Policies</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {remediation.policyLinks.map((link) => (
              <div key={link.policyId} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">
                      {link.policyName}
                      {link.section && (
                        <span className="text-gray-500 font-normal"> - {link.section}</span>
                      )}
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">{link.relevance}</p>
                  </div>
                  {link.documentationUrl && (
                    <a
                      href={link.documentationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-4 text-blue-600 hover:underline text-sm"
                    >
                      View Policy
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {remediation && remediation.notes && remediation.notes.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">Notes</h3>
          <ul className="space-y-1">
            {remediation.notes.map((note, idx) => (
              <li key={idx} className="text-sm text-blue-800 flex items-start gap-2">
                <span className="text-blue-500">•</span>
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Raw Details (collapsible) */}
      {violation.details && Object.keys(violation.details).length > 0 && (
        <details className="bg-white rounded-lg shadow-sm border border-gray-200">
          <summary className="p-4 cursor-pointer font-semibold text-gray-900 hover:bg-gray-50">
            Raw Details
          </summary>
          <div className="p-4 border-t border-gray-200">
            <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
              {JSON.stringify(violation.details, null, 2)}
            </pre>
          </div>
        </details>
      )}

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Resolve Violation</h3>
            <p className="text-sm text-gray-600 mb-4">
              Please describe how this violation was resolved.
            </p>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg mb-4"
              rows={3}
              placeholder="Resolution details..."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowResolveModal(false);
                  setResolution('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleResolve}
                disabled={actionLoading || !resolution.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {actionLoading ? 'Resolving...' : 'Mark Resolved'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Confirmation Modal */}
      {showActionModal && pendingAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Confirm Action: {pendingAction.label}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {pendingAction.description}
            </p>
            <div className="bg-gray-50 rounded p-3 mb-4">
              <div className="text-xs text-gray-500 space-y-1">
                <p><strong>Action Type:</strong> {pendingAction.type}</p>
                <p><strong>Difficulty:</strong> {pendingAction.difficulty}</p>
                {pendingAction.estimatedTime && (
                  <p><strong>Estimated Time:</strong> {pendingAction.estimatedTime}</p>
                )}
              </div>
            </div>
            <p className="text-xs text-amber-600 mb-4">
              Note: This action will be logged for audit purposes.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={cancelAction}
                disabled={actionExecuting}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => executeAction(pendingAction)}
                disabled={actionExecuting}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {actionExecuting ? 'Executing...' : 'Confirm & Execute'}
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
      <span className="text-sm text-gray-500 w-32 flex-shrink-0">{label}:</span>
      <span className="text-sm text-gray-900 break-all">{value}</span>
    </div>
  );
}
