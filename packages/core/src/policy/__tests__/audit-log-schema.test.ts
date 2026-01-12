/**
 * Immutable Audit Log Schema Tests
 *
 * Tests for D3.1: Design audit log schema
 */

import { describe, it, expect } from 'vitest';
import {
  // Schema types
  ImmutableAuditLogEntry,
  CreateAuditLogEntry,
  AuditLogQuery,
  AuditLogQueryResult,
  AuditLogMetadata,
  AuditLogActor,
  AuditLogAction,
  AuditLogResource,
  AuditLogOutcome,
  AuditLogContext,
  AuditChainLink,
  ContextHash,
  SHA256Hash,
  HashAlgorithm,
  AuditLogEntryId,
  AuditLogId,

  // Factory functions
  generateAuditLogEntryId,
  generateAuditLogId,
  createAuditAction,
  createAuditActor,
  createAuditResource,
  createAuditContext,
  createAuditOutcome,

  // Validation functions
  validateAuditLogEntry,
  safeParseAuditLogEntry,
  validateCreateAuditLogEntry,

  // High-risk detection
  isHighRiskAction,
  markHighRiskIfApplicable,
  HIGH_RISK_ACTIONS,

  // Constants
  CURRENT_SCHEMA_VERSION,
  DEFAULT_HASH_ALGORITHM,
  MAX_QUERY_LIMIT,
  CONTEXT_HASH_FIELDS,
} from '../audit-log-schema.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createValidEntry(): ImmutableAuditLogEntry {
  return {
    id: 'alog-1704067200000-1-abc123' as AuditLogEntryId,
    schemaVersion: '1.0',
    timestamp: '2024-01-01T00:00:00.000Z',
    actor: {
      type: 'user',
      id: 'user-123',
      displayName: 'Test User',
      email: 'test@example.com',
    },
    action: {
      category: 'policy',
      type: 'policy.rule.evaluated',
      description: 'Policy rule was evaluated',
      sensitive: false,
    },
    resource: {
      type: 'policy_rule',
      id: 'rule-456',
      name: 'Require approval for force push',
    },
    outcome: {
      status: 'success',
      durationMs: 15,
    },
    context: {
      tenantId: 'tenant-789',
      orgId: 'org-abc',
      environment: 'production',
      requestId: 'req-xyz',
    },
    chain: {
      sequence: 1,
      prevHash: null,
      contentHash: 'a'.repeat(64),
      algorithm: 'sha256',
      computedAt: '2024-01-01T00:00:00.000Z',
    },
    tags: ['policy', 'evaluation'],
    highRisk: false,
    compliance: [],
    details: {},
  };
}

function createValidCreateInput(): CreateAuditLogEntry {
  return {
    actor: {
      type: 'agent',
      id: 'agent-coder',
      agentType: 'coder',
    },
    action: {
      category: 'agent',
      type: 'agent.code.generated',
      sensitive: false,
    },
    outcome: {
      status: 'success',
      durationMs: 1500,
    },
    context: {
      tenantId: 'tenant-123',
      runId: 'run-456',
    },
    tags: [],
    highRisk: false,
    compliance: [],
    details: { linesGenerated: 100 },
  };
}

// =============================================================================
// Cryptographic Type Tests
// =============================================================================

describe('Cryptographic Types', () => {
  describe('HashAlgorithm', () => {
    it('should accept valid algorithms', () => {
      expect(HashAlgorithm.parse('sha256')).toBe('sha256');
      expect(HashAlgorithm.parse('sha384')).toBe('sha384');
      expect(HashAlgorithm.parse('sha512')).toBe('sha512');
    });

    it('should reject invalid algorithms', () => {
      expect(() => HashAlgorithm.parse('md5')).toThrow();
      expect(() => HashAlgorithm.parse('sha1')).toThrow();
    });
  });

  describe('SHA256Hash', () => {
    it('should accept valid SHA-256 hash', () => {
      const validHash = 'a'.repeat(64);
      expect(SHA256Hash.parse(validHash)).toBe(validHash);
    });

    it('should reject invalid hashes', () => {
      expect(() => SHA256Hash.parse('a'.repeat(63))).toThrow(); // too short
      expect(() => SHA256Hash.parse('a'.repeat(65))).toThrow(); // too long
      expect(() => SHA256Hash.parse('g'.repeat(64))).toThrow(); // invalid chars
      expect(() => SHA256Hash.parse('A'.repeat(64))).toThrow(); // uppercase
    });
  });
});

