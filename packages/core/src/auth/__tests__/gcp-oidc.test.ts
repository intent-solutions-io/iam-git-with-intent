/**
 * GCP OIDC Token Verification Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../telemetry/index.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { verifyGcpOidcToken, extractBearerToken, GcpOidcError } from '../gcp-oidc.js';

describe('extractBearerToken', () => {
  it('extracts token from valid Bearer header', () => {
    expect(extractBearerToken('Bearer my-token-123')).toBe('my-token-123');
  });

  it('returns null for missing header', () => {
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it('returns null for non-Bearer header', () => {
    expect(extractBearerToken('Basic abc123')).toBeNull();
  });

  it('trims whitespace from token', () => {
    expect(extractBearerToken('Bearer  my-token  ')).toBe('my-token');
  });
});

describe('verifyGcpOidcToken', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('throws on empty token', async () => {
    await expect(verifyGcpOidcToken('')).rejects.toThrow(GcpOidcError);
    await expect(verifyGcpOidcToken('')).rejects.toThrow('OIDC token is required');
  });

  it('returns claims on valid token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const mockClaims = {
      email: 'worker@project.iam.gserviceaccount.com',
      email_verified: 'true',
      sub: '123456789',
      aud: 'https://worker-abc.run.app',
      iss: 'https://accounts.google.com',
      exp: String(now + 3600),
      iat: String(now),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockClaims),
    });

    const result = await verifyGcpOidcToken('valid-token');

    expect(result.email).toBe('worker@project.iam.gserviceaccount.com');
    expect(result.emailVerified).toBe(true);
    expect(result.sub).toBe('123456789');
    expect(result.aud).toBe('https://worker-abc.run.app');
  });

  it('rejects expired tokens', async () => {
    const pastTime = Math.floor(Date.now() / 1000) - 3600;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        email: 'sa@project.iam.gserviceaccount.com',
        sub: '123',
        aud: 'https://worker.run.app',
        iss: 'https://accounts.google.com',
        exp: String(pastTime),
        iat: String(pastTime - 3600),
      }),
    });

    await expect(verifyGcpOidcToken('expired-token')).rejects.toThrow('expired');
  });

  it('rejects tokens with wrong audience', async () => {
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        email: 'sa@project.iam.gserviceaccount.com',
        sub: '123',
        aud: 'https://other-service.run.app',
        iss: 'https://accounts.google.com',
        exp: String(now + 3600),
        iat: String(now),
      }),
    });

    await expect(
      verifyGcpOidcToken('token', { expectedAudience: 'https://worker.run.app' }),
    ).rejects.toThrow('audience mismatch');
  });

  it('rejects tokens from unauthorized service accounts', async () => {
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        email: 'attacker@evil-project.iam.gserviceaccount.com',
        sub: '999',
        aud: 'https://worker.run.app',
        iss: 'https://accounts.google.com',
        exp: String(now + 3600),
        iat: String(now),
      }),
    });

    await expect(
      verifyGcpOidcToken('token', {
        allowedServiceAccounts: ['worker@project.iam.gserviceaccount.com'],
      }),
    ).rejects.toThrow('not in allowed list');
  });

  it('rejects tokens with invalid issuer', async () => {
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        email: 'sa@project.iam.gserviceaccount.com',
        sub: '123',
        aud: 'https://worker.run.app',
        iss: 'https://evil-issuer.com',
        exp: String(now + 3600),
        iat: String(now),
      }),
    });

    await expect(verifyGcpOidcToken('token')).rejects.toThrow('Invalid issuer');
  });

  it('handles Google tokeninfo API errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Invalid Value'),
    });

    await expect(verifyGcpOidcToken('bad-token')).rejects.toThrow('verification_failed');
  });

  it('handles network errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(verifyGcpOidcToken('token')).rejects.toThrow('ECONNREFUSED');
  });

  it('rejects tokens with non-numeric exp/iat (NaN bypass prevention)', async () => {
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        email: 'sa@project.iam.gserviceaccount.com',
        sub: '123',
        aud: 'https://worker.run.app',
        iss: 'https://accounts.google.com',
        exp: 'not-a-number',
        iat: String(now),
      }),
    });

    await expect(verifyGcpOidcToken('token')).rejects.toThrow('non-numeric exp or iat');
  });

  it('handles fetch timeout (AbortError)', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    await expect(verifyGcpOidcToken('token')).rejects.toThrow('timed out');
  });
});
