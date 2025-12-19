/**
 * GCS Artifact Store Tests
 *
 * Tests for secret detection, integrity hashing, and artifact path generation.
 * Note: GCS operations require mocking in unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  detectSecrets,
  validateNoSecrets,
  computeHash,
  verifyHash,
  GcsArtifactStore,
} from '../gcs-artifact-store.js';

// =============================================================================
// Secret Detection Tests
// =============================================================================

describe('detectSecrets', () => {
  it('detects OpenAI/Anthropic API keys', () => {
    const content = 'const apiKey = "sk-abc123def456xyz789012345678901234567890";';
    const secrets = detectSecrets(content);
    expect(secrets.length).toBeGreaterThan(0);
    expect(secrets[0].redacted).toContain('***');
  });

  it('detects GitHub personal access tokens', () => {
    const content = 'GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz';
    const secrets = detectSecrets(content);
    expect(secrets.length).toBeGreaterThan(0);
    expect(secrets[0].redacted).toMatch(/^ghp_.*\*\*\*.*wxyz$/);
  });

  it('detects AWS access keys', () => {
    const content = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
    const secrets = detectSecrets(content);
    expect(secrets.length).toBeGreaterThan(0);
  });

  it('detects private keys', () => {
    const content = `
-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy
-----END RSA PRIVATE KEY-----
    `;
    const secrets = detectSecrets(content);
    expect(secrets.length).toBeGreaterThan(0);
  });

  it('detects Stripe keys', () => {
    const content = 'stripe_key = "sk_live_abc123def456ghi789jkl012345"';
    const secrets = detectSecrets(content);
    expect(secrets.length).toBeGreaterThan(0);
  });

  it('detects Slack tokens', () => {
    const content = 'SLACK_TOKEN=xoxb-1234567890-0987654321-abcdefghij';
    const secrets = detectSecrets(content);
    expect(secrets.length).toBeGreaterThan(0);
  });

  it('detects generic password patterns', () => {
    const content = 'password: "mysupersecretpassword123"';
    const secrets = detectSecrets(content);
    expect(secrets.length).toBeGreaterThan(0);
  });

  it('detects JWT tokens', () => {
    const content = 'token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"';
    const secrets = detectSecrets(content);
    expect(secrets.length).toBeGreaterThan(0);
  });

  it('returns empty array for clean content', () => {
    const content = `
{
  "runId": "abc-123",
  "status": "completed",
  "message": "All tests passed successfully"
}
    `;
    const secrets = detectSecrets(content);
    expect(secrets).toEqual([]);
  });

  it('returns empty array for code without secrets', () => {
    const content = `
function processData(data) {
  const result = data.map(item => item.value);
  return result.filter(v => v > 0);
}
    `;
    const secrets = detectSecrets(content);
    expect(secrets).toEqual([]);
  });

  it('provides line numbers for detected secrets', () => {
    const content = `line 1
line 2
api_key = "sk-abc123def456xyz789012345678901234567890"
line 4`;
    const secrets = detectSecrets(content);
    expect(secrets.length).toBeGreaterThan(0);
    expect(secrets[0].line).toBe(3);
  });
});

describe('validateNoSecrets', () => {
  it('throws error when secrets are detected', () => {
    const content = 'ANTHROPIC_API_KEY=sk-ant-abcdef1234567890123456789012345678901234';
    expect(() => validateNoSecrets(content)).toThrow('potential secret');
  });

  it('does not throw for clean content', () => {
    const content = '{"status": "ok", "count": 42}';
    expect(() => validateNoSecrets(content)).not.toThrow();
  });

  it('includes count of detected secrets in error message', () => {
    const content = `
      api_key = "sk-abc123def456xyz789012345678901234567890"
      password = "verysecretpassword123"
    `;
    expect(() => validateNoSecrets(content)).toThrow(/\d+ potential secret/);
  });
});

// =============================================================================
// Integrity Hash Tests
// =============================================================================

describe('computeHash', () => {
  it('computes SHA256 hash for string content', () => {
    const content = 'Hello, World!';
    const hash = computeHash(content);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('computes consistent hash for same content', () => {
    const content = 'test content';
    const hash1 = computeHash(content);
    const hash2 = computeHash(content);
    expect(hash1).toBe(hash2);
  });

  it('computes different hash for different content', () => {
    const hash1 = computeHash('content 1');
    const hash2 = computeHash('content 2');
    expect(hash1).not.toBe(hash2);
  });

  it('handles empty string', () => {
    const hash = computeHash('');
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    // SHA256 of empty string is well-known
    expect(hash).toBe('sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('handles Buffer input', () => {
    const buffer = Buffer.from('test data', 'utf-8');
    const hash = computeHash(buffer);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('produces same hash for string and equivalent Buffer', () => {
    const content = 'test data';
    const buffer = Buffer.from(content, 'utf-8');
    expect(computeHash(content)).toBe(computeHash(buffer));
  });
});

describe('verifyHash', () => {
  it('returns true for matching hash', () => {
    const content = 'test content';
    const hash = computeHash(content);
    expect(verifyHash(content, hash)).toBe(true);
  });

  it('returns false for non-matching hash', () => {
    const content = 'test content';
    const wrongHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
    expect(verifyHash(content, wrongHash)).toBe(false);
  });

  it('returns false for modified content', () => {
    const original = 'original content';
    const hash = computeHash(original);
    const modified = 'modified content';
    expect(verifyHash(modified, hash)).toBe(false);
  });
});

// =============================================================================
// Artifact Path Tests
// =============================================================================

describe('GcsArtifactStore.getArtifactPath', () => {
  it('constructs correct path with tenant isolation', () => {
    // We can test the static path generation without GCS connection
    const config = { bucketName: 'test-bucket' };
    const store = new GcsArtifactStore(config);

    const path = store.getArtifactPath('tenant-123', 'repo-456', 'run-789', 'triage.json');
    expect(path).toBe('tenant-123/repo-456/run-789/triage.json');
  });

  it('handles special characters in IDs', () => {
    const config = { bucketName: 'test-bucket' };
    const store = new GcsArtifactStore(config);

    const path = store.getArtifactPath('tenant_abc', 'my-repo', 'run_001', 'audit.log');
    expect(path).toBe('tenant_abc/my-repo/run_001/audit.log');
  });
});
