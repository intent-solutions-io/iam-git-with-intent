/**
 * Remediation Suggestions for Policy Violations
 *
 * Epic D: Policy & Audit - Story D5: Policy Violations & Alerts
 * Task D5.4: Add remediation suggestions
 *
 * Provides context-aware fix suggestions for violations:
 * - Type-specific remediation strategies
 * - Links to relevant policies and documentation
 * - One-click remediation actions where safe
 *
 * @module @gwi/core/policy/remediation
 */

import { z } from 'zod';
import type {
  Violation,
  ViolationType,
  PolicyDeniedDetails,
  ApprovalBypassedDetails,
  LimitExceededDetails,
  AnomalyDetectedDetails,
} from './violation-schema.js';

// =============================================================================
// Types and Schemas
// =============================================================================

/**
 * Remediation action types
 */
export type RemediationActionType =
  | 'request_approval'      // Request approval for the action
  | 'modify_request'        // Modify the original request
  | 'contact_admin'         // Contact administrator
  | 'wait_cooldown'         // Wait for rate limit cooldown
  | 'request_quota'         // Request quota increase
  | 'verify_identity'       // Verify actor identity
  | 'review_activity'       // Review recent activity
  | 'update_policy'         // Update policy (admin only)
  | 'add_exception'         // Add policy exception
  | 'document_justification' // Document why action was needed
  | 'escalate'              // Escalate to security team
  | 'acknowledge'           // Acknowledge and dismiss
  | 'custom';               // Custom action

/**
 * Difficulty level for remediation
 */
export type RemediationDifficulty = 'easy' | 'moderate' | 'complex';

/**
 * Who can perform this remediation
 */
export type RemediationActor = 'user' | 'approver' | 'admin' | 'security_team';

/**
 * One-click remediation action
 */
export const RemediationActionSchema = z.object({
  /** Unique action ID */
  id: z.string(),
  /** Action type */
  type: z.enum([
    'request_approval',
    'modify_request',
    'contact_admin',
    'wait_cooldown',
    'request_quota',
    'verify_identity',
    'review_activity',
    'update_policy',
    'add_exception',
    'document_justification',
    'escalate',
    'acknowledge',
    'custom',
  ]),
  /** Human-readable label */
  label: z.string(),
  /** Detailed description */
  description: z.string(),
  /** Who can perform this action */
  actor: z.enum(['user', 'approver', 'admin', 'security_team']),
  /** Difficulty level */
  difficulty: z.enum(['easy', 'moderate', 'complex']),
  /** Whether this is a one-click action */
  oneClick: z.boolean().default(false),
  /** API endpoint for one-click action */
  endpoint: z.string().optional(),
  /** HTTP method for one-click action */
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
  /** Request payload template */
  payloadTemplate: z.record(z.unknown()).optional(),
  /** URL to navigate to (if not API action) */
  url: z.string().optional(),
  /** Estimated time to complete */
  estimatedTime: z.string().optional(),
  /** Whether action requires confirmation */
  requiresConfirmation: z.boolean().default(true),
});

export type RemediationAction = z.infer<typeof RemediationActionSchema>;

/**
 * Link to policy documentation
 */
export const PolicyLinkSchema = z.object({
  /** Policy ID */
  policyId: z.string(),
  /** Policy name */
  policyName: z.string(),
  /** Link to policy documentation */
  documentationUrl: z.string().optional(),
  /** Relevant section within the policy */
  section: z.string().optional(),
  /** Brief explanation of relevance */
  relevance: z.string(),
});

export type PolicyLink = z.infer<typeof PolicyLinkSchema>;

/**
 * Complete remediation suggestion
 */
export const RemediationSuggestionSchema = z.object({
  /** Unique suggestion ID */
  id: z.string(),
  /** Violation ID this suggestion is for */
  violationId: z.string(),
  /** Violation type */
  violationType: z.enum(['policy-denied', 'approval-bypassed', 'limit-exceeded', 'anomaly-detected']),
  /** Primary suggestion title */
  title: z.string(),
  /** Detailed explanation */
  explanation: z.string(),
  /** Why this violation occurred */
  rootCause: z.string(),
  /** Impact if not remediated */
  impact: z.string(),
  /** Available remediation actions (ordered by recommendation) */
  actions: z.array(RemediationActionSchema),
  /** Links to relevant policies */
  policyLinks: z.array(PolicyLinkSchema),
  /** Additional context or notes */
  notes: z.array(z.string()).optional(),
  /** Tags for categorization */
  tags: z.array(z.string()).optional(),
  /** When suggestion was generated */
  generatedAt: z.date(),
  /** Suggestion expiry (if time-sensitive) */
  expiresAt: z.date().optional(),
});

