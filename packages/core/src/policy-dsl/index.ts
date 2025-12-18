/**
 * Policy DSL Parser
 *
 * Phase 42: Policy-as-Code v2 with DSL parser and validation.
 *
 * @module @gwi/core/policy-dsl
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Policy rule operator
 */
export type PolicyOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'nin'
  | 'contains'
  | 'matches'
  | 'exists';

/**
 * Policy logical operator
 */
export type LogicalOperator = 'and' | 'or' | 'not';

/**
 * Policy condition
 */
export interface PolicyCondition {
  /** Field to check */
  field: string;
  /** Operator */
  operator: PolicyOperator;
  /** Value to compare */
  value: unknown;
}

/**
 * DSL Policy rule
 */
export interface DslPolicyRule {
  /** Rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Description */
  description?: string;
  /** Conditions (ANDed together) */
  conditions: PolicyCondition[];
  /** Nested rules with logical operators */
  nested?: {
    operator: LogicalOperator;
    rules: DslPolicyRule[];
  };
  /** Action to take when rule matches */
  action: DslPolicyAction;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Whether rule is enabled */
  enabled: boolean;
}

/**
 * Policy action type
 */
export type PolicyActionType = 'allow' | 'deny' | 'require_approval' | 'notify' | 'audit';

/**
 * DSL Policy action
 */
export interface DslPolicyAction {
  /** Action type */
  type: PolicyActionType;
  /** Approval config for require_approval */
  approval?: {
    /** Minimum approvers */
    minApprovers: number;
    /** Required roles */
    requiredRoles?: string[];
    /** Timeout in hours */
    timeoutHours?: number;
  };
  /** Notification config */
  notification?: {
    /** Channels */
    channels: ('email' | 'slack' | 'webhook')[];
    /** Message template */
    template?: string;
  };
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * DSL Policy document
 */
export interface DslPolicyDocument {
  /** Policy version */
  version: string;
  /** Policy name */
  name: string;
  /** Description */
  description?: string;
  /** Default action */
  defaultAction: DslPolicyAction;
  /** Rules */
  rules: DslPolicyRule[];
  /** Variables */
  variables?: Record<string, unknown>;
  /** Created at */
  createdAt?: Date;
  /** Updated at */
  updatedAt?: Date;
}

/**
 * DSL Policy evaluation context
 */
export interface DslPolicyContext {
  /** Actor performing the action */
  actor: {
    id: string;
    type: 'user' | 'system' | 'api_key';
    roles?: string[];
    attributes?: Record<string, unknown>;
  };
  /** Action being performed */
  action: string;
  /** Resource being accessed */
  resource: {
    type: string;
    id?: string;
    attributes?: Record<string, unknown>;
  };
  /** Environment context */
  environment?: {
    timestamp?: Date;
    ipAddress?: string;
    region?: string;
  };
  /** Custom context */
  custom?: Record<string, unknown>;
}

/**
 * DSL Policy evaluation result
 */
export interface DslPolicyResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Action to take */
  action: DslPolicyAction;
  /** Matching rule ID (if any) */
  matchedRuleId?: string;
  /** Reasons for the decision */
  reasons: string[];
  /** Audit trail */
  audit: {
    timestamp: Date;
    policyVersion: string;
    evaluatedRules: number;
    context: DslPolicyContext;
  };
}

/**
 * Policy validation error
 */
export interface PolicyValidationError {
  /** Error path */
  path: string;
  /** Error message */
  message: string;
  /** Severity */
  severity: 'error' | 'warning';
}

// =============================================================================
// DSL Token Types
// =============================================================================

type TokenType =
  | 'IDENTIFIER'
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'OPERATOR'
  | 'LOGICAL'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACE'
  | 'RBRACE'
  | 'COLON'
  | 'COMMA'
  | 'ARROW'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string | number | boolean;
  line: number;
  column: number;
}

// =============================================================================
// Policy DSL Parser
// =============================================================================

/**
 * Policy DSL lexer
 */
