/**
 * Secrets Module Tests
 *
 * Tests for secret validation and plaintext detection.
 * Note: Secret Manager operations require mocking.
 */

import { describe, it, expect } from 'vitest';
import {
  SECRET_INVENTORY,
  isPlaintextSecret,
  validateNoPlaintextSecrets,
} from '../index.js';

// =============================================================================
// Secret Inventory Tests
// =============================================================================

describe('SECRET_INVENTORY', () => {
  it('contains GitHub secrets', () => {
    expect(SECRET_INVENTORY['gwi-github-app-private-key']).toBeDefined();
    expect(SECRET_INVENTORY['gwi-github-webhook-secret']).toBeDefined();
  });

  it('contains AI provider secrets', () => {
    expect(SECRET_INVENTORY['gwi-anthropic-api-key']).toBeDefined();
    expect(SECRET_INVENTORY['gwi-google-ai-api-key']).toBeDefined();
  });

  it('contains Stripe secrets', () => {
    expect(SECRET_INVENTORY['gwi-stripe-secret-key']).toBeDefined();
    expect(SECRET_INVENTORY['gwi-stripe-webhook-secret']).toBeDefined();
  });

  it('specifies consumers for each secret', () => {
    for (const [name, info] of Object.entries(SECRET_INVENTORY)) {
      expect(info.consumers, `${name} should have consumers`).toBeDefined();
      expect(info.consumers.length, `${name} should have at least one consumer`).toBeGreaterThan(0);
    }
  });

  it('specifies rotation days for each secret', () => {
    for (const [name, info] of Object.entries(SECRET_INVENTORY)) {
      expect(info.rotationDays, `${name} should have rotationDays`).toBeDefined();
      expect(info.rotationDays, `${name} rotationDays should be positive`).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Plaintext Secret Detection Tests
// =============================================================================

describe('isPlaintextSecret', () => {
  it('detects OpenAI/Anthropic API keys', () => {
    expect(isPlaintextSecret('sk-abc123def456xyz789012345678901234567890')).toBe(true);
    expect(isPlaintextSecret('sk-ant-api01-abcdef1234567890abcdef1234567890')).toBe(true);
  });

  it('detects Stripe keys', () => {
    expect(isPlaintextSecret('sk_live_abc123def456ghi789jkl012345678')).toBe(true);
    expect(isPlaintextSecret('sk_test_abc123def456ghi789jkl012345678')).toBe(true);
  });

  it('detects GitHub tokens', () => {
    expect(isPlaintextSecret('ghp_1234567890abcdefghijklmnopqrstuvwxyz')).toBe(true);
    expect(isPlaintextSecret('gho_1234567890abcdefghijklmnopqrstuvwxyz')).toBe(true);
    expect(isPlaintextSecret('ghs_1234567890abcdefghijklmnopqrstuvwxyz')).toBe(true);
  });

  it('detects AWS keys', () => {
    expect(isPlaintextSecret('AKIAIOSFODNN7EXAMPLE')).toBe(true);
  });

  it('detects Slack tokens', () => {
    expect(isPlaintextSecret('xoxb-1234567890-0987654321-abcdefghij')).toBe(true);
    expect(isPlaintextSecret('xoxp-1234567890-0987654321-abcdefghij')).toBe(true);
  });

  it('detects private keys', () => {
    expect(isPlaintextSecret('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
    expect(isPlaintextSecret('-----BEGIN OPENSSH PRIVATE KEY-----')).toBe(true);
  });

  it('detects base64-encoded long strings (likely secrets)', () => {
    const longBase64 = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkw';
    expect(isPlaintextSecret(longBase64)).toBe(true);
  });

  it('does not flag normal values', () => {
    expect(isPlaintextSecret('hello-world')).toBe(false);
    expect(isPlaintextSecret('projects/my-project/secrets/my-secret')).toBe(false);
    expect(isPlaintextSecret('some-normal-config-value')).toBe(false);
    expect(isPlaintextSecret('123')).toBe(false);
  });

  it('does not flag Secret Manager references', () => {
    expect(isPlaintextSecret('projects/my-project/secrets/gwi-stripe-key/versions/latest')).toBe(false);
  });
});

describe('validateNoPlaintextSecrets', () => {
  it('returns empty array for clean environment', () => {
    const env = {
      NODE_ENV: 'production',
      PORT: '8080',
      GCP_PROJECT_ID: 'my-project',
    };
    expect(validateNoPlaintextSecrets(env)).toEqual([]);
  });

  it('detects plaintext in ANTHROPIC_API_KEY', () => {
    const env = {
      ANTHROPIC_API_KEY: 'sk-ant-abcdef1234567890abcdef1234567890',
    };
    const violations = validateNoPlaintextSecrets(env);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('ANTHROPIC_API_KEY');
  });

  it('detects plaintext in GITHUB_PRIVATE_KEY', () => {
    const env = {
      GITHUB_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...',
    };
    const violations = validateNoPlaintextSecrets(env);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('GITHUB_PRIVATE_KEY');
  });

  it('detects plaintext in STRIPE_SECRET_KEY', () => {
    const env = {
      STRIPE_SECRET_KEY: 'sk_live_abc123def456ghi789jkl012345678',
    };
    const violations = validateNoPlaintextSecrets(env);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('STRIPE_SECRET_KEY');
  });

  it('detects multiple violations', () => {
    const env = {
      ANTHROPIC_API_KEY: 'sk-ant-abcdef1234567890abcdef1234567890',
      STRIPE_SECRET_KEY: 'sk_live_abc123def456ghi789jkl012345678',
    };
    const violations = validateNoPlaintextSecrets(env);
    expect(violations.length).toBe(2);
  });

  it('ignores undefined values', () => {
    const env: Record<string, string | undefined> = {
      ANTHROPIC_API_KEY: undefined,
      NODE_ENV: 'production',
    };
    expect(validateNoPlaintextSecrets(env)).toEqual([]);
  });

  it('does not flag Secret Manager references', () => {
    const env = {
      ANTHROPIC_API_KEY: 'projects/my-project/secrets/gwi-anthropic-key/versions/latest',
      STRIPE_SECRET_KEY: 'projects/my-project/secrets/gwi-stripe-key',
    };
    expect(validateNoPlaintextSecrets(env)).toEqual([]);
  });
});