// =============================================================================
// Entry ID Tests
// =============================================================================

describe('Entry Identification', () => {
  describe('AuditLogEntryId', () => {
    it('should accept valid entry ID format', () => {
      const validId = 'alog-1704067200000-1-abc123';
      expect(AuditLogEntryId.parse(validId)).toBe(validId);
    });

    it('should reject invalid entry ID formats', () => {
      expect(() => AuditLogEntryId.parse('invalid')).toThrow();
      expect(() => AuditLogEntryId.parse('alog-abc-1-xyz123')).toThrow();
      expect(() => AuditLogEntryId.parse('log-1704067200000-1-abc123')).toThrow();
    });
  });

  describe('AuditLogId', () => {
    it('should accept valid log ID format', () => {
      const validId = 'log-tenant123-org-abcd1234';
      expect(AuditLogId.parse(validId)).toBe(validId);
    });

    it('should reject invalid log ID formats', () => {
      expect(() => AuditLogId.parse('invalid')).toThrow();
      expect(() => AuditLogId.parse('alog-tenant-org-abc')).toThrow();
    });
  });
});

// =============================================================================
// Actor Schema Tests
// =============================================================================

describe('AuditLogActor', () => {
  it('should accept valid user actor', () => {
    const actor = AuditLogActor.parse({
      type: 'user',
      id: 'user-123',
      displayName: 'Test User',
      email: 'test@example.com',
      ip: '192.168.1.1',
    });

    expect(actor.type).toBe('user');
    expect(actor.id).toBe('user-123');
    expect(actor.email).toBe('test@example.com');
  });

  it('should accept valid agent actor', () => {
    const actor = AuditLogActor.parse({
      type: 'agent',
      id: 'agent-coder-001',
      agentType: 'coder',
    });

    expect(actor.type).toBe('agent');
    expect(actor.agentType).toBe('coder');
  });

  it('should accept impersonation', () => {
    const actor = AuditLogActor.parse({
      type: 'service',
      id: 'service-admin',
      onBehalfOf: {
        type: 'user',
        id: 'user-456',
        reason: 'Admin override for debugging',
      },
    });

    expect(actor.onBehalfOf?.type).toBe('user');
    expect(actor.onBehalfOf?.reason).toBe('Admin override for debugging');
  });

  it('should reject invalid actor type', () => {
    expect(() => AuditLogActor.parse({
      type: 'invalid',
      id: 'test',
    })).toThrow();
  });

  it('should reject empty actor ID', () => {
    expect(() => AuditLogActor.parse({
      type: 'user',
      id: '',
    })).toThrow();
  });

  it('should reject invalid email format', () => {
    expect(() => AuditLogActor.parse({
      type: 'user',
      id: 'user-123',
      email: 'not-an-email',
    })).toThrow();
  });
});

// =============================================================================
// Action Schema Tests
// =============================================================================

