/**
 * OpenAPI 3.0 Specification for Git With Intent API
 *
 * This specification defines all endpoints, request/response schemas,
 * authentication, and error codes for the Git With Intent SaaS platform.
 *
 * Serves as the source of truth for:
 * - API documentation
 * - Client SDK generation (OpenAPI Generator, Swagger Codegen)
 * - API testing and validation
 * - Type definitions and validation
 *
 * @module @gwi/core/openapi
 */

export const openAPISpec = {
  openapi: '3.0.3',
  info: {
    title: 'Git With Intent API',
    description: 'Multi-tenant SaaS API for intelligent Git workflow management',
    version: '1.0.0',
    contact: {
      name: 'Git With Intent Support',
      url: 'https://gitwithintent.com/support',
      email: 'api-support@gitwithintent.com',
    },
    license: {
      name: 'Proprietary',
      url: 'https://gitwithintent.com/license',
    },
  },
  servers: [
    {
      url: 'https://api.gitwithintent.com',
      description: 'Production server',
    },
    {
      url: 'http://localhost:8080',
      description: 'Development server',
    },
  ],
  security: [
    {
      bearerAuth: [],
    },
  ],
  tags: [
    {
      name: 'Health',
      description: 'Service health and status endpoints',
    },
    {
      name: 'Authentication',
      description: 'User authentication and signup',
    },
    {
      name: 'Tenants',
      description: 'Workspace/organization management',
    },
    {
      name: 'Members',
      description: 'Team member and invite management',
    },
    {
      name: 'Repositories',
      description: 'Connected repository management',
    },
    {
      name: 'Runs',
      description: 'AI agent run management and execution',
    },
    {
      name: 'Workflows',
      description: 'Advanced workflow orchestration',
    },
    {
      name: 'Settings',
      description: 'Tenant configuration and preferences',
    },
    {
      name: 'Observability',
      description: 'Monitoring and metrics endpoints',
    },
  ],
  paths: {
    '/health': {
      get: {
        operationId: 'getHealth',
        tags: ['Health'],
        summary: 'Service health check',
        description: 'Returns API service health status and version information',
        security: [],
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/HealthResponse',
                },
                example: {
                  status: 'healthy',
                  app: 'gwi-api',
                  version: '1.0.0',
                  env: 'production',
                  storeBackend: 'firestore',
                  timestamp: '2025-12-16T10:30:00Z',
                },
              },
            },
          },
          '503': {
            description: 'Service is unhealthy',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/metrics': {
      get: {
        operationId: 'getMetrics',
        tags: ['Observability'],
        summary: 'Retrieve API metrics and statistics',
        description: 'Returns aggregated metrics for monitoring and observability',
        security: [],
        responses: {
          '200': {
            description: 'Metrics retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/MetricsResponse',
                },
              },
            },
          },
        },
      },
    },
    '/signup': {
      post: {
        operationId: 'signup',
        tags: ['Authentication'],
        summary: 'Create a new user account',
        description: 'Register a new user with email and profile information',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SignupRequest',
              },
              example: {
                email: 'user@example.com',
                displayName: 'John Doe',
                githubLogin: 'johndoe',
                githubUserId: 12345678,
                githubAvatarUrl: 'https://avatars.githubusercontent.com/u/12345678',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'User created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      $ref: '#/components/schemas/User',
                    },
                    message: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid request body',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ValidationErrorResponse',
                },
              },
            },
          },
          '409': {
            description: 'User already exists',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  error: 'User already exists',
                  message: 'An account with this email already exists',
                  userId: 'user-12345678-abcdef',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/me': {
      get: {
        operationId: 'getCurrentUser',
        tags: ['Authentication'],
        summary: 'Get current authenticated user',
        description: 'Returns the authenticated user profile and their tenants/memberships',
        responses: {
          '200': {
            description: 'User profile retrieved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      $ref: '#/components/schemas/User',
                    },
                    memberships: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/Membership',
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized - invalid or missing auth token',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '404': {
            description: 'User not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/github/install': {
      get: {
        operationId: 'redirectToGithubInstall',
        tags: ['Authentication'],
        summary: 'Redirect to GitHub App installation',
        description: 'Initiates GitHub App installation flow by redirecting to GitHub',
        security: [],
        responses: {
          '302': {
            description: 'Redirect to GitHub installation',
            headers: {
              Location: {
                schema: {
                  type: 'string',
                },
                description: 'URL to GitHub app installation page',
              },
            },
          },
        },
      },
    },
    '/github/callback': {
      get: {
        operationId: 'handleGithubCallback',
        tags: ['Authentication'],
        summary: 'Handle GitHub App installation callback',
        description: 'Processes callback from GitHub after app installation',
        security: [],
        parameters: [
          {
            name: 'installation_id',
            in: 'query',
            schema: {
              type: 'string',
            },
            description: 'GitHub installation ID',
          },
          {
            name: 'setup_action',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['install', 'update'],
            },
            description: 'Action that triggered the callback',
          },
        ],
        responses: {
          '302': {
            description: 'Redirect to dashboard',
            headers: {
              Location: {
                schema: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    },
    '/tenants': {
      post: {
        operationId: 'createTenant',
        tags: ['Tenants'],
        summary: 'Create a new workspace/organization',
        description: 'Create a new tenant workspace and assign the current user as owner',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CreateTenantRequest',
              },
              example: {
                displayName: 'My Organization',
                githubOrgLogin: 'my-org',
                githubOrgId: 98765432,
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Tenant created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tenant: {
                      $ref: '#/components/schemas/Tenant',
                    },
                    message: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid request body',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ValidationErrorResponse',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
      get: {
        operationId: 'listTenants',
        tags: ['Tenants'],
        summary: 'List user\'s accessible tenants',
        description: 'Returns all tenants/organizations the authenticated user has access to',
        responses: {
          '200': {
            description: 'Tenants retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tenants: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          tenant: {
                            $ref: '#/components/schemas/Tenant',
                          },
                          role: {
                            $ref: '#/components/schemas/TenantRole',
                          },
                          joinedAt: {
                            type: 'string',
                            format: 'date-time',
                          },
                        },
                      },
                    },
                    count: {
                      type: 'integer',
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/tenants/{tenantId}': {
      get: {
        operationId: 'getTenant',
        tags: ['Tenants'],
        summary: 'Get tenant details',
        description: 'Retrieve detailed information about a specific tenant (requires VIEWER+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
            description: 'Tenant ID',
          },
        ],
        responses: {
          '200': {
            description: 'Tenant details retrieved',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Tenant',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden - no access to this tenant',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  error: 'Forbidden',
                  message: 'You do not have access to this tenant',
                },
              },
            },
          },
          '404': {
            description: 'Tenant not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/tenants/{tenantId}/members': {
      get: {
        operationId: 'listMembers',
        tags: ['Members'],
        summary: 'List tenant members',
        description: 'Get all active members of a tenant with their roles (requires VIEWER+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Members retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    members: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/TenantMember',
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '404': {
            description: 'Tenant not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/tenants/{tenantId}/invites': {
      post: {
        operationId: 'createInvite',
        tags: ['Members'],
        summary: 'Invite a new team member',
        description: 'Create an invitation for a new team member (requires ADMIN+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/InviteMemberRequest',
              },
              example: {
                email: 'newmember@example.com',
                role: 'member',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Invite created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    invite: {
                      $ref: '#/components/schemas/Invite',
                    },
                    message: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid request body',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ValidationErrorResponse',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden - insufficient permissions',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '409': {
            description: 'User already has access',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '429': {
            description: 'Plan limit exceeded',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PlanLimitErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
      get: {
        operationId: 'listInvites',
        tags: ['Members'],
        summary: 'List pending invitations',
        description: 'Get all pending member invitations for this tenant (requires ADMIN+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Invites retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    invites: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/Invite',
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/tenants/{tenantId}/invites/{inviteId}': {
      delete: {
        operationId: 'cancelInvite',
        tags: ['Members'],
        summary: 'Cancel a pending invitation',
        description: 'Cancel and remove a pending member invitation (requires ADMIN+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
          {
            name: 'inviteId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Invitation cancelled',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '404': {
            description: 'Invite not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/invites/{inviteToken}/accept': {
      post: {
        operationId: 'acceptInvite',
        tags: ['Members'],
        summary: 'Accept a team invitation',
        description: 'Accept a pending team invitation and join the workspace',
        parameters: [
          {
            name: 'inviteToken',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
            description: 'Invite token from email',
          },
        ],
        responses: {
          '200': {
            description: 'Invitation accepted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    membership: {
                      $ref: '#/components/schemas/Membership',
                    },
                    message: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '404': {
            description: 'Invite not found or already used',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/tenants/{tenantId}/repos': {
      get: {
        operationId: 'listRepos',
        tags: ['Repositories'],
        summary: 'List connected repositories',
        description: 'Get all connected repositories for a tenant (requires VIEWER+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
          {
            name: 'enabled',
            in: 'query',
            schema: {
              type: 'boolean',
            },
            description: 'Filter by enabled status',
          },
        ],
        responses: {
          '200': {
            description: 'Repositories retrieved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    repos: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/TenantRepo',
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/tenants/{tenantId}/repos:connect': {
      post: {
        operationId: 'connectRepo',
        tags: ['Repositories'],
        summary: 'Connect a new repository',
        description: 'Connect a GitHub repository to this tenant (requires ADMIN+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ConnectRepoRequest',
              },
              example: {
                repoUrl: 'https://github.com/owner/repo-name',
                displayName: 'My Repository',
                settings: {
                  autoTriage: true,
                  autoReview: false,
                  autoResolve: false,
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Repository connected successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TenantRepo',
                },
              },
            },
          },
          '400': {
            description: 'Invalid request body or GitHub URL',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ValidationErrorResponse',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden - insufficient permissions',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '404': {
            description: 'Tenant not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '429': {
            description: 'Plan limit exceeded - maximum repositories reached',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PlanLimitErrorResponse',
                },
                example: {
                  error: 'Plan limit exceeded',
                  reason: 'Maximum 3 repositories allowed on free plan',
                  currentUsage: 3,
                  limit: 3,
                  plan: 'free',
                  upgradeUrl: '/billing/upgrade',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/tenants/{tenantId}/runs': {
      get: {
        operationId: 'listRuns',
        tags: ['Runs'],
        summary: 'List tenant runs',
        description: 'Get recent runs for this tenant (requires VIEWER+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
          {
            name: 'limit',
            in: 'query',
            schema: {
              type: 'integer',
              default: 20,
              minimum: 1,
              maximum: 100,
            },
            description: 'Maximum number of runs to return',
          },
        ],
        responses: {
          '200': {
            description: 'Runs retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    runs: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/Run',
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
      post: {
        operationId: 'startRun',
        tags: ['Runs'],
        summary: 'Start a new AI agent run',
        description: 'Execute an AI agent workflow (triage, plan, resolve, review, or autopilot). Returns 202 Accepted as run is asynchronous. (requires DEVELOPER+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/StartRunRequest',
              },
              example: {
                repoUrl: 'https://github.com/owner/repo',
                runType: 'TRIAGE',
                prNumber: 42,
                riskMode: 'comment_only',
                metadata: {
                  triggeredBy: 'webhook',
                },
              },
            },
          },
        },
        responses: {
          '202': {
            description: 'Run started successfully (async)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    runId: {
                      type: 'string',
                      description: 'Unique run identifier',
                    },
                    status: {
                      type: 'string',
                      enum: ['pending', 'running'],
                    },
                    message: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid request body',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ValidationErrorResponse',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden - insufficient permissions or tenant suspended',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '404': {
            description: 'Tenant not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '429': {
            description: 'Plan limit exceeded - run quota reached',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PlanLimitErrorResponse',
                },
                example: {
                  error: 'Plan limit exceeded',
                  reason: 'Maximum 50 runs per month allowed on free plan',
                  currentUsage: 50,
                  limit: 50,
                  plan: 'free',
                  upgradeUrl: '/billing/upgrade',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/tenants/{tenantId}/runs/{runId}': {
      get: {
        operationId: 'getRun',
        tags: ['Runs'],
        summary: 'Get run details and status',
        description: 'Retrieve the status and results of a specific run (requires VIEWER+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
          {
            name: 'runId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Run details retrieved',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Run',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '404': {
            description: 'Run not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/tenants/{tenantId}/settings': {
      post: {
        operationId: 'updateSettings',
        tags: ['Settings'],
        summary: 'Update tenant settings',
        description: 'Modify default tenant configuration and behavior (requires ADMIN+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UpdateSettingsRequest',
              },
              example: {
                defaultRiskMode: 'suggest_patch',
                defaultTriageModel: 'gemini-1.5-flash',
                defaultCodeModel: 'gemini-1.5-pro',
                complexityThreshold: 3,
                autoRunOnConflict: true,
                autoRunOnPrOpen: false,
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Settings updated successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Tenant',
                },
              },
            },
          },
          '400': {
            description: 'Invalid request body',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ValidationErrorResponse',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden - insufficient permissions',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '404': {
            description: 'Tenant not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/tenants/{tenantId}/workflows': {
      post: {
        operationId: 'startWorkflow',
        tags: ['Workflows'],
        summary: 'Start a new workflow',
        description: 'Execute an advanced workflow with multi-step orchestration (requires DEVELOPER+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/StartWorkflowRequest',
              },
              example: {
                workflowType: 'issue-to-code',
                input: {
                  issueNumber: 123,
                  repoUrl: 'https://github.com/owner/repo',
                  assignTo: 'developer@example.com',
                },
              },
            },
          },
        },
        responses: {
          '202': {
            description: 'Workflow started (async)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/WorkflowResponse',
                },
              },
            },
          },
          '400': {
            description: 'Invalid request body',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ValidationErrorResponse',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
      get: {
        operationId: 'listWorkflows',
        tags: ['Workflows'],
        summary: 'List recent workflows',
        description: 'Get recent workflows for this tenant (requires VIEWER+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['pending', 'running', 'completed', 'failed'],
            },
            description: 'Filter by status',
          },
        ],
        responses: {
          '200': {
            description: 'Workflows retrieved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    workflows: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: {
                            type: 'string',
                          },
                          type: {
                            type: 'string',
                          },
                          status: {
                            type: 'string',
                          },
                          createdAt: {
                            type: 'string',
                            format: 'date-time',
                          },
                          completedAt: {
                            type: 'string',
                            format: 'date-time',
                          },
                        },
                      },
                    },
                    count: {
                      type: 'integer',
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/tenants/{tenantId}/workflows/{workflowId}': {
      get: {
        operationId: 'getWorkflow',
        tags: ['Workflows'],
        summary: 'Get workflow status and details',
        description: 'Retrieve detailed status of a workflow including steps (requires VIEWER+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
          {
            name: 'workflowId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Workflow details retrieved',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/WorkflowDetails',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '404': {
            description: 'Workflow not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/tenants/{tenantId}/workflows/{workflowId}/approve': {
      post: {
        operationId: 'approveWorkflow',
        tags: ['Workflows'],
        summary: 'Approve or reject a pending workflow',
        description: 'Resume a workflow awaiting human approval (requires ADMIN+ role)',
        parameters: [
          {
            name: 'tenantId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
          {
            name: 'workflowId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  approved: {
                    type: 'boolean',
                  },
                },
                required: ['approved'],
              },
              example: {
                approved: true,
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Workflow approval processed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    workflowId: {
                      type: 'string',
                    },
                    status: {
                      type: 'string',
                    },
                    message: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid request body',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Forbidden',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '404': {
            description: 'Workflow not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Firebase Auth Bearer token or X-Debug-User header in development',
      },
    },
    schemas: {
      // Response envelopes
      HealthResponse: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['healthy'],
          },
          app: {
            type: 'string',
          },
          version: {
            type: 'string',
          },
          env: {
            type: 'string',
            enum: ['dev', 'staging', 'production'],
          },
          storeBackend: {
            type: 'string',
            enum: ['sqlite', 'firestore', 'postgres', 'turso'],
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
        },
        required: ['status', 'app', 'version', 'env', 'timestamp'],
      },
      MetricsResponse: {
        type: 'object',
        properties: {
          app: {
            type: 'string',
          },
          version: {
            type: 'string',
          },
          env: {
            type: 'string',
          },
          uptimeMs: {
            type: 'integer',
          },
          uptimeHuman: {
            type: 'string',
          },
          requests: {
            type: 'object',
            properties: {
              total: {
                type: 'integer',
              },
              byPath: {
                type: 'object',
                additionalProperties: {
                  type: 'integer',
                },
              },
              byStatus: {
                type: 'object',
                additionalProperties: {
                  type: 'integer',
                },
              },
            },
          },
          errors: {
            type: 'object',
            properties: {
              total: {
                type: 'integer',
              },
              rate: {
                type: 'string',
              },
            },
          },
          latency: {
            type: 'object',
            properties: {
              avgMs: {
                type: 'integer',
              },
              totalMs: {
                type: 'integer',
              },
            },
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description: 'Error code or title',
          },
          message: {
            type: 'string',
            description: 'Human-readable error message',
          },
        },
        required: ['error'],
      },
      ValidationErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            enum: ['Invalid request body'],
          },
          details: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
                message: {
                  type: 'string',
                },
                code: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
      PlanLimitErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            enum: ['Plan limit exceeded'],
          },
          reason: {
            type: 'string',
          },
          currentUsage: {
            type: 'integer',
          },
          limit: {
            type: 'integer',
          },
          plan: {
            type: 'string',
            enum: ['free', 'team', 'pro', 'enterprise'],
          },
          upgradeUrl: {
            type: 'string',
          },
        },
        required: ['error', 'reason', 'currentUsage', 'limit', 'plan'],
      },

      // Request schemas
      SignupRequest: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            format: 'email',
          },
          displayName: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
          },
          githubLogin: {
            type: 'string',
            minLength: 1,
            maxLength: 39,
          },
          githubUserId: {
            type: 'integer',
          },
          githubAvatarUrl: {
            type: 'string',
            format: 'uri',
          },
        },
        required: ['email', 'displayName'],
      },
      CreateTenantRequest: {
        type: 'object',
        properties: {
          displayName: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
          },
          githubOrgLogin: {
            type: 'string',
            minLength: 1,
            maxLength: 39,
          },
          githubOrgId: {
            type: 'integer',
          },
        },
        required: ['displayName'],
      },
      InviteMemberRequest: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            format: 'email',
          },
          role: {
            type: 'string',
            enum: ['admin', 'member'],
            default: 'member',
          },
        },
        required: ['email'],
      },
      ConnectRepoRequest: {
        type: 'object',
        properties: {
          repoUrl: {
            type: 'string',
            format: 'uri',
            pattern: '^https://github\\.com/[^/]+/[^/]+/?$',
          },
          displayName: {
            type: 'string',
          },
          settings: {
            type: 'object',
            properties: {
              autoTriage: {
                type: 'boolean',
              },
              autoReview: {
                type: 'boolean',
              },
              autoResolve: {
                type: 'boolean',
              },
            },
          },
        },
        required: ['repoUrl'],
      },
      StartRunRequest: {
        type: 'object',
        properties: {
          repoUrl: {
            type: 'string',
            format: 'uri',
          },
          runType: {
            type: 'string',
            enum: ['TRIAGE', 'PLAN', 'RESOLVE', 'REVIEW', 'AUTOPILOT'],
          },
          prNumber: {
            type: 'integer',
          },
          issueNumber: {
            type: 'integer',
          },
          riskMode: {
            type: 'string',
            enum: ['comment_only', 'suggest_patch', 'auto_patch', 'auto_push'],
          },
          metadata: {
            type: 'object',
            additionalProperties: true,
          },
        },
        required: ['repoUrl', 'runType'],
      },
      UpdateSettingsRequest: {
        type: 'object',
        properties: {
          defaultRiskMode: {
            type: 'string',
            enum: ['comment_only', 'suggest_patch', 'auto_patch', 'auto_push'],
          },
          defaultTriageModel: {
            type: 'string',
          },
          defaultCodeModel: {
            type: 'string',
          },
          complexityThreshold: {
            type: 'integer',
            minimum: 1,
            maximum: 5,
          },
          autoRunOnConflict: {
            type: 'boolean',
          },
          autoRunOnPrOpen: {
            type: 'boolean',
          },
        },
      },
      StartWorkflowRequest: {
        type: 'object',
        properties: {
          workflowType: {
            type: 'string',
            enum: ['issue-to-code', 'pr-resolve', 'pr-review', 'test-gen', 'docs-update'],
          },
          input: {
            type: 'object',
            additionalProperties: true,
          },
        },
        required: ['workflowType', 'input'],
      },

      // Data models
      User: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Firebase Auth UID',
          },
          email: {
            type: 'string',
            format: 'email',
          },
          displayName: {
            type: 'string',
          },
          githubUserId: {
            type: 'integer',
          },
          githubLogin: {
            type: 'string',
          },
          githubAvatarUrl: {
            type: 'string',
            format: 'uri',
          },
          preferences: {
            type: 'object',
            properties: {
              defaultTenantId: {
                type: 'string',
              },
              notificationsEnabled: {
                type: 'boolean',
              },
              theme: {
                type: 'string',
                enum: ['light', 'dark', 'system'],
              },
            },
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
          lastLoginAt: {
            type: 'string',
            format: 'date-time',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
          },
        },
        required: ['id', 'email', 'displayName', 'createdAt', 'lastLoginAt', 'updatedAt'],
      },
      TenantRole: {
        type: 'string',
        enum: ['owner', 'admin', 'member'],
      },
      Tenant: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Tenant ID (e.g., gh-org-12345678)',
          },
          displayName: {
            type: 'string',
          },
          githubOrgId: {
            type: 'integer',
          },
          githubOrgLogin: {
            type: 'string',
          },
          installationId: {
            type: 'integer',
          },
          installedAt: {
            type: 'string',
            format: 'date-time',
          },
          installedBy: {
            type: 'string',
            description: 'User ID of the installer',
          },
          status: {
            type: 'string',
            enum: ['active', 'suspended', 'deactivated'],
          },
          plan: {
            type: 'string',
            enum: ['free', 'team', 'pro', 'enterprise'],
          },
          planLimits: {
            type: 'object',
            properties: {
              runsPerMonth: {
                type: 'integer',
              },
              reposMax: {
                type: 'integer',
              },
              membersMax: {
                type: 'integer',
              },
            },
          },
          settings: {
            type: 'object',
            properties: {
              defaultRiskMode: {
                type: 'string',
                enum: ['comment_only', 'suggest_patch', 'auto_patch', 'auto_push'],
              },
              defaultTriageModel: {
                type: 'string',
              },
              defaultCodeModel: {
                type: 'string',
              },
              complexityThreshold: {
                type: 'integer',
              },
              autoRunOnConflict: {
                type: 'boolean',
              },
              autoRunOnPrOpen: {
                type: 'boolean',
              },
            },
          },
          runsThisMonth: {
            type: 'integer',
          },
          lastRunAt: {
            type: 'string',
            format: 'date-time',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
          },
        },
        required: ['id', 'displayName', 'status', 'plan', 'settings', 'runsThisMonth', 'createdAt', 'updatedAt'],
      },
      TenantRepo: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Repository ID (e.g., gh-repo-owner-name)',
          },
          tenantId: {
            type: 'string',
          },
          githubRepoId: {
            type: 'integer',
          },
          githubFullName: {
            type: 'string',
            description: 'Full name (e.g., owner/repo-name)',
          },
          displayName: {
            type: 'string',
          },
          enabled: {
            type: 'boolean',
          },
          lastSyncAt: {
            type: 'string',
            format: 'date-time',
          },
          settings: {
            type: 'object',
            properties: {
              riskModeOverride: {
                type: 'string',
                enum: ['comment_only', 'suggest_patch', 'auto_patch', 'auto_push'],
              },
              autoTriage: {
                type: 'boolean',
              },
              autoReview: {
                type: 'boolean',
              },
              autoResolve: {
                type: 'boolean',
              },
              branchPatterns: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
            },
          },
          totalRuns: {
            type: 'integer',
          },
          successfulRuns: {
            type: 'integer',
          },
          failedRuns: {
            type: 'integer',
          },
          lastRunId: {
            type: 'string',
          },
          addedAt: {
            type: 'string',
            format: 'date-time',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
          },
        },
        required: ['id', 'tenantId', 'githubFullName', 'displayName', 'enabled', 'settings', 'totalRuns', 'addedAt', 'updatedAt'],
      },
      Membership: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
          },
          userId: {
            type: 'string',
          },
          tenantId: {
            type: 'string',
          },
          role: {
            $ref: '#/components/schemas/TenantRole',
          },
          status: {
            type: 'string',
            enum: ['active', 'invited', 'suspended'],
          },
          githubRole: {
            type: 'string',
          },
          invitedBy: {
            type: 'string',
          },
          invitedAt: {
            type: 'string',
            format: 'date-time',
          },
          acceptedAt: {
            type: 'string',
            format: 'date-time',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
          },
        },
        required: ['id', 'userId', 'tenantId', 'role', 'status', 'createdAt', 'updatedAt'],
      },
      TenantMember: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
          },
          displayName: {
            type: 'string',
          },
          email: {
            type: 'string',
            format: 'email',
          },
          avatarUrl: {
            type: 'string',
            format: 'uri',
          },
          role: {
            $ref: '#/components/schemas/TenantRole',
          },
          joinedAt: {
            type: 'string',
            format: 'date-time',
          },
        },
        required: ['userId', 'role', 'joinedAt'],
      },
      Invite: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
          },
          email: {
            type: 'string',
            format: 'email',
          },
          role: {
            $ref: '#/components/schemas/TenantRole',
          },
          status: {
            type: 'string',
            enum: ['invited'],
          },
          invitedBy: {
            type: 'string',
          },
          invitedAt: {
            type: 'string',
            format: 'date-time',
          },
          inviteToken: {
            type: 'string',
          },
        },
        required: ['id', 'email', 'role', 'status', 'invitedAt'],
      },
      RunStep: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
          },
          agent: {
            type: 'string',
            description: 'Agent name (e.g., Triage, Resolver, Reviewer)',
          },
          status: {
            type: 'string',
            enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
          },
          input: {
            type: 'object',
            additionalProperties: true,
          },
          output: {
            type: 'object',
            additionalProperties: true,
          },
          error: {
            type: 'string',
          },
          startedAt: {
            type: 'string',
            format: 'date-time',
          },
          completedAt: {
            type: 'string',
            format: 'date-time',
          },
          durationMs: {
            type: 'integer',
          },
          tokensUsed: {
            type: 'object',
            properties: {
              input: {
                type: 'integer',
              },
              output: {
                type: 'integer',
              },
            },
          },
        },
        required: ['id', 'agent', 'status'],
      },
      Run: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
          },
          tenantId: {
            type: 'string',
          },
          repoId: {
            type: 'string',
          },
          prUrl: {
            type: 'string',
            format: 'uri',
          },
          type: {
            type: 'string',
            enum: ['triage', 'plan', 'resolve', 'review', 'autopilot'],
          },
          status: {
            type: 'string',
            enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
          },
          currentStep: {
            type: 'string',
          },
          steps: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/RunStep',
            },
          },
          result: {
            type: 'object',
            additionalProperties: true,
          },
          error: {
            type: 'string',
          },
          trigger: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                enum: ['ui', 'cli', 'webhook', 'scheduled', 'api'],
              },
              userId: {
                type: 'string',
              },
              webhookEventId: {
                type: 'string',
              },
              commandText: {
                type: 'string',
              },
            },
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
          },
          completedAt: {
            type: 'string',
            format: 'date-time',
          },
          durationMs: {
            type: 'integer',
          },
        },
        required: ['id', 'tenantId', 'type', 'status', 'steps', 'createdAt', 'updatedAt'],
      },
      WorkflowResponse: {
        type: 'object',
        properties: {
          workflowId: {
            type: 'string',
          },
          status: {
            type: 'string',
            enum: ['pending', 'running'],
          },
          currentStep: {
            type: 'string',
          },
          message: {
            type: 'string',
          },
        },
      },
      WorkflowDetails: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
          },
          type: {
            type: 'string',
          },
          status: {
            type: 'string',
            enum: ['pending', 'running', 'completed', 'failed'],
          },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                agent: {
                  type: 'string',
                },
                status: {
                  type: 'string',
                },
                startedAt: {
                  type: 'string',
                  format: 'date-time',
                },
                completedAt: {
                  type: 'string',
                  format: 'date-time',
                },
                error: {
                  type: 'string',
                },
              },
            },
          },
          output: {
            type: 'object',
            additionalProperties: true,
          },
          error: {
            type: 'string',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
          },
          completedAt: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
    },
  },
} as const;

export default openAPISpec;
