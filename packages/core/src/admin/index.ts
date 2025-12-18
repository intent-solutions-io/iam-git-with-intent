/**
 * Admin Dashboard Utilities
 *
 * Phase 40: Admin UX components for API key management, settings, and tenant administration.
 *
 * @module @gwi/core/admin
 */

import { createLogger } from '../telemetry/index.js';

const logger = createLogger('admin');

// =============================================================================
// Types
// =============================================================================

/**
 * API key status
 */
export type ApiKeyStatus = 'active' | 'revoked' | 'expired';

/**
 * API key scope
 */
export type ApiKeyScope =
  | 'read:runs'
  | 'write:runs'
  | 'read:workflows'
  | 'write:workflows'
  | 'read:policies'
  | 'write:policies'
  | 'admin';

/**
 * API key metadata
 */
export interface ApiKey {
  /** Key ID (public identifier) */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Key name for display */
  name: string;
  /** Key prefix for identification (first 8 chars) */
  prefix: string;
  /** SHA-256 hash of the full key */
  hash: string;
  /** Key scopes */
  scopes: ApiKeyScope[];
  /** Key status */
  status: ApiKeyStatus;
  /** Creation timestamp */
  createdAt: Date;
  /** Last used timestamp */
  lastUsedAt?: Date;
  /** Expiration timestamp */
  expiresAt?: Date;
  /** Created by user ID */
  createdBy: string;
  /** Revocation details */
  revokedAt?: Date;
  revokedBy?: string;
  revocationReason?: string;
}

/**
 * API key creation request
 */
export interface CreateApiKeyRequest {
  /** Key name */
  name: string;
  /** Key scopes */
  scopes: ApiKeyScope[];
  /** Expiration in days (optional) */
  expiresInDays?: number;
  /** Tenant ID */
  tenantId: string;
  /** User creating the key */
  createdBy: string;
}

/**
 * API key creation result (includes the raw key, only available once)
 */
export interface CreateApiKeyResult {
  /** The API key metadata */
  key: ApiKey;
  /** The raw API key (only returned on creation) */
  rawKey: string;
}

/**
 * API key usage statistics
 */
export interface ApiKeyUsageStats {
  /** Key ID */
  keyId: string;
  /** Total requests */
  totalRequests: number;
  /** Requests in last 24 hours */
  last24Hours: number;
  /** Requests in last 7 days */
  last7Days: number;
  /** Last used timestamp */
  lastUsedAt?: Date;
  /** Usage by scope */
  byScope: Record<string, number>;
  /** Usage by endpoint */
  byEndpoint: Record<string, number>;
}

/**
 * Admin settings
 */
export interface AdminSettings {
  /** Tenant ID */
  tenantId: string;
  /** API key settings */
  apiKeys: {
    /** Maximum keys per tenant */
    maxKeysPerTenant: number;
    /** Default expiration in days */
    defaultExpirationDays: number;
    /** Require expiration */
    requireExpiration: boolean;
    /** Allowed scopes */
    allowedScopes: ApiKeyScope[];
  };
  /** Security settings */
  security: {
    /** Require MFA for admin actions */
    requireMfaForAdmin: boolean;
    /** IP allowlist */
    ipAllowlist: string[];
    /** Rate limit per key */
    rateLimitPerKey: number;
  };
  /** Notification settings */
  notifications: {
    /** Email for alerts */
    alertEmail?: string;
    /** Notify on key creation */
    onKeyCreation: boolean;
    /** Notify on key revocation */
    onKeyRevocation: boolean;
    /** Notify on usage threshold */
    onUsageThreshold: boolean;
    /** Usage threshold percentage */
    usageThresholdPercent: number;
  };
}

/**
 * API key storage interface
 */
export interface ApiKeyStore {
  create(request: CreateApiKeyRequest): Promise<CreateApiKeyResult>;
  get(keyId: string): Promise<ApiKey | null>;
  getByTenant(tenantId: string): Promise<ApiKey[]>;
  update(keyId: string, updates: Partial<ApiKey>): Promise<ApiKey>;
  revoke(keyId: string, revokedBy: string, reason?: string): Promise<ApiKey>;
  delete(keyId: string): Promise<void>;
  validateKey(rawKey: string): Promise<ApiKey | null>;
  recordUsage(keyId: string, endpoint: string, scope: string): Promise<void>;
  getUsageStats(keyId: string): Promise<ApiKeyUsageStats>;
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default admin settings
 */
export const DEFAULT_ADMIN_SETTINGS: Omit<AdminSettings, 'tenantId'> = {
  apiKeys: {
    maxKeysPerTenant: 10,
    defaultExpirationDays: 90,
    requireExpiration: false,
    allowedScopes: ['read:runs', 'write:runs', 'read:workflows', 'write:workflows'],
  },
  security: {
    requireMfaForAdmin: false,
    ipAllowlist: [],
    rateLimitPerKey: 1000, // per minute
  },
  notifications: {
    onKeyCreation: true,
    onKeyRevocation: true,
    onUsageThreshold: true,
    usageThresholdPercent: 80,
  },
};

/**
 * All available scopes
 */
export const ALL_API_KEY_SCOPES: ApiKeyScope[] = [
  'read:runs',
  'write:runs',
  'read:workflows',
  'write:workflows',
  'read:policies',
  'write:policies',
  'admin',
];

// =============================================================================
// In-Memory API Key Store
// =============================================================================

/**
 * In-memory API key store for development
 */
export class InMemoryApiKeyStore implements ApiKeyStore {
  private keys: Map<string, ApiKey> = new Map();
  private rawKeyToId: Map<string, string> = new Map();
  private usage: Map<string, { endpoint: string; scope: string; timestamp: Date }[]> = new Map();

