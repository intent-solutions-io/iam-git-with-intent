/**
 * Phase 66: Cost Management + Metering
 *
 * Resource usage tracking and cost allocation:
 * - Usage metering per tenant/feature
 * - Cost calculation and allocation
 * - Budget alerts and limits
 * - Resource quotas
 *
 * @module @gwi/core/cost-management
 */

import { z } from 'zod';

// =============================================================================
// VERSION
// =============================================================================

export const COST_MANAGEMENT_VERSION = '1.0.0';

// =============================================================================
// RESOURCE TYPES
// =============================================================================

export const ResourceTypes = {
  API_CALL: 'api_call',
  COMPUTE: 'compute',
  STORAGE: 'storage',
  FORECAST: 'forecast',
  DATA_POINT: 'data_point',
  CONNECTOR: 'connector',
  EXPORT: 'export',
  IMPORT: 'import',
  USER: 'user',
  ALERT: 'alert',
} as const;

export type ResourceType = (typeof ResourceTypes)[keyof typeof ResourceTypes];

// =============================================================================
// PRICING TIERS
// =============================================================================

export const PricingTiers = {
  FREE: 'free',
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
  CUSTOM: 'custom',
} as const;

export type PricingTier = (typeof PricingTiers)[keyof typeof PricingTiers];

// =============================================================================
// TYPES
// =============================================================================

export interface UsageRecord {
  /** Record ID */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Resource type */
  resourceType: ResourceType;
  /** Quantity used */
  quantity: number;
  /** Unit (e.g., 'requests', 'GB', 'hours') */
  unit: string;
  /** Timestamp */
  timestamp: number;
  /** Billing period (YYYY-MM) */
  billingPeriod: string;
  /** Additional context */
  metadata?: Record<string, string>;
}

export interface CostUsageSummary {
  /** Tenant ID */
  tenantId: string;
  /** Billing period (YYYY-MM) */
  billingPeriod: string;
  /** Usage by resource type */
  byResource: Record<ResourceType, {
    quantity: number;
    unit: string;
    cost: number;
  }>;
  /** Total cost */
  totalCost: number;
  /** Cost breakdown */
  costBreakdown: {
    base: number;
    overage: number;
    credits: number;
    discount: number;
    total: number;
  };
  /** Generated at */
  generatedAt: number;
}

export interface ResourceQuota {
  /** Resource type */
  resourceType: ResourceType;
  /** Limit amount */
  limit: number;
  /** Unit */
  unit: string;
  /** Period (monthly, daily) */
  period: 'daily' | 'monthly';
  /** Current usage */
  currentUsage: number;
  /** Overage allowed */
  overageAllowed: boolean;
  /** Overage rate (per unit) */
  overageRate?: number;
}

export interface Budget {
  /** Budget ID */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Name */
  name: string;
  /** Amount limit */
  amount: number;
  /** Currency */
  currency: string;
  /** Period */
  period: 'monthly' | 'quarterly' | 'yearly';
  /** Alert thresholds (percentages) */
  alertThresholds: number[];
  /** Current spend */
  currentSpend: number;
  /** Resource types included */
  resourceTypes?: ResourceType[];
  /** Status */
  status: 'active' | 'exceeded' | 'disabled';
  /** Start date */
  startDate: string;
  /** Created at */
  createdAt: number;
  /** Updated at */
  updatedAt: number;
}

export interface BudgetAlert {
  /** Alert ID */
  id: string;
  /** Budget ID */
  budgetId: string;
  /** Tenant ID */
  tenantId: string;
  /** Threshold (percentage) */
  threshold: number;
  /** Current percentage */
  currentPercentage: number;
  /** Amount spent */
  amountSpent: number;
  /** Budget amount */
  budgetAmount: number;
  /** Triggered at */
  triggeredAt: number;
  /** Acknowledged */
  acknowledged: boolean;
}

export interface PricingPlan {
  /** Plan ID */
  id: string;
  /** Tier */
  tier: PricingTier;
  /** Name */
  name: string;
  /** Description */
  description: string;
  /** Base price (monthly) */
  basePrice: number;
  /** Currency */
  currency: string;
  /** Included resources */
  includedResources: Record<ResourceType, {
    included: number;
    unit: string;
    overageRate: number;
  }>;
  /** Features */
  features: string[];
  /** Active */
  active: boolean;
}

