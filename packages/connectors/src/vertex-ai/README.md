# Vertex AI Connector

Connect to Google Cloud Vertex AI for predictions, embeddings, and model management.

## Features

- **Authentication**: Service Account, OAuth 2.0, and Application Default Credentials (ADC)
- **Predictions**: Real-time and streaming predictions using deployed endpoints
- **Embeddings**: Generate text embeddings for semantic search and similarity
- **Model Management**: List, retrieve, and sync models from Model Garden
- **Endpoint Management**: Manage deployed models and traffic splitting
- **Batch Predictions**: Async batch prediction jobs
- **Training Pipelines**: Monitor and sync training pipeline status
- **Webhooks**: Process Pub/Sub notifications for model/endpoint events

## Installation

```bash
npm install @gwi/connectors
```

## Authentication

### Service Account

```typescript
import { VertexAIConnector } from '@gwi/connectors/vertex-ai';

const connector = new VertexAIConnector();

await connector.authenticate({
  tenantId: 'my-tenant',
  projectId: 'my-gcp-project',
  location: 'us-central1',
  auth: {
    type: 'service_account',
    serviceAccountEmail: 'my-sa@my-project.iam.gserviceaccount.com',
    privateKey: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n',
    projectId: 'my-gcp-project'
  }
});
```

### Application Default Credentials (ADC)

```typescript
await connector.authenticate({
  tenantId: 'my-tenant',
  projectId: 'my-gcp-project',
  location: 'us-central1',
  auth: {
    type: 'adc',
    projectId: 'my-gcp-project'
  }
});
```

### OAuth 2.0

```typescript
await connector.authenticate({
  tenantId: 'my-tenant',
  projectId: 'my-gcp-project',
  location: 'us-central1',
  auth: {
    type: 'oauth2',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    redirectUri: 'https://yourapp.com/oauth/callback',
    accessToken: 'your-access-token',
    refreshToken: 'your-refresh-token'
  }
});
```

## Usage Examples

### Make Predictions

```typescript
const response = await connector.predict({
  endpoint: 'projects/my-project/locations/us-central1/endpoints/123456789',
  instances: [
    {
      prompt: 'Write a haiku about TypeScript'
    }
  ],
  parameters: {
    temperature: 0.7,
    maxOutputTokens: 256
  }
});

console.log(response.predictions);
```

### Stream Predictions

```typescript
for await (const chunk of connector.streamPredict({
  endpoint: 'projects/my-project/locations/us-central1/endpoints/123456789',
  instances: [{ prompt: 'Tell me a story' }]
})) {
  console.log(chunk.outputs);
}
```

### Generate Embeddings

```typescript
const response = await connector.embed({
  model: 'text-embedding-004',
  instances: [
    {
      content: 'Hello, world!',
      taskType: 'RETRIEVAL_DOCUMENT'
    },
    {
      content: 'What is the weather today?',
      taskType: 'RETRIEVAL_QUERY'
    }
  ]
});

// Access embeddings
const embeddings = response.predictions.map(p => p.embeddings.values);
console.log(embeddings[0].length); // 768 dimensions for text-embedding-004
```

### Sync Models

```typescript
// Sync all models
for await (const record of connector.sync({
  types: ['model']
})) {
  console.log('Model:', record.data.displayName);
}

// Sync with filters
for await (const record of connector.sync({
  types: ['model'],
  since: '2024-01-01T00:00:00Z',
  limit: 10
})) {
  console.log('Model:', record.data);
}
```

### Sync Endpoints

```typescript
for await (const record of connector.sync({
  types: ['endpoint']
})) {
  const endpoint = record.data;
  console.log('Endpoint:', endpoint.displayName);
  console.log('Deployed Models:', endpoint.deployedModels?.length);
  console.log('Traffic Split:', endpoint.trafficSplit);
}
```

### Get Model Details

```typescript
const model = await connector.getModel(
  'projects/my-project/locations/us-central1/models/123456789'
);

console.log('Model:', model.displayName);
console.log('Version:', model.versionId);
console.log('Labels:', model.labels);
```

### List Endpoints