  async create(request: CreateApiKeyRequest): Promise<CreateApiKeyResult> {
    const id = `key_${this.generateId()}`;
    const rawKey = `gwi_${this.generateSecureKey()}`;
    const hash = await this.hashKey(rawKey);
    const prefix = rawKey.substring(0, 12);

    const key: ApiKey = {
      id,
      tenantId: request.tenantId,
      name: request.name,
      prefix,
      hash,
      scopes: request.scopes,
      status: 'active',
      createdAt: new Date(),
      createdBy: request.createdBy,
      expiresAt: request.expiresInDays
        ? new Date(Date.now() + request.expiresInDays * 24 * 60 * 60 * 1000)
        : undefined,
    };

    this.keys.set(id, key);
    this.rawKeyToId.set(hash, id);
    this.usage.set(id, []);

    logger.info('API key created', { keyId: id, tenantId: request.tenantId, name: request.name });

    return { key, rawKey };
  }

  async get(keyId: string): Promise<ApiKey | null> {
    return this.keys.get(keyId) || null;
  }

  async getByTenant(tenantId: string): Promise<ApiKey[]> {
    return Array.from(this.keys.values()).filter(k => k.tenantId === tenantId);
  }

  async update(keyId: string, updates: Partial<ApiKey>): Promise<ApiKey> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`API key not found: ${keyId}`);
    }

    const updated = { ...key, ...updates };
    this.keys.set(keyId, updated);
    return updated;
  }

  async revoke(keyId: string, revokedBy: string, reason?: string): Promise<ApiKey> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`API key not found: ${keyId}`);
    }

    const revoked: ApiKey = {
      ...key,
      status: 'revoked',
      revokedAt: new Date(),
      revokedBy,
      revocationReason: reason,
    };

    this.keys.set(keyId, revoked);
    logger.info('API key revoked', { keyId, revokedBy, reason });

    return revoked;
  }

  async delete(keyId: string): Promise<void> {
    const key = this.keys.get(keyId);
    if (key) {
      this.rawKeyToId.delete(key.hash);
    }
    this.keys.delete(keyId);
    this.usage.delete(keyId);
  }

  async validateKey(rawKey: string): Promise<ApiKey | null> {
    const hash = await this.hashKey(rawKey);
    const keyId = this.rawKeyToId.get(hash);
    if (!keyId) return null;

    const key = this.keys.get(keyId);
    if (!key) return null;

    // Check status
    if (key.status !== 'active') return null;

    // Check expiration
    if (key.expiresAt && key.expiresAt < new Date()) {
      await this.update(keyId, { status: 'expired' });
      return null;
    }

    // Update last used
    await this.update(keyId, { lastUsedAt: new Date() });

    return key;
  }

  async recordUsage(keyId: string, endpoint: string, scope: string): Promise<void> {
    const usage = this.usage.get(keyId) || [];
    usage.push({ endpoint, scope, timestamp: new Date() });
    this.usage.set(keyId, usage);
  }

  async getUsageStats(keyId: string): Promise<ApiKeyUsageStats> {
    const key = this.keys.get(keyId);
    const usage = this.usage.get(keyId) || [];

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const week = 7 * day;

    const last24Hours = usage.filter(u => now - u.timestamp.getTime() < day).length;
    const last7Days = usage.filter(u => now - u.timestamp.getTime() < week).length;

    const byScope: Record<string, number> = {};
    const byEndpoint: Record<string, number> = {};

    for (const u of usage) {
      byScope[u.scope] = (byScope[u.scope] || 0) + 1;
      byEndpoint[u.endpoint] = (byEndpoint[u.endpoint] || 0) + 1;
    }

    return {
      keyId,
      totalRequests: usage.length,
      last24Hours,
      last7Days,
      lastUsedAt: key?.lastUsedAt,
      byScope,
      byEndpoint,
    };
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  private generateSecureKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }

  private async hashKey(key: string): Promise<string> {
    // Simple hash for in-memory store (use crypto.subtle in production)
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `hash_${Math.abs(hash).toString(16)}`;
  }
}