export interface CostInvoice {
  /** Invoice ID */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Billing period */
  billingPeriod: string;
  /** Status */
  status: 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled';
  /** Line items */
  lineItems: CostInvoiceLineItem[];
  /** Subtotal */
  subtotal: number;
  /** Tax */
  tax: number;
  /** Total */
  total: number;
  /** Currency */
  currency: string;
  /** Due date */
  dueDate: string;
  /** Paid at */
  paidAt?: number;
  /** Created at */
  createdAt: number;
}

export interface CostInvoiceLineItem {
  /** Description */
  description: string;
  /** Resource type */
  resourceType: ResourceType;
  /** Quantity */
  quantity: number;
  /** Unit */
  unit: string;
  /** Unit price */
  unitPrice: number;
  /** Total */
  total: number;
}

export interface CostAllocation {
  /** Allocation ID */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Project/team */
  allocation: string;
  /** Resource type */
  resourceType: ResourceType;
  /** Quantity */
  quantity: number;
  /** Cost */
  cost: number;
  /** Billing period */
  billingPeriod: string;
  /** Tags */
  tags: Record<string, string>;
}

// =============================================================================
// COST MANAGEMENT SERVICE
// =============================================================================

/**
 * Cost management and metering service
 */
export class CostManagementService {
  private usageRecords: Map<string, UsageRecord[]> = new Map(); // tenantId -> records
  private budgets: Map<string, Budget> = new Map();
  private alerts: BudgetAlert[] = [];
  private plans: Map<string, PricingPlan> = new Map();
  private invoices: Map<string, CostInvoice[]> = new Map(); // tenantId -> invoices
  private allocations: Map<string, CostAllocation[]> = new Map();
  private recordCounter = 0;
  private budgetCounter = 0;
  private alertCounter = 0;
  private invoiceCounter = 0;
  private allocationCounter = 0;

  constructor() {
    // Initialize default pricing plans
    this.initializeDefaultPlans();
  }

  // ---------------------------------------------------------------------------
  // Usage Metering
  // ---------------------------------------------------------------------------

  /**
   * Record resource usage
   */
  recordUsage(
    tenantId: string,
    resourceType: ResourceType,
    quantity: number,
    unit: string,
    metadata?: Record<string, string>
  ): UsageRecord {
    const now = Date.now();
    const billingPeriod = this.getBillingPeriod(now);

    const record: UsageRecord = {
      id: `usage_${++this.recordCounter}`,
      tenantId,
      resourceType,
      quantity,
      unit,
      timestamp: now,
      billingPeriod,
      metadata,
    };

    if (!this.usageRecords.has(tenantId)) {
      this.usageRecords.set(tenantId, []);
    }
    this.usageRecords.get(tenantId)!.push(record);

    // Check budgets
    this.checkBudgets(tenantId);

    return record;
  }

  /**
   * Get usage for a tenant and period
   */
  getUsage(
    tenantId: string,
    billingPeriod: string,
    resourceType?: ResourceType
  ): UsageRecord[] {
    const records = this.usageRecords.get(tenantId) ?? [];
    return records.filter(r => {
      if (r.billingPeriod !== billingPeriod) return false;
      if (resourceType && r.resourceType !== resourceType) return false;
      return true;
    });
  }

  /**
   * Get usage summary for a tenant
   */
  getCostUsageSummary(tenantId: string, billingPeriod: string): CostUsageSummary {
    const records = this.getUsage(tenantId, billingPeriod);
    const byResource: Record<ResourceType, { quantity: number; unit: string; cost: number }> = {} as Record<ResourceType, { quantity: number; unit: string; cost: number }>;

    // Aggregate usage by resource type
    for (const record of records) {
      if (!byResource[record.resourceType]) {
        byResource[record.resourceType] = {
          quantity: 0,
          unit: record.unit,
          cost: 0,
        };
      }
      byResource[record.resourceType].quantity += record.quantity;
    }

    // Calculate costs
    const plan = this.getTenantPlan(tenantId);
    const base = plan?.basePrice ?? 0;
    let overage = 0;

    for (const [resourceType, usage] of Object.entries(byResource)) {
      const rt = resourceType as ResourceType;
      const included = plan?.includedResources[rt];
      if (included) {
        const overageQty = Math.max(0, usage.quantity - included.included);
        const overageCost = overageQty * included.overageRate;
        usage.cost = overageCost;
        overage += overageCost;
      }
    }

    return {
      tenantId,
      billingPeriod,
      byResource,
      totalCost: base + overage,
      costBreakdown: {
        base,
        overage,
        credits: 0,
        discount: 0,
        total: base + overage,
      },
      generatedAt: Date.now(),
    };
  }

