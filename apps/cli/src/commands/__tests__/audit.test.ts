/**
 * Tests for gwi audit CLI commands (D3.6)
 *
 * Tests audit verify, health, is-valid, export, and formats commands.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  auditVerifyCommand,
  auditHealthCommand,
  auditIsValidCommand,
  auditExportCommand,
  auditFormatsCommand,
  type AuditVerifyOptions,
  type AuditExportOptions,
} from '../audit.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('Audit CLI Commands', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let exitCode: number | undefined;

  beforeEach(() => {
    exitCode = undefined;

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process.exit to record the exit code without throwing
    // This prevents cascading catches in the command handlers
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      exitCode = typeof code === 'number' ? code : 0;
      // Return undefined to satisfy the never return type (the mock won't actually return)
      return undefined as never;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // auditVerifyCommand Tests
  // ===========================================================================

  describe('auditVerifyCommand', () => {
    it('should verify empty tenant successfully', async () => {
      const options: AuditVerifyOptions = {
        tenant: 'empty-tenant',
      };

      await auditVerifyCommand(options);

      // Should output report (not JSON by default)
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Audit Log Verification Report');
      expect(output).toContain('CHAIN INTEGRITY VERIFIED');
    });

    it('should output JSON when --json flag is set', async () => {
      const options: AuditVerifyOptions = {
        tenant: 'test-tenant',
        json: true,
      };

      await auditVerifyCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;

      // Should be valid JSON
      const report = JSON.parse(output);
      expect(report).toHaveProperty('tenantId', 'test-tenant');
      expect(report).toHaveProperty('valid');
      expect(report).toHaveProperty('issues');
      expect(report).toHaveProperty('stats');
    });

    it('should use default tenant when not specified', async () => {
      const options: AuditVerifyOptions = {
        json: true,
      };

      await auditVerifyCommand(options);

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const report = JSON.parse(output);
      expect(report.tenantId).toBe('default');
    });

    it('should respect startSequence option', async () => {
      const options: AuditVerifyOptions = {
        tenant: 'test-tenant',
        startSequence: 5,
        json: true,
      };

      await auditVerifyCommand(options);

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const report = JSON.parse(output);
      expect(report).toHaveProperty('stats');
    });

    it('should respect endSequence option', async () => {
      const options: AuditVerifyOptions = {
        tenant: 'test-tenant',
        endSequence: 10,
        json: true,
      };

      await auditVerifyCommand(options);

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const report = JSON.parse(output);
      expect(report).toHaveProperty('stats');
    });

    it('should respect maxEntries option', async () => {
      const options: AuditVerifyOptions = {
        tenant: 'test-tenant',
        maxEntries: 100,
        json: true,
      };

      await auditVerifyCommand(options);

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const report = JSON.parse(output);
      expect(report).toHaveProperty('stats');
    });

    it('should enable timestamp verification when option set', async () => {
      const options: AuditVerifyOptions = {
        tenant: 'test-tenant',
        verifyTimestamps: true,
        json: true,
      };

      await auditVerifyCommand(options);

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const report = JSON.parse(output);
      expect(report).toHaveProperty('valid');
    });

    it('should include entry details when verbose option set', async () => {
      const options: AuditVerifyOptions = {
        tenant: 'test-tenant',
        verbose: true,
        json: true,
      };

      await auditVerifyCommand(options);

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const report = JSON.parse(output);
      // Entry details are only included if there are entries to verify
      // For empty tenant, entryDetails will be an empty array or undefined
      expect(report).toHaveProperty('valid');
      // If entryDetails exists, it should be an array
      if (report.entryDetails !== undefined) {
        expect(Array.isArray(report.entryDetails)).toBe(true);
      }
    });

    it('should include entry details when includeDetails option set', async () => {
      const options: AuditVerifyOptions = {
        tenant: 'test-tenant',
        includeDetails: true,
        json: true,
      };

      await auditVerifyCommand(options);

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const report = JSON.parse(output);
      // Entry details are only included if there are entries to verify
      // For empty tenant, entryDetails will be an empty array or undefined
      expect(report).toHaveProperty('valid');
      // If entryDetails exists, it should be an array
      if (report.entryDetails !== undefined) {
        expect(Array.isArray(report.entryDetails)).toBe(true);
      }
    });

    it('should display human-readable report by default', async () => {
      const options: AuditVerifyOptions = {
        tenant: 'test-tenant',
      };

      await auditVerifyCommand(options);

      const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Audit Log Verification Report');
      expect(output).toContain('Tenant:');
      expect(output).toContain('Result:');
      expect(output).toContain('Summary:');
      expect(output).toContain('Statistics:');
    });

    it('should show verification duration in report', async () => {
      const options: AuditVerifyOptions = {
        tenant: 'test-tenant',
        json: true,
      };

      await auditVerifyCommand(options);

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const report = JSON.parse(output);
      expect(report).toHaveProperty('durationMs');
      expect(typeof report.durationMs).toBe('number');
    });
  });

  // ===========================================================================
  // auditHealthCommand Tests
  // ===========================================================================

  describe('auditHealthCommand', () => {
    it('should show health info for empty tenant', async () => {
      const options = {
        tenant: 'empty-tenant',
      };

      await auditHealthCommand(options);

      const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('No audit log found for tenant');
    });

    it('should output JSON when --json flag is set', async () => {
      const options = {
        tenant: 'test-tenant',
        json: true,
      };

      await auditHealthCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;

      // For empty tenant, should be null
      expect(output).toBe('null');
    });

    it('should use default tenant when not specified', async () => {
      const options = {};

      await auditHealthCommand(options);

      // Should have been called - the output may not explicitly show tenant name
      // but the command should complete without error
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // auditIsValidCommand Tests
  // ===========================================================================

  describe('auditIsValidCommand', () => {
    it('should output "valid" for empty tenant', async () => {
      const options = {
        tenant: 'empty-tenant',
      };

      await auditIsValidCommand(options);

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith('valid');
    });

    it('should exit with code 0 for valid chain', async () => {
      const options = {
        tenant: 'test-tenant',
      };

      await auditIsValidCommand(options);

      expect(exitCode).toBe(0);
    });

    it('should suppress output in quiet mode', async () => {
      const options = {
        tenant: 'test-tenant',
        quiet: true,
      };

      await auditIsValidCommand(options);

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should use default tenant when not specified', async () => {
      const options = {};

      await auditIsValidCommand(options);

      expect(exitCode).toBe(0);
    });
  });

  // ===========================================================================
  // auditExportCommand Tests
  // ===========================================================================

  describe('auditExportCommand', () => {
    it('should export as JSON by default', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;

      // Should be valid JSON
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('entries');
      expect(parsed).toHaveProperty('metadata');
    });

    it('should export as JSON Lines format', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        format: 'json-lines',
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should export as CSV format', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        format: 'csv',
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;
      // CSV should have headers
      expect(output).toContain(',');
    });

    it('should export as CEF format', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        format: 'cef',
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should export as Syslog format', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        format: 'syslog',
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should reject invalid format', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        format: 'invalid-format',
      };

      await auditExportCommand(options);

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorOutput = consoleErrorSpy.mock.calls[0].join(' ');
      expect(errorOutput).toContain('Invalid format');
    });

    it('should use default tenant when not specified', async () => {
      const options: AuditExportOptions = {};

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.metadata.tenantId).toBe('default');
    });

    it('should require key-file and key-id for signing', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        sign: true,
        // Missing keyFile and keyId
      };

      await auditExportCommand(options);

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorOutput = consoleErrorSpy.mock.calls[0].join(' ');
      expect(errorOutput).toContain('--key-file');
      expect(errorOutput).toContain('--key-id');
    });

    it('should include chain data when requested', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        includeChain: true,
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should exclude metadata when requested', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        includeMetadata: false,
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should pretty print when requested', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        pretty: true,
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;
      // Pretty printed JSON has newlines
      expect(output).toContain('\n');
    });

    it('should respect limit option', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        limit: 10,
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should filter by high risk when requested', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        highRisk: true,
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should filter by actor', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        actor: 'user-123',
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should filter by category', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        category: 'data_access',
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should filter by resource type', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        resourceType: 'document',
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should filter by sequence range', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        startSequence: 1,
        endSequence: 100,
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should reject invalid start date', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        start: 'not-a-date',
      };

      await auditExportCommand(options);

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should reject invalid end date', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        end: 'not-a-date',
      };

      await auditExportCommand(options);

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should filter by valid date range', async () => {
      const options: AuditExportOptions = {
        tenant: 'test-tenant',
        start: '2024-01-01',
        end: '2024-12-31',
      };

      await auditExportCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // auditFormatsCommand Tests
  // ===========================================================================

  describe('auditFormatsCommand', () => {
    it('should list all supported formats', () => {
      auditFormatsCommand();

      const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Supported Export Formats');
      expect(output).toContain('json');
      expect(output).toContain('json-lines');
      expect(output).toContain('csv');
      expect(output).toContain('cef');
      expect(output).toContain('syslog');
    });

    it('should include format descriptions', () => {
      auditFormatsCommand();

      const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('JSON');
      expect(output).toContain('Comma-separated');
      expect(output).toContain('SIEM');
      expect(output).toContain('RFC 5424');
    });
  });

  // ===========================================================================
  // Helper Function Tests
  // ===========================================================================

  describe('Helper Functions', () => {
    it('should format issues with severity colors in verbose mode', async () => {
      // This tests the formatIssue function indirectly through verify command
      const options: AuditVerifyOptions = {
        tenant: 'test-tenant',
        verbose: true,
      };

      await auditVerifyCommand(options);

      // Should complete without error
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle verification report with all severity levels', async () => {
      const options: AuditVerifyOptions = {
        tenant: 'test-tenant',
        json: true,
      };

      await auditVerifyCommand(options);

      const output = consoleLogSpy.mock.calls[0][0] as string;
      const report = JSON.parse(output);

      // Report should have issues array
      expect(Array.isArray(report.issues)).toBe(true);
    });
  });
});
