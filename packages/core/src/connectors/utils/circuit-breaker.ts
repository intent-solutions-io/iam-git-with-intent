/**
 * Circuit Breaker Pattern Implementation
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 * in distributed systems. The circuit breaker has three states:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests fail immediately
 * - HALF_OPEN: Testing if system has recovered
 *
 * Based on production patterns from:
 * - 014-DR-DSGN-connector-abstraction.md (Layer 3: HTTP Transport)
 * - 011-DR-PATT-production-connector-patterns.md (Circuit breaker patterns)
 *
 * @module @gwi/core/connectors/utils
 */

import { z } from 'zod';

// =============================================================================
// Types and Schemas
// =============================================================================

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  /** Circuit is closed, requests pass through */
  CLOSED = 'CLOSED',

  /** Circuit is open, requests fail immediately */
  OPEN = 'OPEN',

  /** Circuit is testing if system has recovered */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration
 */
export const CircuitBreakerConfigSchema = z.object({
  /** Failure threshold percentage (0-100, default: 50%) */
  failureThresholdPercentage: z.number().min(0).max(100).default(50),

  /** Minimum number of requests before calculating threshold (default: 10) */
  minimumRequests: z.number().int().min(1).default(10),

  /** Reset timeout in milliseconds (default: 60000ms = 60s) */
  resetTimeoutMs: z.number().int().min(0).default(60000),

  /** Number of successful requests in HALF_OPEN to close circuit (default: 3) */
  successThreshold: z.number().int().min(1).default(3),

  /** Window size for calculating failure rate in milliseconds (default: 60000ms = 1 minute) */
  windowMs: z.number().int().min(1).default(60000),
});

export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;

/**
 * Circuit breaker error
 */
export class CircuitBreakerOpenError extends Error {
  constructor(
    message: string,
    public readonly nextAttemptAt: Date,
  ) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
  /** Current state */
  state: CircuitBreakerState;

  /** Total requests */
  totalRequests: number;

  /** Total successful requests */
  totalSuccesses: number;

  /** Total failed requests */
  totalFailures: number;

  /** Current failure rate (0-100) */
  failureRate: number;

  /** Number of times circuit opened */
  circuitOpenCount: number;

  /** Number of times circuit closed from HALF_OPEN */
  circuitClosedCount: number;

  /** Last state change timestamp */
  lastStateChange: string;

  /** Next attempt time (if OPEN) */
  nextAttemptAt?: string;
}

/**
 * Request record for sliding window
 */
interface RequestRecord {
  timestamp: number;
  success: boolean;
}

/**
 * Circuit breaker state data
 */
interface CircuitData {
  state: CircuitBreakerState;
  requests: RequestRecord[];
  consecutiveSuccesses: number;
  lastStateChange: number;
  openedAt?: number;
  metrics: CircuitBreakerMetrics;
}

// =============================================================================
// Circuit Breaker Interface
// =============================================================================

/**
 * Interface for circuit breakers
 */
export interface ICircuitBreaker {
  /**
   * Execute a function with circuit breaker protection
   *
   * @param key - Circuit key (e.g., connector name)
   * @param fn - Function to execute
   * @returns Promise resolving to function result
   * @throws CircuitBreakerOpenError if circuit is open
   */
  execute<T>(key: string, fn: () => Promise<T>): Promise<T>;

  /**
   * Get current state of circuit
   *
   * @param key - Circuit key
   */
  getState(key: string): CircuitBreakerState;

  /**
   * Get metrics for a circuit
   *
   * @param key - Circuit key
   */
  getMetrics(key: string): CircuitBreakerMetrics | null;

  /**
   * Manually open a circuit
   *
   * @param key - Circuit key
   */
  open(key: string): void;

  /**
   * Manually close a circuit
   *
   * @param key - Circuit key
   */
  close(key: string): void;

  /**
   * Reset a circuit (clear all state)
   *
   * @param key - Circuit key
   */
  reset(key: string): void;