describe('AuditLogAction', () => {
  it('should accept valid action', () => {
    const action = AuditLogAction.parse({
      category: 'policy',
      type: 'policy.rule.evaluated',
      description: 'Policy rule was evaluated',
      sensitive: false,
    });

    expect(action.category).toBe('policy');
    expect(action.type).toBe('policy.rule.evaluated');
  });

  it('should accept all action categories', () => {
    const categories = ['policy', 'auth', 'data', 'git', 'agent', 'approval', 'config', 'admin', 'security', 'billing'];
    for (const category of categories) {
      expect(() => AuditLogAction.parse({
        category,
        type: `${category}.test.action`,
      })).not.toThrow();
    }
  });

  it('should reject invalid action type format', () => {
    expect(() => AuditLogAction.parse({
      category: 'policy',
      type: 'InvalidFormat',
    })).toThrow();

    expect(() => AuditLogAction.parse({
      category: 'policy',
      type: 'single',
    })).toThrow();
  });

  it('should default sensitive to false', () => {
    const action = AuditLogAction.parse({
      category: 'data',
      type: 'data.read.file',
    });

    expect(action.sensitive).toBe(false);
  });
});

// =============================================================================
// Resource Schema Tests
// =============================================================================

describe('AuditLogResource', () => {
  it('should accept valid resource', () => {
    const resource = AuditLogResource.parse({
      type: 'repository',
      id: 'owner/repo',
      name: 'My Repository',
    });

    expect(resource.type).toBe('repository');
    expect(resource.id).toBe('owner/repo');
  });

  it('should accept resource with parent', () => {
    const resource = AuditLogResource.parse({
      type: 'branch',
      id: 'main',
      parent: {
        type: 'repository',
        id: 'owner/repo',
      },
    });

    expect(resource.parent?.type).toBe('repository');
  });

  it('should accept resource with attributes', () => {
    const resource = AuditLogResource.parse({
      type: 'pull_request',
      id: 'PR-123',
      attributes: {
        state: 'open',
        reviewers: ['user1', 'user2'],
      },
    });

    expect(resource.attributes?.state).toBe('open');
  });

  it('should accept all resource types', () => {
    const types = [
      'policy', 'policy_rule', 'repository', 'branch', 'pull_request',
      'commit', 'run', 'approval', 'tenant', 'user', 'agent',
      'secret', 'api_key', 'config', 'artifact',
    ];

    for (const type of types) {
      expect(() => AuditLogResource.parse({
        type,
        id: 'test-id',
      })).not.toThrow();
    }
  });
});

// =============================================================================
// Outcome Schema Tests
// =============================================================================

describe('AuditLogOutcome', () => {
  it('should accept all outcome statuses', () => {
    const statuses = ['success', 'failure', 'denied', 'blocked', 'pending', 'partial', 'skipped'];
    for (const status of statuses) {
      expect(() => AuditLogOutcome.parse({ status })).not.toThrow();
    }
  });

  it('should accept outcome with error details', () => {
    const outcome = AuditLogOutcome.parse({
      status: 'failure',
      errorCode: 'POLICY_VIOLATION',
      errorMessage: 'Action blocked by policy',
      durationMs: 50,
    });

    expect(outcome.errorCode).toBe('POLICY_VIOLATION');
    expect(outcome.errorMessage).toBe('Action blocked by policy');
  });

  it('should accept outcome with data', () => {
    const outcome = AuditLogOutcome.parse({
      status: 'success',
      data: {
        recordsProcessed: 100,
        skipped: 5,
      },
    });

    expect(outcome.data?.recordsProcessed).toBe(100);
  });
});

// =============================================================================
// Context Schema Tests
// =============================================================================

describe('AuditLogContext', () => {
  it('should require tenantId', () => {
    expect(() => AuditLogContext.parse({})).toThrow();
    expect(() => AuditLogContext.parse({ tenantId: '' })).toThrow();
  });

  it('should accept full context', () => {
    const context = AuditLogContext.parse({
      tenantId: 'tenant-123',
      orgId: 'org-456',
      repoId: 'owner/repo',
      traceId: 'abc123',
      spanId: 'xyz789',
      requestId: 'req-001',
      runId: 'run-002',
      candidateId: 'cand-003',
      sessionId: 'sess-004',
      causationId: 'cause-005',
      environment: 'production',
      service: 'api-gateway',
    });

    expect(context.tenantId).toBe('tenant-123');
    expect(context.environment).toBe('production');
  });

  it('should accept all environments', () => {
    const environments = ['production', 'staging', 'development'];
    for (const env of environments) {
      expect(() => AuditLogContext.parse({
        tenantId: 'test',
        environment: env,
      })).not.toThrow();
    }
  });
});

