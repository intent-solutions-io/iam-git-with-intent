/**
 * Feature Extraction
 *
 * Extracts deterministic features from conflict metadata for scoring.
 */

import type { TriageFeatures, FileRiskClassification } from '../run-bundle/schemas/index.js';

// =============================================================================
// Input Types
// =============================================================================

/**
 * Conflict hunk information
 */
export interface ConflictHunk {
  startLine: number;
  endLine: number;
  oursLines: number;
  theirsLines: number;
}

/**
 * Per-file conflict information
 */
export interface FileConflict {
  path: string;
  hunks: ConflictHunk[];
  additions: number;
  deletions: number;
  hasConflictMarkers: boolean;
}

/**
 * Overall conflict metadata from GitHub/Git
 */
export interface ConflictMetadata {
  files: FileConflict[];
  baseBranch: string;
  headBranch: string;
  totalAdditions: number;
  totalDeletions: number;
}

// =============================================================================
// Path Risk Classification
// =============================================================================

/**
 * Patterns for file risk classification
 */
const PATH_PATTERNS: Record<FileRiskClassification, RegExp[]> = {
  secrets: [
    /\.env$/i,
    /\.env\.\w+$/i,
    /secrets?\.(json|ya?ml|toml)$/i,
    /credentials?\.(json|ya?ml|toml)$/i,
    /\.pem$/i,
    /\.key$/i,
    /api[_-]?keys?\.(json|ya?ml|toml)$/i,
  ],
  auth: [
    /auth/i,
    /login/i,
    /session/i,
    /oauth/i,
    /jwt/i,
    /token/i,
    /passport/i,
    /authentication/i,
    /authorization/i,
  ],
  financial: [
    /payment/i,
    /billing/i,
    /invoice/i,
    /stripe/i,
    /paypal/i,
    /checkout/i,
    /cart/i,
    /order/i,
    /price/i,
    /subscription/i,
  ],
  infrastructure: [
    /terraform/i,
    /\.tf$/i,
    /kubernetes/i,
    /k8s/i,
    /docker/i,
    /helm/i,
    /\.ya?ml$/i,
    /ansible/i,
    /cloudformation/i,
    /pulumi/i,
  ],
  config: [
    /config/i,
    /settings/i,
    /\.json$/i,
    /\.ya?ml$/i,
    /\.toml$/i,
    /\.ini$/i,
    /\.properties$/i,
    /webpack/i,
    /babel/i,
    /eslint/i,
    /prettier/i,
    /tsconfig/i,
  ],
  test: [
    /\.test\./i,
    /\.spec\./i,
    /__tests__/i,
    /test\//i,
    /tests\//i,
    /spec\//i,
    /fixtures?/i,
    /mocks?/i,
  ],
  safe: [], // Default fallback
};

/**
 * Classify a file path by risk level
 */
export function classifyFileRisk(path: string): FileRiskClassification {
  // Check in order of priority (highest risk first)
  const order: FileRiskClassification[] = [
    'secrets',
    'auth',
    'financial',
    'infrastructure',
    'config',
    'test',
    'safe',
  ];

  for (const classification of order) {
    const patterns = PATH_PATTERNS[classification];
    if (patterns.some(pattern => pattern.test(path))) {
      return classification;
    }
  }

  return 'safe';
}

// =============================================================================
// File Type Extraction
// =============================================================================

/**
 * Extract file extension from path
 */
export function getFileExtension(path: string): string {
  const match = path.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Get unique file types from a list of paths
 */
export function getFileTypes(paths: string[]): string[] {
  const types = new Set<string>();
  for (const path of paths) {
    const ext = getFileExtension(path);
    if (ext) {
      types.add(ext);
    }
  }
  return Array.from(types).sort();
}

// =============================================================================
// Feature Extraction
// =============================================================================

/**
 * Extract deterministic features from conflict metadata
 *
 * These features are used as input to the baseline scorer.
 * They are fully deterministic - same input always produces same output.
 */
export function extractFeatures(metadata: ConflictMetadata): TriageFeatures {
  const paths = metadata.files.map(f => f.path);

  // Calculate hunk statistics
  let totalHunks = 0;
  let maxHunksPerFile = 0;
  let totalConflictLines = 0;

  for (const file of metadata.files) {
    const fileHunks = file.hunks.length;
    totalHunks += fileHunks;
    maxHunksPerFile = Math.max(maxHunksPerFile, fileHunks);

    for (const hunk of file.hunks) {
      totalConflictLines += hunk.oursLines + hunk.theirsLines;
    }
  }

  const numFiles = metadata.files.length;
  const avgHunksPerFile = numFiles > 0 ? totalHunks / numFiles : 0;

  // Classify file risks
  const classifications = paths.map(classifyFileRisk);

  return {
    // Counts
    numFiles,
    numHunks: totalHunks,
    totalConflictLines,
    totalAdditions: metadata.totalAdditions,
    totalDeletions: metadata.totalDeletions,

    // File types
    fileTypes: getFileTypes(paths),
    hasSecurityFiles: classifications.includes('auth') || classifications.includes('secrets'),
    hasInfraFiles: classifications.includes('infrastructure'),
    hasConfigFiles: classifications.includes('config'),
    hasTestFiles: classifications.includes('test'),

    // Conflict patterns
    hasConflictMarkers: metadata.files.some(f => f.hasConflictMarkers),
    maxHunksPerFile,
    avgHunksPerFile: Math.round(avgHunksPerFile * 100) / 100, // Round to 2 decimal places
  };
}

/**
 * Create features from simple counts (for testing or minimal input)
 */
export function createMinimalFeatures(overrides: Partial<TriageFeatures> = {}): TriageFeatures {
  return {
    numFiles: 0,
    numHunks: 0,
    totalConflictLines: 0,
    totalAdditions: 0,
    totalDeletions: 0,
    fileTypes: [],
    hasSecurityFiles: false,
    hasInfraFiles: false,
    hasConfigFiles: false,
    hasTestFiles: false,
    hasConflictMarkers: false,
    maxHunksPerFile: 0,
    avgHunksPerFile: 0,
    ...overrides,
  };
}
