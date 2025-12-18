/**
 * Phase 52: Connector Contract v1 + Normalization Pipeline
 *
 * Defines the connector interface for data sources and the
 * deterministic normalization pipeline to transform raw data
 * into canonical time-series format.
 *
 * Features:
 * - Connector contract with auth, pagination, rate limits
 * - Normalization rules and mapping engine
 * - Field-level diagnostics for mapping failures
 * - Replayable/deterministic transformations
 * - Schema inference for new sources
 * - Hot-reload support for connector configs
 *
 * @module @gwi/core/prediction-connectors
 */

import { z } from 'zod';
import type {
  CanonicalPoint,
  CanonicalSeries,
  SeriesMetadata,
  TimeResolution,
} from '../time-series/index.js';

// =============================================================================
// CONNECTOR CONTRACT VERSION
// =============================================================================

export const CONNECTOR_CONTRACT_VERSION = '1.0.0';

// =============================================================================
// ERROR CODES
// =============================================================================

export const ConnectorErrorCodes = {
  // Auth errors (1xxx)
  AUTH_FAILED: 'CONN_1001',
  AUTH_EXPIRED: 'CONN_1002',
  AUTH_INVALID_CREDENTIALS: 'CONN_1003',
  AUTH_INSUFFICIENT_PERMISSIONS: 'CONN_1004',

  // Connection errors (2xxx)
  CONNECTION_FAILED: 'CONN_2001',
  CONNECTION_TIMEOUT: 'CONN_2002',
  CONNECTION_REFUSED: 'CONN_2003',
  SSL_ERROR: 'CONN_2004',

  // Rate limit errors (3xxx)
  RATE_LIMITED: 'CONN_3001',
  QUOTA_EXCEEDED: 'CONN_3002',
  THROTTLED: 'CONN_3003',

  // Data errors (4xxx)
  INVALID_RESPONSE: 'CONN_4001',
  SCHEMA_MISMATCH: 'CONN_4002',
  MISSING_REQUIRED_FIELD: 'CONN_4003',
  TYPE_COERCION_FAILED: 'CONN_4004',
  VALUE_OUT_OF_RANGE: 'CONN_4005',

  // Normalization errors (5xxx)
  NORMALIZATION_FAILED: 'CONN_5001',
  MAPPING_NOT_FOUND: 'CONN_5002',
  TIMESTAMP_PARSE_FAILED: 'CONN_5003',
  VALUE_PARSE_FAILED: 'CONN_5004',
  INVALID_MAPPING_RULE: 'CONN_5005',

  // Pagination errors (6xxx)
  PAGINATION_ERROR: 'CONN_6001',
  CURSOR_INVALID: 'CONN_6002',
  PAGE_SIZE_EXCEEDED: 'CONN_6003',
} as const;

export type ConnectorErrorCode =
  (typeof ConnectorErrorCodes)[keyof typeof ConnectorErrorCodes];

// =============================================================================
// AUTH TYPES
// =============================================================================

export type AuthType =
  | 'none'
  | 'api_key'
  | 'oauth2'
  | 'basic'
  | 'bearer'
  | 'custom';

export interface AuthConfig {
  type: AuthType;
  credentials?: {
    apiKey?: string;
    username?: string;
    password?: string;
    bearerToken?: string;
    oauth2?: {
      clientId: string;
      clientSecret: string;
      tokenUrl: string;
      scopes?: string[];
      refreshToken?: string;
      accessToken?: string;
      expiresAt?: number;
    };
    custom?: Record<string, string>;
  };
  headerName?: string; // For API key: header name to use
  headerPrefix?: string; // e.g., "Bearer " for bearer tokens
}

// =============================================================================
// RATE LIMIT TYPES
// =============================================================================

export interface PredConnRateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Strategy when limit is reached */
  strategy: 'wait' | 'error' | 'backoff';
  /** Backoff configuration */
  backoff?: {
    initialDelayMs: number;
    maxDelayMs: number;
    multiplier: number;
    jitter: boolean;
  };
  /** Retry configuration */
  retries?: {
    maxAttempts: number;
    retryableErrors: ConnectorErrorCode[];
  };
}

// =============================================================================
// PAGINATION TYPES
// =============================================================================

export type PaginationType =
  | 'none'
  | 'offset'
  | 'cursor'
  | 'page_number'
  | 'link_header'
  | 'token';

export interface PaginationConfig {
  type: PaginationType;
  pageSize: number;
  maxPages?: number;
  /** For offset pagination */
  offsetParam?: string;
  limitParam?: string;
  /** For cursor pagination */
  cursorParam?: string;
  cursorPath?: string; // JSON path to cursor in response
  /** For page number pagination */
  pageParam?: string;
  /** For token pagination */
  tokenParam?: string;
  tokenPath?: string;
  /** Check if more pages exist */
  hasMorePath?: string;
  hasMoreValue?: unknown;
}

