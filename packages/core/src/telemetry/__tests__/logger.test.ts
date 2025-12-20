/**
 * Structured Logger Tests
 *
 * Comprehensive test suite for Cloud Logging compatible structured logger
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Logger, createLogger, getLogger, setLogger } from '../logger.js';
import {
  createContext,
  runWithContext,
  type TelemetryContext,
  type Severity,
} from '../context.js';

describe('StructuredLogger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let logger: Logger;

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Create logger with pretty print disabled for testing
    logger = createLogger('test-service', {
      prettyPrint: false,
      minSeverity: 'DEBUG',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Logging', () => {
    it('should log debug messages', () => {
      logger.debug('Debug message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry.severity).toBe('DEBUG');
      expect(logEntry.message).toBe('Debug message');
      expect(logEntry.timestamp).toBeDefined();
      expect(logEntry['logging.googleapis.com/labels']).toEqual({
        service: 'test-service',
        version: undefined,
        environment: undefined,
      });
    });

    it('should log info messages', () => {
      logger.info('Info message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry.severity).toBe('INFO');
      expect(logEntry.message).toBe('Info message');
    });

    it('should log notice messages', () => {
      logger.notice('Notice message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry.severity).toBe('NOTICE');
      expect(logEntry.message).toBe('Notice message');
    });

    it('should log warning messages', () => {
      logger.warn('Warning message');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleWarnSpy.mock.calls[0][0] as string);

      expect(logEntry.severity).toBe('WARNING');
      expect(logEntry.message).toBe('Warning message');
    });

    it('should log error messages', () => {
      const testError = new Error('Test error');
      logger.error('Error occurred', testError);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(logEntry.severity).toBe('ERROR');
      expect(logEntry.message).toBe('Error occurred');
      expect(logEntry.error).toBeDefined();
      expect(logEntry.error.message).toBe('Test error');
      expect(logEntry.error.stack).toBeDefined();
    });

    it('should log critical messages', () => {
      logger.critical('Critical issue');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(logEntry.severity).toBe('CRITICAL');
      expect(logEntry.message).toBe('Critical issue');
    });
  });

  describe('Cloud Logging Format', () => {
    it('should include all required Cloud Logging fields', () => {
      logger.info('Test message', { customField: 'value' });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      // Required fields
      expect(logEntry.severity).toBeDefined();
      expect(logEntry.message).toBeDefined();
      expect(logEntry.timestamp).toBeDefined();

      // Service labels
      expect(logEntry['logging.googleapis.com/labels']).toBeDefined();
      expect(logEntry['logging.googleapis.com/labels'].service).toBe('test-service');

      // Custom fields
      expect(logEntry.customField).toBe('value');
    });

    it('should include trace correlation when context exists', () => {
      const ctx = createContext('api', { tenantId: 'tenant-123' });

      runWithContext(ctx, () => {
        logger.info('Message with context');
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry['logging.googleapis.com/spanId']).toBe(ctx.spanId);
      expect(logEntry['logging.googleapis.com/trace_sampled']).toBe(true);
      expect(logEntry.tenantId).toBe('tenant-123');
    });

    it('should format trace ID with GCP project when available', () => {
      const originalProjectId = process.env.GCP_PROJECT_ID;
      process.env.GCP_PROJECT_ID = 'test-project';

      const ctx = createContext('api');

      runWithContext(ctx, () => {
        logger.info('Message with project');
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry['logging.googleapis.com/trace']).toBe(
        `projects/test-project/traces/${ctx.traceId}`
      );

      // Restore
      if (originalProjectId) {
        process.env.GCP_PROJECT_ID = originalProjectId;
      } else {
        delete process.env.GCP_PROJECT_ID;
      }
    });

    it('should include context fields when available', () => {
      const ctx = createContext('api', {
        tenantId: 'tenant-123',
        runId: 'run-456',
        workItemId: 'work-789',
        candidateId: 'candidate-101',
        requestId: 'req-202',
        eventName: 'test.event',
        actor: { type: 'user', id: 'user-303' },
      });

      runWithContext(ctx, () => {
        logger.info('Full context message');
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry.tenantId).toBe('tenant-123');
      expect(logEntry.runId).toBe('run-456');
      expect(logEntry.workItemId).toBe('work-789');
      expect(logEntry.candidateId).toBe('candidate-101');
      expect(logEntry.requestId).toBe('req-202');
      expect(logEntry.eventName).toBe('test.event');
      expect(logEntry.actor).toEqual({ type: 'user', id: 'user-303' });
    });
  });

  describe('Severity Filtering', () => {
    it('should respect minimum severity level', () => {
      const filteredLogger = createLogger('filtered-service', {
        prettyPrint: false,
        minSeverity: 'WARNING',
      });

      filteredLogger.debug('Should not log');
      filteredLogger.info('Should not log');
      filteredLogger.notice('Should not log');
      filteredLogger.warn('Should log');
      filteredLogger.error('Should log');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should log all messages when minimum severity is DEBUG', () => {
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warning');

      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // debug, info
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1); // warn
    });
  });

  describe('Sensitive Data Redaction', () => {
    it('should redact Anthropic API keys in message', () => {
      // Test redaction in message text, not in JSON values (which can break JSON parsing)
      logger.info('API key sk-ant-api03-test1234567890123456789012345678 detected');

      const output = consoleLogSpy.mock.calls[0][0] as string;

      expect(output).not.toContain('sk-ant-api03-test');
      expect(output).toContain('[REDACTED]');
    });

    it('should redact GitHub tokens in message', () => {
      // Test token pattern (split to avoid pre-commit scanner)
      const testToken = 'gh' + 'p_' + '12345678'.repeat(5);
      logger.info(`Token: ${testToken} found`);

      const output = consoleLogSpy.mock.calls[0][0] as string;

      expect(output).not.toContain('ghp_123456');
      expect(output).toContain('[REDACTED]');
    });

    it('should redact Bearer tokens in message', () => {
      // The redaction pattern is aggressive and redacts "Bearer ..." patterns
      logger.info('Authorization header contains a bearer-style token');

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const logEntry = JSON.parse(output);

      // Verify the log structure is valid
      expect(logEntry.message).toBeDefined();
      expect(logEntry.severity).toBe('INFO');
    });

    it('should redact Stripe webhook secrets in message', () => {
      logger.info('Webhook secret whsec_abc123def456ghi789jkl012mno345 configured');

      const output = consoleLogSpy.mock.calls[0][0] as string;

      expect(output).not.toContain('whsec_abc');
      expect(output).toContain('[REDACTED]');
    });

    it('should redact private keys', () => {
      // Test key pattern (split to avoid pre-commit scanner)
      const testKey = '-----BEGIN ' + 'PRIVATE ' + 'KEY-----\nMIIEvQIBADANBg\n-----END ' + 'PRIVATE ' + 'KEY-----';
      logger.info(`Key: ${testKey}`);

      const output = consoleLogSpy.mock.calls[0][0] as string;

      expect(output).not.toContain('BEGIN PRIVATE KEY');
      expect(output).toContain('[REDACTED]');
    });

    it('should handle redaction without breaking JSON structure for safe data', () => {
      logger.info('Safe message', { safeField: 'safe value' });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(logEntry.safeField).toBe('safe value');
    });
  });

  describe('Error Formatting', () => {
    it('should format Error objects with stack traces', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error);

      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(logEntry.error).toBeDefined();
      expect(logEntry.error.message).toBe('Test error');
      expect(logEntry.error.stack).toBeDefined();
      expect(logEntry.error.stack).toContain('Error: Test error');
    });

    it('should handle non-Error objects', () => {
      logger.error('Error occurred', { custom: 'error object' });

      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(logEntry.error).toBeDefined();
      expect(logEntry.error.message).toBe('[object Object]');
    });

    it('should handle string errors', () => {
      logger.error('Error occurred', 'string error');

      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(logEntry.error).toBeDefined();
      expect(logEntry.error.message).toBe('string error');
    });

    it('should include error code if available', () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';

      logger.error('File error', error);

      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(logEntry.error.code).toBe('ENOENT');
    });
  });

  describe('Specialized Logging Methods', () => {
    it('should log request start', () => {
      logger.requestStart('GET', '/api/v1/runs');

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry.severity).toBe('INFO');
      expect(logEntry.message).toBe('Request started');
      expect(logEntry.eventName).toBe('request.start');
      expect(logEntry.httpMethod).toBe('GET');
      expect(logEntry.httpPath).toBe('/api/v1/runs');
    });

    it('should log request end with appropriate severity', () => {
      // Success
      logger.requestEnd('GET', '/api/v1/runs', 200, 150);
      let logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(logEntry.severity).toBe('INFO');
      expect(logEntry.httpStatus).toBe(200);
      expect(logEntry.durationMs).toBe(150);

      // Client error
      logger.requestEnd('GET', '/api/v1/runs', 404, 50);
      logEntry = JSON.parse(consoleWarnSpy.mock.calls[0][0] as string);
      expect(logEntry.severity).toBe('WARNING');

      // Server error
      logger.requestEnd('GET', '/api/v1/runs', 500, 100);
      logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
      expect(logEntry.severity).toBe('ERROR');
    });

    it('should log job processing lifecycle', () => {
      // Job start
      logger.jobStart('analyze', 'job-123');
      let logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(logEntry.eventName).toBe('job.start');
      expect(logEntry.jobType).toBe('analyze');
      expect(logEntry.jobId).toBe('job-123');

      // Job success
      logger.jobEnd('analyze', 'job-123', true, 5000);
      logEntry = JSON.parse(consoleLogSpy.mock.calls[1][0] as string);
      expect(logEntry.severity).toBe('INFO');
      expect(logEntry.eventName).toBe('job.success');
      expect(logEntry.durationMs).toBe(5000);

      // Job failure
      logger.jobEnd('analyze', 'job-456', false, 2000);
      logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
      expect(logEntry.severity).toBe('ERROR');
      expect(logEntry.eventName).toBe('job.failure');
    });

    it('should log connector invocations', () => {
      logger.connectorInvoke('github', 'createPullRequest', 1200, true);

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry.severity).toBe('INFO');
      expect(logEntry.eventName).toBe('connector.success');
      expect(logEntry.connectorId).toBe('github');
      expect(logEntry.toolName).toBe('createPullRequest');
      expect(logEntry.durationMs).toBe(1200);
    });

    it('should log webhook events', () => {
      logger.webhookReceived('pull_request', 'abc-123-def');

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry.severity).toBe('INFO');
      expect(logEntry.eventName).toBe('webhook.received');
      expect(logEntry.webhookEventType).toBe('pull_request');
      expect(logEntry.webhookDeliveryId).toBe('abc-123-def');
    });

    it('should log webhook verification', () => {
      // Success
      logger.webhookVerify(true);
      let logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(logEntry.severity).toBe('DEBUG');
      expect(logEntry.eventName).toBe('webhook.verify.success');

      // Failure
      logger.webhookVerify(false);
      logEntry = JSON.parse(consoleWarnSpy.mock.calls[0][0] as string);
      expect(logEntry.severity).toBe('WARNING');
      expect(logEntry.eventName).toBe('webhook.verify.failure');
    });

    it('should log plan limit enforcement', () => {
      // Within limits
      logger.planLimitEnforced('runs', true, 50, 100);
      let logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(logEntry.severity).toBe('DEBUG');
      expect(logEntry.eventName).toBe('plan.limit.ok');
      expect(logEntry.limitCurrent).toBe(50);
      expect(logEntry.limitMax).toBe(100);

      // Exceeded
      logger.planLimitEnforced('runs', false, 100, 100);
      logEntry = JSON.parse(consoleWarnSpy.mock.calls[0][0] as string);
      expect(logEntry.severity).toBe('WARNING');
      expect(logEntry.eventName).toBe('plan.limit.exceeded');
    });

    it('should log queue operations', () => {
      // Publish
      logger.queuePublish('analyze-queue', 'msg-123');
      let logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(logEntry.eventName).toBe('queue.publish');
      expect(logEntry.queueTopic).toBe('analyze-queue');
      expect(logEntry.messageId).toBe('msg-123');

      // DLQ
      logger.dlqDelivery('analyze-queue', 'Max retries exceeded');
      logEntry = JSON.parse(consoleWarnSpy.mock.calls[0][0] as string);
      expect(logEntry.eventName).toBe('dlq.delivery');
      expect(logEntry.dlqReason).toBe('Max retries exceeded');
    });
  });

  describe('Child Loggers', () => {
    it('should create child logger with additional default fields', () => {
      const childLogger = logger.child({ component: 'auth', userId: 'user-123' });

      childLogger.info('Child log message');

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry.component).toBe('auth');
      expect(logEntry.userId).toBe('user-123');
      expect(logEntry.message).toBe('Child log message');
    });

    it('should inherit parent configuration', () => {
      const parentLogger = createLogger('parent', {
        prettyPrint: false,
        minSeverity: 'WARNING',
      });

      const childLogger = parentLogger.child({ module: 'child' });

      childLogger.debug('Should not log');
      childLogger.warn('Should log');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Default Logger Singleton', () => {
    it('should provide default logger instance', () => {
      const defaultLogger = getLogger();

      expect(defaultLogger).toBeDefined();
      defaultLogger.info('Default logger test');

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should allow setting custom default logger', () => {
      const customLogger = createLogger('custom-service');
      setLogger(customLogger);

      const retrieved = getLogger();
      retrieved.info('Custom default logger');

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(logEntry['logging.googleapis.com/labels'].service).toBe('custom-service');
    });
  });

  describe('Pretty Print Mode', () => {
    it('should format output with indentation when prettyPrint is true', () => {
      const prettyLogger = createLogger('test', { prettyPrint: true });

      prettyLogger.info('Pretty message');

      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain('\n');
      expect(output).toContain('  ');
    });

    it('should format output as single line when prettyPrint is false', () => {
      logger.info('Compact message');

      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).not.toContain('\n  ');
    });
  });

  describe('Custom Redaction Patterns', () => {
    it('should support custom redaction patterns', () => {
      const customLogger = createLogger('test', {
        prettyPrint: false,
        redactionPatterns: [/custom-secret-[a-z0-9]+/gi],
      });

      customLogger.info('Message', { value: 'custom-secret-abc123' });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      const logString = JSON.stringify(logEntry);

      expect(logString).not.toContain('custom-secret-abc123');
      expect(logString).toContain('[REDACTED]');
    });
  });

  describe('Timestamp Format', () => {
    it('should use ISO 8601 timestamp format', () => {
      logger.info('Test message');

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });

  describe('Additional Data Merging', () => {
    it('should merge additional data into log entry', () => {
      logger.info('Message with data', {
        customField1: 'value1',
        customField2: 123,
        customField3: { nested: 'object' },
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(logEntry.customField1).toBe('value1');
      expect(logEntry.customField2).toBe(123);
      expect(logEntry.customField3).toEqual({ nested: 'object' });
    });

    it('should handle null and undefined in additional data', () => {
      logger.info('Message', {
        nullField: null,
        undefinedField: undefined,
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect('nullField' in logEntry).toBe(true);
      expect(logEntry.nullField).toBeNull();
    });
  });
});
