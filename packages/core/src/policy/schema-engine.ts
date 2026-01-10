/**
 * Schema-Based Policy Engine
 *
 * Epic D: Policy & Audit - Story D2: Policy Engine
 * Task D2.1: Create PolicyEngine class
 *
 * Core engine for evaluating policies defined using the PolicyDocument schema.
 * Supports:
 * - Loading and caching policy documents
 * - Evaluating 9 condition types
 * - Policy inheritance resolution
 * - Audit trail integration
 *
 * @module @gwi/core/policy/schema-engine
 */

import {
  type PolicyDocument,
  type PolicyRule,
  type PolicyCondition,
  type PolicyEvaluationRequest,
  type PolicyEvaluationResult,
  type ActionEffect,
  type ConditionGroup,
  PolicyDocument as PolicyDocumentSchema,
} from './schema.js';

// =============================================================================
// Inline Policy Store Interface (for inheritance support)
// =============================================================================

/**
 * Policy store interface for loading policies
 */
export interface PolicyStore {
  getPolicy(scope: string, target?: string): Promise<PolicyDocument | null>;
  listPolicies(scope?: string): Promise<PolicyDocument[]>;
}

// =============================================================================
// Types
// =============================================================================

/**
 * Engine configuration
 */
export interface SchemaEngineConfig {
  /** Whether to stop on first matching rule */
  stopOnFirstMatch?: boolean;
  /** Default effect when no rules match */
  defaultEffect?: ActionEffect;
  /** Enable caching of compiled conditions */
  enableCaching?: boolean;
  /** Policy store for loading policies */
  policyStore?: PolicyStore;
  /** Enable schema validation on policy load */
  validateOnLoad?: boolean;
}

// =============================================================================
// Dry-Run Types (D2.5)
// =============================================================================

/**
 * Detailed condition evaluation result
 */
export interface ConditionEvaluation {
  /** Condition type */
  type: PolicyCondition['type'];
  /** Whether the condition matched */
  matched: boolean;
  /** Human-readable explanation */
  explanation: string;
  /** The actual value from the request */
  actualValue?: unknown;
  /** The expected value from the condition */
  expectedValue?: unknown;
}

/**
 * Detailed rule evaluation result
 */
export interface RuleEvaluation {
  /** Rule ID */
  ruleId: string;
  /** Rule name */
  ruleName: string;
  /** Policy ID the rule belongs to */
  policyId: string;
  /** Rule priority */
  priority: number;
  /** Whether all conditions matched */
  matched: boolean;
  /** Individual condition evaluations */
  conditions: ConditionEvaluation[];
  /** The action that would be taken */
  wouldApply: {
    effect: ActionEffect;
    reason?: string;
    approval?: unknown;
    notification?: unknown;
  };
}

/**
 * Dry-run evaluation result
 */
export interface DryRunResult {
  /** Flag indicating this is a dry-run result */
  dryRun: true;
  /** The request that was evaluated */
  request: PolicyEvaluationRequest;
  /** What the final decision would be */
  wouldAllow: boolean;
  /** The effect that would be applied */
  wouldEffect: ActionEffect;
  /** Reason for the decision */
  reason: string;
  /** The rule that would match (first match) */
  primaryMatch?: RuleEvaluation;
  /** All rules that were evaluated */
  allRules: RuleEvaluation[];
  /** Rules that matched */
  matchingRules: RuleEvaluation[];
  /** Rules that did not match */
  nonMatchingRules: RuleEvaluation[];
  /** Summary statistics */
  summary: {
    totalPolicies: number;
    totalRules: number;
    matchingRules: number;
    evaluationTimeMs: number;
  };
  /** Warnings or suggestions */
  warnings: string[];
}

/**
 * Simple inline validator (for when validation.ts isn't available)
 */
