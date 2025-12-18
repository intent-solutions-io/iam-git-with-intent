/**
 * Secrets Posture and Scanning
 *
 * Phase 24: Security & Compliance Hardening
 *
 * Enhanced secrets handling with:
 * - Comprehensive redaction patterns
 * - Secret scanning for code/logs
 * - Safe serialization utilities
 *
 * @module @gwi/core/security/secrets
 */

import { createLogger } from '../telemetry/index.js';

const logger = createLogger('secrets-scanner');

// =============================================================================
// Secret Patterns
// =============================================================================

/**
 * Known secret patterns with descriptions
 */
export const SECRET_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium';
  description: string;
}> = [
  // API Keys
  {
    name: 'anthropic_api_key',
    pattern: /sk-ant-[a-zA-Z0-9_-]{80,}/g,
    severity: 'critical',
    description: 'Anthropic API key',
  },
  {
    name: 'openai_api_key',
    pattern: /sk-[a-zA-Z0-9]{48,}/g,
    severity: 'critical',
    description: 'OpenAI API key',
  },
  {
    name: 'google_api_key',
    pattern: /AIza[a-zA-Z0-9_-]{35}/g,
    severity: 'critical',
    description: 'Google API key',
  },

  // GitHub
  {
    name: 'github_pat',
    pattern: /ghp_[a-zA-Z0-9]{36,}/g,
    severity: 'critical',
    description: 'GitHub Personal Access Token',
  },
  {
    name: 'github_oauth',
    pattern: /gho_[a-zA-Z0-9]{36,}/g,
    severity: 'critical',
    description: 'GitHub OAuth Token',
  },
  {
    name: 'github_app_token',
    pattern: /ghs_[a-zA-Z0-9]{36,}/g,
    severity: 'critical',
    description: 'GitHub App Installation Token',
  },
  {
    name: 'github_refresh_token',
    pattern: /ghr_[a-zA-Z0-9]{36,}/g,
    severity: 'critical',
    description: 'GitHub Refresh Token',
  },

  // Stripe
  {
    name: 'stripe_secret_key',
    pattern: /sk_live_[a-zA-Z0-9]{24,}/g,
    severity: 'critical',
    description: 'Stripe Live Secret Key',
  },
  {
    name: 'stripe_test_key',
    pattern: /sk_test_[a-zA-Z0-9]{24,}/g,
    severity: 'medium',
    description: 'Stripe Test Secret Key',
  },
  {
    name: 'stripe_webhook_secret',
    pattern: /whsec_[a-zA-Z0-9]{32,}/g,
    severity: 'high',
    description: 'Stripe Webhook Secret',
  },

  // Slack
  {
    name: 'slack_bot_token',
    pattern: /xoxb-[a-zA-Z0-9-]{50,}/g,
    severity: 'high',
    description: 'Slack Bot Token',
  },
  {
    name: 'slack_user_token',
    pattern: /xoxp-[a-zA-Z0-9-]{50,}/g,
    severity: 'high',
    description: 'Slack User Token',
  },
  {
    name: 'slack_webhook',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[a-zA-Z0-9]+/g,
    severity: 'high',
    description: 'Slack Webhook URL',
  },

  // AWS
  {
    name: 'aws_access_key',
    pattern: /AKIA[A-Z0-9]{16}/g,
    severity: 'critical',
    description: 'AWS Access Key ID',
  },
  {
    name: 'aws_secret_key',
    pattern: /[a-zA-Z0-9/+=]{40}(?![a-zA-Z0-9/+=])/g,
    severity: 'high',
    description: 'Potential AWS Secret Access Key',
  },

  // GCP
  {
    name: 'gcp_service_account',
    pattern: /"private_key":\s*"-----BEGIN [A-Z]+ PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'GCP Service Account Private Key',
  },
  {
    name: 'gcp_oauth_client_secret',
    pattern: /GOCSPX-[a-zA-Z0-9_-]{28}/g,
    severity: 'high',
    description: 'GCP OAuth Client Secret',
  },

  // Firebase
  {
    name: 'firebase_api_key',
    pattern: /AIza[a-zA-Z0-9_-]{35}/g,
    severity: 'high',
    description: 'Firebase API Key',
  },

  // Generic patterns
  {
    name: 'private_key_pem',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'Private Key (PEM format)',
  },
  {
    name: 'jwt_token',
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    severity: 'medium',
    description: 'JWT Token',
  },
  {
    name: 'base64_password',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]?[a-zA-Z0-9+/]{20,}={0,2}['"]?/gi,
    severity: 'high',
    description: 'Base64 encoded password',
  },

  // Database URLs with credentials
  {
    name: 'database_url',
    pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\s'"]+/gi,
    severity: 'critical',
    description: 'Database URL with credentials',
  },
];

