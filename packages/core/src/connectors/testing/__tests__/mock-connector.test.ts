/**
 * MockConnector Tests
 *
 * @module @gwi/core/connectors/testing/__tests__
 */

import { describe, test, expect } from 'vitest';
import { MockConnector } from '../mock-connector.js';
import { createTestContext } from '../helpers.js';

describe('MockConnector', () => {
  test('creates mock connector with default config', () => {
    const mock = new MockConnector();
    expect(mock.id).toBe('mock');
    expect(mock.version).toBe('1.0.0');
    expect(mock.displayName).toBe('Mock Connector');
  });

  test('creates mock connector with custom config', () => {
    const mock = new MockConnector({
      id: 'custom-mock',
      version: '2.0.0',
      displayName: 'Custom Mock',
    });
    expect(mock.id).toBe('custom-mock');
    expect(mock.version).toBe('2.0.0');
    expect(mock.displayName).toBe('Custom Mock');
  });

  test('returns success response by default', async () => {
    const mock = new MockConnector();
    const ctx = createTestContext();
    const tool = mock.getTool('testTool');

    const result = await tool.invoke(ctx, { test: 'input' });
    expect(result).toEqual({ success: true });
  });

  test('returns configured response', async () => {
    const mock = new MockConnector();
    mock.setToolResponse('getData', {
      data: { items: [1, 2, 3], count: 3 },
    });

    const ctx = createTestContext();
    const tool = mock.getTool('getData');
    const result = await tool.invoke(ctx, {});

    expect(result).toEqual({ items: [1, 2, 3], count: 3 });
  });

  test('throws configured error', async () => {
    const mock = new MockConnector();
    mock.setToolResponse('getData', {
      error: new Error('401 Unauthorized'),
    });

    const ctx = createTestContext();
    const tool = mock.getTool('getData');

    await expect(tool.invoke(ctx, {})).rejects.toThrow('401 Unauthorized');
  });

  test('tracks invocations', async () => {
    const mock = new MockConnector({ trackInvocations: true });
    const ctx = createTestContext();
    const tool = mock.getTool('getData');

    await tool.invoke(ctx, { id: 1 });
    await tool.invoke(ctx, { id: 2 });

    const invocations = mock.getInvocations('getData');
    expect(invocations).toHaveLength(2);
    expect(invocations[0].input).toEqual({ id: 1 });
    expect(invocations[1].input).toEqual({ id: 2 });
  });

  test('assertion: assertCalled', async () => {
    const mock = new MockConnector({ trackInvocations: true });
    const ctx = createTestContext();
    const tool = mock.getTool('getData');

    await tool.invoke(ctx, {});
    mock.assertCalled('getData');

    expect(() => mock.assertCalled('notCalled')).toThrow(
      'Expected notCalled to be called, but it was not'
    );
  });

  test('assertion: assertCalled with count', async () => {
    const mock = new MockConnector({ trackInvocations: true });
    const ctx = createTestContext();
    const tool = mock.getTool('getData');

    await tool.invoke(ctx, {});
    await tool.invoke(ctx, {});
    mock.assertCalled('getData', 2);

    expect(() => mock.assertCalled('getData', 3)).toThrow(
      'Expected getData to be called 3 times, but was called 2 times'
    );
  });

  test('assertion: assertCalledWith', async () => {
    const mock = new MockConnector({ trackInvocations: true });
    const ctx = createTestContext();
    const tool = mock.getTool('getData');

    await tool.invoke(ctx, { id: 123 });
    mock.assertCalledWith('getData', { id: 123 });

    expect(() => mock.assertCalledWith('getData', { id: 456 })).toThrow(
      'Expected getData to be called with'
    );
  });

  test('assertion: assertNotCalled', () => {
    const mock = new MockConnector({ trackInvocations: true });

    mock.assertNotCalled('getData');

    expect(() => mock.assertNotCalled('getData')).not.toThrow();
  });

  test('clears invocations', async () => {
    const mock = new MockConnector({ trackInvocations: true });
    const ctx = createTestContext();
    const tool = mock.getTool('getData');

    await tool.invoke(ctx, {});
    expect(mock.getInvocations('getData')).toHaveLength(1);

    mock.clearInvocations();
    expect(mock.getInvocations('getData')).toHaveLength(0);
  });

  test('gets last invocation', async () => {
    const mock = new MockConnector({ trackInvocations: true });
    const ctx = createTestContext();
    const tool = mock.getTool('getData');

    await tool.invoke(ctx, { id: 1 });
    await tool.invoke(ctx, { id: 2 });

    const last = mock.getLastInvocation('getData');
    expect(last?.input).toEqual({ id: 2 });
  });

  test('healthcheck returns healthy by default', async () => {
    const mock = new MockConnector();
    expect(await mock.healthcheck()).toBe(true);
  });

  test('healthcheck returns configured status', async () => {
    const mock = new MockConnector({ healthy: false });
    expect(await mock.healthcheck()).toBe(false);

    mock.setHealthy(true);
    expect(await mock.healthcheck()).toBe(true);
  });
});
