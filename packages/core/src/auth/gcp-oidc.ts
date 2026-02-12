/**
 * GCP OIDC Token Verification
 *
 * Verifies OIDC identity tokens from GCP services:
 * - Pub/Sub push subscriptions (service account OIDC)
 * - Cloud Scheduler (service account OIDC)
 * - Cloud Run service-to-service calls
 *
 * These tokens are JWT tokens signed by Google, with the audience
 * set to the receiving service's URL.
 *
 * @module @gwi/core/auth/gcp-oidc
 */

import { createLogger } from '../telemetry/index.js';

const logger = createLogger('auth:gcp-oidc');

/**
 * Result of verifying a GCP OIDC token
 */
export interface GcpOidcTokenResult {
  /** Service account email that issued the token */
  email: string;
  /** Whether the email is verified */
  emailVerified: boolean;
  /** Token subject (usually the service account unique ID) */
  sub: string;
  /** Token audience (should match the receiving service's URL) */
  aud: string;
  /** Token issuer */
  iss: string;
  /** Token expiration (epoch seconds) */
  exp: number;
  /** Token issued-at (epoch seconds) */
  iat: number;
}

/**
 * Configuration for GCP OIDC token verification
 */
export interface GcpOidcVerifyConfig {
  /** Expected audience (typically the Cloud Run service URL) */
  expectedAudience?: string;
  /** Allowed service account emails (if empty, any valid GCP SA is allowed) */
  allowedServiceAccounts?: string[];
}

// Google's public token info endpoint for OIDC tokens
const GOOGLE_TOKEN_INFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

/**
 * Verify a GCP OIDC identity token
 *
 * Uses Google's tokeninfo endpoint for verification. This is simpler and
 * more reliable than manual JWKS verification, and handles key rotation
 * automatically.
 *
 * @param token - The OIDC Bearer token
 * @param config - Verification configuration
 * @returns Verified token claims
 * @throws GcpOidcError if token is invalid
 */
export async function verifyGcpOidcToken(
  token: string,
  config: GcpOidcVerifyConfig = {},
): Promise<GcpOidcTokenResult> {
  if (!token) {
    throw new GcpOidcError('missing_token', 'OIDC token is required');
  }

  try {
    // Verify token via Google's tokeninfo endpoint (POST to avoid token in URL/logs)
    const response = await fetch(GOOGLE_TOKEN_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `id_token=${encodeURIComponent(token)}`,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new GcpOidcError(
        'verification_failed',
        `Google tokeninfo returned ${response.status}: ${body}`,
      );
    }

    const claims = (await response.json()) as Record<string, string>;

    // Validate required fields
    if (!claims.email || !claims.sub) {
      throw new GcpOidcError('invalid_claims', 'Token missing required claims (email, sub)');
    }

    // Validate audience if configured
    if (config.expectedAudience && claims.aud !== config.expectedAudience) {
      throw new GcpOidcError(
        'invalid_audience',
        `Token audience mismatch. Expected: ${config.expectedAudience}, Got: ${claims.aud}`,
      );
    }

    // Validate service account if configured
    if (config.allowedServiceAccounts?.length) {
      if (!config.allowedServiceAccounts.includes(claims.email)) {
        throw new GcpOidcError(
          'unauthorized_service_account',
          `Service account ${claims.email} not in allowed list`,
        );
      }
    }

    // Validate issuer (must be Google)
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!validIssuers.includes(claims.iss)) {
      throw new GcpOidcError(
        'invalid_issuer',
        `Invalid issuer: ${claims.iss}`,
      );
    }

    // Check expiration
    const exp = parseInt(claims.exp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (exp < now) {
      throw new GcpOidcError('token_expired', 'OIDC token has expired');
    }

    const result: GcpOidcTokenResult = {
      email: claims.email,
      emailVerified: claims.email_verified === 'true',
      sub: claims.sub,
      aud: claims.aud,
      iss: claims.iss,
      exp,
      iat: parseInt(claims.iat, 10),
    };

    logger.debug('GCP OIDC token verified', {
      email: result.email,
      aud: result.aud,
    });

    return result;
  } catch (error) {
    if (error instanceof GcpOidcError) {
      throw error;
    }

    logger.warn('GCP OIDC token verification failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    throw new GcpOidcError(
      'verification_failed',
      `OIDC verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Extract Bearer token from Authorization header
 *
 * @param authHeader - The Authorization header value
 * @returns The token string, or null if not a Bearer token
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim();
}

/**
 * GCP OIDC verification error
 */
export class GcpOidcError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GcpOidcError';
  }
}