```typescript
const endpoints = await connector.listEndpoints();

for (const endpoint of endpoints) {
  console.log('Endpoint:', endpoint.displayName);
  console.log('Deployed Models:', endpoint.deployedModels?.length);
}
```

### Health Check

```typescript
const health = await connector.healthCheck();

console.log('Healthy:', health.healthy);
console.log('Checks:', health.checks);

for (const check of health.checks) {
  console.log(`${check.name}: ${check.status} (${check.durationMs}ms)`);
}
```

### Process Webhooks

```typescript
import type { WebhookEvent } from '@gwi/connectors';

// In your webhook handler
const event: WebhookEvent = {
  id: 'webhook-123',
  source: 'vertex-ai',
  type: 'model.created',
  timestamp: new Date().toISOString(),
  payload: {
    eventType: 'model.created',
    resourceName: 'projects/my-project/locations/us-central1/models/123',
    resourceType: 'model',
    projectId: 'my-project',
    location: 'us-central1',
    model: {
      name: 'projects/my-project/locations/us-central1/models/123',
      displayName: 'My Model',
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString()
    }
  },
  signature: 'webhook-signature',
  headers: {}
};

const result = await connector.processWebhook(event);

if (result.success) {
  console.log('Processed', result.recordsProcessed, 'records');
} else {
  console.error('Webhook failed:', result.error);
}
```

## Configuration

### Rate Limiting

```typescript
await connector.authenticate({
  tenantId: 'my-tenant',
  projectId: 'my-gcp-project',
  location: 'us-central1',
  auth: { /* ... */ },
  rateLimit: {
    maxRequestsPerSecond: 10,
    maxRequestsPerHour: 60000,
    maxConcurrentRequests: 5
  }
});
```

### Custom Timeout

```typescript
await connector.authenticate({
  tenantId: 'my-tenant',
  projectId: 'my-gcp-project',
  location: 'us-central1',
  auth: { /* ... */ },
  timeout: 120000 // 2 minutes
});
```

### Custom Headers

```typescript
await connector.authenticate({
  tenantId: 'my-tenant',
  projectId: 'my-gcp-project',
  location: 'us-central1',
  auth: { /* ... */ },
  headers: {
    'X-Custom-Header': 'value'
  }
});
```

## Supported Record Types

- `prediction` - Real-time predictions
- `embedding` - Text embeddings
- `model` - Models from Model Garden
- `endpoint` - Deployed endpoints
- `batch_prediction` - Batch prediction jobs
- `training_pipeline` - Training pipelines
- `dataset` - Datasets
- `feature_store` - Feature Store resources
- `tuning_job` - Model tuning jobs

## Webhook Events

- `model.created` - Model created
- `model.updated` - Model updated
- `model.deleted` - Model deleted
- `endpoint.created` - Endpoint created
- `endpoint.updated` - Endpoint updated
- `endpoint.deleted` - Endpoint deleted
- `batch_prediction.completed` - Batch prediction completed
- `batch_prediction.failed` - Batch prediction failed
- `training_pipeline.completed` - Training pipeline completed
- `training_pipeline.failed` - Training pipeline failed
- `tuning_job.completed` - Tuning job completed
- `tuning_job.failed` - Tuning job failed

## API Reference

See [Vertex AI REST API Documentation](https://cloud.google.com/vertex-ai/docs/reference/rest) for full API details.

## Error Handling

```typescript
import { AuthenticationError, ConnectorError, ValidationError } from '@gwi/connectors';

try {
  await connector.authenticate(config);
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed:', error.message);
  } else if (error instanceof ValidationError) {
    console.error('Invalid config:', error.validationErrors);
  } else if (error instanceof ConnectorError) {
    console.error('Connector error:', error.message);
  }
}
```

## Best Practices

1. **Use ADC in production**: Simplifies credential management
2. **Enable retry logic**: The connector automatically retries transient failures
3. **Monitor rate limits**: Check health status regularly
4. **Use streaming for long outputs**: Reduces latency for generated content
5. **Filter sync operations**: Use `since`, `limit`, and label filters to reduce data transfer
6. **Validate inputs**: All request types are validated with Zod schemas

## License

SEE LICENSE IN LICENSE
