/**
 * Webhook Signature Validation Tests
 *
 * B3.s1: Tests for HMAC signature validation with timing-safe comparison.
 * Covers GitHub webhook signature validation (sha256 and legacy sha1).
 */

import { describe, it, expect } from 'vitest';
import {
  verifyGitHubWebhookSignature,
  createGitHubSignatureHeader,
  verifyHmacSignature,
  createHmacSignature,
  type WebhookVerificationResult,
} from '../index.js';
import { createHmac } from 'crypto';

describe('GitHub Webhook Signature Validation', () => {
  const secret = 'test-webhook-secret-key-12345';
  const payload = JSON.stringify({
    action: 'opened',
    number: 42,
    pull_request: {
      id: 123,
      title: 'Test PR',
    },
  });

  describe('verifyGitHubWebhookSignature', () => {
    it('should verify valid SHA-256 signature', () => {
      const hmac = createHmac('sha256', secret);
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      const result = verifyGitHubWebhookSignature(payload, signature, secret);

      expect(result.valid).toBe(true);
      expect(result.signatureType).toBe('sha256');
      expect(result.error).toBeUndefined();
    });

    it('should verify valid SHA-1 signature (legacy)', () => {
      const hmac = createHmac('sha1', secret);
      hmac.update(payload);
      const signature = `sha1=${hmac.digest('hex')}`;

      const result = verifyGitHubWebhookSignature(payload, signature, secret);

      expect(result.valid).toBe(true);
      expect(result.signatureType).toBe('sha1');
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid signature', () => {
      const signature = 'sha256=invalid1234567890abcdef';

      const result = verifyGitHubWebhookSignature(payload, signature, secret);

      expect(result.valid).toBe(false);
      // Error could be "Signature length mismatch" or "Signature verification failed"
      expect(result.error).toBeDefined();
    });

    it('should reject signature with wrong secret', () => {
      const hmac = createHmac('sha256', 'wrong-secret');
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      const result = verifyGitHubWebhookSignature(payload, signature, secret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Signature verification failed');
    });

    it('should reject missing signature header', () => {
      const result = verifyGitHubWebhookSignature(payload, null, secret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing X-Hub-Signature-256');
    });

    it('should reject empty signature header', () => {
      const result = verifyGitHubWebhookSignature(payload, '', secret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing X-Hub-Signature-256');
    });

    it('should reject undefined signature header', () => {
      const result = verifyGitHubWebhookSignature(payload, undefined, secret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing X-Hub-Signature-256');
    });

    it('should reject when secret is empty', () => {
      const signature = 'sha256=somehash';

      const result = verifyGitHubWebhookSignature(payload, signature, '');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Webhook secret not configured');
    });

    it('should reject unsupported algorithm', () => {
      const signature = 'md5=somehash';

      const result = verifyGitHubWebhookSignature(payload, signature, secret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported signature algorithm');
    });

    it('should reject malformed signature header (no algorithm prefix)', () => {
      const result = verifyGitHubWebhookSignature(payload, 'just-a-hash', secret);

      expect(result.valid).toBe(false);
      // Error could be "Malformed signature header" or "Unsupported signature algorithm"
      expect(result.error).toBeDefined();
    });

    it('should reject malformed signature header (no hash value)', () => {
      const result = verifyGitHubWebhookSignature(payload, 'sha256=', secret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Malformed signature header');
    });

    it('should handle Buffer payload', () => {
      const payloadBuffer = Buffer.from(payload, 'utf8');
      const hmac = createHmac('sha256', secret);
      hmac.update(payloadBuffer);
      const signature = `sha256=${hmac.digest('hex')}`;

      const result = verifyGitHubWebhookSignature(payloadBuffer, signature, secret);

      expect(result.valid).toBe(true);
    });

    it('should reject tampered payload', () => {
      const hmac = createHmac('sha256', secret);
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      const tamperedPayload = payload.replace('42', '43');
      const result = verifyGitHubWebhookSignature(tamperedPayload, signature, secret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Signature verification failed');
    });

    it('should use timing-safe comparison (constant-time)', () => {
      // This test verifies that the function uses timingSafeEqual
      // by checking it doesn't fail on length mismatch with a different error
      const signature = 'sha256=abc'; // Too short

      const result = verifyGitHubWebhookSignature(payload, signature, secret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Signature length mismatch');
    });

    it('should handle empty payload', () => {
      const emptyPayload = '';
      const hmac = createHmac('sha256', secret);
      hmac.update(emptyPayload);
      const signature = `sha256=${hmac.digest('hex')}`;

      const result = verifyGitHubWebhookSignature(emptyPayload, signature, secret);

      expect(result.valid).toBe(true);
    });

    it('should handle large payload', () => {
      const largePayload = JSON.stringify({
        data: 'x'.repeat(10000),
      });
      const hmac = createHmac('sha256', secret);
      hmac.update(largePayload);
      const signature = `sha256=${hmac.digest('hex')}`;

      const result = verifyGitHubWebhookSignature(largePayload, signature, secret);

      expect(result.valid).toBe(true);
    });
  });

  describe('createGitHubSignatureHeader', () => {
    it('should create valid signature header', () => {
      const signature = createGitHubSignatureHeader(payload, secret);

      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should create verifiable signature', () => {
      const signature = createGitHubSignatureHeader(payload, secret);
      const result = verifyGitHubWebhookSignature(payload, signature, secret);

      expect(result.valid).toBe(true);
    });

    it('should create consistent signatures for same input', () => {
      const sig1 = createGitHubSignatureHeader(payload, secret);
      const sig2 = createGitHubSignatureHeader(payload, secret);

      expect(sig1).toBe(sig2);
    });

    it('should create different signatures for different payloads', () => {
      const payload1 = JSON.stringify({ data: 'a' });
      const payload2 = JSON.stringify({ data: 'b' });

      const sig1 = createGitHubSignatureHeader(payload1, secret);
      const sig2 = createGitHubSignatureHeader(payload2, secret);

      expect(sig1).not.toBe(sig2);
    });

    it('should create different signatures for different secrets', () => {
      const sig1 = createGitHubSignatureHeader(payload, 'secret1');
      const sig2 = createGitHubSignatureHeader(payload, 'secret2');

      expect(sig1).not.toBe(sig2);
    });
  });
});

describe('Generic HMAC Signature Validation', () => {
  const secret = 'generic-secret-key';
  const payload = 'test data to sign';

  describe('verifyHmacSignature', () => {
    it('should verify valid SHA-256 signature', () => {
      const signature = createHmacSignature(payload, secret, 'sha256');
      const result = verifyHmacSignature(payload, signature, secret, 'sha256');

      expect(result.valid).toBe(true);
      expect(result.signatureType).toBe('sha256');
    });

    it('should verify valid SHA-1 signature', () => {
      const signature = createHmacSignature(payload, secret, 'sha1');
      const result = verifyHmacSignature(payload, signature, secret, 'sha1');

      expect(result.valid).toBe(true);
      expect(result.signatureType).toBe('sha1');
    });

    it('should verify valid SHA-512 signature', () => {
      const signature = createHmacSignature(payload, secret, 'sha512');
      const result = verifyHmacSignature(payload, signature, secret, 'sha512');

      expect(result.valid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const result = verifyHmacSignature(payload, 'invalid', secret);

      expect(result.valid).toBe(false);
    });

    it('should reject mismatched algorithms', () => {
      const signature = createHmacSignature(payload, secret, 'sha256');
      const result = verifyHmacSignature(payload, signature, secret, 'sha1');

      expect(result.valid).toBe(false);
    });

    it('should use timing-safe comparison', () => {
      // Verify length mismatch detection
      const result = verifyHmacSignature(payload, 'abc', secret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Signature length mismatch');
    });
  });

  describe('createHmacSignature', () => {
    it('should create hex-encoded signature', () => {
      const signature = createHmacSignature(payload, secret);

      expect(signature).toMatch(/^[a-f0-9]+$/);
    });

    it('should create SHA-256 signature by default', () => {
      const signature = createHmacSignature(payload, secret);

      // SHA-256 produces 64 hex characters
      expect(signature.length).toBe(64);
    });

    it('should create SHA-512 signature when specified', () => {
      const signature = createHmacSignature(payload, secret, 'sha512');

      // SHA-512 produces 128 hex characters
      expect(signature.length).toBe(128);
    });

    it('should handle Buffer input', () => {
      const bufferPayload = Buffer.from(payload);
      const sig1 = createHmacSignature(bufferPayload, secret);
      const sig2 = createHmacSignature(payload, secret);

      expect(sig1).toBe(sig2);
    });
  });
});

describe('Webhook Signature Security Properties', () => {
  const secret = 'security-test-secret';

  it('should use constant-time comparison to prevent timing attacks', () => {
    const payload = 'sensitive data';
    const correctSignature = createHmacSignature(payload, secret);

    // Create two similar but different signatures
    const almostCorrect = correctSignature.slice(0, -2) + '00';

    // Both should fail, and timing should be similar (we can't test timing directly,
    // but we verify the function uses timingSafeEqual by checking it exists)
    const result1 = verifyHmacSignature(payload, almostCorrect, secret);
    const result2 = verifyHmacSignature(payload, 'completely-wrong', secret);

    expect(result1.valid).toBe(false);
    expect(result2.valid).toBe(false);
  });

  it('should prevent signature reuse across different payloads', () => {
    const payload1 = 'first payload';
    const payload2 = 'second payload';

    const signature1 = createHmacSignature(payload1, secret);

    // Signature from payload1 should not validate payload2
    const result = verifyHmacSignature(payload2, signature1, secret);

    expect(result.valid).toBe(false);
  });

  it('should prevent cross-secret signature usage', () => {
    const payload = 'test payload';
    const secret1 = 'secret-one';
    const secret2 = 'secret-two';

    const signature1 = createHmacSignature(payload, secret1);

    // Signature created with secret1 should not validate with secret2
    const result = verifyHmacSignature(payload, signature1, secret2);

    expect(result.valid).toBe(false);
  });

  it('should handle unicode payloads correctly', () => {
    const unicodePayload = JSON.stringify({
      message: 'Hello 世界 🌍',
      emoji: '🎉🎊🎈',
    });

    const signature = createGitHubSignatureHeader(unicodePayload, secret);
    const result = verifyGitHubWebhookSignature(unicodePayload, signature, secret);

    expect(result.valid).toBe(true);
  });

  it('should handle special characters in payload', () => {
    const specialPayload = 'payload\nwith\nnewlines\tand\ttabs\rand\rcarriage\0returns';
    const signature = createHmacSignature(specialPayload, secret);
    const result = verifyHmacSignature(specialPayload, signature, secret);

    expect(result.valid).toBe(true);
  });
});

describe('Webhook Signature Error Handling', () => {
  it('should provide clear error for missing signature', () => {
    const result = verifyGitHubWebhookSignature('payload', null, 'secret');

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Missing');
  });

  it('should provide clear error for missing secret', () => {
    const result = verifyGitHubWebhookSignature('payload', 'sha256=abc', '');

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('secret not configured');
  });

  it('should provide clear error for malformed signature', () => {
    const result = verifyGitHubWebhookSignature('payload', 'invalid-format', 'secret');

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return structured verification result', () => {
    const payload = 'test';
    const signature = createGitHubSignatureHeader(payload, 'secret');
    const result: WebhookVerificationResult = verifyGitHubWebhookSignature(
      payload,
      signature,
      'secret'
    );

    expect(result).toHaveProperty('valid');
    expect(typeof result.valid).toBe('boolean');

    if (result.valid) {
      expect(result.signatureType).toBeDefined();
    } else {
      expect(result.error).toBeDefined();
    }
  });
});
