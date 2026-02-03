import {
  IAuthStrategy,
  AuthConfig,
  BearerTokenAuthConfig,
  AuthResult,
  AuthState,
  BearerTokenAuthConfigSchema
} from './IAuthStrategy.js';
import { AuthenticationError } from '../errors/index.js';
import { ISecretManager } from '../secrets/ISecretManager.js';
import type { ILogger } from '../core/base-connector.js';

/**
 * Bearer Token authentication strategy
 *
 * Used by: GitHub (PAT), GitLab, Linear, Jira, and 73% of connectors
 *
 * Features:
 * - Simple token-based auth
 * - No token expiration (static tokens)
 * - Secure storage in GCP Secret Manager
 * - Audit logging for all auth events
 */
export class BearerTokenAuth implements IAuthStrategy {
  readonly name = 'bearer';

  private token?: string;
  private metadata?: Record<string, any>;

  constructor(
    private readonly secretManager: ISecretManager,
    private readonly logger: ILogger,
    private readonly tenantId: string
  ) {}

  async authenticate(config: AuthConfig): Promise<AuthResult> {
    // Validate config
    const validated = BearerTokenAuthConfigSchema.parse(config) as BearerTokenAuthConfig;

    try {
      // Store token in Secret Manager
      await this.secretManager.setSecret(
        this.tenantId,
        'bearer-token',
        validated.token
      );

      // Cache token in memory
      this.token = validated.token;
      this.metadata = validated.metadata;

      this.logger.info('Bearer token authentication succeeded', {
        tenantId: this.tenantId,
        strategy: this.name
      });

      return {
        success: true,
        token: validated.token,
        tokenType: 'Bearer',
        metadata: validated.metadata
      };
    } catch (error) {
      this.logger.error('Bearer token authentication failed', {
        tenantId: this.tenantId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new AuthenticationError(
        `Bearer token authentication failed: ${error instanceof Error ? error.message : String(error)}`,
        this.name
      );
    }
  }

  async refreshIfNeeded(): Promise<void> {
    // Bearer tokens don't expire (no-op)
    // Subclasses can override if needed
  }

  getHeaders(): Record<string, string> {
    if (!this.token) {
      throw new AuthenticationError('Not authenticated', this.name);
    }

    return {
      'Authorization': `Bearer ${this.token}`
    };
  }

  isExpired(): boolean {
    // Bearer tokens don't expire
    return false;
  }

  async revoke(): Promise<void> {
    // Delete token from Secret Manager
    await this.secretManager.deleteSecret(this.tenantId, 'bearer-token');

    // Clear cached token
    this.token = undefined;
    this.metadata = undefined;

    this.logger.info('Bearer token revoked', {
      tenantId: this.tenantId,
      strategy: this.name
    });
  }

  getState(): AuthState {
    return {
      strategy: this.name,
      token: this.token,
      metadata: this.metadata
    };
  }

  setState(state: AuthState): void {
    if (state.strategy !== this.name) {
      throw new Error(`Invalid state (expected ${this.name}, got ${state.strategy})`);
    }

    this.token = state.token;
    this.metadata = state.metadata;
  }
}
