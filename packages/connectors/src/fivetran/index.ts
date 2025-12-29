/**
 * Fivetran Connector
 *
 * Enterprise data pipeline integration for clients with Fivetran subscriptions.
 *
 * Features:
 * - REST API v1 client with Basic Auth
 * - Connector management (list, get, pause/resume, trigger sync)
 * - Sync status tracking
 * - Group and destination management
 * - Rate limiting handling (429 responses)
 * - Webhook processing
 *
 * @module @gwi/connectors/fivetran
 */

export { FivetranConnector } from './fivetran-connector.js';
export { FivetranClient } from './client.js';
export { createFivetranConnector } from './factory.js';
export * from './types.js';
