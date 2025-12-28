/**
 * Tests for TimeGPT client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TimeGPTClient,
  TimeGPTError,
  TimeGPTAuthenticationError,
  TimeGPTRateLimitError,
  TimeGPTValidationError,
  TimeGPTInsufficientDataError,
  createTimeGPTClient,
} from '../timegpt-client.js';
import type { TimeSeriesDataset } from '../models/index.js';

describe('TimeGPTClient', () => {
  describe('constructor', () => {
    it('should create client with valid config', () => {
      const client = createTimeGPTClient({
        apiToken: 'test-token',
      });

      expect(client).toBeInstanceOf(TimeGPTClient);
    });

    it('should apply default configuration', () => {
      const client = createTimeGPTClient({
        apiToken: 'test-token',
      });

      const config = client.getConfig();
      expect(config.apiToken).toBe('***REDACTED***');
      expect(config.defaultHorizon).toBe(1);
      expect(config.model).toBe('timegpt-1');
    });

    it('should accept custom configuration', () => {
      const client = createTimeGPTClient({
        apiToken: 'test-token',
        defaultHorizon: 5,
        model: 'timegpt-1-long-horizon',
        timeoutMs: 60000,
      });

      const config = client.getConfig();
      expect(config.defaultHorizon).toBe(5);
      expect(config.model).toBe('timegpt-1-long-horizon');
      expect(config.timeoutMs).toBe(60000);
    });
  });

  describe('forecast', () => {
    let client: TimeGPTClient;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      client = createTimeGPTClient({
        apiToken: 'test-token',
      });

      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should throw InsufficientDataError for too few data points', async () => {
      const dataset: TimeSeriesDataset = {
        seriesId: 'test',
        description: 'Test series',
        points: [
          { timestamp: '2024-01-01', uniqueId: 'test', value: 100 },
        ],
        frequency: 'D',
        minDataPoints: 10,
      };

      await expect(client.forecast(dataset)).rejects.toThrow(TimeGPTInsufficientDataError);
    });

    it('should make correct API request', async () => {
      const dataset: TimeSeriesDataset = {
        seriesId: 'run_duration',
        description: 'Run duration in ms',
        points: Array.from({ length: 15 }, (_, i) => ({
          timestamp: `2024-01-${String(i + 1).padStart(2, '0')}`,
          uniqueId: 'run_duration',
          value: 5000 + i * 100,
        })),
        frequency: 'D',
        minDataPoints: 10,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            forecast: [
              {
                ds: '2024-01-16',
                TimeGPT: 6500,
                'TimeGPT-lo-80': 6000,
                'TimeGPT-hi-80': 7000,
                'TimeGPT-lo-90': 5500,
                'TimeGPT-hi-90': 7500,
              },
            ],
          },
        }),
        headers: {
          get: (name: string) => name === 'x-request-id' ? 'req-123' : null,
        },
      });

      const result = await client.forecast(dataset, 1);

      expect(result.uniqueId).toBe('run_duration');
      expect(result.forecast).toHaveLength(1);
      expect(result.forecast[0].value).toBe(6500);
      expect(result.forecast[0].lo80).toBe(6000);
      expect(result.forecast[0].hi80).toBe(7000);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.nixtla.io/forecast');
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer test-token');
    });

    it('should handle authentication errors', async () => {
      const dataset: TimeSeriesDataset = {
        seriesId: 'test',
        description: 'Test',
        points: Array.from({ length: 15 }, (_, i) => ({
          timestamp: `2024-01-${String(i + 1).padStart(2, '0')}`,
          uniqueId: 'test',
          value: 100,
        })),
        frequency: 'D',
        minDataPoints: 10,
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ message: 'Invalid API key' }),
        headers: {
          get: (name: string) => name === 'x-request-id' ? 'req-123' : null,
        },
      });

      await expect(client.forecast(dataset)).rejects.toThrow(TimeGPTAuthenticationError);
    });

    it('should handle rate limit errors', async () => {
      // Create client with no retries for faster test
      const noRetryClient = createTimeGPTClient({
        apiToken: 'test-token',
        maxRetries: 0,
      });

      const dataset: TimeSeriesDataset = {
        seriesId: 'test',
        description: 'Test',
        points: Array.from({ length: 15 }, (_, i) => ({
          timestamp: `2024-01-${String(i + 1).padStart(2, '0')}`,
          uniqueId: 'test',
          value: 100,
        })),
        frequency: 'D',
        minDataPoints: 10,
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: () => Promise.resolve({ message: 'Rate limit exceeded' }),
        headers: {
          get: (name: string) => {
            if (name === 'x-request-id') return 'req-123';
            if (name === 'retry-after') return '60';
            return null;
          },
        },
      });

      await expect(noRetryClient.forecast(dataset)).rejects.toThrow(TimeGPTRateLimitError);
    });

    it('should handle validation errors', async () => {
      const dataset: TimeSeriesDataset = {
        seriesId: 'test',
        description: 'Test',
        points: Array.from({ length: 15 }, (_, i) => ({
          timestamp: `2024-01-${String(i + 1).padStart(2, '0')}`,
          uniqueId: 'test',
          value: 100,
        })),
        frequency: 'D',
        minDataPoints: 10,
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Invalid request format' }),
        headers: {
          get: (name: string) => name === 'x-request-id' ? 'req-123' : null,
        },
      });

      await expect(client.forecast(dataset)).rejects.toThrow(TimeGPTValidationError);
    });
  });

  describe('healthCheck', () => {
    let client: TimeGPTClient;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      client = createTimeGPTClient({
        apiToken: 'test-token',
      });

      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return healthy status on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            forecast: [{ ds: '2024-01-06', TimeGPT: 6 }],
          },
        }),
        headers: {
          get: () => null,
        },
      });

      const health = await client.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy status on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const health = await client.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toBe('Network error');
    });
  });

  describe('crossValidation', () => {
    let client: TimeGPTClient;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      client = createTimeGPTClient({
        apiToken: 'test-token',
      });

      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should throw for insufficient data', async () => {
      const dataset: TimeSeriesDataset = {
        seriesId: 'test',
        description: 'Test',
        points: Array.from({ length: 15 }, (_, i) => ({
          timestamp: `2024-01-${String(i + 1).padStart(2, '0')}`,
          uniqueId: 'test',
          value: 100,
        })),
        frequency: 'D',
        minDataPoints: 10,
      };

      // 15 points, need 10 for training + 1 * 5 for CV = 15, just enough
      // But with horizon 5 and 5 windows, need 10 + 5 * 5 = 35
      await expect(client.crossValidation(dataset, 5, 5)).rejects.toThrow(TimeGPTInsufficientDataError);
    });

    it('should perform cross-validation with sufficient data', async () => {
      const dataset: TimeSeriesDataset = {
        seriesId: 'test',
        description: 'Test',
        points: Array.from({ length: 50 }, (_, i) => ({
          timestamp: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
          uniqueId: 'test',
          value: 100 + i * 10,
        })),
        frequency: 'D',
        minDataPoints: 10,
      };

      // Mock multiple forecast calls
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: {
            forecast: [{ ds: '2024-02-01', TimeGPT: 600 }],
          },
        }),
        headers: {
          get: () => null,
        },
      }));

      const result = await client.crossValidation(dataset, 1, 3);

      expect(result.validations).toHaveLength(3);
      expect(typeof result.mae).toBe('number');
      expect(typeof result.rmse).toBe('number');
    });
  });
});

describe('TimeGPT Error Classes', () => {
  it('should create TimeGPTError with correct properties', () => {
    const error = new TimeGPTError('Test error', 'TEST_CODE', 500, 'req-123');

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.statusCode).toBe(500);
    expect(error.requestId).toBe('req-123');
    expect(error.name).toBe('TimeGPTError');
  });

  it('should create TimeGPTRateLimitError with retry info', () => {
    const error = new TimeGPTRateLimitError('Rate limited', 60000, 'req-123');

    expect(error.retryAfterMs).toBe(60000);
    expect(error.code).toBe('RATE_LIMIT');
    expect(error.statusCode).toBe(429);
    expect(error.name).toBe('TimeGPTRateLimitError');
  });

  it('should create TimeGPTInsufficientDataError with data info', () => {
    const error = new TimeGPTInsufficientDataError('Not enough data', 10, 5, 'req-123');

    expect(error.requiredPoints).toBe(10);
    expect(error.actualPoints).toBe(5);
    expect(error.code).toBe('INSUFFICIENT_DATA');
    expect(error.name).toBe('TimeGPTInsufficientDataError');
  });
});
