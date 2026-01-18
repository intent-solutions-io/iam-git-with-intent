/**
 * Shared Violation Types
 *
 * Centralized type definitions for violations used across the dashboard.
 * Part of Epic D: Policy & Audit - D5.5: Create violation dashboard
 */

import { z } from 'zod';

// =============================================================================
// Violation Type Enums
// =============================================================================

export const ViolationTypeSchema = z.enum([
  'policy-denied',
  'approval-bypassed',
  'limit-exceeded',
  'anomaly-detected',
]);
export type ViolationType = z.infer<typeof ViolationTypeSchema>;

export const ViolationSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type ViolationSeverity = z.infer<typeof ViolationSeveritySchema>;

export const ViolationStatusSchema = z.enum([
  'open',
  'acknowledged',
  'investigating',
  'resolved',
  'dismissed',
  'escalated',
]);
export type ViolationStatus = z.infer<typeof ViolationStatusSchema>;

export const RemediationActorSchema = z.enum(['user', 'approver', 'admin', 'security_team']);
export type RemediationActor = z.infer<typeof RemediationActorSchema>;

export const RemediationDifficultySchema = z.enum(['easy', 'moderate', 'complex']);
export type RemediationDifficulty = z.infer<typeof RemediationDifficultySchema>;

// =============================================================================
// Core Violation Schema
// =============================================================================

export const ViolationActorSchema = z.object({
  type: z.string(),
  id: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
});

export const ViolationResourceSchema = z.object({
  type: z.string(),
  id: z.string(),
  name: z.string().optional(),
});

export const ViolationActionSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
});

export const ViolationSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  type: ViolationTypeSchema,
  severity: ViolationSeveritySchema,
  status: ViolationStatusSchema,
  source: z.string(),
  actor: ViolationActorSchema,
  resource: ViolationResourceSchema,
  action: ViolationActionSchema,
  summary: z.string(),
  details: z.record(z.unknown()).optional(),
  detectedAt: z.date(),
  acknowledgedAt: z.date().optional(),
  resolvedAt: z.date().optional(),
  resolvedBy: z.string().optional(),
  resolution: z.string().optional(),
});

export type Violation = z.infer<typeof ViolationSchema>;
export type ViolationActor = z.infer<typeof ViolationActorSchema>;
export type ViolationResource = z.infer<typeof ViolationResourceSchema>;
export type ViolationAction = z.infer<typeof ViolationActionSchema>;

// =============================================================================
// Filter Types
// =============================================================================

export interface ViolationFilters {
  type: ViolationType | 'all';
  severity: ViolationSeverity | 'all';
  status: ViolationStatus | 'all';
  timeRange: '1h' | '24h' | '7d' | '30d' | 'all';
}

// =============================================================================
// Remediation Types
// =============================================================================

export interface RemediationAction {
  id: string;
  type: string;
  label: string;
  description: string;
  actor: RemediationActor;
  difficulty: RemediationDifficulty;
  oneClick: boolean;
  endpoint?: string;
  method?: string;
  url?: string;
  estimatedTime?: string;
  requiresConfirmation: boolean;
}

export interface PolicyLink {
  policyId: string;
  policyName: string;
  documentationUrl?: string;
  section?: string;
  relevance: string;
}

export interface RemediationSuggestion {
  id: string;
  violationId: string;
  violationType: ViolationType;
  title: string;
  explanation: string;
  rootCause: string;
  impact: string;
  actions: RemediationAction[];
  policyLinks: PolicyLink[];
  notes?: string[];
  tags?: string[];
  generatedAt: Date;
  expiresAt?: Date;
}

// =============================================================================
// UI Constants
// =============================================================================

export const VIOLATION_TYPES: { value: ViolationType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'policy-denied', label: 'Policy Denied' },
  { value: 'approval-bypassed', label: 'Approval Bypassed' },
  { value: 'limit-exceeded', label: 'Limit Exceeded' },
  { value: 'anomaly-detected', label: 'Anomaly Detected' },
];