// =============================================================================
// API Key Manager
// =============================================================================

/**
 * API key manager for admin operations
 */
export class ApiKeyManager {
  constructor(
    private store: ApiKeyStore,
    private settings: AdminSettings
  ) {}

  /**
   * Create a new API key
   */
  async createKey(request: Omit<CreateApiKeyRequest, 'tenantId'>): Promise<CreateApiKeyResult> {
    // Check max keys limit
    const existingKeys = await this.store.getByTenant(this.settings.tenantId);
    const activeKeys = existingKeys.filter(k => k.status === 'active');

    if (activeKeys.length >= this.settings.apiKeys.maxKeysPerTenant) {
      throw new Error(`Maximum API keys limit reached (${this.settings.apiKeys.maxKeysPerTenant})`);
    }

    // Validate scopes
    const invalidScopes = request.scopes.filter(
      s => !this.settings.apiKeys.allowedScopes.includes(s)
    );
    if (invalidScopes.length > 0) {
      throw new Error(`Invalid scopes: ${invalidScopes.join(', ')}`);
    }

    // Apply default expiration if required
    let expiresInDays = request.expiresInDays;
    if (this.settings.apiKeys.requireExpiration && !expiresInDays) {
      expiresInDays = this.settings.apiKeys.defaultExpirationDays;
    }

    return this.store.create({
      ...request,
      tenantId: this.settings.tenantId,
      expiresInDays,
    });
  }

  /**
   * List all API keys for tenant
   */
  async listKeys(): Promise<ApiKey[]> {
    return this.store.getByTenant(this.settings.tenantId);
  }

  /**
   * Get a specific key
   */
  async getKey(keyId: string): Promise<ApiKey | null> {
    const key = await this.store.get(keyId);
    if (key && key.tenantId !== this.settings.tenantId) {
      return null; // Don't return keys from other tenants
    }
    return key;
  }

  /**
   * Revoke an API key
   */
  async revokeKey(keyId: string, revokedBy: string, reason?: string): Promise<ApiKey> {
    const key = await this.store.get(keyId);
    if (!key || key.tenantId !== this.settings.tenantId) {
      throw new Error(`API key not found: ${keyId}`);
    }

    return this.store.revoke(keyId, revokedBy, reason);
  }

  /**
   * Get usage statistics for a key
   */
  async getKeyUsage(keyId: string): Promise<ApiKeyUsageStats> {
    const key = await this.store.get(keyId);
    if (!key || key.tenantId !== this.settings.tenantId) {
      throw new Error(`API key not found: ${keyId}`);
    }

    return this.store.getUsageStats(keyId);
  }

  /**
   * Validate an API key and check scopes
   */
  async validateKey(rawKey: string, requiredScope?: ApiKeyScope): Promise<ApiKey | null> {
    const key = await this.store.validateKey(rawKey);
    if (!key) return null;

    // Check tenant
    if (key.tenantId !== this.settings.tenantId) {
      return null;
    }

    // Check scope
    if (requiredScope && !key.scopes.includes(requiredScope) && !key.scopes.includes('admin')) {
      return null;
    }

    return key;
  }

  /**
   * Record API usage
   */
  async recordUsage(keyId: string, endpoint: string, scope: string): Promise<void> {
    await this.store.recordUsage(keyId, endpoint, scope);
  }

  /**
   * Get keys expiring soon
   */
  async getExpiringKeys(daysThreshold: number = 7): Promise<ApiKey[]> {
    const keys = await this.store.getByTenant(this.settings.tenantId);
    const threshold = Date.now() + daysThreshold * 24 * 60 * 60 * 1000;

    return keys.filter(k =>
      k.status === 'active' &&
      k.expiresAt &&
      k.expiresAt.getTime() < threshold
    );
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create default admin settings for a tenant
 */
export function createAdminSettings(
  tenantId: string,
  overrides: Partial<Omit<AdminSettings, 'tenantId'>> = {}
): AdminSettings {
  return {
    tenantId,
    apiKeys: { ...DEFAULT_ADMIN_SETTINGS.apiKeys, ...overrides.apiKeys },
    security: { ...DEFAULT_ADMIN_SETTINGS.security, ...overrides.security },
    notifications: { ...DEFAULT_ADMIN_SETTINGS.notifications, ...overrides.notifications },
  };
}

/**
 * Create an API key manager with in-memory storage
 */
export function createApiKeyManager(tenantId: string): ApiKeyManager {
  const store = new InMemoryApiKeyStore();
  const settings = createAdminSettings(tenantId);
  return new ApiKeyManager(store, settings);
}

// =============================================================================
// Exports (types re-exported above via interface definition)
// =============================================================================
