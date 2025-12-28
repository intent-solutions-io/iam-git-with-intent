# Example: Simple REST Connector

This example demonstrates how to build a basic REST API connector with bearer token authentication and cursor-based pagination.

## Overview

We'll build a connector for a hypothetical "TaskAPI" service that:
- Authenticates with bearer tokens
- Fetches tasks with cursor pagination
- Handles webhooks for real-time updates

## Complete Implementation

```typescript
// task-api-connector.ts
import {
  BaseConnector,
  IConnector,
  ConnectorConfig,
  AuthResult,
  HealthStatus,
  HealthCheck,
  SyncOptions,
  ConnectorRecord,
  WebhookEvent,
  WebhookResult,
  ConnectorMetadata,
  AuthenticationError,
  RateLimitError,
  ValidationError
} from '@gwi/connectors';
import { z } from 'zod';
import crypto from 'crypto';

// Configuration Schema
const TaskAPIConfigSchema = z.object({
  tenantId: z.string().min(1),
  auth: z.object({
    type: z.literal('bearer'),
    token: z.string().min(1)
  }),
  baseUrl: z.string().url().default('https://api.taskapi.example.com'),
  apiVersion: z.string().default('v1')
});

type TaskAPIConfig = z.infer<typeof TaskAPIConfigSchema>;

// Task record type from API
interface TaskAPITask {
  id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignee: string | null;
  created_at: string;
  updated_at: string;
  project_id: string;
}

// Paginated response from API
interface TaskAPIResponse {
  tasks: TaskAPITask[];
  next_cursor: string | null;
  total: number;
}

export class TaskAPIConnector extends BaseConnector implements IConnector {
  readonly name = 'taskapi';
  readonly version = '1.0.0';
  readonly configSchema = TaskAPIConfigSchema;

  private token: string = '';
  private baseUrl: string = 'https://api.taskapi.example.com';
  private apiVersion: string = 'v1';

  // ============================================================
  // AUTHENTICATION
  // ============================================================

  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    // Validate configuration
    const validated = this.configSchema.parse(config);

    // Store credentials
    this.token = validated.auth.token;
    this.baseUrl = validated.baseUrl || 'https://api.taskapi.example.com';
    this.apiVersion = validated.apiVersion || 'v1';

    // Test connection by fetching current user
    try {
      const response = await this.httpClient.get(
        `${this.baseUrl}/${this.apiVersion}/me`,
        { headers: this.getAuthHeaders() }
      );

      this.log('info', 'Authentication successful', {
        userId: response.data.id,
        email: response.data.email
      });

      return {
        success: true,
        token: this.token,
        metadata: {
          userId: response.data.id,
          email: response.data.email,
          organization: response.data.organization
        }
      };
    } catch (error: any) {
      if (error.statusCode === 401) {
        return {
          success: false,
          error: 'Invalid or expired API token'
        };
      }

      if (error.statusCode === 403) {
        return {
          success: false,
          error: 'Insufficient permissions. Token requires read:tasks scope.'
        };
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'X-API-Version': this.apiVersion
    };
  }

  // ============================================================
  // HEALTH CHECK
  // ============================================================

  async healthCheck(): Promise<HealthStatus> {
    const checks: HealthCheck[] = [];
    const overallStart = Date.now();

    // Check 1: Authentication
    const authCheck = await this.checkAuthentication();
    checks.push(authCheck);

    // Check 2: API Reachability
    const apiCheck = await this.checkAPIReachability();
    checks.push(apiCheck);

    // Check 3: Rate Limit Status
    const rateCheck = await this.checkRateLimitStatus();
    checks.push(rateCheck);

    // Aggregate results
    const healthy = checks.every(c => c.status !== 'fail');

    return {
      healthy,
      timestamp: new Date().toISOString(),
      connector: this.name,
      checks,
      error: healthy ? undefined : 'One or more health checks failed',
      metadata: {
        totalDurationMs: Date.now() - overallStart
      }
    };
  }

  private async checkAuthentication(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await this.httpClient.get(
        `${this.baseUrl}/${this.apiVersion}/me`,
        { headers: this.getAuthHeaders() }
      );

      return {
        name: 'auth_valid',
        status: 'pass',
        durationMs: Date.now() - start
      };
    } catch (error: any) {
      return {
        name: 'auth_valid',
        status: 'fail',
        durationMs: Date.now() - start,
        error: error.message
      };
    }
  }

  private async checkAPIReachability(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await this.httpClient.get(
        `${this.baseUrl}/health`,
        { timeout: 5000 }
      );

      return {
        name: 'api_reachable',
        status: 'pass',
        durationMs: Date.now() - start
      };
    } catch (error: any) {
      return {
        name: 'api_reachable',
        status: 'fail',
        durationMs: Date.now() - start,
        error: error.message
      };
    }
  }

  private async checkRateLimitStatus(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const response = await this.httpClient.get(
        `${this.baseUrl}/${this.apiVersion}/rate_limit`,
        { headers: this.getAuthHeaders() }
      );

      const remaining = response.data.remaining;
      const limit = response.data.limit;
      const percentUsed = ((limit - remaining) / limit) * 100;

      return {
        name: 'rate_limit_ok',
        status: percentUsed > 90 ? 'warn' : 'pass',
        durationMs: Date.now() - start,
        metadata: { remaining, limit, percentUsed: Math.round(percentUsed) }
      };
    } catch (error: any) {
      return {
        name: 'rate_limit_ok',
        status: 'warn',
        durationMs: Date.now() - start,
        error: 'Could not check rate limit status'
      };
    }
  }

  // ============================================================
  // SYNC
  // ============================================================

  async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
    this.log('info', 'Starting sync', { options });

    await this.onBeforeSync(options);

    const startTime = Date.now();
    let totalRecords = 0;
    let latestCursor: string | null = null;

    try {
      // Determine projects to sync
      const projects = options.resources?.filter(r => r.type === 'project') || [];

      if (projects.length === 0) {
        // Sync all accessible projects
        const allProjects = await this.fetchProjects();
        for (const project of allProjects) {
          projects.push({ type: 'project', id: project.id });
        }
      }

      // Sync tasks for each project
      for (const project of projects) {
        this.log('info', 'Syncing project', { projectId: project.id });

        for await (const record of this.syncProjectTasks(project.id, options)) {
          totalRecords++;
          yield record;

          // Check limit
          if (options.limit && totalRecords >= options.limit) {
            this.log('info', 'Reached sync limit', { limit: options.limit });
            return;
          }
        }
      }

      // Call success hook
      await this.onAfterSync({
        recordsProcessed: totalRecords,
        durationMs: Date.now() - startTime,
        cursor: latestCursor
      });

      this.log('info', 'Sync completed', { totalRecords, durationMs: Date.now() - startTime });

    } catch (error: any) {
      await this.onError(error, { options });
      throw error;
    }
  }

  private async *syncProjectTasks(
    projectId: string,
    options: SyncOptions
  ): AsyncIterator<ConnectorRecord> {
    let cursor: string | null = null;
    let pageCount = 0;

    do {
      pageCount++;
      this.log('debug', 'Fetching page', { projectId, pageCount, cursor });

      // Fetch page with retry
      const response = await this.retryRequest<TaskAPIResponse>(
        async () => {
          return await this.fetchTasksPage(projectId, cursor, options);
        },
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
          backoffMultiplier: 2,
          retryableErrors: this.isRetryableError.bind(this)
        }
      );

      // Transform and yield tasks
      for (const task of response.tasks) {
        yield this.transformTask(task, projectId);
      }

      // Get next cursor
      cursor = response.next_cursor;

      // Record metrics
      this.recordMetric('tasks_synced', response.tasks.length, {
        connector: this.name,
        projectId
      });

    } while (cursor);

    this.log('debug', 'Project sync complete', { projectId, pageCount });
  }

  private async fetchTasksPage(
    projectId: string,
    cursor: string | null,
    options: SyncOptions
  ): Promise<TaskAPIResponse> {
    const params: Record<string, string> = {
      limit: '100',
      project_id: projectId
    };

    if (cursor) {
      params.cursor = cursor;
    }

    // Incremental sync: only fetch updated tasks
    if (options.incremental?.startCursor) {
      params.updated_since = options.incremental.startCursor;
    }

    const response = await this.httpClient.get<TaskAPIResponse>(
      `${this.baseUrl}/${this.apiVersion}/tasks`,
      {
        headers: this.getAuthHeaders(),
        params
      }
    );

    return response.data;
  }

  private async fetchProjects(): Promise<Array<{ id: string; name: string }>> {
    const response = await this.httpClient.get(
      `${this.baseUrl}/${this.apiVersion}/projects`,
      { headers: this.getAuthHeaders() }
    );

    return response.data.projects;
  }

  private transformTask(task: TaskAPITask, projectId: string): ConnectorRecord {
    return {
      id: `task-${task.id}`,
      type: 'task',
      source: this.name,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      data: {
        taskId: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assignee: task.assignee,
        projectId: task.project_id
      },
      metadata: {
        url: `${this.baseUrl}/tasks/${task.id}`,
        syncedAt: new Date().toISOString()
      }
    };
  }

  private isRetryableError(error: any): boolean {
    // Retry on network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // Retry on 5xx errors
    if (error.statusCode >= 500 && error.statusCode < 600) {
      return true;
    }

    // Don't retry on 4xx (client errors)
    return false;
  }

  // ============================================================
  // WEBHOOKS
  // ============================================================

  async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
    const startTime = Date.now();

    this.log('info', 'Processing webhook', {
      eventId: event.id,
      type: event.type
    });

    // 1. Verify signature
    const secret = await this.getWebhookSecret();
    if (!this.verifySignature(event.payload, event.signature, secret)) {
      throw new ValidationError(
        'Invalid webhook signature',
        this.name,
        [{ field: 'signature', message: 'HMAC verification failed' }]
      );
    }

    // 2. Check idempotency
    const eventKey = `webhook:${event.id}`;
    const alreadyProcessed = await this.storage.hasKey(eventKey);
    if (alreadyProcessed) {
      this.log('info', 'Skipping duplicate webhook', { eventId: event.id });
      return {
        success: true,
        durationMs: 0,
        recordsProcessed: 0,
        metadata: { skipped: true, reason: 'duplicate' }
      };
    }

    // 3. Route to handler
    let recordsProcessed = 0;

    try {
      switch (event.type) {
        case 'task.created':
        case 'task.updated':
          recordsProcessed = await this.handleTaskEvent(event);
          break;

        case 'task.deleted':
          recordsProcessed = await this.handleTaskDeleted(event);
          break;

        case 'project.created':
        case 'project.updated':
          recordsProcessed = await this.handleProjectEvent(event);
          break;

        default:
          this.log('warn', 'Unhandled webhook type', { type: event.type });
      }

      // 4. Mark as processed
      await this.storage.setKey(eventKey, {
        processedAt: new Date().toISOString(),
        recordsProcessed
      }, { ttl: 86400 * 7 }); // 7 day TTL

      return {
        success: true,
        durationMs: Date.now() - startTime,
        recordsProcessed,
        metadata: { eventType: event.type }
      };

    } catch (error: any) {
      this.log('error', 'Webhook processing failed', {
        eventId: event.id,
        error: error.message
      });

      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: error.message
      };
    }
  }

  private async handleTaskEvent(event: WebhookEvent): Promise<number> {
    const task = event.payload.task;

    const record: ConnectorRecord = {
      id: `task-${task.id}`,
      type: 'task',
      source: this.name,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      data: {
        taskId: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        action: event.payload.action
      }
    };

    await this.storage.saveRecords([record]);
    return 1;
  }

  private async handleTaskDeleted(event: WebhookEvent): Promise<number> {
    const taskId = event.payload.task_id;

    await this.storage.deleteRecord(`task-${taskId}`);
    return 1;
  }

  private async handleProjectEvent(event: WebhookEvent): Promise<number> {
    const project = event.payload.project;

    const record: ConnectorRecord = {
      id: `project-${project.id}`,
      type: 'project',
      source: this.name,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      data: {
        projectId: project.id,
        name: project.name,
        action: event.payload.action
      }
    };

    await this.storage.saveRecords([record]);
    return 1;
  }

  private async getWebhookSecret(): Promise<string> {
    // In production, fetch from Secret Manager
    return process.env.TASKAPI_WEBHOOK_SECRET || '';
  }

  private verifySignature(
    payload: any,
    signature: string,
    secret: string
  ): boolean {
    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );
    } catch {
      return false;
    }
  }

  // ============================================================
  // METADATA
  // ============================================================

  getMetadata(): ConnectorMetadata {
    return {
      name: this.name,
      version: this.version,
      recordTypes: ['task', 'project'],
      authMethods: ['bearer'],
      supportsIncremental: true,
      supportsWebhooks: true,
      rateLimits: {
        requestsPerSecond: 10,
        requestsPerHour: 1000
      },
      capabilities: [
        'sync',
        'webhooks',
        'incremental',
        'pagination'
      ],
      documentationUrl: 'https://docs.taskapi.example.com/api'
    };
  }
}
```