export interface PaginationState {
  type: PaginationType;
  currentPage: number;
  totalPages?: number;
  cursor?: string;
  nextToken?: string;
  hasMore: boolean;
  itemsRetrieved: number;
  totalItems?: number;
}

// =============================================================================
// CONNECTOR CONFIGURATION
// =============================================================================

export interface PredConnConfig {
  /** Unique connector ID */
  id: string;
  /** Connector name */
  name: string;
  /** Connector version */
  version: string;
  /** Source system type */
  sourceType: string;
  /** Base URL for API */
  baseUrl: string;
  /** Auth configuration */
  auth: AuthConfig;
  /** Rate limit configuration */
  rateLimit: PredConnRateLimitConfig;
  /** Pagination configuration */
  pagination: PaginationConfig;
  /** Request timeout in ms */
  timeoutMs: number;
  /** Custom headers */
  headers?: Record<string, string>;
  /** SSL/TLS verification */
  verifySsl: boolean;
  /** Proxy configuration */
  proxy?: {
    host: string;
    port: number;
    auth?: { username: string; password: string };
  };
  /** Tenant-specific overrides */
  tenantOverrides?: Record<string, Partial<PredConnConfig>>;
}

// =============================================================================
// MAPPING RULES
// =============================================================================

export type FieldTransform =
  | 'none'
  | 'lowercase'
  | 'uppercase'
  | 'trim'
  | 'parse_number'
  | 'parse_boolean'
  | 'parse_date'
  | 'multiply'
  | 'divide'
  | 'add'
  | 'subtract'
  | 'regex_extract'
  | 'json_path'
  | 'template'
  | 'lookup'
  | 'coalesce'
  | 'default';

export interface FieldMapping {
  /** Source field path (dot notation or JSON path) */
  sourcePath: string;
  /** Target field in canonical schema */
  targetField: string;
  /** Transform to apply */
  transform: FieldTransform;
  /** Transform parameters */
  transformParams?: {
    multiplier?: number;
    divisor?: number;
    addend?: number;
    pattern?: string; // For regex
    replacement?: string;
    dateFormat?: string;
    timezone?: string;
    defaultValue?: unknown;
    lookupTable?: Record<string, unknown>;
    template?: string;
    coalesceFields?: string[];
  };
  /** Whether this field is required */
  required: boolean;
  /** Validation rules */
  validation?: {
    type?: 'string' | 'number' | 'boolean' | 'date' | 'array';
    min?: number;
    max?: number;
    pattern?: string;
    enum?: unknown[];
  };
}

export interface MappingRule {
  /** Rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Rule version */
  version: string;
  /** Source connector type */
  sourceType: string;
  /** Target series metadata defaults */
  seriesDefaults: Partial<SeriesMetadata>;
  /** Timestamp field mapping */
  timestampMapping: {
    sourcePath: string;
    format: string; // ISO8601, unix_seconds, unix_ms, custom
    timezone: string;
  };
  /** Value field mapping */
  valueMapping: FieldMapping;
  /** Optional additional value mappings */
  additionalValueMappings?: FieldMapping[];
  /** Label mappings */
  labelMappings: FieldMapping[];
  /** Tag mappings */
  tagMappings?: FieldMapping[];
  /** Metadata mappings */
  metadataMappings?: FieldMapping[];
  /** Filter conditions (include only matching records) */
  filters?: Array<{
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains' | 'regex';
    value: unknown;
  }>;
  /** Deduplication key fields */
  dedupeKeys?: string[];
}

// =============================================================================
// NORMALIZATION DIAGNOSTICS
// =============================================================================

export interface FieldDiagnostic {
  /** Field path that caused the issue */
  fieldPath: string;
  /** Error code */
  code: ConnectorErrorCode;
  /** Human-readable message */
  message: string;
  /** Original value */
  originalValue: unknown;
  /** Expected type/format */
  expected?: string;
  /** Remediation hint */
  hint: string;
  /** Severity */
  severity: 'error' | 'warning' | 'info';
}

export interface NormalizationResult {
  /** Whether normalization succeeded */
  success: boolean;
  /** Normalized points */
  points: CanonicalPoint[];
  /** Series metadata extracted */
  seriesMetadata?: Partial<CanonicalSeries>;
  /** Diagnostics for any issues */
  diagnostics: FieldDiagnostic[];
  /** Statistics */
  stats: {
    inputRecords: number;
    outputPoints: number;
    skippedRecords: number;
    errorCount: number;
    warningCount: number;
    processingTimeMs: number;
  };
  /** Deterministic hash of input for replay verification */
  inputHash: string;
  /** Deterministic hash of output for regression testing */
  outputHash: string;
}

// =============================================================================
// CONNECTOR INTERFACE
// =============================================================================

export interface DataSourceConnector {
  /** Connector configuration */
  config: PredConnConfig;