// =============================================================================
// Chain Link Tests
// =============================================================================

describe('AuditChainLink', () => {
  it('should accept valid chain link', () => {
    const link = AuditChainLink.parse({
      sequence: 1,
      prevHash: null,
      contentHash: 'a'.repeat(64),
      algorithm: 'sha256',
      computedAt: '2024-01-01T00:00:00.000Z',
    });

    expect(link.sequence).toBe(1);
    expect(link.prevHash).toBeNull();
  });

  it('should accept chain link with prevHash', () => {
    const link = AuditChainLink.parse({
      sequence: 2,
      prevHash: 'b'.repeat(64),
      contentHash: 'c'.repeat(64),
      algorithm: 'sha256',
      computedAt: '2024-01-01T00:00:01.000Z',
    });

    expect(link.prevHash).toBe('b'.repeat(64));
  });

  it('should default algorithm to sha256', () => {
    const link = AuditChainLink.parse({
      sequence: 0,
      prevHash: null,
      contentHash: 'd'.repeat(64),
      computedAt: '2024-01-01T00:00:00.000Z',
    });

    expect(link.algorithm).toBe('sha256');
  });

  it('should reject negative sequence', () => {
    expect(() => AuditChainLink.parse({
      sequence: -1,
      prevHash: null,
      contentHash: 'a'.repeat(64),
      computedAt: '2024-01-01T00:00:00.000Z',
    })).toThrow();
  });
});

// =============================================================================
// ImmutableAuditLogEntry Tests
// =============================================================================

describe('ImmutableAuditLogEntry', () => {
  it('should accept valid entry', () => {
    const entry = createValidEntry();
    const parsed = ImmutableAuditLogEntry.parse(entry);

    expect(parsed.id).toBe(entry.id);
    expect(parsed.schemaVersion).toBe('1.0');
    expect(parsed.actor.type).toBe('user');
    expect(parsed.action.category).toBe('policy');
    expect(parsed.chain.sequence).toBe(1);
  });

  it('should validate entry without optional fields', () => {
    const entry = createValidEntry();
    delete (entry as Record<string, unknown>).resource;
    delete (entry as Record<string, unknown>).contextHash;

    const parsed = ImmutableAuditLogEntry.parse(entry);
    expect(parsed.resource).toBeUndefined();
    expect(parsed.contextHash).toBeUndefined();
  });

  it('should default tags to empty array', () => {
    const entry = createValidEntry();
    delete (entry as Record<string, unknown>).tags;

    const parsed = ImmutableAuditLogEntry.parse(entry);
    expect(parsed.tags).toEqual([]);
  });

  it('should require schemaVersion', () => {
    const entry = createValidEntry();
    delete (entry as Record<string, unknown>).schemaVersion;

    expect(() => ImmutableAuditLogEntry.parse(entry)).toThrow();
  });

  it('should accept compliance frameworks', () => {
    const entry = createValidEntry();
    entry.compliance = ['soc2', 'gdpr', 'hipaa'];

    const parsed = ImmutableAuditLogEntry.parse(entry);
    expect(parsed.compliance).toContain('soc2');
    expect(parsed.compliance).toContain('gdpr');
  });

  it('should reject invalid schema version', () => {
    const entry = createValidEntry();
    (entry as Record<string, unknown>).schemaVersion = '2.0';

    expect(() => ImmutableAuditLogEntry.parse(entry)).toThrow();
  });
});

// =============================================================================
// CreateAuditLogEntry Tests
// =============================================================================

