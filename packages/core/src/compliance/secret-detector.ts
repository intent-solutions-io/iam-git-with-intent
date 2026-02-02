/**
 * Secret Detection + Redaction Pipeline
 *
 * EPIC 025: Regulated Domain Controls
 * Task 025.5: Add secret detection + redaction pipeline
 *
 * Scans content for secrets, credentials, and sensitive data.
 * Redacts detected secrets before commit/push operations.
 *
 * Detection patterns:
 *   - API keys (AWS, GCP, Azure, GitHub, etc.)
 *   - Private keys (RSA, SSH, PGP)
 *   - Tokens (JWT, OAuth, Bearer)
 *   - Connection strings
 *   - Passwords in config files
 *   - High-entropy strings
 */

import { z } from 'zod';
import { createHash } from 'crypto';

// =============================================================================
// Secret Types
// =============================================================================

/**
 * Types of secrets we detect
 */
export const SecretType = z.enum([
  'aws_access_key',
  'aws_secret_key',
  'gcp_api_key',
  'gcp_service_account',
  'azure_key',
  'github_token',
  'github_app_key',
  'gitlab_token',
  'slack_token',
  'slack_webhook',
  'stripe_key',
  'twilio_key',
  'sendgrid_key',
  'mailgun_key',
  'npm_token',
  'pypi_token',
  'docker_auth',
  'jwt_token',
  'oauth_token',
  'bearer_token',
  'private_key_rsa',
  'private_key_ssh',
  'private_key_pgp',
  'certificate',
  'password',
  'connection_string',
  'database_url',
  'high_entropy',
  'generic_secret',
]);
export type SecretType = z.infer<typeof SecretType>;

/**
 * Secret finding (Compliance pipeline - distinct from security/secrets.ts)
 */
export const ComplianceSecretFinding = z.object({
  /** Type of secret */
  type: SecretType,
  /** Line number (1-indexed) */
  line: z.number().int().positive(),
  /** Column number (1-indexed) */
  column: z.number().int().positive(),
  /** Length of the secret */
  length: z.number().int().positive(),
  /** Redacted preview (e.g., "AKIA****1234") */
  redacted: z.string(),
  /** Confidence score (0-1) */
  confidence: z.number().min(0).max(1),
  /** Hash of the secret (for deduplication) */
  secretHash: z.string(),
  /** Context around the finding */
  context: z.string().optional(),
  /** Suggested remediation */
  remediation: z.string(),
});
export type ComplianceSecretFinding = z.infer<typeof ComplianceSecretFinding>;

/**
 * Scan result (Compliance pipeline - distinct from security/secrets.ts)
 */
export const ComplianceSecretScanResult = z.object({
  /** Whether secrets were found */
  hasSecrets: z.boolean(),
  /** Number of findings */
  count: z.number().int().nonnegative(),
  /** Individual findings */
  findings: z.array(ComplianceSecretFinding),
  /** Files scanned */
  filesScanned: z.number().int().nonnegative(),
  /** Scan duration in ms */
  durationMs: z.number().int().nonnegative(),
  /** Timestamp */
  timestamp: z.string().datetime(),
});
export type ComplianceSecretScanResult = z.infer<typeof ComplianceSecretScanResult>;

// =============================================================================
// Detection Patterns
// =============================================================================

interface SecretPattern {
  type: SecretType;
  pattern: RegExp;
  confidence: number;
  remediation: string;
}

/**
 * Secret detection patterns
 */