function validatePolicyDocument(doc: unknown): { valid: boolean; errors: string[]; policy?: PolicyDocument } {
  const result = PolicyDocumentSchema.safeParse(doc);
  if (result.success) {
    return { valid: true, errors: [], policy: result.data };
  }
  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Compiled condition for efficient evaluation
 */
interface CompiledCondition {
  type: PolicyCondition['type'];
  evaluate: (request: PolicyEvaluationRequest) => boolean;
}

/**
 * Compiled rule for efficient evaluation
 */
interface CompiledRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: CompiledCondition[];
  conditionLogic?: { operator: 'and' | 'or' | 'not'; conditions: CompiledCondition[] };
  action: PolicyRule['action'];
}

/**
 * Cached policy with compiled rules
 */
interface CachedPolicy {
  document: PolicyDocument;
  compiledRules: CompiledRule[];
  loadedAt: Date;
}

// =============================================================================
// Schema Policy Engine
// =============================================================================

/**
 * Schema-based policy engine
 *
 * Evaluates policies defined as PolicyDocument against evaluation requests.
 *
 * @example
 * ```typescript
 * const engine = new SchemaPolicyEngine();
 *
 * engine.loadPolicy({
 *   version: '2.0',
 *   name: 'Require Review',
 *   rules: [{
 *     id: 'complex-requires-review',
 *     name: 'Complex PRs require review',
 *     conditions: [{ type: 'complexity', operator: 'gte', threshold: 7 }],
 *     action: { effect: 'require_approval', approval: { minApprovers: 2 } },
 *   }],
 * });
 *
 * const result = engine.evaluate({
 *   actor: { id: 'user-1', type: 'human' },
 *   action: { name: 'pr.merge' },
 *   resource: { type: 'pull_request', complexity: 8 },
 *   context: { source: 'cli', timestamp: new Date() },
 * });
 * ```
 */
export class SchemaPolicyEngine {
  private policies: Map<string, CachedPolicy> = new Map();
  private config: Omit<Required<SchemaEngineConfig>, 'policyStore'> & { policyStore?: PolicyStore };

  constructor(config: SchemaEngineConfig = {}) {
    this.config = {
      stopOnFirstMatch: config.stopOnFirstMatch ?? true,
      defaultEffect: config.defaultEffect ?? 'deny',
      enableCaching: config.enableCaching ?? true,
      policyStore: config.policyStore,
      validateOnLoad: config.validateOnLoad ?? true,
    };
  }

  /**
   * Load a policy document
   */
  loadPolicy(document: PolicyDocument, policyId?: string): void {
    // Validate if enabled
    if (this.config.validateOnLoad) {
      const result = validatePolicyDocument(document);
      if (!result.valid) {
        throw new Error(`Invalid policy: ${result.errors.join(', ')}`);
      }
      document = result.policy!;
    }

    const id = policyId ?? document.name;
    const compiledRules = this.compileRules(document.rules);

    this.policies.set(id, {
      document,
      compiledRules,
      loadedAt: new Date(),
    });
  }

  /**
   * Unload a policy
   */
  unloadPolicy(policyId: string): boolean {
    return this.policies.delete(policyId);
  }

  /**
   * Get loaded policy IDs
   */
  getLoadedPolicies(): string[] {
    return Array.from(this.policies.keys());
  }

  /**
   * Clear all loaded policies
   */
  clearPolicies(): void {
    this.policies.clear();
  }