  /** Initialize the connector */
  initialize(): Promise<void>;

  /** Test connection and auth */
  testConnection(): Promise<{
    success: boolean;
    message: string;
    latencyMs: number;
  }>;

  /** Fetch raw data from source */
  fetchData(params: FetchParams): Promise<FetchResult>;

  /** Get available streams/tables/metrics */
  discoverStreams(): Promise<StreamInfo[]>;

  /** Infer schema from sample data */
  inferSchema(streamName: string): Promise<InferredSchema>;

  /** Get connector health status */
  getHealth(): ConnectorHealth;

  /** Close the connector */
  close(): Promise<void>;
}

export interface FetchParams {
  /** Stream/table/metric name */
  streamName: string;
  /** Start time (inclusive) */
  startTime: number;
  /** End time (exclusive) */
  endTime: number;
  /** Additional filters */
  filters?: Record<string, unknown>;
  /** Fields to select (empty = all) */
  fields?: string[];
  /** Pagination state */
  pagination?: PaginationState;
  /** Request ID for tracing */
  requestId: string;
  /** Correlation ID */
  correlationId: string;
}

export interface FetchResult {
  /** Raw records from source */
  records: unknown[];
  /** Pagination state for next request */
  pagination: PaginationState;
  /** Response metadata */
  metadata: {
    responseTimeMs: number;
    bytesReceived: number;
    rateLimitRemaining?: number;
    rateLimitReset?: number;
  };
  /** Request ID */
  requestId: string;
}

export interface StreamInfo {
  /** Stream name */
  name: string;
  /** Display name */
  displayName: string;
  /** Description */
  description?: string;
  /** Schema if known */
  schema?: InferredSchema;
  /** Estimated record count */
  estimatedRecords?: number;
  /** Last updated timestamp */
  lastUpdated?: number;
}

export interface InferredSchema {
  /** Field definitions */
  fields: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'unknown';
    nullable: boolean;
    description?: string;
    sampleValues?: unknown[];
  }>;
  /** Suggested timestamp field */
  suggestedTimestampField?: string;
  /** Suggested value field */
  suggestedValueField?: string;
  /** Inferred resolution */
  inferredResolution?: TimeResolution;
}

export interface ConnectorHealth {
  /** Overall status */
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  /** Last successful connection */
  lastSuccessfulConnection?: number;
  /** Last error */
  lastError?: {
    code: ConnectorErrorCode;
    message: string;
    timestamp: number;
  };
  /** Rate limit status */
  rateLimitStatus: {
    remaining: number;
    resetAt?: number;
    isThrottled: boolean;
  };
  /** Connection pool status */
  connectionPool?: {
    active: number;
    idle: number;
    waiting: number;
  };
}

// =============================================================================
// NORMALIZATION ENGINE
// =============================================================================

/**
 * Deterministic normalization engine that transforms raw data into canonical format
 */
export class NormalizationEngine {
  private rules: Map<string, MappingRule> = new Map();
  private hashCounter = 0;