## Usage

### Basic Sync

```typescript
import { ConnectorRegistry } from '@gwi/connectors';
import { TaskAPIConnector } from './task-api-connector';

// Create registry
const registry = new ConnectorRegistry();
registry.register('taskapi', (config) => new TaskAPIConnector());

// Get connector
const connector = await registry.get('taskapi', {
  tenantId: 'my-org',
  config: {
    tenantId: 'my-org',
    auth: { type: 'bearer', token: process.env.TASKAPI_TOKEN! }
  }
});

// Sync all tasks
for await (const record of connector.sync({})) {
  console.log(`Task: ${record.data.title} (${record.data.status})`);
}
```

### Incremental Sync

```typescript
// Sync only tasks updated after last sync
for await (const record of connector.sync({
  incremental: {
    cursorField: 'updated_at',
    startCursor: '2025-01-01T00:00:00Z'
  }
})) {
  console.log(`Updated: ${record.data.title}`);
}
```

### Specific Project Sync

```typescript
// Sync tasks from specific projects
for await (const record of connector.sync({
  resources: [
    { type: 'project', id: 'proj-123' },
    { type: 'project', id: 'proj-456' }
  ],
  limit: 100
})) {
  console.log(`Task: ${record.data.title}`);
}
```

## Tests

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskAPIConnector } from './task-api-connector';
import { MockHttpClient, MockStorage } from '@gwi/connectors/testing';

