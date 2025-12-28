import { z } from 'zod';

/**
 * Core type definitions for connector framework
 */

// ============================================================================
// Authentication Configuration
// ============================================================================

export interface BearerTokenAuthConfig {
  type: 'bearer';
  token: string;
}

export interface OAuth2AuthConfig {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: string;
}

export interface ServiceAccountAuthConfig {
  type: 'service_account';
  serviceAccountEmail: string;
  privateKey: string;
  projectId: string;
}

export type AuthConfig =
  | BearerTokenAuthConfig
  | OAuth2AuthConfig
  | ServiceAccountAuthConfig;

export interface RateLimitConfig {
  maxRequestsPerSecond: number;
  maxRequestsPerHour: number;
  maxConcurrentRequests: number;
}

// ============================================================================
// Connector Configuration
// ============================================================================

export interface ConnectorConfig {
  tenantId: string;
  auth: AuthConfig;
  rateLimit?: RateLimitConfig;
  timeout?: number;
  headers?: Record<string, string>;
}

// ============================================================================
// Authentication Result
// ============================================================================

export interface AuthResult {
  success: boolean;
  token?: string;
  expiresAt?: string;
  refreshToken?: string;
  error?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// Health Check
// ============================================================================

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  durationMs: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface HealthStatus {
  healthy: boolean;
  timestamp: string;
  connector: string;
  checks: HealthCheck[];
  error?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// Sync Options
// ============================================================================

export interface IncrementalSyncConfig {
  cursorField: string;
  startCursor?: string;
  endCursor?: string;
  granularity?: 'hour' | 'day' | 'week';
}

export interface ResourceFilter {
  type: string;
  id: string;
}

export interface SyncOptions {
  incremental?: IncrementalSyncConfig;
  resources?: ResourceFilter[];
  types?: string[];
  limit?: number;
  validateSchemas?: boolean;
}

// ============================================================================
// Connector Record
// ============================================================================

export interface ConnectorRecord {
  id: string;
  type: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

// ============================================================================
// Webhook Event
// ============================================================================

export interface WebhookEvent {
  id: string;
  source: string;
  type: string;
  timestamp: string;
  payload: Record<string, any>;
  signature: string;
  headers: Record<string, string>;
}

export interface WebhookResult {
  success: boolean;
  durationMs: number;
  error?: string;
  recordsProcessed?: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// Connector Metadata
// ============================================================================

export interface ConnectorMetadata {
  name: string;
  version: string;
  recordTypes: string[];
  authMethods: ('bearer' | 'oauth2' | 'service_account')[];
  supportsIncremental: boolean;
  supportsWebhooks: boolean;
  rateLimits: {
    requestsPerSecond: number;
    requestsPerHour: number;
  };
  capabilities: string[];
  documentationUrl?: string;
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

export const ConnectorConfigSchema = z.object({
  tenantId: z.string().min(1),
  auth: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('bearer'),
      token: z.string().min(1)
    }),
    z.object({
      type: z.literal('oauth2'),
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
      redirectUri: z.string().url(),
      refreshToken: z.string().optional(),
      accessToken: z.string().optional(),
      expiresAt: z.string().datetime().optional()
    }),
    z.object({
      type: z.literal('service_account'),
      serviceAccountEmail: z.string().email(),
      privateKey: z.string().min(1),
      projectId: z.string().min(1)
    })
  ]),
  rateLimit: z.object({
    maxRequestsPerSecond: z.number().positive(),
    maxRequestsPerHour: z.number().positive(),
    maxConcurrentRequests: z.number().positive()
  }).optional(),
  timeout: z.number().positive().optional(),
  headers: z.record(z.string()).optional()
});

export const AuthResultSchema = z.object({
  success: z.boolean(),
  token: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  refreshToken: z.string().optional(),
  error: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export const HealthStatusSchema = z.object({
  healthy: z.boolean(),
  timestamp: z.string().datetime(),
  connector: z.string(),
  checks: z.array(z.object({
    name: z.string(),
    status: z.enum(['pass', 'fail', 'warn']),
    durationMs: z.number().nonnegative(),
    error: z.string().optional(),
    metadata: z.record(z.any()).optional()
  })),
  error: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export const SyncOptionsSchema = z.object({
  incremental: z.object({
    cursorField: z.string(),
    startCursor: z.string().optional(),
    endCursor: z.string().optional(),
    granularity: z.enum(['hour', 'day', 'week']).optional()
  }).optional(),
  resources: z.array(z.object({
    type: z.string(),
    id: z.string()
  })).optional(),
  types: z.array(z.string()).optional(),
  limit: z.number().positive().optional(),
  validateSchemas: z.boolean().optional()
});

export const ConnectorRecordSchema = z.object({
  id: z.string(),
  type: z.string(),
  source: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  data: z.record(z.any()),
  metadata: z.record(z.any()).optional()
});

export const WebhookEventSchema = z.object({
  id: z.string(),
  source: z.string(),
  type: z.string(),
  timestamp: z.string().datetime(),
  payload: z.record(z.any()),
  signature: z.string(),
  headers: z.record(z.string())
});

export const WebhookResultSchema = z.object({
  success: z.boolean(),
  durationMs: z.number().nonnegative(),
  error: z.string().optional(),
  recordsProcessed: z.number().nonnegative().optional(),
  metadata: z.record(z.any()).optional()
});

export const ConnectorMetadataSchema = z.object({
  name: z.string(),
  version: z.string(),
  recordTypes: z.array(z.string()),
  authMethods: z.array(z.enum(['bearer', 'oauth2', 'service_account'])),
  supportsIncremental: z.boolean(),
  supportsWebhooks: z.boolean(),
  rateLimits: z.object({
    requestsPerSecond: z.number().positive(),
    requestsPerHour: z.number().positive()
  }),
  capabilities: z.array(z.string()),
  documentationUrl: z.string().url().optional()
});