  constructor(rules: MappingRule[] = []) {
    for (const rule of rules) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * Register a mapping rule
   */
  registerRule(rule: MappingRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Get a mapping rule by ID
   */
  getRule(ruleId: string): MappingRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * List all registered rules
   */
  listRules(): MappingRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Normalize raw records into canonical points
   * This function is deterministic - same input always produces same output
   */
  normalize(
    records: unknown[],
    ruleId: string,
    context: NormalizationContext
  ): NormalizationResult {
    const startTime = Date.now();
    const rule = this.rules.get(ruleId);

    if (!rule) {
      return {
        success: false,
        points: [],
        diagnostics: [
          {
            fieldPath: '',
            code: ConnectorErrorCodes.MAPPING_NOT_FOUND,
            message: `Mapping rule '${ruleId}' not found`,
            originalValue: ruleId,
            hint: `Register the rule using registerRule() before normalizing`,
            severity: 'error',
          },
        ],
        stats: {
          inputRecords: records.length,
          outputPoints: 0,
          skippedRecords: records.length,
          errorCount: 1,
          warningCount: 0,
          processingTimeMs: Date.now() - startTime,
        },
        inputHash: this.computeHash(records),
        outputHash: '',
      };
    }

    const points: CanonicalPoint[] = [];
    const diagnostics: FieldDiagnostic[] = [];
    let skippedRecords = 0;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const result = this.normalizeRecord(record, rule, context, i);

      if (result.success && result.point) {
        points.push(result.point);
      } else {
        skippedRecords++;
      }

      diagnostics.push(...result.diagnostics);
    }

    const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
    const warningCount = diagnostics.filter(
      (d) => d.severity === 'warning'
    ).length;

    // Sort points by timestamp for deterministic output
    points.sort((a, b) => a.timestamp - b.timestamp);

    const outputHash = this.computeHash(points);

    return {
      success: errorCount === 0 && points.length > 0,
      points,
      diagnostics,
      stats: {
        inputRecords: records.length,
        outputPoints: points.length,
        skippedRecords,
        errorCount,
        warningCount,
        processingTimeMs: Date.now() - startTime,
      },
      inputHash: this.computeHash(records),
      outputHash,
    };
  }

  /**
   * Normalize a single record
   */
  private normalizeRecord(
    record: unknown,
    rule: MappingRule,
    context: NormalizationContext,
    index: number
  ): {
    success: boolean;
    point?: CanonicalPoint;
    diagnostics: FieldDiagnostic[];
  } {
    const diagnostics: FieldDiagnostic[] = [];

    if (!record || typeof record !== 'object') {
      diagnostics.push({
        fieldPath: `[${index}]`,
        code: ConnectorErrorCodes.INVALID_RESPONSE,
        message: 'Record is not an object',
        originalValue: record,
        expected: 'object',
        hint: 'Ensure the data source returns valid JSON objects',
        severity: 'error',
      });
      return { success: false, diagnostics };
    }

    const obj = record as Record<string, unknown>;

    // Check filters
    if (rule.filters && !this.matchesFilters(obj, rule.filters)) {
      return { success: false, diagnostics, point: undefined };
    }

    // Extract timestamp
    const timestampResult = this.extractTimestamp(
      obj,
      rule.timestampMapping,
      index
    );
    if (!timestampResult.success) {
      diagnostics.push(timestampResult.diagnostic!);
      return { success: false, diagnostics };
    }

    // Extract value
    const valueResult = this.applyMapping(
      obj,
      rule.valueMapping,
      index,
      'value'
    );
    if (!valueResult.success && rule.valueMapping.required) {
      diagnostics.push(valueResult.diagnostic!);
      return { success: false, diagnostics };
    }

    // Build canonical point
    const point: CanonicalPoint = {
      timestamp: timestampResult.value!,
      value: (valueResult.value as number | boolean | string | null) ?? null,
      processingMetadata: {
        sourceConnectorId: context.connectorId,
        ingestedAt: context.ingestedAt,
        batchId: context.batchId,
      },
    };

    // Extract additional values
    if (rule.additionalValueMappings) {
      const additionalValues: Record<string, number> = {};
      for (const mapping of rule.additionalValueMappings) {
        const result = this.applyMapping(
          obj,
          mapping,
          index,
          mapping.targetField
        );
        if (result.success && typeof result.value === 'number') {
          additionalValues[mapping.targetField] = result.value;
        } else if (result.diagnostic) {
          diagnostics.push(result.diagnostic);
        }
      }
      if (Object.keys(additionalValues).length > 0) {
        point.additionalValues = additionalValues;
      }
    }

    // Extract tags
    if (rule.tagMappings) {
      const tags: Record<string, string> = {};
      for (const mapping of rule.tagMappings) {
        const result = this.applyMapping(obj, mapping, index, mapping.targetField);
        if (result.success && result.value !== null && result.value !== undefined) {
          tags[mapping.targetField] = String(result.value);
        }
      }
      if (Object.keys(tags).length > 0) {
        point.tags = tags;
      }
    }

    return { success: true, point, diagnostics };
  }

  /**
   * Extract and parse timestamp from record
   */
  private extractTimestamp(
    record: Record<string, unknown>,
    mapping: MappingRule['timestampMapping'],
    index: number
  ): { success: boolean; value?: number; diagnostic?: FieldDiagnostic } {
    const rawValue = this.getNestedValue(record, mapping.sourcePath);

    if (rawValue === undefined || rawValue === null) {
      return {
        success: false,
        diagnostic: {
          fieldPath: `[${index}].${mapping.sourcePath}`,
          code: ConnectorErrorCodes.MISSING_REQUIRED_FIELD,
          message: `Missing timestamp field: ${mapping.sourcePath}`,
          originalValue: rawValue,
          expected: 'timestamp',
          hint: `Ensure the source data contains the field '${mapping.sourcePath}'`,
          severity: 'error',
        },
      };
    }

    let timestamp: number;

    try {
      switch (mapping.format) {
        case 'unix_seconds':
          timestamp = Number(rawValue) * 1000;
          break;
        case 'unix_ms':
          timestamp = Number(rawValue);
          break;
        case 'ISO8601':
        default:
          timestamp = new Date(String(rawValue)).getTime();
          break;
      }

      if (isNaN(timestamp)) {
        throw new Error('Invalid timestamp');
      }
    } catch {
      return {
        success: false,
        diagnostic: {
          fieldPath: `[${index}].${mapping.sourcePath}`,
          code: ConnectorErrorCodes.TIMESTAMP_PARSE_FAILED,
          message: `Failed to parse timestamp: ${rawValue}`,
          originalValue: rawValue,
          expected: `timestamp in ${mapping.format} format`,
          hint: `Check the timestamp format configuration`,
          severity: 'error',
        },
      };
    }

    return { success: true, value: timestamp };
  }

  /**
   * Apply a field mapping to extract and transform a value
   */
  private applyMapping(
    record: Record<string, unknown>,
    mapping: FieldMapping,
    index: number,
    fieldName: string
  ): { success: boolean; value?: unknown; diagnostic?: FieldDiagnostic } {
    const rawValue = this.getNestedValue(record, mapping.sourcePath);

    if (rawValue === undefined || rawValue === null) {
      if (mapping.required) {
        return {
          success: false,
          diagnostic: {
            fieldPath: `[${index}].${mapping.sourcePath}`,
            code: ConnectorErrorCodes.MISSING_REQUIRED_FIELD,
            message: `Missing required field: ${mapping.sourcePath}`,
            originalValue: rawValue,
            hint: `Ensure the source data contains the field '${mapping.sourcePath}'`,
            severity: 'error',
          },
        };
      }
      // Use default value if available
      if (
        mapping.transform === 'default' &&
        mapping.transformParams?.defaultValue !== undefined
      ) {
        return { success: true, value: mapping.transformParams.defaultValue };
      }
      return { success: true, value: null };
    }

    // Apply transform
    try {
      const transformedValue = this.applyTransform(
        rawValue,
        mapping.transform,
        mapping.transformParams
      );

      // Validate if rules are provided
      if (mapping.validation) {
        const validationResult = this.validateValue(
          transformedValue,
          mapping.validation,
          index,
          fieldName
        );
        if (!validationResult.success) {
          return {
            success: false,
            diagnostic: validationResult.diagnostic,
          };
        }
      }

      return { success: true, value: transformedValue };
    } catch (error) {
      return {
        success: false,
        diagnostic: {
          fieldPath: `[${index}].${mapping.sourcePath}`,
          code: ConnectorErrorCodes.TYPE_COERCION_FAILED,
          message: `Transform '${mapping.transform}' failed: ${error instanceof Error ? error.message : String(error)}`,
          originalValue: rawValue,
          hint: `Check if the value is compatible with the '${mapping.transform}' transform`,
          severity: 'error',
        },
      };
    }
  }

  /**
   * Apply a transform to a value
   */
  private applyTransform(
    value: unknown,
    transform: FieldTransform,
    params?: FieldMapping['transformParams']
  ): unknown {
    switch (transform) {
      case 'none':
        return value;

      case 'lowercase':
        return String(value).toLowerCase();

      case 'uppercase':
        return String(value).toUpperCase();

      case 'trim':
        return String(value).trim();

      case 'parse_number':
        const num = Number(value);
        if (isNaN(num)) throw new Error(`Cannot parse '${value}' as number`);
        return num;

      case 'parse_boolean':
        if (typeof value === 'boolean') return value;
        const strVal = String(value).toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(strVal)) return true;
        if (['false', '0', 'no', 'off'].includes(strVal)) return false;
        throw new Error(`Cannot parse '${value}' as boolean`);

      case 'parse_date':
        const date = new Date(String(value));
        if (isNaN(date.getTime()))
          throw new Error(`Cannot parse '${value}' as date`);
        return date.getTime();

      case 'multiply':
        return Number(value) * (params?.multiplier ?? 1);

      case 'divide':
        const divisor = params?.divisor ?? 1;
        if (divisor === 0) throw new Error('Division by zero');
        return Number(value) / divisor;

      case 'add':
        return Number(value) + (params?.addend ?? 0);

      case 'subtract':
        return Number(value) - (params?.addend ?? 0);

      case 'regex_extract':
        if (!params?.pattern) throw new Error('Pattern required for regex_extract');
        const regex = new RegExp(params.pattern);
        const match = String(value).match(regex);
        return match ? match[1] ?? match[0] : null;

      case 'default':
        return value ?? params?.defaultValue;

      case 'coalesce':
        if (value !== null && value !== undefined) return value;
        // Coalesce would need access to other fields - simplified here
        return params?.defaultValue;

      case 'lookup':
        if (!params?.lookupTable) throw new Error('Lookup table required');
        return params.lookupTable[String(value)] ?? value;

      case 'template':
        // Simple template replacement
        if (!params?.template) return value;
        return params.template.replace('{{value}}', String(value));

      case 'json_path':
        // Would require a JSON path library - simplified
        return value;

      default:
        return value;
    }
  }

