/**
 * Idempotency Key Scheme Tests
 *
 * A4.s1: Test suite for idempotency key generation and validation
 */

import { describe, it, expect } from 'vitest';
import {
  generateIdempotencyKey,
  parseIdempotencyKey,
  validateIdempotencyKey,
  hashRequestPayload,
  generateRequestId,
  extractTenantId,
  type GitHubIdempotencyKey,
  type ApiIdempotencyKey,
  type SlackIdempotencyKey,
  type SchedulerIdempotencyKey,
  IdempotencyKeyInputSchema,
} from '../key-scheme';

describe('Idempotency Key Scheme', () => {
  describe('GitHub Webhook Keys', () => {
    it('should generate valid GitHub webhook key', () => {
      const input: GitHubIdempotencyKey = {
        source: 'github_webhook',
        tenant: 'org-123',
        deliveryId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const key = generateIdempotencyKey(input);

      expect(key).toBe('github:org-123:550e8400-e29b-41d4-a716-446655440000');
    });

    it('should parse GitHub webhook key correctly', () => {
      const key = 'github:org-123:550e8400-e29b-41d4-a716-446655440000';
      const parsed = parseIdempotencyKey(key);

      expect(parsed).toEqual({
        source: 'github_webhook',
        tenant: 'org-123',
        deliveryId: '550e8400-e29b-41d4-a716-446655440000',
      });
    });

    it('should validate GitHub webhook key format', () => {
      const key = 'github:org-123:550e8400-e29b-41d4-a716-446655440000';
      expect(validateIdempotencyKey(key)).toBe(true);
    });

    it('should reject invalid GitHub delivery ID', () => {
      expect(() =>
        generateIdempotencyKey({
          source: 'github_webhook',
          tenant: 'org-123',
          deliveryId: 'not-a-uuid',
        } as GitHubIdempotencyKey)
      ).toThrow();
    });

    it('should reject GitHub key with missing tenant', () => {
      expect(() =>
        generateIdempotencyKey({
          source: 'github_webhook',
          tenant: '',
          deliveryId: '550e8400-e29b-41d4-a716-446655440000',
        } as GitHubIdempotencyKey)
      ).toThrow();
    });

    it('should roundtrip GitHub key generation and parsing', () => {
      const input: GitHubIdempotencyKey = {
        source: 'github_webhook',
        tenant: 'org-456',
        deliveryId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const key = generateIdempotencyKey(input);
      const parsed = parseIdempotencyKey(key);

      expect(parsed).toEqual(input);
    });
  });

  describe('API Request Keys', () => {
    it('should generate valid API request key', () => {
      const input: ApiIdempotencyKey = {
        source: 'api',
        tenant: 'org-123',
        requestId: 'req-550e8400-e29b-41d4-a716-446655440000',
      };

      const key = generateIdempotencyKey(input);

      expect(key).toBe('api:org-123:req-550e8400-e29b-41d4-a716-446655440000');
    });

    it('should parse API request key correctly', () => {
      const key = 'api:org-123:req-abc123';
      const parsed = parseIdempotencyKey(key);

      expect(parsed).toEqual({
        source: 'api',
        tenant: 'org-123',
        requestId: 'req-abc123',
      });
    });

    it('should validate API request key format', () => {
      const key = 'api:org-123:req-xyz';
      expect(validateIdempotencyKey(key)).toBe(true);
    });

    it('should reject API key with empty request ID', () => {
      expect(() =>
        generateIdempotencyKey({
          source: 'api',
          tenant: 'org-123',
          requestId: '',
        } as ApiIdempotencyKey)
      ).toThrow();
    });

    it('should roundtrip API key generation and parsing', () => {
      const input: ApiIdempotencyKey = {
        source: 'api',
        tenant: 'org-789',
        requestId: 'custom-request-id-123',
      };

      const key = generateIdempotencyKey(input);
      const parsed = parseIdempotencyKey(key);

      expect(parsed).toEqual(input);
    });
  });

  describe('Slack Command Keys', () => {
    it('should generate valid Slack command key', () => {
      const input: SlackIdempotencyKey = {
        source: 'slack',
        tenant: 'team-T12345678',
        callbackId: 'callback-1234567890.123456',
      };

      const key = generateIdempotencyKey(input);

      expect(key).toBe('slack:team-T12345678:callback-1234567890.123456');
    });

    it('should parse Slack command key correctly', () => {
      const key = 'slack:team-T12345678:callback-1234567890.123456';
      const parsed = parseIdempotencyKey(key);

      expect(parsed).toEqual({
        source: 'slack',
        tenant: 'team-T12345678',
        callbackId: 'callback-1234567890.123456',
      });
    });

    it('should validate Slack command key format', () => {
      const key = 'slack:team-T12345678:callback-123';
      expect(validateIdempotencyKey(key)).toBe(true);
    });

    it('should roundtrip Slack key generation and parsing', () => {
      const input: SlackIdempotencyKey = {
        source: 'slack',
        tenant: 'team-T99999999',
        callbackId: 'my-callback-id',
      };

      const key = generateIdempotencyKey(input);
      const parsed = parseIdempotencyKey(key);

      expect(parsed).toEqual(input);
    });
  });

  describe('Scheduler Keys', () => {
    it('should generate valid scheduler key', () => {
      const input: SchedulerIdempotencyKey = {
        source: 'scheduler',
        tenant: 'org-123',
        scheduleId: 'daily-cleanup',
        timestamp: '2024-12-19T00:00:00Z',
      };

      const key = generateIdempotencyKey(input);

      expect(key).toBe('scheduler:org-123:daily-cleanup:2024-12-19T00:00:00Z');
    });

    it('should parse scheduler key correctly', () => {
      const key = 'scheduler:org-123:daily-cleanup:2024-12-19T00:00:00Z';
      const parsed = parseIdempotencyKey(key);

      expect(parsed).toEqual({
        source: 'scheduler',
        tenant: 'org-123',
        scheduleId: 'daily-cleanup',
        timestamp: '2024-12-19T00:00:00Z',
      });
    });

    it('should validate scheduler key format', () => {
      const key = 'scheduler:org-123:hourly-sync:2024-12-19T12:00:00Z';
      expect(validateIdempotencyKey(key)).toBe(true);
    });

    it('should reject scheduler key with invalid timestamp', () => {
      expect(() =>
        generateIdempotencyKey({
          source: 'scheduler',
          tenant: 'org-123',
          scheduleId: 'daily-cleanup',
          timestamp: 'not-a-datetime',
        } as SchedulerIdempotencyKey)
      ).toThrow();
    });

    it('should roundtrip scheduler key generation and parsing', () => {
      const input: SchedulerIdempotencyKey = {
        source: 'scheduler',
        tenant: 'org-999',
        scheduleId: 'weekly-report',
        timestamp: '2025-01-01T00:00:00Z',
      };

      const key = generateIdempotencyKey(input);
      const parsed = parseIdempotencyKey(key);

      expect(parsed).toEqual(input);
    });
  });

  describe('Key Validation', () => {
    it('should reject key with invalid source', () => {
      const key = 'unknown:org-123:abc';
      expect(validateIdempotencyKey(key)).toBe(false);
    });

    it('should reject key with missing tenant', () => {
      const key = 'github:550e8400-e29b-41d4-a716-446655440000';
      expect(validateIdempotencyKey(key)).toBe(false);
    });

    it('should reject key with too few parts', () => {
      const key = 'github:org-123';
      expect(validateIdempotencyKey(key)).toBe(false);
    });

    it('should reject empty key', () => {
      expect(validateIdempotencyKey('')).toBe(false);
    });

    it('should reject malformed scheduler key (missing timestamp)', () => {
      const key = 'scheduler:org-123:daily-cleanup';
      expect(validateIdempotencyKey(key)).toBe(false);
    });

    it('should parse null for invalid keys', () => {
      expect(parseIdempotencyKey('invalid')).toBeNull();
      expect(parseIdempotencyKey('github:')).toBeNull();
      expect(parseIdempotencyKey('api:org-123')).toBeNull();
    });
  });

  describe('Tenant Isolation', () => {
    it('should generate different keys for different tenants', () => {
      const key1 = generateIdempotencyKey({
        source: 'api',
        tenant: 'org-123',
        requestId: 'req-abc',
      });

      const key2 = generateIdempotencyKey({
        source: 'api',
        tenant: 'org-456',
        requestId: 'req-abc',
      });

      expect(key1).not.toBe(key2);
      expect(key1).toBe('api:org-123:req-abc');
      expect(key2).toBe('api:org-456:req-abc');
    });

    it('should parse tenant from key correctly', () => {
      const key = 'api:my-tenant-id:req-123';
      const parsed = parseIdempotencyKey(key);

      expect(parsed).toBeTruthy();
      expect(parsed?.tenant).toBe('my-tenant-id');
    });
  });

  describe('Payload Hashing', () => {
    it('should hash payload consistently', () => {
      const payload = { action: 'opened', pr: 123 };

      const hash1 = hashRequestPayload(payload);
      const hash2 = hashRequestPayload(payload);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    it('should produce same hash for objects with different key order', () => {
      const payload1 = { b: 2, a: 1, c: 3 };
      const payload2 = { a: 1, c: 3, b: 2 };

      const hash1 = hashRequestPayload(payload1);
      const hash2 = hashRequestPayload(payload2);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different payloads', () => {
      const payload1 = { action: 'opened', pr: 123 };
      const payload2 = { action: 'closed', pr: 123 };

      const hash1 = hashRequestPayload(payload1);
      const hash2 = hashRequestPayload(payload2);

      expect(hash1).not.toBe(hash2);
    });

    it('should hash nested objects consistently', () => {
      const payload = {
        outer: {
          inner: {
            value: 42,
          },
        },
      };

      const hash1 = hashRequestPayload(payload);
      const hash2 = hashRequestPayload(payload);

      expect(hash1).toBe(hash2);
    });

    it('should hash arrays consistently', () => {
      const payload = { items: [1, 2, 3] };

      const hash1 = hashRequestPayload(payload);
      const hash2 = hashRequestPayload(payload);

      expect(hash1).toBe(hash2);
    });

    it('should handle null and undefined in payload', () => {
      const payload = { a: null, b: undefined };

      const hash = hashRequestPayload(payload);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Helper Functions', () => {
    it('should generate valid request ID', () => {
      const id = generateRequestId();

      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique request IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).not.toBe(id2);
    });

    it('should extract tenant ID from tenantId field', () => {
      const tenant = extractTenantId({ tenantId: 'org-123' });
      expect(tenant).toBe('org-123');
    });

    it('should extract tenant ID from organizationId field', () => {
      const tenant = extractTenantId({ organizationId: 'org-456' });
      expect(tenant).toBe('org-456');
    });

    it('should extract tenant ID from orgId field', () => {
      const tenant = extractTenantId({ orgId: 'org-789' });
      expect(tenant).toBe('org-789');
    });

    it('should prefer tenantId over other fields', () => {
      const tenant = extractTenantId({
        tenantId: 'org-123',
        organizationId: 'org-456',
        orgId: 'org-789',
      });
      expect(tenant).toBe('org-123');
    });

    it('should return default when no tenant ID found', () => {
      const tenant = extractTenantId({});
      expect(tenant).toBe('default');
    });
  });

  describe('Zod Schema Validation', () => {
    it('should validate valid GitHub key input', () => {
      const input = {
        source: 'github_webhook',
        tenant: 'org-123',
        deliveryId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = IdempotencyKeyInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should reject GitHub key with invalid UUID', () => {
      const input = {
        source: 'github_webhook',
        tenant: 'org-123',
        deliveryId: 'not-a-uuid',
      };

      const result = IdempotencyKeyInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should validate valid API key input', () => {
      const input = {
        source: 'api',
        tenant: 'org-123',
        requestId: 'req-abc',
      };

      const result = IdempotencyKeyInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should validate valid Slack key input', () => {
      const input = {
        source: 'slack',
        tenant: 'team-123',
        callbackId: 'callback-abc',
      };

      const result = IdempotencyKeyInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should validate valid Scheduler key input', () => {
      const input = {
        source: 'scheduler',
        tenant: 'org-123',
        scheduleId: 'daily',
        timestamp: '2024-12-19T00:00:00Z',
      };

      const result = IdempotencyKeyInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should reject input with unknown source', () => {
      const input = {
        source: 'unknown',
        tenant: 'org-123',
      };

      const result = IdempotencyKeyInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe('Firestore Document ID Compatibility', () => {
    it('should generate keys within Firestore length limit', () => {
      const input: ApiIdempotencyKey = {
        source: 'api',
        tenant: 'a'.repeat(100), // Max tenant length
        requestId: 'b'.repeat(200), // Max request ID length
      };

      const key = generateIdempotencyKey(input);

      // Firestore doc ID max is 1500 bytes
      expect(key.length).toBeLessThan(1500);
    });

    it('should generate keys with no special characters', () => {
      const input: GitHubIdempotencyKey = {
        source: 'github_webhook',
        tenant: 'org-123',
        deliveryId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const key = generateIdempotencyKey(input);

      // Only alphanumeric, dash, underscore, and colon
      expect(key).toMatch(/^[a-zA-Z0-9:_-]+$/);
    });
  });
});
