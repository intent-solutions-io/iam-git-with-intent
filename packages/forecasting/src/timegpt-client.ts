/**
 * TimeGPT Client
 *
 * Integration with Nixtla's TimeGPT API for time series forecasting.
 * Handles API communication, error handling, and response parsing.
 *
 * @see https://docs.nixtla.io/
 */

import { z } from 'zod';
import {
  TimeGPTConfig,
  TimeGPTConfigSchema,
  TimeSeriesDataset,
  TimeGPTForecast,
  TimeGPTForecastSchema,
} from './models/index.js';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_FINETUNE_STEPS = 50;
const DEFAULT_FINETUNE_LOSS = 'default';
const MAPE_PERCENTAGE_MULTIPLIER = 100;
const SMAPE_PERCENTAGE_MULTIPLIER = 200;
const EXPONENTIAL_BACKOFF_BASE = 2;
const EXPONENTIAL_BACKOFF_MULTIPLIER_MS = 1000;

// =============================================================================
// API Request/Response Schemas
// =============================================================================

/**
 * TimeGPT API forecast request
 */
const _TimeGPTForecastRequestSchema = z.object({
  /** Time series data in long format */
  y: z.record(z.unknown()),
  /** Column containing timestamps */
  time_col: z.string().default('ds'),
  /** Column containing target values */
  target_col: z.string().default('y'),
  /** Forecast horizon */
  h: z.number().min(1),
  /** Frequency of the time series */
  freq: z.string().optional(),
  /** Confidence levels for prediction intervals */
  level: z.array(z.number()).optional(),
  /** Whether to add exogenous variables */
  X: z.record(z.unknown()).optional(),
  /** Model to use */
  model: z.string().optional(),
  /** Finetune parameters */
  finetune_steps: z.number().optional(),
  finetune_loss: z.string().optional(),
  /** Clean exogenous data first */
  clean_ex_first: z.boolean().optional(),
});

type TimeGPTForecastRequest = z.infer<typeof _TimeGPTForecastRequestSchema>;

/**
 * TimeGPT API response
 */
const _TimeGPTAPIResponseSchema = z.object({
  data: z.object({
    forecast: z.array(z.object({
      ds: z.string(),
      TimeGPT: z.number(),
      'TimeGPT-lo-80': z.number().optional(),
      'TimeGPT-hi-80': z.number().optional(),
      'TimeGPT-lo-90': z.number().optional(),
      'TimeGPT-hi-90': z.number().optional(),
    })),
  }),
  message: z.string().optional(),
  details: z.string().optional(),
  code: z.string().optional(),
  requestID: z.string().optional(),
});

type TimeGPTAPIResponse = z.infer<typeof _TimeGPTAPIResponseSchema>;

// =============================================================================
// Error Types
// =============================================================================

export class TimeGPTError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'TimeGPTError';
  }
}

export class TimeGPTRateLimitError extends TimeGPTError {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
    requestId?: string
  ) {
    super(message, 'RATE_LIMIT', 429, requestId);
    this.name = 'TimeGPTRateLimitError';
  }
}

export class TimeGPTValidationError extends TimeGPTError {
  constructor(message: string, requestId?: string) {
    super(message, 'VALIDATION_ERROR', 400, requestId);
    this.name = 'TimeGPTValidationError';
  }
}

export class TimeGPTAuthenticationError extends TimeGPTError {
  constructor(message: string, requestId?: string) {
    super(message, 'AUTHENTICATION_ERROR', 401, requestId);
    this.name = 'TimeGPTAuthenticationError';
  }
}

export class TimeGPTInsufficientDataError extends TimeGPTError {
  constructor(
    message: string,
    public readonly requiredPoints: number,
    public readonly actualPoints: number,
    requestId?: string
  ) {
    super(message, 'INSUFFICIENT_DATA', 400, requestId);
    this.name = 'TimeGPTInsufficientDataError';
  }
}

// =============================================================================
// Client Implementation
// =============================================================================

/**
 * TimeGPT client for time series forecasting
 */
export class TimeGPTClient {
  private readonly config: TimeGPTConfig;
  private readonly baseUrl: string;

  constructor(config: Partial<TimeGPTConfig> & { apiToken: string }) {
    this.config = TimeGPTConfigSchema.parse({
      ...config,
      apiEndpoint: config.apiEndpoint ?? 'https://api.nixtla.io',
    });
    this.baseUrl = this.config.apiEndpoint;
  }

