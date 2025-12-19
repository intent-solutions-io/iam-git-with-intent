/**
 * Secrets Management Module (A9: Secrets Model)
 *
 * Provides unified access to Google Cloud Secret Manager with:
 * - Automatic caching with TTL for rotation support
 * - Service-specific secret loading
 * - Secret inventory documentation
 * - Least-privilege access patterns
 *
 * @module @gwi/core/secrets
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// =============================================================================
// Secret Inventory (A9.s1)
// =============================================================================

/**
 * Known secrets in the system with their purpose and consumers
 */
export const SECRET_INVENTORY = {
  // GitHub Integration
  'gwi-github-app-private-key': {
    description: 'GitHub App private key for API authentication',
    consumers: ['gateway', 'worker', 'github-webhook'],
    rotationDays: 90,
  },
  'gwi-github-webhook-secret': {
    description: 'GitHub webhook HMAC secret for signature validation',
    consumers: ['github-webhook'],
    rotationDays: 180,
  },

  // AI Provider Keys
  'gwi-anthropic-api-key': {
    description: 'Anthropic API key for Claude models',
    consumers: ['worker'],
    rotationDays: 90,
  },
  'gwi-google-ai-api-key': {
    description: 'Google AI API key for Gemini models',
    consumers: ['worker'],
    rotationDays: 90,
  },

  // Stripe Integration
  'gwi-stripe-secret-key': {
    description: 'Stripe secret key for billing',
    consumers: ['api'],
    rotationDays: 90,
  },
  'gwi-stripe-webhook-secret': {
    description: 'Stripe webhook signing secret',
    consumers: ['api'],
    rotationDays: 180,
  },

  // Slack Integration (future)
  'gwi-slack-signing-secret': {
    description: 'Slack app signing secret for request verification',
    consumers: ['gateway'],
    rotationDays: 180,
  },
  'gwi-slack-bot-token': {
    description: 'Slack bot OAuth token',
    consumers: ['gateway'],
    rotationDays: 365,
  },
} as const;

export type SecretName = keyof typeof SECRET_INVENTORY;

/**
 * Service identity for least-privilege access
 */
export type ServiceIdentity = 'api' | 'gateway' | 'worker' | 'github-webhook' | 'scheduler';

// =============================================================================
// Secret Cache
// =============================================================================

interface CachedSecret {
  value: string;
  version: string;
  cachedAt: number;
  expiresAt: number;
}

/**
 * In-memory secret cache with TTL
 */
class SecretCache {
  private cache = new Map<string, CachedSecret>();
  private defaultTtlMs: number;

  constructor(defaultTtlMinutes = 5) {
    this.defaultTtlMs = defaultTtlMinutes * 60 * 1000;
  }