  /**
   * Evaluate a request against loaded policies
   */
  evaluate(request: PolicyEvaluationRequest): PolicyEvaluationResult {
    const startTime = Date.now();
    let rulesEvaluated = 0;
    let policiesEvaluated = 0;

    // Collect all rules from all policies, sorted by priority
    const allRules: Array<{ rule: CompiledRule; policyId: string; document: PolicyDocument }> = [];

    for (const [policyId, cached] of this.policies) {
      policiesEvaluated++;
      for (const rule of cached.compiledRules) {
        if (rule.enabled) {
          allRules.push({ rule, policyId, document: cached.document });
        }
      }
    }

    // Sort by priority (higher priority first)
    allRules.sort((a, b) => b.rule.priority - a.rule.priority);

    // Evaluate rules
    for (const { rule, policyId } of allRules) {
      rulesEvaluated++;

      // Check if conditions match
      const matches = this.evaluateConditions(rule, request);

      if (matches) {
        // Rule matched - apply action
        const result = this.buildResult(
          rule,
          policyId,
          request,
          startTime,
          rulesEvaluated,
          policiesEvaluated
        );

        // Stop on first match if configured
        if (this.config.stopOnFirstMatch && !rule.action.continueOnMatch) {
          return result;
        }
      }
    }

    // No rules matched - use default action
    return this.buildDefaultResult(request, startTime, rulesEvaluated, policiesEvaluated);
  }

  /**
   * Evaluate a request in dry-run mode
   *
   * Unlike evaluate(), this:
   * - Evaluates ALL rules (doesn't stop on first match)
   * - Returns detailed condition breakdowns
   * - Never triggers side effects
   *
   * @example
   * ```typescript
   * const result = engine.evaluateDryRun({
   *   actor: { id: 'user-1', type: 'human' },
   *   action: { name: 'pr.merge' },
   *   resource: { type: 'pull_request', complexity: 8 },
   *   context: { source: 'cli', timestamp: new Date() },
   * });
   *
   * console.log(result.wouldAllow); // false
   * console.log(result.matchingRules); // [{ ruleId: '...', ... }]
   * ```
   */
  evaluateDryRun(request: PolicyEvaluationRequest): DryRunResult {
    const startTime = Date.now();
    const allRuleEvaluations: RuleEvaluation[] = [];
    const matchingRules: RuleEvaluation[] = [];
    const nonMatchingRules: RuleEvaluation[] = [];
    const warnings: string[] = [];

    // Collect and evaluate all rules from all policies
    for (const [policyId, cached] of this.policies) {
      for (const rule of cached.compiledRules) {
        if (!rule.enabled) {
          warnings.push(`Rule "${rule.name}" (${rule.id}) is disabled`);
          continue;
        }

        // Evaluate each condition individually for detailed reporting
        const conditionEvaluations = this.evaluateConditionsDetailed(rule, request, cached.document);
        const allConditionsMatch = conditionEvaluations.every(c => c.matched);

        const ruleEval: RuleEvaluation = {
          ruleId: rule.id,
          ruleName: rule.name,
          policyId,
          priority: rule.priority,
          matched: allConditionsMatch,
          conditions: conditionEvaluations,
          wouldApply: {
            effect: rule.action.effect,
            reason: rule.action.reason,
            approval: rule.action.approval,
            notification: rule.action.notification,
          },
        };

        allRuleEvaluations.push(ruleEval);

        if (allConditionsMatch) {
          matchingRules.push(ruleEval);
        } else {
          nonMatchingRules.push(ruleEval);
        }
      }
    }

    // Sort by priority (higher first)
    allRuleEvaluations.sort((a, b) => b.priority - a.priority);
    matchingRules.sort((a, b) => b.priority - a.priority);

    // Determine what would happen
    const primaryMatch = matchingRules[0];
    const wouldEffect = primaryMatch?.wouldApply.effect ?? this.config.defaultEffect;
    const wouldAllow = wouldEffect === 'allow' || wouldEffect === 'log_only' || wouldEffect === 'warn';

    // Generate warnings
    if (matchingRules.length === 0) {
      warnings.push(`No rules matched - default effect "${this.config.defaultEffect}" would apply`);
    }
    if (matchingRules.length > 1) {
      warnings.push(`Multiple rules matched (${matchingRules.length}) - highest priority rule would apply`);
    }
    if (this.policies.size === 0) {
      warnings.push('No policies loaded - evaluation based on default settings only');
    }

    return {
      dryRun: true,
      request,
      wouldAllow,
      wouldEffect,
      reason: primaryMatch?.wouldApply.reason ?? 'No matching policy rule',
      primaryMatch,
      allRules: allRuleEvaluations,
      matchingRules,
      nonMatchingRules,
      summary: {
        totalPolicies: this.policies.size,
        totalRules: allRuleEvaluations.length,
        matchingRules: matchingRules.length,
        evaluationTimeMs: Date.now() - startTime,
      },
      warnings,
    };
  }