  /**
   * Create a TimeGPT client from environment variables
   */
  static fromEnv(): TimeGPTClient {
    const apiToken = process.env.NIXTLA_API_KEY ?? process.env.TIMEGPT_API_KEY;
    if (!apiToken) {
      throw new TimeGPTAuthenticationError(
        'Missing TimeGPT API key. Set NIXTLA_API_KEY or TIMEGPT_API_KEY environment variable.'
      );
    }

    return new TimeGPTClient({
      apiToken,
      apiEndpoint: process.env.TIMEGPT_API_ENDPOINT,
      model: (process.env.TIMEGPT_MODEL as 'timegpt-1' | 'timegpt-1-long-horizon') ?? 'timegpt-1',
      defaultHorizon: process.env.TIMEGPT_DEFAULT_HORIZON
        ? parseInt(process.env.TIMEGPT_DEFAULT_HORIZON, 10)
        : 1,
      timeoutMs: process.env.TIMEGPT_TIMEOUT_MS
        ? parseInt(process.env.TIMEGPT_TIMEOUT_MS, 10)
        : DEFAULT_TIMEOUT_MS,
    });
  }

  /**
   * Forecast future values for a time series
   *
   * @param dataset - Historical time series data
   * @param horizon - Number of future points to predict
   * @param options - Additional forecast options
   * @returns Forecast results with prediction intervals
   */
  async forecast(
    dataset: TimeSeriesDataset,
    horizon: number = this.config.defaultHorizon,
    options: {
      levels?: number[];
      finetune?: boolean;
      finetuneLoss?: string;
      finetuneSteps?: number;
    } = {}
  ): Promise<TimeGPTForecast> {
    // Validate minimum data points
    if (dataset.points.length < dataset.minDataPoints) {
      throw new TimeGPTInsufficientDataError(
        `Insufficient data points. Got ${dataset.points.length}, need at least ${dataset.minDataPoints}.`,
        dataset.minDataPoints,
        dataset.points.length
      );
    }

    // Convert dataset to TimeGPT format
    const y = this.convertToTimeGPTFormat(dataset);

    const request: TimeGPTForecastRequest = {
      y,
      time_col: 'ds',
      target_col: 'y',
      h: horizon,
      freq: dataset.frequency,
      level: options.levels ?? this.config.defaultLevels,
      model: this.config.model,
    };

    // Add finetune parameters if requested
    if (options.finetune ?? this.config.finetune?.enabled) {
      request.finetune_steps = options.finetuneSteps ?? this.config.finetune?.steps ?? DEFAULT_FINETUNE_STEPS;
      request.finetune_loss = options.finetuneLoss ?? this.config.finetune?.loss ?? DEFAULT_FINETUNE_LOSS;
    }

    const response = await this.makeRequest<TimeGPTAPIResponse>(
      '/forecast',
      request
    );

    return this.parseResponse(response, dataset.seriesId);
  }

