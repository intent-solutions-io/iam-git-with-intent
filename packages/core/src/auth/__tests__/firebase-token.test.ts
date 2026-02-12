/**
 * Firebase Auth Token Verification Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin/app
const mockGetApps = vi.fn();
const mockGetApp = vi.fn();

vi.mock('firebase-admin/app', () => ({
  getApps: () => mockGetApps(),
  getApp: () => mockGetApp(),
}));

// Mock firebase-admin/auth
const mockVerifyIdToken = vi.fn();
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: mockVerifyIdToken,
  }),
}));

// Mock logger
vi.mock('../../telemetry/index.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { verifyFirebaseToken, FirebaseAuthError } from '../firebase-token.js';

describe('verifyFirebaseToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: SDK is initialized
    mockGetApps.mockReturnValue([{ name: '[DEFAULT]' }]);
    mockGetApp.mockReturnValue({ name: '[DEFAULT]' });
  });

  it('throws on empty token', async () => {
    await expect(verifyFirebaseToken('')).rejects.toThrow(FirebaseAuthError);
    await expect(verifyFirebaseToken('')).rejects.toThrow('ID token is required');
  });

  it('throws when SDK is not initialized', async () => {
    mockGetApps.mockReturnValue([]);

    await expect(verifyFirebaseToken('some-token')).rejects.toThrow(
      'Firebase Admin SDK not initialized',
    );
  });

  it('returns decoded token on successful verification', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'user-123',
      email: 'test@example.com',
      email_verified: true,
      name: 'Test User',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    });

    const result = await verifyFirebaseToken('valid-token', false);

    expect(result.uid).toBe('user-123');
    expect(result.email).toBe('test@example.com');
    expect(result.emailVerified).toBe(true);
    expect(result.displayName).toBe('Test User');
    expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token', false);
  });

  it('throws FirebaseAuthError on expired token', async () => {
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/id-token-expired', message: 'expired' });

    await expect(verifyFirebaseToken('expired-token', false)).rejects.toThrow('token has expired');
  });

  it('throws FirebaseAuthError on revoked token', async () => {
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/id-token-revoked', message: 'revoked' });

    await expect(verifyFirebaseToken('revoked-token', false)).rejects.toThrow('has been revoked');
  });

  it('throws FirebaseAuthError on invalid token format', async () => {
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/argument-error', message: 'bad format' });

    await expect(verifyFirebaseToken('bad-token', false)).rejects.toThrow('Invalid Firebase Auth token format');
  });

  it('wraps unknown errors in FirebaseAuthError', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('network timeout'));

    const error = await verifyFirebaseToken('token', false).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FirebaseAuthError);
    expect((error as FirebaseAuthError).code).toBe('verification_failed');
  });
});
