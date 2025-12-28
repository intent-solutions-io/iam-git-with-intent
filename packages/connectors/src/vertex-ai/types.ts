import { z } from 'zod';

/**
 * Vertex AI Connector Type Definitions
 *
 * @module @gwi/connectors/vertex-ai
 */

// ============================================================================
// Vertex AI-Specific Configuration
// ============================================================================

/**
 * Vertex AI connector configuration
 */
export interface VertexAIConnectorConfig {
  /**
   * Tenant ID for multi-tenant isolation
   */
  tenantId: string;

  /**
   * Google Cloud Project ID
   */
  projectId: string;

  /**
   * Google Cloud location/region (e.g., 'us-central1', 'europe-west4')
   */
  location: string;

  /**
   * Authentication configuration
   */
  auth: VertexAIAuthConfig;

  /**
   * Optional API base URL override (defaults to https://{location}-aiplatform.googleapis.com/v1)
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds (default: 60000)
   */
  timeout?: number;

  /**
   * Custom headers to include in all requests
   */
  headers?: Record<string, string>;

  /**
   * Rate limit configuration
   */
  rateLimit?: {
    maxRequestsPerSecond: number;
    maxRequestsPerHour: number;
    maxConcurrentRequests: number;
  };
}

/**
 * Vertex AI authentication configuration
 */
export type VertexAIAuthConfig =
  | VertexAIServiceAccountAuthConfig
  | VertexAIOAuth2AuthConfig
  | VertexAIADCAuthConfig;

/**
 * Service Account authentication
 */
export interface VertexAIServiceAccountAuthConfig {
  type: 'service_account';
  serviceAccountEmail: string;
  privateKey: string;
  projectId: string;
}

/**
 * OAuth 2.0 authentication
 */
export interface VertexAIOAuth2AuthConfig {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string[];
}

/**
 * Application Default Credentials (ADC)
 */
export interface VertexAIADCAuthConfig {
  type: 'adc';
  projectId: string;
}

// ============================================================================
// Vertex AI Record Types
// ============================================================================

/**
 * Record types that can be synced from Vertex AI
 */
export type VertexAIRecordType =
  | 'prediction'
  | 'embedding'
  | 'model'
  | 'endpoint'
  | 'batch_prediction'
  | 'training_pipeline'
  | 'dataset'
  | 'feature_store'
  | 'tuning_job';

/**
 * Prediction record from Vertex AI
 */