class PolicyLexer {
  private input: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(input: string) {
    this.input = input;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.pos < this.input.length) {
      const char = this.input[this.pos];

      // Skip whitespace
      if (/\s/.test(char)) {
        if (char === '\n') {
          this.line++;
          this.column = 1;
        } else {
          this.column++;
        }
        this.pos++;
        continue;
      }

      // Skip comments
      if (char === '#') {
        while (this.pos < this.input.length && this.input[this.pos] !== '\n') {
          this.pos++;
        }
        continue;
      }

      // String
      if (char === '"' || char === "'") {
        tokens.push(this.readString(char));
        continue;
      }

      // Number
      if (/\d/.test(char)) {
        tokens.push(this.readNumber());
        continue;
      }

      // Identifier or keyword
      if (/[a-zA-Z_]/.test(char)) {
        tokens.push(this.readIdentifier());
        continue;
      }

      // Operators and punctuation
      switch (char) {
        case '(':
          tokens.push({ type: 'LPAREN', value: '(', line: this.line, column: this.column });
          break;
        case ')':
          tokens.push({ type: 'RPAREN', value: ')', line: this.line, column: this.column });
          break;
        case '{':
          tokens.push({ type: 'LBRACE', value: '{', line: this.line, column: this.column });
          break;
        case '}':
          tokens.push({ type: 'RBRACE', value: '}', line: this.line, column: this.column });
          break;
        case ':':
          tokens.push({ type: 'COLON', value: ':', line: this.line, column: this.column });
          break;
        case ',':
          tokens.push({ type: 'COMMA', value: ',', line: this.line, column: this.column });
          break;
        case '=':
          if (this.peek() === '=') {
            this.pos++;
            tokens.push({ type: 'OPERATOR', value: 'eq', line: this.line, column: this.column });
          } else if (this.peek() === '>') {
            this.pos++;
            tokens.push({ type: 'ARROW', value: '=>', line: this.line, column: this.column });
          }
          break;
        case '!':
          if (this.peek() === '=') {
            this.pos++;
            tokens.push({ type: 'OPERATOR', value: 'ne', line: this.line, column: this.column });
          } else {
            tokens.push({ type: 'LOGICAL', value: 'not', line: this.line, column: this.column });
          }
          break;
        case '>':
          if (this.peek() === '=') {
            this.pos++;
            tokens.push({ type: 'OPERATOR', value: 'gte', line: this.line, column: this.column });
          } else {
            tokens.push({ type: 'OPERATOR', value: 'gt', line: this.line, column: this.column });
          }
          break;
        case '<':
          if (this.peek() === '=') {
            this.pos++;
            tokens.push({ type: 'OPERATOR', value: 'lte', line: this.line, column: this.column });
          } else {
            tokens.push({ type: 'OPERATOR', value: 'lt', line: this.line, column: this.column });
          }
          break;
        case '&':
          if (this.peek() === '&') {
            this.pos++;
            tokens.push({ type: 'LOGICAL', value: 'and', line: this.line, column: this.column });
          }
          break;
        case '|':
          if (this.peek() === '|') {
            this.pos++;
            tokens.push({ type: 'LOGICAL', value: 'or', line: this.line, column: this.column });
          }
          break;
        default:
          throw new Error(`Unexpected character '${char}' at line ${this.line}, column ${this.column}`);
      }

      this.pos++;
      this.column++;
    }

