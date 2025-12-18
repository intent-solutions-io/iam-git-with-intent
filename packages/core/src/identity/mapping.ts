/**
 * Role Mapping Engine
 *
 * Phase 31: Deterministic mapping from IdP claims to internal roles
 *
 * @module @gwi/core/identity/mapping
 */

import { randomBytes } from 'crypto';
import type { Role } from '../security/index.js';
import type {
  RoleMappingRule,
  IdentityAuditEvent,
  MappingSource,
} from './types.js';
import type { OidcIdTokenClaims } from './oidc.js';
import type { SamlAssertion } from './saml.js';
import { getIdentityStore } from './store.js';

// =============================================================================
// Types
// =============================================================================

export interface MappingContext {
  // Source of identity
  source: MappingSource;

  // External ID from IdP
  externalId: string;

  // Email (if available)
  email?: string;

  // Groups from IdP
  groups?: string[];

  // Roles from IdP (some IdPs provide role claims directly)
  roles?: string[];

  // Department (for enterprise user extension)
  department?: string;

  // Raw claims/attributes for custom mapping
  claims: Record<string, unknown>;
}

export interface MappingResult {
  // The determined role
  role: Role;

  // Which rule matched (null if default)
  matchedRule: RoleMappingRule | null;

  // Explanation of why this role was assigned
  reason: string;
}

// =============================================================================
// Mapping Engine
// =============================================================================

export class RoleMappingEngine {
  /**
   * Map identity context to internal role using org's rules
   */
  async mapRole(
    orgId: string,
    context: MappingContext
  ): Promise<MappingResult> {
    const store = getIdentityStore();
    const config = await store.getOrgIdentityConfig(orgId);

    if (!config) {
      return this.defaultResult('No identity config for org');
    }

    // Get rules sorted by priority (lower number = higher priority)
    const rules = [...config.roleMappingRules].sort((a, b) => a.priority - b.priority);

    // Evaluate each rule in priority order
    for (const rule of rules) {
      if (!rule.enabled) continue;

      const match = this.evaluateRule(rule, context);
      if (match.matched) {
        // Log the mapping
        await this.logMappingEvent(orgId, context, rule.assignedRole, rule, match.reason);

        return {
          role: rule.assignedRole,
          matchedRule: rule,
          reason: match.reason,
        };
      }
    }

    // No rules matched, use default role (VIEWER)
    const defaultRole: Role = 'VIEWER';
    await this.logMappingEvent(orgId, context, defaultRole, null, 'No rules matched, using default');

    return {
      role: defaultRole,
      matchedRule: null,
      reason: `Default role: ${defaultRole}`,
    };
  }

  /**
   * Evaluate a single rule against context
   */
  private evaluateRule(
    rule: RoleMappingRule,
    context: MappingContext
  ): { matched: boolean; reason: string } {
    // All conditions must match (AND logic)
    for (const condition of rule.conditions) {
      const matched = this.evaluateCondition(condition, context);
      if (!matched) {
        return { matched: false, reason: `Condition failed: ${condition.field} ${condition.operator} ${condition.value}` };
      }
    }

    return {
      matched: true,
      reason: `Rule "${rule.name}" matched: ${rule.conditions.map(c => `${c.field}=${context.claims[c.field]}`).join(', ')}`,
    };
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    condition: RoleMappingRule['conditions'][0],
    context: MappingContext
  ): boolean {
    // Get the value to check
    let actualValue: unknown;

    switch (condition.field) {
      case 'groups':
        actualValue = context.groups ?? [];
        break;
      case 'roles':
        actualValue = context.roles ?? [];
        break;
      case 'email':
        actualValue = context.email;
        break;
      case 'department':
        actualValue = context.department;
        break;
      default:
        // Look up in raw claims
        actualValue = context.claims[condition.field];
    }

    // Get expected value (handle both string and string[] from schema)
    const expectedValue = Array.isArray(condition.value) ? condition.value : [condition.value];

    // Apply case insensitivity if needed
    const normalize = (v: unknown): string => {
      const str = String(v);
      return condition.caseInsensitive ? str.toLowerCase() : str;
    };

    // Evaluate based on operator
    switch (condition.operator) {
      case 'equals':
        return expectedValue.some(exp => normalize(actualValue) === normalize(exp));

      case 'contains':
        if (Array.isArray(actualValue)) {
          return expectedValue.some(exp =>
            actualValue.some(av => normalize(av) === normalize(exp))
          );
        }
        if (typeof actualValue === 'string') {
          return expectedValue.some(exp =>
            normalize(actualValue).includes(normalize(exp))
          );
        }
        return false;

      case 'matches':
        if (typeof actualValue === 'string') {
          try {
            const pattern = expectedValue[0];
            const flags = condition.caseInsensitive ? 'i' : '';
            const regex = new RegExp(pattern, flags);
            return regex.test(actualValue);
          } catch {
            return false;
          }
        }
        return false;

      case 'in':
        // Check if actual value is in the expected values list
        if (Array.isArray(actualValue)) {
          return actualValue.some(v =>
            expectedValue.some(exp => normalize(v) === normalize(exp))
          );
        }
        return expectedValue.some(exp => normalize(actualValue) === normalize(exp));

      default:
        return false;
    }
  }

  /**
   * Return default mapping result
   */
  private defaultResult(reason: string): MappingResult {
    return {
      role: 'VIEWER',
      matchedRule: null,
      reason,
    };
  }

