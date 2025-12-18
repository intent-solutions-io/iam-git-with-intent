/**
 * Tests for Phase 64: Data Governance
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DataGovernanceEngine,
  createDataGovernanceEngine,
  createClassification,
  DataClassificationLevels,
  DataCategories,
  PiiTypes,
  type DataSchema,
  type DataField,
  type DataAccessPolicy,
  type DataQualityRule,
  type ConsentRecord,
  type DataLineageNode,
  type DataLineageEdge,
} from '../index.js';

describe('Data Governance', () => {
  describe('DataGovernanceEngine', () => {
    let engine: DataGovernanceEngine;

    beforeEach(() => {
      engine = createDataGovernanceEngine();
    });

    describe('Schema Management', () => {
      it('should register and retrieve schema', () => {
        const schema: DataSchema = {
          id: 'schema-1',
          name: 'Users',
          version: '1.0.0',
          owner: 'platform-team',
          description: 'User data schema',
          fields: [
            { name: 'id', type: 'string', required: true },
            { name: 'email', type: 'string', required: true, piiType: 'email' },
            { name: 'name', type: 'string', required: true, piiType: 'name' },
          ],
          classification: createClassification('pii'),
          tags: ['users', 'pii'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        engine.registerSchema(schema);

        const retrieved = engine.getSchema('schema-1');
        expect(retrieved).toEqual(schema);
      });

      it('should list all schemas', () => {
        const schema1: DataSchema = {
          id: 'schema-1',
          name: 'Users',
          version: '1.0.0',
          owner: 'team-a',
          description: 'Users',
          fields: [],
          classification: createClassification('internal'),
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const schema2: DataSchema = {
          id: 'schema-2',
          name: 'Orders',
          version: '1.0.0',
          owner: 'team-b',
          description: 'Orders',
          fields: [],
          classification: createClassification('confidential'),
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        engine.registerSchema(schema1);
        engine.registerSchema(schema2);

        const schemas = engine.listSchemas();
        expect(schemas).toHaveLength(2);
      });
    });

    describe('PII Detection', () => {
      it('should detect email fields', () => {
        const schema: DataSchema = {
          id: 'schema-1',
          name: 'Contacts',
          version: '1.0.0',
          owner: 'team',
          description: 'Contact data',
          fields: [
            { name: 'user_email', type: 'string', required: true },
            { name: 'contact_email_address', type: 'string', required: false },
          ],
          classification: createClassification('internal'),
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        engine.registerSchema(schema);

        const results = engine.detectPii(schema);

        expect(results).toHaveLength(2);
        expect(results.every(r => r.piiType === 'email')).toBe(true);
      });

      it('should detect phone fields', () => {
        const schema: DataSchema = {
          id: 'schema-1',
          name: 'Contacts',
          version: '1.0.0',
          owner: 'team',
          description: 'Contact data',
          fields: [
            { name: 'phone_number', type: 'string', required: true },
            { name: 'mobile', type: 'string', required: false },
          ],
          classification: createClassification('internal'),
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const results = engine.detectPii(schema);

        expect(results).toHaveLength(2);
        expect(results.every(r => r.piiType === 'phone')).toBe(true);
      });

      it('should detect name fields', () => {
        const schema: DataSchema = {
          id: 'schema-1',
          name: 'Users',
          version: '1.0.0',
          owner: 'team',
          description: 'User data',
          fields: [
            { name: 'first_name', type: 'string', required: true },
            { name: 'last_name', type: 'string', required: true },
            { name: 'full_name', type: 'string', required: false },
          ],
          classification: createClassification('internal'),
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const results = engine.detectPii(schema);

        expect(results).toHaveLength(3);
        expect(results.every(r => r.piiType === 'name')).toBe(true);
      });

      it('should detect SSN and DOB fields', () => {
        const schema: DataSchema = {
          id: 'schema-1',
          name: 'Sensitive',
          version: '1.0.0',
          owner: 'team',
          description: 'Sensitive data',
          fields: [
            { name: 'ssn', type: 'string', required: true },
            { name: 'date_of_birth', type: 'date', required: false },
          ],
          classification: createClassification('restricted'),
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const results = engine.detectPii(schema);

        expect(results).toHaveLength(2);
        expect(results.find(r => r.piiType === 'ssn')).toBeDefined();
        expect(results.find(r => r.piiType === 'date_of_birth')).toBeDefined();
      });
    });

    describe('Access Policy Evaluation', () => {
      beforeEach(() => {
        const schema: DataSchema = {
          id: 'schema-1',
          name: 'Users',
          version: '1.0.0',
          owner: 'team',
          description: 'User data',
          fields: [
            { name: 'id', type: 'string', required: true },
            { name: 'email', type: 'string', required: true },
            { name: 'ssn', type: 'string', required: false },
          ],
          classification: createClassification('pii'),
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        engine.registerSchema(schema);
      });

      it('should allow access with matching role', () => {
        const policy: DataAccessPolicy = {
          id: 'policy-1',
          name: 'Admin Access',
          description: 'Allow admin access',
          schemaIds: ['schema-1'],
          rules: [
            {
              id: 'rule-1',
              name: 'Allow admins',
              action: 'allow',
              conditions: [
                { type: 'role', operator: 'contains', value: 'admin' },
              ],
            },
          ],
          priority: 1,
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        engine.registerAccessPolicy(policy);

        const result = engine.evaluateAccess(
          'schema-1',
          { roles: ['admin'], permissions: ['data:approve'], attributes: {} },
          'read'
        );

        expect(result.allowed).toBe(true);
      });

      it('should deny access with deny rule', () => {
        const policy: DataAccessPolicy = {
          id: 'policy-1',
          name: 'Deny External',
          description: 'Deny external users',
          schemaIds: ['schema-1'],
          rules: [
            {
              id: 'rule-1',
              name: 'Deny external',
              action: 'deny',
              conditions: [
                { type: 'role', operator: 'contains', value: 'external' },
              ],
            },
          ],
          priority: 1,
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        engine.registerAccessPolicy(policy);

        const result = engine.evaluateAccess(
          'schema-1',
          { roles: ['external'], permissions: [], attributes: {} },
          'read'
        );

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Denied by policy');
      });

      it('should apply field masking', () => {
        const policy: DataAccessPolicy = {
          id: 'policy-1',
          name: 'Mask SSN',
          description: 'Mask SSN for non-admins',
          schemaIds: ['schema-1'],
          rules: [
            {
              id: 'rule-1',
              name: 'Mask SSN',
              action: 'mask',
              conditions: [
                { type: 'role', operator: 'not_in', value: ['admin'] },
              ],
              fields: ['ssn'],
            },
          ],
          priority: 1,
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        engine.registerAccessPolicy(policy);

        const result = engine.evaluateAccess(
          'schema-1',
          { roles: ['viewer'], permissions: ['data:approve'], attributes: {} },
          'read'
        );

        expect(result.allowed).toBe(true);
        expect(result.maskedFields).toContain('ssn');
      });

      it('should return not found for missing schema', () => {
        const result = engine.evaluateAccess(
          'non-existent',
          { roles: ['admin'], permissions: [], attributes: {} },
          'read'
        );

        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('Schema not found');
      });
    });

    describe('Data Quality', () => {
      it('should run quality checks', () => {
        const schema: DataSchema = {
          id: 'schema-1',
          name: 'Products',
          version: '1.0.0',
          owner: 'team',
          description: 'Products',
          fields: [
            { name: 'id', type: 'string', required: true },
            { name: 'price', type: 'number', required: true },
          ],
          classification: createClassification('internal'),
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        engine.registerSchema(schema);

        const rules: DataQualityRule[] = [
          {
            id: 'rule-1',
            name: 'Price not null',
            schemaId: 'schema-1',
            fieldName: 'price',
            type: 'not_null',
            config: {},
            severity: 'error',
            enabled: true,
          },
          {
            id: 'rule-2',
            name: 'Price range',
            schemaId: 'schema-1',
            fieldName: 'price',
            type: 'range',
            config: { min: 0, max: 10000 },
            severity: 'warning',
            enabled: true,
          },
        ];

        engine.registerQualityRules('schema-1', rules);

        const data = [
          { id: '1', price: 100 },
          { id: '2', price: 200 },
          { id: '3', price: null },
          { id: '4', price: 15000 }, // Out of range
        ];

        const report = engine.runQualityChecks('schema-1', data);

        expect(report.id).toBeDefined();
        expect(report.schemaId).toBe('schema-1');
        expect(report.results).toHaveLength(2);

        const notNullResult = report.results.find(r => r.ruleId === 'rule-1');
        expect(notNullResult?.passedRecords).toBe(3);
        expect(notNullResult?.failedRecords).toBe(1);

        const rangeResult = report.results.find(r => r.ruleId === 'rule-2');
        // Range check returns false for non-numeric values (null fails)
        expect(rangeResult?.passedRecords).toBe(2);
        expect(rangeResult?.failedRecords).toBe(2);
      });

      it('should check pattern rules', () => {
        const rules: DataQualityRule[] = [
          {
            id: 'rule-1',
            name: 'Email format',
            schemaId: 'schema-1',
            fieldName: 'email',
            type: 'pattern',
            config: { pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$' },
            severity: 'error',
            enabled: true,
          },
        ];

        engine.registerQualityRules('schema-1', rules);

        const data = [
          { email: 'valid@example.com' },
          { email: 'another@test.org' },
          { email: 'invalid-email' },
        ];

        const report = engine.runQualityChecks('schema-1', data);

        expect(report.results[0].passedRecords).toBe(2);
        expect(report.results[0].failedRecords).toBe(1);
      });
    });

    describe('Consent Management', () => {
      it('should record and check consent', () => {
        const consent: ConsentRecord = {
          id: 'consent-1',
          subjectId: 'user-123',
          tenantId: 'tenant-123',
          purpose: 'marketing',
          dataTypes: ['email', 'name'],
          status: 'granted',
          grantedAt: new Date().toISOString(),
          collectionMethod: 'explicit',
          legalBasis: 'consent',
          termsVersion: '1.0',
        };

        engine.recordConsent(consent);

        expect(engine.checkConsent('user-123', 'marketing', 'email')).toBe(true);
        expect(engine.checkConsent('user-123', 'marketing', 'phone')).toBe(false);
        expect(engine.checkConsent('user-123', 'analytics', 'email')).toBe(false);
      });

      it('should handle withdrawn consent', () => {
        const consent: ConsentRecord = {
          id: 'consent-1',
          subjectId: 'user-456',
          tenantId: 'tenant-123',
          purpose: 'notifications',
          dataTypes: ['email'],
          status: 'granted',
          grantedAt: new Date().toISOString(),
          collectionMethod: 'explicit',
          legalBasis: 'consent',
          termsVersion: '1.0',
        };

        engine.recordConsent(consent);
        expect(engine.checkConsent('user-456', 'notifications', 'email')).toBe(true);

        engine.withdrawConsent('user-456', 'notifications');
        expect(engine.checkConsent('user-456', 'notifications', 'email')).toBe(false);
      });

      it('should handle expired consent', () => {
        const consent: ConsentRecord = {
          id: 'consent-1',
          subjectId: 'user-789',
          tenantId: 'tenant-123',
          purpose: 'research',
          dataTypes: ['analytics'],
          status: 'granted',
          grantedAt: new Date(Date.now() - 86400000).toISOString(),
          expiresAt: new Date(Date.now() - 1000).toISOString(), // Already expired
          collectionMethod: 'explicit',
          legalBasis: 'consent',
          termsVersion: '1.0',
        };

        engine.recordConsent(consent);
        expect(engine.checkConsent('user-789', 'research', 'analytics')).toBe(false);
      });

      it('should get all consents for subject', () => {
        const consent1: ConsentRecord = {
          id: 'consent-1',
          subjectId: 'user-abc',
          tenantId: 'tenant-123',
          purpose: 'marketing',
          dataTypes: ['email'],
          status: 'granted',
          grantedAt: new Date().toISOString(),
          collectionMethod: 'explicit',
          legalBasis: 'consent',
          termsVersion: '1.0',
        };

        const consent2: ConsentRecord = {
          id: 'consent-2',
          subjectId: 'user-abc',
          tenantId: 'tenant-123',
          purpose: 'analytics',
          dataTypes: ['behavior'],
          status: 'granted',
          grantedAt: new Date().toISOString(),
          collectionMethod: 'implicit',
          legalBasis: 'legitimate_interest',
          termsVersion: '1.0',
        };

        engine.recordConsent(consent1);
        engine.recordConsent(consent2);

        const consents = engine.getSubjectConsents('user-abc');
        expect(consents).toHaveLength(2);
      });
    });

    describe('Data Lineage', () => {
      it('should track lineage nodes and edges', () => {
        const nodes: DataLineageNode[] = [
          { id: 'src-1', type: 'source', system: 'postgres', dataset: 'raw_orders', metadata: {} },
          { id: 'transform-1', type: 'transform', system: 'spark', dataset: 'cleaned_orders', metadata: {} },
          { id: 'dest-1', type: 'destination', system: 'bigquery', dataset: 'orders', metadata: {} },
        ];

        const edges: DataLineageEdge[] = [
          { sourceId: 'src-1', targetId: 'transform-1', transformationType: 'filter' },
          { sourceId: 'transform-1', targetId: 'dest-1', transformationType: 'copy' },
        ];

        engine.initializeLineageGraph(nodes, edges);

        const graph = engine.getLineageGraph();
        expect(graph).toBeDefined();
        expect(graph?.nodes).toHaveLength(3);
        expect(graph?.edges).toHaveLength(2);
      });

      it('should get upstream lineage', () => {
        const nodes: DataLineageNode[] = [
          { id: 'src-1', type: 'source', system: 'api', dataset: 'users', metadata: {} },
          { id: 'src-2', type: 'source', system: 'api', dataset: 'orders', metadata: {} },
          { id: 'join-1', type: 'transform', system: 'spark', dataset: 'user_orders', metadata: {} },
          { id: 'dest-1', type: 'destination', system: 'warehouse', dataset: 'analytics', metadata: {} },
        ];

        const edges: DataLineageEdge[] = [
          { sourceId: 'src-1', targetId: 'join-1', transformationType: 'join' },
          { sourceId: 'src-2', targetId: 'join-1', transformationType: 'join' },
          { sourceId: 'join-1', targetId: 'dest-1', transformationType: 'copy' },
        ];

        engine.initializeLineageGraph(nodes, edges);

        const upstream = engine.getUpstreamLineage('dest-1');
        expect(upstream).toHaveLength(3);
        expect(upstream.map(n => n.id)).toContain('src-1');
        expect(upstream.map(n => n.id)).toContain('src-2');
        expect(upstream.map(n => n.id)).toContain('join-1');
      });

      it('should get downstream lineage', () => {
        const nodes: DataLineageNode[] = [
          { id: 'src-1', type: 'source', system: 'api', dataset: 'events', metadata: {} },
          { id: 'agg-1', type: 'transform', system: 'spark', dataset: 'daily_agg', metadata: {} },
          { id: 'ml-1', type: 'process', system: 'ml', dataset: 'predictions', metadata: {} },
          { id: 'dest-1', type: 'destination', system: 'api', dataset: 'recommendations', metadata: {} },
        ];

        const edges: DataLineageEdge[] = [
          { sourceId: 'src-1', targetId: 'agg-1', transformationType: 'aggregate' },
          { sourceId: 'agg-1', targetId: 'ml-1', transformationType: 'derive' },
          { sourceId: 'ml-1', targetId: 'dest-1', transformationType: 'copy' },
        ];

        engine.initializeLineageGraph(nodes, edges);

        const downstream = engine.getDownstreamLineage('src-1');
        expect(downstream).toHaveLength(3);
      });

      it('should add nodes and edges dynamically', () => {
        engine.addLineageNode({ id: 'n1', type: 'source', system: 's1', dataset: 'd1', metadata: {} });
        engine.addLineageNode({ id: 'n2', type: 'destination', system: 's2', dataset: 'd2', metadata: {} });
        engine.addLineageEdge({ sourceId: 'n1', targetId: 'n2' });

        const graph = engine.getLineageGraph();
        expect(graph?.nodes).toHaveLength(2);
        expect(graph?.edges).toHaveLength(1);
      });
    });

    describe('Data Masking', () => {
      it('should apply full masking', () => {
        const result = engine.maskValue('secret123', { type: 'full' });
        expect(result).toBe('*********');
      });

      it('should apply partial masking', () => {
        const result = engine.maskValue('1234567890', { type: 'partial', showFirst: 2, showLast: 2 });
        expect(result).toBe('12******90');
      });

      it('should apply hash masking', () => {
        const result = engine.maskValue('sensitive', { type: 'hash' });
        expect(result).toMatch(/^hashed_/);
      });

      it('should apply tokenize masking', () => {
        const result = engine.maskValue('sensitive', { type: 'tokenize' });
        expect(result).toMatch(/^tok_/);
      });

      it('should apply null masking', () => {
        const result = engine.maskValue('sensitive', { type: 'null' });
        expect(result).toBeNull();
      });

      it('should mask record based on access evaluation', () => {
        const record = {
          id: '123',
          email: 'user@example.com',
          ssn: '123-45-6789',
        };

        const evaluation = {
          allowed: true,
          reason: 'Allowed',
          maskedFields: ['email'],
          redactedFields: ['ssn'],
        };

        const masked = engine.maskRecord(record, 'schema-1', evaluation);

        expect(masked.id).toBe('123');
        expect(masked.email).toMatch(/^\w{2}\*+\w{2}$/);
        expect(masked.ssn).toBe('[REDACTED]');
      });
    });
  });

  describe('Classification Factory', () => {
    it('should create public classification', () => {
      const classification = createClassification('public');

      expect(classification.level).toBe('public');
      expect(classification.encryptionRequired).toBe(false);
      expect(classification.maskInLogs).toBe(false);
      expect(classification.accessRequiresApproval).toBe(false);
    });

    it('should create PII classification', () => {
      const classification = createClassification('pii');

      expect(classification.level).toBe('pii');
      expect(classification.encryptionRequired).toBe(true);
      expect(classification.maskInLogs).toBe(true);
      expect(classification.auditAllAccess).toBe(true);
    });

    it('should create restricted classification', () => {
      const classification = createClassification('restricted');

      expect(classification.level).toBe('restricted');
      expect(classification.encryptionRequired).toBe(true);
      expect(classification.accessRequiresApproval).toBe(true);
      expect(classification.auditAllAccess).toBe(true);
    });
  });

  describe('Constants', () => {
    it('should have all classification levels', () => {
      expect(DataClassificationLevels.PUBLIC).toBe('public');
      expect(DataClassificationLevels.INTERNAL).toBe('internal');
      expect(DataClassificationLevels.CONFIDENTIAL).toBe('confidential');
      expect(DataClassificationLevels.RESTRICTED).toBe('restricted');
      expect(DataClassificationLevels.PII).toBe('pii');
      expect(DataClassificationLevels.PHI).toBe('phi');
      expect(DataClassificationLevels.PCI).toBe('pci');
    });

    it('should have all data categories', () => {
      expect(DataCategories.PERSONAL).toBe('personal');
      expect(DataCategories.FINANCIAL).toBe('financial');
      expect(DataCategories.HEALTH).toBe('health');
      expect(DataCategories.BEHAVIORAL).toBe('behavioral');
    });

    it('should have all PII types', () => {
      expect(PiiTypes.NAME).toBe('name');
      expect(PiiTypes.EMAIL).toBe('email');
      expect(PiiTypes.PHONE).toBe('phone');
      expect(PiiTypes.SSN).toBe('ssn');
      expect(PiiTypes.DOB).toBe('date_of_birth');
    });
  });
});
