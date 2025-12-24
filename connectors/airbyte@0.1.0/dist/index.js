/**
 * Airbyte Connector Package Entry Point
 *
 * Phase 6: Packaged connector for local registry.
 *
 * @module airbyte-connector
 */

import { createAirbyteSDKConnector } from '@gwi/integrations';

let connectorInstance = null;

try {
  connectorInstance = createAirbyteSDKConnector();
} catch (error) {
  console.warn('[Airbyte Connector] Not configured, connector not initialized');
}

export const connector = connectorInstance;
export default connector;

export { createAirbyteSDKConnector };