const SECRET_PATTERNS: SecretPattern[] = [
  // AWS
  {
    type: 'aws_access_key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    confidence: 0.95,
    remediation: 'Use AWS IAM roles or environment variables instead of hardcoded keys',
  },
  {
    type: 'aws_secret_key',
    pattern: /\b[A-Za-z0-9/+=]{40}\b/g,
    confidence: 0.7,
    remediation: 'Use AWS IAM roles or AWS Secrets Manager',
  },

  // GCP
  {
    type: 'gcp_api_key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    confidence: 0.95,
    remediation: 'Use GCP service accounts with Workload Identity Federation',
  },
  {
    type: 'gcp_service_account',
    pattern: /"type"\s*:\s*"service_account"/g,
    confidence: 0.9,
    remediation: 'Use Workload Identity Federation instead of service account keys',
  },

  // Azure
  {
    type: 'azure_key',
    pattern: /\b[A-Za-z0-9]{32,}/g,
    confidence: 0.5,
    remediation: 'Use Azure Managed Identity or Key Vault',
  },

  // GitHub
  {
    type: 'github_token',
    pattern: /\b(ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|ghu_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|ghr_[A-Za-z0-9]{36})\b/g,
    confidence: 0.99,
    remediation: 'Use GitHub Apps or fine-grained personal access tokens with minimal scope',
  },
  {
    type: 'github_app_key',
    pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/g,
    confidence: 0.95,
    remediation: 'Store private keys in Secret Manager, not in code',
  },

  // GitLab
  {
    type: 'gitlab_token',
    pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
    confidence: 0.99,
    remediation: 'Use GitLab CI/CD variables or project access tokens',
  },

  // Slack
  {
    type: 'slack_token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    confidence: 0.95,
    remediation: 'Use Slack app tokens stored in Secret Manager',
  },
  {
    type: 'slack_webhook',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g,
    confidence: 0.99,
    remediation: 'Store webhook URLs in Secret Manager',
  },

  // Stripe
  {
    type: 'stripe_key',
    pattern: /\b(sk_live_[A-Za-z0-9]{24,}|rk_live_[A-Za-z0-9]{24,})\b/g,
    confidence: 0.99,
    remediation: 'Use Stripe restricted API keys and store in Secret Manager',
  },

  // Twilio
  {
    type: 'twilio_key',
    pattern: /\bSK[A-Za-z0-9]{32}\b/g,
    confidence: 0.9,
    remediation: 'Use Twilio API keys stored in Secret Manager',
  },

  // SendGrid
  {
    type: 'sendgrid_key',
    pattern: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    confidence: 0.99,
    remediation: 'Use SendGrid API keys stored in Secret Manager',
  },

  // NPM
  {
    type: 'npm_token',
    pattern: /\bnpm_[A-Za-z0-9]{36}\b/g,
    confidence: 0.99,
    remediation: 'Use npm automation tokens with minimal scope',
  },

  // PyPI
  {
    type: 'pypi_token',
    pattern: /\bpypi-[A-Za-z0-9_-]{100,}\b/g,
    confidence: 0.99,
    remediation: 'Use PyPI API tokens with project scope only',
  },

  // JWT
  {
    type: 'jwt_token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    confidence: 0.9,
    remediation: 'Do not hardcode JWTs; generate them dynamically',
  },

  // Private Keys
  {
    type: 'private_key_rsa',
    pattern: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    confidence: 0.99,
    remediation: 'Store private keys in Secret Manager or use managed certificates',
  },
  {
    type: 'private_key_ssh',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
    confidence: 0.99,
    remediation: 'Use SSH certificate authentication or Secret Manager',
  },
  {
    type: 'private_key_pgp',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/g,
    confidence: 0.99,
    remediation: 'Store PGP keys in a secure key management system',
  },

  // Certificates
  {
    type: 'certificate',
    pattern: /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
    confidence: 0.8,
    remediation: 'Use managed certificates (GCP Certificate Manager, ACM)',
  },

  // Passwords
  {
    type: 'password',
    pattern: /(?:password|passwd|pwd|secret|token|api_key|apikey|auth|credential)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    confidence: 0.85,
    remediation: 'Use environment variables or Secret Manager',
  },

  // Connection strings
  {
    type: 'connection_string',
    pattern: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^\s'"]+/gi,
    confidence: 0.9,
    remediation: 'Use connection via Unix socket or Secret Manager',
  },
  {
    type: 'database_url',
    pattern: /DATABASE_URL\s*[:=]\s*['"][^'"]+['"]/gi,
    confidence: 0.9,
    remediation: 'Use Cloud SQL Proxy or Secret Manager',
  },
];

