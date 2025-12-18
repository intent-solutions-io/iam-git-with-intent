/**
 * Autopilot v2 Module
 *
 * Phase 48: Enhanced autonomous operation with intelligent decision-making.
 * Provides advanced autopilot capabilities for hands-off PR processing.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Autopilot mode
 */
export type AutopilotMode = 'full' | 'supervised' | 'suggestion_only' | 'disabled';

/**
 * Confidence level
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'uncertain';

/**
 * Decision type
 */
export type DecisionType =
  | 'approve'
  | 'request_changes'
  | 'merge'
  | 'close'
  | 'escalate'
  | 'defer'
  | 'skip';

/**
 * Autopilot decision
 */
export interface AutopilotDecision {
  id: string;
  type: DecisionType;
  confidence: ConfidenceLevel;
  score: number; // 0-100
  reasoning: string;
  factors: DecisionFactor[];
  suggestedActions: SuggestedAction[];
  requiresApproval: boolean;
  timestamp: Date;
}

/**
 * Decision factor
 */
export interface DecisionFactor {
  name: string;
  weight: number;
  value: number;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
}

/**
 * Suggested action
 */
export interface SuggestedAction {
  id: string;
  action: string;
  description: string;
  priority: number;
  automated: boolean;
  prerequisites?: string[];
}

/**
 * Autopilot configuration
 */
export interface AutopilotConfig {
  id: string;
  tenantId: string;
  mode: AutopilotMode;
  confidenceThreshold: number;
  autoMerge: boolean;
  autoApprove: boolean;
  autoClose: boolean;
  escalationRules: EscalationRule[];
  exclusions: {
    labels: string[];
    paths: string[];
    authors: string[];
    branches: string[];
  };
  safetyChecks: SafetyCheck[];
  notifications: NotificationConfig;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Escalation rule
 */
export interface EscalationRule {
  id: string;
  name: string;
  condition: string;
  escalateTo: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  timeout: number; // minutes
}

/**
 * Safety check
 */
export interface SafetyCheck {
  id: string;
  name: string;
  type: 'required' | 'recommended';
  condition: string;
  blockOnFailure: boolean;
  message: string;
}

/**
 * Notification config
 */
export interface NotificationConfig {
  onDecision: boolean;
  onEscalation: boolean;
  onError: boolean;
  channels: string[];
}

/**
 * Autopilot session
 */
export interface AutopilotSession {
  id: string;
  tenantId: string;
  configId: string;
  targetType: 'pr' | 'issue' | 'workflow';
  targetId: string;
  targetUrl: string;
  status: 'active' | 'paused' | 'completed' | 'failed' | 'escalated';
  decisions: AutopilotDecision[];
  actionsExecuted: ExecutedAction[];
  startTime: Date;
  endTime?: Date;
  error?: string;
}

/**
 * Executed action
 */
export interface ExecutedAction {
  id: string;
  sessionId: string;
  action: string;
  status: 'success' | 'failure' | 'skipped';
  result?: Record<string, unknown>;
  error?: string;
  executedAt: Date;
  durationMs: number;
}

/**
 * Learning feedback
 */
export interface LearningFeedback {
  id: string;
  sessionId: string;
  decisionId: string;
  correct: boolean;
  expectedDecision?: DecisionType;
  feedback?: string;
  providedBy: string;
  providedAt: Date;
}

// =============================================================================
// Store Interfaces
// =============================================================================

/**
 * Autopilot config store
 */
export interface AutopilotConfigStore {
  create(config: Omit<AutopilotConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AutopilotConfig>;
  get(id: string): Promise<AutopilotConfig | null>;
  getByTenant(tenantId: string): Promise<AutopilotConfig | null>;
  update(id: string, updates: Partial<AutopilotConfig>): Promise<AutopilotConfig>;
  delete(id: string): Promise<void>;
}

/**
 * Session store
 */
export interface AutopilotSessionStore {
  create(session: Omit<AutopilotSession, 'id'>): Promise<AutopilotSession>;
  get(id: string): Promise<AutopilotSession | null>;
  list(tenantId: string, options?: { status?: AutopilotSession['status']; limit?: number }): Promise<AutopilotSession[]>;
  update(id: string, updates: Partial<AutopilotSession>): Promise<AutopilotSession>;
  addDecision(sessionId: string, decision: AutopilotDecision): Promise<AutopilotSession>;
  addExecutedAction(sessionId: string, action: ExecutedAction): Promise<AutopilotSession>;
}

// =============================================================================
// In-Memory Stores
// =============================================================================

/**
 * In-memory config store
 */
export class InMemoryAutopilotConfigStore implements AutopilotConfigStore {
  private configs = new Map<string, AutopilotConfig>();
  private counter = 0;

