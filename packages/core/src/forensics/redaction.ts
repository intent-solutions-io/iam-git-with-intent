/**
 * Phase 27: Redaction Service
 *
 * Applies redaction rules to data before storage in forensic bundles.
 * Prevents secrets, API keys, and PII from being persisted.
 */

import type { RedactionConfig, RedactionRule } from './types.js';

// =============================================================================
// Default Redaction Rules
// =============================================================================

/**
 * Built-in redaction patterns
 */
export const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  // API Keys
  {
    field: 'api_key',
    pattern: '(sk-[a-zA-Z0-9]{32,})',
    replacement: '[REDACTED:OPENAI_KEY]',
    enabled: true,
    description: 'OpenAI API keys',
  },
  {
    field: 'api_key',
    pattern: '(sk-ant-[a-zA-Z0-9-]{32,})',
    replacement: '[REDACTED:ANTHROPIC_KEY]',
    enabled: true,
    description: 'Anthropic API keys',
  },
  {
    field: 'api_key',
    pattern: '(AIza[a-zA-Z0-9_-]{35})',
    replacement: '[REDACTED:GOOGLE_KEY]',
    enabled: true,
    description: 'Google API keys',
  },
  {
    field: 'api_key',
    pattern: '(ghp_[a-zA-Z0-9]{36})',
    replacement: '[REDACTED:GITHUB_PAT]',
    enabled: true,
    description: 'GitHub Personal Access Tokens',
  },
  {
    field: 'api_key',
    pattern: '(gho_[a-zA-Z0-9]{36})',
    replacement: '[REDACTED:GITHUB_OAUTH]',
    enabled: true,
    description: 'GitHub OAuth tokens',
  },
  {
    field: 'api_key',
    pattern: '(ghs_[a-zA-Z0-9]{36})',
    replacement: '[REDACTED:GITHUB_APP]',
    enabled: true,
    description: 'GitHub App tokens',
  },
  {
    field: 'api_key',
    pattern: '(ghr_[a-zA-Z0-9]{36})',
    replacement: '[REDACTED:GITHUB_REFRESH]',
    enabled: true,
    description: 'GitHub refresh tokens',
  },
  {
    field: 'api_key',
    pattern: '(xox[baprs]-[a-zA-Z0-9-]{10,})',
    replacement: '[REDACTED:SLACK_TOKEN]',
    enabled: true,
    description: 'Slack tokens',
  },

  // Secrets
  {
    field: 'secret',
    pattern: '(-----BEGIN [A-Z ]+ PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]+ PRIVATE KEY-----)',
    replacement: '[REDACTED:PRIVATE_KEY]',
    enabled: true,
    description: 'PEM-encoded private keys',
  },
  {
    field: 'secret',
    pattern: '(AKIA[0-9A-Z]{16})',
    replacement: '[REDACTED:AWS_ACCESS_KEY]',
    enabled: true,
    description: 'AWS Access Key IDs',
  },
  {
    field: 'password',
    pattern: '(["\']?password["\']?\\s*[:=]\\s*["\']?)([^"\'\\s]+)(["\']?)',
    replacement: '$1[REDACTED:PASSWORD]$3',
    enabled: true,
    description: 'Password values in config',
  },
  {
    field: 'token',
    pattern: '(Bearer\\s+)([a-zA-Z0-9._-]+)',
    replacement: '$1[REDACTED:BEARER_TOKEN]',
    enabled: true,
    description: 'Bearer tokens in headers',
  },
  {
    field: 'credential',
    pattern: '(Basic\\s+)([a-zA-Z0-9+/=]+)',
    replacement: '$1[REDACTED:BASIC_AUTH]',
    enabled: true,
    description: 'Basic auth credentials',
  },

  // PII (disabled by default)
  {
    field: 'pii_email',
    pattern: '([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
    replacement: '[REDACTED:EMAIL]',
    enabled: false,
    description: 'Email addresses',
  },
  {
    field: 'pii_phone',
    pattern: '(\\+?1?[-.]?\\(?\\d{3}\\)?[-.]?\\d{3}[-.]?\\d{4})',
    replacement: '[REDACTED:PHONE]',
    enabled: false,
    description: 'US phone numbers',
  },
  {
    field: 'pii_ssn',
    pattern: '(\\d{3}-\\d{2}-\\d{4})',
    replacement: '[REDACTED:SSN]',
    enabled: false,
    description: 'Social Security Numbers',
  },

  // Environment variables
  {
    field: 'env_var',
    pattern: '([A-Z_]+_API_KEY=)([^\\s]+)',
    replacement: '$1[REDACTED:API_KEY]',
    enabled: true,
    description: 'API key environment variables',
  },
  {
    field: 'env_var',
    pattern: '([A-Z_]+_SECRET=)([^\\s]+)',
    replacement: '$1[REDACTED:SECRET]',
    enabled: true,
    description: 'Secret environment variables',
  },
  {
    field: 'env_var',
    pattern: '([A-Z_]+_TOKEN=)([^\\s]+)',
    replacement: '$1[REDACTED:TOKEN]',
    enabled: true,
    description: 'Token environment variables',
  },
  {
    field: 'env_var',
    pattern: '([A-Z_]+_PASSWORD=)([^\\s]+)',
    replacement: '$1[REDACTED:PASSWORD]',
    enabled: true,
    description: 'Password environment variables',
  },
];

/**
 * Default redaction config
 */
export const DEFAULT_REDACTION_CONFIG: RedactionConfig = {
  rules: DEFAULT_REDACTION_RULES,
  redactApiKeys: true,
  redactSecrets: true,
  redactPii: false,
  redactEnvVars: true,
  customPatterns: [],
};

