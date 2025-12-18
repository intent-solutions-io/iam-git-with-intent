/**
 * Tenancy Module Tests
 *
 * Phase 5: Tests for tenant context, policy engine, and config store.
 *
 * @module @gwi/core/tenancy/__tests__/tenancy.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Context
  ActorContext,
  TenantContext,
  ExecutionContext,
  createCliActor,
  createServiceActor,
  createGitHubAppActor,
  createTenantContext,
  createExecutionContext,
  validateTenantContext,
  isActorType,
  isFromSource,
  // Policy
  PolicyDocument,
  InMemoryPolicyEngine,
  createDefaultPolicy,
  createDevPolicy,
  createPolicyRequest,
  // Config
  MemoryConfigStore,
  ConfigNotFoundError,
  createTestTenantConfig,
} from '../index.js';

// =============================================================================
// Actor Context Tests
// =============================================================================

describe('ActorContext', () => {
  it('should create CLI actor', () => {
    const actor = createCliActor('user-123', 'John Doe');

    expect(actor.actorId).toBe('user-123');
    expect(actor.actorType).toBe('human');
    expect(actor.source).toBe('cli');
    expect(actor.displayName).toBe('John Doe');
  });

  it('should create service actor', () => {
    const actor = createServiceActor('svc-automation');

    expect(actor.actorId).toBe('svc-automation');
    expect(actor.actorType).toBe('service');
    expect(actor.source).toBe('api');
  });

  it('should create GitHub App actor', () => {
    const actor = createGitHubAppActor('12345');

    expect(actor.actorId).toBe('github-app-12345');
    expect(actor.actorType).toBe('github_app');
    expect(actor.source).toBe('webhook');
  });

  it('should require actorId', () => {
    expect(() => ActorContext.parse({
      actorId: '',
      actorType: 'human',
      source: 'cli',
    })).toThrow();
  });
});

// =============================================================================
// Tenant Context Tests
// =============================================================================

describe('TenantContext', () => {
  it('should create tenant context', () => {
    const actor = createCliActor('user-123');
    const ctx = createTenantContext('tenant-abc', actor);

    expect(ctx.tenantId).toBe('tenant-abc');
    expect(ctx.actor.actorId).toBe('user-123');
    expect(ctx.requestedAt).toBeDefined();
  });

  it('should include optional repo context', () => {
    const actor = createCliActor('user-123');
    const ctx = createTenantContext('tenant-abc', actor, {
      repo: { owner: 'octocat', name: 'hello-world' },
    });

    expect(ctx.repo?.owner).toBe('octocat');
    expect(ctx.repo?.name).toBe('hello-world');
    expect(ctx.repo?.fullName).toBe('octocat/hello-world');
  });

  it('should require tenantId', () => {
    const actor = createCliActor('user-123');

    expect(() => TenantContext.parse({
      tenantId: '',
      actor,
    })).toThrow();
  });

  it('should validate context completely', () => {
    const actor = createCliActor('user-123');
    const ctx = createTenantContext('tenant-abc', actor);

    const validated = validateTenantContext(ctx);
    expect(validated.tenantId).toBe('tenant-abc');
  });

  it('should check actor type', () => {
    const humanActor = createCliActor('user-123');
    const serviceActor = createServiceActor('svc-123');

    const humanCtx = createTenantContext('tenant', humanActor);
    const serviceCtx = createTenantContext('tenant', serviceActor);

    expect(isActorType(humanCtx, 'human')).toBe(true);
    expect(isActorType(humanCtx, 'service')).toBe(false);
    expect(isActorType(serviceCtx, 'service')).toBe(true);
  });

  it('should check request source', () => {
    const cliActor = createCliActor('user-123');
    const apiActor = createServiceActor('svc-123');

    const cliCtx = createTenantContext('tenant', cliActor);
    const apiCtx = createTenantContext('tenant', apiActor);

    expect(isFromSource(cliCtx, 'cli')).toBe(true);
    expect(isFromSource(cliCtx, 'api')).toBe(false);
    expect(isFromSource(apiCtx, 'api')).toBe(true);
  });
});

// =============================================================================
// Execution Context Tests
// =============================================================================

describe('ExecutionContext', () => {
  it('should create execution context', () => {
    const actor = createCliActor('user-123');
    const tenant = createTenantContext('tenant-abc', actor);
    const ctx = createExecutionContext('00000000-0000-0000-0000-000000000001', tenant);

    expect(ctx.runId).toBe('00000000-0000-0000-0000-000000000001');
    expect(ctx.tenant.tenantId).toBe('tenant-abc');
  });

  it('should include approval', () => {
    const actor = createCliActor('user-123');
    const tenant = createTenantContext('tenant-abc', actor);
    const ctx = createExecutionContext('00000000-0000-0000-0000-000000000001', tenant, {
      approval: {
        runId: '00000000-0000-0000-0000-000000000001',
        approvedAt: new Date().toISOString(),
        approvedBy: 'user-123',
        scope: ['push'],
        patchHash: 'abc123',
      },
    });

    expect(ctx.approval).toBeDefined();
    expect(ctx.approval?.scope).toContain('push');
  });
});

// =============================================================================
// Policy Engine Tests
// =============================================================================

describe('InMemoryPolicyEngine', () => {
  let engine: InMemoryPolicyEngine;

  beforeEach(() => {
    engine = new InMemoryPolicyEngine();
  });

  describe('without policy', () => {
    it('should allow READ by default', () => {
      const decision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-123',
          actor: { actorId: 'user-1', actorType: 'human', source: 'cli' },
        },
        toolName: 'github.getIssue',
        connectorId: 'github',
        policyClass: 'READ',
      });

      expect(decision.allowed).toBe(true);
      expect(decision.reasonCode).toBe('ALLOW_READ_DEFAULT');
    });

    it('should deny WRITE_NON_DESTRUCTIVE by default', () => {
      const decision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-123',
          actor: { actorId: 'user-1', actorType: 'human', source: 'cli' },
        },
        toolName: 'github.postComment',
        connectorId: 'github',
        policyClass: 'WRITE_NON_DESTRUCTIVE',
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe('DENY_NO_POLICY');
    });

    it('should deny DESTRUCTIVE without approval', () => {
      const decision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-123',
          actor: { actorId: 'user-1', actorType: 'human', source: 'cli' },
        },
        toolName: 'github.createBranch',
        connectorId: 'github',
        policyClass: 'DESTRUCTIVE',
        hasApproval: false,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe('DENY_DESTRUCTIVE_NO_APPROVAL');
    });

    it('should deny DESTRUCTIVE with approval but no policy', () => {
      const decision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-123',
          actor: { actorId: 'user-1', actorType: 'human', source: 'cli' },
        },
        toolName: 'github.createBranch',
        connectorId: 'github',
        policyClass: 'DESTRUCTIVE',
        hasApproval: true,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe('DENY_NO_POLICY');
    });
  });

  describe('with dev policy', () => {
    beforeEach(() => {
      engine.loadPolicy(createDevPolicy());
    });

    it('should allow READ', () => {
      const decision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-123',
          actor: { actorId: 'user-1', actorType: 'human', source: 'cli' },
        },
        toolName: 'github.getIssue',
        connectorId: 'github',
        policyClass: 'READ',
      });

      expect(decision.allowed).toBe(true);
    });

    it('should allow WRITE_NON_DESTRUCTIVE', () => {
      const decision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-123',
          actor: { actorId: 'user-1', actorType: 'human', source: 'cli' },
        },
        toolName: 'github.postComment',
        connectorId: 'github',
        policyClass: 'WRITE_NON_DESTRUCTIVE',
      });

      expect(decision.allowed).toBe(true);
      expect(decision.reasonCode).toBe('ALLOW_POLICY_MATCH');
    });

    it('should allow DESTRUCTIVE with approval', () => {
      const decision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-123',
          actor: { actorId: 'user-1', actorType: 'human', source: 'cli' },
        },
        toolName: 'github.createBranch',
        connectorId: 'github',
        policyClass: 'DESTRUCTIVE',
        hasApproval: true,
      });

      expect(decision.allowed).toBe(true);
      expect(decision.reasonCode).toBe('ALLOW_POLICY_MATCH');
    });
  });

  describe('with custom policy', () => {
    it('should match tenant conditions', () => {
      engine.loadPolicy(PolicyDocument.parse({
        version: '1.0',
        name: 'tenant-specific',
        rules: [
          {
            id: 'allow-tenant-a',
            effect: 'allow',
            conditions: {
              tenants: ['tenant-a'],
              policyClasses: ['WRITE_NON_DESTRUCTIVE'],
            },
          },
        ],
      }));

      const allowedDecision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-a',
          actor: { actorId: 'user-1', actorType: 'human', source: 'cli' },
        },
        toolName: 'github.postComment',
        connectorId: 'github',
        policyClass: 'WRITE_NON_DESTRUCTIVE',
      });

      const deniedDecision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-b',
          actor: { actorId: 'user-1', actorType: 'human', source: 'cli' },
        },
        toolName: 'github.postComment',
        connectorId: 'github',
        policyClass: 'WRITE_NON_DESTRUCTIVE',
      });

      expect(allowedDecision.allowed).toBe(true);
      expect(deniedDecision.allowed).toBe(false);
    });

    it('should match actor type conditions', () => {
      engine.loadPolicy(PolicyDocument.parse({
        version: '1.0',
        name: 'actor-type-specific',
        rules: [
          {
            id: 'allow-service-accounts',
            effect: 'allow',
            conditions: {
              actorTypes: ['service'],
              policyClasses: ['WRITE_NON_DESTRUCTIVE'],
            },
          },
        ],
      }));

      const serviceDecision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-a',
          actor: { actorId: 'svc-1', actorType: 'service', source: 'api' },
        },
        toolName: 'github.postComment',
        connectorId: 'github',
        policyClass: 'WRITE_NON_DESTRUCTIVE',
      });

      const humanDecision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-a',
          actor: { actorId: 'user-1', actorType: 'human', source: 'cli' },
        },
        toolName: 'github.postComment',
        connectorId: 'github',
        policyClass: 'WRITE_NON_DESTRUCTIVE',
      });

      expect(serviceDecision.allowed).toBe(true);
      expect(humanDecision.allowed).toBe(false);
    });

    it('should match tool wildcard patterns', () => {
      engine.loadPolicy(PolicyDocument.parse({
        version: '1.0',
        name: 'tool-wildcard',
        rules: [
          {
            id: 'allow-github-all',
            effect: 'allow',
            conditions: {
              tools: ['github.*'],
              policyClasses: ['WRITE_NON_DESTRUCTIVE'],
            },
          },
        ],
      }));

      const githubDecision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-a',
          actor: { actorId: 'user-1', actorType: 'human', source: 'cli' },
        },
        toolName: 'github.postComment',
        connectorId: 'github',
        policyClass: 'WRITE_NON_DESTRUCTIVE',
      });

      const airbyteDecision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-a',
          actor: { actorId: 'user-1', actorType: 'human', source: 'cli' },
        },
        toolName: 'airbyte.triggerSync',
        connectorId: 'airbyte',
        policyClass: 'WRITE_NON_DESTRUCTIVE',
      });

      expect(githubDecision.allowed).toBe(true);
      expect(airbyteDecision.allowed).toBe(false);
    });

    it('should respect rule priority', () => {
      engine.loadPolicy(PolicyDocument.parse({
        version: '1.0',
        name: 'priority-test',
        rules: [
          {
            id: 'deny-all',
            effect: 'deny',
            priority: 0,
            conditions: {
              policyClasses: ['WRITE_NON_DESTRUCTIVE'],
            },
          },
          {
            id: 'allow-admin',
            effect: 'allow',
            priority: 100,
            conditions: {
              actors: ['admin'],
              policyClasses: ['WRITE_NON_DESTRUCTIVE'],
            },
          },
        ],
      }));

      const adminDecision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-a',
          actor: { actorId: 'admin', actorType: 'human', source: 'cli' },
        },
        toolName: 'github.postComment',
        connectorId: 'github',
        policyClass: 'WRITE_NON_DESTRUCTIVE',
      });

      const userDecision = engine.evaluate({
        tenant: {
          tenantId: 'tenant-a',
          actor: { actorId: 'user-1', actorType: 'human', source: 'cli' },
        },
        toolName: 'github.postComment',
        connectorId: 'github',
        policyClass: 'WRITE_NON_DESTRUCTIVE',
      });

      expect(adminDecision.allowed).toBe(true);
      expect(adminDecision.matchedRule).toBe('allow-admin');
      expect(userDecision.allowed).toBe(false);
      expect(userDecision.matchedRule).toBe('deny-all');
    });
  });

  describe('createPolicyRequest helper', () => {
    it('should create policy request from tenant context', () => {
      const actor = createCliActor('user-123');
      const tenant = createTenantContext('tenant-abc', actor);

      const request = createPolicyRequest(
        tenant,
        'github.postComment',
        'github',
        'WRITE_NON_DESTRUCTIVE',
        { resource: 'octocat/hello-world' }
      );

      expect(request.tenant.tenantId).toBe('tenant-abc');
      expect(request.tenant.actor.actorId).toBe('user-123');
      expect(request.toolName).toBe('github.postComment');
      expect(request.resource).toBe('octocat/hello-world');
    });
  });
});

// =============================================================================
// Config Store Tests
// =============================================================================

describe('MemoryConfigStore', () => {
  let store: MemoryConfigStore;

  beforeEach(() => {
    store = new MemoryConfigStore();
  });

  it('should throw ConfigNotFoundError for missing tenant', async () => {
    await expect(store.getTenantConfig('nonexistent')).rejects.toThrow(ConfigNotFoundError);
  });

  it('should throw ConfigNotFoundError for missing connector', async () => {
    store.addTenantConfig(createTestTenantConfig('tenant-a', {}));

    await expect(store.getConfig('tenant-a', 'github')).rejects.toThrow(ConfigNotFoundError);
  });

  it('should return tenant config', async () => {
    store.addTenantConfig(createTestTenantConfig('tenant-a', {
      github: { config: { token: '${GITHUB_TOKEN}' } },
    }));

    const config = await store.getTenantConfig('tenant-a');

    expect(config.tenantId).toBe('tenant-a');
    expect(config.connectors.github).toBeDefined();
  });

  it('should return connector config', async () => {
    store.addTenantConfig(createTestTenantConfig('tenant-a', {
      github: { config: { baseUrl: 'https://api.github.com' } },
    }));

    const config = await store.getConfig('tenant-a', 'github');

    expect(config.connectorId).toBe('github');
    expect(config.config.baseUrl).toBe('https://api.github.com');
  });

  it('should check if connector is enabled', async () => {
    store.addTenantConfig(createTestTenantConfig('tenant-a', {
      github: { enabled: true, config: {} },
      airbyte: { enabled: false, config: {} },
    }));

    expect(await store.isConnectorEnabled('tenant-a', 'github')).toBe(true);
    expect(await store.isConnectorEnabled('tenant-a', 'airbyte')).toBe(false);
    expect(await store.isConnectorEnabled('tenant-a', 'unknown')).toBe(false);
  });

  it('should list connectors for tenant', async () => {
    store.addTenantConfig(createTestTenantConfig('tenant-a', {
      github: { config: {} },
      airbyte: { config: {} },
    }));

    const connectors = await store.listConnectors('tenant-a');

    expect(connectors).toContain('github');
    expect(connectors).toContain('airbyte');
    expect(connectors).toHaveLength(2);
  });

  it('should add connector config to existing tenant', async () => {
    store.addTenantConfig(createTestTenantConfig('tenant-a', {
      github: { config: {} },
    }));

    store.addConnectorConfig('tenant-a', {
      connectorId: 'airbyte',
      enabled: true,
      config: { apiUrl: 'https://api.airbyte.com' },
    });

    const connectors = await store.listConnectors('tenant-a');
    expect(connectors).toContain('airbyte');
  });

  it('should clear all configs', async () => {
    store.addTenantConfig(createTestTenantConfig('tenant-a', {}));
    store.clear();

    await expect(store.getTenantConfig('tenant-a')).rejects.toThrow();
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Tenancy Integration', () => {
  it('should work end-to-end: context → policy → decision', () => {
    // Create actor and tenant
    const actor = createCliActor('admin-user');
    const tenant = createTenantContext('acme-corp', actor, {
      repo: { owner: 'acme', name: 'app' },
    });

    // Create policy engine with admin bypass
    const engine = new InMemoryPolicyEngine();
    engine.loadPolicy(PolicyDocument.parse({
      version: '1.0',
      name: 'acme-policy',
      rules: [
        {
          id: 'allow-acme-admin-writes',
          effect: 'allow',
          priority: 100,
          conditions: {
            tenants: ['acme-corp'],
            actors: ['admin-user'],
            policyClasses: ['WRITE_NON_DESTRUCTIVE'],
          },
        },
      ],
    }));

    // Create policy request
    const request = createPolicyRequest(
      tenant,
      'github.postComment',
      'github',
      'WRITE_NON_DESTRUCTIVE',
      { resource: 'acme/app' }
    );

    // Evaluate
    const decision = engine.evaluate(request);

    expect(decision.allowed).toBe(true);
    expect(decision.matchedRule).toBe('allow-acme-admin-writes');
  });
});