    tokens.push({ type: 'EOF', value: '', line: this.line, column: this.column });
    return tokens;
  }

  private peek(): string {
    return this.input[this.pos + 1];
  }

  private readString(quote: string): Token {
    const start = this.column;
    this.pos++; // Skip opening quote
    this.column++;

    let value = '';
    while (this.pos < this.input.length && this.input[this.pos] !== quote) {
      if (this.input[this.pos] === '\\') {
        this.pos++;
        this.column++;
        if (this.pos < this.input.length) {
          switch (this.input[this.pos]) {
            case 'n':
              value += '\n';
              break;
            case 't':
              value += '\t';
              break;
            case '\\':
              value += '\\';
              break;
            case '"':
              value += '"';
              break;
            case "'":
              value += "'";
              break;
            default:
              value += this.input[this.pos];
          }
        }
      } else {
        value += this.input[this.pos];
      }
      this.pos++;
      this.column++;
    }

    if (this.pos >= this.input.length) {
      throw new Error(`Unterminated string at line ${this.line}, column ${start}`);
    }

    this.pos++; // Skip closing quote
    this.column++;

    return { type: 'STRING', value, line: this.line, column: start };
  }

  private readNumber(): Token {
    const start = this.column;
    let value = '';

    while (this.pos < this.input.length && /[\d.]/.test(this.input[this.pos])) {
      value += this.input[this.pos];
      this.pos++;
      this.column++;
    }

    return { type: 'NUMBER', value: parseFloat(value), line: this.line, column: start };
  }

  private readIdentifier(): Token {
    const start = this.column;
    let value = '';

    while (this.pos < this.input.length && /[a-zA-Z0-9_.]/.test(this.input[this.pos])) {
      value += this.input[this.pos];
      this.pos++;
      this.column++;
    }

    // Check for keywords
    switch (value.toLowerCase()) {
      case 'true':
        return { type: 'BOOLEAN', value: true, line: this.line, column: start };
      case 'false':
        return { type: 'BOOLEAN', value: false, line: this.line, column: start };
      case 'and':
        return { type: 'LOGICAL', value: 'and', line: this.line, column: start };
      case 'or':
        return { type: 'LOGICAL', value: 'or', line: this.line, column: start };
      case 'not':
        return { type: 'LOGICAL', value: 'not', line: this.line, column: start };
      case 'in':
        return { type: 'OPERATOR', value: 'in', line: this.line, column: start };
      case 'contains':
        return { type: 'OPERATOR', value: 'contains', line: this.line, column: start };
      case 'matches':
        return { type: 'OPERATOR', value: 'matches', line: this.line, column: start };
      case 'exists':
        return { type: 'OPERATOR', value: 'exists', line: this.line, column: start };
      default:
        return { type: 'IDENTIFIER', value, line: this.line, column: start };
    }
  }
}

/**
 * Parse a policy condition from DSL
 */
export function parseCondition(dsl: string): PolicyCondition {
  const lexer = new PolicyLexer(dsl);
  const tokens = lexer.tokenize();

  if (tokens.length < 3) {
    throw new Error('Invalid condition: expected "field operator value"');
  }

  const fieldToken = tokens[0];
  const operatorToken = tokens[1];
  const valueToken = tokens[2];

  if (fieldToken.type !== 'IDENTIFIER') {
    throw new Error(`Expected identifier for field, got ${fieldToken.type}`);
  }

  if (operatorToken.type !== 'OPERATOR') {
    throw new Error(`Expected operator, got ${operatorToken.type}`);
  }

  return {
    field: fieldToken.value as string,
    operator: operatorToken.value as PolicyOperator,
    value: valueToken.value,
  };
}

/**
 * Parse multiple conditions from DSL (AND-joined)
 */
export function parseConditions(dsl: string): PolicyCondition[] {
  // Split by "and" or "&&"
  const parts = dsl.split(/\s+(?:and|&&)\s+/i);
  return parts.map(part => parseCondition(part.trim()));
}

// =============================================================================
// Policy Evaluator
// =============================================================================

/**
 * Evaluate a condition against a context
 */
export function evaluateDslCondition(
  condition: PolicyCondition,
  context: DslPolicyContext
): boolean {
  const value = getFieldValue(condition.field, context);

  switch (condition.operator) {
    case 'eq':
      return value === condition.value;
    case 'ne':
      return value !== condition.value;
    case 'gt':
      return typeof value === 'number' && value > (condition.value as number);
    case 'gte':
      return typeof value === 'number' && value >= (condition.value as number);
    case 'lt':
      return typeof value === 'number' && value < (condition.value as number);
    case 'lte':
      return typeof value === 'number' && value <= (condition.value as number);
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(value);
    case 'nin':
      return Array.isArray(condition.value) && !condition.value.includes(value);
    case 'contains':
      return typeof value === 'string' && value.includes(condition.value as string);
    case 'matches':
      return typeof value === 'string' && new RegExp(condition.value as string).test(value);
    case 'exists':
      return value !== undefined && value !== null;
    default:
      return false;
  }
}

/**
 * Get a field value from context using dot notation
 */