describe('TaskAPIConnector', () => {
  let connector: TaskAPIConnector;
  let mockHttp: MockHttpClient;

  beforeEach(() => {
    mockHttp = new MockHttpClient();
    connector = new TaskAPIConnector();
    connector.httpClient = mockHttp;
    connector.storage = new MockStorage();
  });

  describe('authenticate', () => {
    it('should authenticate successfully', async () => {
      mockHttp.get.mockResolvedValue({
        data: { id: 'user-1', email: 'test@example.com' }
      });

      const result = await connector.authenticate({
        tenantId: 'test',
        auth: { type: 'bearer', token: 'valid-token' }
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.email).toBe('test@example.com');
    });

    it('should fail with invalid token', async () => {
      mockHttp.get.mockRejectedValue({ statusCode: 401 });

      const result = await connector.authenticate({
        tenantId: 'test',
        auth: { type: 'bearer', token: 'invalid' }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });
  });

  describe('sync', () => {
    beforeEach(async () => {
      mockHttp.get.mockImplementation((url: string) => {
        if (url.includes('/me')) {
          return Promise.resolve({ data: { id: 'user-1' } });
        }
        if (url.includes('/projects')) {
          return Promise.resolve({
            data: { projects: [{ id: 'proj-1', name: 'Project 1' }] }
          });
        }
        if (url.includes('/tasks')) {
          return Promise.resolve({
            data: {
              tasks: [
                {
                  id: 'task-1',
                  title: 'Task 1',
                  status: 'todo',
                  priority: 'high',
                  created_at: '2025-01-01T00:00:00Z',
                  updated_at: '2025-01-02T00:00:00Z',
                  project_id: 'proj-1'
                }
              ],
              next_cursor: null,
              total: 1
            }
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      await connector.authenticate({
        tenantId: 'test',
        auth: { type: 'bearer', token: 'token' }
      });
    });

    it('should sync tasks', async () => {
      const records = [];
      for await (const record of connector.sync({})) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('task');
      expect(records[0].data.title).toBe('Task 1');
    });
  });
});
```

## Key Patterns

1. **Bearer Token Auth:** Simple header-based authentication
2. **Cursor Pagination:** Memory-efficient streaming of large datasets
3. **Retry Logic:** Exponential backoff for transient failures
4. **Webhook Verification:** HMAC signature validation
5. **Incremental Sync:** Only fetch updated records

---

**Next Example:** [OAuth Connector](./oauth-connector.md)
