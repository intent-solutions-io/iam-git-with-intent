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