function getFieldValue(field: string, context: DslPolicyContext): unknown {
  const parts = field.split('.');
  let value: unknown = context;

  for (const part of parts) {
    if (value && typeof value === 'object') {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return value;
}

/**
 * Evaluate a rule against a context
 */
export function evaluateDslRule(rule: DslPolicyRule, context: DslPolicyContext): boolean {
  if (!rule.enabled) return false;

  // Evaluate all conditions (ANDed)
  const conditionsMatch = rule.conditions.every(c => evaluateDslCondition(c, context));

  if (!conditionsMatch) return false;

  // Evaluate nested rules if present
  if (rule.nested) {
    const nestedResults = rule.nested.rules.map(r => evaluateDslRule(r, context));

    switch (rule.nested.operator) {
      case 'and':
        return nestedResults.every(Boolean);
      case 'or':
        return nestedResults.some(Boolean);
      case 'not':
        return !nestedResults[0];
    }
  }

  return true;
}

/**
 * Evaluate a policy document against a context
 */
export function evaluateDslPolicy(
  policy: DslPolicyDocument,
  context: DslPolicyContext
): DslPolicyResult {
  const reasons: string[] = [];
  const sortedRules = [...policy.rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (evaluateDslRule(rule, context)) {
      reasons.push(`Rule "${rule.name}" (${rule.id}) matched`);

      return {
        allowed: rule.action.type === 'allow',
        action: rule.action,
        matchedRuleId: rule.id,
        reasons,
        audit: {
          timestamp: new Date(),
          policyVersion: policy.version,
          evaluatedRules: sortedRules.indexOf(rule) + 1,
          context,
        },
      };
    }
  }

  reasons.push('No matching rules, using default action');

  return {
    allowed: policy.defaultAction.type === 'allow',
    action: policy.defaultAction,
    reasons,
    audit: {
      timestamp: new Date(),
      policyVersion: policy.version,
      evaluatedRules: sortedRules.length,
      context,
    },
  };
}

// =============================================================================
// Policy Validation
// =============================================================================

/**
 * Validate a policy document
 */
export function validateDslPolicy(policy: DslPolicyDocument): PolicyValidationError[] {
  const errors: PolicyValidationError[] = [];

  // Check version
  if (!policy.version) {
    errors.push({ path: 'version', message: 'Version is required', severity: 'error' });
  }

  // Check name
  if (!policy.name) {
    errors.push({ path: 'name', message: 'Name is required', severity: 'error' });
  }

  // Check default action
  if (!policy.defaultAction?.type) {
    errors.push({ path: 'defaultAction.type', message: 'Default action type is required', severity: 'error' });
  }

  // Check rules
  const ruleIds = new Set<string>();
  for (let i = 0; i < policy.rules.length; i++) {
    const rule = policy.rules[i];
    const prefix = `rules[${i}]`;

    if (!rule.id) {
      errors.push({ path: `${prefix}.id`, message: 'Rule ID is required', severity: 'error' });
    } else if (ruleIds.has(rule.id)) {
      errors.push({ path: `${prefix}.id`, message: `Duplicate rule ID: ${rule.id}`, severity: 'error' });
    } else {
      ruleIds.add(rule.id);
    }

    if (!rule.name) {
      errors.push({ path: `${prefix}.name`, message: 'Rule name is required', severity: 'error' });
    }

    if (!rule.action?.type) {
      errors.push({ path: `${prefix}.action.type`, message: 'Rule action type is required', severity: 'error' });
    }

    if (rule.conditions.length === 0 && !rule.nested) {
      errors.push({ path: `${prefix}.conditions`, message: 'Rule must have at least one condition', severity: 'warning' });
    }

    // Validate conditions
    for (let j = 0; j < rule.conditions.length; j++) {
      const condition = rule.conditions[j];
      if (!condition.field) {
        errors.push({ path: `${prefix}.conditions[${j}].field`, message: 'Condition field is required', severity: 'error' });
      }
      if (!condition.operator) {
        errors.push({ path: `${prefix}.conditions[${j}].operator`, message: 'Condition operator is required', severity: 'error' });
      }
    }
  }

  return errors;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a default allow policy
 */
export function createDslAllowPolicy(name: string): DslPolicyDocument {
  return {
    version: '1.0.0',
    name,
    defaultAction: { type: 'allow' },
    rules: [],
  };
}

/**
 * Create a default deny policy
 */
export function createDslDenyPolicy(name: string): DslPolicyDocument {
  return {
    version: '1.0.0',
    name,
    defaultAction: { type: 'deny' },
    rules: [],
  };
}

/**
 * Create a policy rule
 */
export function createDslRule(
  id: string,
  name: string,
  conditions: PolicyCondition[],
  action: DslPolicyAction,
  priority: number = 100
): DslPolicyRule {
  return {
    id,
    name,
    conditions,
    action,
    priority,
    enabled: true,
  };
}
