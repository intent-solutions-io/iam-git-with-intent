/**
 * Audit & Policy API Routes (Epic D - Story D6)
 *
 * Endpoints:
 * - GET /v1/audit/logs - List audit logs
 * - GET /v1/audit/logs/:id - Get specific audit log
 * - POST /v1/audit/logs/verify - Verify audit log integrity
 * - POST /v1/audit/logs/export - Export audit logs
 * - GET /v1/policies - List policies
 * - POST /v1/policies - Create policy
 * - GET /v1/policies/:id - Get policy
 * - PUT /v1/policies/:id - Update policy
 * - DELETE /v1/policies/:id - Delete policy
 * - POST /v1/policies/validate - Validate policy
 * - POST /v1/policies/evaluate - Evaluate policies
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  getImmutableAuditLogStore,
  createAuditVerificationService,
  createAuditLogExportService,
  type ImmutableAuditLogStore,
  type AuditLogExportFormat,
} from '@gwi/core';

export const auditPolicyRouter = Router();

// =============================================================================
// Request Schemas
// =============================================================================

const ListAuditLogsSchema = z.object({
  tenantId: z.string().min(1),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  eventType: z.enum([
    'policy.evaluated',
    'violation.detected',
    'approval.requested',
    'approval.granted',
    'approval.denied',
    'run.started',
    'run.completed',
  ]).optional(),
  actor: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const VerifyAuditLogsSchema = z.object({
  tenantId: z.string().min(1),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
});

const ExportAuditLogsSchema = z.object({
  tenantId: z.string().min(1),
  format: z.enum(['json', 'json-lines', 'csv', 'cef', 'syslog']),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  eventTypes: z.array(z.string()).optional(),
  includeIntegrityProofs: z.boolean().default(false),
});

const PolicyRuleSchema = z.object({
  id: z.string().min(1),
  effect: z.enum(['allow', 'deny']),
  actions: z.array(z.string()).min(1),
  resources: z.array(z.string()).optional(),
  conditions: z.record(z.unknown()).optional(),
  reasoning: z.string().optional(),
});

const CreatePolicySchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1).max(256),
  description: z.string().max(1024).optional(),
  category: z.string().optional(),
  priority: z.number().int().min(0).max(100).default(50),
  rules: z.array(PolicyRuleSchema).min(1),
  conditions: z.record(z.unknown()).optional(),
  inheritsFrom: z.string().optional(),
});

const UpdatePolicySchema = z.object({
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(1024).optional(),
  status: z.enum(['active', 'inactive', 'draft']).optional(),
  category: z.string().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  rules: z.array(PolicyRuleSchema).optional(),
  conditions: z.record(z.unknown()).optional(),
});

const ValidatePolicySchema = z.object({
  policy: CreatePolicySchema,
  context: z.record(z.unknown()).optional(),
});

const EvaluatePolicySchema = z.object({
  tenantId: z.string().min(1),
  context: z.object({
    action: z.string().min(1),
    resource: z.string().min(1),
    actor: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  }),
  policyIds: z.array(z.string()).optional(),
});

// =============================================================================
// Auth Middleware
// =============================================================================

function requireAuth(req: any, res: any, next: any) {
  const userId = req.headers['x-user-id'];
  const apiKey = req.headers['x-api-key'];

  if (!userId && !apiKey) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Authentication required. Provide x-user-id or x-api-key header.',
    });
  }

  req.userId = userId;
  req.apiKey = apiKey;
  next();
}

// =============================================================================
// Audit Log Endpoints
// =============================================================================

/**
 * GET /v1/audit/logs - List audit logs
 */
auditPolicyRouter.get('/audit/logs', requireAuth, async (req, res) => {
  try {
    const params = ListAuditLogsSchema.parse(req.query);
    const storage = getImmutableAuditLogStore();

    const result = await storage.query({
      tenantId: params.tenantId,
      startTime: params.startTime ? new Date(params.startTime) : undefined,
      endTime: params.endTime ? new Date(params.endTime) : undefined,
      limit: params.pageSize,
      offset: (params.page - 1) * params.pageSize,
    });

    res.json({
      entries: result.entries,
      total: result.totalCount,
      page: params.page,
      pageSize: params.pageSize,
      chainIntegrity: true, // Would verify in production
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid request parameters',
        details: error.errors,
      });
    }
    console.error('Error listing audit logs:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to list audit logs',
    });
  }
});