/**
 * Keys that typically contain secrets
 */
export const SECRET_KEY_PATTERNS = [
  /secret/i,
  /password/i,
  /passwd/i,
  /token/i,
  /apikey/i,
  /api_key/i,
  /api-key/i,
  /credential/i,
  /private.?key/i,
  /auth/i,
  /bearer/i,
];

// =============================================================================
// Secret Scanning
// =============================================================================

/**
 * Result of a secret scan
 */
export interface SecretScanResult {
  /** Whether secrets were found */
  hasSecrets: boolean;
  /** List of findings */
  findings: SecretFinding[];
  /** Summary by severity */
  summary: {
    critical: number;
    high: number;
    medium: number;
    total: number;
  };
}

/**
 * Individual secret finding
 */
export interface SecretFinding {
  /** Pattern that matched */
  patternName: string;
  /** Description of the secret type */
  description: string;
  /** Severity level */
  severity: 'critical' | 'high' | 'medium';
  /** Line number (if applicable) */
  line?: number;
  /** Column offset (if applicable) */
  column?: number;
  /** Redacted preview of the match */
  preview: string;
}

/**
 * Scan text for potential secrets
 *
 * @param text - Text to scan
 * @param options - Scan options
 * @returns Scan results with findings
 */
export function scanForSecrets(
  text: string,
  options?: {
    /** Include line numbers in findings */
    includeLineNumbers?: boolean;
    /** Minimum severity to report */
    minSeverity?: 'critical' | 'high' | 'medium';
  }
): SecretScanResult {
  const findings: SecretFinding[] = [];
  const severityOrder = { critical: 0, high: 1, medium: 2 };
  const minSeverityLevel = severityOrder[options?.minSeverity ?? 'medium'];

  for (const { name, pattern, severity, description } of SECRET_PATTERNS) {
    if (severityOrder[severity] > minSeverityLevel) {
      continue;
    }

    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      const matchText = match[0];
      const startIndex = match.index;

      // Calculate line/column if requested
      let line: number | undefined;
      let column: number | undefined;
      if (options?.includeLineNumbers) {
        const beforeMatch = text.slice(0, startIndex);
        line = (beforeMatch.match(/\n/g) || []).length + 1;
        column = startIndex - beforeMatch.lastIndexOf('\n');
      }

      findings.push({
        patternName: name,
        description,
        severity,
        line,
        column,
        preview: redactSecret(matchText),
      });
    }
  }

  // Count by severity
  const summary = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    total: findings.length,
  };

  return {
    hasSecrets: findings.length > 0,
    findings,
    summary,
  };
}

/**
 * Scan an object's values for secrets
 *
 * @param obj - Object to scan
 * @param path - Current path (for recursion)
 * @returns Scan results
 */
export function scanObjectForSecrets(
  obj: unknown,
  path: string = ''
): SecretScanResult {
  const allFindings: SecretFinding[] = [];

  function scan(value: unknown, currentPath: string): void {
    if (typeof value === 'string') {
      const result = scanForSecrets(value);
      for (const finding of result.findings) {
        allFindings.push({
          ...finding,
          preview: `${currentPath}: ${finding.preview}`,
        });
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        scan(item, `${currentPath}[${index}]`);
      });
    } else if (value !== null && typeof value === 'object') {
      for (const [key, val] of Object.entries(value)) {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        scan(val, newPath);
      }
    }
  }

  scan(obj, path);

  const summary = {
    critical: allFindings.filter((f) => f.severity === 'critical').length,
    high: allFindings.filter((f) => f.severity === 'high').length,
    medium: allFindings.filter((f) => f.severity === 'medium').length,
    total: allFindings.length,
  };

  return {
    hasSecrets: allFindings.length > 0,
    findings: allFindings,
    summary,
  };
}

// =============================================================================
// Redaction
// =============================================================================

/**
 * Redact a secret value, showing only prefix/suffix
 *
 * @param secret - Secret value to redact
 * @param showChars - Number of chars to show at start/end (default: 4)
 * @returns Redacted string
 */
export function redactSecret(secret: string, showChars: number = 4): string {
  if (secret.length <= showChars * 2 + 4) {
    return '[REDACTED]';
  }

  const start = secret.slice(0, showChars);
  const end = secret.slice(-showChars);
  const middle = '*'.repeat(Math.min(8, secret.length - showChars * 2));

  return `${start}${middle}${end}`;
}