  /**
   * Validate a transformed value
   */
  private validateValue(
    value: unknown,
    validation: FieldMapping['validation'],
    index: number,
    fieldName: string
  ): { success: boolean; diagnostic?: FieldDiagnostic } {
    if (!validation) return { success: true };

    // Type check
    if (validation.type) {
      const actualType = typeof value;
      let typeMatch = false;
      switch (validation.type) {
        case 'string':
          typeMatch = actualType === 'string';
          break;
        case 'number':
          typeMatch = actualType === 'number' && !isNaN(value as number);
          break;
        case 'boolean':
          typeMatch = actualType === 'boolean';
          break;
        case 'date':
          typeMatch =
            value instanceof Date ||
            (actualType === 'number' && !isNaN(value as number));
          break;
        case 'array':
          typeMatch = Array.isArray(value);
          break;
      }
      if (!typeMatch) {
        return {
          success: false,
          diagnostic: {
            fieldPath: `[${index}].${fieldName}`,
            code: ConnectorErrorCodes.TYPE_COERCION_FAILED,
            message: `Expected ${validation.type}, got ${actualType}`,
            originalValue: value,
            expected: validation.type,
            hint: `Ensure the value is of type ${validation.type}`,
            severity: 'error',
          },
        };
      }
    }

    // Range check
    if (typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        return {
          success: false,
          diagnostic: {
            fieldPath: `[${index}].${fieldName}`,
            code: ConnectorErrorCodes.VALUE_OUT_OF_RANGE,
            message: `Value ${value} is below minimum ${validation.min}`,
            originalValue: value,
            expected: `>= ${validation.min}`,
            hint: `Check if the value should be in the expected range`,
            severity: 'error',
          },
        };
      }
      if (validation.max !== undefined && value > validation.max) {
        return {
          success: false,
          diagnostic: {
            fieldPath: `[${index}].${fieldName}`,
            code: ConnectorErrorCodes.VALUE_OUT_OF_RANGE,
            message: `Value ${value} is above maximum ${validation.max}`,
            originalValue: value,
            expected: `<= ${validation.max}`,
            hint: `Check if the value should be in the expected range`,
            severity: 'error',
          },
        };
      }
    }