// =============================================================================
// Secret Detector
// =============================================================================

/**
 * Configuration for secret detection
 */
export interface SecretDetectorConfig {
  /** Minimum confidence to report (0-1) */
  minConfidence?: number;
  /** Enable high-entropy detection */
  detectHighEntropy?: boolean;
  /** Minimum entropy for high-entropy detection */
  minEntropy?: number;
  /** Paths/patterns to ignore */
  ignorePaths?: string[];
  /** File extensions to scan */
  scanExtensions?: string[];
  /** Custom patterns to add */
  customPatterns?: SecretPattern[];
}

const DEFAULT_CONFIG: Required<SecretDetectorConfig> = {
  minConfidence: 0.7,
  detectHighEntropy: true,
  minEntropy: 4.5,
  ignorePaths: ['node_modules', '.git', 'vendor', 'dist', 'build', '*.min.js', '*.map'],
  scanExtensions: ['.ts', '.js', '.tsx', '.jsx', '.json', '.yaml', '.yml', '.env', '.sh', '.py', '.go', '.rs'],
  customPatterns: [],
};

/**
 * Secret Detector - scans content for secrets and credentials
 */
export class SecretDetector {
  private config: Required<SecretDetectorConfig>;
  private patterns: SecretPattern[];

  constructor(config?: SecretDetectorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.patterns = [...SECRET_PATTERNS, ...this.config.customPatterns];
  }

