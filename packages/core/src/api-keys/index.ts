/**
 * Phase 62: API Keys + Usage Limits
 *
 * API key management and usage tracking:
 * - Key generation and rotation
 * - Scopes and permissions
 * - Usage quotas and limits
 * - Usage analytics
 *
 * @module @gwi/core/api-keys
 */

import { z } from 'zod';

// =============================================================================
// API KEYS VERSION
// =============================================================================

export const API_KEYS_VERSION = '1.0.0';

// =============================================================================
// ERROR CODES
// =============================================================================

export const ApiKeysErrorCodes = {
  // Key errors (1xxx)
  KEY_NOT_FOUND: 'AK_1001',
  KEY_REVOKED: 'AK_1002',
  KEY_EXPIRED: 'AK_1003',
  INVALID_KEY_FORMAT: 'AK_1004',

  // Permission errors (2xxx)
  INSUFFICIENT_SCOPE: 'AK_2001',
  SCOPE_NOT_FOUND: 'AK_2002',
  TENANT_MISMATCH: 'AK_2003',
  IP_NOT_ALLOWED: 'AK_2004',

  // Quota errors (3xxx)
  QUOTA_EXCEEDED: 'AK_3001',
  RATE_LIMITED: 'AK_3002',
  DAILY_LIMIT_REACHED: 'AK_3003',
  MONTHLY_LIMIT_REACHED: 'AK_3004',

  // Management errors (4xxx)
  CREATE_FAILED: 'AK_4001',
  ROTATE_FAILED: 'AK_4002',
  DELETE_FAILED: 'AK_4003',
  UPDATE_FAILED: 'AK_4004',
} as const;

export type ApiKeysErrorCode = (typeof ApiKeysErrorCodes)[keyof typeof ApiKeysErrorCodes];

// =============================================================================
// API KEY TYPES
// =============================================================================

export type ManagedApiKeyStatus = 'active' | 'revoked' | 'expired' | 'pending';

export type ManagedApiKeyType = 'live' | 'test' | 'restricted';

export interface ManagedApiKey {
  /** Key ID */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Key name */
  name: string;
  /** Key description */
  description?: string;
  /** Key type */
  type: ManagedApiKeyType;
  /** Key prefix (visible part) */
  prefix: string;
  /** Hashed key (stored) */
  hashedKey: string;
  /** Status */
  status: ManagedApiKeyStatus;
  /** Scopes granted */
  scopes: string[];
  /** Allowed IP addresses (empty = all) */
  allowedIps: string[];
  /** Rate limit override */
  rateLimitOverride?: number;
  /** Daily quota */
  dailyQuota?: number;
  /** Monthly quota */
  monthlyQuota?: number;
  /** Expires at */
  expiresAt?: number;
  /** Last used */
  lastUsedAt?: number;
  /** Last used IP */
  lastUsedIp?: string;
  /** Created by */
  createdBy: string;
  /** Created at */
  createdAt: number;
  /** Updated at */
  updatedAt: number;
  /** Metadata */
  metadata?: Record<string, string>;
}

export interface ManagedApiKeyWithSecret extends ManagedApiKey {
  /** Plain key (only returned on creation) */
  plainKey: string;
}

// =============================================================================
// USAGE TRACKING
// =============================================================================

export interface ApiKeyUsage {
  /** Key ID */
  keyId: string;
  /** Date (YYYY-MM-DD) */
  date: string;
  /** Total requests */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Rate limited requests */
  rateLimitedRequests: number;
  /** Quota exceeded requests */
  quotaExceededRequests: number;
  /** Total response time (ms) */
  totalResponseTimeMs: number;
  /** Requests by endpoint */
  requestsByEndpoint: Record<string, number>;
  /** Requests by status code */
  requestsByStatus: Record<string, number>;
}

export interface ApiKeyUsageSummary {
  /** Key ID */
  keyId: string;
  /** Period start */
  periodStart: number;
  /** Period end */
  periodEnd: number;
  /** Total requests */
  totalRequests: number;
  /** Daily average */
  dailyAverage: number;
  /** Peak daily requests */
  peakDaily: number;
  /** Success rate */
  successRate: number;
  /** Average response time (ms) */
  avgResponseTimeMs: number;
  /** Quota remaining */
  quotaRemaining?: {
    daily?: number;
    monthly?: number;
  };
}

