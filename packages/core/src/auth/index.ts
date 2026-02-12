/**
 * Authentication & Token Verification
 *
 * Provides token verification for:
 * - Firebase Auth (end-user authentication)
 * - GCP OIDC (service-to-service authentication)
 *
 * @module @gwi/core/auth
 */

// Firebase Auth token verification
export {
  type FirebaseTokenResult,
  verifyFirebaseToken,
  FirebaseAuthError,
} from './firebase-token.js';

// GCP OIDC token verification (Pub/Sub, Cloud Scheduler, Cloud Run)
export {
  type GcpOidcTokenResult,
  type GcpOidcVerifyConfig,
  verifyGcpOidcToken,
  extractBearerToken,
  GcpOidcError,
} from './gcp-oidc.js';