  /**
   * Health check for a circuit
   *
   * @param key - Circuit key
   * @param healthCheckFn - Function to perform health check
   */
  healthCheck(key: string, healthCheckFn: () => Promise<boolean>): Promise<boolean>;
}

// =============================================================================
// Circuit Breaker Implementation
// =============================================================================

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker implements ICircuitBreaker {
  private readonly circuits: Map<string, CircuitData> = new Map();
  private readonly config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = CircuitBreakerConfigSchema.parse(config ?? {});
  }

  /**
   * Get or create circuit data for a key
   */
  private getCircuit(key: string): CircuitData {
    let circuit = this.circuits.get(key);

    if (!circuit) {
      circuit = {
        state: CircuitBreakerState.CLOSED,
        requests: [],
        consecutiveSuccesses: 0,
        lastStateChange: Date.now(),
        metrics: {
          state: CircuitBreakerState.CLOSED,
          totalRequests: 0,
          totalSuccesses: 0,
          totalFailures: 0,
          failureRate: 0,
          circuitOpenCount: 0,
          circuitClosedCount: 0,
          lastStateChange: new Date().toISOString(),
        },
      };
      this.circuits.set(key, circuit);
    }

    return circuit;
  }

  /**
   * Clean up old requests outside the window
   */
  private cleanWindow(circuit: CircuitData): void {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;

    // Remove requests older than window
    const firstValidIndex = circuit.requests.findIndex((req) => req.timestamp > cutoff);

    if (firstValidIndex > 0) {
      circuit.requests.splice(0, firstValidIndex);
    } else if (firstValidIndex === -1 && circuit.requests.length > 0) {
      // All requests are old
      circuit.requests.length = 0;
    }
  }

  /**
   * Calculate failure rate from recent requests
   */
  private calculateFailureRate(circuit: CircuitData): number {
    this.cleanWindow(circuit);

    const totalRequests = circuit.requests.length;
    if (totalRequests === 0) {
      return 0;
    }

    const failures = circuit.requests.filter((req) => !req.success).length;
    return (failures / totalRequests) * 100;
  }

  /**
   * Transition circuit to a new state
   */
  private transitionTo(circuit: CircuitData, newState: CircuitBreakerState): void {
    const oldState = circuit.state;
    if (oldState === newState) {
      return; // No change
    }

    circuit.state = newState;
    circuit.lastStateChange = Date.now();
    circuit.metrics.state = newState;
    circuit.metrics.lastStateChange = new Date().toISOString();

    // State-specific actions
    switch (newState) {
      case CircuitBreakerState.OPEN:
        circuit.openedAt = Date.now();
        circuit.consecutiveSuccesses = 0;
        circuit.metrics.circuitOpenCount++;
        circuit.metrics.nextAttemptAt = new Date(
          Date.now() + this.config.resetTimeoutMs,
        ).toISOString();
        break;

      case CircuitBreakerState.HALF_OPEN:
        circuit.consecutiveSuccesses = 0;
        delete circuit.metrics.nextAttemptAt;
        break;

      case CircuitBreakerState.CLOSED:
        circuit.consecutiveSuccesses = 0;
        delete circuit.openedAt;
        delete circuit.metrics.nextAttemptAt;
        if (oldState === CircuitBreakerState.HALF_OPEN) {
          circuit.metrics.circuitClosedCount++;
        }
        break;
    }
  }

  /**
   * Check if circuit should transition from OPEN to HALF_OPEN
   */
  private checkResetTimeout(circuit: CircuitData): void {
    if (circuit.state !== CircuitBreakerState.OPEN) {
      return;
    }

    if (!circuit.openedAt) {
      return;
    }

    const elapsedMs = Date.now() - circuit.openedAt;
    if (elapsedMs >= this.config.resetTimeoutMs) {
      this.transitionTo(circuit, CircuitBreakerState.HALF_OPEN);
    }
  }

  /**
   * Record a request and update circuit state
   */
  private recordRequest(circuit: CircuitData, success: boolean): void {
    const now = Date.now();

    // Add request to window
    circuit.requests.push({ timestamp: now, success });

    // Update metrics
    circuit.metrics.totalRequests++;
    if (success) {
      circuit.metrics.totalSuccesses++;
    } else {
      circuit.metrics.totalFailures++;
    }

    // Clean window and calculate failure rate
    const failureRate = this.calculateFailureRate(circuit);
    circuit.metrics.failureRate = failureRate;

    // State-specific logic
    switch (circuit.state) {
      case CircuitBreakerState.CLOSED:
        // Check if we should open the circuit
        if (
          circuit.requests.length >= this.config.minimumRequests &&
          failureRate >= this.config.failureThresholdPercentage
        ) {
          this.transitionTo(circuit, CircuitBreakerState.OPEN);
        }
        break;

      case CircuitBreakerState.HALF_OPEN:
        if (success) {
          circuit.consecutiveSuccesses++;
          // Close circuit if we hit success threshold
          if (circuit.consecutiveSuccesses >= this.config.successThreshold) {
            this.transitionTo(circuit, CircuitBreakerState.CLOSED);
          }
        } else {
          // Any failure in HALF_OPEN reopens the circuit
          this.transitionTo(circuit, CircuitBreakerState.OPEN);
        }
        break;

      case CircuitBreakerState.OPEN:
        // Record the request but circuit remains open
        break;
    }
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const circuit = this.getCircuit(key);

    // Check if we should transition from OPEN to HALF_OPEN
    this.checkResetTimeout(circuit);

    // If circuit is OPEN, fail immediately
    if (circuit.state === CircuitBreakerState.OPEN) {
      const nextAttemptAt = new Date(circuit.openedAt! + this.config.resetTimeoutMs);
      throw new CircuitBreakerOpenError(
        `Circuit breaker is OPEN for ${key}. Next attempt at ${nextAttemptAt.toISOString()}`,
        nextAttemptAt,
      );
    }

    // Execute the function
    try {
      const result = await fn();
      this.recordRequest(circuit, true);
      return result;
    } catch (error) {
      this.recordRequest(circuit, false);
      throw error;
    }
  }

  /**
   * Get current state of circuit
   */
  getState(key: string): CircuitBreakerState {
    const circuit = this.circuits.get(key);
    if (!circuit) {
      return CircuitBreakerState.CLOSED; // Default state
    }

    // Check if we should transition from OPEN to HALF_OPEN
    this.checkResetTimeout(circuit);

    return circuit.state;
  }

  /**
   * Get metrics for a circuit
   */
  getMetrics(key: string): CircuitBreakerMetrics | null {
    const circuit = this.circuits.get(key);
    if (!circuit) {
      return null;
    }

    // Update failure rate before returning metrics
    circuit.metrics.failureRate = this.calculateFailureRate(circuit);

    return { ...circuit.metrics };
  }

  /**
   * Manually open a circuit
   */
  open(key: string): void {
    const circuit = this.getCircuit(key);
    this.transitionTo(circuit, CircuitBreakerState.OPEN);
  }

  /**
   * Manually close a circuit
   */
  close(key: string): void {
    const circuit = this.getCircuit(key);
    this.transitionTo(circuit, CircuitBreakerState.CLOSED);
  }

  /**
   * Reset a circuit (clear all state)
   */
  reset(key: string): void {
    this.circuits.delete(key);
  }

  /**
   * Health check for a circuit
   *
   * Performs a health check and automatically closes the circuit if healthy.
   */
  async healthCheck(key: string, healthCheckFn: () => Promise<boolean>): Promise<boolean> {
    const circuit = this.getCircuit(key);

    try {
      const isHealthy = await healthCheckFn();

      if (isHealthy && circuit.state === CircuitBreakerState.OPEN) {
        // If health check passes and circuit is open, transition to HALF_OPEN
        this.transitionTo(circuit, CircuitBreakerState.HALF_OPEN);
      }

      return isHealthy;
    } catch {
      // Health check failed
      return false;
    }
  }
}

/**
 * Create a circuit breaker with default options
 */
export function createCircuitBreaker(config?: Partial<CircuitBreakerConfig>): ICircuitBreaker {
  return new CircuitBreaker(config);
}
