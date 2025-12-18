/**
 * Tests for Phase 62: API Key Management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ManagedApiKeyManager,
  createManagedApiKeyManager,
  validateManagedApiKey,
  ManagedApiKeySchema,
  CreateApiKeySchema,
  API_SCOPES,
  ApiKeysErrorCodes,
  type ManagedApiKey,
  type ManagedApiKeyWithSecret,
} from '../index.js';

describe('API Key Management', () => {
  describe('ManagedApiKeyManager', () => {
    let manager: ManagedApiKeyManager;

    beforeEach(() => {
      manager = createManagedApiKeyManager();
    });

    it('should create API key', () => {
      const key = manager.createKey({
        tenantId: 'tenant-123',
        name: 'Test API Key',
        type: 'live',
        scopes: ['series:read', 'forecasts:read'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      expect(key.id).toBeDefined();
      expect(key.plainKey).toBeDefined();
      expect(key.plainKey).toMatch(/^gwi_live_/);
      expect(key.tenantId).toBe('tenant-123');
      expect(key.name).toBe('Test API Key');
      expect(key.scopes).toContain('series:read');
      expect(key.status).toBe('active');
    });

    it('should create test key with test prefix', () => {
      const key = manager.createKey({
        tenantId: 'tenant-123',
        name: 'Test Key',
        type: 'test',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      expect(key.plainKey).toMatch(/^gwi_test_/);
    });

    it('should create restricted key with restricted prefix', () => {
      const key = manager.createKey({
        tenantId: 'tenant-123',
        name: 'Restricted Key',
        type: 'restricted',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      expect(key.plainKey).toMatch(/^gwi_rstr_/);
    });

    it('should validate active key', () => {
      const key = manager.createKey({
        tenantId: 'tenant-123',
        name: 'Valid Key',
        type: 'live',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      const result = manager.validateKey(key.plainKey);

      expect(result.valid).toBe(true);
      expect(result.key).toBeDefined();
      expect(result.key?.id).toBe(key.id);
    });

    it('should reject invalid key', () => {
      const result = manager.validateKey('gwi_live_invalid_key');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Key not found');
    });

    it('should reject revoked key', () => {
      const key = manager.createKey({
        tenantId: 'tenant-123',
        name: 'Revoked Key',
        type: 'live',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      manager.revokeKey(key.id);

      const result = manager.validateKey(key.plainKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Key is revoked');
    });

    it('should reject expired key', () => {
      const key = manager.createKey({
        tenantId: 'tenant-123',
        name: 'Expired Key',
        type: 'live',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
        expiresAt: Date.now() - 1000, // Already expired
      });

      const result = manager.validateKey(key.plainKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Key expired');
    });

    it('should check required scopes', () => {
      const key = manager.createKey({
        tenantId: 'tenant-123',
        name: 'Scoped Key',
        type: 'live',
        scopes: ['series:read', 'forecasts:read'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      const validResult = manager.validateKey(key.plainKey, { requiredScopes: ['series:read'] });
      expect(validResult.valid).toBe(true);

      const invalidResult = manager.validateKey(key.plainKey, { requiredScopes: ['series:write'] });
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toBe('Insufficient scopes');
    });

    it('should allow all scopes with "all" scope', () => {
      const key = manager.createKey({
        tenantId: 'tenant-123',
        name: 'Full Access Key',
        type: 'live',
        scopes: ['all'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      const result = manager.validateKey(key.plainKey, { requiredScopes: ['series:read', 'admin:users'] });
      expect(result.valid).toBe(true);
    });

    it('should check IP restrictions', () => {
      const key = manager.createKey({
        tenantId: 'tenant-123',
        name: 'IP Restricted Key',
        type: 'live',
        scopes: ['series:read'],
        allowedIps: ['192.168.1.1', '10.0.0.1'],
        createdBy: 'user-123',
      });

      const validResult = manager.validateKey(key.plainKey, { clientIp: '192.168.1.1' });
      expect(validResult.valid).toBe(true);

      const invalidResult = manager.validateKey(key.plainKey, { clientIp: '192.168.1.2' });
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toBe('IP not allowed');
    });

    it('should track usage', () => {
      const key = manager.createKey({
        tenantId: 'tenant-123',
        name: 'Usage Key',
        type: 'live',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      manager.recordUsage(key.id, {
        endpoint: '/api/series',
        statusCode: 200,
        responseTimeMs: 50,
        clientIp: '192.168.1.1',
      });

      manager.recordUsage(key.id, {
        endpoint: '/api/series',
        statusCode: 200,
        responseTimeMs: 75,
        clientIp: '192.168.1.1',
      });

      manager.recordUsage(key.id, {
        endpoint: '/api/forecasts',
        statusCode: 400,
        responseTimeMs: 25,
        clientIp: '192.168.1.1',
      });

      const summary = manager.getUsageSummary(key.id);

      expect(summary.totalRequests).toBe(3);
      expect(summary.successRate).toBeCloseTo(2 / 3);
    });

    it('should check daily quota', () => {
      const key = manager.createKey({
        tenantId: 'tenant-123',
        name: 'Quota Key',
        type: 'live',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
        dailyQuota: 2,
      });

      // First request - within quota
      const quota1 = manager.checkQuota(key.id);
      expect(quota1.withinQuota).toBe(true);
      expect(quota1.dailyRemaining).toBe(2);

      // Record usage
      manager.recordUsage(key.id, {
        endpoint: '/api/test',
        statusCode: 200,
        responseTimeMs: 10,
        clientIp: '1.1.1.1',
      });

      manager.recordUsage(key.id, {
        endpoint: '/api/test',
        statusCode: 200,
        responseTimeMs: 10,
        clientIp: '1.1.1.1',
      });

      // Should now exceed quota
      const quota2 = manager.checkQuota(key.id);
      expect(quota2.withinQuota).toBe(false);
      expect(quota2.dailyRemaining).toBe(0);
    });

    it('should rotate key', () => {
      const key = manager.createKey({
        tenantId: 'tenant-123',
        name: 'Rotatable Key',
        type: 'live',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      const oldPlainKey = key.plainKey;

      const rotated = manager.rotateKey(key.id);

      expect(rotated).toBeDefined();
      expect(rotated!.plainKey).toBeDefined();
      expect(rotated!.plainKey).not.toBe(oldPlainKey);

      // Old key should be revoked
      const oldKeyValidation = manager.validateKey(oldPlainKey);
      expect(oldKeyValidation.valid).toBe(false);

      // New key should work
      const newKeyValidation = manager.validateKey(rotated!.plainKey);
      expect(newKeyValidation.valid).toBe(true);
    });

    it('should list keys by tenant', () => {
      manager.createKey({
        tenantId: 'tenant-123',
        name: 'Key 1',
        type: 'live',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      manager.createKey({
        tenantId: 'tenant-123',
        name: 'Key 2',
        type: 'test',
        scopes: ['forecasts:read'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      manager.createKey({
        tenantId: 'tenant-456',
        name: 'Key 3',
        type: 'live',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-456',
      });

      const keys = manager.listKeys('tenant-123');
      expect(keys).toHaveLength(2);
      expect(keys.every(k => k.tenantId === 'tenant-123')).toBe(true);
    });

    it('should filter keys by type', () => {
      manager.createKey({
        tenantId: 'tenant-123',
        name: 'Live Key',
        type: 'live',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      manager.createKey({
        tenantId: 'tenant-123',
        name: 'Test Key',
        type: 'test',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      const liveKeys = manager.listKeys('tenant-123', { type: 'live' });
      expect(liveKeys).toHaveLength(1);
      expect(liveKeys[0].type).toBe('live');
    });

    it('should update key metadata', () => {
      const key = manager.createKey({
        tenantId: 'tenant-123',
        name: 'Original Name',
        type: 'live',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
        metadata: { env: 'dev' },
      });

      const updated = manager.updateKey(key.id, {
        name: 'Updated Name',
        metadata: { env: 'prod' },
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.metadata?.env).toBe('prod');
    });

    it('should get key by ID', () => {
      const created = manager.createKey({
        tenantId: 'tenant-123',
        name: 'Get Test Key',
        type: 'live',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      const retrieved = manager.getKey(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should delete key', () => {
      const key = manager.createKey({
        tenantId: 'tenant-123',
        name: 'Delete Me',
        type: 'live',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
      });

      const deleted = manager.deleteKey(key.id);
      expect(deleted).toBe(true);

      const retrieved = manager.getKey(key.id);
      expect(retrieved).toBeUndefined();
    });

    it('should return false when revoking non-existent key', () => {
      const result = manager.revokeKey('non-existent-id');
      expect(result).toBe(false);
    });

    it('should return undefined when rotating non-existent key', () => {
      const result = manager.rotateKey('non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('Validation', () => {
    it('should validate correct API key structure', () => {
      const validKey: ManagedApiKey = {
        id: 'key_1',
        tenantId: 'tenant-123',
        name: 'Test Key',
        type: 'live',
        prefix: 'gwi_live',
        hashedKey: 'h_abc123',
        status: 'active',
        scopes: ['series:read'],
        allowedIps: [],
        createdBy: 'user-123',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = validateManagedApiKey(validKey);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should reject invalid API key structure', () => {
      const invalidKey = {
        id: '', // Empty ID
        tenantId: 'tenant-123',
        name: 'Test Key',
        type: 'invalid_type', // Invalid type
        scopes: ['series:read'],
      };

      const result = validateManagedApiKey(invalidKey);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('Schemas', () => {
    it('should have ManagedApiKeySchema', () => {
      expect(ManagedApiKeySchema).toBeDefined();
    });

    it('should have CreateApiKeySchema', () => {
      expect(CreateApiKeySchema).toBeDefined();
    });
  });

  describe('Constants', () => {
    it('should have API_SCOPES', () => {
      expect(API_SCOPES['series:read']).toBeDefined();
      expect(API_SCOPES['forecasts:write']).toBeDefined();
      expect(API_SCOPES['admin:users']).toBeDefined();
      expect(API_SCOPES.all).toBeDefined();
    });

    it('should have ApiKeysErrorCodes', () => {
      expect(ApiKeysErrorCodes.KEY_NOT_FOUND).toBe('AK_1001');
      expect(ApiKeysErrorCodes.KEY_REVOKED).toBe('AK_1002');
      expect(ApiKeysErrorCodes.QUOTA_EXCEEDED).toBe('AK_3001');
      expect(ApiKeysErrorCodes.RATE_LIMITED).toBe('AK_3002');
    });
  });

  describe('Factory Functions', () => {
    it('should create manager with factory function', () => {
      const manager = createManagedApiKeyManager();
      expect(manager).toBeInstanceOf(ManagedApiKeyManager);
    });
  });
});
