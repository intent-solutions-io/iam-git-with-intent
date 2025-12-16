/**
 * Git With Intent - A2A Gateway
 *
 * R3: Cloud Run as gateway only (proxy to Agent Engine via REST)
 * NO agent logic - pure proxy to Vertex AI Reasoning Engines
 */

import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';

const app = express();
const PORT = process.env.PORT || 8080;

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// Environment
const config = {
  projectId: process.env.PROJECT_ID || '',
  location: process.env.LOCATION || 'us-central1',
  orchestratorEngineId: process.env.ORCHESTRATOR_ENGINE_ID || '',
  triageEngineId: process.env.TRIAGE_ENGINE_ID || '',
  resolverEngineId: process.env.RESOLVER_ENGINE_ID || '',
  reviewerEngineId: process.env.REVIEWER_ENGINE_ID || '',
  appName: process.env.APP_NAME || 'git-with-intent',
  appVersion: process.env.APP_VERSION || '0.1.0',
  spiffeId: process.env.AGENT_SPIFFE_ID || 'spiffe://intent.solutions/agent/gwi',
  env: process.env.DEPLOYMENT_ENV || 'dev',
};

// A2A Message schema
const A2AMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.enum(['task', 'response', 'heartbeat', 'error']),
  payload: z.record(z.unknown()),
  timestamp: z.number(),
  correlationId: z.string().optional(),
});

type A2AMessage = z.infer<typeof A2AMessageSchema>;

// Agent engine mapping
const agentEngines: Record<string, string> = {
  orchestrator: config.orchestratorEngineId,
  triage: config.triageEngineId,
  resolver: config.resolverEngineId,
  reviewer: config.reviewerEngineId,
};

/**
 * Health check endpoint
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    app: config.appName,
    version: config.appVersion,
    env: config.env,
    timestamp: Date.now(),
  });
});

/**
 * Agent card discovery endpoint (A2A protocol)
 */
app.get('/.well-known/agent.json', (_req, res) => {
  res.json({
    id: config.spiffeId,
    name: 'Git With Intent Gateway',
    description: 'A2A Gateway for AI-powered git workflow automation',
    version: config.appVersion,
    capabilities: [
      'pr-resolution',
      'issue-to-code',
      'code-review',
      'conflict-analysis',
    ],
    endpoints: {
      a2a: '/a2a',
      health: '/health',
      workflows: '/api/workflows',
    },
    agents: Object.keys(agentEngines).map(name => ({
      name,
      spiffeId: `${config.spiffeId}/${name}`,
      endpoint: `/a2a/${name}`,
    })),
    metadata: {
      owner: 'Intent Solutions',
      contact: 'jeremy@intentsolutions.io',
      repository: 'https://github.com/intent-solutions-io/git-with-intent',
    },
  });
});

/**
 * A2A message endpoint - routes to appropriate agent
 */
app.post('/a2a/:agent', async (req, res) => {
  const { agent } = req.params;
  const startTime = Date.now();

  try {
    // Validate agent exists
    const engineId = agentEngines[agent];
    if (!engineId) {
      return res.status(404).json({
        error: 'Agent not found',
        agent,
        availableAgents: Object.keys(agentEngines),
      });
    }

    // Validate message
    const parseResult = A2AMessageSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid A2A message',
        details: parseResult.error.errors,
      });
    }

    const message = parseResult.data;

    // R3: Proxy to Agent Engine (no agent logic here)
    const response = await proxyToAgentEngine(agent, engineId, message);

    // Audit log
    console.log(JSON.stringify({
      type: 'a2a_request',
      agent,
      messageId: message.id,
      messageType: message.type,
      from: message.from,
      durationMs: Date.now() - startTime,
      status: 'success',
    }));

    return res.json(response);
  } catch (error) {
    console.error(JSON.stringify({
      type: 'a2a_error',
      agent,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    }));

    return res.status(500).json({
      error: 'Agent execution failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Workflow endpoint - start a new workflow via orchestrator
 */
app.post('/api/workflows', async (req, res) => {
  const startTime = Date.now();

  try {
    const { type, input } = req.body;

    if (!type || !input) {
      return res.status(400).json({
        error: 'Missing required fields: type, input',
      });
    }

    // Create A2A message for orchestrator
    const message: A2AMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: config.spiffeId,
      to: `${config.spiffeId}/orchestrator`,
      type: 'task',
      payload: {
        taskType: 'workflow',
        workflowType: type,
        input,
      },
      timestamp: Date.now(),
    };

    // Route to orchestrator
    const response = await proxyToAgentEngine(
      'orchestrator',
      config.orchestratorEngineId,
      message
    );

    console.log(JSON.stringify({
      type: 'workflow_start',
      workflowType: type,
      messageId: message.id,
      durationMs: Date.now() - startTime,
    }));

    return res.json(response);
  } catch (error) {
    console.error(JSON.stringify({
      type: 'workflow_error',
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    }));

    return res.status(500).json({
      error: 'Workflow start failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Proxy request to Vertex AI Agent Engine
 * R3: Gateway is pure proxy - no agent logic
 */
async function proxyToAgentEngine(
  agent: string,
  engineId: string,
  message: A2AMessage
): Promise<unknown> {
  // Build Agent Engine URL
  const url = `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/reasoningEngines/${engineId}:query`;

  // Get access token
  const accessToken = await getAccessToken();

  // Make request to Agent Engine
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        message,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Agent Engine error (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  // Build A2A response
  return {
    id: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from: `${config.spiffeId}/${agent}`,
    to: message.from,
    type: 'response',
    payload: result,
    timestamp: Date.now(),
    correlationId: message.id,
  };
}

/**
 * Get access token for GCP (uses Application Default Credentials)
 */
async function getAccessToken(): Promise<string> {
  // In Cloud Run, ADC is automatically available
  const metadataUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

  const response = await fetch(metadataUrl, {
    headers: {
      'Metadata-Flavor': 'Google',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(JSON.stringify({
    type: 'startup',
    app: config.appName,
    version: config.appVersion,
    env: config.env,
    port: PORT,
    timestamp: new Date().toISOString(),
  }));
});

export { app };
