/**
 * Tenant and Actor Context
 *
 * Phase 5: Canonical context types for multi-tenant operations.
 * Every tool invocation, run, and audit event must include tenant context.
 *
 * @module @gwi/core/tenancy/context
 */

import { z } from 'zod';

// =============================================================================
// Actor Types
// =============================================================================

/**
 * Actor type classification
 */
export const ActorType = z.enum([
  'human',        // Human user (via CLI, web, etc.)
  'service',      // Service account / automated system
  'github_app',   // GitHub App installation
]);

export type ActorType = z.infer<typeof ActorType>;

/**
 * Source of the request
 */
export const RequestSource = z.enum([
  'cli',           // CLI invocation
  'web',           // Web UI
  'api',           // Direct API call
  'github_action', // GitHub Action
  'webhook',       // Webhook handler
]);

export type RequestSource = z.infer<typeof RequestSource>;

// =============================================================================
// Actor Context
// =============================================================================

/**
 * Actor context - who is performing the action
 *
 * This is required for all operations to enable:
 * - Policy decisions based on actor identity
 * - Audit trails with actor attribution
 * - Rate limiting per actor
 */
export const ActorContext = z.object({
  /** Unique actor identifier (user ID, service account ID, etc.) */
  actorId: z.string().min(1, 'actorId is required'),

  /** Actor type classification */
  actorType: ActorType,

  /** Request source */
  source: RequestSource,

  /** Display name for audit/logging (optional) */
  displayName: z.string().optional(),

  /** Email for notifications (optional) */
  email: z.string().email().optional(),
});

export type ActorContext = z.infer<typeof ActorContext>;

// =============================================================================
// Tenant Context
// =============================================================================

/**
 * Tenant context - the organizational boundary for all operations
 *
 * This is required for all operations to enable:
 * - Data isolation between tenants
 * - Policy scoping per tenant
 * - Configuration lookup per tenant
 */
export const TenantContext = z.object({
  /** Unique tenant identifier */
  tenantId: z.string().min(1, 'tenantId is required'),

  /** Actor performing the operation */
  actor: ActorContext,

  /** Organization ID (optional, for multi-org tenants) */
  orgId: z.string().optional(),

  /** Repository context (optional, for repo-scoped operations) */
  repo: z.object({
    owner: z.string(),
    name: z.string(),
    fullName: z.string(),
  }).optional(),

  /** GitHub App installation ID (optional, for GitHub App context) */
  installationId: z.string().optional(),

  /** Request timestamp */
  requestedAt: z.string().datetime().optional(),

  /** Request ID for tracing */
  requestId: z.string().uuid().optional(),
});

export type TenantContext = z.infer<typeof TenantContext>;

// =============================================================================
// Full Execution Context
// =============================================================================

/**
 * Full execution context for a run or tool invocation
 *
 * Combines tenant context with run-specific information.
 */
export const ExecutionContext = z.object({
  /** Run ID for this execution */
  runId: z.string().uuid(),

  /** Tenant context */
  tenant: TenantContext,

  /** Approval record (required for DESTRUCTIVE operations) */
  approval: z.object({
    runId: z.string().uuid(),
    approvedAt: z.string().datetime(),
    approvedBy: z.string(),
    scope: z.array(z.enum(['commit', 'push', 'open_pr', 'merge'])),
    patchHash: z.string(),
    comment: z.string().optional(),
  }).optional(),

  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type ExecutionContext = z.infer<typeof ExecutionContext>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a minimal actor context for CLI usage
 */
export function createCliActor(userId: string, displayName?: string): ActorContext {
  return ActorContext.parse({
    actorId: userId,
    actorType: 'human',
    source: 'cli',
    displayName,
  });
}

/**
 * Create a minimal actor context for service accounts
 */
export function createServiceActor(serviceId: string, displayName?: string): ActorContext {
  return ActorContext.parse({
    actorId: serviceId,
    actorType: 'service',
    source: 'api',
    displayName,
  });
}

/**
 * Create a minimal actor context for GitHub App
 */
export function createGitHubAppActor(installationId: string): ActorContext {
  return ActorContext.parse({
    actorId: `github-app-${installationId}`,
    actorType: 'github_app',
    source: 'webhook',
    displayName: 'GitHub App',
  });
}

/**
 * Create a tenant context
 */
export function createTenantContext(
  tenantId: string,
  actor: ActorContext,
  options?: {
    orgId?: string;
    repo?: { owner: string; name: string };
    installationId?: string;
    requestId?: string;
  }
): TenantContext {
  return TenantContext.parse({
    tenantId,
    actor,
    orgId: options?.orgId,
    repo: options?.repo ? {
      ...options.repo,
      fullName: `${options.repo.owner}/${options.repo.name}`,
    } : undefined,
    installationId: options?.installationId,
    requestedAt: new Date().toISOString(),
    requestId: options?.requestId,
  });
}

/**
 * Create an execution context from tenant context
 */
export function createExecutionContext(
  runId: string,
  tenant: TenantContext,
  options?: {
    approval?: ExecutionContext['approval'];
    metadata?: Record<string, unknown>;
  }
): ExecutionContext {
  return ExecutionContext.parse({
    runId,
    tenant,
    approval: options?.approval,
    metadata: options?.metadata,
  });
}

/**
 * Validate that a context is complete (throws on invalid)
 */
export function validateTenantContext(ctx: unknown): TenantContext {
  return TenantContext.parse(ctx);
}

/**
 * Check if a context has a specific actor type
 */
export function isActorType(ctx: TenantContext, type: ActorType): boolean {
  return ctx.actor.actorType === type;
}

/**
 * Check if a context is from a specific source
 */
export function isFromSource(ctx: TenantContext, source: RequestSource): boolean {
  return ctx.actor.source === source;
}