export const SEVERITIES: { value: ViolationSeverity | 'all'; label: string }[] = [
  { value: 'all', label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export const STATUSES: { value: ViolationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];

export const TIME_RANGES: { value: ViolationFilters['timeRange']; label: string }[] = [
  { value: '1h', label: 'Last Hour' },
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'all', label: 'All Time' },
];

export const SEVERITY_COLORS: Record<ViolationSeverity, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-green-100 text-green-800 border-green-200',
};

export const STATUS_COLORS: Record<ViolationStatus, string> = {
  open: 'bg-blue-100 text-blue-800',
  acknowledged: 'bg-purple-100 text-purple-800',
  investigating: 'bg-indigo-100 text-indigo-800',
  escalated: 'bg-red-100 text-red-800',
  resolved: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-800',
};

export const TYPE_LABELS: Record<ViolationType, string> = {
  'policy-denied': 'Policy Denied',
  'approval-bypassed': 'Approval Bypassed',
  'limit-exceeded': 'Limit Exceeded',
  'anomaly-detected': 'Anomaly Detected',
};

export const TYPE_ICONS: Record<ViolationType, string> = {
  'policy-denied': '🚫',
  'approval-bypassed': '⚠️',
  'limit-exceeded': '📊',
  'anomaly-detected': '🔍',
};

export const DIFFICULTY_COLORS: Record<RemediationDifficulty, string> = {
  easy: 'bg-green-100 text-green-800',
  moderate: 'bg-yellow-100 text-yellow-800',
  complex: 'bg-red-100 text-red-800',
};

export const ACTOR_LABELS: Record<RemediationActor, string> = {
  user: 'You',
  approver: 'Approver',
  admin: 'Admin',
  security_team: 'Security Team',
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the start time for a given time range filter
 */
export function getTimeRangeStart(range: ViolationFilters['timeRange']): Date | null {
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

/**
 * Format a date as a relative time string (e.g., "5m ago")
 */
export function formatTimeAgo(date: Date): string {
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

/**
 * Parse and validate violation data from Firestore
 * Returns null if validation fails
 */
export function parseViolation(data: Record<string, unknown>, id: string): Violation | null {
  try {
    // Handle Firestore Timestamps
    const detectedAt = data.detectedAt instanceof Date
      ? data.detectedAt
      : data.detectedAt && typeof data.detectedAt === 'object' && 'toDate' in data.detectedAt
        ? (data.detectedAt as { toDate: () => Date }).toDate()
        : new Date(data.detectedAt as string);

    const acknowledgedAt = data.acknowledgedAt
      ? data.acknowledgedAt instanceof Date
        ? data.acknowledgedAt
        : data.acknowledgedAt && typeof data.acknowledgedAt === 'object' && 'toDate' in data.acknowledgedAt
          ? (data.acknowledgedAt as { toDate: () => Date }).toDate()
          : new Date(data.acknowledgedAt as string)
      : undefined;

    const resolvedAt = data.resolvedAt
      ? data.resolvedAt instanceof Date
        ? data.resolvedAt
        : data.resolvedAt && typeof data.resolvedAt === 'object' && 'toDate' in data.resolvedAt
          ? (data.resolvedAt as { toDate: () => Date }).toDate()
          : new Date(data.resolvedAt as string)
      : undefined;

    return ViolationSchema.parse({
      id,
      tenantId: data.tenantId,
      type: data.type,
      severity: data.severity,
      status: data.status,
      source: data.source,
      actor: data.actor,
      resource: data.resource,
      action: data.action,
      summary: data.summary,
      details: data.details,
      detectedAt,
      acknowledgedAt,
      resolvedAt,
      resolvedBy: data.resolvedBy,
      resolution: data.resolution,
    });
  } catch (error) {
    console.error('Failed to parse violation:', error);
    return null;
  }
}