  /**
   * Evaluate conditions with detailed results for dry-run
   */
  private evaluateConditionsDetailed(
    rule: CompiledRule,
    request: PolicyEvaluationRequest,
    document: PolicyDocument
  ): ConditionEvaluation[] {
    // Find the original rule in the document to get condition details
    const originalRule = document.rules.find(r => r.id === rule.id);
    if (!originalRule || !originalRule.conditions) {
      return [];
    }

    return originalRule.conditions.map((condition, index) => {
      const matched = rule.conditions[index]?.evaluate(request) ?? false;
      return this.buildConditionEvaluation(condition, request, matched);
    });
  }

  /**
   * Build detailed condition evaluation result
   */
  private buildConditionEvaluation(
    condition: PolicyCondition,
    request: PolicyEvaluationRequest,
    matched: boolean
  ): ConditionEvaluation {
    const base = {
      type: condition.type,
      matched,
    };

    switch (condition.type) {
      case 'complexity': {
        const actualComplexity = request.resource.complexity ?? 0;
        return {
          ...base,
          explanation: `Complexity ${actualComplexity} ${condition.operator} ${condition.threshold} → ${matched ? 'MATCH' : 'NO MATCH'}`,
          actualValue: actualComplexity,
          expectedValue: condition.threshold,
        };
      }
      case 'file_pattern': {
        const files = request.resource.files ?? [];
        const patterns = condition.patterns;
        return {
          ...base,
          explanation: `Patterns ${JSON.stringify(patterns)} matched against ${files.length} files (${condition.matchType}) → ${matched ? 'MATCH' : 'NO MATCH'}`,
          actualValue: files,
          expectedValue: patterns,
        };
      }
      case 'author': {
        const actualRoles = request.actor.roles ?? [];
        const criteria: string[] = [];
        if (condition.authors?.length) criteria.push(`authors: ${JSON.stringify(condition.authors)}`);
        if (condition.roles?.length) criteria.push(`roles: ${JSON.stringify(condition.roles)}`);
        if (condition.teams?.length) criteria.push(`teams: ${JSON.stringify(condition.teams)}`);
        return {
          ...base,
          explanation: `Author "${request.actor.id}" (roles: ${JSON.stringify(actualRoles)}) checked against ${criteria.join(', ') || 'no criteria'} → ${matched ? 'MATCH' : 'NO MATCH'}`,
          actualValue: { id: request.actor.id, roles: actualRoles },
          expectedValue: { authors: condition.authors, roles: condition.roles, teams: condition.teams },
        };
      }
      case 'time_window': {
        const now = new Date();
        const hour = now.getHours();
        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const day = dayNames[now.getDay()];
        return {
          ...base,
          explanation: `Current time ${hour}:00 ${day} within allowed windows (${condition.matchType}) → ${matched ? 'MATCH' : 'NO MATCH'}`,
          actualValue: { hour, day },
          expectedValue: { windows: condition.windows, matchType: condition.matchType },
        };
      }
      case 'repository': {
        const actualRepo = request.resource.repo;
        const repoName = actualRepo ? `${actualRepo.owner}/${actualRepo.name}` : 'unknown';
        return {
          ...base,
          explanation: `Repository "${repoName}" matches repos/patterns → ${matched ? 'MATCH' : 'NO MATCH'}`,
          actualValue: repoName,
          expectedValue: { repos: condition.repos, patterns: condition.patterns },
        };
      }
      case 'branch': {
        const actualBranch = request.resource.branch ?? 'unknown';
        return {
          ...base,
          explanation: `Branch "${actualBranch}" matches branches/patterns → ${matched ? 'MATCH' : 'NO MATCH'}`,
          actualValue: actualBranch,
          expectedValue: { branches: condition.branches, patterns: condition.patterns },
        };
      }
      case 'label': {
        const labels = request.resource.labels ?? [];
        return {
          ...base,
          explanation: `Labels ${JSON.stringify(labels)} matchType=${condition.matchType} ${JSON.stringify(condition.labels)} → ${matched ? 'MATCH' : 'NO MATCH'}`,
          actualValue: labels,
          expectedValue: condition.labels,
        };
      }
      case 'agent': {
        const actualAgent = request.action.agentType;
        return {
          ...base,
          explanation: `Agent type "${actualAgent}" matches ${JSON.stringify(condition.agents)} → ${matched ? 'MATCH' : 'NO MATCH'}`,
          actualValue: actualAgent,
          expectedValue: condition.agents,
        };
      }
      case 'custom': {
        const fieldValue = request.attributes?.[condition.field];
        return {
          ...base,
          explanation: `Custom condition "${condition.field}" ${condition.operator} ${JSON.stringify(condition.value)} → ${matched ? 'MATCH' : 'NO MATCH'}`,
          actualValue: fieldValue,
          expectedValue: condition.value,
        };
      }
      default:
        return {
          ...base,
          explanation: `Unknown condition type → ${matched ? 'MATCH' : 'NO MATCH'}`,
        };
    }
  }

