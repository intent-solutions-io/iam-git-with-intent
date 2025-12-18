/**
 * Connector SDK Tests
 *
 * Phase 3: Tests for connector SDK types, invoke pipeline, and conformance.
 *
 * @module @gwi/core/connectors/__tests__/connector-sdk.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import {
  type Connector,
  type ToolSpec,
  type ToolContext,
  type ToolPolicyClass,
  defineToolSpec,
  invokeTool,
  DefaultConnectorRegistry,
  runConformanceTests,
  assertConformance,
} from '../index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock connector for testing
 */
function createMockConnector(overrides?: Partial<Connector>): Connector {
  const readTool = defineToolSpec({
    name: 'read',
    description: 'A read-only operation',
    inputSchema: z.object({ id: z.string() }),
    outputSchema: z.object({ data: z.string() }),
    policyClass: 'READ' as ToolPolicyClass,
    invoke: async (_ctx, input) => ({ data: `read-${input.id}` }),
  });

  const writeTool = defineToolSpec({
    name: 'write',
    description: 'A non-destructive write operation',
    inputSchema: z.object({ value: z.string() }),
    outputSchema: z.object({ success: z.boolean() }),
    policyClass: 'WRITE_NON_DESTRUCTIVE' as ToolPolicyClass,
    invoke: async () => ({ success: true }),
  });

  const destructiveTool = defineToolSpec({
    name: 'delete',
    description: 'A destructive operation requiring approval',
    inputSchema: z.object({ target: z.string() }),
    outputSchema: z.object({ deleted: z.boolean() }),
    policyClass: 'DESTRUCTIVE' as ToolPolicyClass,
    invoke: async () => ({ deleted: true }),
  });

  const tools = [readTool, writeTool, destructiveTool];

  return {
    id: 'mock',
    version: '1.0.0',
    displayName: 'Mock Connector',
    tools: () => tools,
    getTool: (name) => tools.find(t => t.name === name),
    ...overrides,
  };
}

/**
 * Create a valid approval record for testing
 */
function createApproval(runId: string, scope: Array<'commit' | 'push' | 'open_pr' | 'merge'> = ['push']) {
  return {
    runId,
    approvedAt: new Date().toISOString(),
    approvedBy: 'test-user',
    scope,
    patchHash: 'abc123',
  };
}

// =============================================================================
// Type Definition Tests
// =============================================================================

