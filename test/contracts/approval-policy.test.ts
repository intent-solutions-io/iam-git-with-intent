/**
 * Contract Tests - Phase 25 Approval & Policy
 *
 * Tests for approval commands, signed approvals, and policy-as-code enforcement.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Import from built core package
import {
  // Parser
  parseApprovalCommand,
  extractCommandsFromComment,
  hasApprovalCommand,
  validateApprovalCommand,
  formatApprovalCommand,

  // Signature
  generateSigningKeyPair,
  createSignedApproval,
  verifyApprovalSignature,
  computeIntentHash,
  computeApprovalPatchHash,
  InMemoryKeyStore,
  verifyApprovalWithKeyStore,

  // Policy
  evaluatePolicy,
  createPolicy,
  getPhase25PolicyEngine,
  resetPhase25PolicyEngine,
  registerDefaultPolicies,
  createEnvironmentContext,

  // Gate
  checkGate,
  initializePolicyGate,

  // Types
  type SignedApproval,
  type CreateSignedApproval,
  type SigningKeyPair,
} from '../../packages/core/dist/index.js';

// =============================================================================
// Approval Parser Tests
// =============================================================================

describe('Approval Parser (Phase 25)', () => {
  describe('parseApprovalCommand', () => {
    it('parses approve command with target', () => {
      const result = parseApprovalCommand('/gwi approve run-abc123', 'cli');

      expect(result.success).toBe(true);
      expect(result.command?.action).toBe('approve');
      expect(result.command?.targetType).toBe('run');
      // Parser returns the full target string for run- prefix
      expect(result.command?.targetId).toBe('run-abc123');
    });

    it('parses approve command with scopes', () => {
      // Use a UUID for candidate target
      const result = parseApprovalCommand(
        '/gwi approve cand-abc123 --scopes commit,push',
        'pr_comment'
      );

      expect(result.success).toBe(true);
      expect(result.command?.action).toBe('approve');
      expect(result.command?.scopes).toContain('commit');
      expect(result.command?.scopes).toContain('push');
    });

    it('parses deny command with reason', () => {
      const result = parseApprovalCommand(
        '/gwi deny run-123 --reason "needs more review"',
        'cli'
      );

      expect(result.success).toBe(true);
      expect(result.command?.action).toBe('deny');
      expect(result.command?.reason).toBe('needs more review');
    });

    it('fails deny without reason', () => {
      const result = parseApprovalCommand('/gwi deny run-123', 'cli');

      expect(result.success).toBe(false);
      expect(result.error).toContain('reason');
    });

    it('parses revoke command', () => {
      const result = parseApprovalCommand('/gwi revoke pr-456', 'cli');

      expect(result.success).toBe(true);
      expect(result.command?.action).toBe('revoke');
      expect(result.command?.targetType).toBe('pr');
      expect(result.command?.targetId).toBe('456');
    });

    it('returns error for invalid command', () => {
      const result = parseApprovalCommand('/gwi invalid foo', 'cli');

      expect(result.success).toBe(false);
    });

    it('returns error for non-command text', () => {
      const result = parseApprovalCommand('just some text', 'cli');

      expect(result.success).toBe(false);
    });
  });

  describe('extractCommandsFromComment', () => {
    it('extracts multiple commands from comment', () => {
      const comment = `
        Thanks for the PR!
        /gwi approve run-123 --scopes commit
        /gwi approve run-456 --scopes push
      `;

      const commands = extractCommandsFromComment(comment, 'pr_comment');

      expect(commands.length).toBe(2);
      // Parser returns full target string
      expect(commands[0].targetId).toBe('run-123');
      expect(commands[1].targetId).toBe('run-456');
    });

    it('returns empty array for no commands', () => {
      const comment = 'Just a regular comment with no commands';

      const commands = extractCommandsFromComment(comment, 'pr_comment');

      expect(commands.length).toBe(0);
    });
  });

  describe('hasApprovalCommand', () => {
    it('detects approval command', () => {
      expect(hasApprovalCommand('/gwi approve foo')).toBe(true);
      expect(hasApprovalCommand('/gwi deny bar --reason test')).toBe(true);
      expect(hasApprovalCommand('/gwi revoke baz')).toBe(true);
    });

    it('returns false for non-commands', () => {
      expect(hasApprovalCommand('regular text')).toBe(false);
      expect(hasApprovalCommand('/gwi status')).toBe(false);
    });
  });

  describe('validateApprovalCommand', () => {
    it('validates approve command requires scopes', () => {
      const result = validateApprovalCommand({
        action: 'approve',
        targetType: 'run',
        targetId: '123',
        scopes: [],
        source: 'cli',
        rawCommand: '/gwi approve run-123',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one scope is required for approve');
    });

    it('validates deny command requires reason', () => {
      const result = validateApprovalCommand({
        action: 'deny',
        targetType: 'run',
        targetId: '123',
        scopes: [],
        source: 'cli',
        rawCommand: '/gwi deny run-123',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Reason is required for deny');
    });
  });

  describe('formatApprovalCommand', () => {
    it('formats command correctly', () => {
      const formatted = formatApprovalCommand({
        action: 'approve',
        targetType: 'run',
        targetId: '123',
        scopes: ['commit', 'push'],
        source: 'cli',
        rawCommand: '',
      });

      expect(formatted).toContain('/gwi approve');
      expect(formatted).toContain('run-123');
      expect(formatted).toContain('commit,push');
    });
  });
});

// =============================================================================
// Signature Tests
// =============================================================================

describe('Approval Signatures (Phase 25)', () => {
  let keyPair: SigningKeyPair;

  beforeEach(() => {
    keyPair = generateSigningKeyPair();
  });

  describe('generateSigningKeyPair', () => {
    it('generates valid Ed25519 key pair', () => {
      expect(keyPair.keyId).toMatch(/^key-[a-f0-9]+$/);
      expect(keyPair.algorithm).toBe('ed25519');
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
    });

    it('generates unique key pairs', () => {
      const keyPair2 = generateSigningKeyPair();

      expect(keyPair.keyId).not.toBe(keyPair2.keyId);
      expect(keyPair.publicKey).not.toBe(keyPair2.publicKey);
    });
  });

  describe('createSignedApproval', () => {
    it('creates signed approval with valid signature', () => {
      const input: CreateSignedApproval = {
        tenantId: 'test-tenant',
        approver: {
          type: 'user',
          id: 'user-123',
          email: 'test@example.com',
        },
        approverRole: 'DEVELOPER',
        decision: 'approved',
        scopesApproved: ['commit', 'push'],
        targetType: 'run',
        target: { runId: 'run-123' },
        intentHash: 'abc123',
        source: 'cli',
      };

      const approval = createSignedApproval(input, keyPair);

      expect(approval.approvalId).toBeDefined();
      expect(approval.signature).toBeDefined();
      expect(approval.signingKeyId).toBe(keyPair.keyId);
      expect(approval.decision).toBe('approved');
    });
  });

  describe('verifyApprovalSignature', () => {
    it('verifies valid signature', () => {
      const input: CreateSignedApproval = {
        tenantId: 'test-tenant',
        approver: { type: 'user', id: 'user-123' },
        approverRole: 'DEVELOPER',
        decision: 'approved',
        scopesApproved: ['commit'],
        targetType: 'run',
        target: { runId: 'run-123' },
        intentHash: 'abc123',
        source: 'cli',
      };

      const approval = createSignedApproval(input, keyPair);
      const result = verifyApprovalSignature(approval, keyPair.publicKey);

      expect(result.valid).toBe(true);
    });

    it('rejects tampered approval', () => {
      const input: CreateSignedApproval = {
        tenantId: 'test-tenant',
        approver: { type: 'user', id: 'user-123' },
        approverRole: 'DEVELOPER',
        decision: 'approved',
        scopesApproved: ['commit'],
        targetType: 'run',
        target: { runId: 'run-123' },
        intentHash: 'abc123',
        source: 'cli',
      };

      const approval = createSignedApproval(input, keyPair);

      // Tamper with approval
      const tampered: SignedApproval = {
        ...approval,
        scopesApproved: ['commit', 'push', 'deploy'], // Modified
      };

      const result = verifyApprovalSignature(tampered, keyPair.publicKey);

      expect(result.valid).toBe(false);
    });

    it('rejects wrong public key', () => {
      const input: CreateSignedApproval = {
        tenantId: 'test-tenant',
        approver: { type: 'user', id: 'user-123' },
        approverRole: 'DEVELOPER',
        decision: 'approved',
        scopesApproved: ['commit'],
        targetType: 'run',
        target: { runId: 'run-123' },
        intentHash: 'abc123',
        source: 'cli',
      };

      const approval = createSignedApproval(input, keyPair);

      // Use different key pair
      const otherKeyPair = generateSigningKeyPair();
      const result = verifyApprovalSignature(approval, otherKeyPair.publicKey);

      expect(result.valid).toBe(false);
    });
  });

  describe('computeIntentHash', () => {
    it('computes deterministic hash', () => {
      const content = 'Some plan content';

      const hash1 = computeIntentHash(content);
      const hash2 = computeIntentHash(content);

      expect(hash1).toBe(hash2);
    });

    it('different content produces different hash', () => {
      const hash1 = computeIntentHash('Plan A');
      const hash2 = computeIntentHash('Plan B');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('computeApprovalPatchHash', () => {
    it('computes deterministic hash', () => {
      const patch = 'diff --git a/file.ts b/file.ts\n...';

      const hash1 = computeApprovalPatchHash(patch);
      const hash2 = computeApprovalPatchHash(patch);

      expect(hash1).toBe(hash2);
    });
  });

  describe('InMemoryKeyStore', () => {
    it('stores and retrieves keys', async () => {
      const store = new InMemoryKeyStore();

      await store.registerPublicKey({
        keyId: keyPair.keyId,
        publicKey: keyPair.publicKey,
        algorithm: 'ed25519',
        owner: 'test-service',
        registeredAt: new Date().toISOString(),
        revoked: false,
      });

      const retrieved = await store.getPublicKey(keyPair.keyId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.publicKey).toBe(keyPair.publicKey);
    });

    it('revokes keys', async () => {
      const store = new InMemoryKeyStore();

      await store.registerPublicKey({
        keyId: keyPair.keyId,
        publicKey: keyPair.publicKey,
        algorithm: 'ed25519',
        owner: 'test-service',
        registeredAt: new Date().toISOString(),
        revoked: false,
      });

      await store.revokeKey(keyPair.keyId);

      const retrieved = await store.getPublicKey(keyPair.keyId);
      expect(retrieved?.revoked).toBe(true);
    });
  });

  describe('verifyApprovalWithKeyStore', () => {
    it('verifies approval with key lookup', async () => {
      const store = new InMemoryKeyStore();

      await store.registerPublicKey({
        keyId: keyPair.keyId,
        publicKey: keyPair.publicKey,
        algorithm: 'ed25519',
        owner: 'test-service',
        registeredAt: new Date().toISOString(),
        revoked: false,
      });

      const input: CreateSignedApproval = {
        tenantId: 'test-tenant',
        approver: { type: 'user', id: 'user-123' },
        approverRole: 'DEVELOPER',
        decision: 'approved',
        scopesApproved: ['commit'],
        targetType: 'run',
        target: { runId: 'run-123' },
        intentHash: 'abc123',
        source: 'cli',
      };

      const approval = createSignedApproval(input, keyPair);
      const result = await verifyApprovalWithKeyStore(approval, store);

      expect(result.valid).toBe(true);
    });

    it('rejects revoked key', async () => {
      const store = new InMemoryKeyStore();

      await store.registerPublicKey({
        keyId: keyPair.keyId,
        publicKey: keyPair.publicKey,
        algorithm: 'ed25519',
        owner: 'test-service',
        registeredAt: new Date().toISOString(),
        revoked: true, // Revoked
      });

      const input: CreateSignedApproval = {
        tenantId: 'test-tenant',
        approver: { type: 'user', id: 'user-123' },
        approverRole: 'DEVELOPER',
        decision: 'approved',
        scopesApproved: ['commit'],
        targetType: 'run',
        target: { runId: 'run-123' },
        intentHash: 'abc123',
        source: 'cli',
      };

      const approval = createSignedApproval(input, keyPair);
      const result = await verifyApprovalWithKeyStore(approval, store);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('revoked');
    });
  });
});

// =============================================================================
// Policy Engine Tests
// =============================================================================

describe('Policy Engine (Phase 25)', () => {
  beforeEach(() => {
    // Reset policy engine between tests
    resetPhase25PolicyEngine();
  });

  describe('createPolicy', () => {
    it('creates a policy with builder', () => {
      const policy = createPolicy()
        .id('test-policy')
        .name('Test Policy')
        .description('A test policy')
        .denyMessage(() => 'Policy denied') // denyMessage is a function
        .priority('normal')
        .evaluate((_ctx) => 'ALLOW' as const) // evaluate returns decision
        .build();

      expect(policy.id).toBe('test-policy');
      expect(policy.name).toBe('Test Policy');
      expect(policy.priority).toBe('normal');
    });
  });

  describe('evaluatePolicy', () => {
    it('allows when no policies registered', () => {
      const context = {
        tenantId: 'test-tenant',
        action: 'candidate.execute' as const,
        actor: { id: 'user-123', type: 'user' as const, role: 'DEVELOPER' as const },
        resource: { type: 'candidate' as const, id: 'cand-123' },
        environment: createEnvironmentContext(),
        approvals: [],
        requiredScopes: ['commit' as const],
      };

      const result = evaluatePolicy(context);

      // With no policies, should allow by default
      expect(result.decision).toBe('ALLOW');
    });

    it('respects policy decisions', () => {
      // Reset engine to get a clean slate
      resetPhase25PolicyEngine();

      const engine = getPhase25PolicyEngine();

      // Register a deny policy with critical priority (highest)
      const denyPolicy = createPolicy()
        .id('deny-all')
        .name('Deny All')
        .description('Always denies all requests')
        .denyMessage(() => 'Always deny') // denyMessage is a function
        .priority('critical')
        .evaluate(() => 'DENY' as const) // evaluate returns decision directly
        .build();

      engine.registerPolicy(denyPolicy);

      const context = {
        tenantId: 'test-tenant',
        action: 'candidate.execute' as const,
        actor: { id: 'user-123', type: 'user' as const, role: 'DEVELOPER' as const },
        resource: { type: 'candidate' as const, id: 'cand-123' },
        environment: createEnvironmentContext(),
        approvals: [],
        requiredScopes: ['commit' as const],
      };

      const result = evaluatePolicy(context);

      expect(result.decision).toBe('DENY');
      expect(result.reasons.length).toBeGreaterThan(0);
    });
  });

  describe('registerDefaultPolicies', () => {
    it('registers all default policies', () => {
      const engine = getPhase25PolicyEngine();
      registerDefaultPolicies(engine);

      // Check that policies were registered
      const policies = engine.getPolicies();
      expect(policies.length).toBeGreaterThan(0);

      // Check for specific policies (using actual policy IDs from policies.ts)
      const policyIds = policies.map((p) => p.id);
      expect(policyIds).toContain('require-approval');
      expect(policyIds).toContain('destructive-requires-owner');
      expect(policyIds).toContain('protected-branch-two-approvals');
    });
  });

  describe('createEnvironmentContext', () => {
    it('creates environment with current time', () => {
      const env = createEnvironmentContext();

      expect(env.timestamp).toBeInstanceOf(Date);
      expect(typeof env.dayOfWeek).toBe('number');
      expect(typeof env.hour).toBe('number');
      expect(typeof env.isBusinessHours).toBe('boolean');
    });
  });
});

// =============================================================================
// Execution Gate Tests
// =============================================================================

describe('Execution Gate (Phase 25)', () => {
  // The gate automatically initializes with default policies on first call
  // checkGate calls initializePolicyGate internally

  describe('checkGate', () => {
    it('returns allowed for valid approval', async () => {
      // checkGate will initialize policies automatically
      const keyPair = generateSigningKeyPair();

      const approval = createSignedApproval(
        {
          tenantId: 'test-tenant',
          approver: { type: 'user', id: 'user-456' }, // Different user from actor
          approverRole: 'ADMIN',
          decision: 'approved',
          scopesApproved: ['commit', 'push'],
          targetType: 'run',
          target: { runId: 'run-123' },
          intentHash: 'abc123',
          source: 'cli',
        },
        keyPair
      );

      const result = await checkGate({
        tenantId: 'test-tenant',
        action: 'candidate.execute',
        actor: { id: 'user-123', type: 'user', role: 'DEVELOPER' },
        resource: { type: 'run', id: 'run-123' },
        approvals: [approval],
        requiredScopes: ['commit'],
      });

      // With a valid approval from a different user, should be allowed
      expect(result.allowed).toBe(true);
    });

    it('returns denied without approval when policies require it', async () => {
      // checkGate will initialize policies automatically

      const result = await checkGate({
        tenantId: 'test-tenant',
        action: 'candidate.execute',
        actor: { id: 'user-123', type: 'user', role: 'DEVELOPER' },
        resource: { type: 'run', id: 'run-123' },
        approvals: [], // No approvals
        requiredScopes: ['commit'],
      });

      // Without approval, require-approval policy should deny
      expect(result.allowed).toBe(false);
      expect(result.policyResult.decision).toBe('REQUIRE_MORE_APPROVALS');
    });
  });
});