  // ---------------------------------------------------------------------------
  // Quotas
  // ---------------------------------------------------------------------------

  /**
   * Check if tenant is within quota
   */
  checkQuota(
    tenantId: string,
    resourceType: ResourceType,
    additionalQuantity: number = 0
  ): {
    withinQuota: boolean;
    currentUsage: number;
    limit: number;
    remaining: number;
  } {
    const plan = this.getTenantPlan(tenantId);
    const billingPeriod = this.getBillingPeriod();
    const usage = this.getUsage(tenantId, billingPeriod, resourceType);

    const currentUsage = usage.reduce((sum, r) => sum + r.quantity, 0);
    const limit = plan?.includedResources[resourceType]?.included ?? Infinity;
    const projected = currentUsage + additionalQuantity;

    return {
      withinQuota: projected <= limit,
      currentUsage,
      limit,
      remaining: Math.max(0, limit - currentUsage),
    };
  }

  /**
   * Get all quotas for a tenant
   */
  getQuotas(tenantId: string): ResourceQuota[] {
    const plan = this.getTenantPlan(tenantId);
    if (!plan) return [];

    const billingPeriod = this.getBillingPeriod();
    const quotas: ResourceQuota[] = [];

    for (const [rt, config] of Object.entries(plan.includedResources)) {
      const resourceType = rt as ResourceType;
      const usage = this.getUsage(tenantId, billingPeriod, resourceType);
      const currentUsage = usage.reduce((sum, r) => sum + r.quantity, 0);

      quotas.push({
        resourceType,
        limit: config.included,
        unit: config.unit,
        period: 'monthly',
        currentUsage,
        overageAllowed: config.overageRate > 0,
        overageRate: config.overageRate,
      });
    }

    return quotas;
  }

  // ---------------------------------------------------------------------------
  // Budgets
  // ---------------------------------------------------------------------------

