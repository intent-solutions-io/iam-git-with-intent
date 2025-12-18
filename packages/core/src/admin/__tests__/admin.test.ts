/**
 * Admin Dashboard Tests
 *
 * Phase 40: Tests for API key management and admin utilities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryApiKeyStore,
  ApiKeyManager,
  createAdminSettings,
  createApiKeyManager,
  DEFAULT_ADMIN_SETTINGS,
  ALL_API_KEY_SCOPES,
  ApiKeyScope,
} from '../index.js';

// =============================================================================
// InMemoryApiKeyStore Tests
// =============================================================================

describe('InMemoryApiKeyStore', () => {
  let store: InMemoryApiKeyStore;

  beforeEach(() => {
    store = new InMemoryApiKeyStore();
  });

  describe('create()', () => {
    it('should create an API key', async () => {
      const result = await store.create({
        name: 'Test Key',
        scopes: ['read:runs', 'write:runs'],
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      expect(result.key.id).toMatch(/^key_/);
      expect(result.key.name).toBe('Test Key');
      expect(result.key.scopes).toEqual(['read:runs', 'write:runs']);
      expect(result.key.status).toBe('active');
      expect(result.rawKey).toMatch(/^gwi_/);
    });

    it('should create key with expiration', async () => {
      const result = await store.create({
        name: 'Expiring Key',
        scopes: ['read:runs'],
        tenantId: 'tenant-1',
        createdBy: 'user-1',
        expiresInDays: 30,
      });

      expect(result.key.expiresAt).toBeDefined();
      const expirationMs = result.key.expiresAt!.getTime() - Date.now();
      expect(expirationMs).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
      expect(expirationMs).toBeLessThan(31 * 24 * 60 * 60 * 1000);
    });

    it('should generate unique keys', async () => {
      const result1 = await store.create({
        name: 'Key 1',
        scopes: ['read:runs'],
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const result2 = await store.create({
        name: 'Key 2',
        scopes: ['read:runs'],
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      expect(result1.key.id).not.toBe(result2.key.id);
      expect(result1.rawKey).not.toBe(result2.rawKey);
    });
  });

  describe('get()', () => {
    it('should get key by ID', async () => {
      const { key } = await store.create({
        name: 'Test Key',
        scopes: ['read:runs'],
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const retrieved = await store.get(key.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(key.id);
    });

    it('should return null for non-existent key', async () => {
      const result = await store.get('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getByTenant()', () => {
    it('should get all keys for tenant', async () => {
      await store.create({
        name: 'Key 1',
        scopes: ['read:runs'],
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      await store.create({
        name: 'Key 2',
        scopes: ['write:runs'],
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      await store.create({
        name: 'Other Key',
        scopes: ['read:runs'],
        tenantId: 'tenant-2',
        createdBy: 'user-2',
      });

      const keys = await store.getByTenant('tenant-1');
      expect(keys).toHaveLength(2);
      expect(keys.every(k => k.tenantId === 'tenant-1')).toBe(true);
    });
  });

  describe('revoke()', () => {
    it('should revoke an API key', async () => {
      const { key } = await store.create({
        name: 'Test Key',
        scopes: ['read:runs'],
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const revoked = await store.revoke(key.id, 'admin-1', 'Security concern');

      expect(revoked.status).toBe('revoked');
      expect(revoked.revokedBy).toBe('admin-1');
      expect(revoked.revocationReason).toBe('Security concern');
      expect(revoked.revokedAt).toBeDefined();
    });

    it('should throw for non-existent key', async () => {
      await expect(store.revoke('non-existent', 'admin-1')).rejects.toThrow();
    });
  });

  describe('validateKey()', () => {
    it('should validate active key', async () => {
      const { rawKey } = await store.create({
        name: 'Test Key',
        scopes: ['read:runs'],
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const validated = await store.validateKey(rawKey);
      expect(validated).not.toBeNull();
      expect(validated!.name).toBe('Test Key');
    });

    it('should reject revoked key', async () => {
      const { key, rawKey } = await store.create({
        name: 'Test Key',
        scopes: ['read:runs'],
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      await store.revoke(key.id, 'admin-1');

      const validated = await store.validateKey(rawKey);
      expect(validated).toBeNull();
    });

    it('should reject unknown key', async () => {
      const validated = await store.validateKey('gwi_unknown_key');
      expect(validated).toBeNull();
    });

    it('should update lastUsedAt on validation', async () => {
      const { key, rawKey } = await store.create({
        name: 'Test Key',
        scopes: ['read:runs'],
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      expect(key.lastUsedAt).toBeUndefined();

      await store.validateKey(rawKey);

      const updated = await store.get(key.id);
      expect(updated!.lastUsedAt).toBeDefined();
    });
  });

  describe('recordUsage()', () => {
    it('should record API usage', async () => {
      const { key } = await store.create({
        name: 'Test Key',
        scopes: ['read:runs'],
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      await store.recordUsage(key.id, '/api/runs', 'read:runs');
      await store.recordUsage(key.id, '/api/runs', 'read:runs');
      await store.recordUsage(key.id, '/api/workflows', 'read:workflows');

      const stats = await store.getUsageStats(key.id);
      expect(stats.totalRequests).toBe(3);
      expect(stats.byScope['read:runs']).toBe(2);
      expect(stats.byEndpoint['/api/runs']).toBe(2);
    });
  });

  describe('delete()', () => {
    it('should delete key', async () => {
      const { key } = await store.create({
        name: 'Test Key',
        scopes: ['read:runs'],
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      await store.delete(key.id);

      const deleted = await store.get(key.id);
      expect(deleted).toBeNull();
    });
  });
});

// =============================================================================
// ApiKeyManager Tests
// =============================================================================

describe('ApiKeyManager', () => {
  let manager: ApiKeyManager;

  beforeEach(() => {
    manager = createApiKeyManager('tenant-1');
  });

  describe('createKey()', () => {
    it('should create key with manager', async () => {
      const result = await manager.createKey({
        name: 'Test Key',
        scopes: ['read:runs', 'write:runs'],
        createdBy: 'user-1',
      });

      expect(result.key.name).toBe('Test Key');
      expect(result.key.tenantId).toBe('tenant-1');
    });

    it('should enforce max keys limit', async () => {
      // Create max keys
      const settings = createAdminSettings('tenant-1', {
        apiKeys: { ...DEFAULT_ADMIN_SETTINGS.apiKeys, maxKeysPerTenant: 2 },
      });
      const store = new InMemoryApiKeyStore();
      const limitedManager = new ApiKeyManager(store, settings);

      await limitedManager.createKey({
        name: 'Key 1',
        scopes: ['read:runs'],
        createdBy: 'user-1',
      });

      await limitedManager.createKey({
        name: 'Key 2',
        scopes: ['read:runs'],
        createdBy: 'user-1',
      });

      await expect(
        limitedManager.createKey({
          name: 'Key 3',
          scopes: ['read:runs'],
          createdBy: 'user-1',
        })
      ).rejects.toThrow(/Maximum API keys limit/);
    });

    it('should reject invalid scopes', async () => {
      const settings = createAdminSettings('tenant-1', {
        apiKeys: { ...DEFAULT_ADMIN_SETTINGS.apiKeys, allowedScopes: ['read:runs'] },
      });
      const store = new InMemoryApiKeyStore();
      const restrictedManager = new ApiKeyManager(store, settings);

      await expect(
        restrictedManager.createKey({
          name: 'Test Key',
          scopes: ['admin' as ApiKeyScope],
          createdBy: 'user-1',
        })
      ).rejects.toThrow(/Invalid scopes/);
    });

    it('should apply default expiration when required', async () => {
      const settings = createAdminSettings('tenant-1', {
        apiKeys: {
          ...DEFAULT_ADMIN_SETTINGS.apiKeys,
          requireExpiration: true,
          defaultExpirationDays: 30,
        },
      });
      const store = new InMemoryApiKeyStore();
      const expiringManager = new ApiKeyManager(store, settings);

      const result = await expiringManager.createKey({
        name: 'Test Key',
        scopes: ['read:runs'],
        createdBy: 'user-1',
      });

      expect(result.key.expiresAt).toBeDefined();
    });
  });

  describe('listKeys()', () => {
    it('should list all tenant keys', async () => {
      await manager.createKey({
        name: 'Key 1',
        scopes: ['read:runs'],
        createdBy: 'user-1',
      });

      await manager.createKey({
        name: 'Key 2',
        scopes: ['write:runs'],
        createdBy: 'user-1',
      });

      const keys = await manager.listKeys();
      expect(keys).toHaveLength(2);
    });
  });

  describe('revokeKey()', () => {
    it('should revoke key', async () => {
      const { key } = await manager.createKey({
        name: 'Test Key',
        scopes: ['read:runs'],
        createdBy: 'user-1',
      });

      const revoked = await manager.revokeKey(key.id, 'admin-1', 'Test revocation');

      expect(revoked.status).toBe('revoked');
    });

    it('should throw for non-existent key', async () => {
      await expect(manager.revokeKey('non-existent', 'admin-1')).rejects.toThrow();
    });
  });

  describe('validateKey()', () => {
    it('should validate key with scope check', async () => {
      const { rawKey } = await manager.createKey({
        name: 'Test Key',
        scopes: ['read:runs', 'write:runs'],
        createdBy: 'user-1',
      });

      const valid = await manager.validateKey(rawKey, 'read:runs');
      expect(valid).not.toBeNull();

      const invalidScope = await manager.validateKey(rawKey, 'admin');
      expect(invalidScope).toBeNull();
    });

    it('should allow admin scope to access everything', async () => {
      // Create manager with admin scope allowed
      const settings = createAdminSettings('tenant-1', {
        apiKeys: { ...DEFAULT_ADMIN_SETTINGS.apiKeys, allowedScopes: [...DEFAULT_ADMIN_SETTINGS.apiKeys.allowedScopes, 'admin'] },
      });
      const store = new InMemoryApiKeyStore();
      const adminManager = new ApiKeyManager(store, settings);

      const { rawKey } = await adminManager.createKey({
        name: 'Admin Key',
        scopes: ['admin'],
        createdBy: 'user-1',
      });

      const valid = await adminManager.validateKey(rawKey, 'read:runs');

      expect(valid).not.toBeNull();
    });
  });

  describe('getExpiringKeys()', () => {
    it('should get keys expiring soon', async () => {
      await manager.createKey({
        name: 'Expiring Key',
        scopes: ['read:runs'],
        createdBy: 'user-1',
        expiresInDays: 3,
      });

      await manager.createKey({
        name: 'Non-expiring Key',
        scopes: ['read:runs'],
        createdBy: 'user-1',
      });

      await manager.createKey({
        name: 'Later Key',
        scopes: ['read:runs'],
        createdBy: 'user-1',
        expiresInDays: 30,
      });

      const expiring = await manager.getExpiringKeys(7);
      expect(expiring).toHaveLength(1);
      expect(expiring[0].name).toBe('Expiring Key');
    });
  });
});

// =============================================================================
// Configuration Tests
// =============================================================================

describe('Configuration', () => {
  it('should have default admin settings', () => {
    expect(DEFAULT_ADMIN_SETTINGS.apiKeys.maxKeysPerTenant).toBe(10);
    expect(DEFAULT_ADMIN_SETTINGS.apiKeys.defaultExpirationDays).toBe(90);
    expect(DEFAULT_ADMIN_SETTINGS.security.rateLimitPerKey).toBe(1000);
  });

  it('should have all scopes defined', () => {
    expect(ALL_API_KEY_SCOPES).toContain('read:runs');
    expect(ALL_API_KEY_SCOPES).toContain('write:runs');
    expect(ALL_API_KEY_SCOPES).toContain('admin');
  });

  it('should create settings with overrides', () => {
    const settings = createAdminSettings('tenant-1', {
      apiKeys: { ...DEFAULT_ADMIN_SETTINGS.apiKeys, maxKeysPerTenant: 20 },
    });

    expect(settings.tenantId).toBe('tenant-1');
    expect(settings.apiKeys.maxKeysPerTenant).toBe(20);
    expect(settings.apiKeys.defaultExpirationDays).toBe(90); // Default unchanged
  });
});
