import { GoogleAuth, JWT, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import axios, { type AxiosInstance } from 'axios';
import type { IConnector } from '../interfaces/IConnector.js';
import type {
  ConnectorConfig,
  AuthResult,
  HealthStatus,
  SyncOptions,
  ConnectorRecord,
  WebhookEvent,
  WebhookResult,
  ConnectorMetadata
} from '../interfaces/types.js';
import { BaseConnector, type ILogger, type IMetrics } from '../core/base-connector.js';
import { AuthenticationError, ConnectorError, ValidationError } from '../errors/index.js';
import {
  type VertexAIConnectorConfig,
  type VertexAISyncOptions,
  type VertexAIModel,
  type VertexAIEndpoint,
  type VertexAIBatchPrediction,
  type VertexAITrainingPipeline,
  type VertexAIWebhookPayload,
  type PredictionRequest,
  type PredictionResponse,
  type StreamPredictionChunk,
  type EmbeddingRequest,
  type EmbeddingResponse,
  VertexAIConnectorConfigSchema,
  VertexAISyncOptionsSchema,
  PredictionRequestSchema,
  EmbeddingRequestSchema,
  VERTEX_AI_CONNECTOR_METADATA
} from './types.js';

/**
 * Vertex AI Connector
 *
 * Full-featured connector for Google Cloud Vertex AI with:
 * - Service Account/OAuth/ADC authentication
 * - Prediction and embedding APIs
 * - Model and endpoint management
 * - Batch predictions and training pipelines
 * - Streaming predictions
 * - Pub/Sub webhook processing
 *
 * @module @gwi/connectors/vertex-ai
 */
export class VertexAIConnector extends BaseConnector implements IConnector {
  readonly name = 'vertex-ai';
  readonly version = '1.0.0';
  readonly configSchema = VertexAIConnectorConfigSchema as any;

  private client: AxiosInstance | null = null;
  private auth: GoogleAuth | JWT | OAuth2Client | null = null;
  private config: VertexAIConnectorConfig | null = null;
  private accessToken: string | null = null;

  constructor(logger?: ILogger, metrics?: IMetrics) {
    super(logger, metrics);
  }

  // ============================================================================
  // IConnector Implementation
  // ============================================================================

  /**
   * Authenticate with Vertex AI
   *
   * Supports:
   * - Service Account credentials
   * - OAuth 2.0
   * - Application Default Credentials (ADC)
   */
  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    try {
      // Validate configuration
      const vaiConfig = VertexAIConnectorConfigSchema.parse(config) as VertexAIConnectorConfig;
      this.config = vaiConfig;

      // Create auth client based on auth type
      switch (vaiConfig.auth.type) {
        case 'service_account':
          this.auth = new JWT({
            email: vaiConfig.auth.serviceAccountEmail,
            key: vaiConfig.auth.privateKey,
            scopes: [
              'https://www.googleapis.com/auth/cloud-platform',
              'https://www.googleapis.com/auth/cloud-platform.read-only'
            ]
          });
          break;

        case 'oauth2':
          this.auth = new OAuth2Client({
            clientId: vaiConfig.auth.clientId,
            clientSecret: vaiConfig.auth.clientSecret,
            redirectUri: vaiConfig.auth.redirectUri
          });

          if (vaiConfig.auth.accessToken) {
            this.auth.setCredentials({
              access_token: vaiConfig.auth.accessToken,
              refresh_token: vaiConfig.auth.refreshToken
            });
          }
          break;

        case 'adc':
          this.auth = new GoogleAuth({
            projectId: vaiConfig.auth.projectId,
            scopes: [
              'https://www.googleapis.com/auth/cloud-platform',
              'https://www.googleapis.com/auth/cloud-platform.read-only'
            ]
          });
          break;

        default:
          throw new AuthenticationError('Unknown auth type', this.name);
      }

      // Get access token
      const tokenResponse = await this.auth.getAccessToken();
      const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;

      if (!token) {
        throw new AuthenticationError('Failed to obtain access token', this.name);
      }

      this.accessToken = token;

      // Create axios client
      const baseUrl = vaiConfig.baseUrl ||
        `https://${vaiConfig.location}-aiplatform.googleapis.com/v1`;

      this.client = axios.create({
        baseURL: baseUrl,
        timeout: vaiConfig.timeout ?? 60000,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          ...vaiConfig.headers
        }
      });

      // Add response interceptor for token refresh
      this.client.interceptors.response.use(
        response => response,
        async error => {
          if (error.response?.status === 401 && this.auth) {
            // Token expired, refresh it
            const tokenResponse = await this.auth.getAccessToken();
            const refreshedToken = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;

            if (refreshedToken) {
              this.accessToken = refreshedToken;
              error.config.headers.Authorization = `Bearer ${this.accessToken}`;
              return this.client!.request(error.config);
            }
          }
          throw error;
        }
      );

      this.logger.info('Vertex AI authentication successful', {
        tenantId: vaiConfig.tenantId,
        projectId: vaiConfig.projectId,
        location: vaiConfig.location,
        authType: vaiConfig.auth.type
      });

      return {
        success: true,
        token: this.accessToken || undefined,
        metadata: {
          projectId: vaiConfig.projectId,
          location: vaiConfig.location,
          authType: vaiConfig.auth.type
        }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(
          `Invalid Vertex AI configuration: ${error.message}`,
          this.name,
          error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        );
      }

      if (error instanceof AuthenticationError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new AuthenticationError(`Vertex AI authentication failed: ${message}`, this.name);
    }
  }

  /**
   * Check Vertex AI API health
   */
  async healthCheck(): Promise<HealthStatus> {
    const checks: Array<{
      name: string;
      status: 'pass' | 'fail' | 'warn';
      durationMs: number;
      error?: string;
    }> = [];

    // Check 1: API connectivity
    const apiStart = Date.now();
    try {
      if (!this.client || !this.config) {
        throw new Error('Not authenticated');
      }

      // Try to list models (lightweight operation)
      await this.client.get(
        `/projects/${this.config.projectId}/locations/${this.config.location}/models`,
        { params: { pageSize: 1 } }
      );

      checks.push({
        name: 'api_connectivity',
        status: 'pass',
        durationMs: Date.now() - apiStart
      });
    } catch (error) {
      checks.push({
        name: 'api_connectivity',
        status: 'fail',
        durationMs: Date.now() - apiStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Check 2: Authentication validity
    const authStart = Date.now();
    try {
      if (this.auth) {
        const tokenResponse = await this.auth.getAccessToken();
        const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;

        if (!token) {
          throw new Error('No access token returned');
        }

        checks.push({
          name: 'authentication',
          status: 'pass',
          durationMs: Date.now() - authStart
        });
      }
    } catch (error) {
      checks.push({
        name: 'authentication',
        status: 'fail',
        durationMs: Date.now() - authStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Check 3: Project access
    const projectStart = Date.now();
    try {
      if (this.client && this.config) {
        // Verify we can access the project location
        await this.client.get(
          `/projects/${this.config.projectId}/locations/${this.config.location}`
        );

        checks.push({
          name: 'project_access',
          status: 'pass',
          durationMs: Date.now() - projectStart
        });
      }
    } catch (error) {
      checks.push({
        name: 'project_access',
        status: 'fail',
        durationMs: Date.now() - projectStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const healthy = checks.every(c => c.status !== 'fail');

    return {
      healthy,
      timestamp: new Date().toISOString(),
      connector: this.name,
      checks
    };
  }

  /**
   * Sync data from Vertex AI
   *
   * Supports:
   * - Models
   * - Endpoints
   * - Batch predictions
   * - Training pipelines
   */
  async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
    if (!this.client || !this.config) {
      throw new ConnectorError('Not authenticated. Call authenticate() first.', this.name);
    }

    // Parse Vertex AI-specific options
    const vaiOptions = VertexAISyncOptionsSchema.parse(options) as VertexAISyncOptions;

    await this.onBeforeSync(options);

    let recordsProcessed = 0;
    const errors: Error[] = [];

    try {
      // Default to model sync if no types specified
      const recordTypes = vaiOptions.recordTypes ?? ['model'];

      // Sync models
      if (recordTypes.includes('model')) {
        yield* this.syncModels(vaiOptions);
        recordsProcessed++;
      }

      // Sync endpoints
      if (recordTypes.includes('endpoint')) {
        yield* this.syncEndpoints(vaiOptions);
        recordsProcessed++;
      }

      // Sync batch predictions
      if (recordTypes.includes('batch_prediction')) {
        yield* this.syncBatchPredictions(vaiOptions);
        recordsProcessed++;
      }

      // Sync training pipelines
      if (recordTypes.includes('training_pipeline')) {
        yield* this.syncTrainingPipelines(vaiOptions);
        recordsProcessed++;
      }

      await this.onAfterSync({
        cursor: null,
        recordsProcessed,
        errors
      });
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
      await this.onError(errors[0]);
      throw error;
    }
  }

  /**
   * Process incoming Vertex AI webhook (Pub/Sub notification)
   */
  async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
    const startTime = Date.now();

    try {
      // Parse payload
      const payload = event.payload as VertexAIWebhookPayload;

      this.logger.info('Processing Vertex AI webhook', {
        eventId: event.id,
        eventType: payload.eventType,
        resourceName: payload.resourceName,
        resourceType: payload.resourceType
      });

      let recordsProcessed = 0;

      // Handle different event types
      switch (payload.eventType) {
        case 'model.created':
        case 'model.updated':
        case 'model.deleted':
          if (payload.model) {
            recordsProcessed = 1;
          }
          break;

        case 'endpoint.created':
        case 'endpoint.updated':
        case 'endpoint.deleted':
          if (payload.endpoint) {
            recordsProcessed = 1;
          }
          break;

        case 'batch_prediction.completed':
        case 'batch_prediction.failed':
          if (payload.batchPrediction) {
            recordsProcessed = 1;
          }
          break;

        case 'training_pipeline.completed':
        case 'training_pipeline.failed':
          if (payload.trainingPipeline) {
            recordsProcessed = 1;
          }
          break;

        default:
          this.logger.debug('Unhandled webhook event type', { type: payload.eventType });
      }

      return {
        success: true,
        durationMs: Date.now() - startTime,
        recordsProcessed,
        metadata: {
          eventType: payload.eventType,
          resourceName: payload.resourceName,
          resourceType: payload.resourceType
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error('Webhook processing failed', {
        eventId: event.id,
        error: message
      });

      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: message
      };
    }
  }

  /**
   * Get connector metadata
   */
  getMetadata(): ConnectorMetadata {
    return {
      name: VERTEX_AI_CONNECTOR_METADATA.name,
      version: this.version,
      recordTypes: [...VERTEX_AI_CONNECTOR_METADATA.recordTypes],
      authMethods: [...VERTEX_AI_CONNECTOR_METADATA.authMethods],
      supportsIncremental: VERTEX_AI_CONNECTOR_METADATA.supportsIncremental,
      supportsWebhooks: VERTEX_AI_CONNECTOR_METADATA.supportsWebhooks,
      rateLimits: { ...VERTEX_AI_CONNECTOR_METADATA.rateLimits },
      capabilities: [...VERTEX_AI_CONNECTOR_METADATA.capabilities],
      documentationUrl: VERTEX_AI_CONNECTOR_METADATA.documentationUrl
    };
  }

  // ============================================================================
  // Vertex AI-Specific Methods
  // ============================================================================

  /**
   * Make a prediction using a deployed endpoint
   */
  async predict(request: PredictionRequest): Promise<PredictionResponse> {
    if (!this.client || !this.config) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const validatedRequest = PredictionRequestSchema.parse(request);

    const { data } = await this.retryRequest(() =>
      this.client!.post(
        `/${validatedRequest.endpoint}:predict`,
        {
          instances: validatedRequest.instances,
          parameters: validatedRequest.parameters
        }
      )
    );

    return data;
  }

  /**
   * Stream predictions from a deployed endpoint
   */
  async *streamPredict(request: PredictionRequest): AsyncGenerator<StreamPredictionChunk> {
    if (!this.client || !this.config) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const validatedRequest = PredictionRequestSchema.parse(request);

    const response = await this.client.post(
      `/${validatedRequest.endpoint}:serverStreamingPredict`,
      {
        instances: validatedRequest.instances,
        parameters: validatedRequest.parameters
      },
      {
        responseType: 'stream'
      }
    );

    // Parse Server-Sent Events
    for await (const chunk of response.data) {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          yield data as StreamPredictionChunk;
        }
      }
    }
  }

  /**
   * Generate embeddings using Vertex AI text-embedding model
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (!this.client || !this.config) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const validatedRequest = EmbeddingRequestSchema.parse(request);

    const { data } = await this.retryRequest(() =>
      this.client!.post(
        `/projects/${this.config!.projectId}/locations/${this.config!.location}/publishers/google/models/${validatedRequest.model}:predict`,
        {
          instances: validatedRequest.instances
        }
      )
    );

    return data;
  }

  /**
   * Get model details
   */
  async getModel(modelName: string): Promise<VertexAIModel> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.get(`/${modelName}`)
    );

    return this.mapModel(data);
  }

  /**
   * List endpoints in the current location
   */
  async listEndpoints(): Promise<VertexAIEndpoint[]> {
    if (!this.client || !this.config) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const endpoints: VertexAIEndpoint[] = [];
    let pageToken: string | undefined;

    do {
      const { data } = await this.retryRequest(() =>
        this.client!.get(
          `/projects/${this.config!.projectId}/locations/${this.config!.location}/endpoints`,
          {
            params: {
              pageSize: 100,
              pageToken
            }
          }
        )
      );

      if (data.endpoints) {
        endpoints.push(...data.endpoints.map((e: any) => this.mapEndpoint(e)));
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return endpoints;
  }

  /**
   * Get endpoint details
   */
  async getEndpoint(endpointName: string): Promise<VertexAIEndpoint> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.get(`/${endpointName}`)
    );

    return this.mapEndpoint(data);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Sync models from Vertex AI
   */
  private async *syncModels(
    options: VertexAISyncOptions
  ): AsyncGenerator<ConnectorRecord> {
    if (!this.client || !this.config) return;

    let pageToken: string | undefined;
    const pageSize = options.pageSize ?? 100;

    do {
      const { data } = await this.retryRequest(() =>
        this.client!.get(
          `/projects/${this.config!.projectId}/locations/${this.config!.location}/models`,
          {
            params: {
              pageSize,
              pageToken,
              filter: options.labels ? this.buildLabelFilter(options.labels) : undefined
            }
          }
        )
      );

      if (data.models) {
        for (const model of data.models) {
          const mappedModel = this.mapModel(model);

          // Filter by since date if provided
          if (options.since && new Date(mappedModel.updateTime) < new Date(options.since)) {
            continue;
          }

          yield {
            id: `vertex-ai:model:${mappedModel.name}`,
            type: 'model',
            source: this.name,
            createdAt: mappedModel.createTime,
            updatedAt: mappedModel.updateTime,
            data: mappedModel
          };
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken && (!options.limit || pageToken));
  }

  /**
   * Sync endpoints from Vertex AI
   */
  private async *syncEndpoints(
    options: VertexAISyncOptions
  ): AsyncGenerator<ConnectorRecord> {
    if (!this.client || !this.config) return;

    let pageToken: string | undefined;
    const pageSize = options.pageSize ?? 100;

    do {
      const { data } = await this.retryRequest(() =>
        this.client!.get(
          `/projects/${this.config!.projectId}/locations/${this.config!.location}/endpoints`,
          {
            params: {
              pageSize,
              pageToken,
              filter: options.labels ? this.buildLabelFilter(options.labels) : undefined
            }
          }
        )
      );

      if (data.endpoints) {
        for (const endpoint of data.endpoints) {
          const mappedEndpoint = this.mapEndpoint(endpoint);

          // Filter by since date if provided
          if (options.since && new Date(mappedEndpoint.updateTime) < new Date(options.since)) {
            continue;
          }

          yield {
            id: `vertex-ai:endpoint:${mappedEndpoint.name}`,
            type: 'endpoint',
            source: this.name,
            createdAt: mappedEndpoint.createTime,
            updatedAt: mappedEndpoint.updateTime,
            data: mappedEndpoint
          };
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken && (!options.limit || pageToken));
  }

  /**
   * Sync batch predictions from Vertex AI
   */
  private async *syncBatchPredictions(
    options: VertexAISyncOptions
  ): AsyncGenerator<ConnectorRecord> {
    if (!this.client || !this.config) return;

    let pageToken: string | undefined;
    const pageSize = options.pageSize ?? 100;

    do {
      const { data } = await this.retryRequest(() =>
        this.client!.get(
          `/projects/${this.config!.projectId}/locations/${this.config!.location}/batchPredictionJobs`,
          {
            params: {
              pageSize,
              pageToken,
              filter: options.labels ? this.buildLabelFilter(options.labels) : undefined
            }
          }
        )
      );

      if (data.batchPredictionJobs) {
        for (const job of data.batchPredictionJobs) {
          const mappedJob = this.mapBatchPrediction(job);

          // Filter by since date if provided
          if (options.since && new Date(mappedJob.updateTime) < new Date(options.since)) {
            continue;
          }

          yield {
            id: `vertex-ai:batch-prediction:${mappedJob.name}`,
            type: 'batch_prediction',
            source: this.name,
            createdAt: mappedJob.createTime,
            updatedAt: mappedJob.updateTime,
            data: mappedJob
          };
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken && (!options.limit || pageToken));
  }

  /**
   * Sync training pipelines from Vertex AI
   */
  private async *syncTrainingPipelines(
    options: VertexAISyncOptions
  ): AsyncGenerator<ConnectorRecord> {
    if (!this.client || !this.config) return;

    let pageToken: string | undefined;
    const pageSize = options.pageSize ?? 100;

    do {
      const { data } = await this.retryRequest(() =>
        this.client!.get(
          `/projects/${this.config!.projectId}/locations/${this.config!.location}/trainingPipelines`,
          {
            params: {
              pageSize,
              pageToken,
              filter: options.labels ? this.buildLabelFilter(options.labels) : undefined
            }
          }
        )
      );

      if (data.trainingPipelines) {
        for (const pipeline of data.trainingPipelines) {
          const mappedPipeline = this.mapTrainingPipeline(pipeline);

          // Filter by since date if provided
          if (options.since && new Date(mappedPipeline.updateTime) < new Date(options.since)) {
            continue;
          }

          yield {
            id: `vertex-ai:training-pipeline:${mappedPipeline.name}`,
            type: 'training_pipeline',
            source: this.name,
            createdAt: mappedPipeline.createTime,
            updatedAt: mappedPipeline.updateTime,
            data: mappedPipeline
          };
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken && (!options.limit || pageToken));
  }

  /**
   * Build label filter string for Vertex AI API
   */
  private buildLabelFilter(labels: Record<string, string>): string {
    return Object.entries(labels)
      .map(([key, value]) => `labels.${key}="${value}"`)
      .join(' AND ');
  }

  /**
   * Map Vertex AI model response to our type
   */
  private mapModel(model: any): VertexAIModel {
    return {
      name: model.name,
      displayName: model.displayName,
      description: model.description,
      versionId: model.versionId,
      versionAliases: model.versionAliases || [],
      versionDescription: model.versionDescription,
      versionCreateTime: model.versionCreateTime,
      versionUpdateTime: model.versionUpdateTime,
      labels: model.labels || {},
      metadata: model.metadata,
      supportedDeploymentResourcesTypes: model.supportedDeploymentResourcesTypes || [],
      supportedInputStorageFormats: model.supportedInputStorageFormats || [],
      supportedOutputStorageFormats: model.supportedOutputStorageFormats || [],
      createTime: model.createTime,
      updateTime: model.updateTime
    };
  }

  /**
   * Map Vertex AI endpoint response to our type
   */
  private mapEndpoint(endpoint: any): VertexAIEndpoint {
    return {
      name: endpoint.name,
      displayName: endpoint.displayName,
      description: endpoint.description,
      deployedModels: endpoint.deployedModels?.map((dm: any) => ({
        id: dm.id,
        model: dm.model,
        displayName: dm.displayName,
        createTime: dm.createTime,
        dedicatedResources: dm.dedicatedResources ? {
          machineSpec: {
            machineType: dm.dedicatedResources.machineSpec.machineType,
            acceleratorType: dm.dedicatedResources.machineSpec.acceleratorType,
            acceleratorCount: dm.dedicatedResources.machineSpec.acceleratorCount
          },
          minReplicaCount: dm.dedicatedResources.minReplicaCount,
          maxReplicaCount: dm.dedicatedResources.maxReplicaCount
        } : undefined,
        automaticResources: dm.automaticResources ? {
          minReplicaCount: dm.automaticResources.minReplicaCount,
          maxReplicaCount: dm.automaticResources.maxReplicaCount
        } : undefined
      })) || [],
      trafficSplit: endpoint.trafficSplit || {},
      labels: endpoint.labels || {},
      createTime: endpoint.createTime,
      updateTime: endpoint.updateTime,
      network: endpoint.network,
      encryptionSpec: endpoint.encryptionSpec ? {
        kmsKeyName: endpoint.encryptionSpec.kmsKeyName
      } : undefined
    };
  }

  /**
   * Map Vertex AI batch prediction response to our type
   */
  private mapBatchPrediction(job: any): VertexAIBatchPrediction {
    return {
      name: job.name,
      displayName: job.displayName,
      model: job.model,
      inputConfig: {
        instancesFormat: job.inputConfig.instancesFormat,
        gcsSource: {
          uris: job.inputConfig.gcsSource.uris
        }
      },
      outputConfig: {
        predictionsFormat: job.outputConfig.predictionsFormat,
        gcsDestination: {
          outputUriPrefix: job.outputConfig.gcsDestination.outputUriPrefix
        }
      },
      state: job.state,
      error: job.error,
      createTime: job.createTime,
      startTime: job.startTime,
      endTime: job.endTime,
      updateTime: job.updateTime,
      labels: job.labels || {}
    };
  }

  /**
   * Map Vertex AI training pipeline response to our type
   */
  private mapTrainingPipeline(pipeline: any): VertexAITrainingPipeline {
    return {
      name: pipeline.name,
      displayName: pipeline.displayName,
      inputDataConfig: {
        datasetId: pipeline.inputDataConfig.datasetId,
        persistMlUseAssignment: pipeline.inputDataConfig.persistMlUseAssignment
      },
      trainingTaskDefinition: pipeline.trainingTaskDefinition,
      trainingTaskInputs: pipeline.trainingTaskInputs,
      modelToUpload: pipeline.modelToUpload ? {
        displayName: pipeline.modelToUpload.displayName,
        description: pipeline.modelToUpload.description
      } : undefined,
      state: pipeline.state,
      error: pipeline.error,
      createTime: pipeline.createTime,
      startTime: pipeline.startTime,
      endTime: pipeline.endTime,
      updateTime: pipeline.updateTime,
      labels: pipeline.labels || {},
      modelId: pipeline.modelId
    };
  }
}
