/**
 * Signals Module - Phase 14: Signals → PR Queue
 *
 * This module provides:
 * - Signal ingestion adapters (GitHub, webhook, manual)
 * - Deterministic scoring with explainability
 * - Deduplication and normalization
 * - Work item creation and queue management
 * - PR candidate generation triggers
 *
 * @module @gwi/core/signals
 */

import type {
  SignalSource,
  SignalContext,
  WorkItem,
  WorkItemType,
  ScoreBreakdown,
  ScoreModifier,
  CandidatePlan,
  CandidateRisk,
  CandidateIntentReceipt,
  SignalStore,
  WorkItemStore,
} from '../storage/interfaces.js';
import { createHash } from 'crypto';

// =============================================================================
// Signal Extraction
// =============================================================================

/**
 * Extract signal context from GitHub webhook payload
 */
export function extractGitHubContext(
  _event: string,
  payload: Record<string, unknown>
): SignalContext {
  const repository = payload.repository as Record<string, unknown> | undefined;
  const sender = payload.sender as Record<string, unknown> | undefined;
  const issue = payload.issue as Record<string, unknown> | undefined;
  const pullRequest = payload.pull_request as Record<string, unknown> | undefined;
  const comment = payload.comment as Record<string, unknown> | undefined;

  const context: SignalContext = {
    actor: sender?.login as string | undefined,
    action: payload.action as string | undefined,
  };

  // Repository context
  if (repository) {
    const fullName = repository.full_name as string;
    const [owner, name] = fullName.split('/');
    context.repo = {
      owner,
      name,
      fullName,
      id: repository.id as number,
    };
  }

  // Issue context
  if (issue) {
    context.resourceType = 'issue';
    context.resourceNumber = issue.number as number;
    context.resourceUrl = issue.html_url as string;
    context.title = issue.title as string;
    context.body = issue.body as string;
    context.labels = ((issue.labels as Array<{ name: string }>) || []).map(l => l.name);
  }

  // PR context (overrides issue if present)
  if (pullRequest) {
    context.resourceType = 'pr';
    context.resourceNumber = pullRequest.number as number;
    context.resourceUrl = pullRequest.html_url as string;
    context.title = pullRequest.title as string;
    context.body = pullRequest.body as string;
    context.labels = ((pullRequest.labels as Array<{ name: string }>) || []).map(l => l.name);
  }

  // Comment context
  if (comment && !pullRequest && !issue) {
    context.resourceType = 'comment';
    context.resourceUrl = comment.html_url as string;
    context.body = comment.body as string;
  }

  return context;
}

/**
 * Determine signal source from GitHub event type
 */
export function getSignalSourceFromEvent(event: string): SignalSource {
  switch (event) {
    case 'issues':
      return 'github_issue';
    case 'pull_request':
    case 'pull_request_review':
    case 'pull_request_review_comment':
      return 'github_pr';
    case 'issue_comment':
    case 'commit_comment':
      return 'github_comment';
    default:
      return 'webhook';
  }
}

// =============================================================================
// Deterministic Scoring
// =============================================================================

/**
 * Base scores by signal type
 */
const BASE_SCORES: Record<SignalSource, number> = {
  github_issue: 50,
  github_pr: 60,
  github_comment: 30,
  webhook: 40,
  scheduled: 45,
  manual: 70,
  api: 55,
};

/**
 * Work item type base scores
 */
const TYPE_SCORES: Record<WorkItemType, number> = {
  issue_to_code: 60,
  pr_review: 50,
  pr_resolve: 70,
  docs_update: 40,
  test_gen: 45,
  custom: 50,
};

/**
 * Calculate score for a work item
 *
 * This is deterministic: same inputs always produce same score.
 */
