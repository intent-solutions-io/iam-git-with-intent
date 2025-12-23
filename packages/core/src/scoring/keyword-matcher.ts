/**
 * Keyword Matching with Fuzzy Logic for Auto-Fix Grading
 *
 * Implements fuzzy matching to handle keyword variants (test/tests/testing)
 * and context-aware matching for negation detection.
 */

import fs from 'fs';
import path from 'path';

export interface KeywordWeight {
  keywords: string[];
  weight: number;
  category: 'security' | 'quality' | 'warning' | 'critical' | 'documentation';
  requiresContext?: boolean;
}

export interface KeywordWeights {
  version: string;
  metadata?: {
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
  };
  positive: KeywordWeight[];
  negative: KeywordWeight[];
  complexity?: KeywordWeight[];
  risk?: KeywordWeight[];
}

export interface MatchResult {
  keyword: string;
  weight: number;
  category: string;
  position: number;
  context?: string;
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Check if two strings are fuzzy equal (allowing minor typos)
 */
function isFuzzyMatch(str1: string, str2: string, threshold: number = 2): boolean {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  // Exact match
  if (s1 === s2) return true;

  // Contains match (for longer strings)
  if (s1.length > 5 && s2.length > 5) {
    if (s1.includes(s2) || s2.includes(s1)) return true;
  }

  // Fuzzy match with Levenshtein distance
  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  return distance <= threshold && distance / maxLength < 0.3;
}

/**
 * Extract context around a match position
 */
function extractContext(text: string, position: number, windowSize: number = 50): string {
  const start = Math.max(0, position - windowSize);
  const end = Math.min(text.length, position + windowSize);
  return text.substring(start, end).trim();
}

/**
 * Check for negation words in context
 */
function hasNegation(context: string): boolean {
  const negationWords = ['not', 'no', 'never', 'without', 'non'];
  const lowerContext = context.toLowerCase();
  return negationWords.some(neg => lowerContext.includes(neg));
}

export class KeywordMatcher {
  private weights: KeywordWeights;
  private allKeywords: Map<string, KeywordWeight>;

  constructor(weightsPath?: string) {
    // Load weights from file or use default path
    const dataPath = weightsPath || path.join(process.cwd(), 'data', 'keyword-weights.json');
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    this.weights = JSON.parse(rawData) as KeywordWeights;

    // Build keyword lookup map
    this.allKeywords = new Map();
    this.indexKeywords(this.weights.positive);
    this.indexKeywords(this.weights.negative);
    if (this.weights.complexity) this.indexKeywords(this.weights.complexity);
    if (this.weights.risk) this.indexKeywords(this.weights.risk);
  }

  private indexKeywords(keywordWeights: KeywordWeight[]): void {
    for (const kw of keywordWeights) {
      for (const keyword of kw.keywords) {
        this.allKeywords.set(keyword.toLowerCase(), kw);
      }
    }
  }

  /**
   * Match keywords in text and return scored results
   */
  public match(text: string, fuzzyThreshold: number = 2): MatchResult[] {
    const results: MatchResult[] = [];
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\s+/);

    // Match each keyword
    for (const [keyword, keywordWeight] of this.allKeywords.entries()) {
      for (let i = 0; i < words.length; i++) {
        const word = words[i];

        // Check for exact or fuzzy match
        if (isFuzzyMatch(word, keyword, fuzzyThreshold) || lowerText.includes(keyword)) {
          const position = lowerText.indexOf(keyword);
          const context = extractContext(text, position);

          // Skip if negated and context-aware matching is required
          if (keywordWeight.requiresContext && hasNegation(context)) {
            continue;
          }

          results.push({
            keyword,
            weight: keywordWeight.weight,
            category: keywordWeight.category,
            position,
            context: keywordWeight.requiresContext ? context : undefined
          });

          break; // Only match each keyword once per occurrence
        }
      }
    }

    return results;
  }

  /**
   * Calculate total score from matches
   */
  public calculateScore(matches: MatchResult[]): number {
    return matches.reduce((sum, match) => sum + match.weight, 0);
  }

  /**
   * Get matches grouped by category
   */
  public groupByCategory(matches: MatchResult[]): Map<string, MatchResult[]> {
    const grouped = new Map<string, MatchResult[]>();

    for (const match of matches) {
      const category = match.category;
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(match);
    }

    return grouped;
  }

  /**
   * Get keyword weights metadata
   */
  public getMetadata() {
    return {
      version: this.weights.version,
      metadata: this.weights.metadata,
      totalKeywords: this.allKeywords.size
    };
  }
}
