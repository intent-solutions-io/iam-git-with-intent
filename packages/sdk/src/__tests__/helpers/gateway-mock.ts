/**
 * Gateway API Mock Server
 *
 * Epic D - Story 4: SDK Integration Tests Infrastructure
 *
 * Provides an in-memory Express server that mocks the Gateway API for integration testing.
 * Implements:
 * - SCIM 2.0 endpoints (Users, Groups)
 * - Connector Registry endpoints
 * - Workflow endpoints
 * - Rate limiting simulation
 * - Authentication validation
 */

import express, { type Express, type Request, type Response } from 'express';
import { type Server } from 'http';
import type { ScimUser, ScimGroup, ScimListResponse } from '../../types.js';

// =============================================================================
// Types
// =============================================================================

export interface GatewayMockOptions {
  scimBearerToken?: string;
  registryApiKey?: string;
  workflowApiKey?: string;
  port?: number;
  rateLimitRequests?: number;
  rateLimitWindow?: number;
}

export interface GatewayMock {
  url: string;
  port: number;
  close: () => Promise<void>;
  reset: () => void;
  addUser: (user: ScimUser) => void;
  addGroup: (group: ScimGroup) => void;
  getRequestCount: () => number;
}

interface MockStore {
  users: Map<string, ScimUser>;
  groups: Map<string, ScimGroup>;
  connectors: Map<string, any>;
  workflows: Map<string, any>;
  requestCounts: Map<string, number[]>;
}

// =============================================================================
// Gateway Mock Implementation
// =============================================================================

