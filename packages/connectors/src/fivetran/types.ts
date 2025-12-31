import { z } from 'zod';
import type { ConnectorConfig } from '../interfaces/types.js';

/**
 * Fivetran API type definitions
 *
 * Based on Fivetran REST API v1
 * @see https://fivetran.com/docs/rest-api
 */

// ============================================================================
// Authentication
// ============================================================================

export interface BasicAuthConfig {
  type: 'basic';
  apiKey: string;
  apiSecret: string;
}

export interface FivetranConnectorConfig extends Omit<ConnectorConfig, 'auth'> {
  auth: BasicAuthConfig;
  baseUrl?: string; // Optional override for testing
}

export const FivetranConnectorConfigSchema = z.object({
  tenantId: z.string().min(1),
  auth: z.object({
    type: z.literal('basic'),
    apiKey: z.string().min(1),
    apiSecret: z.string().min(1)
  }),
  baseUrl: z.string().url().optional(),
  timeout: z.number().positive().optional(),
  headers: z.record(z.string()).optional()
});

// ============================================================================
// Fivetran Domain Types
// ============================================================================

export type ConnectorStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'RESCHEDULED'
  | 'BROKEN'
  | 'INCOMPLETE';

export type SyncFrequency = number; // In minutes

export type SetupStatus =
  | 'CONNECTED'
  | 'INCOMPLETE'
  | 'BROKEN';

export type SyncState =
  | 'scheduled'
  | 'syncing'
  | 'paused'
  | 'rescheduled';

export interface FivetranConnector {
  id: string;
  group_id: string;
  service: string;
  service_version: number;
  schema: string;
  connected_by: string;
  created_at: string;
  succeeded_at: string | null;
  failed_at: string | null;
  sync_frequency: SyncFrequency;
  schedule_type: 'auto' | 'manual';
  status: {
    setup_state: SetupStatus;
    sync_state: SyncState;
    update_state: 'on_schedule' | 'delayed';
    is_historical_sync: boolean;
    tasks: Array<{
      code: string;
      message: string;
    }>;
    warnings: Array<{
      code: string;
      message: string;
    }>;
  };
  config: Record<string, any>;
  paused: boolean;
  pause_after_trial: boolean;
  daily_sync_time: string;
  succeeded_at_utc: string | null;
  failed_at_utc: string | null;
}

export interface FivetranDestination {
  id: string;
  group_id: string;
  service: string;
  region: string;
  time_zone_offset: string;
  setup_status: SetupStatus;
  config: Record<string, any>;
}

export interface FivetranGroup {
  id: string;
  name: string;
  created_at: string;
}

export interface FivetranSyncStatus {
  connector_id: string;
  status: ConnectorStatus;
  sync_state: SyncState;
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
  last_sync_succeeded_at: string | null;
  last_sync_failed_at: string | null;
  is_historical_sync: boolean;
  next_sync_scheduled_at: string | null;
}

export interface FivetranUser {
  id: string;
  email: string;
  given_name: string;
  family_name: string;
  verified: boolean;
  invited: boolean;
  picture: string | null;
  phone: string | null;
  role: 'Account Administrator' | 'Account Reviewer' | 'Account Analyst';
  logged_in_at: string | null;
  created_at: string;
}

export interface FivetranWebhookPayload {
  event: string;
  created: string;
  data: {
    connector_id?: string;
    group_id?: string;
    destination_id?: string;
    [key: string]: any;
  };
}

// ============================================================================
// API Response Types
// ============================================================================

export interface FivetranApiResponse<T> {
  code: string;
  message?: string;
  data: T;
}

export interface FivetranListResponse<T> {
  code: string;
  data: {
    items: T[];
    next_cursor?: string;
  };
}

export interface FivetranError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

// ============================================================================
// Sync Options
// ============================================================================

export interface FivetranSyncOptions {
  recordTypes?: ('connector' | 'destination' | 'group' | 'user')[];
  groupId?: string;
  connectorIds?: string[];
  limit?: number;
  cursor?: string;
}

export const FivetranSyncOptionsSchema = z.object({
  recordTypes: z.array(z.enum(['connector', 'destination', 'group', 'user'])).optional(),
  groupId: z.string().optional(),
  connectorIds: z.array(z.string()).optional(),
  limit: z.number().positive().optional(),
  cursor: z.string().optional()
});

// ============================================================================
// Connector Metadata
// ============================================================================

export const FIVETRAN_CONNECTOR_METADATA = {
  name: 'fivetran',
  version: '1.0.0',
  recordTypes: ['connector', 'destination', 'group', 'user'],
  authMethods: ['bearer'] as const, // Basic auth via Authorization header (functionally equivalent)
  supportsIncremental: true,
  supportsWebhooks: true,
  rateLimits: {
    requestsPerSecond: 10, // Conservative estimate
    requestsPerHour: 5000  // Fivetran doesn't publish hard limits
  },
  capabilities: [
    'connector_management',
    'sync_trigger',
    'sync_status',
    'destination_management',
    'group_management',
    'user_management',
    'webhook_support'
  ],
  documentationUrl: 'https://fivetran.com/docs/rest-api'
} as const;