  /**
   * Perform cross-validation to evaluate model accuracy
   *
   * @param dataset - Historical time series data
   * @param horizon - Forecast horizon for each fold
   * @param nWindows - Number of cross-validation windows
   * @returns Cross-validation results with error metrics
   */
  async crossValidation(
    dataset: TimeSeriesDataset,
    horizon: number = 1,
    nWindows: number = 5
  ): Promise<{
    mae: number;
    rmse: number;
    mape: number | null;
    smape: number | null;
    validations: Array<{
      foldIndex: number;
      actual: number[];
      predicted: number[];
      mae: number;
      rmse: number;
    }>;
  }> {
    const points = dataset.points;
    const minTrainSize = dataset.minDataPoints;

    if (points.length < minTrainSize + horizon * nWindows) {
      throw new TimeGPTInsufficientDataError(
        `Insufficient data for cross-validation. Need ${minTrainSize + horizon * nWindows} points.`,
        minTrainSize + horizon * nWindows,
        points.length
      );
    }

    const validations: Array<{
      foldIndex: number;
      actual: number[];
      predicted: number[];
      mae: number;
      rmse: number;
    }> = [];

    // Perform sliding window cross-validation
    const stepSize = Math.floor((points.length - minTrainSize - horizon) / nWindows);

    for (let fold = 0; fold < nWindows; fold++) {
      const trainEnd = minTrainSize + fold * stepSize;
      const trainData = points.slice(0, trainEnd);
      const testData = points.slice(trainEnd, trainEnd + horizon);

      // Create subset dataset
      const trainDataset: TimeSeriesDataset = {
        ...dataset,
        points: trainData,
      };

      // Forecast
      const forecast = await this.forecast(trainDataset, horizon, { levels: [] });

      // Extract actual and predicted values
      const actual = testData.map(p => p.value);
      const predicted = forecast.forecast.map(f => f.value);

      // Calculate metrics for this fold
      const errors = actual.map((a, i) => a - predicted[i]);
      const absErrors = errors.map(e => Math.abs(e));
      const sqErrors = errors.map(e => e * e);

      const mae = absErrors.length > 0
        ? absErrors.reduce((a, b) => a + b, 0) / absErrors.length
        : 0;
      const rmse = sqErrors.length > 0
        ? Math.sqrt(sqErrors.reduce((a, b) => a + b, 0) / sqErrors.length)
        : 0;

      validations.push({
        foldIndex: fold,
        actual,
        predicted,
        mae,
        rmse,
      });
    }

    // Aggregate metrics across all folds
    const allActual = validations.flatMap(v => v.actual);
    const allPredicted = validations.flatMap(v => v.predicted);
    const allErrors = allActual.map((a, i) => a - allPredicted[i]);
    const allAbsErrors = allErrors.map(e => Math.abs(e));
    const allSqErrors = allErrors.map(e => e * e);

    const mae = allAbsErrors.length > 0
      ? allAbsErrors.reduce((a, b) => a + b, 0) / allAbsErrors.length
      : 0;
    const rmse = allSqErrors.length > 0
      ? Math.sqrt(allSqErrors.reduce((a, b) => a + b, 0) / allSqErrors.length)
      : 0;

    // MAPE and SMAPE (handle division by zero)
    let mape: number | null = null;
    let smape: number | null = null;

    const nonZeroActual = allActual.filter(a => a !== 0);
    if (nonZeroActual.length > 0) {
      const apeValues = allActual.map((a, i) =>
        a !== 0 ? Math.abs((a - allPredicted[i]) / a) * MAPE_PERCENTAGE_MULTIPLIER : null
      ).filter((v): v is number => v !== null);

      if (apeValues.length > 0) {
        mape = apeValues.reduce((a, b) => a + b, 0) / apeValues.length;
      }

      const smapeValues = allActual.map((a, i) => {
        const denominator = Math.abs(a) + Math.abs(allPredicted[i]);
        return denominator !== 0
          ? (Math.abs(a - allPredicted[i]) / denominator) * SMAPE_PERCENTAGE_MULTIPLIER
          : null;
      }).filter((v): v is number => v !== null);

      if (smapeValues.length > 0) {
        smape = smapeValues.reduce((a, b) => a + b, 0) / smapeValues.length;
      }
    }

    return {
      mae,
      rmse,
      mape,
      smape,
      validations,
    };
  }