export function calculateScore(
  source: SignalSource,
  type: WorkItemType,
  context: SignalContext,
  tenantPolicy?: {
    priorityLabels?: string[];
    urgentLabels?: string[];
    lowPriorityLabels?: string[];
  }
): ScoreBreakdown {
  const modifiers: ScoreModifier[] = [];

  // Start with base score from source
  const sourceScore = BASE_SCORES[source];
  modifiers.push({
    name: 'source_base',
    value: sourceScore,
    reason: `Base score for ${source} signal`,
  });

  // Add type modifier
  const typeModifier = TYPE_SCORES[type] - 50; // Normalize around 50
  if (typeModifier !== 0) {
    modifiers.push({
      name: 'work_type',
      value: typeModifier,
      reason: `${type} work type adjustment`,
    });
  }

  // Label-based modifiers
  if (context.labels && tenantPolicy) {
    // Priority labels boost
    if (tenantPolicy.priorityLabels) {
      const hasPriority = context.labels.some(l =>
        tenantPolicy.priorityLabels!.includes(l.toLowerCase())
      );
      if (hasPriority) {
        modifiers.push({
          name: 'priority_label',
          value: 15,
          reason: 'Has priority label',
        });
      }
    }

    // Urgent labels boost
    if (tenantPolicy.urgentLabels) {
      const hasUrgent = context.labels.some(l =>
        tenantPolicy.urgentLabels!.includes(l.toLowerCase())
      );
      if (hasUrgent) {
        modifiers.push({
          name: 'urgent_label',
          value: 25,
          reason: 'Has urgent label',
        });
      }
    }

    // Low priority labels reduce
    if (tenantPolicy.lowPriorityLabels) {
      const hasLowPriority = context.labels.some(l =>
        tenantPolicy.lowPriorityLabels!.includes(l.toLowerCase())
      );
      if (hasLowPriority) {
        modifiers.push({
          name: 'low_priority_label',
          value: -20,
          reason: 'Has low priority label',
        });
      }
    }

    // Bug label boost
    if (context.labels.some(l => l.toLowerCase() === 'bug')) {
      modifiers.push({
        name: 'bug_label',
        value: 10,
        reason: 'Bug fix request',
      });
    }

    // Enhancement/feature label
    if (context.labels.some(l => ['enhancement', 'feature'].includes(l.toLowerCase()))) {
      modifiers.push({
        name: 'feature_label',
        value: 5,
        reason: 'New feature request',
      });
    }
  }

  // Title-based heuristics
  if (context.title) {
    const lowerTitle = context.title.toLowerCase();

    // Security-related boost
    if (lowerTitle.includes('security') || lowerTitle.includes('vulnerability')) {
      modifiers.push({
        name: 'security_keyword',
        value: 20,
        reason: 'Security-related issue',
      });
    }

    // Breaking change boost
    if (lowerTitle.includes('breaking') || lowerTitle.includes('critical')) {
      modifiers.push({
        name: 'critical_keyword',
        value: 15,
        reason: 'Critical/breaking change',
      });
    }

    // Documentation request (lower priority)
    if (lowerTitle.includes('docs') || lowerTitle.includes('documentation')) {
      modifiers.push({
        name: 'docs_keyword',
        value: -5,
        reason: 'Documentation-only change',
      });
    }
  }

  // Calculate final score
  const baseScore = sourceScore;
  const totalModifiers = modifiers.slice(1).reduce((sum, m) => sum + m.value, 0);
  const finalScore = Math.max(0, Math.min(100, baseScore + totalModifiers));

  // Generate explanation
  const explanation = modifiers
    .filter(m => m.name !== 'source_base')
    .map(m => `${m.value > 0 ? '+' : ''}${m.value}: ${m.reason}`)
    .join('; ') || 'No modifiers applied';

  return {
    baseScore,
    modifiers,
    finalScore,
    explanation: `Base: ${baseScore}. ${explanation}. Final: ${finalScore}`,
  };
}

// =============================================================================
// Deduplication
// =============================================================================

/**
 * Generate a dedupe key for a signal
 *
 * Format: {tenantId}:{repo}:{resourceType}:{resourceNumber}:{titleHash}
 */
export function generateDedupeKey(
  tenantId: string,
  context: SignalContext
): string {
  const parts: string[] = [tenantId];

  if (context.repo) {
    parts.push(context.repo.fullName);
  }

  if (context.resourceType) {
    parts.push(context.resourceType);
  }

  if (context.resourceNumber) {
    parts.push(String(context.resourceNumber));
  }

  // Add title hash for uniqueness
  if (context.title) {
    const titleHash = createHash('sha256')
      .update(context.title.toLowerCase().trim())
      .digest('hex')
      .slice(0, 8);
    parts.push(titleHash);
  }

  return parts.join(':');
}

/**
 * Determine work item type from signal context
 */
export function inferWorkItemType(
  source: SignalSource,
  context: SignalContext
): WorkItemType {
  // PR-related
  if (source === 'github_pr' || context.resourceType === 'pr') {
    // Check for conflict signals
    if (context.labels?.some(l => l.toLowerCase().includes('conflict'))) {
      return 'pr_resolve';
    }
    return 'pr_review';
  }

  // Issue-related
  if (source === 'github_issue' || context.resourceType === 'issue') {
    // Check for documentation labels
    if (context.labels?.some(l => ['docs', 'documentation'].includes(l.toLowerCase()))) {
      return 'docs_update';
    }
    // Check for test labels
    if (context.labels?.some(l => ['test', 'tests', 'testing'].includes(l.toLowerCase()))) {
      return 'test_gen';
    }
    return 'issue_to_code';
  }

  return 'custom';
}