/**
 * Enhanced redaction for objects
 * Redacts values based on both key patterns and value patterns
 *
 * @param obj - Object to redact
 * @returns New object with secrets redacted
 */
export function redactObjectSecrets<T extends Record<string, unknown>>(
  obj: T
): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Check if key looks like a secret key
      const isSecretKey = SECRET_KEY_PATTERNS.some((p) => p.test(key));

      if (isSecretKey) {
        result[key] = '[REDACTED]';
        continue;
      }

      // Check if value matches secret patterns
      const scanResult = scanForSecrets(value);
      if (scanResult.hasSecrets) {
        // Redact the entire value if it contains secrets
        result[key] = redactSecret(value);
      } else {
        result[key] = value;
      }
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? redactObjectSecrets(item as Record<string, unknown>)
          : item
      );
    } else if (value !== null && typeof value === 'object') {
      result[key] = redactObjectSecrets(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Redact secrets from a string (for logs)
 *
 * @param text - Text to redact
 * @returns Text with secrets redacted
 */
export function redactStringSecrets(text: string): string {
  let result = text;

  for (const { pattern } of SECRET_PATTERNS) {
    // Reset regex lastIndex
    pattern.lastIndex = 0;

    result = result.replace(pattern, (match) => redactSecret(match));
  }

  return result;
}

// =============================================================================
// Secret Guardrail
// =============================================================================

/**
 * Secret guardrail error
 */
export class SecretLeakageError extends Error {
  constructor(
    message: string,
    public readonly findings: SecretFinding[]
  ) {
    super(message);
    this.name = 'SecretLeakageError';
  }
}

/**
 * Guardrail that throws if secrets are detected
 *
 * Use this before logging, storing, or transmitting data to ensure
 * no secrets are accidentally leaked.
 *
 * @param data - Data to check (string or object)
 * @param context - Description of where this check is happening
 * @throws SecretLeakageError if secrets are detected
 */
export function assertNoSecrets(
  data: string | Record<string, unknown>,
  context: string
): void {
  const result =
    typeof data === 'string' ? scanForSecrets(data) : scanObjectForSecrets(data);

  if (result.hasSecrets) {
    const criticalCount = result.summary.critical;
    const highCount = result.summary.high;

    logger.error('Secret leakage prevented', undefined, {
      context,
      findings: result.summary,
      patterns: result.findings.map((f) => f.patternName),
    });

    throw new SecretLeakageError(
      `Secret leakage prevented in ${context}: Found ${criticalCount} critical, ${highCount} high severity secrets`,
      result.findings
    );
  }
}

/**
 * Safe wrapper that redacts secrets before executing a callback
 *
 * @param data - Data to sanitize
 * @param callback - Function to call with sanitized data
 */
export async function withRedactedSecrets<T extends Record<string, unknown>, R>(
  data: T,
  callback: (sanitized: T) => R | Promise<R>
): Promise<R> {
  const sanitized = redactObjectSecrets(data);
  return callback(sanitized);
}

// =============================================================================
// Safe JSON Serialization
// =============================================================================

/**
 * Safely serialize an object to JSON with secrets redacted
 *
 * @param obj - Object to serialize
 * @param space - JSON.stringify space parameter
 * @returns JSON string with secrets redacted
 */
export function safeStringify(
  obj: unknown,
  space?: string | number
): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }

  if (typeof obj !== 'object') {
    // For primitive strings, redact directly
    if (typeof obj === 'string') {
      return JSON.stringify(redactStringSecrets(obj), null, space);
    }
    return JSON.stringify(obj, null, space);
  }

  // For objects, use deep redaction
  const redacted = redactObjectSecrets(obj as Record<string, unknown>);
  return JSON.stringify(redacted, null, space);
}

// =============================================================================
// Environment Variable Safety
// =============================================================================

/**
 * List of environment variables that should never be logged
 */
export const SENSITIVE_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_AI_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'MONGODB_URI',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'SLACK_TOKEN',
  'SLACK_WEBHOOK_URL',
];

/**
 * Get a safe copy of environment variables for logging
 *
 * @returns Environment variables with sensitive values redacted
 */
export function getSafeEnvVars(): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;

    // Check if this is a known sensitive var
    if (SENSITIVE_ENV_VARS.includes(key)) {
      result[key] = '[REDACTED]';
      continue;
    }

    // Check if key looks like a secret
    if (SECRET_KEY_PATTERNS.some((p) => p.test(key))) {
      result[key] = '[REDACTED]';
      continue;
    }

    // Check if value looks like a secret
    const scanResult = scanForSecrets(value);
    if (scanResult.hasSecrets) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = value;
    }
  }

  return result;
}