  /**
   * Create a budget
   */
  createBudget(
    params: Omit<Budget, 'id' | 'currentSpend' | 'status' | 'createdAt' | 'updatedAt'>
  ): Budget {
    const budget: Budget = {
      ...params,
      id: `budget_${++this.budgetCounter}`,
      currentSpend: 0,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.budgets.set(budget.id, budget);
    return budget;
  }

  /**
   * Get budget by ID
   */
  getBudget(budgetId: string): Budget | undefined {
    return this.budgets.get(budgetId);
  }

  /**
   * List budgets for tenant
   */
  listBudgets(tenantId: string): Budget[] {
    return Array.from(this.budgets.values()).filter(b => b.tenantId === tenantId);
  }

  /**
   * Update budget
   */
  updateBudget(
    budgetId: string,
    updates: Partial<Pick<Budget, 'name' | 'amount' | 'alertThresholds' | 'status'>>
  ): Budget | undefined {
    const budget = this.budgets.get(budgetId);
    if (!budget) return undefined;

    Object.assign(budget, updates, { updatedAt: Date.now() });
    return budget;
  }

  /**
   * Delete budget
   */
  deleteBudget(budgetId: string): boolean {
    return this.budgets.delete(budgetId);
  }

  /**
   * Check budgets and trigger alerts
   */
  private checkBudgets(tenantId: string): void {
    const budgets = this.listBudgets(tenantId);
    const billingPeriod = this.getBillingPeriod();

    for (const budget of budgets) {
      if (budget.status === 'disabled') continue;

      const summary = this.getCostUsageSummary(tenantId, billingPeriod);
      const spend = budget.resourceTypes
        ? Object.entries(summary.byResource)
            .filter(([rt]) => budget.resourceTypes!.includes(rt as ResourceType))
            .reduce((sum, [, u]) => sum + u.cost, 0)
        : summary.totalCost;

      budget.currentSpend = spend;
      const percentage = (spend / budget.amount) * 100;

      // Check thresholds
      for (const threshold of budget.alertThresholds) {
        if (percentage >= threshold) {
          const existingAlert = this.alerts.find(a =>
            a.budgetId === budget.id &&
            a.threshold === threshold &&
            !a.acknowledged
          );

          if (!existingAlert) {
            const alert: BudgetAlert = {
              id: `alert_${++this.alertCounter}`,
              budgetId: budget.id,
              tenantId,
              threshold,
              currentPercentage: percentage,
              amountSpent: spend,
              budgetAmount: budget.amount,
              triggeredAt: Date.now(),
              acknowledged: false,
            };
            this.alerts.push(alert);
          }
        }
      }

      // Update status
      if (percentage >= 100) {
        budget.status = 'exceeded';
      }
    }
  }

  /**
   * Get budget alerts
   */
  getBudgetAlerts(tenantId: string, unacknowledgedOnly: boolean = false): BudgetAlert[] {
    return this.alerts.filter(a => {
      if (a.tenantId !== tenantId) return false;
      if (unacknowledgedOnly && a.acknowledged) return false;
      return true;
    });
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) return false;
    alert.acknowledged = true;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Pricing Plans
  // ---------------------------------------------------------------------------

  /**
   * Get pricing plan
   */
  getPlan(planId: string): PricingPlan | undefined {
    return this.plans.get(planId);
  }

  /**
   * List all plans
   */
  listPlans(activeOnly: boolean = true): PricingPlan[] {
    return Array.from(this.plans.values()).filter(p => !activeOnly || p.active);
  }

  /**
   * Get plan by tier
   */
  getPlanByTier(tier: PricingTier): PricingPlan | undefined {
    return Array.from(this.plans.values()).find(p => p.tier === tier && p.active);
  }

  // Tenant plan mapping (simplified - would be in database)
  private tenantPlans: Map<string, string> = new Map();

  /**
   * Set tenant plan
   */
  setTenantPlan(tenantId: string, planId: string): void {
    this.tenantPlans.set(tenantId, planId);
  }

  /**
   * Get tenant's current plan
   */
  getTenantPlan(tenantId: string): PricingPlan | undefined {
    const planId = this.tenantPlans.get(tenantId);
    return planId ? this.plans.get(planId) : this.getPlanByTier('free');
  }

  // ---------------------------------------------------------------------------
  // Invoicing
  // ---------------------------------------------------------------------------

  /**
   * Generate invoice for billing period
   */
  generateInvoice(tenantId: string, billingPeriod: string): CostInvoice {
    const summary = this.getCostUsageSummary(tenantId, billingPeriod);
    const plan = this.getTenantPlan(tenantId);

    const lineItems: CostInvoiceLineItem[] = [];

    // Base subscription
    if (plan) {
      lineItems.push({
        description: `${plan.name} - Base Subscription`,
        resourceType: 'api_call' as ResourceType,
        quantity: 1,
        unit: 'month',
        unitPrice: plan.basePrice,
        total: plan.basePrice,
      });
    }

    // Usage-based items
    for (const [rt, usage] of Object.entries(summary.byResource)) {
      if (usage.cost > 0) {
        const resourceType = rt as ResourceType;
        const included = plan?.includedResources[resourceType];
        const overage = included ? Math.max(0, usage.quantity - included.included) : usage.quantity;

        if (overage > 0) {
          lineItems.push({
            description: `${resourceType} overage`,
            resourceType,
            quantity: overage,
            unit: usage.unit,
            unitPrice: included?.overageRate ?? 0,
            total: usage.cost,
          });
        }
      }
    }

    const subtotal = lineItems.reduce((sum, li) => sum + li.total, 0);
    const tax = subtotal * 0.0; // No tax in this simplified version

    const invoice: CostInvoice = {
      id: `inv_${++this.invoiceCounter}`,
      tenantId,
      billingPeriod,
      status: 'pending',
      lineItems,
      subtotal,
      tax,
      total: subtotal + tax,
      currency: 'USD',
      dueDate: this.getDueDate(billingPeriod),
      createdAt: Date.now(),
    };

    if (!this.invoices.has(tenantId)) {
      this.invoices.set(tenantId, []);
    }
    this.invoices.get(tenantId)!.push(invoice);

    return invoice;
  }

  /**
   * Get invoice by ID
   */
  getInvoice(tenantId: string, invoiceId: string): CostInvoice | undefined {
    return this.invoices.get(tenantId)?.find(i => i.id === invoiceId);
  }

  /**
   * List invoices for tenant
   */
  listInvoices(tenantId: string, status?: CostInvoice['status']): CostInvoice[] {
    const invoices = this.invoices.get(tenantId) ?? [];
    return status ? invoices.filter(i => i.status === status) : invoices;
  }

  /**
   * Mark invoice as paid
   */
  markInvoicePaid(tenantId: string, invoiceId: string): CostInvoice | undefined {
    const invoice = this.getInvoice(tenantId, invoiceId);
    if (!invoice) return undefined;

    invoice.status = 'paid';
    invoice.paidAt = Date.now();
    return invoice;
  }

  // ---------------------------------------------------------------------------
  // Cost Allocation
  // ---------------------------------------------------------------------------

  /**
   * Record cost allocation
   */
  recordAllocation(
    params: Omit<CostAllocation, 'id'>
  ): CostAllocation {
    const allocation: CostAllocation = {
      ...params,
      id: `alloc_${++this.allocationCounter}`,
    };

    if (!this.allocations.has(params.tenantId)) {
      this.allocations.set(params.tenantId, []);
    }
    this.allocations.get(params.tenantId)!.push(allocation);

    return allocation;
  }

  /**
   * Get allocations for tenant
   */
  getAllocations(
    tenantId: string,
    billingPeriod?: string,
    allocation?: string
  ): CostAllocation[] {
    let allocs = this.allocations.get(tenantId) ?? [];

    if (billingPeriod) {
      allocs = allocs.filter(a => a.billingPeriod === billingPeriod);
    }

    if (allocation) {
      allocs = allocs.filter(a => a.allocation === allocation);
    }

    return allocs;
  }

  /**
   * Get allocation summary by project/team
   */
  getAllocationSummary(
    tenantId: string,
    billingPeriod: string
  ): Record<string, {
    totalCost: number;
    byResource: Record<ResourceType, number>;
  }> {
    const allocs = this.getAllocations(tenantId, billingPeriod);
    const summary: Record<string, { totalCost: number; byResource: Record<ResourceType, number> }> = {};

    for (const alloc of allocs) {
      if (!summary[alloc.allocation]) {
        summary[alloc.allocation] = {
          totalCost: 0,
          byResource: {} as Record<ResourceType, number>,
        };
      }

      summary[alloc.allocation].totalCost += alloc.cost;
      summary[alloc.allocation].byResource[alloc.resourceType] =
        (summary[alloc.allocation].byResource[alloc.resourceType] ?? 0) + alloc.cost;
    }

    return summary;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getBillingPeriod(timestamp?: number): string {
    const date = timestamp ? new Date(timestamp) : new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private getDueDate(billingPeriod: string): string {
    const [year, month] = billingPeriod.split('-').map(Number);
    const nextMonth = new Date(year, month, 15);
    return nextMonth.toISOString().split('T')[0];
  }

  private initializeDefaultPlans(): void {
    const freePlan: PricingPlan = {
      id: 'plan_free',
      tier: 'free',
      name: 'Free',
      description: 'Get started with basic features',
      basePrice: 0,
      currency: 'USD',
      includedResources: {
        api_call: { included: 1000, unit: 'requests', overageRate: 0 },
        compute: { included: 10, unit: 'hours', overageRate: 0 },
        storage: { included: 1, unit: 'GB', overageRate: 0 },
        forecast: { included: 100, unit: 'forecasts', overageRate: 0 },
        data_point: { included: 10000, unit: 'points', overageRate: 0 },
        connector: { included: 2, unit: 'connectors', overageRate: 0 },
        export: { included: 10, unit: 'exports', overageRate: 0 },
        import: { included: 10, unit: 'imports', overageRate: 0 },
        user: { included: 1, unit: 'users', overageRate: 0 },
        alert: { included: 5, unit: 'alerts', overageRate: 0 },
      },
      features: ['Basic forecasting', 'Email support'],
      active: true,
    };

    const starterPlan: PricingPlan = {
      id: 'plan_starter',
      tier: 'starter',
      name: 'Starter',
      description: 'For small teams getting started',
      basePrice: 49,
      currency: 'USD',
      includedResources: {
        api_call: { included: 10000, unit: 'requests', overageRate: 0.001 },
        compute: { included: 50, unit: 'hours', overageRate: 0.10 },
        storage: { included: 10, unit: 'GB', overageRate: 0.10 },
        forecast: { included: 1000, unit: 'forecasts', overageRate: 0.05 },
        data_point: { included: 100000, unit: 'points', overageRate: 0.0001 },
        connector: { included: 5, unit: 'connectors', overageRate: 5 },
        export: { included: 100, unit: 'exports', overageRate: 0.10 },
        import: { included: 100, unit: 'imports', overageRate: 0.10 },
        user: { included: 5, unit: 'users', overageRate: 10 },
        alert: { included: 25, unit: 'alerts', overageRate: 1 },
      },
      features: ['All free features', 'Advanced forecasting', 'Priority support', 'API access'],
      active: true,
    };

    const proPlan: PricingPlan = {
      id: 'plan_professional',
      tier: 'professional',
      name: 'Professional',
      description: 'For growing businesses',
      basePrice: 199,
      currency: 'USD',
      includedResources: {
        api_call: { included: 100000, unit: 'requests', overageRate: 0.0005 },
        compute: { included: 200, unit: 'hours', overageRate: 0.08 },
        storage: { included: 100, unit: 'GB', overageRate: 0.05 },
        forecast: { included: 10000, unit: 'forecasts', overageRate: 0.02 },
        data_point: { included: 1000000, unit: 'points', overageRate: 0.00005 },
        connector: { included: 20, unit: 'connectors', overageRate: 3 },
        export: { included: 1000, unit: 'exports', overageRate: 0.05 },
        import: { included: 1000, unit: 'imports', overageRate: 0.05 },
        user: { included: 25, unit: 'users', overageRate: 8 },
        alert: { included: 100, unit: 'alerts', overageRate: 0.50 },
      },
      features: ['All starter features', 'Custom models', 'SLA guarantee', 'Dedicated support'],
      active: true,
    };

    const enterprisePlan: PricingPlan = {
      id: 'plan_enterprise',
      tier: 'enterprise',
      name: 'Enterprise',
      description: 'For large organizations',
      basePrice: 999,
      currency: 'USD',
      includedResources: {
        api_call: { included: 1000000, unit: 'requests', overageRate: 0.0002 },
        compute: { included: 1000, unit: 'hours', overageRate: 0.05 },
        storage: { included: 1000, unit: 'GB', overageRate: 0.02 },
        forecast: { included: 100000, unit: 'forecasts', overageRate: 0.01 },
        data_point: { included: 10000000, unit: 'points', overageRate: 0.00001 },
        connector: { included: 100, unit: 'connectors', overageRate: 2 },
        export: { included: 10000, unit: 'exports', overageRate: 0.02 },
        import: { included: 10000, unit: 'imports', overageRate: 0.02 },
        user: { included: 100, unit: 'users', overageRate: 5 },
        alert: { included: 500, unit: 'alerts', overageRate: 0.25 },
      },
      features: ['All professional features', 'Custom deployment', '24/7 support', 'Custom SLA'],
      active: true,
    };

    this.plans.set(freePlan.id, freePlan);
    this.plans.set(starterPlan.id, starterPlan);
    this.plans.set(proPlan.id, proPlan);
    this.plans.set(enterprisePlan.id, enterprisePlan);
  }
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const UsageRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  resourceType: z.enum(['api_call', 'compute', 'storage', 'forecast', 'data_point', 'connector', 'export', 'import', 'user', 'alert']),
  quantity: z.number().nonnegative(),
  unit: z.string(),
  timestamp: z.number(),
  billingPeriod: z.string().regex(/^\d{4}-\d{2}$/),
  metadata: z.record(z.string()).optional(),
});

export const BudgetSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string().min(1).max(100),
  amount: z.number().positive(),
  currency: z.string().length(3),
  period: z.enum(['monthly', 'quarterly', 'yearly']),
  alertThresholds: z.array(z.number().min(0).max(200)),
  currentSpend: z.number().nonnegative(),
  resourceTypes: z.array(z.string()).optional(),
  status: z.enum(['active', 'exceeded', 'disabled']),
  startDate: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a cost management service
 */
export function createCostManagementService(): CostManagementService {
  return new CostManagementService();
}
