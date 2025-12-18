/**
 * Phase 52: Connector Contract v1 + Normalization Pipeline Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CONNECTOR_CONTRACT_VERSION,
  ConnectorErrorCodes,
  NormalizationEngine,
  PredConnRegistry,
  inferSchemaFromSample,
  createMappingRule,
  createPredConnConfig,
  createNormalizationContext,
  validatePredConnConfig,
  validateMappingRule,
  MappingRule,
  PredConnConfig,
  NormalizationContext,
  DataSourceConnector,
  ConnectorHealth,
} from '../index.js';

// =============================================================================
// GOLDEN FIXTURES
// =============================================================================

const GOLDEN_RAW_RECORDS = [
  {
    timestamp: '2024-01-01T00:00:00Z',
    metric_value: 100,
    host: 'server-01',
    region: 'us-east-1',
    status: 'healthy',
  },
  {
    timestamp: '2024-01-01T00:01:00Z',
    metric_value: 105,
    host: 'server-01',
    region: 'us-east-1',
    status: 'healthy',
  },
  {
    timestamp: '2024-01-01T00:02:00Z',
    metric_value: 98,
    host: 'server-01',
    region: 'us-east-1',
    status: 'degraded',
  },
];

const GOLDEN_MAPPING_RULE: MappingRule = {
  id: 'test-rule-001',
  name: 'Test Mapping Rule',
  version: '1.0.0',
  sourceType: 'prometheus',
  seriesDefaults: {
    valueType: 'numeric',
    nativeResolution: 'minute',
  },
  timestampMapping: {
    sourcePath: 'timestamp',
    format: 'ISO8601',
    timezone: 'UTC',
  },
  valueMapping: {
    sourcePath: 'metric_value',
    targetField: 'value',
    transform: 'none',
    required: true,
  },
  labelMappings: [
    {
      sourcePath: 'host',
      targetField: 'host',
      transform: 'none',
      required: false,
    },
    {
      sourcePath: 'region',
      targetField: 'region',
      transform: 'none',
      required: false,
    },
  ],
  tagMappings: [
    {
      sourcePath: 'status',
      targetField: 'status',
      transform: 'none',
      required: false,
    },
  ],
};

const GOLDEN_CONNECTOR_CONFIG: PredConnConfig = {
  id: 'test-connector-001',
  name: 'Test Connector',
  version: '1.0.0',
  sourceType: 'prometheus',
  baseUrl: 'https://prometheus.example.com',
  auth: {
    type: 'bearer',
    credentials: {
      bearerToken: 'test-token',
    },
  },
  rateLimit: {
    maxRequests: 100,
    windowMs: 60000,
    strategy: 'backoff',
    backoff: {
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      multiplier: 2,
      jitter: true,
    },
  },
  pagination: {
    type: 'cursor',
    pageSize: 1000,
    cursorParam: 'cursor',
    cursorPath: 'metadata.cursor',
    hasMorePath: 'metadata.hasMore',
  },
  timeoutMs: 30000,
  headers: {
    'X-Custom-Header': 'test-value',
  },
  verifySsl: true,
};

// =============================================================================
// SCHEMA VERSION TESTS
// =============================================================================

describe('Schema Version', () => {
  it('should have a valid semver version', () => {
    expect(CONNECTOR_CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should be version 1.0.0', () => {
    expect(CONNECTOR_CONTRACT_VERSION).toBe('1.0.0');
  });
});

// =============================================================================
// ERROR CODES TESTS
// =============================================================================

describe('Error Codes', () => {
  it('should have stable auth error codes', () => {
    expect(ConnectorErrorCodes.AUTH_FAILED).toBe('CONN_1001');
    expect(ConnectorErrorCodes.AUTH_EXPIRED).toBe('CONN_1002');
  });

  it('should have stable connection error codes', () => {
    expect(ConnectorErrorCodes.CONNECTION_FAILED).toBe('CONN_2001');
    expect(ConnectorErrorCodes.CONNECTION_TIMEOUT).toBe('CONN_2002');
  });

  it('should have stable rate limit error codes', () => {
    expect(ConnectorErrorCodes.RATE_LIMITED).toBe('CONN_3001');
    expect(ConnectorErrorCodes.QUOTA_EXCEEDED).toBe('CONN_3002');
  });

  it('should have stable normalization error codes', () => {
    expect(ConnectorErrorCodes.NORMALIZATION_FAILED).toBe('CONN_5001');
    expect(ConnectorErrorCodes.MAPPING_NOT_FOUND).toBe('CONN_5002');
  });
});

// =============================================================================
// NORMALIZATION ENGINE TESTS
// =============================================================================

describe('NormalizationEngine', () => {
  let engine: NormalizationEngine;
  let context: NormalizationContext;

  beforeEach(() => {
    engine = new NormalizationEngine([GOLDEN_MAPPING_RULE]);
    context = createNormalizationContext({
      connectorId: 'test-connector',
      tenantId: 'tenant-123',
    });
  });

  describe('Rule Management', () => {
    it('should register and retrieve rules', () => {
      const rule = engine.getRule('test-rule-001');
      expect(rule).toBeDefined();
      expect(rule?.name).toBe('Test Mapping Rule');
    });

    it('should list all rules', () => {
      const rules = engine.listRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('test-rule-001');
    });

    it('should register new rules', () => {
      const newRule = createMappingRule({
        id: 'new-rule',
        name: 'New Rule',
        sourceType: 'custom',
        timestampMapping: {
          sourcePath: 'ts',
          format: 'unix_ms',
          timezone: 'UTC',
        },
        valueMapping: {
          sourcePath: 'val',
          targetField: 'value',
          transform: 'none',
          required: true,
        },
      });
      engine.registerRule(newRule);
      expect(engine.getRule('new-rule')).toBeDefined();
    });
  });

  describe('Basic Normalization', () => {
    it('should normalize valid records', () => {
      const result = engine.normalize(GOLDEN_RAW_RECORDS, 'test-rule-001', context);

      expect(result.success).toBe(true);
      expect(result.points).toHaveLength(3);
      expect(result.stats.inputRecords).toBe(3);
      expect(result.stats.outputPoints).toBe(3);
      expect(result.stats.skippedRecords).toBe(0);
      expect(result.stats.errorCount).toBe(0);
    });

    it('should produce deterministic output', () => {
      const result1 = engine.normalize(GOLDEN_RAW_RECORDS, 'test-rule-001', context);
      const result2 = engine.normalize(GOLDEN_RAW_RECORDS, 'test-rule-001', context);

      // Input hash content part should be the same (ignore counter suffix)
      const getHashContent = (hash: string) => hash.split('_').slice(0, 2).join('_');
      expect(getHashContent(result1.inputHash)).toBe(getHashContent(result2.inputHash));
      expect(result1.points).toEqual(result2.points);
    });

    it('should extract timestamps correctly', () => {
      const result = engine.normalize(GOLDEN_RAW_RECORDS, 'test-rule-001', context);

      expect(result.points[0].timestamp).toBe(
        new Date('2024-01-01T00:00:00Z').getTime()
      );
      expect(result.points[1].timestamp).toBe(
        new Date('2024-01-01T00:01:00Z').getTime()
      );
    });

    it('should extract values correctly', () => {
      const result = engine.normalize(GOLDEN_RAW_RECORDS, 'test-rule-001', context);

      expect(result.points[0].value).toBe(100);
      expect(result.points[1].value).toBe(105);
      expect(result.points[2].value).toBe(98);
    });

    it('should extract tags correctly', () => {
      const result = engine.normalize(GOLDEN_RAW_RECORDS, 'test-rule-001', context);

      expect(result.points[0].tags?.status).toBe('healthy');
      expect(result.points[2].tags?.status).toBe('degraded');
    });

    it('should add processing metadata', () => {
      const result = engine.normalize(GOLDEN_RAW_RECORDS, 'test-rule-001', context);

      expect(result.points[0].processingMetadata?.sourceConnectorId).toBe(
        'test-connector'
      );
      expect(result.points[0].processingMetadata?.batchId).toBeDefined();
    });

    it('should sort points by timestamp', () => {
      const unsortedRecords = [
        { timestamp: '2024-01-01T00:02:00Z', metric_value: 3 },
        { timestamp: '2024-01-01T00:00:00Z', metric_value: 1 },
        { timestamp: '2024-01-01T00:01:00Z', metric_value: 2 },
      ];

      const result = engine.normalize(unsortedRecords, 'test-rule-001', context);

      expect(result.points[0].value).toBe(1);
      expect(result.points[1].value).toBe(2);
      expect(result.points[2].value).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should return error for unknown rule', () => {
      const result = engine.normalize(GOLDEN_RAW_RECORDS, 'unknown-rule', context);

      expect(result.success).toBe(false);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].code).toBe(ConnectorErrorCodes.MAPPING_NOT_FOUND);
    });

    it('should handle missing required field', () => {
      const records = [{ timestamp: '2024-01-01T00:00:00Z' }]; // missing metric_value

      const result = engine.normalize(records, 'test-rule-001', context);

      expect(result.success).toBe(false);
      expect(result.stats.skippedRecords).toBe(1);
      expect(result.diagnostics[0].code).toBe(
        ConnectorErrorCodes.MISSING_REQUIRED_FIELD
      );
    });

    it('should handle invalid timestamp', () => {
      const records = [
        { timestamp: 'not-a-date', metric_value: 100 },
      ];

      const result = engine.normalize(records, 'test-rule-001', context);

      expect(result.success).toBe(false);
      expect(result.diagnostics[0].code).toBe(
        ConnectorErrorCodes.TIMESTAMP_PARSE_FAILED
      );
    });

    it('should handle non-object records', () => {
      const records = ['not-an-object', null, 123];

      const result = engine.normalize(records, 'test-rule-001', context);

      expect(result.success).toBe(false);
      expect(result.stats.skippedRecords).toBe(3);
      expect(result.diagnostics[0].code).toBe(ConnectorErrorCodes.INVALID_RESPONSE);
    });

    it('should provide field-level diagnostics', () => {
      const records = [{ timestamp: '2024-01-01T00:00:00Z' }];

      const result = engine.normalize(records, 'test-rule-001', context);

      expect(result.diagnostics[0].fieldPath).toContain('metric_value');
      expect(result.diagnostics[0].hint).toBeDefined();
      expect(result.diagnostics[0].severity).toBe('error');
    });
  });

  describe('Timestamp Formats', () => {
    it('should handle unix_seconds format', () => {
      const rule = createMappingRule({
        id: 'unix-seconds-rule',
        name: 'Unix Seconds Rule',
        sourceType: 'custom',
        timestampMapping: {
          sourcePath: 'ts',
          format: 'unix_seconds',
          timezone: 'UTC',
        },
        valueMapping: {
          sourcePath: 'val',
          targetField: 'value',
          transform: 'none',
          required: true,
        },
      });

      engine.registerRule(rule);

      const records = [{ ts: 1704067200, val: 100 }]; // 2024-01-01T00:00:00Z
      const result = engine.normalize(records, 'unix-seconds-rule', context);

      expect(result.success).toBe(true);
      expect(result.points[0].timestamp).toBe(1704067200000);
    });

    it('should handle unix_ms format', () => {
      const rule = createMappingRule({
        id: 'unix-ms-rule',
        name: 'Unix MS Rule',
        sourceType: 'custom',
        timestampMapping: {
          sourcePath: 'ts',
          format: 'unix_ms',
          timezone: 'UTC',
        },
        valueMapping: {
          sourcePath: 'val',
          targetField: 'value',
          transform: 'none',
          required: true,
        },
      });

      engine.registerRule(rule);

      const records = [{ ts: 1704067200000, val: 100 }];
      const result = engine.normalize(records, 'unix-ms-rule', context);

      expect(result.success).toBe(true);
      expect(result.points[0].timestamp).toBe(1704067200000);
    });
  });

  describe('Value Transforms', () => {
    it('should apply multiply transform', () => {
      const rule = createMappingRule({
        id: 'multiply-rule',
        name: 'Multiply Rule',
        sourceType: 'custom',
        timestampMapping: {
          sourcePath: 'ts',
          format: 'ISO8601',
          timezone: 'UTC',
        },
        valueMapping: {
          sourcePath: 'val',
          targetField: 'value',
          transform: 'multiply',
          transformParams: { multiplier: 1000 },
          required: true,
        },
      });

      engine.registerRule(rule);

      const records = [{ ts: '2024-01-01T00:00:00Z', val: 5.5 }];
      const result = engine.normalize(records, 'multiply-rule', context);

      expect(result.success).toBe(true);
      expect(result.points[0].value).toBe(5500);
    });

    it('should apply divide transform', () => {
      const rule = createMappingRule({
        id: 'divide-rule',
        name: 'Divide Rule',
        sourceType: 'custom',
        timestampMapping: {
          sourcePath: 'ts',
          format: 'ISO8601',
          timezone: 'UTC',
        },
        valueMapping: {
          sourcePath: 'val',
          targetField: 'value',
          transform: 'divide',
          transformParams: { divisor: 100 },
          required: true,
        },
      });

      engine.registerRule(rule);

      const records = [{ ts: '2024-01-01T00:00:00Z', val: 500 }];
      const result = engine.normalize(records, 'divide-rule', context);

      expect(result.success).toBe(true);
      expect(result.points[0].value).toBe(5);
    });

    it('should apply parse_number transform', () => {
      const rule = createMappingRule({
        id: 'parse-number-rule',
        name: 'Parse Number Rule',
        sourceType: 'custom',
        timestampMapping: {
          sourcePath: 'ts',
          format: 'ISO8601',
          timezone: 'UTC',
        },
        valueMapping: {
          sourcePath: 'val',
          targetField: 'value',
          transform: 'parse_number',
          required: true,
        },
      });

      engine.registerRule(rule);

      const records = [{ ts: '2024-01-01T00:00:00Z', val: '42.5' }];
      const result = engine.normalize(records, 'parse-number-rule', context);

      expect(result.success).toBe(true);
      expect(result.points[0].value).toBe(42.5);
    });

    it('should apply lowercase transform', () => {
      const rule = createMappingRule({
        id: 'lowercase-rule',
        name: 'Lowercase Rule',
        sourceType: 'custom',
        timestampMapping: {
          sourcePath: 'ts',
          format: 'ISO8601',
          timezone: 'UTC',
        },
        valueMapping: {
          sourcePath: 'val',
          targetField: 'value',
          transform: 'lowercase',
          required: true,
        },
        tagMappings: [],
      });

      engine.registerRule(rule);

      const records = [{ ts: '2024-01-01T00:00:00Z', val: 'HELLO' }];
      const result = engine.normalize(records, 'lowercase-rule', context);

      expect(result.success).toBe(true);
      expect(result.points[0].value).toBe('hello');
    });

    it('should apply default transform for missing optional values', () => {
      const rule = createMappingRule({
        id: 'default-rule',
        name: 'Default Rule',
        sourceType: 'custom',
        timestampMapping: {
          sourcePath: 'ts',
          format: 'ISO8601',
          timezone: 'UTC',
        },
        valueMapping: {
          sourcePath: 'missing_field',
          targetField: 'value',
          transform: 'default',
          transformParams: { defaultValue: 0 },
          required: false,
        },
      });

      engine.registerRule(rule);

      const records = [{ ts: '2024-01-01T00:00:00Z' }];
      const result = engine.normalize(records, 'default-rule', context);

      expect(result.success).toBe(true);
      expect(result.points[0].value).toBe(0);
    });

    it('should apply lookup transform', () => {
      const rule = createMappingRule({
        id: 'lookup-rule',
        name: 'Lookup Rule',
        sourceType: 'custom',
        timestampMapping: {
          sourcePath: 'ts',
          format: 'ISO8601',
          timezone: 'UTC',
        },
        valueMapping: {
          sourcePath: 'status',
          targetField: 'value',
          transform: 'lookup',
          transformParams: {
            lookupTable: {
              healthy: 100,
              degraded: 50,
              unhealthy: 0,
            },
          },
          required: true,
        },
      });

      engine.registerRule(rule);

      const records = [{ ts: '2024-01-01T00:00:00Z', status: 'healthy' }];
      const result = engine.normalize(records, 'lookup-rule', context);

      expect(result.success).toBe(true);
      expect(result.points[0].value).toBe(100);
    });
  });

  describe('Filters', () => {
    it('should filter records with eq operator', () => {
      const rule = createMappingRule({
        ...GOLDEN_MAPPING_RULE,
        id: 'filter-eq-rule',
        filters: [{ field: 'status', operator: 'eq', value: 'healthy' }],
      });

      engine.registerRule(rule);

      const result = engine.normalize(GOLDEN_RAW_RECORDS, 'filter-eq-rule', context);

      expect(result.points).toHaveLength(2); // Only healthy records
      expect(result.points.every((p) => p.tags?.status === 'healthy')).toBe(true);
    });

    it('should filter records with gt operator', () => {
      const rule = createMappingRule({
        ...GOLDEN_MAPPING_RULE,
        id: 'filter-gt-rule',
        filters: [{ field: 'metric_value', operator: 'gt', value: 100 }],
      });

      engine.registerRule(rule);

      const result = engine.normalize(GOLDEN_RAW_RECORDS, 'filter-gt-rule', context);

      expect(result.points).toHaveLength(1);
      expect(result.points[0].value).toBe(105);
    });

    it('should filter records with in operator', () => {
      const rule = createMappingRule({
        ...GOLDEN_MAPPING_RULE,
        id: 'filter-in-rule',
        filters: [{ field: 'status', operator: 'in', value: ['healthy'] }],
      });

      engine.registerRule(rule);

      const result = engine.normalize(GOLDEN_RAW_RECORDS, 'filter-in-rule', context);

      expect(result.points).toHaveLength(2);
    });

    it('should filter records with contains operator', () => {
      const rule = createMappingRule({
        ...GOLDEN_MAPPING_RULE,
        id: 'filter-contains-rule',
        filters: [{ field: 'host', operator: 'contains', value: 'server' }],
      });

      engine.registerRule(rule);

      const result = engine.normalize(GOLDEN_RAW_RECORDS, 'filter-contains-rule', context);

      expect(result.points).toHaveLength(3);
    });
  });

  describe('Validation', () => {
    it('should validate value range', () => {
      const rule = createMappingRule({
        ...GOLDEN_MAPPING_RULE,
        id: 'validation-rule',
        valueMapping: {
          ...GOLDEN_MAPPING_RULE.valueMapping,
          validation: { type: 'number', min: 0, max: 100 },
        },
      });

      engine.registerRule(rule);

      const records = [
        { timestamp: '2024-01-01T00:00:00Z', metric_value: 50 },
        { timestamp: '2024-01-01T00:01:00Z', metric_value: 150 }, // Out of range
      ];

      const result = engine.normalize(records, 'validation-rule', context);

      expect(result.points).toHaveLength(1);
      expect(result.diagnostics.some(
        (d) => d.code === ConnectorErrorCodes.VALUE_OUT_OF_RANGE
      )).toBe(true);
    });

    it('should validate enum values', () => {
      const rule = createMappingRule({
        ...GOLDEN_MAPPING_RULE,
        id: 'enum-rule',
        valueMapping: {
          sourcePath: 'status',
          targetField: 'value',
          transform: 'none',
          required: true,
          validation: { enum: ['healthy', 'degraded'] },
        },
      });

      engine.registerRule(rule);

      const records = [
        { timestamp: '2024-01-01T00:00:00Z', status: 'healthy' },
        { timestamp: '2024-01-01T00:01:00Z', status: 'unknown' }, // Not in enum
      ];

      const result = engine.normalize(records, 'enum-rule', context);

      expect(result.points).toHaveLength(1);
      expect(result.diagnostics.some(
        (d) => d.code === ConnectorErrorCodes.SCHEMA_MISMATCH
      )).toBe(true);
    });
  });

  describe('Nested Fields', () => {
    it('should extract nested values using dot notation', () => {
      const rule = createMappingRule({
        id: 'nested-rule',
        name: 'Nested Rule',
        sourceType: 'custom',
        timestampMapping: {
          sourcePath: 'meta.timestamp',
          format: 'ISO8601',
          timezone: 'UTC',
        },
        valueMapping: {
          sourcePath: 'data.metrics.value',
          targetField: 'value',
          transform: 'none',
          required: true,
        },
      });

      engine.registerRule(rule);

      const records = [
        {
          meta: { timestamp: '2024-01-01T00:00:00Z' },
          data: { metrics: { value: 42 } },
        },
      ];

      const result = engine.normalize(records, 'nested-rule', context);

      expect(result.success).toBe(true);
      expect(result.points[0].value).toBe(42);
    });
  });
});

// =============================================================================
// CONNECTOR REGISTRY TESTS
// =============================================================================

describe('PredConnRegistry', () => {
  let registry: PredConnRegistry;

  beforeEach(() => {
    registry = new PredConnRegistry();
  });

  it('should start empty', () => {
    expect(registry.list()).toHaveLength(0);
  });

  it('should register and retrieve connectors', () => {
    const mockConnector: DataSourceConnector = {
      config: GOLDEN_CONNECTOR_CONFIG,
      initialize: async () => {},
      testConnection: async () => ({
        success: true,
        message: 'Connected',
        latencyMs: 50,
      }),
      fetchData: async () => ({
        records: [],
        pagination: {
          type: 'cursor',
          currentPage: 1,
          hasMore: false,
          itemsRetrieved: 0,
        },
        metadata: { responseTimeMs: 100, bytesReceived: 0 },
        requestId: 'test',
      }),
      discoverStreams: async () => [],
      inferSchema: async () => ({ fields: [] }),
      getHealth: () => ({
        status: 'healthy',
        rateLimitStatus: { remaining: 100, isThrottled: false },
      }),
      close: async () => {},
    };

    registry.register(mockConnector);

    expect(registry.list()).toHaveLength(1);
    expect(registry.get('test-connector-001')).toBeDefined();
  });

  it('should get health summary', () => {
    const mockConnector: DataSourceConnector = {
      config: GOLDEN_CONNECTOR_CONFIG,
      initialize: async () => {},
      testConnection: async () => ({
        success: true,
        message: 'Connected',
        latencyMs: 50,
      }),
      fetchData: async () => ({
        records: [],
        pagination: {
          type: 'cursor',
          currentPage: 1,
          hasMore: false,
          itemsRetrieved: 0,
        },
        metadata: { responseTimeMs: 100, bytesReceived: 0 },
        requestId: 'test',
      }),
      discoverStreams: async () => [],
      inferSchema: async () => ({ fields: [] }),
      getHealth: () => ({
        status: 'healthy',
        rateLimitStatus: { remaining: 100, isThrottled: false },
      }),
      close: async () => {},
    };

    registry.register(mockConnector);

    const health = registry.getHealthSummary();
    expect(health['test-connector-001'].status).toBe('healthy');
  });
});

// =============================================================================
// SCHEMA INFERENCE TESTS
// =============================================================================

describe('Schema Inference', () => {
  it('should infer schema from sample data', () => {
    const schema = inferSchemaFromSample(GOLDEN_RAW_RECORDS);

    expect(schema.fields.length).toBeGreaterThan(0);
    expect(schema.fields.some((f) => f.name === 'timestamp')).toBe(true);
    expect(schema.fields.some((f) => f.name === 'metric_value')).toBe(true);
  });

  it('should suggest timestamp field', () => {
    const schema = inferSchemaFromSample(GOLDEN_RAW_RECORDS);

    expect(schema.suggestedTimestampField).toBe('timestamp');
  });

  it('should suggest value field', () => {
    const schema = inferSchemaFromSample(GOLDEN_RAW_RECORDS);

    expect(schema.suggestedValueField).toBe('metric_value');
  });

  it('should detect nullable fields', () => {
    const records = [
      { timestamp: '2024-01-01T00:00:00Z', value: 100, optional: null },
      { timestamp: '2024-01-01T00:01:00Z', value: 200, optional: 'present' },
    ];

    const schema = inferSchemaFromSample(records);

    const optionalField = schema.fields.find((f) => f.name === 'optional');
    expect(optionalField?.nullable).toBe(true);
  });

  it('should collect sample values', () => {
    const schema = inferSchemaFromSample(GOLDEN_RAW_RECORDS);

    const hostField = schema.fields.find((f) => f.name === 'host');
    expect(hostField?.sampleValues).toContain('server-01');
  });

  it('should handle empty input', () => {
    const schema = inferSchemaFromSample([]);

    expect(schema.fields).toHaveLength(0);
  });

  it('should infer nested fields', () => {
    const records = [
      { timestamp: '2024-01-01T00:00:00Z', data: { value: 100 } },
    ];

    const schema = inferSchemaFromSample(records);

    expect(schema.fields.some((f) => f.name === 'data.value')).toBe(true);
  });
});

// =============================================================================
// VALIDATION TESTS
// =============================================================================

describe('Config Validation', () => {
  describe('Connector Config', () => {
    it('should validate valid connector config', () => {
      const result = validatePredConnConfig(GOLDEN_CONNECTOR_CONFIG);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(GOLDEN_CONNECTOR_CONFIG);
    });

    it('should reject invalid connector config', () => {
      const invalid = { ...GOLDEN_CONNECTOR_CONFIG, baseUrl: 'not-a-url' };
      const result = validatePredConnConfig(invalid);
      expect(result.success).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should reject missing required fields', () => {
      const invalid = { id: 'test' };
      const result = validatePredConnConfig(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Mapping Rule', () => {
    it('should validate valid mapping rule', () => {
      const result = validateMappingRule(GOLDEN_MAPPING_RULE);
      expect(result.success).toBe(true);
    });

    it('should reject invalid mapping rule', () => {
      const invalid = { id: 'test' };
      const result = validateMappingRule(invalid);
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// FACTORY FUNCTION TESTS
// =============================================================================

describe('Factory Functions', () => {
  describe('createMappingRule', () => {
    it('should create rule with defaults', () => {
      const rule = createMappingRule({
        id: 'test-rule',
        name: 'Test',
        sourceType: 'custom',
        timestampMapping: {
          sourcePath: 'ts',
          format: 'ISO8601',
          timezone: 'UTC',
        },
        valueMapping: {
          sourcePath: 'val',
          targetField: 'value',
          transform: 'none',
          required: true,
        },
      });

      expect(rule.version).toBe('1.0.0');
      expect(rule.labelMappings).toEqual([]);
    });
  });

  describe('createPredConnConfig', () => {
    it('should create config with defaults', () => {
      const config = createPredConnConfig({
        id: 'test',
        name: 'Test',
        sourceType: 'custom',
        baseUrl: 'https://example.com',
      });

      expect(config.version).toBe('1.0.0');
      expect(config.auth.type).toBe('none');
      expect(config.rateLimit.maxRequests).toBe(100);
      expect(config.pagination.type).toBe('none');
      expect(config.timeoutMs).toBe(30000);
      expect(config.verifySsl).toBe(true);
    });
  });

  describe('createNormalizationContext', () => {
    it('should create context with defaults', () => {
      const context = createNormalizationContext({
        connectorId: 'conn-1',
        tenantId: 'tenant-1',
      });

      expect(context.batchId).toMatch(/^batch_/);
      expect(context.correlationId).toMatch(/^corr_/);
      expect(context.ingestedAt).toBeDefined();
    });
  });
});

// =============================================================================
// GOLDEN FIXTURE INVARIANT TESTS
// =============================================================================

describe('Golden Fixture Invariants', () => {
  it('should maintain golden records fixture structure', () => {
    expect(GOLDEN_RAW_RECORDS).toHaveLength(3);
    expect(GOLDEN_RAW_RECORDS[0]).toHaveProperty('timestamp');
    expect(GOLDEN_RAW_RECORDS[0]).toHaveProperty('metric_value');
  });

  it('should maintain golden mapping rule structure', () => {
    expect(GOLDEN_MAPPING_RULE.id).toBe('test-rule-001');
    expect(GOLDEN_MAPPING_RULE.timestampMapping.sourcePath).toBe('timestamp');
    expect(GOLDEN_MAPPING_RULE.valueMapping.sourcePath).toBe('metric_value');
  });

  it('should maintain golden connector config structure', () => {
    expect(GOLDEN_CONNECTOR_CONFIG.id).toBe('test-connector-001');
    expect(GOLDEN_CONNECTOR_CONFIG.auth.type).toBe('bearer');
    expect(GOLDEN_CONNECTOR_CONFIG.pagination.type).toBe('cursor');
  });

  it('should produce consistent normalization output', () => {
    const engine = new NormalizationEngine([GOLDEN_MAPPING_RULE]);
    const context = createNormalizationContext({
      connectorId: 'test',
      tenantId: 'tenant-123',
    });

    const result = engine.normalize(GOLDEN_RAW_RECORDS, 'test-rule-001', context);

    expect(result.success).toBe(true);
    expect(result.points).toHaveLength(3);
    expect(result.points[0].value).toBe(100);
    expect(result.points[1].value).toBe(105);
    expect(result.points[2].value).toBe(98);
  });
});