export interface VertexAIPrediction {
  id: string;
  model: string;
  endpoint?: string;
  instances: any[];
  predictions: any[];
  deployedModelId?: string;
  metadata?: {
    modelVersionId?: string;
    explanations?: any[];
    latencyMs?: number;
    tokenCount?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  createdAt: string;
}

/**
 * Embedding record from Vertex AI
 */
export interface VertexAIEmbedding {
  id: string;
  model: string;
  text: string;
  embedding: number[];
  statistics?: {
    truncated?: boolean;
    tokenCount?: number;
  };
  createdAt: string;
}

/**
 * Model record from Vertex AI Model Garden
 */
export interface VertexAIModel {
  name: string;
  displayName: string;
  description?: string;
  versionId?: string;
  versionAliases?: string[];
  versionDescription?: string;
  versionCreateTime?: string;
  versionUpdateTime?: string;
  labels?: Record<string, string>;
  metadata?: Record<string, any>;
  supportedDeploymentResourcesTypes?: string[];
  supportedInputStorageFormats?: string[];
  supportedOutputStorageFormats?: string[];
  createTime: string;
  updateTime: string;
}

/**
 * Endpoint record (deployed model)
 */
export interface VertexAIEndpoint {
  name: string;
  displayName: string;
  description?: string;
  deployedModels?: Array<{
    id: string;
    model: string;
    displayName: string;
    createTime: string;
    dedicatedResources?: {
      machineSpec: {
        machineType: string;
        acceleratorType?: string;
        acceleratorCount?: number;
      };
      minReplicaCount: number;
      maxReplicaCount: number;
    };
    automaticResources?: {
      minReplicaCount: number;
      maxReplicaCount: number;
    };
  }>;
  trafficSplit?: Record<string, number>;
  labels?: Record<string, string>;
  createTime: string;
  updateTime: string;
  network?: string;
  encryptionSpec?: {
    kmsKeyName: string;
  };
}

/**
 * Batch prediction job
 */
export interface VertexAIBatchPrediction {
  name: string;
  displayName: string;
  model: string;
  inputConfig: {
    instancesFormat: string;
    gcsSource: {
      uris: string[];
    };
  };
  outputConfig: {
    predictionsFormat: string;
    gcsDestination: {
      outputUriPrefix: string;
    };
  };
  state: 'JOB_STATE_UNSPECIFIED' | 'JOB_STATE_QUEUED' | 'JOB_STATE_PENDING' |
         'JOB_STATE_RUNNING' | 'JOB_STATE_SUCCEEDED' | 'JOB_STATE_FAILED' |
         'JOB_STATE_CANCELLING' | 'JOB_STATE_CANCELLED' | 'JOB_STATE_PAUSED' |
         'JOB_STATE_EXPIRED';
  error?: {
    code: number;
    message: string;
    details?: any[];
  };
  createTime: string;
  startTime?: string;
  endTime?: string;
  updateTime: string;
  labels?: Record<string, string>;
}

/**
 * Training pipeline
 */
export interface VertexAITrainingPipeline {
  name: string;
  displayName: string;
  inputDataConfig: {
    datasetId: string;
    persistMlUseAssignment?: boolean;
  };
  trainingTaskDefinition: string;
  trainingTaskInputs: any;
  modelToUpload?: {
    displayName: string;
    description?: string;
  };
  state: 'PIPELINE_STATE_UNSPECIFIED' | 'PIPELINE_STATE_QUEUED' | 'PIPELINE_STATE_PENDING' |
         'PIPELINE_STATE_RUNNING' | 'PIPELINE_STATE_SUCCEEDED' | 'PIPELINE_STATE_FAILED' |
         'PIPELINE_STATE_CANCELLING' | 'PIPELINE_STATE_CANCELLED' | 'PIPELINE_STATE_PAUSED';
  error?: {
    code: number;
    message: string;
    details?: any[];
  };
  createTime: string;
  startTime?: string;
  endTime?: string;
  updateTime: string;
  labels?: Record<string, string>;
  modelId?: string;
}

// ============================================================================
// Webhook Event Types
// ============================================================================

/**
 * Vertex AI webhook event types (Pub/Sub notifications)
 */
export type VertexAIWebhookEventType =
  | 'model.created'
  | 'model.updated'
  | 'model.deleted'
  | 'endpoint.created'
  | 'endpoint.updated'
  | 'endpoint.deleted'
  | 'batch_prediction.completed'
  | 'batch_prediction.failed'
  | 'training_pipeline.completed'
  | 'training_pipeline.failed'
  | 'tuning_job.completed'
  | 'tuning_job.failed';

/**
 * Vertex AI webhook payload (from Pub/Sub)
 */
export interface VertexAIWebhookPayload {
  eventType: VertexAIWebhookEventType;
  timestamp: string;
  resourceName: string;
  resourceType: string;
  projectId: string;
  location: string;
  // Resource-specific data
  model?: VertexAIModel;
  endpoint?: VertexAIEndpoint;
  batchPrediction?: VertexAIBatchPrediction;
  trainingPipeline?: VertexAITrainingPipeline;
  error?: {
    code: number;
    message: string;
    details?: any[];
  };
  labels?: Record<string, string>;
}

// ============================================================================
// Sync Options
// ============================================================================

/**
 * Vertex AI-specific sync options
 */
export interface VertexAISyncOptions {
  /**
   * Record types to sync
   */
  recordTypes?: VertexAIRecordType[];

  /**
   * Filter by resource names (full resource paths)
   */
  resourceNames?: string[];

  /**
   * Filter by labels
   */
  labels?: Record<string, string>;

  /**
   * Only sync resources updated after this timestamp
   */
  since?: string;

  /**
   * Maximum records per resource type
   */
  limit?: number;

  /**
   * Page size for list operations (default: 100, max: 1000)
   */
  pageSize?: number;