describe('Connector SDK Types', () => {
  describe('defineToolSpec', () => {
    it('should create a valid ToolSpec', () => {
      const tool = defineToolSpec({
        name: 'test',
        description: 'A test tool',
        inputSchema: z.object({ foo: z.string() }),
        outputSchema: z.object({ bar: z.number() }),
        policyClass: 'READ' as ToolPolicyClass,
        invoke: async () => ({ bar: 42 }),
      });

      expect(tool.name).toBe('test');
      expect(tool.description).toBe('A test tool');
      expect(tool.policyClass).toBe('READ');
    });

    it('should validate input schema', () => {
      const tool = defineToolSpec({
        name: 'test',
        description: 'A test tool',
        inputSchema: z.object({ required: z.string() }),
        outputSchema: z.object({}),
        policyClass: 'READ' as ToolPolicyClass,
        invoke: async () => ({}),
      });

      const validResult = tool.inputSchema.safeParse({ required: 'value' });
      expect(validResult.success).toBe(true);

      const invalidResult = tool.inputSchema.safeParse({});
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('Connector interface', () => {
    it('should return all tools', () => {
      const connector = createMockConnector();
      const tools = connector.tools();

      expect(tools).toHaveLength(3);
      expect(tools.map(t => t.name)).toEqual(['read', 'write', 'delete']);
    });

    it('should get tool by name', () => {
      const connector = createMockConnector();

      expect(connector.getTool('read')).toBeDefined();
      expect(connector.getTool('write')).toBeDefined();
      expect(connector.getTool('delete')).toBeDefined();
      expect(connector.getTool('nonexistent')).toBeUndefined();
    });
  });
});

// =============================================================================
// Connector Registry Tests
// =============================================================================

describe('DefaultConnectorRegistry', () => {
  let registry: DefaultConnectorRegistry;

  beforeEach(() => {
    registry = new DefaultConnectorRegistry();
  });

  it('should register a connector', () => {
    const connector = createMockConnector();
    registry.register(connector);

    expect(registry.has('mock')).toBe(true);
    expect(registry.get('mock')).toBe(connector);
  });

  it('should throw on duplicate registration', () => {
    const connector = createMockConnector();
    registry.register(connector);

    expect(() => registry.register(connector)).toThrow('already registered');
  });

  it('should list all connectors', () => {
    const connector1 = createMockConnector({ id: 'conn1' });
    const connector2 = createMockConnector({ id: 'conn2' });

    registry.register(connector1);
    registry.register(connector2);

    const connectors = registry.list();
    expect(connectors).toHaveLength(2);
    expect(connectors.map(c => c.id)).toContain('conn1');
    expect(connectors.map(c => c.id)).toContain('conn2');
  });

  it('should return undefined for unknown connector', () => {
    expect(registry.get('unknown')).toBeUndefined();
    expect(registry.has('unknown')).toBe(false);
  });
});

// =============================================================================
// Invoke Pipeline Tests
// =============================================================================

describe('invokeTool', () => {
  let registry: DefaultConnectorRegistry;
  let connector: Connector;

  beforeEach(() => {
    registry = new DefaultConnectorRegistry();
    connector = createMockConnector();
    registry.register(connector);
  });

  it('should invoke READ tool successfully', async () => {
    const result = await invokeTool(registry, {
      runId: '00000000-0000-0000-0000-000000000001',
      tenantId: 'test-tenant',
      toolName: 'mock.read',
      input: { id: 'test123' },
    });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ data: 'read-test123' });
  });

  it('should invoke WRITE_NON_DESTRUCTIVE tool successfully', async () => {
    const result = await invokeTool(registry, {
      runId: '00000000-0000-0000-0000-000000000002',
      tenantId: 'test-tenant',
      toolName: 'mock.write',
      input: { value: 'test' },
    });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ success: true });
  });

  it('should block DESTRUCTIVE tool without approval', async () => {
    const result = await invokeTool(registry, {
      runId: '00000000-0000-0000-0000-000000000003',
      tenantId: 'test-tenant',
      toolName: 'mock.delete',
      input: { target: 'something' },
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('POLICY_DENIED');
    expect(result.error).toContain('requires approval');
  });

  it('should allow DESTRUCTIVE tool with valid approval', async () => {
    const runId = '00000000-0000-0000-0000-000000000004';
    const result = await invokeTool(registry, {
      runId,
      tenantId: 'test-tenant',
      toolName: 'mock.delete',
      input: { target: 'something' },
      approval: createApproval(runId, ['push']),
    });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ deleted: true });
  });

  it('should reject approval for different run', async () => {
    const result = await invokeTool(registry, {
      runId: '00000000-0000-0000-0000-000000000005',
      tenantId: 'test-tenant',
      toolName: 'mock.delete',
      input: { target: 'something' },
      approval: createApproval('00000000-0000-0000-0000-000000000099', ['push']),
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('POLICY_DENIED');
    expect(result.error).toContain('different run');
  });

  it('should return error for unknown connector', async () => {
    const result = await invokeTool(registry, {
      runId: '00000000-0000-0000-0000-000000000006',
      tenantId: 'test-tenant',
      toolName: 'unknown.tool',
      input: {},
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('CONNECTOR_NOT_FOUND');
  });

  it('should return error for unknown tool', async () => {
    const result = await invokeTool(registry, {
      runId: '00000000-0000-0000-0000-000000000007',
      tenantId: 'test-tenant',
      toolName: 'mock.unknown',
      input: {},
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('TOOL_NOT_FOUND');
  });

  it('should validate input schema', async () => {
    const result = await invokeTool(registry, {
      runId: '00000000-0000-0000-0000-000000000008',
      tenantId: 'test-tenant',
      toolName: 'mock.read',
      input: { wrongField: 'value' },
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('should include duration in result', async () => {
    const result = await invokeTool(registry, {
      runId: '00000000-0000-0000-0000-000000000009',
      tenantId: 'test-tenant',
      toolName: 'mock.read',
      input: { id: 'test' },
    });

    expect(result.durationMs).toBeDefined();
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle tool execution errors', async () => {
    const errorConnector = createMockConnector({
      id: 'error',
      tools: () => [
        defineToolSpec({
          name: 'fail',
          description: 'A tool that throws',
          inputSchema: z.object({}),
          outputSchema: z.object({}),
          policyClass: 'READ' as ToolPolicyClass,
          invoke: async () => {
            throw new Error('Tool execution failed');
          },
        }),
      ],
      getTool: () => defineToolSpec({
        name: 'fail',
        description: 'A tool that throws',
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        policyClass: 'READ' as ToolPolicyClass,
        invoke: async () => {
          throw new Error('Tool execution failed');
        },
      }),
    });

    registry.register(errorConnector);

    const result = await invokeTool(registry, {
      runId: '00000000-0000-0000-0000-000000000010',
      tenantId: 'test-tenant',
      toolName: 'error.fail',
      input: {},
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('EXECUTION_ERROR');
    expect(result.error).toContain('Tool execution failed');
  });
});

// =============================================================================
// Conformance Test Tests
// =============================================================================

describe('Conformance Tests', () => {
  it('should pass for valid connector', async () => {
    const connector = createMockConnector();
    const report = await runConformanceTests(connector);

    expect(report.passed).toBe(true);
    expect(report.failedTests).toBe(0);
    expect(report.connectorId).toBe('mock');
  });

  it('should fail for connector without displayName', async () => {
    const connector = createMockConnector({
      displayName: '',
    });

    const report = await runConformanceTests(connector);
    const metadataTest = report.results.find(r => r.name === 'connector_metadata');

    expect(metadataTest?.passed).toBe(false);
    expect(metadataTest?.error).toContain('displayName');
  });

  it('should fail for connector with invalid version', async () => {
    const connector = createMockConnector({
      version: 'invalid',
    });

    const report = await runConformanceTests(connector);
    const metadataTest = report.results.find(r => r.name === 'connector_metadata');

    expect(metadataTest?.passed).toBe(false);
    expect(metadataTest?.error).toContain('version');
  });

  it('should detect duplicate tool names', async () => {
    const duplicateTool = defineToolSpec({
      name: 'read',
      description: 'Duplicate',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      policyClass: 'READ' as ToolPolicyClass,
      invoke: async () => ({}),
    });

    const connector = createMockConnector({
      tools: () => [
        createMockConnector().tools()[0],
        duplicateTool,
      ],
    });

    const report = await runConformanceTests(connector);
    const namesTest = report.results.find(r => r.name === 'tool_names_stable');

    expect(namesTest?.passed).toBe(false);
    expect(namesTest?.error).toContain('Duplicates');
  });

  it('should detect invalid tool names', async () => {
    const badTool = defineToolSpec({
      name: '123-invalid',
      description: 'Bad name',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      policyClass: 'READ' as ToolPolicyClass,
      invoke: async () => ({}),
    });

    const connector = createMockConnector({
      tools: () => [badTool],
      getTool: () => badTool,
    });

    const report = await runConformanceTests(connector);
    const namesTest = report.results.find(r => r.name === 'tool_names_stable');

    expect(namesTest?.passed).toBe(false);
    expect(namesTest?.error).toContain('Invalid names');
  });

  it('should verify getTool consistency', async () => {
    const tools = createMockConnector().tools();
    const connector = createMockConnector({
      getTool: () => undefined, // Always return undefined (broken)
    });

    const report = await runConformanceTests(connector);
    const getToolTest = report.results.find(r => r.name === 'get_tool_consistency');

    expect(getToolTest?.passed).toBe(false);
  });

  it('assertConformance should throw for invalid connector', async () => {
    const connector = createMockConnector({
      displayName: '',
    });

    await expect(assertConformance(connector)).rejects.toThrow('failed conformance tests');
  });

  it('assertConformance should not throw for valid connector', async () => {
    const connector = createMockConnector();

    await expect(assertConformance(connector)).resolves.not.toThrow();
  });
});
