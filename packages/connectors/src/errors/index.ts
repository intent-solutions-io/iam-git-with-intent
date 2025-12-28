/**
 * Base error for all connector-related errors
 */
export class ConnectorError extends Error {
  constructor(
    message: string,
    public readonly connector: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'ConnectorError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Authentication errors (invalid credentials, expired tokens, etc.)
 */
export class AuthenticationError extends ConnectorError {
  constructor(message: string, connector: string, context?: Record<string, any>) {
    super(message, connector, context);
    this.name = 'AuthenticationError';
  }
}

/**
 * Rate limit errors (too many requests)
 */
export class RateLimitError extends ConnectorError {
  constructor(
    message: string,
    connector: string,
    public readonly retryAfter: number,
    context?: Record<string, any>
  ) {
    super(message, connector, context);
    this.name = 'RateLimitError';
  }
}

/**
 * Network errors (timeouts, connection failures, etc.)
 */
export class NetworkError extends ConnectorError {
  constructor(
    message: string,
    connector: string,
    public readonly statusCode?: number,
    context?: Record<string, any>
  ) {
    super(message, connector, context);
    this.name = 'NetworkError';
  }
}

/**
 * Validation errors (invalid data, schema mismatches, etc.)
 */
export class ValidationError extends ConnectorError {
  constructor(
    message: string,
    connector: string,
    public readonly validationErrors: Array<{
      field: string;
      message: string;
    }>,
    context?: Record<string, any>
  ) {
    super(message, connector, context);
    this.name = 'ValidationError';
  }
}
