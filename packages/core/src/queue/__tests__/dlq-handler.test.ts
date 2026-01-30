/**
 * DLQ Handler Tests
 *
 * B4: Pub/Sub Queue and DLQ Semantics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DLQHandler,
  createDLQHandler,
  getDefaultDLQHandler,
  RETRY_POLICY,
  DLQ_CONFIG,
  type ClassificationResult,
} from '../dlq-handler.js';

describe('DLQHandler', () => {
  let handler: DLQHandler;

  beforeEach(() => {
    handler = new DLQHandler();
  });

  describe('classifyError', () => {
    describe('max delivery attempts', () => {
      it('should classify as poison when max attempts exceeded', () => {
        const error = new Error('Some error');
        const result = handler.classifyError(error, 5);

        expect(result.classification).toBe('poison');
        expect(result.shouldRetry).toBe(false);
        expect(result.action).toBe('dlq');
        expect(result.reason).toContain('Max delivery attempts');
      });

      it('should classify as poison when attempts exceed configured max', () => {
        const customHandler = new DLQHandler({ maxDeliveryAttempts: 3 });
        const error = new Error('Some error');
        const result = customHandler.classifyError(error, 3);

        expect(result.classification).toBe('poison');
        expect(result.shouldRetry).toBe(false);
      });
    });

    describe('permanent errors', () => {
      const permanentErrors = [
        'Invalid schema in request',
        'Malformed JSON body',
        'Validation failed for field X',
        'Unauthorized access',
        'Forbidden resource',
        'Tenant not found',
        'Run not found in database',
        'Invalid envelope format',
        'Missing required field: tenantId',
      ];

      permanentErrors.forEach((errorMsg) => {
        it(`should classify "${errorMsg}" as permanent`, () => {
          const error = new Error(errorMsg);
          const result = handler.classifyError(error, 1);

          expect(result.classification).toBe('permanent');
          expect(result.shouldRetry).toBe(false);
          expect(result.action).toBe('dlq');
        });
      });
    });

    describe('transient errors', () => {
      const transientErrors = [
        'Request timeout',
        'Connection refused',
        'Network error occurred',
        'Rate limit exceeded',
        'Too many requests',
        'Service unavailable',
        'Internal server error',
        'ECONNRESET',
        'ENOTFOUND',
        'Socket hang up',
      ];

      transientErrors.forEach((errorMsg) => {
        it(`should classify "${errorMsg}" as transient`, () => {
          const error = new Error(errorMsg);
          const result = handler.classifyError(error, 1);

          expect(result.classification).toBe('transient');
          expect(result.shouldRetry).toBe(true);
          expect(result.action).toBe('retry');
        });
      });
    });

    describe('unknown errors', () => {
      it('should treat unknown errors as transient for first 2 attempts', () => {
        const error = new Error('Something unexpected happened');

        const result1 = handler.classifyError(error, 1);
        expect(result1.classification).toBe('transient');
        expect(result1.shouldRetry).toBe(true);

        const result2 = handler.classifyError(error, 2);
        expect(result2.classification).toBe('transient');
        expect(result2.shouldRetry).toBe(true);
      });

      it('should treat unknown errors as permanent after 3 attempts', () => {
        const error = new Error('Something unexpected happened');
        const result = handler.classifyError(error, 3);

        expect(result.classification).toBe('permanent');
        expect(result.shouldRetry).toBe(false);
        expect(result.action).toBe('dlq');
      });
    });

    describe('non-Error objects', () => {
      it('should handle string errors', () => {
        const result = handler.classifyError('timeout error', 1);
        expect(result.classification).toBe('transient');
        expect(result.shouldRetry).toBe(true);
      });

      it('should handle null/undefined', () => {
        const result = handler.classifyError(null, 1);
        expect(result.classification).toBe('transient');
        expect(result.shouldRetry).toBe(true);
      });
    });
  });

  describe('isPoisonMessage', () => {
    it('should detect empty message data', () => {
      const result = handler.isPoisonMessage('');
      expect(result.isPosion).toBe(true);
      expect(result.reason).toContain('Empty');
    });

    it('should detect whitespace-only data', () => {
      const result = handler.isPoisonMessage('   \n\t  ');
      expect(result.isPosion).toBe(true);
      expect(result.reason).toContain('Empty');
    });

    it('should detect non-JSON data', () => {
      const result = handler.isPoisonMessage('this is not json');
      expect(result.isPosion).toBe(true);
      expect(result.reason).toContain('Non-JSON');
    });

    it('should detect excessively large messages', () => {
      // Create a large valid JSON object
      const largeData = JSON.stringify({ data: 'x'.repeat(11 * 1024 * 1024) }); // >11MB
      const result = handler.isPoisonMessage(largeData);
      expect(result.isPosion).toBe(true);
      expect(result.reason).toContain('too large');
    });

    it('should accept valid JSON', () => {
      const validJson = JSON.stringify({ type: 'test', tenantId: 'tenant-1' });
      const result = handler.isPoisonMessage(validJson);
      expect(result.isPosion).toBe(false);
    });

    it('should accept incomplete but parseable JSON', () => {
      // JSON that starts with { but might be invalid
      const result = handler.isPoisonMessage('{incomplete');
      expect(result.isPosion).toBe(false); // Not obviously non-JSON
    });

    it('should respect detectPoisonMessages config', () => {
      const customHandler = new DLQHandler({ detectPoisonMessages: false });
      const result = customHandler.isPoisonMessage('');
      expect(result.isPosion).toBe(false);
    });
  });

  describe('recordPoisonMessage', () => {
    it('should record poison message with all metadata', () => {
      const classification: ClassificationResult = {
        classification: 'poison',
        shouldRetry: false,
        reason: 'Max attempts exceeded',
        action: 'dlq',
      };

      const poisonMsg = handler.recordPoisonMessage(
        'msg-123',
        '{"type":"test"}',
        new Error('Test error'),
        classification,
        5,
        'test-subscription',
        { jobId: 'job-1', tenantId: 'tenant-1', runId: 'run-1' }
      );

      expect(poisonMsg.messageId).toBe('msg-123');
      expect(poisonMsg.jobId).toBe('job-1');
      expect(poisonMsg.tenantId).toBe('tenant-1');
      expect(poisonMsg.runId).toBe('run-1');
      expect(poisonMsg.error).toBe('Test error');
      expect(poisonMsg.deliveryAttempt).toBe(5);
      expect(poisonMsg.subscription).toBe('test-subscription');
      expect(poisonMsg.classification).toBe(classification);
    });

    it('should truncate large raw data', () => {
      const largeData = 'x'.repeat(20000);
      const classification: ClassificationResult = {
        classification: 'poison',
        shouldRetry: false,
        reason: 'Too large',
        action: 'dlq',
      };

      const poisonMsg = handler.recordPoisonMessage(
        'msg-123',
        largeData,
        new Error('Test'),
        classification,
        1,
        'sub'
      );

      expect(poisonMsg.rawData.length).toBe(10000);
    });

    it('should update metrics', () => {
      const classification: ClassificationResult = {
        classification: 'poison',
        shouldRetry: false,
        reason: 'Max attempts',
        action: 'dlq',
      };

      handler.recordPoisonMessage('msg-1', '{}', new Error('Error'), classification, 1, 'sub');
      handler.recordPoisonMessage('msg-2', '{}', new Error('Error'), classification, 1, 'sub');

      const metrics = handler.getMetrics();
      expect(metrics.poisonCount).toBe(2);
      expect(metrics.dlqRoutedCount).toBe(2);
    });
  });

  describe('getPoisonMessages', () => {
    it('should return all recorded poison messages', () => {
      const classification: ClassificationResult = {
        classification: 'poison',
        shouldRetry: false,
        reason: 'Max attempts',
        action: 'dlq',
      };

      handler.recordPoisonMessage('msg-1', '{}', new Error('Error 1'), classification, 1, 'sub');
      handler.recordPoisonMessage('msg-2', '{}', new Error('Error 2'), classification, 2, 'sub');

      const messages = handler.getPoisonMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].messageId).toBe('msg-1');
      expect(messages[1].messageId).toBe('msg-2');
    });

    it('should return a copy of the array', () => {
      const classification: ClassificationResult = {
        classification: 'poison',
        shouldRetry: false,
        reason: 'Test',
        action: 'dlq',
      };

      handler.recordPoisonMessage('msg-1', '{}', new Error('Error'), classification, 1, 'sub');

      const messages1 = handler.getPoisonMessages();
      const messages2 = handler.getPoisonMessages();

      expect(messages1).not.toBe(messages2);
      expect(messages1).toEqual(messages2);
    });
  });

  describe('clearPoisonMessages', () => {
    it('should clear all recorded poison messages', () => {
      const classification: ClassificationResult = {
        classification: 'poison',
        shouldRetry: false,
        reason: 'Test',
        action: 'dlq',
      };

      handler.recordPoisonMessage('msg-1', '{}', new Error('Error'), classification, 1, 'sub');
      handler.recordPoisonMessage('msg-2', '{}', new Error('Error'), classification, 1, 'sub');

      expect(handler.getPoisonMessages()).toHaveLength(2);

      handler.clearPoisonMessages();

      expect(handler.getPoisonMessages()).toHaveLength(0);
    });
  });

  describe('getMetrics', () => {
    it('should track all error types', () => {
      // Trigger different classifications
      handler.classifyError(new Error('timeout'), 1); // transient
      handler.classifyError(new Error('invalid schema'), 1); // permanent
      handler.classifyError(new Error('any error'), 5); // poison (max attempts)

      const metrics = handler.getMetrics();
      expect(metrics.transientErrorCount).toBe(1);
      expect(metrics.permanentErrorCount).toBe(1);
      // Note: poison from max attempts doesn't increment permanent counter
    });

    it('should return a copy of metrics', () => {
      const metrics1 = handler.getMetrics();
      const metrics2 = handler.getMetrics();

      expect(metrics1).not.toBe(metrics2);
      expect(metrics1).toEqual(metrics2);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all counters to zero', () => {
      handler.classifyError(new Error('timeout'), 1);
      handler.classifyError(new Error('invalid schema'), 1);

      handler.resetMetrics();

      const metrics = handler.getMetrics();
      expect(metrics.transientErrorCount).toBe(0);
      expect(metrics.permanentErrorCount).toBe(0);
      expect(metrics.poisonCount).toBe(0);
      expect(metrics.dlqRoutedCount).toBe(0);
      expect(metrics.discardedCount).toBe(0);
    });
  });

  describe('custom configuration', () => {
    it('should respect custom permanent error patterns', () => {
      const customHandler = new DLQHandler({
        permanentErrorPatterns: [/custom_error/i],
      });

      const result = customHandler.classifyError(new Error('Custom_Error occurred'), 1);
      expect(result.classification).toBe('permanent');
      expect(result.shouldRetry).toBe(false);
    });

    it('should respect custom transient error patterns', () => {
      const customHandler = new DLQHandler({
        transientErrorPatterns: [/retry_me/i],
      });

      const result = customHandler.classifyError(new Error('Please retry_me later'), 1);
      expect(result.classification).toBe('transient');
      expect(result.shouldRetry).toBe(true);
    });

    it('should respect custom max delivery attempts', () => {
      const customHandler = new DLQHandler({
        maxDeliveryAttempts: 3,
      });

      const result2 = customHandler.classifyError(new Error('Unknown'), 2);
      expect(result2.shouldRetry).toBe(true);

      const result3 = customHandler.classifyError(new Error('Unknown'), 3);
      expect(result3.shouldRetry).toBe(false);
      expect(result3.classification).toBe('poison');
    });
  });
});

describe('Factory functions', () => {
  describe('getDefaultDLQHandler', () => {
    it('should return a singleton instance', () => {
      const handler1 = getDefaultDLQHandler();
      const handler2 = getDefaultDLQHandler();

      expect(handler1).toBe(handler2);
    });

    it('should return a DLQHandler instance', () => {
      const handler = getDefaultDLQHandler();
      expect(handler).toBeInstanceOf(DLQHandler);
    });
  });

  describe('createDLQHandler', () => {
    it('should create a new instance each time', () => {
      const handler1 = createDLQHandler();
      const handler2 = createDLQHandler();

      expect(handler1).not.toBe(handler2);
    });

    it('should accept custom configuration', () => {
      const handler = createDLQHandler({ maxDeliveryAttempts: 10 });

      // Should not trigger max attempts at 9
      const result = handler.classifyError(new Error('Unknown'), 9);
      expect(result.classification).not.toBe('poison');
    });
  });
});

describe('Configuration constants', () => {
  describe('RETRY_POLICY', () => {
    it('should have correct values', () => {
      expect(RETRY_POLICY.minimumBackoff).toBe(10);
      expect(RETRY_POLICY.maximumBackoff).toBe(600);
      expect(RETRY_POLICY.ackDeadline).toBe(60);
      expect(RETRY_POLICY.maxDeliveryAttempts).toBe(5);
      expect(RETRY_POLICY.messageRetention).toBe(604800);
    });
  });

  describe('DLQ_CONFIG', () => {
    it('should have correct values', () => {
      expect(DLQ_CONFIG.messageRetention).toBe(1209600);
      expect(DLQ_CONFIG.expirationTtl).toBe('');
    });
  });
});