export type RemediationSuggestion = z.infer<typeof RemediationSuggestionSchema>;

// =============================================================================
// Remediation Templates
// =============================================================================

/**
 * Template for generating remediation actions
 */
interface ActionTemplate {
  type: RemediationActionType;
  label: string;
  description: string;
  actor: RemediationActor;
  difficulty: RemediationDifficulty;
  oneClick?: boolean;
  requiresConfirmation?: boolean;
  estimatedTime?: string;
}

const ACTION_TEMPLATES: Record<string, ActionTemplate> = {
  request_approval: {
    type: 'request_approval',
    label: 'Request Approval',
    description: 'Submit a request for approval from authorized approvers',
    actor: 'user',
    difficulty: 'easy',
    oneClick: true,
    estimatedTime: '1-2 minutes',
  },
  modify_request: {
    type: 'modify_request',
    label: 'Modify Your Request',
    description: 'Adjust your request to comply with policy requirements',
    actor: 'user',
    difficulty: 'easy',
    estimatedTime: '5-10 minutes',
  },
  contact_admin: {
    type: 'contact_admin',
    label: 'Contact Administrator',
    description: 'Reach out to a system administrator for assistance',
    actor: 'user',
    difficulty: 'easy',
    estimatedTime: '1-24 hours',
  },
  wait_cooldown: {
    type: 'wait_cooldown',
    label: 'Wait for Cooldown',
    description: 'Wait for the rate limit window to reset',
    actor: 'user',
    difficulty: 'easy',
    estimatedTime: 'Varies',
  },
  request_quota: {
    type: 'request_quota',
    label: 'Request Quota Increase',
    description: 'Submit a request to increase your rate limit quota',
    actor: 'user',
    difficulty: 'moderate',
    estimatedTime: '1-3 business days',
  },
  verify_identity: {
    type: 'verify_identity',
    label: 'Verify Your Identity',
    description: 'Complete identity verification to confirm this was you',
    actor: 'user',
    difficulty: 'easy',
    oneClick: true,
    estimatedTime: '2-5 minutes',
  },
  review_activity: {
    type: 'review_activity',
    label: 'Review Recent Activity',
    description: 'Review your recent activity for any unauthorized actions',
    actor: 'user',
    difficulty: 'easy',
    estimatedTime: '5-15 minutes',
  },
  update_policy: {
    type: 'update_policy',
    label: 'Update Policy',
    description: 'Modify the policy to allow this action (requires admin)',
    actor: 'admin',
    difficulty: 'complex',
    requiresConfirmation: true,
    estimatedTime: '15-30 minutes',
  },
  add_exception: {
    type: 'add_exception',
    label: 'Add Policy Exception',
    description: 'Create a time-limited exception to the policy',
    actor: 'admin',
    difficulty: 'moderate',
    requiresConfirmation: true,
    estimatedTime: '5-10 minutes',
  },
  document_justification: {
    type: 'document_justification',
    label: 'Document Justification',
    description: 'Provide written justification for why this action was necessary',
    actor: 'user',
    difficulty: 'easy',
    estimatedTime: '5-10 minutes',
  },
  escalate: {
    type: 'escalate',
    label: 'Escalate to Security',
    description: 'Escalate this violation to the security team for review',
    actor: 'approver',
    difficulty: 'easy',
    oneClick: true,
    estimatedTime: '1 minute',
  },
  acknowledge: {
    type: 'acknowledge',
    label: 'Acknowledge & Dismiss',
    description: 'Acknowledge this violation and dismiss the alert',
    actor: 'approver',
    difficulty: 'easy',
    oneClick: true,
    requiresConfirmation: true,
    estimatedTime: '1 minute',
  },
};

// =============================================================================
// Remediation Engine
// =============================================================================

/**
 * Configuration for the remediation engine
 */
export interface RemediationEngineConfig {
  /** Base URL for policy documentation */
  policyDocsBaseUrl?: string;
  /** Base URL for one-click action endpoints */
  apiBaseUrl?: string;
  /** Base URL for dashboard/UI */
  dashboardBaseUrl?: string;
  /** Custom action generators by violation type */
  customGenerators?: Partial<Record<ViolationType, (violation: Violation) => RemediationAction[]>>;
  /** Custom policy link resolver */
  policyLinkResolver?: (policyId: string) => PolicyLink | undefined;
}

