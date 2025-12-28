/**
 * Connector Testing Utilities
 *
 * Comprehensive testing utilities for connector development:
 * - MockConnector: Configurable mock with response simulation
 * - WebhookTestHarness: Generate and verify webhook payloads
 * - Integration helpers: Test factories, mocks, assertions
 * - Fixtures: Sample API responses, webhooks, configs
 *
 * @module @gwi/core/connectors/testing
 */

// Core testing utilities
export * from './mock-connector.js';
export * from './webhook-harness.js';
export * from './helpers.js';

// Test fixtures
export * as fixtures from './fixtures/index.js';
