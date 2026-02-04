/**
 * GWI MCP Server - Model Context Protocol Server for AI Agents
 *
 * EPIC 024: IAM Department Architecture Port
 * Hard Mode Rule R3: Gateway Separation
 *
 * This MCP server provides standardized tool access for AI coding assistants:
 * - VS Code Copilot
 * - Cursor
 * - Windsurf
 * - Claude Code
 * - Custom agents
 *
 * Deployed to Cloud Run as a REST proxy (R3 compliant).
 * Does NOT run agent Runners locally - proxies to Agent Engine.
 *
 * Tools provided:
 * - gwi_triage: PR complexity scoring
 * - gwi_resolve: Merge conflict resolution
 * - gwi_review: Code review generation
 * - gwi_issue_to_code: Issue → PR generation
 * - gwi_pipeline: Full SWE audit pipeline
 * - gwi_status: Run status queries
 * - gwi_approve: Approval gating
 */

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { createLogger } from '@gwi/core';

const logger = createLogger('mcp-server');

// MCP Protocol Types
const MCPRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

const MCPToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.unknown()),
    required: z.array(z.string()).optional(),
  }),
});

type MCPRequest = z.infer<typeof MCPRequestSchema>;
type MCPTool = z.infer<typeof MCPToolSchema>;

// Tool Definitions
const TOOLS: MCPTool[] = [
  {
    name: 'gwi_triage',
    description: 'Analyze PR complexity and recommend handling approach (auto-resolve, agent-resolve, or human-required)',
    inputSchema: {
      type: 'object',
      properties: {
        pr_url: { type: 'string', description: 'GitHub PR URL' },
        repo: { type: 'string', description: 'Repository in owner/repo format' },
        pr_number: { type: 'number', description: 'PR number' },
      },
      required: ['pr_url'],
    },
  },
  {
    name: 'gwi_resolve',
    description: 'Resolve merge conflicts semantically using AI',
    inputSchema: {
      type: 'object',
      properties: {
        pr_url: { type: 'string', description: 'GitHub PR URL with conflicts' },
        strategy: {
          type: 'string',
          enum: ['semantic', 'ours', 'theirs', 'union'],
          description: 'Resolution strategy',
        },
        dry_run: { type: 'boolean', description: 'Preview without applying' },
      },
      required: ['pr_url'],
    },
  },
  {
    name: 'gwi_review',
    description: 'Generate AI code review for a PR or local changes',
    inputSchema: {
      type: 'object',
      properties: {
        pr_url: { type: 'string', description: 'GitHub PR URL (optional for local review)' },
        local: { type: 'boolean', description: 'Review local staged changes' },
        focus_areas: {
          type: 'array',
          items: { type: 'string' },
          description: 'Areas to focus on (security, performance, etc.)',
        },
      },
    },
  },
  {
    name: 'gwi_issue_to_code',
    description: 'Generate a PR from a GitHub issue',
    inputSchema: {
      type: 'object',
      properties: {
        issue_url: { type: 'string', description: 'GitHub issue URL' },
        branch_name: { type: 'string', description: 'Branch name for the PR' },
        auto_pr: { type: 'boolean', description: 'Automatically create PR' },
      },
      required: ['issue_url'],
    },
  },
  {
    name: 'gwi_pipeline',
    description: 'Run full SWE audit pipeline: audit → issues → plans → fixes → qa → docs',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository path or URL' },
        type: {
          type: 'string',
          enum: ['full_audit', 'targeted_fix', 'security_scan', 'docs_refresh', 'test_coverage', 'migration'],
          description: 'Pipeline type',
        },
        targets: {
          type: 'array',
          items: { type: 'string' },
          description: 'Target files/directories (optional filter)',
        },
        max_risk_tier: {
          type: 'string',
          enum: ['R0', 'R1', 'R2', 'R3', 'R4'],
          description: 'Maximum risk tier to execute',
        },
        dry_run: { type: 'boolean', description: 'Preview without applying changes' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'gwi_status',
    description: 'Get status of a GWI run',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Run ID to query' },
        verbose: { type: 'boolean', description: 'Include full details' },
      },
      required: ['run_id'],
    },
  },
  {
    name: 'gwi_approve',
    description: 'Approve a pending run with specific scopes',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Run ID to approve' },
        scopes: {
          type: 'array',
          items: { type: 'string', enum: ['commit', 'push', 'open_pr', 'merge', 'deploy'] },
          description: 'Approval scopes',
        },
        reason: { type: 'string', description: 'Approval reason' },
      },
      required: ['run_id', 'scopes'],
    },
  },
];

