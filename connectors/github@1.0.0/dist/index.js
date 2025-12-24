/**
 * GitHub Connector Package Entry Point
 *
 * Phase 6: Packaged connector for local registry.
 *
 * This re-exports the GitHubSDKConnector from @gwi/integrations.
 * In a real packaged scenario, this would be a bundled version.
 *
 * @module github-connector
 */

// For local development, we import from the workspace package
// In production, this would be a bundled standalone module
import { createGitHubSDKConnector } from '@gwi/integrations';

// Create and export a connector instance
// Note: This requires GITHUB_TOKEN to be set in environment
let connectorInstance = null;

try {
  connectorInstance = createGitHubSDKConnector();
} catch (error) {
  // Token not available - create a placeholder
  console.warn('[GitHub Connector] Token not configured, connector not initialized');
}

export const connector = connectorInstance;
export default connector;

// Also export the factory for custom configuration
export { createGitHubSDKConnector };