  /**
   * Include detailed metadata
   */
  includeMetadata?: boolean;
}

// ============================================================================
// Prediction Request/Response Types
// ============================================================================

/**
 * Prediction request
 */
export interface PredictionRequest {
  endpoint: string;
  instances: any[];
  parameters?: Record<string, any>;
}

/**
 * Prediction response
 */
export interface PredictionResponse {
  predictions: any[];
  deployedModelId?: string;
  model?: string;
  modelDisplayName?: string;
  modelVersionId?: string;
  metadata?: {
    tokenMetadata?: {
      inputTokenCount?: {
        totalTokens?: number;
        totalBillableCharacters?: number;
      };
      outputTokenCount?: {
        totalTokens?: number;
        totalBillableCharacters?: number;
      };
    };
  };
}

/**
 * Streaming prediction chunk
 */
export interface StreamPredictionChunk {
  outputs: any[];
  modelVersionId?: string;
}

/**
 * Embedding request
 */
export interface EmbeddingRequest {
  model: string;
  instances: Array<{
    content?: string;
    taskType?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' | 'CLASSIFICATION' | 'CLUSTERING';
  }>;
}

/**
 * Embedding response
 */
export interface EmbeddingResponse {
  predictions: Array<{
    embeddings: {
      statistics?: {
        truncated: boolean;
        tokenCount: number;
      };
      values: number[];
    };
  }>;
  metadata?: Record<string, any>;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const VertexAIServiceAccountAuthConfigSchema = z.object({
  type: z.literal('service_account'),
  serviceAccountEmail: z.string().email(),
  privateKey: z.string().min(1),
  projectId: z.string().min(1)
});

export const VertexAIOAuth2AuthConfigSchema = z.object({
  type: z.literal('oauth2'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  scopes: z.array(z.string()).optional()
});

export const VertexAIADCAuthConfigSchema = z.object({
  type: z.literal('adc'),
  projectId: z.string().min(1)
});

export const VertexAIAuthConfigSchema = z.discriminatedUnion('type', [
  VertexAIServiceAccountAuthConfigSchema,
  VertexAIOAuth2AuthConfigSchema,
  VertexAIADCAuthConfigSchema
]);

export const VertexAIConnectorConfigSchema = z.object({
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  location: z.string().min(1),
  auth: VertexAIAuthConfigSchema,
  baseUrl: z.string().url().optional(),
  timeout: z.number().positive().optional(),
  headers: z.record(z.string()).optional(),
  rateLimit: z.object({
    maxRequestsPerSecond: z.number().positive(),
    maxRequestsPerHour: z.number().positive(),
    maxConcurrentRequests: z.number().positive()
  }).optional()
});

export const VertexAISyncOptionsSchema = z.object({
  recordTypes: z.array(z.enum([
    'prediction', 'embedding', 'model', 'endpoint',
    'batch_prediction', 'training_pipeline', 'dataset',
    'feature_store', 'tuning_job'
  ])).optional(),
  resourceNames: z.array(z.string()).optional(),
  labels: z.record(z.string()).optional(),
  since: z.string().datetime().optional(),
  limit: z.number().positive().optional(),
  pageSize: z.number().positive().max(1000).optional(),
  includeMetadata: z.boolean().optional()
});

export const PredictionRequestSchema = z.object({
  endpoint: z.string().min(1),
  instances: z.array(z.any()),
  parameters: z.record(z.any()).optional()
});

export const EmbeddingRequestSchema = z.object({
  model: z.string().min(1),
  instances: z.array(z.object({
    content: z.string().optional(),
    taskType: z.enum(['RETRIEVAL_QUERY', 'RETRIEVAL_DOCUMENT', 'SEMANTIC_SIMILARITY', 'CLASSIFICATION', 'CLUSTERING']).optional()
  }))
});

// ============================================================================
// Connector Metadata
// ============================================================================

export const VERTEX_AI_CONNECTOR_METADATA = {
  name: 'vertex-ai',
  version: '1.0.0',
  displayName: 'Vertex AI',
  description: 'Connect to Google Cloud Vertex AI for predictions, embeddings, and model management',
  recordTypes: [
    'prediction',
    'embedding',
    'model',
    'endpoint',
    'batch_prediction',
    'training_pipeline',
    'dataset',
    'feature_store',
    'tuning_job'
  ] as VertexAIRecordType[],
  authMethods: ['service_account', 'oauth2'] as const,
  supportsIncremental: true,
  supportsWebhooks: true,
  rateLimits: {
    requestsPerSecond: 10,
    requestsPerHour: 60000
  },
  capabilities: [
    'sync',
    'webhook',
    'predict',
    'embed',
    'stream_predict',
    'batch_predict',
    'model_management',
    'endpoint_management'
  ],
  documentationUrl: 'https://cloud.google.com/vertex-ai/docs/reference/rest'
} as const;
