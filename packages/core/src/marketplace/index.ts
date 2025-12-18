/**
 * Phase 29: Marketplace Module
 *
 * Connector marketplace for publishing, discovering, and installing connectors.
 *
 * @module @gwi/core/marketplace
 */

// Types
export {
  PublishedConnectorSchema,
  ConnectorVersionSchema,
  ConnectorInstallationSchema,
  PublishRequestSchema,
  InstallRequestSchema,
  MARKETPLACE_CATEGORIES,
  validatePublishedConnector,
  validateConnectorVersion,
  type PublishedConnector,
  type ConnectorVersion,
  type ConnectorInstallation,
  type PublishRequest,
  type InstallRequest,
  type MarketplaceSearchOptions,
  type MarketplaceSearchResult,
  type MarketplaceCategory,
} from './types.js';

// Storage
export {
  MARKETPLACE_COLLECTIONS,
  FirestoreMarketplaceStore,
  InMemoryMarketplaceStore,
  getMarketplaceStore,
  setMarketplaceStore,
  resetMarketplaceStore,
  type MarketplaceStore,
} from './storage.js';

// Service
export {
  MarketplaceService,
  getMarketplaceService,
  resetMarketplaceService,
  type MarketplaceServiceConfig,
} from './service.js';

// Install Pipeline (Phase 29: Policy-aware installation)
export {
  InstallPipeline,
  getInstallPipeline,
  resetInstallPipeline,
  DEFAULT_INSTALL_POLICY,
  type ConnectorInstallPolicy,
  type InstallPipelineResult,
  type PendingInstallRequest,
} from './install-pipeline.js';
