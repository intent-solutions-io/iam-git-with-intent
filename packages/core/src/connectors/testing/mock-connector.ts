/**
 * MockConnector - Configurable mock connector for unit testing
 *
 * Provides a flexible base for testing connector implementations:
 * - Configurable responses (success, errors, delays)
 * - Request spy/assertions
 * - Simulate rate limits, retries, timeouts
 * - Pagination testing
 *
 * @module @gwi/core/connectors/testing
 */

import { z } from 'zod';
import {
  type Connector,
  type ToolSpec,
  type ToolContext,
  type ToolPolicyClass,
} from '../types.js';

// =============================================================================
// Mock Configuration Types
// =============================================================================

/**
 * Mock response behavior configuration
 */
export interface MockResponseConfig {
  /** Response data to return */
  data?: unknown;

  /** Error to throw */
  error?: Error | string;

  /** Delay in milliseconds before responding */
  delayMs?: number;

  /** HTTP status code to simulate */
  statusCode?: number;

  /** Number of times to fail before succeeding (for retry testing) */
  failureCount?: number;
}

/**
 * Mock connector configuration
 */
export interface MockConnectorConfig {
  /** Connector ID */
  id?: string;

  /** Connector version */
  version?: string;

  /** Display name */
  displayName?: string;

  /** Default response behavior for all tools */
  defaultResponse?: MockResponseConfig;

  /** Tool-specific response overrides */
  toolResponses?: Record<string, MockResponseConfig>;

  /** Whether to track invocations */
  trackInvocations?: boolean;

  /** Rate limit (requests per second) */
  rateLimit?: number;

  /** Whether healthcheck should pass */
  healthy?: boolean;
}

// =============================================================================
// Invocation Tracking
// =============================================================================

/**
 * Recorded invocation of a mock tool
 */
export interface MockInvocation {
  /** Tool name */
  toolName: string;

  /** Input provided */
  input: unknown;

  /** Context provided */
  context: ToolContext;

  /** Timestamp of invocation */
  timestamp: Date;

  /** Response returned */
  response?: unknown;

  /** Error thrown */
  error?: Error;

  /** Duration in milliseconds */
  durationMs: number;
}

// =============================================================================
// MockConnector Implementation
// =============================================================================

/**
 * MockConnector - Configurable mock for testing
 *
 * @example
 * ```typescript
 * // Create mock with custom responses
 * const mock = new MockConnector({
 *   toolResponses: {
 *     'getData': { data: { items: [1, 2, 3] } },
 *     'createItem': { error: new Error('Rate limited'), statusCode: 429 }
 *   }
 * });
 *
 * // Use in tests
 * const tool = mock.getTool('getData');
 * const result = await tool.invoke(ctx, {});
 * expect(result).toEqual({ items: [1, 2, 3] });
 *
 * // Assert invocations
 * expect(mock.getInvocations('getData')).toHaveLength(1);
 * ```
 */
export class MockConnector implements Connector {
  readonly id: string;
  readonly version: string;
  readonly displayName: string;

  private config: MockConnectorConfig;
  private invocations: MockInvocation[] = [];
  private failureCounts: Map<string, number> = new Map();
  private lastRequestTime = 0;
  private requestCount = 0;

  constructor(config: MockConnectorConfig = {}) {
    this.id = config.id ?? 'mock';
    this.version = config.version ?? '1.0.0';
    this.displayName = config.displayName ?? 'Mock Connector';
    this.config = {
      trackInvocations: true,
      healthy: true,
      ...config,
    };
  }

  tools(): ToolSpec[] {
    // Return empty array - use addTool() to register tools
    return [];
  }

  getTool(name: string): ToolSpec | undefined {
    // Tools are dynamically created based on configuration
    return this.createMockTool(name);
  }

  async healthcheck(): Promise<boolean> {
    return this.config.healthy ?? true;
  }

  // ===========================================================================
  // Mock Tool Creation
  // ===========================================================================

