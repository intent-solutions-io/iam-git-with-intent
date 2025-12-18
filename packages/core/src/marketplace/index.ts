/**
 * Phase 29: Marketplace Module
 * Phase 30: Reliability fixups (persistent storage, publisher registry)
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
  PendingInstallRequestSchema,
  PublisherSchema,
  PublisherKeySchema,
  MARKETPLACE_CATEGORIES,
  validatePublishedConnector,
  validateConnectorVersion,
  type PublishedConnector,
  type ConnectorVersion,
  type ConnectorInstallation,
  type PublishRequest,
  type InstallRequest,
  type PendingInstallRequestRecord,
  type Publisher,
  type PublisherKey,
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