// =============================================================================
// Redaction Service
// =============================================================================

/**
 * Redaction result
 */
export interface RedactionResult {
  /** Redacted data */
  data: unknown;
  /** Number of redactions applied */
  redactionCount: number;
  /** Fields that were redacted */
  fieldsRedacted: string[];
  /** Paths where redactions occurred */
  redactionPaths: string[];
}

/**
 * Redaction statistics
 */
export interface RedactionStats {
  totalRedactions: number;
  byField: Record<string, number>;
  byPath: string[];
}

/**
 * Redaction service for applying redaction rules to data
 */
export class RedactionService {
  private config: RedactionConfig;
  private compiledRules: Map<string, { rule: RedactionRule; regex: RegExp }[]>;

  constructor(config?: Partial<RedactionConfig>) {
    this.config = { ...DEFAULT_REDACTION_CONFIG, ...config };
    this.compiledRules = this.compileRules();
  }

  /**
   * Compile redaction rules into regex patterns
   */
  private compileRules(): Map<string, { rule: RedactionRule; regex: RegExp }[]> {
    const compiled = new Map<string, { rule: RedactionRule; regex: RegExp }[]>();

    for (const rule of this.config.rules) {
      if (!rule.enabled) continue;

      // Skip based on config flags
      if (rule.field === 'api_key' && !this.config.redactApiKeys) continue;
      if (
        ['secret', 'password', 'token', 'credential', 'private_key'].includes(rule.field) &&
        !this.config.redactSecrets
      ) {
        continue;
      }
      if (rule.field.startsWith('pii_') && !this.config.redactPii) continue;
      if (rule.field === 'env_var' && !this.config.redactEnvVars) continue;

      try {
        const regex = new RegExp(rule.pattern, 'g');
        const existing = compiled.get(rule.field) || [];
        existing.push({ rule, regex });
        compiled.set(rule.field, existing);
      } catch {
        // Invalid regex, skip this rule
        console.warn(`Invalid redaction pattern: ${rule.pattern}`);
      }
    }

    // Add custom patterns
    for (const pattern of this.config.customPatterns) {
      try {
        const regex = new RegExp(pattern, 'g');
        const rule: RedactionRule = {
          field: 'custom',
          pattern,
          replacement: '[REDACTED:CUSTOM]',
          enabled: true,
        };
        const existing = compiled.get('custom') || [];
        existing.push({ rule, regex });
        compiled.set('custom', existing);
      } catch {
        console.warn(`Invalid custom pattern: ${pattern}`);
      }
    }

    return compiled;
  }

  /**
   * Redact a string value
   */
  redactString(value: string): { result: string; count: number; fields: Set<string> } {
    let result = value;
    let count = 0;
    const fields = new Set<string>();

    for (const [field, rules] of this.compiledRules) {
      for (const { rule, regex } of rules) {
        // Reset regex state
        regex.lastIndex = 0;
        const matches = result.match(regex);
        if (matches) {
          count += matches.length;
          fields.add(field);
          result = result.replace(regex, rule.replacement);
        }
      }
    }

    return { result, count, fields };
  }

  /**
   * Redact data recursively
   */
  redact(data: unknown, path = ''): RedactionResult {
    let redactionCount = 0;
    const fieldsRedacted = new Set<string>();
    const redactionPaths: string[] = [];

    const redactValue = (value: unknown, currentPath: string): unknown => {
      if (value === null || value === undefined) {
        return value;
      }

      if (typeof value === 'string') {
        const { result, count, fields } = this.redactString(value);
        if (count > 0) {
          redactionCount += count;
          redactionPaths.push(currentPath);
          for (const field of fields) {
            fieldsRedacted.add(field);
          }
        }
        return result;
      }

      if (Array.isArray(value)) {
        return value.map((item, index) => redactValue(item, `${currentPath}[${index}]`));
      }

      if (typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
          const newPath = currentPath ? `${currentPath}.${key}` : key;
          result[key] = redactValue(val, newPath);
        }
        return result;
      }

      // Primitives (numbers, booleans) pass through unchanged
      return value;
    };

    const redactedData = redactValue(data, path);

    return {
      data: redactedData,
      redactionCount,
      fieldsRedacted: Array.from(fieldsRedacted),
      redactionPaths,
    };
  }

  /**
   * Check if a value contains secrets (without modifying)
   */
  containsSecrets(data: unknown): boolean {
    const { redactionCount } = this.redact(data);
    return redactionCount > 0;
  }

  /**
   * Get config
   */
  getConfig(): RedactionConfig {
    return { ...this.config };
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<RedactionConfig>): void {
    this.config = { ...this.config, ...config };
    this.compiledRules = this.compileRules();
  }

  /**
   * Add a custom pattern
   */
  addCustomPattern(pattern: string): void {
    this.config.customPatterns.push(pattern);
    this.compiledRules = this.compileRules();
  }

  /**
   * Enable/disable PII redaction
   */
  setPiiRedaction(enabled: boolean): void {
    this.config.redactPii = enabled;
    this.compiledRules = this.compileRules();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let _redactionService: RedactionService | null = null;

/**
 * Get the singleton redaction service
 */
export function getRedactionService(config?: Partial<RedactionConfig>): RedactionService {
  if (!_redactionService) {
    _redactionService = new RedactionService(config);
  }
  return _redactionService;
}

/**
 * Reset the singleton (for testing)
 */
export function resetRedactionService(): void {
  _redactionService = null;
}