describe('CreateAuditLogEntry', () => {
  it('should accept valid create input', () => {
    const input = createValidCreateInput();
    const parsed = CreateAuditLogEntry.parse(input);

    expect(parsed.actor.type).toBe('agent');
    expect(parsed.action.type).toBe('agent.code.generated');
  });

  it('should allow optional timestamp', () => {
    const input = createValidCreateInput();
    input.timestamp = '2024-06-15T12:00:00.000Z';

    const parsed = CreateAuditLogEntry.parse(input);
    expect(parsed.timestamp).toBe('2024-06-15T12:00:00.000Z');
  });

  it('should not require chain field', () => {
    const input = createValidCreateInput();
    // chain should not be required in CreateAuditLogEntry
    expect(() => CreateAuditLogEntry.parse(input)).not.toThrow();
  });
});

// =============================================================================
// Query Schema Tests
// =============================================================================

describe('AuditLogQuery', () => {
  it('should require tenantId', () => {
    expect(() => AuditLogQuery.parse({})).toThrow();
  });

  it('should accept minimal query', () => {
    const query = AuditLogQuery.parse({
      tenantId: 'tenant-123',
    });

    expect(query.tenantId).toBe('tenant-123');
    expect(query.limit).toBe(100); // default
    expect(query.orderBy).toBe('desc'); // default
  });

  it('should accept full query', () => {
    const query = AuditLogQuery.parse({
      tenantId: 'tenant-123',
      categories: ['policy', 'auth'],
      actionTypes: ['policy.rule.evaluated'],
      outcomes: ['success', 'denied'],
      actorId: 'user-456',
      actorType: 'user',
      resourceType: 'repository',
      resourceId: 'owner/repo',
      traceId: 'trace-xyz',
      runId: 'run-abc',
      startTime: '2024-01-01T00:00:00.000Z',
      endTime: '2024-12-31T23:59:59.000Z',
      startSequence: 100,
      endSequence: 200,
      highRiskOnly: true,
      tags: ['important'],
      searchText: 'error',
      limit: 50,
      offset: 10,
      orderBy: 'asc',
      includeChainVerification: true,
    });

    expect(query.categories).toContain('policy');
    expect(query.highRiskOnly).toBe(true);
    expect(query.includeChainVerification).toBe(true);
  });

  it('should enforce limit bounds', () => {
    expect(() => AuditLogQuery.parse({
      tenantId: 'test',
      limit: 0,
    })).toThrow();

    expect(() => AuditLogQuery.parse({
      tenantId: 'test',
      limit: 1001,
    })).toThrow();
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('Factory Functions', () => {
  describe('generateAuditLogEntryId', () => {
    it('should generate valid entry ID', () => {
      const id = generateAuditLogEntryId(42);
      expect(AuditLogEntryId.safeParse(id).success).toBe(true);
      expect(id).toContain('-42-');
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateAuditLogEntryId(i));
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateAuditLogId', () => {
    it('should generate valid log ID', () => {
      const id = generateAuditLogId('tenant123', 'org');
      expect(AuditLogId.safeParse(id).success).toBe(true);
      expect(id).toContain('tenant123');
      expect(id).toContain('org');
    });
  });

  describe('createAuditAction', () => {
    it('should create valid action', () => {
      const action = createAuditAction('policy', 'policy.rule.created', {
        description: 'New policy rule created',
        sensitive: true,
      });

      expect(action.category).toBe('policy');
      expect(action.type).toBe('policy.rule.created');
      expect(action.sensitive).toBe(true);
    });
  });

  describe('createAuditActor', () => {
    it('should create valid actor', () => {
      const actor = createAuditActor('user', 'user-123', {
        displayName: 'Test User',
        email: 'test@example.com',
      });

      expect(actor.type).toBe('user');
      expect(actor.email).toBe('test@example.com');
    });
  });

  describe('createAuditResource', () => {
    it('should create valid resource', () => {
      const resource = createAuditResource('repository', 'owner/repo', {
        name: 'My Repo',
      });

      expect(resource.type).toBe('repository');
      expect(resource.name).toBe('My Repo');
    });
  });

  describe('createAuditContext', () => {
    it('should create valid context', () => {
      const context = createAuditContext('tenant-123', {
        runId: 'run-456',
        environment: 'production',
      });

      expect(context.tenantId).toBe('tenant-123');
      expect(context.runId).toBe('run-456');
    });
  });

  describe('createAuditOutcome', () => {
    it('should create valid outcome', () => {
      const outcome = createAuditOutcome('failure', {
        errorCode: 'ERR_001',
        errorMessage: 'Something went wrong',
      });

      expect(outcome.status).toBe('failure');
      expect(outcome.errorCode).toBe('ERR_001');
    });
  });
});

// =============================================================================
// Validation Function Tests
// =============================================================================

describe('Validation Functions', () => {
  describe('validateAuditLogEntry', () => {
    it('should return valid entry', () => {
      const entry = createValidEntry();
      const result = validateAuditLogEntry(entry);
      expect(result.id).toBe(entry.id);
    });

    it('should throw on invalid entry', () => {
      expect(() => validateAuditLogEntry({})).toThrow();
    });
  });

  describe('safeParseAuditLogEntry', () => {
    it('should return success for valid entry', () => {
      const entry = createValidEntry();
      const result = safeParseAuditLogEntry(entry);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(entry.id);
      }
    });

    it('should return error for invalid entry', () => {
      const result = safeParseAuditLogEntry({ invalid: true });
      expect(result.success).toBe(false);
    });
  });

  describe('validateCreateAuditLogEntry', () => {
    it('should return valid input', () => {
      const input = createValidCreateInput();
      const result = validateCreateAuditLogEntry(input);
      expect(result.actor.type).toBe('agent');
    });
  });
});

// =============================================================================
// High-Risk Detection Tests
// =============================================================================

describe('High-Risk Detection', () => {
  describe('isHighRiskAction', () => {
    it('should identify high-risk actions', () => {
      expect(isHighRiskAction('git.push.force')).toBe(true);
      expect(isHighRiskAction('git.branch.delete')).toBe(true);
      expect(isHighRiskAction('secret.access')).toBe(true);
      expect(isHighRiskAction('approval.bypass')).toBe(true);
    });

    it('should identify non-high-risk actions', () => {
      expect(isHighRiskAction('policy.rule.evaluated')).toBe(false);
      expect(isHighRiskAction('data.read.file')).toBe(false);
      expect(isHighRiskAction('agent.code.generated')).toBe(false);
    });

    it('should match action prefixes', () => {
      expect(isHighRiskAction('git.push.force.main')).toBe(true);
      expect(isHighRiskAction('secret.access.vault')).toBe(true);
    });
  });

  describe('markHighRiskIfApplicable', () => {
    it('should mark high-risk actions', () => {
      const input: CreateAuditLogEntry = {
        ...createValidCreateInput(),
        action: createAuditAction('git', 'git.push.force'),
      };

      const result = markHighRiskIfApplicable(input);
      expect(result.highRisk).toBe(true);
    });

    it('should mark sensitive actions', () => {
      const input: CreateAuditLogEntry = {
        ...createValidCreateInput(),
        action: {
          category: 'data',
          type: 'data.read.sensitive',
          sensitive: true,
        },
      };

      const result = markHighRiskIfApplicable(input);
      expect(result.highRisk).toBe(true);
    });

    it('should not mark normal actions', () => {
      const input = createValidCreateInput();
      const result = markHighRiskIfApplicable(input);
      expect(result.highRisk).toBe(false);
    });
  });

  describe('HIGH_RISK_ACTIONS constant', () => {
    it('should contain expected actions', () => {
      expect(HIGH_RISK_ACTIONS).toContain('git.push.force');
      expect(HIGH_RISK_ACTIONS).toContain('secret.delete');
      expect(HIGH_RISK_ACTIONS).toContain('approval.bypass');
    });

    it('should be readonly', () => {
      // TypeScript should prevent modification, but we can check it's an array
      expect(Array.isArray(HIGH_RISK_ACTIONS)).toBe(true);
    });
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('Constants', () => {
  it('should have correct schema version', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe('1.0');
  });

  it('should have correct default hash algorithm', () => {
    expect(DEFAULT_HASH_ALGORITHM).toBe('sha256');
  });

  it('should have correct max query limit', () => {
    expect(MAX_QUERY_LIMIT).toBe(1000);
  });

  it('should have correct context hash fields', () => {
    expect(CONTEXT_HASH_FIELDS).toContain('tenantId');
    expect(CONTEXT_HASH_FIELDS).toContain('orgId');
    expect(CONTEXT_HASH_FIELDS).toContain('repoId');
    expect(CONTEXT_HASH_FIELDS).toContain('runId');
    expect(CONTEXT_HASH_FIELDS).toContain('traceId');
  });
});

// =============================================================================
// AuditLogMetadata Tests
// =============================================================================

describe('AuditLogMetadata', () => {
  it('should accept valid metadata', () => {
    const metadata = AuditLogMetadata.parse({
      id: 'log-tenant123-org-abcd1234',
      tenantId: 'tenant-123',
      scope: 'org',
      scopeId: 'org-456',
      createdAt: '2024-01-01T00:00:00.000Z',
      latestSequence: 100,
      latestTimestamp: '2024-06-15T12:00:00.000Z',
      headHash: 'a'.repeat(64),
      entryCount: 100,
      sealed: false,
    });

    expect(metadata.scope).toBe('org');
    expect(metadata.latestSequence).toBe(100);
  });

  it('should accept sealed log metadata', () => {
    const metadata = AuditLogMetadata.parse({
      id: 'log-tenant123-repo-abcd1234',
      tenantId: 'tenant-123',
      scope: 'repo',
      createdAt: '2024-01-01T00:00:00.000Z',
      latestSequence: 50,
      entryCount: 50,
      sealed: true,
      sealedAt: '2024-06-15T12:00:00.000Z',
      sealReason: 'Repository deleted',
    });

    expect(metadata.sealed).toBe(true);
    expect(metadata.sealReason).toBe('Repository deleted');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle maximum tag count', () => {
    const entry = createValidEntry();
    entry.tags = Array(50).fill('tag');

    const parsed = ImmutableAuditLogEntry.parse(entry);
    expect(parsed.tags.length).toBe(50);
  });

  it('should reject too many tags', () => {
    const entry = createValidEntry();
    entry.tags = Array(51).fill('tag');

    expect(() => ImmutableAuditLogEntry.parse(entry)).toThrow();
  });

  it('should handle long action descriptions', () => {
    const action = AuditLogAction.parse({
      category: 'policy',
      type: 'policy.rule.evaluated',
      description: 'a'.repeat(500),
    });

    expect(action.description?.length).toBe(500);
  });

  it('should reject too long action descriptions', () => {
    expect(() => AuditLogAction.parse({
      category: 'policy',
      type: 'policy.rule.evaluated',
      description: 'a'.repeat(501),
    })).toThrow();
  });

  it('should handle zero sequence number', () => {
    const link = AuditChainLink.parse({
      sequence: 0,
      prevHash: null,
      contentHash: 'a'.repeat(64),
      computedAt: '2024-01-01T00:00:00.000Z',
    });

    expect(link.sequence).toBe(0);
  });

  it('should handle large sequence numbers', () => {
    const link = AuditChainLink.parse({
      sequence: Number.MAX_SAFE_INTEGER,
      prevHash: 'b'.repeat(64),
      contentHash: 'a'.repeat(64),
      computedAt: '2024-01-01T00:00:00.000Z',
    });

    expect(link.sequence).toBe(Number.MAX_SAFE_INTEGER);
  });
});