// Server capabilities
const SERVER_INFO = {
  name: 'gwi-mcp-server',
  version: '0.6.0',
  protocolVersion: '2024-11-05',
  capabilities: {
    tools: {},
    resources: {},
    prompts: {},
  },
};

const app = new Hono();

// Middleware
app.use('*', cors());

// Health check
app.get('/health', (c: Context) => c.json({ status: 'healthy', version: SERVER_INFO.version }));

// MCP JSON-RPC endpoint
app.post('/mcp', async (c: Context) => {
  const body = await c.req.json();

  // Handle batch requests
  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map(handleRequest));
    return c.json(responses);
  }

  const response = await handleRequest(body);
  return c.json(response);
});

// SSE endpoint for streaming (MCP 2024-11-05)
app.get('/mcp/sse', async (c: Context) => {
  return c.text('SSE endpoint - TODO: implement streaming', 501);
});

async function handleRequest(request: unknown) {
  try {
    const parsed = MCPRequestSchema.parse(request);
    return await routeMethod(parsed);
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: (request as MCPRequest)?.id ?? null,
      error: {
        code: -32600,
        message: 'Invalid Request',
        data: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function routeMethod(request: MCPRequest) {
  const { method, params, id } = request;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: SERVER_INFO,
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      };

    case 'tools/call':
      return await handleToolCall(id, params as { name: string; arguments: Record<string, unknown> });

    case 'resources/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { resources: [] },
      };

    case 'prompts/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { prompts: [] },
      };

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      };
  }
}

async function handleToolCall(
  id: string | number,
  params: { name: string; arguments: Record<string, unknown> }
) {
  const { name, arguments: args } = params;

  try {
    // TODO: Proxy to Agent Engine via REST API
    // For now, return placeholder response
    const result = await executeToolViaAgentEngine(name, args);

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      },
    };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: `Tool execution failed: ${name}`,
        data: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function executeToolViaAgentEngine(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  // Get Agent Engine ID from environment
  const orchestratorEngineId = process.env.ORCHESTRATOR_ENGINE_ID;
  const projectId = process.env.GCP_PROJECT_ID;
  const region = process.env.GCP_REGION || 'us-central1';

  if (!orchestratorEngineId || !projectId) {
    // Fallback to local execution for development
    return {
      status: 'development_mode',
      tool: toolName,
      args,
      message: 'Agent Engine not configured. Set ORCHESTRATOR_ENGINE_ID and GCP_PROJECT_ID.',
    };
  }

  // In production, proxy to Agent Engine REST API
  // Format: https://{region}-aiplatform.googleapis.com/v1/{engineId}:query
  const endpoint = `https://${region}-aiplatform.googleapis.com/v1/${orchestratorEngineId}:query`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getAccessToken()}`,
    },
    body: JSON.stringify({
      input: {
        tool: toolName,
        arguments: args,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Agent Engine request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function getAccessToken(): Promise<string> {
  // Use Application Default Credentials (ADC)
  // In Cloud Run, this automatically uses the service account
  const metadataUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

  try {
    const response = await fetch(metadataUrl, {
      headers: { 'Metadata-Flavor': 'Google' },
    });

    if (!response.ok) {
      throw new Error('Failed to get access token from metadata server');
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  } catch {
    // Fallback: try gcloud auth (for local development)
    return process.env.GOOGLE_ACCESS_TOKEN || '';
  }
}

// Export for Cloud Run
export default app;

// Local development server
if (process.env.NODE_ENV !== 'production') {
  const port = parseInt(process.env.PORT || '3100');
  logger.info('GWI MCP Server starting', { port });
  logger.info('Tools available', { tools: TOOLS.map(t => t.name) });

  // @ts-ignore - Bun/Node compatibility
  const server = Bun?.serve?.({ port, fetch: app.fetch }) || app;
}