  /**
   * Scan content for secrets
   */
  scanContent(content: string, _filename?: string): ComplianceSecretScanResult {
    const startTime = Date.now();
    const findings: ComplianceSecretFinding[] = [];
    const lines = content.split('\n');

    // Check each pattern
    for (const pattern of this.patterns) {
      // Reset regex lastIndex
      pattern.pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.pattern.exec(content)) !== null) {
        if (pattern.confidence < this.config.minConfidence) {
          continue;
        }

        // Calculate line and column
        const beforeMatch = content.substring(0, match.index);
        const linesBefore = beforeMatch.split('\n');
        const line = linesBefore.length;
        const column = linesBefore[linesBefore.length - 1].length + 1;

        // Create redacted version
        const secret = match[0];
        const redacted = this.redactSecret(secret);

        // Hash the secret for deduplication
        const secretHash = this.hashSecret(secret);

        // Get context
        const contextLine = lines[line - 1] || '';
        const context = this.getRedactedContext(contextLine, column, secret.length);

        findings.push({
          type: pattern.type,
          line,
          column,
          length: secret.length,
          redacted,
          confidence: pattern.confidence,
          secretHash,
          context,
          remediation: pattern.remediation,
        });
      }
    }

    // Check for high entropy strings
    if (this.config.detectHighEntropy) {
      const entropyFindings = this.detectHighEntropy(content, lines);
      findings.push(...entropyFindings);
    }

    // Deduplicate by hash
    const uniqueFindings = this.deduplicateFindings(findings);

    return {
      hasSecrets: uniqueFindings.length > 0,
      count: uniqueFindings.length,
      findings: uniqueFindings,
      filesScanned: 1,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Scan multiple files
   */
  scanFiles(files: Array<{ path: string; content: string }>): ComplianceSecretScanResult {
    const startTime = Date.now();
    const allFindings: ComplianceSecretFinding[] = [];

    for (const file of files) {
      // Skip ignored paths
      if (this.shouldIgnore(file.path)) {
        continue;
      }

      const result = this.scanContent(file.content, file.path);
      allFindings.push(
        ...result.findings.map((f) => ({
          ...f,
          context: `${file.path}:${f.line} - ${f.context}`,
        }))
      );
    }

    const uniqueFindings = this.deduplicateFindings(allFindings);

    return {
      hasSecrets: uniqueFindings.length > 0,
      count: uniqueFindings.length,
      findings: uniqueFindings,
      filesScanned: files.length,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Redact content (replace secrets with placeholders)
   */
  redactContent(content: string): { redacted: string; secretsFound: number } {
    let redacted = content;
    let secretsFound = 0;

    for (const pattern of this.patterns) {
      pattern.pattern.lastIndex = 0;
      redacted = redacted.replace(pattern.pattern, (match) => {
        secretsFound++;
        return this.redactSecret(match);
      });
    }

    return { redacted, secretsFound };
  }

  /**
   * Redact a single secret value
   */
  private redactSecret(secret: string): string {
    if (secret.length <= 8) {
      return '*'.repeat(secret.length);
    }

    const showChars = Math.min(4, Math.floor(secret.length / 4));
    const prefix = secret.substring(0, showChars);
    const suffix = secret.substring(secret.length - showChars);
    const stars = '*'.repeat(Math.min(8, secret.length - showChars * 2));

    return `${prefix}${stars}${suffix}`;
  }

  /**
   * Hash a secret for deduplication
   */
  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex').substring(0, 16);
  }

  /**
   * Get redacted context around a finding
   */
  private getRedactedContext(line: string, column: number, length: number): string {
    const before = line.substring(Math.max(0, column - 20), column - 1);
    const after = line.substring(column - 1 + length, column - 1 + length + 20);
    const redacted = this.redactSecret(line.substring(column - 1, column - 1 + length));
    return `${before}${redacted}${after}`.trim();
  }

  /**
   * Detect high-entropy strings
   */
  private detectHighEntropy(content: string, lines: string[]): ComplianceSecretFinding[] {
    const findings: ComplianceSecretFinding[] = [];

    // Look for strings that look like secrets
    const stringPattern = /['"][A-Za-z0-9+/=_-]{20,}['"]/g;
    let match: RegExpExecArray | null;

    while ((match = stringPattern.exec(content)) !== null) {
      const str = match[0].slice(1, -1); // Remove quotes
      const entropy = this.calculateEntropy(str);

      if (entropy >= this.config.minEntropy) {
        const beforeMatch = content.substring(0, match.index);
        const linesBefore = beforeMatch.split('\n');
        const line = linesBefore.length;
        const column = linesBefore[linesBefore.length - 1].length + 1;

        findings.push({
          type: 'high_entropy',
          line,
          column,
          length: str.length,
          redacted: this.redactSecret(str),
          confidence: Math.min(0.9, entropy / 6),
          secretHash: this.hashSecret(str),
          context: this.getRedactedContext(lines[line - 1] || '', column, str.length),
          remediation: 'Review this string - it has high entropy and may be a secret',
        });
      }
    }

    return findings;
  }

  /**
   * Calculate Shannon entropy of a string
   */
  private calculateEntropy(str: string): number {
    const freq: Record<string, number> = {};
    for (const char of str) {
      freq[char] = (freq[char] || 0) + 1;
    }

    let entropy = 0;
    const len = str.length;
    for (const count of Object.values(freq)) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Check if a path should be ignored
   */
  private shouldIgnore(path: string): boolean {
    return this.config.ignorePaths.some((ignore) => {
      if (ignore.includes('*')) {
        const regex = new RegExp(ignore.replace(/\*/g, '.*'));
        return regex.test(path);
      }
      return path.includes(ignore);
    });
  }

  /**
   * Deduplicate findings by hash
   */
  private deduplicateFindings(findings: ComplianceSecretFinding[]): ComplianceSecretFinding[] {
    const seen = new Set<string>();
    return findings.filter((f) => {
      const key = `${f.type}:${f.secretHash}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}

/**
 * Create a secret detector with default config
 */
export function createSecretDetector(config?: SecretDetectorConfig): SecretDetector {
  return new SecretDetector(config);
}

/**
 * Quick scan function for single content (Compliance pipeline)
 */
export function scanContentForSecrets(content: string): ComplianceSecretScanResult {
  const detector = new SecretDetector();
  return detector.scanContent(content);
}

/**
 * Quick redact function (Compliance pipeline)
 */
export function redactSecretsInContent(content: string): string {
  const detector = new SecretDetector();
  return detector.redactContent(content).redacted;
}