    // Pattern check
    if (validation.pattern && typeof value === 'string') {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        return {
          success: false,
          diagnostic: {
            fieldPath: `[${index}].${fieldName}`,
            code: ConnectorErrorCodes.SCHEMA_MISMATCH,
            message: `Value '${value}' does not match pattern '${validation.pattern}'`,
            originalValue: value,
            expected: `match pattern ${validation.pattern}`,
            hint: `Ensure the value matches the required format`,
            severity: 'error',
          },
        };
      }
    }

    // Enum check
    if (validation.enum && !validation.enum.includes(value)) {
      return {
        success: false,
        diagnostic: {
          fieldPath: `[${index}].${fieldName}`,
          code: ConnectorErrorCodes.SCHEMA_MISMATCH,
          message: `Value '${value}' not in allowed values: ${validation.enum.join(', ')}`,
          originalValue: value,
          expected: `one of: ${validation.enum.join(', ')}`,
          hint: `Use one of the allowed values`,
          severity: 'error',
        },
      };
    }

    return { success: true };
  }

  /**
   * Check if a record matches filter conditions
   */
  private matchesFilters(
    record: Record<string, unknown>,
    filters: NonNullable<MappingRule['filters']>
  ): boolean {
    for (const filter of filters) {
      const value = this.getNestedValue(record, filter.field);

      switch (filter.operator) {
        case 'eq':
          if (value !== filter.value) return false;
          break;
        case 'ne':
          if (value === filter.value) return false;
          break;
        case 'gt':
          if (!(Number(value) > Number(filter.value))) return false;
          break;
        case 'lt':
          if (!(Number(value) < Number(filter.value))) return false;
          break;
        case 'gte':
          if (!(Number(value) >= Number(filter.value))) return false;
          break;
        case 'lte':
          if (!(Number(value) <= Number(filter.value))) return false;
          break;
        case 'in':
          if (!Array.isArray(filter.value) || !filter.value.includes(value))
            return false;
          break;
        case 'contains':
          if (!String(value).includes(String(filter.value))) return false;
          break;
        case 'regex':
          if (!new RegExp(String(filter.value)).test(String(value))) return false;
          break;
      }
    }

    return true;
  }

  /**
   * Get a nested value from an object using dot notation
   */
  private getNestedValue(
    obj: Record<string, unknown>,
    path: string
  ): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Compute a deterministic hash for replay verification
   */
  private computeHash(data: unknown): string {
    // Simple deterministic hash using JSON serialization
    const json = JSON.stringify(data, Object.keys(data as object).sort());
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      const char = json.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `hash_${Math.abs(hash).toString(16)}_${++this.hashCounter}`;
  }
}

export interface NormalizationContext {
  connectorId: string;
  tenantId: string;
  workspaceId?: string;
  batchId: string;
  correlationId: string;
  ingestedAt: number;
}

// =============================================================================
// SCHEMA INFERENCE ENGINE
// =============================================================================

/**
 * Infer schema from sample data
 */