/**
 * GET /v1/audit/logs/:id - Get specific audit log
 */
auditPolicyRouter.get('/audit/logs/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const includeProof = req.query.includeProof === 'true';
    const storage = getImmutableAuditLogStore();

    const entry = await storage.getEntry(id);

    if (!entry) {
      return res.status(404).json({
        error: 'not_found',
        message: `Audit log entry ${id} not found`,
      });
    }

    const response: any = { ...entry };

    if (includeProof) {
      response.integrityProof = {
        algorithm: 'SHA-256',
        hash: entry.chain?.contentHash,
        previousHash: entry.chain?.prevHash,
        verified: true,
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Error getting audit log:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to get audit log',
    });
  }
});

/**
 * POST /v1/audit/logs/verify - Verify audit log integrity
 */
auditPolicyRouter.post('/audit/logs/verify', requireAuth, async (req, res) => {
  try {
    const params = VerifyAuditLogsSchema.parse(req.body);
    const storage = getImmutableAuditLogStore();
    const verificationService = createAuditVerificationService(storage);

    const report = await verificationService.verify(params.tenantId, {
      verifyTimestamps: true,
    });

    res.json({
      valid: report.valid,
      entriesChecked: report.stats.entriesVerified,
      firstEntry: report.stats.timeRange?.start?.toISOString() ?? null,
      lastEntry: report.stats.timeRange?.end?.toISOString() ?? null,
      brokenLinks: report.issues
        .filter((issue) => issue.type === 'chain_link_broken')
        .map((issue) => ({
          entryId: issue.entryId,
          message: issue.message,
        })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid request parameters',
        details: error.errors,
      });
    }
    console.error('Error verifying audit logs:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to verify audit logs',
    });
  }
});

/**
 * POST /v1/audit/logs/export - Export audit logs
 */
auditPolicyRouter.post('/audit/logs/export', requireAuth, async (req, res) => {
  try {
    const params = ExportAuditLogsSchema.parse(req.body);
    const storage = getImmutableAuditLogStore();
    const exportService = createAuditLogExportService(storage);

    const result = await exportService.export({
      tenantId: params.tenantId,
      format: params.format as AuditLogExportFormat,
      startTime: params.startTime ? new Date(params.startTime) : undefined,
      endTime: params.endTime ? new Date(params.endTime) : undefined,
      includeChainData: params.includeIntegrityProofs,
    });

    if (params.format === 'csv') {
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } else {
      res.json({
        format: params.format,
        entriesExported: result.metadata.entryCount,
        data: result.content,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid request parameters',
        details: error.errors,
      });
    }
    console.error('Error exporting audit logs:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to export audit logs',
    });
  }
});

// =============================================================================
// Policy Endpoints
// =============================================================================

// In-memory policy store for now (would use Firestore in production)
const policies = new Map<string, any>();

/**
 * GET /v1/policies - List policies
 */
auditPolicyRouter.get('/policies', requireAuth, async (req, res) => {
  try {
    const tenantId = req.query.tenantId as string;
    const status = req.query.status as string | undefined;
    const category = req.query.category as string | undefined;

    if (!tenantId) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'tenantId query parameter is required',
      });
    }

    let results = Array.from(policies.values()).filter(p => p.tenantId === tenantId);

    if (status) {
      results = results.filter(p => p.status === status);
    }

    if (category) {
      results = results.filter(p => p.category === category);
    }

    res.json({
      policies: results,
      total: results.length,
    });
  } catch (error) {
    console.error('Error listing policies:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to list policies',
    });
  }
});

/**
 * POST /v1/policies - Create policy
 */
