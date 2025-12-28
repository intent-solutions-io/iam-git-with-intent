import { z } from 'zod';

/**
 * IAuthStrategy defines the contract for all authentication methods.
 *
 * Implementations must:
 * - Validate credentials
 * - Manage token lifecycle (refresh, expiration)
 * - Provide headers for HTTP requests
 * - Handle authentication errors
 */
export interface IAuthStrategy {
  /**
   * Strategy name (for logging and debugging)
   */
  readonly name: string;

  /**
   * Authenticate with the provided configuration.
   *
   * @param config - Authentication configuration
   * @throws {AuthenticationError} If authentication fails
   * @returns Promise resolving to authentication result
   */
  authenticate(config: AuthConfig): Promise<AuthResult>;

  /**
   * Refresh credentials if needed.
   *
   * Called automatically before each API request.
   * No-op for non-expiring tokens (Bearer).
   *
   * @throws {AuthenticationError} If refresh fails
   */
  refreshIfNeeded(): Promise<void>;

  /**
   * Get HTTP headers for authenticated requests.
   *
   * @returns Headers to include in API requests
   */
  getHeaders(): Record<string, string>;

  /**
   * Check if credentials are expired.
   *
   * @returns True if credentials need refresh
   */
  isExpired(): boolean;

  /**
   * Revoke credentials (logout).
   *
   * @throws {AuthenticationError} If revocation fails
   */
  revoke(): Promise<void>;

  /**
   * Get current authentication state.
   *
   * @returns Current auth state (for persistence)
   */
  getState(): AuthState;

  /**
   * Restore authentication from saved state.
   *
   * @param state - Saved auth state
   */
  setState(state: AuthState): void;
}

/**
 * Bearer token authentication configuration
 */
export interface BearerTokenAuthConfig {
  type: 'bearer';
  token: string;
  /**
   * Optional token metadata (scopes, user, etc.)
   */
  metadata?: Record<string, any>;
}

/**
 * OAuth 2.0 authentication configuration
 */
export interface OAuth2AuthConfig {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /**
   * OAuth 2.0 scopes
   */
  scopes: string[];
  /**
   * Authorization code (for initial token exchange)
   */
  authorizationCode?: string;
  /**
   * Refresh token (for subsequent refreshes)
   */
  refreshToken?: string;
  /**
   * Access token (if already authenticated)
   */
  accessToken?: string;
  /**
   * Token expiration time
   */
  expiresAt?: string;
  /**
   * OAuth provider URLs
   */
  authUrl?: string;
  tokenUrl?: string;
}

/**
 * Service account authentication configuration
 */
export interface ServiceAccountAuthConfig {
  type: 'service_account';
  /**
   * Service account email
   */
  serviceAccountEmail: string;
  /**
   * Service account private key (PEM format)
   */
  privateKey: string;
  /**
   * GCP project ID
   */
  projectId: string;
  /**
   * Scopes to request
   */
  scopes: string[];
  /**
   * Subject (for domain-wide delegation)
   */
  subject?: string;
}

/**
 * Authentication configuration (discriminated union)
 */
export type AuthConfig =
  | BearerTokenAuthConfig
  | OAuth2AuthConfig
  | ServiceAccountAuthConfig;

/**
 * Result of authentication attempt
 */
export interface AuthResult {
  /**
   * Whether authentication succeeded
   */
  success: boolean;
  /**
   * Access token
   */
  token?: string;
  /**
   * Token type (e.g., 'Bearer')
   */
  tokenType?: string;
  /**
   * Token expiration time (ISO 8601)
   */
  expiresAt?: string;
  /**
   * Refresh token (for OAuth 2.0)
   */
  refreshToken?: string;
  /**
   * Granted scopes
   */
  scopes?: string[];
  /**
   * Error message (if failed)
   */
  error?: string;
  /**
   * Additional metadata (user info, etc.)
   */
  metadata?: Record<string, any>;
}

/**
 * Serializable authentication state (for persistence)
 */
export interface AuthState {
  /**
   * Strategy name
   */
  strategy: string;
  /**
   * Access token
   */
  token?: string;
  /**
   * Token expiration time
   */
  expiresAt?: string;
  /**
   * Refresh token
   */
  refreshToken?: string;
  /**
   * Last refresh time
   */
  lastRefreshedAt?: string;
  /**
   * Additional state data
   */
  metadata?: Record<string, any>;
}

// Zod schemas for validation
export const BearerTokenAuthConfigSchema = z.object({
  type: z.literal('bearer'),
  token: z.string().min(1),
  metadata: z.record(z.any()).optional()
});

export const OAuth2AuthConfigSchema = z.object({
  type: z.literal('oauth2'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  scopes: z.array(z.string()),
  authorizationCode: z.string().optional(),
  refreshToken: z.string().optional(),
  accessToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  authUrl: z.string().url().optional(),
  tokenUrl: z.string().url().optional()
});

export const ServiceAccountAuthConfigSchema = z.object({
  type: z.literal('service_account'),
  serviceAccountEmail: z.string().email(),
  privateKey: z.string().min(1),
  projectId: z.string().min(1),
  scopes: z.array(z.string()),
  subject: z.string().optional()
});

export const AuthConfigSchema = z.discriminatedUnion('type', [
  BearerTokenAuthConfigSchema,
  OAuth2AuthConfigSchema,
  ServiceAccountAuthConfigSchema
]);

export const AuthResultSchema = z.object({
  success: z.boolean(),
  token: z.string().optional(),
  tokenType: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  refreshToken: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  error: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export const AuthStateSchema = z.object({
  strategy: z.string(),
  token: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  refreshToken: z.string().optional(),
  lastRefreshedAt: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional()
});
