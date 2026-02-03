import {
  IAuthStrategy,
  AuthConfig,
  ServiceAccountAuthConfig,
  AuthResult,
  AuthState,
  ServiceAccountAuthConfigSchema
} from './IAuthStrategy.js';
import { AuthenticationError } from '../errors/index.js';
import { ISecretManager } from '../secrets/ISecretManager.js';
import type { ILogger } from '../core/base-connector.js';
import { JWT } from 'google-auth-library';

/**
 * Service Account authentication strategy
 *
 * Used by: Vertex AI, Google Calendar, Gmail (13% of connectors)
 *
 * Features:
 * - GCP service account authentication
 * - Automatic token generation and refresh
 * - Domain-wide delegation support
 * - Secure storage in GCP Secret Manager
 * - Audit logging for all auth events
 */
export class ServiceAccountAuth implements IAuthStrategy {
  readonly name = 'service_account';

  private jwtClient?: JWT;
  private accessToken?: string;
  private expiresAt?: Date;
  private serviceAccountEmail?: string;

  constructor(
    private readonly secretManager: ISecretManager,
    private readonly logger: ILogger,
    private readonly tenantId: string
  ) {}

  async authenticate(config: AuthConfig): Promise<AuthResult> {
    // Validate config
    const validated = ServiceAccountAuthConfigSchema.parse(config) as ServiceAccountAuthConfig;

    try {
      // Create JWT client
      this.jwtClient = new JWT({
        email: validated.serviceAccountEmail,
        key: validated.privateKey,
        scopes: validated.scopes,
        subject: validated.subject
      });

      // Get access token
      const credentials = await this.jwtClient.getAccessToken();

      if (!credentials.token) {
        throw new Error('No access token returned');
      }

      this.accessToken = credentials.token;
      this.serviceAccountEmail = validated.serviceAccountEmail;

      // Set expiration (typically 1 hour for GCP service accounts)
      this.expiresAt = new Date(Date.now() + 3600 * 1000);

      // Store in Secret Manager
      await this.secretManager.setSecret(
        this.tenantId,
        'service-account-token',
        this.accessToken
      );

      this.logger.info('Service account authentication succeeded', {
        tenantId: this.tenantId,
        serviceAccountEmail: validated.serviceAccountEmail,
        expiresAt: this.expiresAt.toISOString()
      });

      return {
        success: true,
        token: this.accessToken,
        tokenType: 'Bearer',
        expiresAt: this.expiresAt.toISOString(),
        scopes: validated.scopes,
        metadata: {
          serviceAccountEmail: validated.serviceAccountEmail
        }
      };
    } catch (error) {
      this.logger.error('Service account authentication failed', {
        tenantId: this.tenantId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new AuthenticationError(
        `Service account authentication failed: ${error instanceof Error ? error.message : String(error)}`,
        this.name
      );
    }
  }

  async refreshIfNeeded(): Promise<void> {
    if (!this.isExpired()) {
      return; // Token still valid
    }

    if (!this.jwtClient) {
      throw new AuthenticationError('Not authenticated', this.name);
    }

    this.logger.info('Refreshing service account token', {
      tenantId: this.tenantId
    });

    const credentials = await this.jwtClient.getAccessToken();

    if (!credentials.token) {
      throw new Error('No access token returned');
    }

    this.accessToken = credentials.token;
    this.expiresAt = new Date(Date.now() + 3600 * 1000);

    // Update Secret Manager
    await this.secretManager.setSecret(
      this.tenantId,
      'service-account-token',
      this.accessToken
    );

    this.logger.info('Service account token refresh succeeded', {
      tenantId: this.tenantId,
      expiresAt: this.expiresAt.toISOString()
    });
  }

  getHeaders(): Record<string, string> {
    if (!this.accessToken) {
      throw new AuthenticationError('Not authenticated', this.name);
    }

    return {
      'Authorization': `Bearer ${this.accessToken}`
    };
  }

  isExpired(): boolean {
    if (!this.expiresAt) {
      return false;
    }

    // Refresh 5 minutes before expiry
    const bufferMs = 5 * 60 * 1000;
    return Date.now() >= this.expiresAt.getTime() - bufferMs;
  }

  async revoke(): Promise<void> {
    // Delete from Secret Manager
    await this.secretManager.deleteSecret(this.tenantId, 'service-account-token');

    // Clear cached data
    this.accessToken = undefined;
    this.expiresAt = undefined;
    this.jwtClient = undefined;

    this.logger.info('Service account token revoked', {
      tenantId: this.tenantId
    });
  }

  getState(): AuthState {
    return {
      strategy: this.name,
      token: this.accessToken,
      expiresAt: this.expiresAt?.toISOString(),
      metadata: {
        serviceAccountEmail: this.serviceAccountEmail
      }
    };
  }

  setState(state: AuthState): void {
    if (state.strategy !== this.name) {
      throw new Error(`Invalid state (expected ${this.name}, got ${state.strategy})`);
    }

    this.accessToken = state.token;
    this.expiresAt = state.expiresAt ? new Date(state.expiresAt) : undefined;
    this.serviceAccountEmail = state.metadata?.serviceAccountEmail;
    // Note: JWT client must be recreated via authenticate()
  }
}
