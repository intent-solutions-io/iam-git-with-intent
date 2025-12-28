/**
 * Vertex AI Connector Module
 *
 * Provides Google Cloud Vertex AI integration for:
 * - Predictions and embeddings
 * - Model and endpoint management
 * - Batch predictions
 * - Training pipelines
 * - Streaming predictions
 *
 * @module @gwi/connectors/vertex-ai
 */

export { VertexAIConnector } from './vertex-ai-connector.js';
export { createVertexAIConnector, vertexAIConnectorFactory } from './factory.js';

export type {
  VertexAIConnectorConfig,
  VertexAIAuthConfig,
  VertexAIServiceAccountAuthConfig,
  VertexAIOAuth2AuthConfig,
  VertexAIADCAuthConfig,
  VertexAIRecordType,
  VertexAIPrediction,
  VertexAIEmbedding,
  VertexAIModel,
  VertexAIEndpoint,
  VertexAIBatchPrediction,
  VertexAITrainingPipeline,
  VertexAIWebhookEventType,
  VertexAIWebhookPayload,
  VertexAISyncOptions,
  PredictionRequest,
  PredictionResponse,
  StreamPredictionChunk,
  EmbeddingRequest,
  EmbeddingResponse
} from './types.js';

export {
  VertexAIConnectorConfigSchema,
  VertexAISyncOptionsSchema,
  PredictionRequestSchema,
  EmbeddingRequestSchema,
  VERTEX_AI_CONNECTOR_METADATA
} from './types.js';
