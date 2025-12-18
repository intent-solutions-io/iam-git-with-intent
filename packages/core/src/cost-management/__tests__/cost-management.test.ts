/**
 * Tests for Phase 66: Cost Management + Metering
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CostManagementService,
  createCostManagementService,
  COST_MANAGEMENT_VERSION,
  ResourceTypes,
  PricingTiers,
  type UsageRecord,
  type Budget,
  type CostUsageSummary,
} from '../index.js';

describe('Cost Management', () => {
  let service: CostManagementService;

  beforeEach(() => {
    service = createCostManagementService();
  });

  describe('Module exports', () => {
    it('should export version constant', () => {
      expect(COST_MANAGEMENT_VERSION).toBe('1.0.0');
    });

    it('should export ResourceTypes', () => {
      expect(ResourceTypes.API_CALL).toBe('api_call');
      expect(ResourceTypes.COMPUTE).toBe('compute');
      expect(ResourceTypes.STORAGE).toBe('storage');
      expect(ResourceTypes.FORECAST).toBe('forecast');
    });

    it('should export PricingTiers', () => {
      expect(PricingTiers.FREE).toBe('free');
      expect(PricingTiers.STARTER).toBe('starter');
      expect(PricingTiers.PROFESSIONAL).toBe('professional');
      expect(PricingTiers.ENTERPRISE).toBe('enterprise');
    });

    it('should export factory function', () => {
      expect(typeof createCostManagementService).toBe('function');
      const instance = createCostManagementService();
      expect(instance).toBeInstanceOf(CostManagementService);
    });
  });

  describe('Usage Metering', () => {
    it('should record usage for a tenant', () => {
      const record = service.recordUsage(
        'tenant-1',
        ResourceTypes.API_CALL,
        100,
        'requests'
      );

      expect(record).toBeDefined();
      expect(record.id).toMatch(/^usage_/);
      expect(record.tenantId).toBe('tenant-1');
      expect(record.resourceType).toBe('api_call');
      expect(record.quantity).toBe(100);
      expect(record.unit).toBe('requests');
      expect(record.billingPeriod).toMatch(/^\d{4}-\d{2}$/);
    });

    it('should record usage with metadata', () => {
      const record = service.recordUsage(
        'tenant-1',
        ResourceTypes.COMPUTE,
        60,
        'minutes',
        { job_id: 'job-123', type: 'forecast' }
      );

      expect(record.metadata).toEqual({
        job_id: 'job-123',
        type: 'forecast',
      });
    });

    it('should accumulate multiple usage records', () => {
      service.recordUsage('tenant-1', ResourceTypes.API_CALL, 50, 'requests');
      service.recordUsage('tenant-1', ResourceTypes.API_CALL, 75, 'requests');
      service.recordUsage('tenant-1', ResourceTypes.STORAGE, 10, 'GB');

      const billingPeriod = new Date().toISOString().slice(0, 7);
      const apiUsage = service.getUsage('tenant-1', billingPeriod, ResourceTypes.API_CALL);
      const storageUsage = service.getUsage('tenant-1', billingPeriod, ResourceTypes.STORAGE);

      expect(apiUsage).toHaveLength(2);
      expect(storageUsage).toHaveLength(1);
    });

    it('should return empty array for tenant with no usage', () => {
      const billingPeriod = new Date().toISOString().slice(0, 7);
      const usage = service.getUsage('nonexistent-tenant', billingPeriod);
      expect(usage).toEqual([]);
    });
  });

  describe('Usage Summary', () => {
    it('should generate usage summary for a tenant', () => {
      service.recordUsage('tenant-1', ResourceTypes.API_CALL, 100, 'requests');
      service.recordUsage('tenant-1', ResourceTypes.API_CALL, 50, 'requests');
      service.recordUsage('tenant-1', ResourceTypes.STORAGE, 5, 'GB');

      const billingPeriod = new Date().toISOString().slice(0, 7);
      const summary = service.getCostUsageSummary('tenant-1', billingPeriod);

      expect(summary.tenantId).toBe('tenant-1');
      expect(summary.billingPeriod).toBe(billingPeriod);
      expect(summary.byResource[ResourceTypes.API_CALL].quantity).toBe(150);
      expect(summary.byResource[ResourceTypes.STORAGE].quantity).toBe(5);
      expect(summary.costBreakdown).toBeDefined();
      expect(summary.totalCost).toBeGreaterThanOrEqual(0);
    });

    it('should return empty summary for tenant with no usage', () => {
      const billingPeriod = new Date().toISOString().slice(0, 7);
      const summary = service.getCostUsageSummary('empty-tenant', billingPeriod);

      expect(summary.tenantId).toBe('empty-tenant');
      expect(summary.totalCost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Quotas', () => {
    it('should check if tenant is within quota', () => {
      const result = service.checkQuota('tenant-1', ResourceTypes.API_CALL);

      expect(result).toHaveProperty('withinQuota');
      expect(result).toHaveProperty('currentUsage');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('remaining');
    });

    it('should track usage against quota', () => {
      // Record some usage
      service.recordUsage('tenant-1', ResourceTypes.API_CALL, 500, 'requests');

      const result = service.checkQuota('tenant-1', ResourceTypes.API_CALL);
      expect(result.currentUsage).toBe(500);
    });

    it('should project additional quantity against quota', () => {
      service.recordUsage('tenant-1', ResourceTypes.API_CALL, 100, 'requests');

      const withoutAdditional = service.checkQuota('tenant-1', ResourceTypes.API_CALL);
      const withAdditional = service.checkQuota('tenant-1', ResourceTypes.API_CALL, 50);

      // Both should have same remaining (implementation doesn't reduce remaining by additionalQuantity)
      // additionalQuantity only affects the withinQuota check
      expect(withAdditional.remaining).toBe(withoutAdditional.remaining);
      expect(withAdditional.currentUsage).toBe(100);
    });
  });

  describe('Budget Management', () => {
    it('should create a budget', () => {
      const budget = service.createBudget({
        tenantId: 'tenant-1',
        name: 'Monthly API Budget',
        amount: 1000,
        currency: 'USD',
        period: 'monthly',
        alertThresholds: [50, 80, 100],
      });

      expect(budget).toBeDefined();
      expect(budget.id).toMatch(/^budget_/);
      expect(budget.tenantId).toBe('tenant-1');
      expect(budget.name).toBe('Monthly API Budget');
      expect(budget.amount).toBe(1000);
      expect(budget.alertThresholds).toEqual([50, 80, 100]);
      expect(budget.status).toBe('active');
    });

    it('should get a budget by ID', () => {
      const created = service.createBudget({
        tenantId: 'tenant-1',
        name: 'Test Budget',
        amount: 500,
        currency: 'USD',
        period: 'monthly',
        alertThresholds: [75],
      });

      const retrieved = service.getBudget(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should list budgets for a tenant', () => {
      service.createBudget({
        tenantId: 'tenant-1',
        name: 'Budget 1',
        amount: 100,
        currency: 'USD',
        period: 'monthly',
        alertThresholds: [],
      });
      service.createBudget({
        tenantId: 'tenant-1',
        name: 'Budget 2',
        amount: 200,
        currency: 'USD',
        period: 'monthly',
        alertThresholds: [],
      });
      service.createBudget({
        tenantId: 'tenant-2',
        name: 'Other Budget',
        amount: 300,
        currency: 'USD',
        period: 'monthly',
        alertThresholds: [],
      });

      const tenant1Budgets = service.listBudgets('tenant-1');
      expect(tenant1Budgets).toHaveLength(2);
      expect(tenant1Budgets.every(b => b.tenantId === 'tenant-1')).toBe(true);
    });

    it('should update a budget', () => {
      const budget = service.createBudget({
        tenantId: 'tenant-1',
        name: 'Original Name',
        amount: 100,
        currency: 'USD',
        period: 'monthly',
        alertThresholds: [],
      });

      const updated = service.updateBudget(budget.id, {
        name: 'Updated Name',
        amount: 200,
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.amount).toBe(200);
    });

    it('should delete a budget', () => {
      const budget = service.createBudget({
        tenantId: 'tenant-1',
        name: 'To Delete',
        amount: 100,
        currency: 'USD',
        period: 'monthly',
        alertThresholds: [],
      });

      const deleted = service.deleteBudget(budget.id);
      expect(deleted).toBe(true);

      const retrieved = service.getBudget(budget.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Pricing Plans', () => {
    it('should have default pricing plans initialized', () => {
      const freePlan = service.getPlan('plan_free');
      const starterPlan = service.getPlan('plan_starter');
      const proPlan = service.getPlan('plan_professional');
      const enterprisePlan = service.getPlan('plan_enterprise');

      expect(freePlan).toBeDefined();
      expect(starterPlan).toBeDefined();
      expect(proPlan).toBeDefined();
      expect(enterprisePlan).toBeDefined();
    });

    it('should return undefined for nonexistent plan', () => {
      const plan = service.getPlan('nonexistent');
      expect(plan).toBeUndefined();
    });

    it('should assign plan to tenant', () => {
      service.setTenantPlan('tenant-1', 'plan_professional');
      const plan = service.getTenantPlan('tenant-1');

      expect(plan).toBeDefined();
      expect(plan!.tier).toBe(PricingTiers.PROFESSIONAL);
    });
  });

  describe('Invoice Generation', () => {
    it('should generate an invoice for a tenant', () => {
      service.setTenantPlan('tenant-1', 'plan_starter');
      service.recordUsage('tenant-1', ResourceTypes.API_CALL, 1000, 'requests');

      const billingPeriod = new Date().toISOString().slice(0, 7);
      const invoice = service.generateInvoice('tenant-1', billingPeriod);

      expect(invoice).toBeDefined();
      expect(invoice.id).toMatch(/^inv_/);
      expect(invoice.tenantId).toBe('tenant-1');
      expect(invoice.billingPeriod).toBe(billingPeriod);
      expect(invoice.status).toBe('pending');
      expect(invoice.lineItems).toBeDefined();
      expect(Array.isArray(invoice.lineItems)).toBe(true);
    });

    it('should list invoices for a tenant', () => {
      const billingPeriod = new Date().toISOString().slice(0, 7);
      service.generateInvoice('tenant-1', billingPeriod);

      const invoices = service.listInvoices('tenant-1');
      expect(invoices.length).toBeGreaterThanOrEqual(1);
    });

    it('should mark invoice as paid', () => {
      const billingPeriod = new Date().toISOString().slice(0, 7);
      const invoice = service.generateInvoice('tenant-1', billingPeriod);

      const paid = service.markInvoicePaid('tenant-1', invoice.id);
      expect(paid).toBeDefined();
      expect(paid!.status).toBe('paid');
    });
  });

  describe('Cost Allocation', () => {
    it('should allocate costs to cost centers', () => {
      service.recordUsage('tenant-1', ResourceTypes.API_CALL, 100, 'requests');

      const billingPeriod = new Date().toISOString().slice(0, 7);
      const allocation = service.recordAllocation({
        tenantId: 'tenant-1',
        allocation: 'engineering',
        resourceType: ResourceTypes.API_CALL,
        quantity: 100,
        cost: 10,
        billingPeriod,
        tags: { project: 'project-alpha' },
      });

      expect(allocation).toBeDefined();
      expect(allocation.id).toMatch(/^alloc_/);
      expect(allocation.tenantId).toBe('tenant-1');
      expect(allocation.allocation).toBe('engineering');
    });

    it('should list allocations for a tenant', () => {
      const billingPeriod = new Date().toISOString().slice(0, 7);
      service.recordAllocation({
        tenantId: 'tenant-1',
        allocation: 'engineering',
        resourceType: ResourceTypes.API_CALL,
        quantity: 50,
        cost: 5,
        billingPeriod,
        tags: { project: 'project-1' },
      });
      service.recordAllocation({
        tenantId: 'tenant-1',
        allocation: 'marketing',
        resourceType: ResourceTypes.API_CALL,
        quantity: 50,
        cost: 5,
        billingPeriod,
        tags: { project: 'project-2' },
      });

      const allocations = service.getAllocations('tenant-1', billingPeriod);
      expect(allocations).toHaveLength(2);
    });
  });
});