// =============================================================================
// Signal Processor Service
// =============================================================================

/**
 * Signal processor configuration
 */
export interface SignalProcessorConfig {
  /** Tenant policy for scoring */
  tenantPolicy?: {
    priorityLabels?: string[];
    urgentLabels?: string[];
    lowPriorityLabels?: string[];
  };
  /** Minimum score to create work item (default: 20) */
  minScoreThreshold?: number;
  /** Auto-ignore certain actions (default: ['closed', 'deleted']) */
  ignoreActions?: string[];
}

/**
 * Signal processor result
 */
export interface ProcessSignalResult {
  /** Whether signal was processed */
  processed: boolean;
  /** Resulting work item (if created or updated) */
  workItem?: WorkItem;
  /** Reason if ignored */
  ignoredReason?: string;
  /** Error if failed */
  error?: string;
}

/**
 * Signal Processor - converts signals to work items
 */
export class SignalProcessor {
  constructor(
    private signalStore: SignalStore,
    private workItemStore: WorkItemStore,
    private config: SignalProcessorConfig = {}
  ) {}

  /**
   * Process a single signal
   */
  async processSignal(signalId: string): Promise<ProcessSignalResult> {
    const signal = await this.signalStore.getSignal(signalId);
    if (!signal) {
      return { processed: false, error: 'Signal not found' };
    }

    if (signal.status !== 'pending') {
      return { processed: false, ignoredReason: `Signal already ${signal.status}` };
    }

    // Check if action should be ignored
    const ignoreActions = this.config.ignoreActions || ['closed', 'deleted'];
    if (signal.context.action && ignoreActions.includes(signal.context.action)) {
      await this.signalStore.updateSignal(signalId, {
        status: 'ignored',
        processingMeta: {
          processedAt: new Date(),
          ignoredReason: `Action '${signal.context.action}' is ignored`,
        },
      });
      return { processed: false, ignoredReason: `Action '${signal.context.action}' is ignored` };
    }

    try {
      // Generate dedupe key
      const dedupeKey = generateDedupeKey(signal.tenantId, signal.context);

      // Check for existing work item
      const existingItem = await this.workItemStore.getWorkItemByDedupeKey(
        signal.tenantId,
        dedupeKey
      );

      if (existingItem) {
        // Merge signal into existing work item
        const updatedItem = await this.workItemStore.addSignalToWorkItem(
          existingItem.id,
          signalId
        );
        await this.signalStore.updateSignal(signalId, {
          status: 'processed',
          processingMeta: {
            processedAt: new Date(),
            workItemId: existingItem.id,
          },
        });
        return { processed: true, workItem: updatedItem };
      }

      // Determine work item type
      const type = inferWorkItemType(signal.source, signal.context);

      // Calculate score
      const scoreBreakdown = calculateScore(
        signal.source,
        type,
        signal.context,
        this.config.tenantPolicy
      );

      // Check minimum score threshold
      const minScore = this.config.minScoreThreshold ?? 20;
      if (scoreBreakdown.finalScore < minScore) {
        await this.signalStore.updateSignal(signalId, {
          status: 'ignored',
          processingMeta: {
            processedAt: new Date(),
            ignoredReason: `Score ${scoreBreakdown.finalScore} below threshold ${minScore}`,
          },
        });
        return {
          processed: false,
          ignoredReason: `Score ${scoreBreakdown.finalScore} below threshold ${minScore}`,
        };
      }

      // Create work item
      const workItem = await this.workItemStore.createWorkItem({
        tenantId: signal.tenantId,
        type,
        title: signal.context.title || `${type} from ${signal.source}`,
        summary: signal.context.body?.slice(0, 500) || 'No description provided',
        status: 'queued',
        dedupeKey,
        score: scoreBreakdown.finalScore,
        scoreBreakdown,
        signalIds: [signalId],
        evidence: {
          sourceUrls: signal.context.resourceUrl ? [signal.context.resourceUrl] : [],
        },
        repo: signal.context.repo,
        resourceNumber: signal.context.resourceNumber,
        resourceUrl: signal.context.resourceUrl,
      });

      // Update signal
      await this.signalStore.updateSignal(signalId, {
        status: 'processed',
        processingMeta: {
          processedAt: new Date(),
          workItemId: workItem.id,
        },
      });

      return { processed: true, workItem };
    } catch (error) {
      await this.signalStore.updateSignal(signalId, {
        status: 'failed',
        processingMeta: {
          processedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      return { processed: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Process all pending signals for a tenant
   */
  async processPendingSignals(tenantId: string, limit = 100): Promise<{
    processed: number;
    ignored: number;
    failed: number;
    workItemsCreated: number;
  }> {
    const pendingSignals = await this.signalStore.listPendingSignals(tenantId, limit);

    let processed = 0;
    let ignored = 0;
    let failed = 0;
    let workItemsCreated = 0;

    for (const signal of pendingSignals) {
      const result = await this.processSignal(signal.id);

      if (result.processed) {
        processed++;
        if (result.workItem && result.workItem.signalIds.length === 1) {
          workItemsCreated++;
        }
      } else if (result.ignoredReason) {
        ignored++;
      } else if (result.error) {
        failed++;
      }
    }

    return { processed, ignored, failed, workItemsCreated };
  }
}

// =============================================================================
// PR Candidate Generator
// =============================================================================

/**
 * Generate Intent Receipt for a PR candidate
 */
export function createCandidateIntentReceipt(
  workItem: WorkItem,
  plan: CandidatePlan,
  actor: string
): CandidateIntentReceipt {
  return {
    intent: `Generate ${workItem.type.replace(/_/g, ' ')} for: ${workItem.title}`,
    changeSummary: plan.summary,
    actor,
    when: new Date().toISOString(),
    scope: workItem.repo
      ? `${workItem.repo.fullName}${workItem.resourceNumber ? `#${workItem.resourceNumber}` : ''}`
      : 'Unknown scope',
    policyApproval: 'Pending approval',
    evidence: `Score: ${workItem.score}/100. ${workItem.scoreBreakdown.explanation}`,
  };
}

/**
 * Assess risk for a PR candidate
 */
export function assessCandidateRisk(
  plan: CandidatePlan,
  _workItem: WorkItem
): CandidateRisk {
  const factors: Array<{ name: string; severity: number; description: string }> = [];
  let totalSeverity = 0;

  // File count risk
  if (plan.affectedFiles.length > 10) {
    factors.push({
      name: 'large_change',
      severity: 3,
      description: `Changes ${plan.affectedFiles.length} files`,
    });
    totalSeverity += 3;
  } else if (plan.affectedFiles.length > 5) {
    factors.push({
      name: 'moderate_change',
      severity: 2,
      description: `Changes ${plan.affectedFiles.length} files`,
    });
    totalSeverity += 2;
  }

  // Complexity risk
  if (plan.complexity >= 4) {
    factors.push({
      name: 'high_complexity',
      severity: 4,
      description: `Complexity score: ${plan.complexity}/5`,
    });
    totalSeverity += 4;
  } else if (plan.complexity >= 3) {
    factors.push({
      name: 'moderate_complexity',
      severity: 2,
      description: `Complexity score: ${plan.complexity}/5`,
    });
    totalSeverity += 2;
  }

  // Security-related risk
  const hasSecurityFiles = plan.affectedFiles.some(f =>
    f.includes('auth') || f.includes('security') || f.includes('credential')
  );
  if (hasSecurityFiles) {
    factors.push({
      name: 'security_files',
      severity: 4,
      description: 'Changes security-related files',
    });
    totalSeverity += 4;
  }

  // Config file risk
  const hasConfigFiles = plan.affectedFiles.some(f =>
    f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.env')
  );
  if (hasConfigFiles) {
    factors.push({
      name: 'config_files',
      severity: 2,
      description: 'Changes configuration files',
    });
    totalSeverity += 2;
  }

  // Calculate risk level
  const riskScore = Math.min(100, (totalSeverity / factors.length) * 25 || 0);
  let level: CandidateRisk['level'];
  if (riskScore >= 75) {
    level = 'critical';
  } else if (riskScore >= 50) {
    level = 'high';
  } else if (riskScore >= 25) {
    level = 'medium';
  } else {
    level = 'low';
  }

  // Generate mitigations
  const mitigations: string[] = [];
  if (factors.some(f => f.name === 'large_change')) {
    mitigations.push('Consider breaking into smaller changes');
  }
  if (factors.some(f => f.name === 'security_files')) {
    mitigations.push('Request security team review');
  }
  if (factors.some(f => f.name === 'high_complexity')) {
    mitigations.push('Add comprehensive tests before merging');
  }

  return {
    level,
    score: Math.round(riskScore),
    factors,
    mitigations: mitigations.length > 0 ? mitigations : undefined,
  };
}

// =============================================================================
// Exports
// =============================================================================

export type {
  Signal,
  SignalSource,
  SignalStatus,
  SignalContext,
  WorkItem,
  WorkItemStatus,
  WorkItemType,
  WorkItemEvidence,
  ScoreBreakdown,
  ScoreModifier,
  PRCandidate,
  PRCandidateStatus,
  CandidatePlan,
  CandidateRisk,
  CandidateIntentReceipt,
  SignalStore,
  WorkItemStore,
  PRCandidateStore,
} from '../storage/interfaces.js';
