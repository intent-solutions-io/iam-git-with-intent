/**
 * Contract Tests - Identity Module
 *
 * Phase 31: Tests for SSO, SCIM, and role mapping
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Types & Schemas
  OidcConfigSchema,
  SamlConfigSchema,
  OrgIdentityConfigSchema,
  ScimUserSchema,
  ScimGroupSchema,
  RoleMappingRuleSchema,
  IdentityAuditEventSchema,

  // Store
  InMemoryIdentityStore,
  getIdentityStore,
  setIdentityStore,
  resetIdentityStore,

  // OIDC
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  generateNonce,

  // SCIM
  SCIM_SCHEMAS,
  hashScimToken,
  generateScimToken,

  // Role Mapping
  RoleMappingEngine,
  buildContextFromOidc,
  buildContextFromSaml,
  COMMON_RULES,
} from '../../packages/core/src/identity/index.js';

// =============================================================================
// Schema Validation Tests
// =============================================================================

describe('Identity Schema Validation', () => {
  describe('OidcConfigSchema', () => {
    it('accepts valid OIDC config', () => {
      const config = {
        type: 'oidc',
        name: 'Corporate OIDC',
        enabled: true,
        issuer: 'https://idp.example.com',
        clientId: 'client-123',
        authorizationEndpoint: 'https://idp.example.com/authorize',
        tokenEndpoint: 'https://idp.example.com/token',
        jwksUri: 'https://idp.example.com/.well-known/jwks.json',
        scopes: ['openid', 'profile', 'email'],
        allowedRedirectUris: ['https://app.example.com/callback'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = OidcConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('rejects config missing required fields', () => {
      const config = {
        type: 'oidc',
        issuer: 'https://idp.example.com',
        // Missing clientId, name, allowedRedirectUris
      };
      const result = OidcConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('SamlConfigSchema', () => {
    it('accepts valid SAML config', () => {
      const config = {
        type: 'saml',
        name: 'Corporate SAML',
        enabled: true,
        entityId: 'https://idp.example.com',
        ssoUrl: 'https://idp.example.com/sso',
        certificate: 'MIIBkTCB+wIJAKH...',
        allowedAcsUrls: ['https://app.example.com/acs'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = SamlConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('rejects config with invalid type', () => {
      const config = {
        type: 'invalid',
        entityId: 'urn:gwi:sp',
        ssoUrl: 'https://idp.example.com/sso',
      };
      const result = SamlConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('OrgIdentityConfigSchema', () => {
    it('accepts valid org identity config', () => {
      const config = {
        orgId: 'org-123',
        idpConfigs: [{
          type: 'oidc',
          name: 'Corporate SSO',
          enabled: true,
          issuer: 'https://idp.example.com',
          clientId: 'client-123',
          authorizationEndpoint: 'https://idp.example.com/authorize',
          tokenEndpoint: 'https://idp.example.com/token',
          scopes: ['openid'],
          allowedRedirectUris: ['https://app.example.com/callback'],
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
        roleMappingRules: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = OrgIdentityConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('ScimUserSchema', () => {
    it('accepts valid SCIM user', () => {
      const user = {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'jdoe@example.com',
        displayName: 'John Doe',
        active: true,
        emails: [{ value: 'jdoe@example.com', primary: true }],
      };
      const result = ScimUserSchema.safeParse(user);
      expect(result.success).toBe(true);
    });

    it('rejects user without userName', () => {
      const user = {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        displayName: 'John Doe',
      };
      const result = ScimUserSchema.safeParse(user);
      expect(result.success).toBe(false);
    });
  });

  describe('ScimGroupSchema', () => {
    it('accepts valid SCIM group', () => {
      const group = {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'Developers',
        members: [{ value: 'user-1', display: 'John Doe' }],
      };
      const result = ScimGroupSchema.safeParse(group);
      expect(result.success).toBe(true);
    });
  });

  describe('RoleMappingRuleSchema', () => {
    it('accepts valid role mapping rule', () => {
      const rule = {
        id: 'rule-1',
        name: 'Admin Group',
        priority: 10,
        enabled: true,
        conditions: [
          { source: 'oidc_claim', field: 'groups', operator: 'contains', value: 'admins', caseInsensitive: true },
        ],
        assignedRole: 'ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = RoleMappingRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });

    it('rejects rule with invalid operator', () => {
      const rule = {
        id: 'rule-1',
        name: 'Test',
        priority: 10,
        enabled: true,
        conditions: [
          { source: 'oidc_claim', field: 'groups', operator: 'invalid', value: 'test', caseInsensitive: true },
        ],
        assignedRole: 'ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = RoleMappingRuleSchema.safeParse(rule);
      expect(result.success).toBe(false);
    });
  });

  describe('IdentityAuditEventSchema', () => {
    it('accepts valid audit event', () => {
      const event = {
        id: 'audit-1',
        timestamp: new Date().toISOString(),
        orgId: 'org-123',
        actor: { type: 'user', id: 'user-1', email: 'user@example.com' },
        action: 'sso.login.success',
        outcome: 'success',
      };
      const result = IdentityAuditEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// Store Tests
// =============================================================================

describe('InMemoryIdentityStore', () => {
  let store: InMemoryIdentityStore;

  beforeEach(() => {
    store = new InMemoryIdentityStore();
    setIdentityStore(store);
  });

  describe('Org Identity Config', () => {
    it('saves and retrieves config', async () => {
      const config = {
        orgId: 'org-123',
        idpConfigs: [],
        roleMappingRules: [],
        defaultRole: 'VIEWER' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await store.saveOrgIdentityConfig(config);
      const retrieved = await store.getOrgIdentityConfig('org-123');
      expect(retrieved).toEqual(config);
    });

    it('returns null for non-existent config', async () => {
      const result = await store.getOrgIdentityConfig('non-existent');
      expect(result).toBeNull();
    });

    it('deletes config', async () => {
      const config = {
        orgId: 'org-to-delete',
        idpConfigs: [],
        roleMappingRules: [],
        defaultRole: 'VIEWER' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await store.saveOrgIdentityConfig(config);
      await store.deleteOrgIdentityConfig('org-to-delete');
      const result = await store.getOrgIdentityConfig('org-to-delete');
      expect(result).toBeNull();
    });
  });

  describe('SSO State', () => {
    it('saves and consumes state', async () => {
      const state = {
        state: 'abc123',
        nonce: 'nonce456',
        orgId: 'org-1',
        idpConfigId: 'idp-1',
        redirectUri: 'https://app.example.com/callback',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
      };

      await store.saveSsoState(state);
      const consumed = await store.consumeSsoState('abc123');
      expect(consumed).toEqual(state);

      // Second consume should return null (one-time use)
      const second = await store.consumeSsoState('abc123');
      expect(second).toBeNull();
    });

    it('returns null for expired state', async () => {
      const state = {
        state: 'expired-state',
        orgId: 'org-1',
        idpConfigId: 'idp-1',
        redirectUri: 'https://app.example.com/callback',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 1000), // Expired
      };

      await store.saveSsoState(state);
      const consumed = await store.consumeSsoState('expired-state');
      expect(consumed).toBeNull();
    });
  });

  describe('SCIM Users', () => {
    const orgId = 'org-scim';

    it('creates and retrieves user', async () => {
      const user = {
        schemas: [SCIM_SCHEMAS.USER],
        userName: 'jdoe@example.com',
        displayName: 'John Doe',
        active: true,
      };

      const created = await store.createScimUser(orgId, user);
      expect(created.id).toBeDefined();
      expect(created.meta).toBeDefined();
      expect(created.meta?.resourceType).toBe('User');

      const retrieved = await store.getScimUser(orgId, created.id!);
      expect(retrieved?.userName).toBe('jdoe@example.com');
    });

    it('finds user by username', async () => {
      await store.createScimUser(orgId, {
        schemas: [SCIM_SCHEMAS.USER],
        userName: 'unique@example.com',
        active: true,
      });

      const found = await store.getScimUserByUsername(orgId, 'unique@example.com');
      expect(found).toBeDefined();
      expect(found?.userName).toBe('unique@example.com');
    });

    it('lists users with pagination', async () => {
      // Create multiple users
      for (let i = 0; i < 5; i++) {
        await store.createScimUser(orgId, {
          schemas: [SCIM_SCHEMAS.USER],
          userName: `user${i}@example.com`,
          active: true,
        });
      }

      const result = await store.listScimUsers(orgId, { startIndex: 1, count: 2 });
      expect(result.users.length).toBe(2);
      expect(result.totalResults).toBe(5);
    });

    it('updates user', async () => {
      const created = await store.createScimUser(orgId, {
        schemas: [SCIM_SCHEMAS.USER],
        userName: 'update-me@example.com',
        displayName: 'Original Name',
        active: true,
      });

      const updated = await store.updateScimUser(orgId, created.id!, {
        displayName: 'Updated Name',
      });

      expect(updated?.displayName).toBe('Updated Name');
      expect(updated?.userName).toBe('update-me@example.com');
    });

    it('deletes user', async () => {
      const created = await store.createScimUser(orgId, {
        schemas: [SCIM_SCHEMAS.USER],
        userName: 'delete-me@example.com',
        active: true,
      });

      const deleted = await store.deleteScimUser(orgId, created.id!);
      expect(deleted).toBe(true);

      const result = await store.getScimUser(orgId, created.id!);
      expect(result).toBeNull();
    });
  });

  describe('SCIM Groups', () => {
    const orgId = 'org-scim-groups';

    it('creates and retrieves group', async () => {
      const group = {
        schemas: [SCIM_SCHEMAS.GROUP],
        displayName: 'Developers',
        members: [],
      };

      const created = await store.createScimGroup(orgId, group);
      expect(created.id).toBeDefined();
      expect(created.meta?.resourceType).toBe('Group');

      const retrieved = await store.getScimGroup(orgId, created.id!);
      expect(retrieved?.displayName).toBe('Developers');
    });

    it('updates group members', async () => {
      const created = await store.createScimGroup(orgId, {
        schemas: [SCIM_SCHEMAS.GROUP],
        displayName: 'Team',
        members: [],
      });

      const updated = await store.updateScimGroup(orgId, created.id!, {
        members: [
          { value: 'user-1', display: 'User One' },
          { value: 'user-2', display: 'User Two' },
        ],
      });

      expect(updated?.members?.length).toBe(2);
    });
  });

  describe('Audit Events', () => {
    const orgId = 'org-audit';

    it('appends and queries events', async () => {
      await store.appendAuditEvent({
        id: 'event-1',
        timestamp: new Date().toISOString(),
        orgId,
        actor: { type: 'user', id: 'user-1' },
        action: 'sso.login.success',
        outcome: 'success',
      });

      await store.appendAuditEvent({
        id: 'event-2',
        timestamp: new Date().toISOString(),
        orgId,
        actor: { type: 'user', id: 'user-1' },
        action: 'scim.user.created',
        outcome: 'success',
      });

      const result = await store.queryAuditEvents(orgId);
      expect(result.events.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it('filters events by action', async () => {
      await store.appendAuditEvent({
        id: 'event-3',
        timestamp: new Date().toISOString(),
        orgId,
        actor: { type: 'user', id: 'user-2' },
        action: 'sso.login.failed',
        outcome: 'failure',
      });

      const result = await store.queryAuditEvents(orgId, { action: 'sso.login.failed' });
      expect(result.events.length).toBe(1);
      expect(result.events[0].action).toBe('sso.login.failed');
    });
  });
});

// =============================================================================
// PKCE Tests
// =============================================================================

describe('PKCE Utilities', () => {
  it('generates code verifier with correct length', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('generates deterministic code challenge from verifier', () => {
    const verifier = 'test-verifier-12345678901234567890';
    const challenge1 = generateCodeChallenge(verifier);
    const challenge2 = generateCodeChallenge(verifier);
    expect(challenge1).toBe(challenge2);
  });

  it('generates unique states', () => {
    const state1 = generateState();
    const state2 = generateState();
    expect(state1).not.toBe(state2);
  });

  it('generates unique nonces', () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();
    expect(nonce1).not.toBe(nonce2);
  });
});

// =============================================================================
// SCIM Token Tests
// =============================================================================

describe('SCIM Token Utilities', () => {
  it('generates token with correct prefix', () => {
    const { token, hash } = generateScimToken();
    expect(token.startsWith('scim_')).toBe(true);
    expect(hash.length).toBe(64); // SHA256 hex
  });

  it('hashes token deterministically', () => {
    const token = 'scim_test123';
    const hash1 = hashScimToken(token);
    const hash2 = hashScimToken(token);
    expect(hash1).toBe(hash2);
  });

  it('generates different tokens each time', () => {
    const { token: t1 } = generateScimToken();
    const { token: t2 } = generateScimToken();
    expect(t1).not.toBe(t2);
  });
});

// =============================================================================
// Role Mapping Engine Tests
// =============================================================================

describe('RoleMappingEngine', () => {
  let engine: RoleMappingEngine;
  let store: InMemoryIdentityStore;

  beforeEach(() => {
    engine = new RoleMappingEngine();
    store = new InMemoryIdentityStore();
    setIdentityStore(store);
  });

  it('returns default role when no config exists', async () => {
    const result = await engine.mapRole('no-config', {
      source: 'oidc_claim',
      externalId: 'user-1',
      claims: {},
    });

    expect(result.role).toBe('VIEWER');
    expect(result.matchedRule).toBeNull();
  });

  it('maps admin group to ADMIN role', async () => {
    // Set up config with admin rule
    await store.saveOrgIdentityConfig({
      orgId: 'org-admin',
      idpConfigs: [],
      roleMappingRules: [COMMON_RULES.adminGroup('admins', 10)],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await engine.mapRole('org-admin', {
      source: 'oidc_claim',
      externalId: 'user-1',
      groups: ['admins', 'users'],
      claims: {},
    });

    expect(result.role).toBe('ADMIN');
    expect(result.matchedRule?.name).toBe('Admin from admins');
  });

  it('respects priority order', async () => {
    await store.saveOrgIdentityConfig({
      orgId: 'org-priority',
      idpConfigs: [],
      roleMappingRules: [
        {
          id: 'rule-dev',
          name: 'Developer',
          priority: 20,
          enabled: true,
          conditions: [{ source: 'oidc_claim', field: 'groups', operator: 'contains', value: 'developers', caseInsensitive: true }],
          assignedRole: 'DEVELOPER',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'rule-admin',
          name: 'Admin',
          priority: 10, // Higher priority (lower number)
          enabled: true,
          conditions: [{ source: 'oidc_claim', field: 'groups', operator: 'contains', value: 'admins', caseInsensitive: true }],
          assignedRole: 'ADMIN',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // User in both groups should get ADMIN (higher priority)
    const result = await engine.mapRole('org-priority', {
      source: 'oidc_claim',
      externalId: 'user-1',
      groups: ['admins', 'developers'],
      claims: {},
    });

    expect(result.role).toBe('ADMIN');
  });

  it('skips disabled rules', async () => {
    await store.saveOrgIdentityConfig({
      orgId: 'org-disabled',
      idpConfigs: [],
      roleMappingRules: [
        {
          id: 'rule-disabled',
          name: 'Disabled Admin',
          priority: 10,
          enabled: false,
          conditions: [{ source: 'oidc_claim', field: 'groups', operator: 'contains', value: 'admins', caseInsensitive: true }],
          assignedRole: 'ADMIN',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await engine.mapRole('org-disabled', {
      source: 'oidc_claim',
      externalId: 'user-1',
      groups: ['admins'],
      claims: {},
    });

    expect(result.role).toBe('VIEWER'); // Default, rule was disabled
  });

  it('evaluates email matches condition', async () => {
    await store.saveOrgIdentityConfig({
      orgId: 'org-email',
      idpConfigs: [],
      roleMappingRules: [
        COMMON_RULES.emailDomain('company.com', 'DEVELOPER', 10),
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await engine.mapRole('org-email', {
      source: 'oidc_claim',
      externalId: 'user-1',
      email: 'john@company.com',
      claims: {},
    });

    expect(result.role).toBe('DEVELOPER');
  });

  it('evaluates equals condition', async () => {
    await store.saveOrgIdentityConfig({
      orgId: 'org-equals',
      idpConfigs: [],
      roleMappingRules: [
        COMMON_RULES.owner('admin@example.com', 1),
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await engine.mapRole('org-equals', {
      source: 'oidc_claim',
      externalId: 'user-1',
      email: 'admin@example.com',
      claims: {},
    });

    expect(result.role).toBe('OWNER');
  });
});

// =============================================================================
// Context Builders Tests
// =============================================================================

describe('Context Builders', () => {
  describe('buildContextFromOidc', () => {
    it('extracts claims from OIDC token', () => {
      const claims = {
        iss: 'https://idp.example.com',
        sub: 'user-123',
        aud: 'client-123',
        exp: Date.now() / 1000 + 3600,
        iat: Date.now() / 1000,
        email: 'user@example.com',
        groups: ['admins', 'users'],
        roles: ['admin'],
      };

      const context = buildContextFromOidc(claims);

      expect(context.source).toBe('oidc_claim');
      expect(context.externalId).toBe('user-123');
      expect(context.email).toBe('user@example.com');
      expect(context.groups).toEqual(['admins', 'users']);
      expect(context.roles).toEqual(['admin']);
    });
  });

  describe('buildContextFromSaml', () => {
    it('extracts attributes from SAML assertion', () => {
      const assertion = {
        issuer: 'https://idp.example.com',
        nameId: 'user@example.com',
        nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        attributes: {
          'email': 'user@example.com',
          'groups': ['developers'],
          'department': 'Engineering',
        },
      };

      const context = buildContextFromSaml(assertion);

      expect(context.source).toBe('saml_attribute');
      expect(context.externalId).toBe('user@example.com');
      expect(context.email).toBe('user@example.com');
      expect(context.groups).toEqual(['developers']);
      expect(context.department).toBe('Engineering');
    });
  });
});

// =============================================================================
// SCIM Schema Constants Tests
// =============================================================================

describe('SCIM Schema Constants', () => {
  it('defines correct schema URIs', () => {
    expect(SCIM_SCHEMAS.USER).toBe('urn:ietf:params:scim:schemas:core:2.0:User');
    expect(SCIM_SCHEMAS.GROUP).toBe('urn:ietf:params:scim:schemas:core:2.0:Group');
    expect(SCIM_SCHEMAS.LIST_RESPONSE).toBe('urn:ietf:params:scim:api:messages:2.0:ListResponse');
    expect(SCIM_SCHEMAS.ERROR).toBe('urn:ietf:params:scim:api:messages:2.0:Error');
    expect(SCIM_SCHEMAS.PATCH_OP).toBe('urn:ietf:params:scim:api:messages:2.0:PatchOp');
  });
});