  async create(config: Omit<AutopilotConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AutopilotConfig> {
    const id = `autopilot_config_${++this.counter}`;
    const autopilotConfig: AutopilotConfig = {
      ...config,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.configs.set(id, autopilotConfig);
    return autopilotConfig;
  }

  async get(id: string): Promise<AutopilotConfig | null> {
    return this.configs.get(id) || null;
  }

  async getByTenant(tenantId: string): Promise<AutopilotConfig | null> {
    return Array.from(this.configs.values()).find((c) => c.tenantId === tenantId) || null;
  }

  async update(id: string, updates: Partial<AutopilotConfig>): Promise<AutopilotConfig> {
    const config = this.configs.get(id);
    if (!config) throw new Error(`Config ${id} not found`);
    const updated = { ...config, ...updates, id, updatedAt: new Date() };
    this.configs.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.configs.delete(id);
  }
}

/**
 * In-memory session store
 */
export class InMemoryAutopilotSessionStore implements AutopilotSessionStore {
  private sessions = new Map<string, AutopilotSession>();
  private counter = 0;

  async create(session: Omit<AutopilotSession, 'id'>): Promise<AutopilotSession> {
    const id = `session_${++this.counter}`;
    const autopilotSession: AutopilotSession = { ...session, id };
    this.sessions.set(id, autopilotSession);
    return autopilotSession;
  }

  async get(id: string): Promise<AutopilotSession | null> {
    return this.sessions.get(id) || null;
  }

  async list(
    tenantId: string,
    options?: { status?: AutopilotSession['status']; limit?: number }
  ): Promise<AutopilotSession[]> {
    let sessions = Array.from(this.sessions.values()).filter((s) => s.tenantId === tenantId);

    if (options?.status) {
      sessions = sessions.filter((s) => s.status === options.status);
    }

    sessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    if (options?.limit) {
      sessions = sessions.slice(0, options.limit);
    }

    return sessions;
  }

  async update(id: string, updates: Partial<AutopilotSession>): Promise<AutopilotSession> {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    const updated = { ...session, ...updates, id };
    this.sessions.set(id, updated);
    return updated;
  }

  async addDecision(sessionId: string, decision: AutopilotDecision): Promise<AutopilotSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.decisions.push(decision);
    return session;
  }

  async addExecutedAction(sessionId: string, action: ExecutedAction): Promise<AutopilotSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.actionsExecuted.push(action);
    return session;
  }
}

// =============================================================================
// Autopilot Manager
// =============================================================================

/**
 * Autopilot Manager configuration
 */
export interface AutopilotManagerConfig {
  defaultConfidenceThreshold: number;
  maxSessionDuration: number;
  enableLearning: boolean;
}

/**
 * Default autopilot manager config
 */
export const DEFAULT_AUTOPILOT_CONFIG: AutopilotManagerConfig = {
  defaultConfidenceThreshold: 0.85,
  maxSessionDuration: 3600000, // 1 hour
  enableLearning: true,
};

/**
 * Decision weights
 */
export const DECISION_WEIGHTS = {
  testsPassing: 0.25,
  codeQuality: 0.2,
  reviewApproval: 0.2,
  mergeable: 0.15,
  ciSuccess: 0.1,
  authorTrust: 0.1,
};

/**
 * Autopilot Manager - manages autonomous PR processing
 */
export class AutopilotManager {
  private configStore: AutopilotConfigStore;
  private sessionStore: AutopilotSessionStore;
  private feedback: LearningFeedback[] = [];
  private decisionCounter = 0;
  private actionCounter = 0;
  private feedbackCounter = 0;