  /**
   * Compile rules for efficient evaluation
   */
  private compileRules(rules: PolicyRule[]): CompiledRule[] {
    return rules.map(rule => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled ?? true,
      priority: rule.priority ?? 0,
      conditions: (rule.conditions ?? []).map(c => this.compileCondition(c)),
      conditionLogic: rule.conditionLogic ? this.compileConditionGroup(rule.conditionLogic) : undefined,
      action: rule.action,
    }));
  }

  /**
   * Compile a single condition
   */
  private compileCondition(condition: PolicyCondition): CompiledCondition {
    return {
      type: condition.type,
      evaluate: (request) => this.evaluateCondition(condition, request),
    };
  }

  /**
   * Compile a condition group
   */
  private compileConditionGroup(group: ConditionGroup): { operator: 'and' | 'or' | 'not'; conditions: CompiledCondition[] } {
    return {
      operator: group.operator,
      conditions: group.conditions.map(c => {
        if ('type' in c) {
          return this.compileCondition(c as PolicyCondition);
        } else {
          // Nested group - flatten for now
          const nested = c as { operator: 'and' | 'or' | 'not'; conditions: PolicyCondition[] };
          return {
            type: 'custom' as const,
            evaluate: (request: PolicyEvaluationRequest) => {
              const results = nested.conditions.map(nc => this.evaluateCondition(nc, request));
              if (nested.operator === 'and') return results.every(r => r);
              if (nested.operator === 'or') return results.some(r => r);
              if (nested.operator === 'not') return !results[0];
              return false;
            },
          };
        }
      }),
    };
  }

  /**
   * Evaluate all conditions for a rule
   */
  private evaluateConditions(rule: CompiledRule, request: PolicyEvaluationRequest): boolean {
    // If conditionLogic is specified, use it
    if (rule.conditionLogic) {
      return this.evaluateConditionGroup(rule.conditionLogic, request);
    }

    // Otherwise, AND all conditions together
    if (rule.conditions.length === 0) {
      return true; // No conditions = matches everything
    }

    return rule.conditions.every(c => c.evaluate(request));
  }

  /**
   * Evaluate a condition group
   */
  private evaluateConditionGroup(
    group: { operator: 'and' | 'or' | 'not'; conditions: CompiledCondition[] },
    request: PolicyEvaluationRequest
  ): boolean {
    const results = group.conditions.map(c => c.evaluate(request));

    switch (group.operator) {
      case 'and':
        return results.every(r => r);
      case 'or':
        return results.some(r => r);
      case 'not':
        return !results[0];
      default:
        return false;
    }
  }

  /**
   * Evaluate a single condition against a request
   */
  private evaluateCondition(condition: PolicyCondition, request: PolicyEvaluationRequest): boolean {
    switch (condition.type) {
      case 'complexity':
        return this.evaluateComplexityCondition(condition, request);
      case 'file_pattern':
        return this.evaluateFilePatternCondition(condition, request);
      case 'author':
        return this.evaluateAuthorCondition(condition, request);
      case 'time_window':
        return this.evaluateTimeWindowCondition(condition, request);
      case 'repository':
        return this.evaluateRepositoryCondition(condition, request);
      case 'branch':
        return this.evaluateBranchCondition(condition, request);
      case 'label':
        return this.evaluateLabelCondition(condition, request);
      case 'agent':
        return this.evaluateAgentCondition(condition, request);
      case 'custom':
        return this.evaluateCustomCondition(condition, request);
      default:
        return false;
    }
  }

  /**
   * Evaluate complexity condition
   */
  private evaluateComplexityCondition(
    condition: { type: 'complexity'; operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'; threshold: number },
    request: PolicyEvaluationRequest
  ): boolean {
    const complexity = request.resource.complexity;
    if (complexity === undefined) return false;

    switch (condition.operator) {
      case 'gt': return complexity > condition.threshold;
      case 'gte': return complexity >= condition.threshold;
      case 'lt': return complexity < condition.threshold;
      case 'lte': return complexity <= condition.threshold;
      case 'eq': return complexity === condition.threshold;
      default: return false;
    }
  }

  /**
   * Evaluate file pattern condition
   */
  private evaluateFilePatternCondition(
    condition: { type: 'file_pattern'; patterns: string[]; matchType?: 'include' | 'exclude' },
    request: PolicyEvaluationRequest
  ): boolean {
    const files = request.resource.files ?? [];
    if (files.length === 0) return false;

    const matchType = condition.matchType ?? 'include';
    const anyMatch = files.some(file =>
      condition.patterns.some(pattern => this.matchGlob(file, pattern))
    );

    return matchType === 'include' ? anyMatch : !anyMatch;
  }

  /**
   * Evaluate author condition
   */
  private evaluateAuthorCondition(
    condition: { type: 'author'; authors?: string[]; roles?: string[]; teams?: string[] },
    request: PolicyEvaluationRequest
  ): boolean {
    // Check authors
    if (condition.authors?.length) {
      if (condition.authors.includes(request.actor.id)) return true;
    }

    // Check roles
    if (condition.roles?.length && request.actor.roles?.length) {
      if (condition.roles.some(role => request.actor.roles!.includes(role))) return true;
    }

    // Check teams
    if (condition.teams?.length && request.actor.teams?.length) {
      if (condition.teams.some(team => request.actor.teams!.includes(team))) return true;
    }

    // If nothing to check, don't match
    return !condition.authors?.length && !condition.roles?.length && !condition.teams?.length;
  }

  /**
   * Evaluate time window condition
   */
  private evaluateTimeWindowCondition(
    condition: {
      type: 'time_window';
      timezone?: string;
      windows: Array<{ days?: string[]; startHour?: number; endHour?: number }>;
      matchType?: 'during' | 'outside';
    },
    request: PolicyEvaluationRequest
  ): boolean {
    const now = request.context.timestamp;
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const currentDay = dayNames[now.getDay()];
    const currentHour = now.getHours();

    const inWindow = condition.windows.some(window => {
      // Check day
      if (window.days?.length && !window.days.includes(currentDay)) {
        return false;
      }

      // Check hours
      if (window.startHour !== undefined && currentHour < window.startHour) {
        return false;
      }
      if (window.endHour !== undefined && currentHour >= window.endHour) {
        return false;
      }

      return true;
    });

    const matchType = condition.matchType ?? 'during';
    return matchType === 'during' ? inWindow : !inWindow;
  }

  /**
   * Evaluate repository condition
   */
  private evaluateRepositoryCondition(
    condition: { type: 'repository'; repos?: string[]; patterns?: string[]; visibility?: 'public' | 'private' | 'all' },
    request: PolicyEvaluationRequest
  ): boolean {
    const repo = request.resource.repo;
    if (!repo) return false;

    const fullName = `${repo.owner}/${repo.name}`;

    // Check exact matches
    if (condition.repos?.length) {
      if (condition.repos.includes(fullName) || condition.repos.includes(repo.name)) {
        return true;
      }
    }

    // Check patterns
    if (condition.patterns?.length) {
      if (condition.patterns.some(pattern => this.matchGlob(fullName, pattern))) {
        return true;
      }
    }

    // If no repos/patterns specified, match all
    return !condition.repos?.length && !condition.patterns?.length;
  }

  /**
   * Evaluate branch condition
   */
  private evaluateBranchCondition(
    condition: { type: 'branch'; branches?: string[]; patterns?: string[]; protected?: boolean },
    request: PolicyEvaluationRequest
  ): boolean {
    const branch = request.resource.branch;
    if (!branch) return false;

    // Check exact matches
    if (condition.branches?.length) {
      if (condition.branches.includes(branch)) return true;
    }

    // Check patterns
    if (condition.patterns?.length) {
      if (condition.patterns.some(pattern => this.matchGlob(branch, pattern))) return true;
    }

    // Check protected flag - we'd need this in the request
    // For now, skip protected check if not specified

    // If no branches/patterns specified, match all
    return !condition.branches?.length && !condition.patterns?.length;
  }

  /**
   * Evaluate label condition
   */
  private evaluateLabelCondition(
    condition: { type: 'label'; labels: string[]; matchType?: 'any' | 'all' | 'none' },
    request: PolicyEvaluationRequest
  ): boolean {
    const labels = request.resource.labels ?? [];
    const matchType = condition.matchType ?? 'any';

    switch (matchType) {
      case 'any':
        return condition.labels.some(l => labels.includes(l));
      case 'all':
        return condition.labels.every(l => labels.includes(l));
      case 'none':
        return !condition.labels.some(l => labels.includes(l));
      default:
        return false;
    }
  }

  /**
   * Evaluate agent condition
   */
  private evaluateAgentCondition(
    condition: {
      type: 'agent';
      agents: string[];
      confidence?: { operator: 'gt' | 'gte' | 'lt' | 'lte'; threshold: number };
    },
    request: PolicyEvaluationRequest
  ): boolean {
    const agentType = request.action.agentType;
    if (!agentType) return false;

    // Check agent type
    if (!condition.agents.includes(agentType)) return false;

    // Check confidence if specified
    if (condition.confidence && request.action.confidence !== undefined) {
      const conf = request.action.confidence;
      switch (condition.confidence.operator) {
        case 'gt': return conf > condition.confidence.threshold;
        case 'gte': return conf >= condition.confidence.threshold;
        case 'lt': return conf < condition.confidence.threshold;
        case 'lte': return conf <= condition.confidence.threshold;
      }
    }

    return true;
  }

  /**
   * Evaluate custom condition
   */
  private evaluateCustomCondition(
    condition: { type: 'custom'; field: string; operator: string; value?: unknown },
    request: PolicyEvaluationRequest
  ): boolean {
    // Get field value from attributes
    const fieldValue = request.attributes?.[condition.field];
    if (fieldValue === undefined) return false;

    // Evaluate based on operator
    switch (condition.operator) {
      case 'eq': return fieldValue === condition.value;
      case 'ne': return fieldValue !== condition.value;
      case 'gt': return typeof fieldValue === 'number' && fieldValue > (condition.value as number);
      case 'gte': return typeof fieldValue === 'number' && fieldValue >= (condition.value as number);
      case 'lt': return typeof fieldValue === 'number' && fieldValue < (condition.value as number);
      case 'lte': return typeof fieldValue === 'number' && fieldValue <= (condition.value as number);
      case 'in': return Array.isArray(condition.value) && condition.value.includes(fieldValue);
      case 'nin': return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
      case 'contains': return typeof fieldValue === 'string' && fieldValue.includes(condition.value as string);
      case 'matches': return typeof fieldValue === 'string' && new RegExp(condition.value as string).test(fieldValue);
      case 'exists': return condition.value ? fieldValue !== undefined : fieldValue === undefined;
      default: return false;
    }
  }

  /**
   * Simple glob matching (supports * and **)
   */
  private matchGlob(value: string, pattern: string): boolean {
    // Convert glob to regex
    const regex = pattern
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*')
      .replace(/\?/g, '.');

    return new RegExp(`^${regex}$`).test(value);
  }

  /**
   * Build evaluation result from matched rule
   */
  private buildResult(
    rule: CompiledRule,
    policyId: string,
    _request: PolicyEvaluationRequest,
    startTime: number,
    rulesEvaluated: number,
    policiesEvaluated: number
  ): PolicyEvaluationResult {
    const effect = rule.action.effect;
    const allowed = effect === 'allow' || effect === 'log_only' || effect === 'warn';

    const result: PolicyEvaluationResult = {
      allowed,
      effect,
      reason: rule.action.reason ?? `Matched rule: ${rule.name}`,
      matchedRule: {
        id: rule.id,
        name: rule.name,
        policyId,
      },
      metadata: {
        evaluatedAt: new Date(),
        evaluationTimeMs: Date.now() - startTime,
        rulesEvaluated,
        policiesEvaluated,
      },
    };

    // Add required actions for non-allow effects
    if (effect === 'require_approval' && rule.action.approval) {
      result.requiredActions = [{
        type: 'approval',
        config: rule.action.approval,
      }];
    }

    if (rule.action.notification) {
      result.requiredActions = result.requiredActions ?? [];
      result.requiredActions.push({
        type: 'notification',
        config: rule.action.notification,
      });
    }

    return result;
  }

  /**
   * Build default result when no rules match
   */
  private buildDefaultResult(
    _request: PolicyEvaluationRequest,
    startTime: number,
    rulesEvaluated: number,
    policiesEvaluated: number
  ): PolicyEvaluationResult {
    const effect = this.config.defaultEffect;
    const allowed = effect === 'allow' || effect === 'log_only' || effect === 'warn';

    return {
      allowed,
      effect,
      reason: 'No matching policy rule',
      metadata: {
        evaluatedAt: new Date(),
        evaluationTimeMs: Date.now() - startTime,
        rulesEvaluated,
        policiesEvaluated,
      },
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a schema policy engine
 */
export function createSchemaEngine(config?: SchemaEngineConfig): SchemaPolicyEngine {
  return new SchemaPolicyEngine(config);
}

// =============================================================================
// Singleton Instance
// =============================================================================

let schemaEngineInstance: SchemaPolicyEngine | null = null;

/**
 * Get the schema policy engine instance
 */
export function getSchemaEngine(): SchemaPolicyEngine {
  if (!schemaEngineInstance) {
    schemaEngineInstance = new SchemaPolicyEngine();
  }
  return schemaEngineInstance;
}

/**
 * Reset the schema policy engine (for testing)
 */
export function resetSchemaEngine(): void {
  schemaEngineInstance = null;
}

/**
 * Evaluate a request using the global schema engine
 */
export function evaluateSchemaPolicy(request: PolicyEvaluationRequest): PolicyEvaluationResult {
  return getSchemaEngine().evaluate(request);
}