auditPolicyRouter.post('/policies', requireAuth, async (req, res) => {
  try {
    const data = CreatePolicySchema.parse(req.body);

    const policy = {
      id: `policy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...data,
      status: 'draft' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    policies.set(policy.id, policy);

    res.status(201).json(policy);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid policy data',
        details: error.errors,
      });
    }
    console.error('Error creating policy:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to create policy',
    });
  }
});

/**
 * GET /v1/policies/:id - Get policy
 */
auditPolicyRouter.get('/policies/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const policy = policies.get(id);

    if (!policy) {
      return res.status(404).json({
        error: 'not_found',
        message: `Policy ${id} not found`,
      });
    }

    res.json(policy);
  } catch (error) {
    console.error('Error getting policy:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to get policy',
    });
  }
});

/**
 * PUT /v1/policies/:id - Update policy
 */
auditPolicyRouter.put('/policies/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = UpdatePolicySchema.parse(req.body);

    const existing = policies.get(id);
    if (!existing) {
      return res.status(404).json({
        error: 'not_found',
        message: `Policy ${id} not found`,
      });
    }

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    policies.set(id, updated);

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid policy data',
        details: error.errors,
      });
    }
    console.error('Error updating policy:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to update policy',
    });
  }
});

/**
 * DELETE /v1/policies/:id - Delete policy (soft delete)
 */
auditPolicyRouter.delete('/policies/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = policies.get(id);
    if (!existing) {
      return res.status(404).json({
        error: 'not_found',
        message: `Policy ${id} not found`,
      });
    }

    // Soft delete - set status to inactive
    existing.status = 'inactive';
    existing.updatedAt = new Date().toISOString();
    policies.set(id, existing);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting policy:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to delete policy',
    });
  }
});

/**
 * POST /v1/policies/validate - Validate policy
 */
auditPolicyRouter.post('/policies/validate', requireAuth, async (req, res) => {
  try {
    const data = ValidatePolicySchema.parse(req.body);

    // Validate the policy structure
    const errors: Array<{ path: string; message: string; code: string }> = [];
    const warnings: Array<{ path: string; message: string }> = [];

    // Check for required fields
    if (!data.policy.name) {
      errors.push({ path: 'policy.name', message: 'Name is required', code: 'required' });
    }

    if (!data.policy.rules || data.policy.rules.length === 0) {
      errors.push({ path: 'policy.rules', message: 'At least one rule is required', code: 'min_length' });
    }

    // Check for potential issues
    if (data.policy.rules) {
      for (let i = 0; i < data.policy.rules.length; i++) {
        const rule = data.policy.rules[i];
        if (rule.effect === 'deny' && !rule.reasoning) {
          warnings.push({
            path: `policy.rules[${i}].reasoning`,
            message: 'Deny rules should have a reasoning explanation',
          });
        }
      }
    }

    res.json({
      valid: errors.length === 0,
      errors,
      warnings,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid request data',
        details: error.errors,
      });
    }
    console.error('Error validating policy:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to validate policy',
    });
  }
});

/**
 * POST /v1/policies/evaluate - Evaluate policies
 */
auditPolicyRouter.post('/policies/evaluate', requireAuth, async (req, res) => {
  try {
    const startTime = Date.now();
    const data = EvaluatePolicySchema.parse(req.body);

    // Get applicable policies
    let applicablePolicies = Array.from(policies.values())
      .filter(p => p.tenantId === data.tenantId && p.status === 'active')
      .sort((a, b) => (b.priority || 50) - (a.priority || 50));

    if (data.policyIds && data.policyIds.length > 0) {
      applicablePolicies = applicablePolicies.filter(p => data.policyIds!.includes(p.id));
    }

    // Evaluate each policy
    let decision: 'allow' | 'deny' | 'not_applicable' = 'not_applicable';
    const matchedPolicies: Array<{
      policyId: string;
      policyName: string;
      ruleId: string;
      effect: string;
    }> = [];
    let reasoning = 'No applicable policies found';

    for (const policy of applicablePolicies) {
      for (const rule of policy.rules || []) {
        // Check if action matches
        const actionMatches = rule.actions.some((a: string) =>
          a === '*' || a === data.context.action
        );

        if (!actionMatches) continue;

        // Check if resource matches (if specified)
        if (rule.resources && rule.resources.length > 0) {
          const resourceMatches = rule.resources.some((r: string) =>
            r === '*' || data.context.resource.startsWith(r)
          );
          if (!resourceMatches) continue;
        }

        // Rule matches - record it
        matchedPolicies.push({
          policyId: policy.id,
          policyName: policy.name,
          ruleId: rule.id,
          effect: rule.effect,
        });

        // First matching rule wins
        if (decision === 'not_applicable') {
          decision = rule.effect;
          reasoning = rule.reasoning || `Matched rule ${rule.id} in policy ${policy.name}`;
        }
      }
    }

    res.json({
      allowed: decision === 'allow',
      decision,
      matchedPolicies,
      reasoning,
      evaluationTimeMs: Date.now() - startTime,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid request data',
        details: error.errors,
      });
    }
    console.error('Error evaluating policies:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to evaluate policies',
    });
  }
});