  constructor(
    configStore: AutopilotConfigStore,
    sessionStore: AutopilotSessionStore,
    _config: AutopilotManagerConfig = DEFAULT_AUTOPILOT_CONFIG
  ) {
    this.configStore = configStore;
    this.sessionStore = sessionStore;
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  async createConfig(config: Omit<AutopilotConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AutopilotConfig> {
    return this.configStore.create(config);
  }

  async getConfig(id: string): Promise<AutopilotConfig | null> {
    return this.configStore.get(id);
  }

  async getConfigForTenant(tenantId: string): Promise<AutopilotConfig | null> {
    return this.configStore.getByTenant(tenantId);
  }

  async updateConfig(id: string, updates: Partial<AutopilotConfig>): Promise<AutopilotConfig> {
    return this.configStore.update(id, updates);
  }

  // -------------------------------------------------------------------------
  // Session Management
  // -------------------------------------------------------------------------

  async startSession(
    tenantId: string,
    targetType: 'pr' | 'issue' | 'workflow',
    targetId: string,
    targetUrl: string
  ): Promise<AutopilotSession> {
    const config = await this.configStore.getByTenant(tenantId);
    if (!config) throw new Error('No autopilot configuration found for tenant');
    if (config.mode === 'disabled') throw new Error('Autopilot is disabled');

    return this.sessionStore.create({
      tenantId,
      configId: config.id,
      targetType,
      targetId,
      targetUrl,
      status: 'active',
      decisions: [],
      actionsExecuted: [],
      startTime: new Date(),
    });
  }

  async getSession(id: string): Promise<AutopilotSession | null> {
    return this.sessionStore.get(id);
  }

  async listSessions(
    tenantId: string,
    options?: { status?: AutopilotSession['status']; limit?: number }
  ): Promise<AutopilotSession[]> {
    return this.sessionStore.list(tenantId, options);
  }

  async pauseSession(sessionId: string): Promise<AutopilotSession> {
    return this.sessionStore.update(sessionId, { status: 'paused' });
  }

  async resumeSession(sessionId: string): Promise<AutopilotSession> {
    return this.sessionStore.update(sessionId, { status: 'active' });
  }

  async completeSession(sessionId: string): Promise<AutopilotSession> {
    return this.sessionStore.update(sessionId, {
      status: 'completed',
      endTime: new Date(),
    });
  }

  async failSession(sessionId: string, error: string): Promise<AutopilotSession> {
    return this.sessionStore.update(sessionId, {
      status: 'failed',
      endTime: new Date(),
      error,
    });
  }

  // -------------------------------------------------------------------------
  // Decision Making
  // -------------------------------------------------------------------------

  async makeDecision(
    sessionId: string,
    context: {
      testsPassing: boolean;
      codeQualityScore: number;
      reviewsApproved: number;
      reviewsRequested: number;
      isMergeable: boolean;
      ciPassed: boolean;
      authorTrustScore: number;
    }
  ): Promise<AutopilotDecision> {
    const session = await this.sessionStore.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const config = await this.configStore.get(session.configId);
    if (!config) throw new Error('Config not found');

    // Calculate factors
    const factors: DecisionFactor[] = [
      {
        name: 'Tests Passing',
        weight: DECISION_WEIGHTS.testsPassing,
        value: context.testsPassing ? 100 : 0,
        impact: context.testsPassing ? 'positive' : 'negative',
        description: context.testsPassing ? 'All tests pass' : 'Some tests failing',
      },
      {
        name: 'Code Quality',
        weight: DECISION_WEIGHTS.codeQuality,
        value: context.codeQualityScore,
        impact: context.codeQualityScore >= 70 ? 'positive' : context.codeQualityScore >= 50 ? 'neutral' : 'negative',
        description: `Code quality score: ${context.codeQualityScore}`,
      },
      {
        name: 'Review Approval',
        weight: DECISION_WEIGHTS.reviewApproval,
        value: context.reviewsRequested > 0 ? (context.reviewsApproved / context.reviewsRequested) * 100 : 100,
        impact: context.reviewsApproved >= context.reviewsRequested ? 'positive' : 'negative',
        description: `${context.reviewsApproved}/${context.reviewsRequested} reviews approved`,
      },
      {
        name: 'Mergeable',
        weight: DECISION_WEIGHTS.mergeable,
        value: context.isMergeable ? 100 : 0,
        impact: context.isMergeable ? 'positive' : 'negative',
        description: context.isMergeable ? 'No merge conflicts' : 'Has merge conflicts',
      },
      {
        name: 'CI Success',
        weight: DECISION_WEIGHTS.ciSuccess,
        value: context.ciPassed ? 100 : 0,
        impact: context.ciPassed ? 'positive' : 'negative',
        description: context.ciPassed ? 'CI pipeline passed' : 'CI pipeline failed',
      },
      {
        name: 'Author Trust',
        weight: DECISION_WEIGHTS.authorTrust,
        value: context.authorTrustScore,
        impact: context.authorTrustScore >= 70 ? 'positive' : 'neutral',
        description: `Author trust score: ${context.authorTrustScore}`,
      },
    ];

    // Calculate weighted score
    const score = factors.reduce((sum, f) => sum + f.weight * f.value, 0);
    const confidence = this.calculateConfidence(score, factors);

    // Determine decision type
    const { type, reasoning, suggestedActions } = this.determineDecision(
      score,
      confidence,
      factors,
      config
    );

    const decision: AutopilotDecision = {
      id: `decision_${++this.decisionCounter}`,
      type,
      confidence,
      score,
      reasoning,
      factors,
      suggestedActions,
      requiresApproval: config.mode === 'supervised' || confidence !== 'high',
      timestamp: new Date(),
    };

    await this.sessionStore.addDecision(sessionId, decision);
    return decision;
  }

  // -------------------------------------------------------------------------
  // Action Execution
  // -------------------------------------------------------------------------

  async executeAction(
    sessionId: string,
    action: string,
    execute: () => Promise<Record<string, unknown>>
  ): Promise<ExecutedAction> {
    const session = await this.sessionStore.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const startTime = Date.now();
    let status: ExecutedAction['status'];
    let result: Record<string, unknown> | undefined;
    let error: string | undefined;

    try {
      result = await execute();
      status = 'success';
    } catch (err) {
      status = 'failure';
      error = err instanceof Error ? err.message : 'Unknown error';
    }

    const executedAction: ExecutedAction = {
      id: `action_${++this.actionCounter}`,
      sessionId,
      action,
      status,
      result,
      error,
      executedAt: new Date(),
      durationMs: Date.now() - startTime,
    };

    await this.sessionStore.addExecutedAction(sessionId, executedAction);
    return executedAction;
  }

  // -------------------------------------------------------------------------
  // Learning & Feedback
  // -------------------------------------------------------------------------

  async provideFeedback(
    sessionId: string,
    decisionId: string,
    correct: boolean,
    providedBy: string,
    expectedDecision?: DecisionType,
    feedback?: string
  ): Promise<LearningFeedback> {
    const learningFeedback: LearningFeedback = {
      id: `feedback_${++this.feedbackCounter}`,
      sessionId,
      decisionId,
      correct,
      expectedDecision,
      feedback,
      providedBy,
      providedAt: new Date(),
    };

    this.feedback.push(learningFeedback);
    return learningFeedback;
  }

  async getFeedback(sessionId: string): Promise<LearningFeedback[]> {
    return this.feedback.filter((f) => f.sessionId === sessionId);
  }

  async getAccuracyMetrics(): Promise<{
    totalDecisions: number;
    correctDecisions: number;
    accuracy: number;
  }> {
    const totalDecisions = this.feedback.length;
    const correctDecisions = this.feedback.filter((f) => f.correct).length;
    const accuracy = totalDecisions > 0 ? (correctDecisions / totalDecisions) * 100 : 0;

    return { totalDecisions, correctDecisions, accuracy };
  }

  // -------------------------------------------------------------------------
  // Internal Methods
  // -------------------------------------------------------------------------

  private calculateConfidence(score: number, factors: DecisionFactor[]): ConfidenceLevel {
    const negativeFactors = factors.filter((f) => f.impact === 'negative').length;
    // Note: neutral factors can be used for more nuanced confidence calculation in the future
    void factors.filter((f) => f.impact === 'neutral').length;

    if (score >= 90 && negativeFactors === 0) return 'high';
    if (score >= 75 && negativeFactors <= 1) return 'medium';
    if (score >= 50) return 'low';
    return 'uncertain';
  }

  private determineDecision(
    score: number,
    confidence: ConfidenceLevel,
    factors: DecisionFactor[],
    config: AutopilotConfig
  ): { type: DecisionType; reasoning: string; suggestedActions: SuggestedAction[] } {
    const suggestedActions: SuggestedAction[] = [];

    // Check for blockers
    const blockers = factors.filter((f) => f.impact === 'negative' && f.weight >= 0.15);

    if (blockers.length > 0) {
      // Has blockers - request changes or escalate
      const reasoning = `Blocked by: ${blockers.map((b) => b.name).join(', ')}`;

      for (const blocker of blockers) {
        suggestedActions.push({
          id: `suggest_${Date.now()}`,
          action: `fix_${blocker.name.toLowerCase().replace(/\s/g, '_')}`,
          description: `Fix: ${blocker.description}`,
          priority: Math.round(blocker.weight * 100),
          automated: false,
        });
      }

      if (confidence === 'uncertain' || blockers.length > 2) {
        return { type: 'escalate', reasoning, suggestedActions };
      }

      return { type: 'request_changes', reasoning, suggestedActions };
    }

    // No blockers - check for approval/merge
    if (score >= 90 && confidence === 'high') {
      if (config.autoMerge) {
        suggestedActions.push({
          id: `suggest_merge`,
          action: 'merge',
          description: 'Auto-merge PR',
          priority: 100,
          automated: true,
        });
        return { type: 'merge', reasoning: 'All checks pass with high confidence', suggestedActions };
      }

      return { type: 'approve', reasoning: 'All checks pass with high confidence', suggestedActions };
    }

    if (score >= 75) {
      return { type: 'approve', reasoning: 'Most checks pass with good confidence', suggestedActions };
    }

    if (score >= 50) {
      return { type: 'defer', reasoning: 'Some checks need attention', suggestedActions };
    }

    return { type: 'escalate', reasoning: 'Low confidence - needs human review', suggestedActions };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an Autopilot Manager with in-memory stores
 */
export function createAutopilotManager(
  config: Partial<AutopilotManagerConfig> = {}
): AutopilotManager {
  return new AutopilotManager(
    new InMemoryAutopilotConfigStore(),
    new InMemoryAutopilotSessionStore(),
    { ...DEFAULT_AUTOPILOT_CONFIG, ...config }
  );
}

/**
 * Create autopilot config store
 */
export function createAutopilotConfigStore(): InMemoryAutopilotConfigStore {
  return new InMemoryAutopilotConfigStore();
}

/**
 * Create autopilot session store
 */
export function createAutopilotSessionStore(): InMemoryAutopilotSessionStore {
  return new InMemoryAutopilotSessionStore();
}