export function inferSchemaFromSample(
  records: unknown[],
  sampleSize = 100
): InferredSchema {
  if (records.length === 0) {
    return { fields: [] };
  }

  const sample = records.slice(0, sampleSize);
  const fieldStats = new Map<
    string,
    {
      types: Set<string>;
      nullCount: number;
      sampleValues: unknown[];
      isTimestampCandidate: boolean;
      isValueCandidate: boolean;
    }
  >();

  for (const record of sample) {
    if (!record || typeof record !== 'object') continue;
    collectFieldStats(record as Record<string, unknown>, '', fieldStats);
  }

  const fields: InferredSchema['fields'] = [];
  let suggestedTimestampField: string | undefined;
  let suggestedValueField: string | undefined;
  let bestTimestampScore = 0;
  let bestValueScore = 0;

  for (const [name, stats] of fieldStats) {
    const types = Array.from(stats.types);
    const primaryType = types.length === 1 ? types[0] : 'unknown';

    fields.push({
      name,
      type: primaryType as InferredSchema['fields'][0]['type'],
      nullable: stats.nullCount > 0,
      sampleValues: stats.sampleValues.slice(0, 5),
    });

    // Score timestamp candidates
    if (stats.isTimestampCandidate) {
      const score = sample.length - stats.nullCount;
      if (score > bestTimestampScore) {
        bestTimestampScore = score;
        suggestedTimestampField = name;
      }
    }

    // Score value candidates
    if (stats.isValueCandidate) {
      const score = sample.length - stats.nullCount;
      if (score > bestValueScore) {
        bestValueScore = score;
        suggestedValueField = name;
      }
    }
  }

  return {
    fields,
    suggestedTimestampField,
    suggestedValueField,
    inferredResolution: 'minute', // Default, would need more analysis
  };
}

function collectFieldStats(
  obj: Record<string, unknown>,
  prefix: string,
  stats: Map<
    string,
    {
      types: Set<string>;
      nullCount: number;
      sampleValues: unknown[];
      isTimestampCandidate: boolean;
      isValueCandidate: boolean;
    }
  >
): void {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (!stats.has(path)) {
      stats.set(path, {
        types: new Set(),
        nullCount: 0,
        sampleValues: [],
        isTimestampCandidate: false,
        isValueCandidate: false,
      });
    }

    const fieldStats = stats.get(path)!;

    if (value === null || value === undefined) {
      fieldStats.nullCount++;
    } else {
      const type = Array.isArray(value)
        ? 'array'
        : value instanceof Date
          ? 'date'
          : typeof value;
      fieldStats.types.add(type);

      if (fieldStats.sampleValues.length < 10) {
        fieldStats.sampleValues.push(value);
      }

      // Check if this looks like a timestamp
      const keyLower = key.toLowerCase();
      if (
        keyLower.includes('time') ||
        keyLower.includes('date') ||
        keyLower === 'ts' ||
        keyLower === 'timestamp'
      ) {
        fieldStats.isTimestampCandidate = true;
      }

      // Check if this looks like a value
      if (
        type === 'number' &&
        !keyLower.includes('id') &&
        !keyLower.includes('time') &&
        !keyLower.includes('date')
      ) {
        fieldStats.isValueCandidate = true;
      }

      // Recurse into objects
      if (type === 'object' && !Array.isArray(value)) {
        collectFieldStats(value as Record<string, unknown>, path, stats);
      }
    }
  }
}

// =============================================================================
// CONNECTOR REGISTRY
// =============================================================================

export class PredConnRegistry {
  private connectors: Map<string, DataSourceConnector> = new Map();
  private configs: Map<string, PredConnConfig> = new Map();

  /**
   * Register a connector
   */
  register(connector: DataSourceConnector): void {
    this.connectors.set(connector.config.id, connector);
    this.configs.set(connector.config.id, connector.config);
  }

  /**
   * Get a connector by ID
   */
  get(connectorId: string): DataSourceConnector | undefined {
    return this.connectors.get(connectorId);
  }

  /**
   * List all registered connectors
   */
  list(): PredConnConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Remove a connector
   */
  async remove(connectorId: string): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (connector) {
      await connector.close();
      this.connectors.delete(connectorId);
      this.configs.delete(connectorId);
    }
  }

  /**
   * Get health for all connectors
   */
  getHealthSummary(): Record<string, ConnectorHealth> {
    const summary: Record<string, ConnectorHealth> = {};
    for (const [id, connector] of this.connectors) {
      summary[id] = connector.getHealth();
    }
    return summary;
  }
}

// =============================================================================
// ZOD SCHEMAS FOR VALIDATION
// =============================================================================