  /**
   * Log role mapping event
   */
  private async logMappingEvent(
    orgId: string,
    context: MappingContext,
    role: Role,
    rule: RoleMappingRule | null,
    reason: string
  ): Promise<void> {
    const store = getIdentityStore();

    const event: IdentityAuditEvent = {
      id: `audit-${Date.now()}-${randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      orgId,
      actor: {
        type: 'user',
        id: context.externalId,
        email: context.email,
      },
      action: 'role.mapped',
      target: rule ? {
        type: 'mapping_rule',
        id: rule.id,
        displayName: rule.name,
      } : undefined,
      outcome: 'success',
      context: {
        source: context.source,
        assignedRole: role,
        reason,
        groups: context.groups,
      },
    };

    await store.appendAuditEvent(event);
  }
}

// =============================================================================
// Context Builders
// =============================================================================

/**
 * Build mapping context from OIDC claims
 */
export function buildContextFromOidc(claims: OidcIdTokenClaims): MappingContext {
  return {
    source: 'oidc_claim',
    externalId: claims.sub,
    email: claims.email,
    groups: claims.groups,
    roles: claims.roles,
    claims: claims as unknown as Record<string, unknown>,
  };
}

/**
 * Build mapping context from SAML assertion
 */
export function buildContextFromSaml(assertion: SamlAssertion): MappingContext {
  // Extract groups from various possible attribute names
  let groups: string[] | undefined;
  const groupAttr = assertion.attributes['groups'] ??
    assertion.attributes['http://schemas.microsoft.com/ws/2008/06/identity/claims/groups'] ??
    assertion.attributes['memberOf'];

  if (typeof groupAttr === 'string') {
    groups = [groupAttr];
  } else if (Array.isArray(groupAttr)) {
    groups = groupAttr;
  }

  // Extract department
  let department: string | undefined;
  const deptAttr = assertion.attributes['department'] ??
    assertion.attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/department'];
  if (typeof deptAttr === 'string') {
    department = deptAttr;
  } else if (Array.isArray(deptAttr)) {
    department = deptAttr[0];
  }

  // Extract email
  let email: string | undefined;
  const emailAttr = assertion.attributes['email'] ??
    assertion.attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'];
  if (typeof emailAttr === 'string') {
    email = emailAttr;
  } else if (Array.isArray(emailAttr)) {
    email = emailAttr[0];
  } else if (assertion.nameIdFormat?.includes('emailAddress')) {
    email = assertion.nameId;
  }

  return {
    source: 'saml_attribute',
    externalId: assertion.nameId,
    email,
    groups,
    department,
    claims: assertion.attributes as Record<string, unknown>,
  };
}

/**
 * Build mapping context from SCIM user and groups
 */
export function buildContextFromScim(
  externalId: string,
  email?: string,
  groups?: string[]
): MappingContext {
  return {
    source: 'scim_group',
    externalId,
    email,
    groups,
    claims: { email, groups },
  };
}

// =============================================================================
// Rule Helpers
// =============================================================================

/**
 * Create common role mapping rules
 */
export const COMMON_RULES = {
  /**
   * Map admin group to ADMIN role
   */
  adminGroup: (groupName: string, priority: number = 10): RoleMappingRule => ({
    id: `rule-admin-${groupName}`,
    name: `Admin from ${groupName}`,
    enabled: true,
    priority,
    conditions: [
      { source: 'oidc_claim', field: 'groups', operator: 'contains', value: groupName, caseInsensitive: true },
    ],
    assignedRole: 'ADMIN',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),

  /**
   * Map developers group to DEVELOPER role
   */
  developerGroup: (groupName: string, priority: number = 20): RoleMappingRule => ({
    id: `rule-dev-${groupName}`,
    name: `Developer from ${groupName}`,
    enabled: true,
    priority,
    conditions: [
      { source: 'oidc_claim', field: 'groups', operator: 'contains', value: groupName, caseInsensitive: true },
    ],
    assignedRole: 'DEVELOPER',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),

  /**
   * Map email domain to role (using regex match)
   */
  emailDomain: (domain: string, role: Role, priority: number = 30): RoleMappingRule => ({
    id: `rule-domain-${domain}-${role}`,
    name: `${role} from @${domain}`,
    enabled: true,
    priority,
    conditions: [
      { source: 'oidc_claim', field: 'email', operator: 'matches', value: `@${domain.replace('.', '\\.')}$`, caseInsensitive: true },
    ],
    assignedRole: role,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),

  /**
   * Map specific user to OWNER role
   */
  owner: (email: string, priority: number = 1): RoleMappingRule => ({
    id: `rule-owner-${email.replace('@', '-at-')}`,
    name: `Owner: ${email}`,
    enabled: true,
    priority,
    conditions: [
      { source: 'oidc_claim', field: 'email', operator: 'equals', value: email, caseInsensitive: true },
    ],
    assignedRole: 'OWNER',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
};

// =============================================================================
// Singleton
// =============================================================================

let roleMappingEngineInstance: RoleMappingEngine | null = null;

export function getRoleMappingEngine(): RoleMappingEngine {
  if (!roleMappingEngineInstance) {
    roleMappingEngineInstance = new RoleMappingEngine();
  }
  return roleMappingEngineInstance;
}

export function setRoleMappingEngine(engine: RoleMappingEngine): void {
  roleMappingEngineInstance = engine;
}

export function resetRoleMappingEngine(): void {
  roleMappingEngineInstance = null;
}
