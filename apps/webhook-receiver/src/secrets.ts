/**
 * Secret Manager Adapter
 *
 * Epic B: Data Ingestion & Connector Framework
 * Task B3.4: Add webhook receiver service
 *
 * Adapts the @gwi/core secret provider for webhook receiver use.
 *
 * @module @gwi/webhook-receiver/secrets
 */

import type { ISecretManager } from './types.js';

/**
 * Environment-based secret manager
 *
 * In production, secrets are accessed via Secret Manager through the
 * @gwi/core provider. In development, falls back to environment variables.
 *
 * Secret naming convention:
 * - Env var: GWI_WEBHOOK_SECRET_GITHUB
 * - Secret Manager: gwi-webhook-secret-github
 */
export class EnvSecretManager implements ISecretManager {
  private readonly cache: Map<string, string> = new Map();

  async getSecret(tenantId: string, secretKey: string): Promise<string | null> {
    // For now, use global secrets (multi-tenant secrets TBD)
    // Cache key includes tenant for future multi-tenant support
    const cacheKey = `${tenantId}:${secretKey}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) || null;
    }

    // Try environment variable
    // Convert webhook-secret-github to GWI_WEBHOOK_SECRET_GITHUB
    const envKey = secretKey.toUpperCase().replace(/-/g, '_');
    const envName = `GWI_${envKey}`;

    const value = process.env[envName] || null;

    if (value) {
      this.cache.set(cacheKey, value);
    }

    return value;
  }

  /**
   * Clear the secret cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * GCP Secret Manager adapter
 *
 * Retrieves secrets from Google Cloud Secret Manager.
 */
export class GCPSecretManager implements ISecretManager {
  private readonly projectId: string;
  private readonly cache: Map<string, string> = new Map();
  private client: unknown | null = null;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  private async getClient(): Promise<unknown> {
    if (!this.client) {
      try {
        // Dynamic import for optional dependency
        const secretManager = await import('@google-cloud/secret-manager' as string);
        const SecretManagerServiceClient = secretManager.SecretManagerServiceClient;
        this.client = new SecretManagerServiceClient();
      } catch {
        throw new Error(
          'GCP Secret Manager client not available. ' +
          'Install @google-cloud/secret-manager or use EnvSecretManager for development.'
        );
      }
    }
    return this.client;
  }

  async getSecret(tenantId: string, secretKey: string): Promise<string | null> {
    // For now, use global secrets (multi-tenant secrets TBD)
    const cacheKey = `${tenantId}:${secretKey}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) || null;
    }

    // Convert webhook-secret-github to gwi-webhook-secret-github
    const secretName = `gwi-${secretKey}`;
    const secretPath = `projects/${this.projectId}/secrets/${secretName}/versions/latest`;

    try {
      const client = await this.getClient() as {
        accessSecretVersion: (request: { name: string }) => Promise<[{ payload?: { data?: Uint8Array | string } }]>;
      };

      const [response] = await client.accessSecretVersion({ name: secretPath });
      const payload = response.payload?.data;

      if (!payload) {
        return null;
      }

      const value = typeof payload === 'string'
        ? payload
        : new TextDecoder().decode(payload);

      this.cache.set(cacheKey, value);
      return value;
    } catch (error) {
      const err = error as { code?: number };
      if (err.code === 5) {
        // NOT_FOUND
        return null;
      }
      throw error;
    }
  }

  /**
   * Clear the secret cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Create appropriate secret manager based on environment
 */
export function createSecretManager(): ISecretManager {
  const projectId = process.env.GCP_PROJECT_ID;
  const isProduction = process.env.DEPLOYMENT_ENV === 'prod';

  if (isProduction && projectId) {
    return new GCPSecretManager(projectId);
  }

  return new EnvSecretManager();
}