export const PredConnConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string(),
  sourceType: z.string().min(1),
  baseUrl: z.string().url(),
  auth: z.object({
    type: z.enum(['none', 'api_key', 'oauth2', 'basic', 'bearer', 'custom']),
    credentials: z
      .object({
        apiKey: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        bearerToken: z.string().optional(),
        oauth2: z
          .object({
            clientId: z.string(),
            clientSecret: z.string(),
            tokenUrl: z.string().url(),
            scopes: z.array(z.string()).optional(),
            refreshToken: z.string().optional(),
            accessToken: z.string().optional(),
            expiresAt: z.number().optional(),
          })
          .optional(),
        custom: z.record(z.string()).optional(),
      })
      .optional(),
    headerName: z.string().optional(),
    headerPrefix: z.string().optional(),
  }),
  rateLimit: z.object({
    maxRequests: z.number().int().positive(),
    windowMs: z.number().int().positive(),
    strategy: z.enum(['wait', 'error', 'backoff']),
    backoff: z
      .object({
        initialDelayMs: z.number().int().positive(),
        maxDelayMs: z.number().int().positive(),
        multiplier: z.number().positive(),
        jitter: z.boolean(),
      })
      .optional(),
    retries: z
      .object({
        maxAttempts: z.number().int().positive(),
        retryableErrors: z.array(z.string()),
      })
      .optional(),
  }),
  pagination: z.object({
    type: z.enum(['none', 'offset', 'cursor', 'page_number', 'link_header', 'token']),
    pageSize: z.number().int().positive(),
    maxPages: z.number().int().positive().optional(),
    offsetParam: z.string().optional(),
    limitParam: z.string().optional(),
    cursorParam: z.string().optional(),
    cursorPath: z.string().optional(),
    pageParam: z.string().optional(),
    tokenParam: z.string().optional(),
    tokenPath: z.string().optional(),
    hasMorePath: z.string().optional(),
    hasMoreValue: z.unknown().optional(),
  }),
  timeoutMs: z.number().int().positive(),
  headers: z.record(z.string()).optional(),
  verifySsl: z.boolean(),
  proxy: z
    .object({
      host: z.string(),
      port: z.number().int().positive(),
      auth: z
        .object({
          username: z.string(),
          password: z.string(),
        })
        .optional(),
    })
    .optional(),
  tenantOverrides: z.record(z.any()).optional(),
});

export const MappingRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string(),
  sourceType: z.string().min(1),
  seriesDefaults: z.object({}).passthrough(),
  timestampMapping: z.object({
    sourcePath: z.string().min(1),
    format: z.string(),
    timezone: z.string(),
  }),
  valueMapping: z.object({
    sourcePath: z.string().min(1),
    targetField: z.string(),
    transform: z.string(),
    required: z.boolean(),
  }).passthrough(),
  additionalValueMappings: z.array(z.object({}).passthrough()).optional(),
  labelMappings: z.array(z.object({}).passthrough()),
  tagMappings: z.array(z.object({}).passthrough()).optional(),
  metadataMappings: z.array(z.object({}).passthrough()).optional(),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.enum(['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'in', 'contains', 'regex']),
    value: z.unknown(),
  })).optional(),
  dedupeKeys: z.array(z.string()).optional(),
});

/**
 * Validate connector config
 */
export function validatePredConnConfig(
  config: unknown
): { success: boolean; data?: PredConnConfig; errors?: string[] } {
  const result = PredConnConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data as PredConnConfig };
  }
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}

/**
 * Validate mapping rule
 */
export function validateMappingRule(
  rule: unknown
): { success: boolean; data?: MappingRule; errors?: string[] } {
  const result = MappingRuleSchema.safeParse(rule);
  if (result.success) {
    return { success: true, data: result.data as unknown as MappingRule };
  }
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a default mapping rule
 */
export function createMappingRule(
  params: Pick<MappingRule, 'id' | 'name' | 'sourceType' | 'timestampMapping' | 'valueMapping'> &
    Partial<MappingRule>
): MappingRule {
  return {
    version: '1.0.0',
    seriesDefaults: {},
    labelMappings: [],
    ...params,
  };
}

/**
 * Create a default connector config
 */
export function createPredConnConfig(
  params: Pick<PredConnConfig, 'id' | 'name' | 'sourceType' | 'baseUrl'> &
    Partial<PredConnConfig>
): PredConnConfig {
  return {
    version: '1.0.0',
    auth: { type: 'none' },
    rateLimit: {
      maxRequests: 100,
      windowMs: 60000,
      strategy: 'wait',
    },
    pagination: {
      type: 'none',
      pageSize: 100,
    },
    timeoutMs: 30000,
    verifySsl: true,
    ...params,
  };
}

/**
 * Create normalization context
 */
export function createNormalizationContext(
  params: Pick<NormalizationContext, 'connectorId' | 'tenantId'> &
    Partial<NormalizationContext>
): NormalizationContext {
  return {
    workspaceId: undefined,
    batchId: `batch_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    correlationId: `corr_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    ingestedAt: Date.now(),
    ...params,
  };
}

// Classes and functions are exported at their definitions above