// =============================================================================
// SCOPES
// =============================================================================

export const API_SCOPES = {
  // Read scopes
  'series:read': 'Read time series data',
  'forecasts:read': 'Read forecasts',
  'alerts:read': 'Read alerts',
  'dashboards:read': 'Read dashboards',

  // Write scopes
  'series:write': 'Write time series data',
  'forecasts:write': 'Create forecasts',
  'alerts:write': 'Manage alerts',
  'dashboards:write': 'Manage dashboards',

  // Admin scopes
  'admin:users': 'Manage users',
  'admin:keys': 'Manage API keys',
  'admin:billing': 'Manage billing',
  'admin:settings': 'Manage settings',

  // Full access
  'all': 'Full access',
} as const;

export type ApiScope = keyof typeof API_SCOPES;

// =============================================================================
// API KEY MANAGER
// =============================================================================

/**
 * API key manager for key lifecycle and validation
 */
export class ManagedApiKeyManager {
  private keys: Map<string, ManagedApiKey> = new Map();
  private usage: Map<string, Map<string, ApiKeyUsage>> = new Map(); // keyId -> date -> usage
  private keyCounter = 0;

  /**
   * Create a new API key
   */
  createKey(
    params: Omit<ManagedApiKey, 'id' | 'prefix' | 'hashedKey' | 'status' | 'createdAt' | 'updatedAt' | 'lastUsedAt'>
  ): ManagedApiKeyWithSecret {
    const id = `key_${++this.keyCounter}`;
    const plainKey = this.generateKey(params.type);
    const prefix = plainKey.slice(0, 8);
    const hashedKey = this.hashKey(plainKey);

    const key: ManagedApiKey = {
      ...params,
      id,
      prefix,
      hashedKey,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.keys.set(id, key);

    return {
      ...key,
      plainKey,
    };
  }

  /**
   * Get key by ID
   */
  getKey(keyId: string): ManagedApiKey | undefined {
    return this.keys.get(keyId);
  }

  /**
   * Find key by plain key
   */
  findKeyByPlainKey(plainKey: string): ManagedApiKey | undefined {
    const hashedKey = this.hashKey(plainKey);
    return Array.from(this.keys.values()).find(k => k.hashedKey === hashedKey);
  }

  /**
   * List keys for tenant
   */
  listKeys(tenantId: string, options?: {
    type?: ManagedApiKeyType;
    status?: ManagedApiKeyStatus;
    limit?: number;
  }): ManagedApiKey[] {
    let keys = Array.from(this.keys.values()).filter(k => k.tenantId === tenantId);

    if (options?.type) {
      keys = keys.filter(k => k.type === options.type);
    }

    if (options?.status) {
      keys = keys.filter(k => k.status === options.status);
    }

    keys.sort((a, b) => b.createdAt - a.createdAt);

    if (options?.limit) {
      keys = keys.slice(0, options.limit);
    }

    return keys;
  }

  /**
   * Update key
   */
  updateKey(
    keyId: string,
    updates: Partial<Pick<ManagedApiKey, 'name' | 'description' | 'scopes' | 'allowedIps' | 'rateLimitOverride' | 'dailyQuota' | 'monthlyQuota' | 'expiresAt' | 'metadata'>>
  ): ManagedApiKey | undefined {
    const key = this.keys.get(keyId);
    if (!key) return undefined;

    const updated = {
      ...key,
      ...updates,
      updatedAt: Date.now(),
    };
    this.keys.set(keyId, updated);
    return updated;
  }

  /**
   * Revoke key
   */
  revokeKey(keyId: string): boolean {
    const key = this.keys.get(keyId);
    if (!key) return false;

    key.status = 'revoked';
    key.updatedAt = Date.now();
    return true;
  }

  /**
   * Delete key
   */
  deleteKey(keyId: string): boolean {
    return this.keys.delete(keyId);
  }

  /**
   * Rotate key (create new, revoke old)
   */
  rotateKey(keyId: string): ManagedApiKeyWithSecret | undefined {
    const oldKey = this.keys.get(keyId);
    if (!oldKey) return undefined;

    // Create new key with same settings
    const newKey = this.createKey({
      tenantId: oldKey.tenantId,
      name: oldKey.name,
      description: oldKey.description,
      type: oldKey.type,
      scopes: oldKey.scopes,
      allowedIps: oldKey.allowedIps,
      rateLimitOverride: oldKey.rateLimitOverride,
      dailyQuota: oldKey.dailyQuota,
      monthlyQuota: oldKey.monthlyQuota,
      expiresAt: oldKey.expiresAt,
      createdBy: oldKey.createdBy,
      metadata: oldKey.metadata,
    });

    // Revoke old key
    this.revokeKey(keyId);

    return newKey;
  }

  /**
   * Validate key and check permissions
   */
  validateKey(
    plainKey: string,
    options?: {
      requiredScopes?: string[];
      clientIp?: string;
    }
  ): {
    valid: boolean;
    key?: ManagedApiKey;
    error?: string;
  } {
    const key = this.findKeyByPlainKey(plainKey);
    if (!key) {
      return { valid: false, error: 'Key not found' };
    }

    if (key.status !== 'active') {
      return { valid: false, error: `Key is ${key.status}` };
    }

    if (key.expiresAt && key.expiresAt < Date.now()) {
      key.status = 'expired';
      return { valid: false, error: 'Key expired' };
    }

    if (key.allowedIps.length > 0 && options?.clientIp) {
      if (!key.allowedIps.includes(options.clientIp)) {
        return { valid: false, error: 'IP not allowed' };
      }
    }

    if (options?.requiredScopes) {
      const hasAllScopes = key.scopes.includes('all') ||
        options.requiredScopes.every(s => key.scopes.includes(s));
      if (!hasAllScopes) {
        return { valid: false, error: 'Insufficient scopes' };
      }
    }

    return { valid: true, key };
  }

  /**
   * Record key usage
   */
  recordUsage(
    keyId: string,
    request: {
      endpoint: string;
      statusCode: number;
      responseTimeMs: number;
      clientIp: string;
    }
  ): void {
    const key = this.keys.get(keyId);
    if (!key) return;

    // Update last used
    key.lastUsedAt = Date.now();
    key.lastUsedIp = request.clientIp;

    // Get or create usage record
    const date = new Date().toISOString().split('T')[0];
    if (!this.usage.has(keyId)) {
      this.usage.set(keyId, new Map());
    }
    const keyUsage = this.usage.get(keyId)!;

    let usage = keyUsage.get(date);
    if (!usage) {
      usage = {
        keyId,
        date,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        rateLimitedRequests: 0,
        quotaExceededRequests: 0,
        totalResponseTimeMs: 0,
        requestsByEndpoint: {},
        requestsByStatus: {},
      };
      keyUsage.set(date, usage);
    }

    // Update counters
    usage.totalRequests++;
    usage.totalResponseTimeMs += request.responseTimeMs;

    if (request.statusCode >= 200 && request.statusCode < 300) {
      usage.successfulRequests++;
    } else if (request.statusCode === 429) {
      usage.rateLimitedRequests++;
    } else {
      usage.failedRequests++;
    }

    // Update by endpoint
    usage.requestsByEndpoint[request.endpoint] = (usage.requestsByEndpoint[request.endpoint] ?? 0) + 1;

    // Update by status
    const statusKey = String(request.statusCode);
    usage.requestsByStatus[statusKey] = (usage.requestsByStatus[statusKey] ?? 0) + 1;
  }

  /**
   * Get usage for a key
   */
  getUsage(keyId: string, date: string): ApiKeyUsage | undefined {
    return this.usage.get(keyId)?.get(date);
  }

  /**
   * Get usage summary for a key
   */
  getUsageSummary(keyId: string, days: number = 30): ApiKeyUsageSummary {
    const key = this.keys.get(keyId);
    const keyUsage = this.usage.get(keyId);

    const now = Date.now();
    const periodStart = now - days * 24 * 60 * 60 * 1000;
    const periodEnd = now;

    let totalRequests = 0;
    let totalSuccessful = 0;
    let totalResponseTime = 0;
    let peakDaily = 0;
    let daysWithData = 0;

    if (keyUsage) {
      for (const usage of keyUsage.values()) {
        const usageDate = new Date(usage.date).getTime();
        if (usageDate >= periodStart && usageDate <= periodEnd) {
          totalRequests += usage.totalRequests;
          totalSuccessful += usage.successfulRequests;
          totalResponseTime += usage.totalResponseTimeMs;
          peakDaily = Math.max(peakDaily, usage.totalRequests);
          daysWithData++;
        }
      }
    }

    const summary: ApiKeyUsageSummary = {
      keyId,
      periodStart,
      periodEnd,
      totalRequests,
      dailyAverage: daysWithData > 0 ? totalRequests / daysWithData : 0,
      peakDaily,
      successRate: totalRequests > 0 ? totalSuccessful / totalRequests : 1,
      avgResponseTimeMs: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
    };

    // Add quota remaining if applicable
    if (key) {
      const todayUsage = this.getTodayUsage(keyId);
      const monthUsage = this.getMonthUsage(keyId);

      summary.quotaRemaining = {};
      if (key.dailyQuota) {
        summary.quotaRemaining.daily = Math.max(0, key.dailyQuota - todayUsage);
      }
      if (key.monthlyQuota) {
        summary.quotaRemaining.monthly = Math.max(0, key.monthlyQuota - monthUsage);
      }
    }

    return summary;
  }

  /**
   * Check if key is within quota
   */
  checkQuota(keyId: string): {
    withinQuota: boolean;
    dailyRemaining?: number;
    monthlyRemaining?: number;
  } {
    const key = this.keys.get(keyId);
    if (!key) return { withinQuota: false };

    const todayUsage = this.getTodayUsage(keyId);
    const monthUsage = this.getMonthUsage(keyId);

    let withinQuota = true;
    let dailyRemaining: number | undefined;
    let monthlyRemaining: number | undefined;

    if (key.dailyQuota) {
      dailyRemaining = Math.max(0, key.dailyQuota - todayUsage);
      if (todayUsage >= key.dailyQuota) {
        withinQuota = false;
      }
    }

    if (key.monthlyQuota) {
      monthlyRemaining = Math.max(0, key.monthlyQuota - monthUsage);
      if (monthUsage >= key.monthlyQuota) {
        withinQuota = false;
      }
    }

    return { withinQuota, dailyRemaining, monthlyRemaining };
  }

  private getTodayUsage(keyId: string): number {
    const date = new Date().toISOString().split('T')[0];
    const usage = this.usage.get(keyId)?.get(date);
    return usage?.totalRequests ?? 0;
  }

  private getMonthUsage(keyId: string): number {
    const keyUsage = this.usage.get(keyId);
    if (!keyUsage) return 0;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    let total = 0;
    for (const [date, usage] of keyUsage) {
      if (date >= monthStart) {
        total += usage.totalRequests;
      }
    }
    return total;
  }

  private generateKey(type: ManagedApiKeyType): string {
    const prefix = type === 'live' ? 'gwi_live_' : type === 'test' ? 'gwi_test_' : 'gwi_rstr_';
    const randomPart = Array.from({ length: 32 }, () =>
      'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36))
    ).join('');
    return prefix + randomPart;
  }

  private hashKey(key: string): string {
    // Simple hash for demo (in production, use bcrypt/argon2)
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'h_' + Math.abs(hash).toString(16);
  }
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const ManagedApiKeySchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['live', 'test', 'restricted']),
  prefix: z.string(),
  hashedKey: z.string(),
  status: z.enum(['active', 'revoked', 'expired', 'pending']),
  scopes: z.array(z.string()),
  allowedIps: z.array(z.string().ip()),
  rateLimitOverride: z.number().int().positive().optional(),
  dailyQuota: z.number().int().positive().optional(),
  monthlyQuota: z.number().int().positive().optional(),
  expiresAt: z.number().int().optional(),
  lastUsedAt: z.number().int().optional(),
  lastUsedIp: z.string().ip().optional(),
  createdBy: z.string().min(1),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  metadata: z.record(z.string()).optional(),
});

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['live', 'test', 'restricted']),
  scopes: z.array(z.string()).min(1),
  allowedIps: z.array(z.string().ip()).default([]),
  dailyQuota: z.number().int().positive().optional(),
  monthlyQuota: z.number().int().positive().optional(),
  expiresAt: z.number().int().optional(),
  metadata: z.record(z.string()).optional(),
});

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

export function validateManagedApiKey(
  key: unknown
): { success: boolean; data?: ManagedApiKey; errors?: string[] } {
  const result = ManagedApiKeySchema.safeParse(key);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an API key manager instance
 */
export function createManagedApiKeyManager(): ManagedApiKeyManager {
  return new ManagedApiKeyManager();
}