export async function createGatewayMock(
  options: GatewayMockOptions = {}
): Promise<GatewayMock> {
  const {
    scimBearerToken = 'test-scim-token',
    registryApiKey = 'test-registry-key',
    workflowApiKey = 'test-workflow-key',
    port = 0, // 0 = random port
    rateLimitRequests = 100,
    rateLimitWindow = 60000, // 1 minute
  } = options;

  const app: Express = express();
  const store: MockStore = {
    users: new Map(),
    groups: new Map(),
    connectors: new Map(),
    workflows: new Map(),
    requestCounts: new Map(),
  };

  // Middleware
  app.use(express.json());

  // Request counting for rate limiting
  app.use((req: Request, res: Response, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const timestamps = store.requestCounts.get(key) || [];

    // Remove old timestamps outside window
    const recent = timestamps.filter((ts) => now - ts < rateLimitWindow);
    recent.push(now);
    store.requestCounts.set(key, recent);

    if (recent.length > rateLimitRequests) {
      res.status(429).json({
        error: 'Too Many Requests',
        retryAfter: Math.ceil(rateLimitWindow / 1000),
      });
      return;
    }

    next();
  });

  // =============================================================================
  // SCIM 2.0 Endpoints
  // =============================================================================

  // SCIM auth middleware
  const scimAuth = (req: Request, res: Response, next: () => void) => {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${scimBearerToken}`) {
      res.status(401).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '401',
        detail: 'Authentication failed',
      });
      return;
    }
    next();
  };

  // List users
  app.get('/scim/v2/Users', scimAuth, (req: Request, res: Response) => {
    const startIndex = parseInt((req.query.startIndex as string) || '1', 10);
    const count = parseInt((req.query.count as string) || '100', 10);

    const allUsers = Array.from(store.users.values());
    const totalResults = allUsers.length;
    const paginatedUsers = allUsers.slice(startIndex - 1, startIndex - 1 + count);

    const response: ScimListResponse = {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults,
      startIndex,
      itemsPerPage: paginatedUsers.length,
      Resources: paginatedUsers,
    };

    res.json(response);
  });

  // Create user
  app.post('/scim/v2/Users', scimAuth, (req: Request, res: Response) => {
    const user = req.body as Partial<ScimUser>;

    // Check for duplicate userName
    const existing = Array.from(store.users.values()).find(
      (u) => u.userName === user.userName
    );
    if (existing) {
      res.status(409).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '409',
        detail: 'User already exists',
      });
      return;
    }

    const userId = `user-${Math.random().toString(36).substring(7)}`;
    const newUser: ScimUser = {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      meta: {
        resourceType: 'User',
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      },
      userName: user.userName || '',
      displayName: user.displayName,
      active: user.active ?? true,
      emails: user.emails || [],
      name: user.name,
      ...user,
      id: userId, // Set id AFTER spread to ensure it's not overwritten
    };

    store.users.set(userId, newUser);
    res.status(201).json(newUser);
  });

  // Get user
  app.get('/scim/v2/Users/:id', scimAuth, (req: Request, res: Response) => {
    const user = store.users.get(req.params.id);
    if (!user) {
      res.status(404).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'User not found',
      });
      return;
    }
    res.json(user);
  });

  // Update user
  app.put('/scim/v2/Users/:id', scimAuth, (req: Request, res: Response) => {
    const existing = store.users.get(req.params.id);
    if (!existing) {
      res.status(404).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'User not found',
      });
      return;
    }

    const userId = existing.id!; // Non-null assertion: user from store always has id
    const updated: ScimUser = {
      ...existing,
      ...req.body,
      id: userId, // Set id AFTER spread to ensure it's not overwritten
      meta: {
        ...existing.meta,
        lastModified: new Date().toISOString(),
      },
    };

    store.users.set(userId, updated);
    res.json(updated);
  });

  // Delete user
  app.delete('/scim/v2/Users/:id', scimAuth, (req: Request, res: Response) => {
    const deleted = store.users.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'User not found',
      });
      return;
    }
    res.status(204).send();
  });

  // List groups
  app.get('/scim/v2/Groups', scimAuth, (req: Request, res: Response) => {
    const startIndex = parseInt((req.query.startIndex as string) || '1', 10);
    const count = parseInt((req.query.count as string) || '100', 10);

    const allGroups = Array.from(store.groups.values());
    const totalResults = allGroups.length;
    const paginatedGroups = allGroups.slice(startIndex - 1, startIndex - 1 + count);

    const response: ScimListResponse = {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults,
      startIndex,
      itemsPerPage: paginatedGroups.length,
      Resources: paginatedGroups,
    };

    res.json(response);
  });

  // Create group
  app.post('/scim/v2/Groups', scimAuth, (req: Request, res: Response) => {
    const group = req.body as Partial<ScimGroup>;

    const groupId = `group-${Math.random().toString(36).substring(7)}`;
    const newGroup: ScimGroup = {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      meta: {
        resourceType: 'Group',
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      },
      displayName: group.displayName || '',
      members: group.members || [],
      ...group,
      id: groupId, // Set id AFTER spread to ensure it's not overwritten
    };

    store.groups.set(groupId, newGroup);
    res.status(201).json(newGroup);
  });

  // Get group
  app.get('/scim/v2/Groups/:id', scimAuth, (req: Request, res: Response) => {
    const group = store.groups.get(req.params.id);
    if (!group) {
      res.status(404).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'Group not found',
      });
      return;
    }
    res.json(group);
  });

  // Delete group
  app.delete('/scim/v2/Groups/:id', scimAuth, (req: Request, res: Response) => {
    const deleted = store.groups.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'Group not found',
      });
      return;
    }
    res.status(204).send();
  });

  // =============================================================================
  // Connector Registry Endpoints
  // =============================================================================

  // Registry auth middleware
  const registryAuth = (req: Request, res: Response, next: () => void) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== registryApiKey) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or missing API key',
      });
      return;
    }
    next();
  };

  // List connectors
  app.get('/api/v1/connectors', (req: Request, res: Response) => {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const allConnectors = Array.from(store.connectors.values());
    const total = allConnectors.length;
    const paginated = allConnectors.slice(offset, offset + limit);

    res.json({
      connectors: paginated,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  });

  // Search connectors
  app.get('/api/v1/connectors/search', (req: Request, res: Response) => {
    const query = (req.query.q as string) || '';
    const queryLower = query.toLowerCase();

    const results = Array.from(store.connectors.values()).filter(
      (connector) =>
        connector.name.toLowerCase().includes(queryLower) ||
        connector.description?.toLowerCase().includes(queryLower)
    );

    res.json({ connectors: results, total: results.length });
  });

  // Get connector
  app.get('/api/v1/connectors/:id', (req: Request, res: Response) => {
    const connector = store.connectors.get(req.params.id);
    if (!connector) {
      res.status(404).json({ error: 'Connector not found' });
      return;
    }
    res.json(connector);
  });

  // Publish connector (requires auth)
  app.post('/api/v1/connectors', registryAuth, (req: Request, res: Response) => {
    const { manifest, signature } = req.body;

    if (!manifest || !signature) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: manifest, signature',
      });
      return;
    }

    // Validate signature (simplified)
    if (!signature.checksum || !signature.signature) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid signature format',
      });
      return;
    }

    const connector = {
      id: manifest.id || `connector-${Math.random().toString(36).substring(7)}`,
      ...manifest,
      publishedAt: new Date().toISOString(),
      signature,
    };

    store.connectors.set(connector.id, connector);
    res.status(201).json(connector);
  });

  // =============================================================================
  // Workflow Endpoints
  // =============================================================================

  // Workflow auth middleware
  const workflowAuth = (req: Request, res: Response, next: () => void) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== workflowApiKey) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or missing API key',
      });
      return;
    }
    next();
  };

  // Create workflow
  app.post(
    '/api/v1/tenants/:tenantId/workflows',
    workflowAuth,
    (req: Request, res: Response) => {
      const { workflowType, input } = req.body;
      const tenantId = req.params.tenantId;

      if (!workflowType || !input) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required fields: workflowType, input',
        });
        return;
      }

      const workflow = {
        id: `wf-${Math.random().toString(36).substring(7)}`,
        tenantId,
        workflowType,
        input,
        status: 'created',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.workflows.set(workflow.id, workflow);
      res.status(201).json(workflow);
    }
  );

  // Get workflow
  app.get(
    '/api/v1/tenants/:tenantId/workflows/:id',
    workflowAuth,
    (req: Request, res: Response) => {
      const workflow = store.workflows.get(req.params.id);
      if (!workflow || workflow.tenantId !== req.params.tenantId) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }
      res.json(workflow);
    }
  );

  // List workflows
  app.get(
    '/api/v1/tenants/:tenantId/workflows',
    workflowAuth,
    (req: Request, res: Response) => {
      const tenantId = req.params.tenantId;
      const status = req.query.status as string | undefined;

      let workflows = Array.from(store.workflows.values()).filter(
        (wf) => wf.tenantId === tenantId
      );

      if (status) {
        workflows = workflows.filter((wf) => wf.status === status);
      }

      res.json({ workflows, total: workflows.length });
    }
  );

  // Approve workflow
  app.post(
    '/api/v1/tenants/:tenantId/workflows/:id/approve',
    workflowAuth,
    (req: Request, res: Response) => {
      const workflow = store.workflows.get(req.params.id);
      if (!workflow || workflow.tenantId !== req.params.tenantId) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      workflow.status = 'approved';
      workflow.approvedAt = new Date().toISOString();
      workflow.updatedAt = new Date().toISOString();
      store.workflows.set(workflow.id, workflow);

      res.json(workflow);
    }
  );

  // Reject workflow
  app.post(
    '/api/v1/tenants/:tenantId/workflows/:id/reject',
    workflowAuth,
    (req: Request, res: Response) => {
      const workflow = store.workflows.get(req.params.id);
      if (!workflow || workflow.tenantId !== req.params.tenantId) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      workflow.status = 'rejected';
      workflow.rejectedAt = new Date().toISOString();
      workflow.rejectedReason = req.body.reason;
      workflow.updatedAt = new Date().toISOString();
      store.workflows.set(workflow.id, workflow);

      res.json(workflow);
    }
  );

  // =============================================================================
  // Server Lifecycle
  // =============================================================================

  const server: Server = await new Promise((resolve) => {
    const srv = app.listen(port, () => resolve(srv));
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get server address');
  }

  const actualPort = address.port;
  const baseUrl = `http://localhost:${actualPort}`;

  return {
    url: baseUrl,
    port: actualPort,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
    reset: () => {
      store.users.clear();
      store.groups.clear();
      store.connectors.clear();
      store.workflows.clear();
      store.requestCounts.clear();
    },
    addUser: (user: ScimUser) => {
      store.users.set(user.id!, user); // Non-null assertion: test data always has id
    },
    addGroup: (group: ScimGroup) => {
      store.groups.set(group.id!, group); // Non-null assertion: test data always has id
    },
    getRequestCount: () => {
      return Array.from(store.requestCounts.values()).reduce(
        (sum, timestamps) => sum + timestamps.length,
        0
      );
    },
  };
}
