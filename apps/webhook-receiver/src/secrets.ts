/**
 * Secret Manager Adapter
 *
 * Epic B: Data Ingestion & Connector Framework
 * Task B3.4: Add webhook receiver service
 *
 * Adapts the @gwi/connectors secret manager for webhook receiver use.
 * Uses @gwi/connectors implementation instead of duplicating code.
 *
 * @module @gwi/webhook-receiver/secrets
 */

import {
  GCPSecretManager as ConnectorsSecretManager,
  type ISecretManager as ConnectorsISecretManager,
} from '@gwi/connectors';
import type { ISecretManager } from './types.js';

/**
 * Environment-based secret manager for development
 *
 * Secret naming convention:
 * - Env var: GWI_WEBHOOK_SECRET_GITHUB
 * - Key: webhook-secret-github
 */
export class EnvSecretManager implements ISecretManager {
  private readonly cache: Map<string, string> = new Map();

  async getSecret(tenantId: string, secretKey: string): Promise<string | null> {
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
 * Wraps @gwi/connectors GCPSecretManager to return null instead of throwing
 * when a secret is not found.
 */
export class GCPSecretManager implements ISecretManager {
  private readonly connectorManager: ConnectorsISecretManager;
  private readonly cache: Map<string, string> = new Map();

  constructor(projectId: string) {
    this.connectorManager = new ConnectorsSecretManager(projectId);
  }

  async getSecret(tenantId: string, secretKey: string): Promise<string | null> {
    const cacheKey = `${tenantId}:${secretKey}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) || null;
    }

    try {
      // Use connectors secret manager - it throws on not found
      const value = await this.connectorManager.getSecret(tenantId, secretKey);
      this.cache.set(cacheKey, value);
      return value;
    } catch (error) {
      // Return null for not found, re-throw other errors
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('NOT_FOUND') || errMsg.includes('not found')) {
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