  /**
   * Create a mock tool with configurable behavior
   */
  private createMockTool(name: string): ToolSpec {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const connector = this;

    return {
      name,
      description: `Mock tool: ${name}`,
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      policyClass: 'READ' as ToolPolicyClass,

      async invoke(ctx: ToolContext, input: unknown): Promise<unknown> {
        const startTime = Date.now();

        try {
          // Rate limiting
          await connector.checkRateLimit();

          // Get response config (tool-specific or default)
          const responseConfig =
            connector.config.toolResponses?.[name] ??
            connector.config.defaultResponse ??
            {};

          // Simulate delay
          if (responseConfig.delayMs) {
            await sleep(responseConfig.delayMs);
          }

          // Simulate retries (fail N times, then succeed)
          if (responseConfig.failureCount !== undefined) {
            const currentCount = connector.failureCounts.get(name) ?? 0;
            if (currentCount < responseConfig.failureCount) {
              connector.failureCounts.set(name, currentCount + 1);
              const error = new Error(
                `Simulated failure ${currentCount + 1}/${responseConfig.failureCount}`
              );
              connector.trackInvocation(name, ctx, input, undefined, error, Date.now() - startTime);
              throw error;
            } else {
              // Reset counter after all failures
              connector.failureCounts.delete(name);
            }
          }

          // Simulate error
          if (responseConfig.error) {
            const error =
              typeof responseConfig.error === 'string'
                ? new Error(responseConfig.error)
                : responseConfig.error;
            connector.trackInvocation(name, ctx, input, undefined, error, Date.now() - startTime);
            throw error;
          }

          // Return success response
          const response = responseConfig.data ?? { success: true };
          connector.trackInvocation(name, ctx, input, response, undefined, Date.now() - startTime);
          return response;
        } catch (error) {
          connector.trackInvocation(
            name,
            ctx,
            input,
            undefined,
            error as Error,
            Date.now() - startTime
          );
          throw error;
        }
      },
    };
  }

  // ===========================================================================
  // Rate Limiting Simulation
  // ===========================================================================

  private async checkRateLimit(): Promise<void> {
    if (!this.config.rateLimit) return;

    const now = Date.now();
    const timeWindow = 1000; // 1 second

    // Reset counter every second
    if (now - this.lastRequestTime > timeWindow) {
      this.requestCount = 0;
      this.lastRequestTime = now;
    }

    // Throttle if at limit
    if (this.requestCount >= this.config.rateLimit) {
      const waitMs = timeWindow - (now - this.lastRequestTime);
      await sleep(waitMs);
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
    }

    this.requestCount++;
  }

  // ===========================================================================
  // Invocation Tracking
  // ===========================================================================

  private trackInvocation(
    toolName: string,
    context: ToolContext,
    input: unknown,
    response?: unknown,
    error?: Error,
    durationMs?: number
  ): void {
    if (!this.config.trackInvocations) return;

    this.invocations.push({
      toolName,
      input,
      context,
      timestamp: new Date(),
      response,
      error,
      durationMs: durationMs ?? 0,
    });
  }

  /**
   * Get all recorded invocations
   */
  getInvocations(toolName?: string): MockInvocation[] {
    if (toolName) {
      return this.invocations.filter((inv) => inv.toolName === toolName);
    }
    return [...this.invocations];
  }

  /**
   * Get last invocation for a tool
   */
  getLastInvocation(toolName: string): MockInvocation | undefined {
    const invocations = this.getInvocations(toolName);
    return invocations[invocations.length - 1];
  }

  /**
   * Clear all recorded invocations
   */
  clearInvocations(): void {
    this.invocations = [];
    this.failureCounts.clear();
  }

  /**
   * Assert that a tool was called
   */
  assertCalled(toolName: string, times?: number): void {
    const invocations = this.getInvocations(toolName);
    if (times !== undefined) {
      if (invocations.length !== times) {
        throw new Error(
          `Expected ${toolName} to be called ${times} times, but was called ${invocations.length} times`
        );
      }
    } else if (invocations.length === 0) {
      throw new Error(`Expected ${toolName} to be called, but it was not`);
    }
  }

  /**
   * Assert that a tool was called with specific input
   */
  assertCalledWith(toolName: string, input: unknown): void {
    const invocations = this.getInvocations(toolName);
    const match = invocations.find(
      (inv) => JSON.stringify(inv.input) === JSON.stringify(input)
    );
    if (!match) {
      throw new Error(
        `Expected ${toolName} to be called with ${JSON.stringify(input)}, but it was not`
      );
    }
  }

  /**
   * Assert that a tool was not called
   */
  assertNotCalled(toolName: string): void {
    const invocations = this.getInvocations(toolName);
    if (invocations.length > 0) {
      throw new Error(
        `Expected ${toolName} not to be called, but it was called ${invocations.length} times`
      );
    }
  }

  // ===========================================================================
  // Configuration Updates
  // ===========================================================================

  /**
   * Update response configuration for a tool
   */
  setToolResponse(toolName: string, config: MockResponseConfig): void {
    if (!this.config.toolResponses) {
      this.config.toolResponses = {};
    }
    this.config.toolResponses[toolName] = config;
  }

  /**
   * Set connector health status
   */
  setHealthy(healthy: boolean): void {
    this.config.healthy = healthy;
  }

  /**
   * Reset failure counters (for retry testing)
   */
  resetFailures(): void {
    this.failureCounts.clear();
  }
}

// =============================================================================
// Utilities
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Types are already exported via the interface declarations above
// No need for re-export
