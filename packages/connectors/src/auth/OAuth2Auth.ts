import {
  IAuthStrategy,
  AuthConfig,
  OAuth2AuthConfig,
  AuthResult,
  AuthState,
  OAuth2AuthConfigSchema
} from './IAuthStrategy.js';
import { AuthenticationError } from '../errors/index.js';
import { ISecretManager } from '../secrets/ISecretManager.js';
import { ILogger } from '../observability/ILogger.js';
import axios from 'axios';

/**
 * OAuth 2.0 authentication strategy
 *
 * Used by: Slack, Discord, GitHub Apps (13% of connectors)
 *
 * Features:
 * - Authorization code flow
 * - Automatic token refresh
 * - Token expiration tracking
 * - Secure storage in GCP Secret Manager
 * - Audit logging for all auth events
 */
export class OAuth2Auth implements IAuthStrategy {
  readonly name = 'oauth2';

  private accessToken?: string;
  private refreshToken?: string;
  private expiresAt?: Date;
  private scopes: string[] = [];
  private config?: OAuth2AuthConfig;

  // Token refresh buffer (refresh 5 minutes before expiry)
  private readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;

  constructor(
    private readonly secretManager: ISecretManager,
    private readonly logger: ILogger,
    private readonly tenantId: string
  ) {}

  async authenticate(config: AuthConfig): Promise<AuthResult> {
    // Validate config
    const validated = OAuth2AuthConfigSchema.parse(config) as OAuth2AuthConfig;
    this.config = validated;

    try {
      // Exchange authorization code for tokens (if provided)
      if (validated.authorizationCode) {
        return await this.exchangeCode(validated);
      }

      // Use existing access token (if provided)
      if (validated.accessToken) {
        this.accessToken = validated.accessToken;
        this.refreshToken = validated.refreshToken;
        this.expiresAt = validated.expiresAt ? new Date(validated.expiresAt) : undefined;
        this.scopes = validated.scopes;

        // Refresh if expired
        await this.refreshIfNeeded();

        return {
          success: true,
          token: this.accessToken,
          tokenType: 'Bearer',
          expiresAt: this.expiresAt?.toISOString(),
          refreshToken: this.refreshToken,
          scopes: this.scopes
        };
      }

      throw new AuthenticationError(
        'OAuth2 authentication requires authorizationCode or accessToken',
        this.name
      );
    } catch (error) {
      this.logger.error('OAuth2 authentication failed', {
        tenantId: this.tenantId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new AuthenticationError(
        `OAuth2 authentication failed: ${error instanceof Error ? error.message : String(error)}`,
        this.name
      );
    }
  }

  private async exchangeCode(config: OAuth2AuthConfig): Promise<AuthResult> {
    const tokenUrl = config.tokenUrl || this.getDefaultTokenUrl(config);

    this.logger.info('Exchanging authorization code for tokens', {
      tenantId: this.tenantId,
      tokenUrl
    });

    const response = await axios.post(tokenUrl, {
      grant_type: 'authorization_code',
      code: config.authorizationCode,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, refresh_token, expires_in, scope } = response.data;

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000);

    // Store tokens in Secret Manager
    await this.secretManager.setSecret(
      this.tenantId,
      'oauth2-access-token',
      access_token
    );

    if (refresh_token) {
      await this.secretManager.setSecret(
        this.tenantId,
        'oauth2-refresh-token',
        refresh_token
      );
    }

    // Cache tokens
    this.accessToken = access_token;
    this.refreshToken = refresh_token;
    this.expiresAt = expiresAt;
    this.scopes = scope ? scope.split(' ') : config.scopes;

    this.logger.info('OAuth2 token exchange succeeded', {
      tenantId: this.tenantId,
      expiresAt: expiresAt.toISOString(),
      scopes: this.scopes
    });

    return {
      success: true,
      token: access_token,
      tokenType: 'Bearer',
      expiresAt: expiresAt.toISOString(),
      refreshToken: refresh_token,
      scopes: this.scopes
    };
  }

  async refreshIfNeeded(): Promise<void> {
    if (!this.isExpired()) {
      return; // Token still valid
    }

    if (!this.refreshToken) {
      throw new AuthenticationError(
        'Cannot refresh token (no refresh token available)',
        this.name
      );
    }

    this.logger.info('Refreshing OAuth2 access token', {
      tenantId: this.tenantId
    });

    const tokenUrl = this.config?.tokenUrl || this.getDefaultTokenUrl(this.config!);

    const response = await axios.post(tokenUrl, {
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
      client_id: this.config!.clientId,
      client_secret: this.config!.clientSecret
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, refresh_token, expires_in } = response.data;

    // Update tokens
    this.accessToken = access_token;
    if (refresh_token) {
      this.refreshToken = refresh_token;
    }
    this.expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000);

    // Update Secret Manager
    await this.secretManager.setSecret(
      this.tenantId,
      'oauth2-access-token',
      access_token
    );

    if (refresh_token) {
      await this.secretManager.setSecret(
        this.tenantId,
        'oauth2-refresh-token',
        refresh_token
      );
    }

    this.logger.info('OAuth2 token refresh succeeded', {
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
      return false; // No expiration set
    }

    // Check if token expires within buffer window
    return Date.now() >= this.expiresAt.getTime() - this.REFRESH_BUFFER_MS;
  }

  async revoke(): Promise<void> {
    // Revoke tokens (OAuth provider-specific)
    // For simplicity, just delete from Secret Manager
    await this.secretManager.deleteSecret(this.tenantId, 'oauth2-access-token');
    await this.secretManager.deleteSecret(this.tenantId, 'oauth2-refresh-token');

    // Clear cached tokens
    this.accessToken = undefined;
    this.refreshToken = undefined;
    this.expiresAt = undefined;

    this.logger.info('OAuth2 tokens revoked', {
      tenantId: this.tenantId
    });
  }

  getState(): AuthState {
    return {
      strategy: this.name,
      token: this.accessToken,
      expiresAt: this.expiresAt?.toISOString(),
      refreshToken: this.refreshToken,
      metadata: { scopes: this.scopes }
    };
  }

  setState(state: AuthState): void {
    if (state.strategy !== this.name) {
      throw new Error(`Invalid state (expected ${this.name}, got ${state.strategy})`);
    }

    this.accessToken = state.token;
    this.refreshToken = state.refreshToken;
    this.expiresAt = state.expiresAt ? new Date(state.expiresAt) : undefined;
    this.scopes = state.metadata?.scopes || [];
  }

  private getDefaultTokenUrl(_config: OAuth2AuthConfig): string {
    // Provider-specific defaults
    // In production, this should be configured per connector
    throw new Error('Token URL must be provided in config');
  }
}
