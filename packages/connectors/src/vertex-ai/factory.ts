import { VertexAIConnector } from './vertex-ai-connector.js';
import type { ILogger, IMetrics } from '../core/base-connector.js';

/**
 * Create a new Vertex AI connector instance
 *
 * @param logger - Optional logger instance
 * @param metrics - Optional metrics instance
 * @returns Configured VertexAIConnector instance
 */
export function createVertexAIConnector(
  logger?: ILogger,
  metrics?: IMetrics
): VertexAIConnector {
  return new VertexAIConnector(logger, metrics);
}

/**
 * Connector factory registry entry
 */
export const vertexAIConnectorFactory = {
  name: 'vertex-ai',
  displayName: 'Vertex AI',
  description: 'Connect to Google Cloud Vertex AI for predictions, embeddings, and model management',
  create: createVertexAIConnector
};
