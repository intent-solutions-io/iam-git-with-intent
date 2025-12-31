/**
 * Unit tests for warehouse connector
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BigQuery before importing modules
vi.mock('@google-cloud/bigquery', () => {
  const mockDataset = vi.fn(() => ({
    id: 'test_dataset',
    getTables: vi.fn().mockResolvedValue([[]]),
    table: vi.fn().mockReturnValue({
      getMetadata: vi.fn().mockResolvedValue([
        {
          schema: {
            fields: [
              { name: 'id', type: 'STRING', mode: 'REQUIRED' },
              { name: 'name', type: 'STRING', mode: 'NULLABLE' },
            ],
          },
          description: 'Test table',
        },
      ]),
    }),
  }));

  const mockBigQuery = vi.fn(() => ({
    dataset: mockDataset,
    createQueryJob: vi.fn().mockResolvedValue([
      {
        id: 'test-job-id',
        getQueryResults: vi.fn().mockResolvedValue([[]]),
        metadata: {
          statistics: {
            totalBytesProcessed: '1024',
          },
        },
      },
    ]),
    getDatasets: vi.fn().mockResolvedValue([[]]),
  }));

  return {
    BigQuery: mockBigQuery,
    Dataset: vi.fn(),
    Table: vi.fn(),
  };
});

import {
  createWarehouseConnector,
  isWarehouseTypeSupported,
  getSupportedWarehouseTypes,
  getWarehouseImplementationStatus,
  BigQueryClient,
  SnowflakeClient,
  RedshiftClient,
  type BigQueryConfig,
  type SnowflakeConfig,
  type RedshiftConfig,
} from '../index.js';

describe('Warehouse Connector Factory', () => {
  describe('createWarehouseConnector', () => {
    it('should create BigQuery client', () => {
      const config: BigQueryConfig = {
        type: 'bigquery',
        projectId: 'test-project',
        datasetId: 'test_dataset',
      };

      const client = createWarehouseConnector(config);
      expect(client).toBeInstanceOf(BigQueryClient);
    });

    it('should create Snowflake client', () => {
      const config: SnowflakeConfig = {
        type: 'snowflake',
        account: 'test-account',
        database: 'test_db',
        schema: 'public',
      };

      const client = createWarehouseConnector(config);
      expect(client).toBeInstanceOf(SnowflakeClient);
    });

    it('should create Redshift client', () => {
      const config: RedshiftConfig = {
        type: 'redshift',
        database: 'test_db',
        schema: 'public',
        region: 'us-east-1',
      };

      const client = createWarehouseConnector(config);
      expect(client).toBeInstanceOf(RedshiftClient);
    });

    it('should throw error for unsupported type', () => {
      const config = {
        type: 'unsupported',
        projectId: 'test',
      } as never;

      expect(() => createWarehouseConnector(config)).toThrow(
        'Unsupported warehouse type: unsupported'
      );
    });
  });

  describe('isWarehouseTypeSupported', () => {
    it('should return true for supported types', () => {
      expect(isWarehouseTypeSupported('bigquery')).toBe(true);
      expect(isWarehouseTypeSupported('snowflake')).toBe(true);
      expect(isWarehouseTypeSupported('redshift')).toBe(true);
    });

    it('should return false for unsupported types', () => {
      expect(isWarehouseTypeSupported('oracle')).toBe(false);
      expect(isWarehouseTypeSupported('mysql')).toBe(false);
      expect(isWarehouseTypeSupported('')).toBe(false);
    });
  });

  describe('getSupportedWarehouseTypes', () => {
    it('should return all supported types', () => {
      const types = getSupportedWarehouseTypes();
      expect(types).toEqual(['bigquery', 'snowflake', 'redshift']);
    });
  });

  describe('getWarehouseImplementationStatus', () => {
    it('should show BigQuery as implemented', () => {
      const status = getWarehouseImplementationStatus('bigquery');
      expect(status.supported).toBe(true);
      expect(status.implemented).toBe(true);
      expect(status.notes).toContain('@google-cloud/bigquery');
    });

    it('should show Snowflake as not implemented', () => {
      const status = getWarehouseImplementationStatus('snowflake');
      expect(status.supported).toBe(true);
      expect(status.implemented).toBe(false);
      expect(status.notes).toContain('TODO');
    });

    it('should show Redshift as not implemented', () => {
      const status = getWarehouseImplementationStatus('redshift');
      expect(status.supported).toBe(true);
      expect(status.implemented).toBe(false);
      expect(status.notes).toContain('TODO');
    });

    it('should show unknown type as not supported', () => {
      const status = getWarehouseImplementationStatus('oracle');
      expect(status.supported).toBe(false);
      expect(status.implemented).toBe(false);
      expect(status.notes).toContain('Unknown');
    });
  });
});

describe('BigQueryClient', () => {
  describe('constructor', () => {
    it('should initialize with project ID', () => {
      const config: BigQueryConfig = {
        type: 'bigquery',
        projectId: 'test-project',
      };

      const client = new BigQueryClient(config);
      expect(client).toBeInstanceOf(BigQueryClient);
    });

    it('should initialize with dataset ID', () => {
      const config: BigQueryConfig = {
        type: 'bigquery',
        projectId: 'test-project',
        datasetId: 'test_dataset',
      };

      const client = new BigQueryClient(config);
      expect(client).toBeInstanceOf(BigQueryClient);
      expect(client.getDataset()).toBeDefined();
    });

    it('should accept keyFilename', () => {
      const config: BigQueryConfig = {
        type: 'bigquery',
        projectId: 'test-project',
        keyFilename: '/path/to/key.json',
      };

      const client = new BigQueryClient(config);
      expect(client).toBeInstanceOf(BigQueryClient);
    });

    it('should accept credentials object', () => {
      const config: BigQueryConfig = {
        type: 'bigquery',
        projectId: 'test-project',
        credentials: {
          client_email: 'test@example.com',
          private_key: 'MOCK_PRIVATE_KEY_DATA', // Mock credential for testing
        },
      };

      const client = new BigQueryClient(config);
      expect(client).toBeInstanceOf(BigQueryClient);
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const config: BigQueryConfig = {
        type: 'bigquery',
        projectId: 'test-project',
      };

      const client = new BigQueryClient(config);
      const stats = client.getStats();

      expect(stats.queriesExecuted).toBe(0);
      expect(stats.totalBytesProcessed).toBe(0);
      expect(stats.avgQueryTimeMs).toBe(0);
      expect(stats.errors).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('should reset statistics to zero', () => {
      const config: BigQueryConfig = {
        type: 'bigquery',
        projectId: 'test-project',
      };

      const client = new BigQueryClient(config);

      // Manually update stats for testing
      (client as { stats: { queriesExecuted: number } }).stats.queriesExecuted = 5;

      client.resetStats();
      const stats = client.getStats();

      expect(stats.queriesExecuted).toBe(0);
      expect(stats.totalBytesProcessed).toBe(0);
      expect(stats.avgQueryTimeMs).toBe(0);
      expect(stats.errors).toBe(0);
    });
  });

  describe('close', () => {
    it('should resolve without error', async () => {
      const config: BigQueryConfig = {
        type: 'bigquery',
        projectId: 'test-project',
      };

      const client = new BigQueryClient(config);
      await expect(client.close()).resolves.toBeUndefined();
    });
  });
});

describe('SnowflakeClient', () => {
  describe('constructor', () => {
    it('should initialize with config', () => {
      const config: SnowflakeConfig = {
        type: 'snowflake',
        account: 'test-account',
        database: 'test_db',
        schema: 'public',
      };

      const client = new SnowflakeClient(config);
      expect(client).toBeInstanceOf(SnowflakeClient);
    });
  });

  describe('unimplemented methods', () => {
    let client: SnowflakeClient;

    beforeEach(() => {
      const config: SnowflakeConfig = {
        type: 'snowflake',
        account: 'test-account',
        database: 'test_db',
        schema: 'public',
      };
      client = new SnowflakeClient(config);
    });

    it('query should throw not implemented error', async () => {
      await expect(client.query('SELECT 1')).rejects.toThrow(
        'Snowflake connector not implemented'
      );
    });

    it('listTables should throw not implemented error', async () => {
      await expect(client.listTables()).rejects.toThrow(
        'Snowflake connector not implemented'
      );
    });

    it('getSchema should throw not implemented error', async () => {
      await expect(client.getSchema('db', 'table')).rejects.toThrow(
        'Snowflake connector not implemented'
      );
    });

    it('testConnection should throw not implemented error', async () => {
      await expect(client.testConnection()).rejects.toThrow(
        'Snowflake connector not implemented'
      );
    });

    it('close should resolve without error', async () => {
      await expect(client.close()).resolves.toBeUndefined();
    });
  });
});

describe('RedshiftClient', () => {
  describe('constructor', () => {
    it('should initialize with config', () => {
      const config: RedshiftConfig = {
        type: 'redshift',
        database: 'test_db',
        schema: 'public',
        region: 'us-east-1',
      };

      const client = new RedshiftClient(config);
      expect(client).toBeInstanceOf(RedshiftClient);
    });
  });

  describe('unimplemented methods', () => {
    let client: RedshiftClient;

    beforeEach(() => {
      const config: RedshiftConfig = {
        type: 'redshift',
        database: 'test_db',
        schema: 'public',
        region: 'us-east-1',
      };
      client = new RedshiftClient(config);
    });

    it('query should throw not implemented error', async () => {
      await expect(client.query('SELECT 1')).rejects.toThrow(
        'Redshift connector not implemented'
      );
    });

    it('listTables should throw not implemented error', async () => {
      await expect(client.listTables()).rejects.toThrow(
        'Redshift connector not implemented'
      );
    });

    it('getSchema should throw not implemented error', async () => {
      await expect(client.getSchema('db', 'table')).rejects.toThrow(
        'Redshift connector not implemented'
      );
    });

    it('testConnection should throw not implemented error', async () => {
      await expect(client.testConnection()).rejects.toThrow(
        'Redshift connector not implemented'
      );
    });

    it('close should resolve without error', async () => {
      await expect(client.close()).resolves.toBeUndefined();
    });
  });
});
