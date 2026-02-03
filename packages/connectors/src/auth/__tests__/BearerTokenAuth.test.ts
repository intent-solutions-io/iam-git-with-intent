import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BearerTokenAuth } from '../BearerTokenAuth.js';
import { ISecretManager } from '../../secrets/ISecretManager.js';
import type { ILogger } from '../../core/base-connector.js';
import { AuthenticationError } from '../../errors/index.js';

describe('BearerTokenAuth', () => {
  let auth: BearerTokenAuth;
  let mockSecretManager: ISecretManager;
  let mockLogger: ILogger;

  beforeEach(() => {
    // Create mock secret manager
    mockSecretManager = {
      getSecret: vi.fn(),
      setSecret: vi.fn(),
      deleteSecret: vi.fn(),
      listSecrets: vi.fn()
    };

    // Create mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn()
    };

    auth = new BearerTokenAuth(mockSecretManager, mockLogger, 'tenant-123');
  });

  describe('authenticate', () => {
    it('should authenticate with bearer token', async () => {
      const result = await auth.authenticate({
        type: 'bearer',
        token: 'test-token-abc123'
      });

      expect(result.success).toBe(true);
      expect(result.token).toBe('test-token-abc123');
      expect(result.tokenType).toBe('Bearer');
      expect(mockSecretManager.setSecret).toHaveBeenCalledWith(
        'tenant-123',
        'bearer-token',
        'test-token-abc123'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Bearer token authentication succeeded',
        { tenantId: 'tenant-123', strategy: 'bearer' }
      );
    });

    it('should authenticate with metadata', async () => {
      const result = await auth.authenticate({
        type: 'bearer',
        token: 'test-token-abc123',
        metadata: { user: 'john', scopes: ['read', 'write'] }
      });

      expect(result.success).toBe(true);
      expect(result.metadata).toEqual({ user: 'john', scopes: ['read', 'write'] });
    });

    it('should throw AuthenticationError on invalid config', async () => {
      await expect(
        auth.authenticate({
          type: 'bearer',
          token: '' // Invalid: empty token
        } as any)
      ).rejects.toThrow();
    });

    it('should throw AuthenticationError when secret manager fails', async () => {
      vi.mocked(mockSecretManager.setSecret).mockRejectedValue(
        new Error('Secret Manager unavailable')
      );

      await expect(
        auth.authenticate({
          type: 'bearer',
          token: 'test-token'
        })
      ).rejects.toThrow(AuthenticationError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Bearer token authentication failed',
        expect.any(Object)
      );
    });
  });

  describe('getHeaders', () => {
    it('should return authorization header', async () => {
      await auth.authenticate({
        type: 'bearer',
        token: 'test-token-abc123'
      });

      const headers = auth.getHeaders();

      expect(headers).toEqual({
        'Authorization': 'Bearer test-token-abc123'
      });
    });

    it('should throw AuthenticationError when not authenticated', () => {
      expect(() => auth.getHeaders()).toThrow(AuthenticationError);
    });
  });

  describe('isExpired', () => {
    it('should return false (bearer tokens do not expire)', async () => {
      await auth.authenticate({
        type: 'bearer',
        token: 'test-token'
      });

      expect(auth.isExpired()).toBe(false);
    });
  });

  describe('refreshIfNeeded', () => {
    it('should do nothing (bearer tokens do not need refresh)', async () => {
      await auth.authenticate({
        type: 'bearer',
        token: 'test-token'
      });

      await expect(auth.refreshIfNeeded()).resolves.toBeUndefined();
    });
  });

  describe('revoke', () => {
    it('should revoke token', async () => {
      await auth.authenticate({
        type: 'bearer',
        token: 'test-token'
      });

      await auth.revoke();

      expect(mockSecretManager.deleteSecret).toHaveBeenCalledWith(
        'tenant-123',
        'bearer-token'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Bearer token revoked',
        { tenantId: 'tenant-123', strategy: 'bearer' }
      );

      // Should throw after revocation
      expect(() => auth.getHeaders()).toThrow(AuthenticationError);
    });
  });

  describe('getState/setState', () => {
    it('should get and restore state', async () => {
      await auth.authenticate({
        type: 'bearer',
        token: 'test-token',
        metadata: { user: 'john' }
      });

      const state = auth.getState();

      expect(state).toEqual({
        strategy: 'bearer',
        token: 'test-token',
        metadata: { user: 'john' }
      });

      // Create new instance and restore state
      const newAuth = new BearerTokenAuth(mockSecretManager, mockLogger, 'tenant-123');
      newAuth.setState(state);

      expect(newAuth.getHeaders()).toEqual({
        'Authorization': 'Bearer test-token'
      });
    });

    it('should throw error when restoring invalid state', async () => {
      await auth.authenticate({
        type: 'bearer',
        token: 'test-token'
      });

      expect(() =>
        auth.setState({
          strategy: 'oauth2', // Wrong strategy
          token: 'test-token'
        })
      ).toThrow('Invalid state');
    });
  });
});