  get(key: string): CachedSecret | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry;
  }

  set(key: string, value: string, version: string, ttlMs?: number): void {
    const now = Date.now();
    this.cache.set(key, {
      value,
      version,
      cachedAt: now,
      expiresAt: now + (ttlMs ?? this.defaultTtlMs),
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// =============================================================================
// Secret Manager Client
// =============================================================================

/**
 * Configuration for the secrets client
 */
export interface SecretsClientConfig {
  /** GCP project ID */
  projectId: string;
  /** Cache TTL in minutes (default: 5) */
  cacheTtlMinutes?: number;
  /** Whether to cache secrets (default: true) */
  enableCache?: boolean;
}

/**
 * Result of getting a secret
 */
export interface SecretResult {
  /** Secret value */
  value: string;
  /** Secret version (e.g., "1", "2", "latest") */
  version: string;
  /** Whether this was served from cache */
  fromCache: boolean;
}

/**
 * Unified client for accessing secrets from Google Cloud Secret Manager
 */
export class SecretsClient {
  private client: SecretManagerServiceClient;
  private projectId: string;
  private cache: SecretCache;
  private enableCache: boolean;

  constructor(config: SecretsClientConfig) {
    this.client = new SecretManagerServiceClient();
    this.projectId = config.projectId;
    this.cache = new SecretCache(config.cacheTtlMinutes ?? 5);
    this.enableCache = config.enableCache ?? true;
  }

  /**
   * Get the resource name for a secret
   */
  private getSecretName(secretId: string, version = 'latest'): string {
    return `projects/${this.projectId}/secrets/${secretId}/versions/${version}`;
  }

  /**
   * Get a secret value from Secret Manager
   *
   * @param secretId - Secret ID (without project prefix)
   * @param version - Version to fetch (default: 'latest')
   * @returns Secret value and metadata
   */
  async getSecret(secretId: string, version = 'latest'): Promise<SecretResult> {
    const cacheKey = `${secretId}:${version}`;

    // Check cache first
    if (this.enableCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return {
          value: cached.value,
          version: cached.version,
          fromCache: true,
        };
      }
    }

    // Fetch from Secret Manager
    const name = this.getSecretName(secretId, version);
    const [response] = await this.client.accessSecretVersion({ name });

    if (!response.payload?.data) {
      throw new Error(`Secret ${secretId} has no payload data`);
    }

    const value =
      typeof response.payload.data === 'string'
        ? response.payload.data
        : Buffer.from(response.payload.data).toString('utf-8');

    // Extract version number from name (e.g., ".../versions/3")
    const versionNum = response.name?.split('/versions/').pop() ?? version;

    // Cache the result
    if (this.enableCache) {
      this.cache.set(cacheKey, value, versionNum);
    }

    return {
      value,
      version: versionNum,
      fromCache: false,
    };
  }

  /**
   * Get a secret value as string (convenience method)
   */
  async getSecretValue(secretId: string): Promise<string> {
    const result = await this.getSecret(secretId);
    return result.value;
  }

  /**
   * Get multiple secrets at once
   */
  async getSecrets(secretIds: string[]): Promise<Record<string, string>> {
    const results = await Promise.all(
      secretIds.map(async (id) => {
        const result = await this.getSecret(id);
        return [id, result.value] as const;
      })
    );
    return Object.fromEntries(results);
  }

  /**
   * Check if a secret exists
   */
  async secretExists(secretId: string): Promise<boolean> {
    try {
      const name = `projects/${this.projectId}/secrets/${secretId}`;
      await this.client.getSecret({ name });
      return true;
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 5) {
        // NOT_FOUND
        return false;
      }
      throw error;
    }
  }

  /**
   * List all secret versions for a secret
   */
  async listVersions(secretId: string): Promise<{ version: string; state: string; createTime?: string }[]> {
    const parent = `projects/${this.projectId}/secrets/${secretId}`;
    const [versions] = await this.client.listSecretVersions({ parent });

    return versions.map((v) => ({
      version: v.name?.split('/versions/').pop() ?? '',
      state: String(v.state ?? 'UNKNOWN'),
      createTime: v.createTime?.seconds ? new Date(Number(v.createTime.seconds) * 1000).toISOString() : undefined,
    }));
  }

  /**
   * Invalidate cached secret
   */
  invalidateCache(secretId: string): void {
    // Invalidate all versions of this secret
    this.cache.invalidate(`${secretId}:latest`);
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.cache.invalidateAll();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; enabled: boolean } {
    return {
      size: this.cache.size(),
      enabled: this.enableCache,
    };
  }
}

// =============================================================================
// Service-Specific Secret Loading (A9.s2)
// =============================================================================

/**
 * Secrets required by each service
 */
const SERVICE_SECRETS: Record<ServiceIdentity, SecretName[]> = {
  api: ['gwi-stripe-secret-key', 'gwi-stripe-webhook-secret'],
  gateway: ['gwi-github-app-private-key'],
  worker: ['gwi-github-app-private-key', 'gwi-anthropic-api-key', 'gwi-google-ai-api-key'],
  'github-webhook': ['gwi-github-app-private-key', 'gwi-github-webhook-secret'],
  scheduler: [],
};

/**
 * Load all secrets required by a service
 *
 * @param client - Secrets client
 * @param service - Service identity
 * @returns Map of secret name to value
 */
export async function loadServiceSecrets(
  client: SecretsClient,
  service: ServiceIdentity
): Promise<Record<string, string>> {
  const requiredSecrets = SERVICE_SECRETS[service] ?? [];

  if (requiredSecrets.length === 0) {
    return {};
  }

  const secrets: Record<string, string> = {};
  const errors: string[] = [];

  await Promise.all(
    requiredSecrets.map(async (secretName) => {
      try {
        secrets[secretName] = await client.getSecretValue(secretName);
      } catch (error) {
        errors.push(`${secretName}: ${(error as Error).message}`);
      }
    })
  );

  if (errors.length > 0) {
    throw new Error(`Failed to load required secrets for ${service}: ${errors.join('; ')}`);
  }

  return secrets;
}

/**
 * Verify all required secrets exist for a service
 */
export async function verifyServiceSecrets(client: SecretsClient, service: ServiceIdentity): Promise<boolean> {
  const requiredSecrets = SERVICE_SECRETS[service] ?? [];

  for (const secretName of requiredSecrets) {
    const exists = await client.secretExists(secretName);
    if (!exists) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// Secret Rotation Support (A9.s3)
// =============================================================================

/**
 * Check if a secret needs rotation
 */
export async function checkSecretRotation(
  client: SecretsClient,
  secretId: SecretName
): Promise<{
  needsRotation: boolean;
  daysSinceCreation: number;
  recommendedRotationDays: number;
}> {
  const versions = await client.listVersions(secretId);
  const latestEnabled = versions.find((v) => v.state === 'ENABLED');

  if (!latestEnabled?.createTime) {
    return {
      needsRotation: true,
      daysSinceCreation: -1,
      recommendedRotationDays: SECRET_INVENTORY[secretId].rotationDays,
    };
  }

  const createDate = new Date(latestEnabled.createTime);
  const now = new Date();
  const daysSince = Math.floor((now.getTime() - createDate.getTime()) / (1000 * 60 * 60 * 24));
  const recommendedDays = SECRET_INVENTORY[secretId].rotationDays;

  return {
    needsRotation: daysSince > recommendedDays,
    daysSinceCreation: daysSince,
    recommendedRotationDays: recommendedDays,
  };
}

/**
 * Get rotation status for all secrets
 */
export async function getRotationReport(
  client: SecretsClient
): Promise<{ secretId: string; needsRotation: boolean; daysSinceCreation: number; recommendedRotationDays: number }[]> {
  const report: { secretId: string; needsRotation: boolean; daysSinceCreation: number; recommendedRotationDays: number }[] = [];

  for (const secretId of Object.keys(SECRET_INVENTORY) as SecretName[]) {
    try {
      const status = await checkSecretRotation(client, secretId);
      report.push({ secretId, ...status });
    } catch {
      // Secret doesn't exist or can't be accessed
      report.push({
        secretId,
        needsRotation: true,
        daysSinceCreation: -1,
        recommendedRotationDays: SECRET_INVENTORY[secretId].rotationDays,
      });
    }
  }

  return report;
}

// =============================================================================
// Environment Enforcement (A9.s4)
// =============================================================================

/**
 * Patterns that indicate plaintext secrets in environment variables
 */
const PLAINTEXT_SECRET_PATTERNS = [
  // Direct secret values
  /^(sk-|sk_live_|sk_test_|ghp_|gho_|ghs_|ghr_|ghu_|AKIA|xox[baprs]-)/,
  // Private keys
  /-----BEGIN.*PRIVATE KEY-----/,
  // Long random strings that look like secrets
  /^[A-Za-z0-9+/]{40,}={0,2}$/,
];

/**
 * Environment variables that should reference Secret Manager
 */
const SECRET_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'GOOGLE_AI_API_KEY',
  'GITHUB_PRIVATE_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SLACK_SIGNING_SECRET',
  'SLACK_BOT_TOKEN',
];

/**
 * Check if an environment value looks like a plaintext secret
 */
export function isPlaintextSecret(value: string): boolean {
  return PLAINTEXT_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Validate that environment variables don't contain plaintext secrets
 *
 * @param env - Environment variables to check
 * @returns List of violations
 */
export function validateNoPlaintextSecrets(env: Record<string, string | undefined>): string[] {
  const violations: string[] = [];

  for (const varName of SECRET_ENV_VARS) {
    const value = env[varName];
    if (value && isPlaintextSecret(value)) {
      violations.push(
        `${varName} contains what appears to be a plaintext secret. ` +
          'Use Secret Manager reference instead: projects/PROJECT_ID/secrets/SECRET_ID'
      );
    }
  }

  return violations;
}

/**
 * Enforce no plaintext secrets at startup
 *
 * @throws Error if plaintext secrets are detected
 */
export function enforceNoPlaintextSecrets(): void {
  const violations = validateNoPlaintextSecrets(process.env as Record<string, string | undefined>);

  if (violations.length > 0) {
    throw new Error(`Plaintext secrets detected in environment:\n${violations.join('\n')}`);
  }
}

// =============================================================================
// Factory & Singleton
// =============================================================================

let defaultClient: SecretsClient | null = null;

/**
 * Get or create the default secrets client
 */
export function getSecretsClient(config?: SecretsClientConfig): SecretsClient {
  if (!defaultClient) {
    if (!config) {
      const projectId = process.env.GCP_PROJECT_ID;
      if (!projectId) {
        throw new Error('Secrets client not configured. Provide config or set GCP_PROJECT_ID environment variable.');
      }
      defaultClient = new SecretsClient({ projectId });
    } else {
      defaultClient = new SecretsClient(config);
    }
  }
  return defaultClient;
}

/**
 * Reset the default client (for testing)
 */
export function resetSecretsClient(): void {
  defaultClient = null;
}