/**
 * Engine for generating remediation suggestions
 */
export class RemediationEngine {
  private readonly config: RemediationEngineConfig;

  constructor(config: RemediationEngineConfig = {}) {
    this.config = config;
  }

  /**
   * Generate remediation suggestions for a violation
   */
  generate(violation: Violation): RemediationSuggestion {
    const actions = this.generateActions(violation);
    const policyLinks = this.generatePolicyLinks(violation);
    const { title, explanation, rootCause, impact } = this.generateExplanation(violation);

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
      notes: this.generateNotes(violation),
      tags: this.generateTags(violation),
      generatedAt: new Date(),
      expiresAt: this.calculateExpiry(violation),
    };
  }

  /**
   * Generate actions based on violation type
   */
  private generateActions(violation: Violation): RemediationAction[] {
    // Check for custom generators first
    const customGenerator = this.config.customGenerators?.[violation.type];
    if (customGenerator) {
      return customGenerator(violation);
    }

    switch (violation.type) {
      case 'policy-denied':
        return this.generatePolicyDeniedActions(violation);
      case 'approval-bypassed':
        return this.generateApprovalBypassedActions(violation);
      case 'limit-exceeded':
        return this.generateLimitExceededActions(violation);
      case 'anomaly-detected':
        return this.generateAnomalyDetectedActions(violation);
      default:
        return this.generateDefaultActions(violation);
    }
  }

  /**
   * Actions for policy-denied violations
   */
  private generatePolicyDeniedActions(violation: Violation): RemediationAction[] {
    const details = violation.details as PolicyDeniedDetails | undefined;
    const actions: RemediationAction[] = [];

    // Primary: Request approval
    actions.push(this.createAction('request_approval', violation, {
      endpoint: this.config.apiBaseUrl
        ? `${this.config.apiBaseUrl}/approvals/request`
        : undefined,
      method: 'POST',
      payloadTemplate: {
        violationId: violation.id,
        action: violation.action.type,
        resourceId: violation.resource.id,
        justification: '{{user_input}}',
      },
    }));

    // Secondary: Modify request
    actions.push(this.createAction('modify_request', violation, {
      url: this.config.dashboardBaseUrl
        ? `${this.config.dashboardBaseUrl}/actions/new`
        : undefined,
    }));

    // If effect is 'deny' with a specific policy, offer exception
    if (details?.effect === 'deny' && details.policyId) {
      actions.push(this.createAction('add_exception', violation, {
        endpoint: this.config.apiBaseUrl
          ? `${this.config.apiBaseUrl}/policies/${details.policyId}/exceptions`
          : undefined,
        method: 'POST',
        payloadTemplate: {
          actorId: violation.actor.id,
          resourceId: violation.resource.id,
          action: violation.action.type,
          expiresIn: '24h',
          reason: '{{user_input}}',
        },
      }));
    }

    // Contact admin as fallback
    actions.push(this.createAction('contact_admin', violation));

    return actions;
  }

  /**
   * Actions for approval-bypassed violations
   */
  private generateApprovalBypassedActions(violation: Violation): RemediationAction[] {
    const details = violation.details as ApprovalBypassedDetails | undefined;
    const actions: RemediationAction[] = [];

    // Primary: Document justification
    actions.push(this.createAction('document_justification', violation, {
      endpoint: this.config.apiBaseUrl
        ? `${this.config.apiBaseUrl}/violations/${violation.id}/justification`
        : undefined,
      method: 'POST',
      payloadTemplate: {
        justification: '{{user_input}}',
        urgencyReason: '{{user_input}}',
      },
    }));

    // Request retroactive approval
    actions.push(this.createAction('request_approval', violation, {
      label: 'Request Retroactive Approval',
      description: 'Request approval from required approvers after the fact',
      endpoint: this.config.apiBaseUrl
        ? `${this.config.apiBaseUrl}/approvals/request`
        : undefined,
      method: 'POST',
      payloadTemplate: {
        violationId: violation.id,
        retroactive: true,
        requiredApprovers: details?.requiredApprovers,
      },
    }));

    // Escalate for review
    actions.push(this.createAction('escalate', violation, {
      endpoint: this.config.apiBaseUrl
        ? `${this.config.apiBaseUrl}/violations/${violation.id}/escalate`
        : undefined,
      method: 'POST',
    }));

    // Acknowledge (for approvers)
    actions.push(this.createAction('acknowledge', violation, {
      endpoint: this.config.apiBaseUrl
        ? `${this.config.apiBaseUrl}/violations/${violation.id}/acknowledge`
        : undefined,
      method: 'POST',
    }));

    return actions;
  }

  /**
   * Actions for limit-exceeded violations
   */
  private generateLimitExceededActions(violation: Violation): RemediationAction[] {
    const details = violation.details as LimitExceededDetails | undefined;
    const actions: RemediationAction[] = [];

    // Calculate wait time if available
    const waitTime = details?.window
      ? this.formatWindow(details.window)
      : 'the cooldown period';

    // Primary: Wait for cooldown
    actions.push(this.createAction('wait_cooldown', violation, {
      description: `Wait for ${waitTime} for the rate limit to reset`,
      estimatedTime: waitTime,
    }));

    // Request quota increase
    actions.push(this.createAction('request_quota', violation, {
      endpoint: this.config.apiBaseUrl
        ? `${this.config.apiBaseUrl}/quotas/request`
        : undefined,
      method: 'POST',
      payloadTemplate: {
        actorId: violation.actor.id,
        currentLimit: details?.limit,
        requestedLimit: details?.limit ? details.limit * 2 : undefined,
        justification: '{{user_input}}',
      },
    }));

    // Contact admin
    actions.push(this.createAction('contact_admin', violation, {
      description: 'Contact an administrator to discuss rate limit adjustments',
    }));

    return actions;
  }

  /**
   * Actions for anomaly-detected violations
   */
  private generateAnomalyDetectedActions(violation: Violation): RemediationAction[] {
    const details = violation.details as AnomalyDetectedDetails | undefined;
    const actions: RemediationAction[] = [];

    // Primary: Verify identity (if this was the user)
    actions.push(this.createAction('verify_identity', violation, {
      endpoint: this.config.apiBaseUrl
        ? `${this.config.apiBaseUrl}/identity/verify`
        : undefined,
      method: 'POST',
      payloadTemplate: {
        violationId: violation.id,
        actorId: violation.actor.id,
        verificationMethod: 'mfa',
      },
    }));

    // Review recent activity
    actions.push(this.createAction('review_activity', violation, {
      url: this.config.dashboardBaseUrl
        ? `${this.config.dashboardBaseUrl}/activity?actor=${violation.actor.id}`
        : undefined,
    }));

    // Escalate if high confidence anomaly
    if (details?.confidence && details.confidence >= 0.8) {
      actions.push(this.createAction('escalate', violation, {
        label: 'Report Suspicious Activity',
        description: 'Report this activity to the security team for investigation',
        endpoint: this.config.apiBaseUrl
          ? `${this.config.apiBaseUrl}/security/report`
          : undefined,
        method: 'POST',
        payloadTemplate: {
          violationId: violation.id,
          anomalyType: details.anomalyType,
          confidence: details.confidence,
        },
      }));
    }

    // Acknowledge if low severity
    if (violation.severity === 'low' || violation.severity === 'medium') {
      actions.push(this.createAction('acknowledge', violation, {
        description: 'Confirm this was expected behavior and dismiss the alert',
      }));
    }

    return actions;
  }

  /**
   * Default actions for unknown violation types
   */
  private generateDefaultActions(violation: Violation): RemediationAction[] {
    return [
      this.createAction('contact_admin', violation),
      this.createAction('escalate', violation),
      this.createAction('acknowledge', violation),
    ];
  }

  /**
   * Create a remediation action from template
   */
  private createAction(
    templateKey: string,
    violation: Violation,
    overrides: Partial<RemediationAction> = {}
  ): RemediationAction {
    const template = ACTION_TEMPLATES[templateKey];
    if (!template) {
      throw new Error(`Unknown action template: ${templateKey}`);
    }

    return {
      id: `action-${violation.id}-${templateKey}-${Date.now()}`,
      type: template.type,
      label: overrides.label ?? template.label,
      description: overrides.description ?? template.description,
      actor: overrides.actor ?? template.actor,
      difficulty: overrides.difficulty ?? template.difficulty,
      oneClick: overrides.oneClick ?? template.oneClick ?? false,
      endpoint: overrides.endpoint,
      method: overrides.method,
      payloadTemplate: overrides.payloadTemplate,
      url: overrides.url,
      estimatedTime: overrides.estimatedTime ?? template.estimatedTime,
      requiresConfirmation: overrides.requiresConfirmation ?? template.requiresConfirmation ?? true,
    };
  }

  /**
   * Generate policy links for a violation
   */
  private generatePolicyLinks(violation: Violation): PolicyLink[] {
    const links: PolicyLink[] = [];

    // Check for custom resolver
    if (this.config.policyLinkResolver) {
      const details = violation.details as PolicyDeniedDetails | undefined;
      if (details?.policyId) {
        const link = this.config.policyLinkResolver(details.policyId);
        if (link) {
          links.push(link);
        }
      }
    }

    // Generate default policy links based on violation type
    switch (violation.type) {
      case 'policy-denied': {
        const details = violation.details as PolicyDeniedDetails | undefined;
        if (details?.policyId) {
          links.push({
            policyId: details.policyId,
            policyName: details.policyName ?? 'Policy',
            documentationUrl: this.config.policyDocsBaseUrl
              ? `${this.config.policyDocsBaseUrl}/policies/${details.policyId}`
              : undefined,
            relevance: 'This policy blocked the attempted action',
          });
        }
        break;
      }

      case 'approval-bypassed': {
        const details = violation.details as ApprovalBypassedDetails | undefined;
        if (details?.workflowId) {
          links.push({
            policyId: details.workflowId,
            policyName: details.workflowName ?? 'Approval Workflow',
            documentationUrl: this.config.policyDocsBaseUrl
              ? `${this.config.policyDocsBaseUrl}/workflows/${details.workflowId}`
              : undefined,
            relevance: 'This workflow requires approval before proceeding',
          });
        }
        break;
      }

      case 'limit-exceeded': {
        const details = violation.details as LimitExceededDetails | undefined;
        links.push({
          policyId: 'rate-limits',
          policyName: 'Rate Limiting Policy',
          documentationUrl: this.config.policyDocsBaseUrl
            ? `${this.config.policyDocsBaseUrl}/rate-limits`
            : undefined,
          section: details?.limitType,
          relevance: 'This policy defines rate limits for API operations',
        });
        break;
      }

      case 'anomaly-detected': {
        links.push({
          policyId: 'security-monitoring',
          policyName: 'Security Monitoring Policy',
          documentationUrl: this.config.policyDocsBaseUrl
            ? `${this.config.policyDocsBaseUrl}/security/monitoring`
            : undefined,
          relevance: 'This policy defines what constitutes anomalous behavior',
        });
        break;
      }
    }

    return links;
  }

  /**
   * Generate explanation content for a violation
   */
  private generateExplanation(violation: Violation): {
    title: string;
    explanation: string;
    rootCause: string;
    impact: string;
  } {
    switch (violation.type) {
      case 'policy-denied': {
        const details = violation.details as PolicyDeniedDetails | undefined;
        return {
          title: 'Action Blocked by Policy',
          explanation: `Your attempt to ${violation.action.type} on ${violation.resource.name || violation.resource.id} was blocked because it violates ${details?.policyName || 'a security policy'}.`,
          rootCause: details?.ruleDescription || 'The action does not meet the requirements defined in the policy.',
          impact: 'The requested operation was not performed. Your work may be blocked until this is resolved.',
        };
      }

      case 'approval-bypassed': {
        const details = violation.details as ApprovalBypassedDetails | undefined;
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
        const details = violation.details as LimitExceededDetails | undefined;
        return {
          title: 'Rate Limit Exceeded',
          explanation: `You have exceeded the ${details?.limitType || 'rate'} limit for ${violation.action.type} operations.`,
          rootCause: details
            ? `Current: ${details.actual}/${details.limit} (${Math.round((details.actual / details.limit) * 100)}% of limit)`
            : 'Too many requests in a short time period.',
          impact: 'Further requests will be rejected until the rate limit resets.',
        };
      }

      case 'anomaly-detected': {
        const details = violation.details as AnomalyDetectedDetails | undefined;
        return {
          title: 'Unusual Activity Detected',
          explanation: `An unusual pattern was detected: ${details?.anomalyType || 'abnormal behavior'} during ${violation.action.type}.`,
          rootCause: details
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

  /**
   * Generate contextual notes
   */
  private generateNotes(violation: Violation): string[] {
    const notes: string[] = [];

    // Severity-based notes
    if (violation.severity === 'critical') {
      notes.push('This is a critical violation and requires immediate attention.');
    } else if (violation.severity === 'high') {
      notes.push('This is a high-severity violation and should be addressed promptly.');
    }

    // Type-specific notes
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

  /**
   * Generate tags for categorization
   */
  private generateTags(violation: Violation): string[] {
    const tags: string[] = [
      violation.type,
      violation.severity,
      violation.resource.type,
      violation.action.type,
    ];

    // Add details-specific tags
    switch (violation.type) {
      case 'policy-denied': {
        const details = violation.details as PolicyDeniedDetails | undefined;
        if (details?.effect) tags.push(`effect:${details.effect}`);
        break;
      }
      case 'limit-exceeded': {
        const details = violation.details as LimitExceededDetails | undefined;
        if (details?.limitType) tags.push(`limit:${details.limitType}`);
        break;
      }
      case 'anomaly-detected': {
        const details = violation.details as AnomalyDetectedDetails | undefined;
        if (details?.anomalyType) tags.push(`anomaly:${details.anomalyType}`);
        break;
      }
    }

    return tags;
  }

  /**
   * Calculate expiry for time-sensitive suggestions
   */
  private calculateExpiry(violation: Violation): Date | undefined {
    // Rate limit suggestions expire when the window resets
    if (violation.type === 'limit-exceeded') {
      const details = violation.details as LimitExceededDetails | undefined;
      if (details?.window) {
        const windowMs = this.windowToMs(details.window);
        return new Date(Date.now() + windowMs);
      }
    }

    // Default: suggestions expire after 7 days
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  /**
   * Convert window object to milliseconds
   */
  private windowToMs(window: { unit: string; duration: number }): number {
    const unitMs: Record<string, number> = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };
    return (unitMs[window.unit] ?? 1000) * window.duration;
  }

  /**
   * Format window object in human-readable form
   */
  private formatWindow(window: { unit: string; duration: number }): string {
    const plural = window.duration !== 1 ? 's' : '';
    return `${window.duration} ${window.unit}${plural}`;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a remediation engine
 */
export function createRemediationEngine(config?: RemediationEngineConfig): RemediationEngine {
  return new RemediationEngine(config);
}

/**
 * Generate suggestions for a violation (convenience function)
 */
export function generateRemediation(
  violation: Violation,
  config?: RemediationEngineConfig
): RemediationSuggestion {
  const engine = new RemediationEngine(config);
  return engine.generate(violation);
}

// =============================================================================
// Singleton Management
// =============================================================================

let defaultEngine: RemediationEngine | undefined;

/**
 * Initialize the default remediation engine
 */
export function initializeRemediationEngine(config?: RemediationEngineConfig): RemediationEngine {
  defaultEngine = new RemediationEngine(config);
  return defaultEngine;
}

/**
 * Get the default remediation engine
 * @throws Error if not initialized
 */
export function getRemediationEngine(): RemediationEngine {
  if (!defaultEngine) {
    throw new Error('Remediation engine not initialized. Call initializeRemediationEngine first.');
  }
  return defaultEngine;
}

/**
 * Set the default remediation engine (for testing)
 */
export function setRemediationEngine(engine: RemediationEngine): void {
  defaultEngine = engine;
}

/**
 * Reset the default remediation engine
 */
export function resetRemediationEngine(): void {
  defaultEngine = undefined;
}

// =============================================================================
// Integration Helpers
// =============================================================================

/**
 * Enrich a violation with remediation suggestions
 */
export function enrichViolationWithRemediation(
  violation: Violation,
  config?: RemediationEngineConfig
): Violation & { remediation: RemediationSuggestion } {
  const suggestion = generateRemediation(violation, config);
  return {
    ...violation,
    remediation: suggestion,
  };
}

/**
 * Get the primary (recommended) action for a violation
 */
export function getPrimaryRemediationAction(
  violation: Violation,
  config?: RemediationEngineConfig
): RemediationAction | undefined {
  const suggestion = generateRemediation(violation, config);
  return suggestion.actions[0];
}

/**
 * Get one-click actions for a violation
 */
export function getOneClickActions(
  violation: Violation,
  config?: RemediationEngineConfig
): RemediationAction[] {
  const suggestion = generateRemediation(violation, config);
  return suggestion.actions.filter(a => a.oneClick);
}

/**
 * Filter actions by actor type
 */
export function getActionsForActor(
  suggestion: RemediationSuggestion,
  actor: RemediationActor
): RemediationAction[] {
  return suggestion.actions.filter(a => a.actor === actor);
}