  /**
   * Check API health and validate token
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    message: string;
    latencyMs: number;
  }> {
    const startTime = Date.now();

    try {
      // Use a minimal forecast request to test connectivity
      const testData = {
        y: {
          ds: ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'],
          y: [1, 2, 3, 4, 5],
        },
        time_col: 'ds',
        target_col: 'y',
        h: 1,
      };

      await this.makeRequest('/forecast', testData);

      return {
        healthy: true,
        message: 'TimeGPT API is healthy',
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Get current configuration (without exposing token)
   */
  getConfig(): Omit<TimeGPTConfig, 'apiToken'> & { apiToken: string } {
    return {
      ...this.config,
      apiToken: '***REDACTED***',
    };
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Convert TimeSeriesDataset to TimeGPT API format
   */
  private convertToTimeGPTFormat(dataset: TimeSeriesDataset): Record<string, unknown> {
    return {
      ds: dataset.points.map(p => p.timestamp),
      y: dataset.points.map(p => p.value),
      unique_id: dataset.points.map(() => dataset.seriesId),
    };
  }

  /**
   * Parse TimeGPT API response into our format
   */
  private parseResponse(response: TimeGPTAPIResponse, seriesId: string): TimeGPTForecast {
    const forecast = response.data.forecast.map(f => ({
      timestamp: f.ds,
      value: f.TimeGPT,
      lo80: f['TimeGPT-lo-80'],
      hi80: f['TimeGPT-hi-80'],
      lo90: f['TimeGPT-lo-90'],
      hi90: f['TimeGPT-hi-90'],
    }));

    return TimeGPTForecastSchema.parse({
      forecast,
      uniqueId: seriesId,
    });
  }

  /**
   * Make an HTTP request to the TimeGPT API
   */
  private async makeRequest<T>(
    endpoint: string,
    body: unknown,
    retryCount: number = 0
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiToken}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const requestId = response.headers.get('x-request-id') ?? undefined;

      if (!response.ok) {
        // Handle error and potentially retry
        try {
          await this.handleErrorResponse(response, requestId, retryCount, endpoint, body);
        } catch (error) {
          // If it's a rate limit error and we should retry, do it here
          if (error instanceof TimeGPTRateLimitError && retryCount < this.config.maxRetries) {
            const retryAfter = response.headers.get('retry-after');
            const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
            const delay = retryAfterMs ?? Math.pow(EXPONENTIAL_BACKOFF_BASE, retryCount) * EXPONENTIAL_BACKOFF_MULTIPLIER_MS;

            await this.sleep(delay);
            return this.makeRequest<T>(endpoint, body, retryCount + 1);
          }
          throw error;
        }
        // handleErrorResponse will throw
        throw new TimeGPTError('Unexpected error', 'UNKNOWN', response.status, requestId);
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof TimeGPTError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeGPTError(
          `Request timed out after ${this.config.timeoutMs}ms`,
          'TIMEOUT',
          408
        );
      }

      throw new TimeGPTError(
        error instanceof Error ? error.message : 'Network error',
        'NETWORK_ERROR'
      );
    }
  }

  /**
   * Handle error responses from the API
   */
  private async handleErrorResponse(
    response: Response,
    requestId: string | undefined,
    retryCount: number,
    endpoint: string,
    body: unknown
  ): Promise<never> {
    let errorBody: { message?: string; detail?: string; code?: string } = {};

    try {
      const parsed = await response.json();
      // Safe type check instead of assertion
      if (parsed && typeof parsed === 'object') {
        errorBody = {
          message: typeof (parsed as Record<string, unknown>).message === 'string'
            ? (parsed as Record<string, unknown>).message as string
            : undefined,
          detail: typeof (parsed as Record<string, unknown>).detail === 'string'
            ? (parsed as Record<string, unknown>).detail as string
            : undefined,
          code: typeof (parsed as Record<string, unknown>).code === 'string'
            ? (parsed as Record<string, unknown>).code as string
            : undefined,
        };
      }
    } catch {
      // Ignore JSON parse errors
    }

    const message = errorBody.message ?? errorBody.detail ?? response.statusText;

    switch (response.status) {
      case 401:
        throw new TimeGPTAuthenticationError(message, requestId);

      case 429: {
        const retryAfter = response.headers.get('retry-after');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
        throw new TimeGPTRateLimitError(message, retryAfterMs, requestId);
      }

      case 400:
        throw new TimeGPTValidationError(message, requestId);

      default:
        throw new TimeGPTError(message, errorBody.code ?? 'API_ERROR', response.status, requestId);
    }
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a TimeGPT client instance
 *
 * @param config - Client configuration (apiToken is required)
 * @returns TimeGPT client instance
 */
export function createTimeGPTClient(
  config: Partial<TimeGPTConfig> & { apiToken: string }
): TimeGPTClient {
  return new TimeGPTClient(config);
}

/**
 * Create a TimeGPT client from environment variables
 *
 * Reads configuration from:
 * - NIXTLA_API_KEY or TIMEGPT_API_KEY (required)
 * - TIMEGPT_API_ENDPOINT (optional)
 * - TIMEGPT_MODEL (optional, default: timegpt-1)
 * - TIMEGPT_DEFAULT_HORIZON (optional, default: 1)
 * - TIMEGPT_TIMEOUT_MS (optional, default: 30000)
 *
 * @returns TimeGPT client instance
 */
export function createTimeGPTClientFromEnv(): TimeGPTClient {
  return TimeGPTClient.fromEnv();
}
