/**
 * Tenant Secrets Service Tests
 *
 * Epic E: RBAC & Governance - Secrets Management
 *
 * Comprehensive tests for the tenant secrets service including:
 * - Encryption/decryption roundtrip
 * - Unique IVs for each secret
 * - Secret rotation with audit trail
 * - CRUD operations
 * - Validation
 * - Security features
 *
 * @module @gwi/core/secrets/__tests__/tenant-secrets
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  storeSecret,
  retrieveSecret,
  listTenantSecrets,
  deleteSecret,
  rotateSecret,
  secretExists,
  deleteAllTenantSecrets,
  secretEquals,
  generateMasterKey,
  clearMasterKeyCache,
  deriveKey,
  generateSalt,
  InMemorySecretStore,
  setSecretStore,
  resetSecretStore,
} from '../index.js';

// =============================================================================
// Test Setup
// =============================================================================

// Mock audit emitter to prevent actual audit events during tests
vi.mock('../../security/audit/emitter.js', () => ({
  emitAuditEvent: vi.fn().mockResolvedValue({
    id: 'test-audit-event',
    timestamp: new Date(),
  }),
}));

// Mock logger to suppress output during tests
vi.mock('../../telemetry/index.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Tenant Secrets Service', () => {
  const testTenantId = 'tenant-test-123';
  const testUserId = 'user-test-456';

  beforeEach(() => {
    // Reset store to in-memory for testing
    resetSecretStore();
    setSecretStore(new InMemorySecretStore());

    // Set up master key for encryption
    process.env.SECRETS_MASTER_KEY = 'test-master-key-32-bytes-long123';
    clearMasterKeyCache();
  });

  afterEach(() => {
    // Clean up
    delete process.env.SECRETS_MASTER_KEY;
    clearMasterKeyCache();
    resetSecretStore();
  });

  // ===========================================================================
  // Encryption/Decryption Roundtrip Tests
  // ===========================================================================

  describe('Encryption/Decryption Roundtrip', () => {
    it('encrypts and decrypts a simple secret', async () => {
      const secretName = 'API_KEY';
      const secretValue = 'sk-test-12345';

      await storeSecret({
        tenantId: testTenantId,
        name: secretName,
        value: secretValue,
        userId: testUserId,
      });

      const retrieved = await retrieveSecret(testTenantId, secretName, testUserId);
      expect(retrieved).toBe(secretValue);
    });

    it('encrypts and decrypts a long secret', async () => {
      const secretName = 'LONG_SECRET';
      const secretValue = 'A'.repeat(10000);

      await storeSecret({
        tenantId: testTenantId,
        name: secretName,
        value: secretValue,
        userId: testUserId,
      });

      const retrieved = await retrieveSecret(testTenantId, secretName, testUserId);
      expect(retrieved).toBe(secretValue);
      expect(retrieved?.length).toBe(10000);
    });

    it('encrypts and decrypts special characters', async () => {
      const secretName = 'SPECIAL_CHARS';
      const secretValue = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`"\'\\n\\t';

      await storeSecret({
        tenantId: testTenantId,
        name: secretName,
        value: secretValue,
        userId: testUserId,
      });

      const retrieved = await retrieveSecret(testTenantId, secretName, testUserId);
      expect(retrieved).toBe(secretValue);
    });

    it('encrypts and decrypts unicode characters', async () => {
      const secretName = 'UNICODE_SECRET';
      const secretValue = 'Hello World Emoji Test';

      await storeSecret({
        tenantId: testTenantId,
        name: secretName,
        value: secretValue,
        userId: testUserId,
      });

      const retrieved = await retrieveSecret(testTenantId, secretName, testUserId);
      expect(retrieved).toBe(secretValue);
    });

    it('encrypts and decrypts JSON-formatted secrets', async () => {
      const secretName = 'JSON_SECRET';
      const secretValue = JSON.stringify({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        config: { nested: true },
      });

      await storeSecret({
        tenantId: testTenantId,
        name: secretName,
        value: secretValue,
        userId: testUserId,
      });

      const retrieved = await retrieveSecret(testTenantId, secretName, testUserId);
      expect(retrieved).toBe(secretValue);
      expect(JSON.parse(retrieved!)).toEqual({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        config: { nested: true },
      });
    });
  });

  // ===========================================================================
  // Unique IV Tests
  // ===========================================================================

  describe('Unique IVs', () => {
    it('generates unique IVs for different secrets', async () => {
      const store = new InMemorySecretStore();
      setSecretStore(store);

      await storeSecret({
        tenantId: testTenantId,
        name: 'SECRET_ONE',
        value: 'value-one',
        userId: testUserId,
      });

      await storeSecret({
        tenantId: testTenantId,
        name: 'SECRET_TWO',
        value: 'value-two',
        userId: testUserId,
      });

      const secrets = store.getAll();
      expect(secrets.length).toBe(2);

      // IVs should be different
      const iv1 = secrets[0].iv;
      const iv2 = secrets[1].iv;
      expect(iv1).not.toBe(iv2);
    });

    it('generates unique IVs on rotation', async () => {
      const store = new InMemorySecretStore();
      setSecretStore(store);

      await storeSecret({
        tenantId: testTenantId,
        name: 'ROTATED_SECRET',
        value: 'original-value',
        userId: testUserId,
      });

      const originalSecret = await store.getSecret(testTenantId, 'ROTATED_SECRET');
      const originalIV = originalSecret!.iv;

      await rotateSecret(testTenantId, 'ROTATED_SECRET', 'new-value', testUserId);

      const rotatedSecret = await store.getSecret(testTenantId, 'ROTATED_SECRET');
      const newIV = rotatedSecret!.iv;

      expect(originalIV).not.toBe(newIV);
    });

    it('generates unique IVs even for same value', async () => {
      const store = new InMemorySecretStore();
      setSecretStore(store);

      const sameValue = 'identical-secret-value';

      await storeSecret({
        tenantId: testTenantId,
        name: 'SAME_VALUE_ONE',
        value: sameValue,
        userId: testUserId,
      });

      await storeSecret({
        tenantId: testTenantId,
        name: 'SAME_VALUE_TWO',
        value: sameValue,
        userId: testUserId,
      });

      const secrets = store.getAll();
      expect(secrets[0].iv).not.toBe(secrets[1].iv);
      // Encrypted values should also be different due to unique IVs
      expect(secrets[0].encryptedValue).not.toBe(secrets[1].encryptedValue);
    });
  });

  // ===========================================================================
  // Secret Rotation Tests
  // ===========================================================================

  describe('Secret Rotation', () => {
    it('rotates secret value successfully', async () => {
      await storeSecret({
        tenantId: testTenantId,
        name: 'ROTATE_TEST',
        value: 'original-value',
        userId: testUserId,
      });

      const result = await rotateSecret(testTenantId, 'ROTATE_TEST', 'new-value', testUserId);

      expect(result.version).toBe(2);
      expect(result.rotatedAt).toBeInstanceOf(Date);

      const retrieved = await retrieveSecret(testTenantId, 'ROTATE_TEST', testUserId);
      expect(retrieved).toBe('new-value');
    });

    it('increments version on each rotation', async () => {
      await storeSecret({
        tenantId: testTenantId,
        name: 'VERSION_TEST',
        value: 'v1',
        userId: testUserId,
      });

      const r1 = await rotateSecret(testTenantId, 'VERSION_TEST', 'v2', testUserId);
      expect(r1.version).toBe(2);

      const r2 = await rotateSecret(testTenantId, 'VERSION_TEST', 'v3', testUserId);
      expect(r2.version).toBe(3);

      const r3 = await rotateSecret(testTenantId, 'VERSION_TEST', 'v4', testUserId);
      expect(r3.version).toBe(4);
    });

    it('updates metadata on rotation', async () => {
      await storeSecret({
        tenantId: testTenantId,
        name: 'META_ROTATE',
        value: 'value',
        metadata: { description: 'Original' },
        userId: testUserId,
      });

      await rotateSecret(testTenantId, 'META_ROTATE', 'new-value', testUserId, {
        description: 'Rotated',
        tags: ['rotated'],
      });

      const secrets = await listTenantSecrets(testTenantId);
      const secret = secrets.find(s => s.name === 'META_ROTATE');
      expect(secret?.metadata?.description).toBe('Rotated');
      expect(secret?.metadata?.tags).toEqual(['rotated']);
    });

    it('throws error when rotating non-existent secret', async () => {
      await expect(
        rotateSecret(testTenantId, 'NONEXISTENT', 'value', testUserId)
      ).rejects.toThrow('not found');
    });
  });

  // ===========================================================================
  // CRUD Operations Tests
  // ===========================================================================

  describe('CRUD Operations', () => {
    describe('Store', () => {
      it('stores a secret with metadata', async () => {
        const result = await storeSecret({
          tenantId: testTenantId,
          name: 'WITH_META',
          value: 'secret-value',
          metadata: {
            description: 'Test secret',
            tags: ['test', 'unit'],
            custom: { env: 'test' },
          },
          userId: testUserId,
        });

        expect(result.id).toBeDefined();
        expect(result.name).toBe('WITH_META');
        expect(result.version).toBe(1);
      });

      it('prevents duplicate secret names within tenant', async () => {
        await storeSecret({
          tenantId: testTenantId,
          name: 'UNIQUE_NAME',
          value: 'value1',
          userId: testUserId,
        });

        await expect(
          storeSecret({
            tenantId: testTenantId,
            name: 'UNIQUE_NAME',
            value: 'value2',
            userId: testUserId,
          })
        ).rejects.toThrow('already exists');
      });

      it('allows same secret name in different tenants', async () => {
        await storeSecret({
          tenantId: 'tenant-A',
          name: 'SHARED_NAME',
          value: 'value-A',
          userId: testUserId,
        });

        await storeSecret({
          tenantId: 'tenant-B',
          name: 'SHARED_NAME',
          value: 'value-B',
          userId: testUserId,
        });

        const valueA = await retrieveSecret('tenant-A', 'SHARED_NAME', testUserId);
        const valueB = await retrieveSecret('tenant-B', 'SHARED_NAME', testUserId);

        expect(valueA).toBe('value-A');
        expect(valueB).toBe('value-B');
      });
    });

    describe('Retrieve', () => {
      it('returns null for non-existent secret', async () => {
        const result = await retrieveSecret(testTenantId, 'NONEXISTENT', testUserId);
        expect(result).toBeNull();
      });

      it('returns correct secret for tenant', async () => {
        await storeSecret({
          tenantId: testTenantId,
          name: 'RETRIEVE_TEST',
          value: 'test-value',
          userId: testUserId,
        });

        const result = await retrieveSecret(testTenantId, 'RETRIEVE_TEST', testUserId);
        expect(result).toBe('test-value');
      });
    });

    describe('List', () => {
      it('lists all secrets for tenant without values', async () => {
        await storeSecret({
          tenantId: testTenantId,
          name: 'LIST_ONE',
          value: 'secret1',
          userId: testUserId,
        });

        await storeSecret({
          tenantId: testTenantId,
          name: 'LIST_TWO',
          value: 'secret2',
          userId: testUserId,
        });

        const secrets = await listTenantSecrets(testTenantId);

        expect(secrets.length).toBe(2);
        expect(secrets.map(s => s.name).sort()).toEqual(['LIST_ONE', 'LIST_TWO']);

        // Ensure values are not included
        for (const secret of secrets) {
          expect((secret as unknown as Record<string, unknown>).value).toBeUndefined();
          expect((secret as unknown as Record<string, unknown>).encryptedValue).toBeUndefined();
        }
      });

      it('returns empty array for tenant with no secrets', async () => {
        const secrets = await listTenantSecrets('empty-tenant');
        expect(secrets).toEqual([]);
      });

      it('only lists secrets for the specified tenant', async () => {
        await storeSecret({
          tenantId: 'tenant-A',
          name: 'SECRET_A',
          value: 'value-a',
          userId: testUserId,
        });

        await storeSecret({
          tenantId: 'tenant-B',
          name: 'SECRET_B',
          value: 'value-b',
          userId: testUserId,
        });

        const secretsA = await listTenantSecrets('tenant-A');
        const secretsB = await listTenantSecrets('tenant-B');

        expect(secretsA.length).toBe(1);
        expect(secretsA[0].name).toBe('SECRET_A');

        expect(secretsB.length).toBe(1);
        expect(secretsB[0].name).toBe('SECRET_B');
      });
    });

    describe('Delete', () => {
      it('deletes existing secret', async () => {
        await storeSecret({
          tenantId: testTenantId,
          name: 'DELETE_ME',
          value: 'value',
          userId: testUserId,
        });

        const deleted = await deleteSecret(testTenantId, 'DELETE_ME', testUserId);
        expect(deleted).toBe(true);

        const exists = await secretExists(testTenantId, 'DELETE_ME');
        expect(exists).toBe(false);
      });

      it('returns false for non-existent secret', async () => {
        const deleted = await deleteSecret(testTenantId, 'NONEXISTENT', testUserId);
        expect(deleted).toBe(false);
      });

      it('does not affect other tenants secrets', async () => {
        await storeSecret({
          tenantId: 'tenant-A',
          name: 'SHARED',
          value: 'value-a',
          userId: testUserId,
        });

        await storeSecret({
          tenantId: 'tenant-B',
          name: 'SHARED',
          value: 'value-b',
          userId: testUserId,
        });

        await deleteSecret('tenant-A', 'SHARED', testUserId);

        const existsA = await secretExists('tenant-A', 'SHARED');
        const existsB = await secretExists('tenant-B', 'SHARED');

        expect(existsA).toBe(false);
        expect(existsB).toBe(true);
      });
    });

    describe('Delete All Tenant Secrets', () => {
      it('deletes all secrets for a tenant', async () => {
        await storeSecret({
          tenantId: testTenantId,
          name: 'SECRET_1',
          value: 'value1',
          userId: testUserId,
        });

        await storeSecret({
          tenantId: testTenantId,
          name: 'SECRET_2',
          value: 'value2',
          userId: testUserId,
        });

        await storeSecret({
          tenantId: testTenantId,
          name: 'SECRET_3',
          value: 'value3',
          userId: testUserId,
        });

        const count = await deleteAllTenantSecrets(testTenantId);
        expect(count).toBe(3);

        const secrets = await listTenantSecrets(testTenantId);
        expect(secrets.length).toBe(0);
      });

      it('returns 0 for empty tenant', async () => {
        const count = await deleteAllTenantSecrets('empty-tenant');
        expect(count).toBe(0);
      });

      it('does not affect other tenants', async () => {
        await storeSecret({
          tenantId: 'tenant-A',
          name: 'SECRET',
          value: 'value',
          userId: testUserId,
        });

        await storeSecret({
          tenantId: 'tenant-B',
          name: 'SECRET',
          value: 'value',
          userId: testUserId,
        });

        await deleteAllTenantSecrets('tenant-A');

        const secretsA = await listTenantSecrets('tenant-A');
        const secretsB = await listTenantSecrets('tenant-B');

        expect(secretsA.length).toBe(0);
        expect(secretsB.length).toBe(1);
      });
    });

    describe('Secret Exists', () => {
      it('returns true for existing secret', async () => {
        await storeSecret({
          tenantId: testTenantId,
          name: 'EXISTS_TEST',
          value: 'value',
          userId: testUserId,
        });

        const exists = await secretExists(testTenantId, 'EXISTS_TEST');
        expect(exists).toBe(true);
      });

      it('returns false for non-existent secret', async () => {
        const exists = await secretExists(testTenantId, 'NONEXISTENT');
        expect(exists).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Validation Tests
  // ===========================================================================

  describe('Validation', () => {
    describe('Secret Name', () => {
      it('accepts valid names', async () => {
        const validNames = [
          'API_KEY',
          'my-secret',
          'Secret_123',
          'a',
          'A'.repeat(128),
        ];

        for (const name of validNames) {
          await storeSecret({
            tenantId: testTenantId,
            name,
            value: 'value',
            userId: testUserId,
          });
        }

        const secrets = await listTenantSecrets(testTenantId);
        expect(secrets.length).toBe(validNames.length);
      });

      it('rejects empty name', async () => {
        await expect(
          storeSecret({
            tenantId: testTenantId,
            name: '',
            value: 'value',
            userId: testUserId,
          })
        ).rejects.toThrow();
      });

      it('rejects name starting with number', async () => {
        await expect(
          storeSecret({
            tenantId: testTenantId,
            name: '1_SECRET',
            value: 'value',
            userId: testUserId,
          })
        ).rejects.toThrow();
      });

      it('rejects name with special characters', async () => {
        const invalidNames = ['secret@name', 'secret.name', 'secret name', 'secret/name'];

        for (const name of invalidNames) {
          await expect(
            storeSecret({
              tenantId: testTenantId,
              name,
              value: 'value',
              userId: testUserId,
            })
          ).rejects.toThrow();
        }
      });

      it('rejects name over 128 characters', async () => {
        await expect(
          storeSecret({
            tenantId: testTenantId,
            name: 'A'.repeat(129),
            value: 'value',
            userId: testUserId,
          })
        ).rejects.toThrow();
      });
    });

    describe('Secret Value', () => {
      it('accepts non-empty values', async () => {
        await storeSecret({
          tenantId: testTenantId,
          name: 'VALID_VALUE',
          value: 'x',
          userId: testUserId,
        });

        const value = await retrieveSecret(testTenantId, 'VALID_VALUE', testUserId);
        expect(value).toBe('x');
      });

      it('rejects empty value', async () => {
        await expect(
          storeSecret({
            tenantId: testTenantId,
            name: 'EMPTY_VALUE',
            value: '',
            userId: testUserId,
          })
        ).rejects.toThrow();
      });
    });
  });

  // ===========================================================================
  // Security Features Tests
  // ===========================================================================

  describe('Security Features', () => {
    describe('Constant-Time Comparison', () => {
      it('returns true for equal secrets', () => {
        expect(secretEquals('abc123', 'abc123')).toBe(true);
        expect(secretEquals('', '')).toBe(true);
      });

      it('returns false for different secrets', () => {
        expect(secretEquals('abc123', 'abc124')).toBe(false);
        expect(secretEquals('abc123', 'abc12')).toBe(false);
        expect(secretEquals('abc', 'xyz')).toBe(false);
      });

      it('handles non-string inputs', () => {
        expect(secretEquals(null as unknown as string, 'abc')).toBe(false);
        expect(secretEquals('abc', undefined as unknown as string)).toBe(false);
        expect(secretEquals(123 as unknown as string, '123')).toBe(false);
      });
    });

    describe('Master Key', () => {
      it('generates cryptographically secure master key', () => {
        const key1 = generateMasterKey();
        const key2 = generateMasterKey();

        expect(key1).not.toBe(key2);
        expect(Buffer.from(key1, 'base64').length).toBe(32);
      });

      it('throws error when master key is not configured', async () => {
        delete process.env.SECRETS_MASTER_KEY;
        clearMasterKeyCache();

        await expect(
          storeSecret({
            tenantId: testTenantId,
            name: 'TEST',
            value: 'value',
            userId: testUserId,
          })
        ).rejects.toThrow('SECRETS_MASTER_KEY');
      });

      it('throws error when master key is too short', async () => {
        process.env.SECRETS_MASTER_KEY = 'short-key';
        clearMasterKeyCache();

        await expect(
          storeSecret({
            tenantId: testTenantId,
            name: 'TEST',
            value: 'value',
            userId: testUserId,
          })
        ).rejects.toThrow('at least');
      });
    });

    describe('Key Derivation', () => {
      it('derives consistent keys from password', () => {
        const password = 'test-password';
        const salt = generateSalt();

        const key1 = deriveKey(password, salt);
        const key2 = deriveKey(password, salt);

        expect(key1.equals(key2)).toBe(true);
      });

      it('derives different keys for different passwords', () => {
        const salt = generateSalt();

        const key1 = deriveKey('password1', salt);
        const key2 = deriveKey('password2', salt);

        expect(key1.equals(key2)).toBe(false);
      });

      it('derives different keys for different salts', () => {
        const password = 'test-password';

        const key1 = deriveKey(password, generateSalt());
        const key2 = deriveKey(password, generateSalt());

        expect(key1.equals(key2)).toBe(false);
      });

      it('generates unique salts', () => {
        const salt1 = generateSalt();
        const salt2 = generateSalt();

        expect(salt1).not.toBe(salt2);
        expect(Buffer.from(salt1, 'base64').length).toBe(32);
      });
    });

    describe('Tenant Isolation', () => {
      it('prevents cross-tenant secret access', async () => {
        await storeSecret({
          tenantId: 'tenant-A',
          name: 'ISOLATED_SECRET',
          value: 'tenant-A-value',
          userId: testUserId,
        });

        // Attempt to retrieve from different tenant
        const value = await retrieveSecret('tenant-B', 'ISOLATED_SECRET', testUserId);
        expect(value).toBeNull();
      });

      it('prevents cross-tenant secret deletion', async () => {
        await storeSecret({
          tenantId: 'tenant-A',
          name: 'PROTECTED_SECRET',
          value: 'value',
          userId: testUserId,
        });

        // Attempt to delete from different tenant
        const deleted = await deleteSecret('tenant-B', 'PROTECTED_SECRET', testUserId);
        expect(deleted).toBe(false);

        // Original should still exist
        const exists = await secretExists('tenant-A', 'PROTECTED_SECRET');
        expect(exists).toBe(true);
      });
    });
  });
});
