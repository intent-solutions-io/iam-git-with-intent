/**
 * Firebase Auth Token Verification
 *
 * Verifies Firebase Auth ID tokens for end-user authentication.
 * Uses the Firebase Admin SDK which is already initialized by
 * the Firestore client module.
 *
 * @module @gwi/core/auth/firebase-token
 */

import { getApp, getApps } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { createLogger } from '../telemetry/index.js';

const logger = createLogger('auth:firebase');

/**
 * Result of verifying a Firebase Auth ID token
 */
export interface FirebaseTokenResult {
  /** Firebase Auth UID */
  uid: string;
  /** User's email (if available) */
  email?: string;
  /** Whether the email is verified */
  emailVerified?: boolean;
  /** User's display name */
  displayName?: string;
  /** Token expiration (epoch seconds) */
  exp: number;
  /** Token issued-at (epoch seconds) */
  iat: number;
  /** Full decoded token (for advanced use) */
  decodedToken: DecodedIdToken;
}

/**
 * Verify a Firebase Auth ID token
 *
 * Requires Firebase Admin SDK to be initialized (happens automatically
 * when getFirestoreClient() is called, or when any Firestore store is used).
 *
 * @param idToken - The Firebase Auth ID token from the client
 * @param checkRevoked - Whether to check if the token has been revoked (default: true in production)
 * @returns Decoded token result
 * @throws Error if token is invalid, expired, or revoked
 */
export async function verifyFirebaseToken(
  idToken: string,
  checkRevoked = isProductionEnv(),
): Promise<FirebaseTokenResult> {
  if (!idToken) {
    throw new FirebaseAuthError('missing_token', 'ID token is required');
  }

  // Ensure Firebase Admin SDK is initialized
  const apps = getApps();
  if (apps.length === 0) {
    throw new FirebaseAuthError(
      'sdk_not_initialized',
      'Firebase Admin SDK not initialized. Ensure GCP_PROJECT_ID is set and Firestore is configured.',
    );
  }

  const auth = getAuth(getApp());

  try {
    const decoded = await auth.verifyIdToken(idToken, checkRevoked);

    return {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified,
      displayName: decoded.name as string | undefined,
      exp: decoded.exp,
      iat: decoded.iat,
      decodedToken: decoded,
    };
  } catch (error) {
    const err = error as { code?: string; message?: string };

    // Map Firebase error codes to meaningful messages
    if (err.code === 'auth/id-token-expired') {
      throw new FirebaseAuthError('token_expired', 'Firebase Auth token has expired');
    }
    if (err.code === 'auth/id-token-revoked') {
      throw new FirebaseAuthError('token_revoked', 'Firebase Auth token has been revoked');
    }
    if (err.code === 'auth/argument-error') {
      throw new FirebaseAuthError('invalid_token', 'Invalid Firebase Auth token format');
    }

    logger.warn('Firebase token verification failed', {
      errorCode: err.code,
      errorMessage: err.message,
    });

    throw new FirebaseAuthError(
      'verification_failed',
      `Token verification failed: ${err.message ?? 'Unknown error'}`,
    );
  }
}

/**
 * Firebase Auth error with structured error code
 */
export class FirebaseAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FirebaseAuthError';
  }
}

function isProductionEnv(): boolean {
  const env = process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || 'production';
  return env !== 'dev' && env !== 'local' && env !== 'development' && env !== 'test';
}
