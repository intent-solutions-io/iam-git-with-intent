/**
 * Linguistic Analyzer
 *
 * Detects AI-generated text patterns in PR content.
 * Identifies templated phrases, over-politeness, and other
 * linguistic markers common in AI-generated PRs.
 */

import type { SlopAnalysisInput, AnalyzerResult, SlopSignal, LinguisticPattern } from '../types.js';

/**
 * Patterns that indicate AI-generated content
 */
const LINGUISTIC_PATTERNS: LinguisticPattern[] = [
  // Templated improvement phrases
  {
    name: 'templated_improvements',
    patterns: [
      /I've made some improvements/i,
      /I've improved the/i,
      /I've enhanced the/i,
      /I've refactored .* for better/i,
      /I've updated .* to improve/i,
      /This PR improves the overall/i,
      /for better maintainability/i,
      /for better readability/i,
      /for improved clarity/i,
    ],
    weight: 15,
    description: 'Uses templated AI improvement phrases',
  },
  // Over-politeness markers
  {
    name: 'over_politeness',
    patterns: [
      /I hope this helps!/i,
      /Let me know if you'd like/i,
      /Please let me know if you have any/i,
      /Feel free to reach out/i,
      /I'd be happy to make any/i,
      /I'm happy to discuss/i,
      /Please don't hesitate to/i,
      /Looking forward to your feedback/i,
      /Thank you for considering/i,
      /I appreciate your time/i,
    ],
    weight: 10,
    description: 'Excessive politeness typical of AI responses',
  },
  // Generic value-add claims
  {
    name: 'generic_value_claims',
    patterns: [
      /enhances the user experience/i,
      /improves code quality/i,
      /better code organization/i,
      /more maintainable code/i,
      /cleaner code structure/i,
      /improved performance/i,
      /better error handling/i,
      /enhanced functionality/i,
    ],
    weight: 10,
    description: 'Generic value claims without specifics',
  },
  // Unnecessary docstrings on obvious code
  {
    name: 'obvious_docstrings',
    patterns: [
      /\/\*\*\s*\*\s*(?:Returns|Gets|Sets)\s+the\s+\w+\s*\*\/\s*(?:get|set)/i,
      /@returns\s+\{[^}]+\}\s+(?:The|A)\s+\w+$/im,
      /\/\*\*\s*\*\s*Constructor\s*\*\//i,
      /\/\*\*\s*\*\s*Initializes?\s+(?:the|a)\s+new\s+instance/i,
      /\*\s*@param\s+\w+\s+(?:The|A)\s+\w+\s+(?:to use|value)?\s*$/im,
    ],
    weight: 20,
    description: 'Adding obvious documentation that restates the code',
  },
  // Perfect markdown in commit messages
  {
    name: 'perfect_markdown',
    patterns: [
      /##\s+Summary\s+##/i,
      /##\s+Changes\s+##/i,
      /\*\*Summary\*\*:/i,
      /\*\*Changes\*\*:/i,
      /### (?:What|Why|How)/i,
    ],
    weight: 5,
    description: 'Suspiciously perfect markdown formatting',
  },
  // AI assistant disclosure
  {
    name: 'ai_disclosure',
    patterns: [
      /generated (?:by|with|using) (?:AI|ChatGPT|Claude|GPT|Copilot)/i,
      /AI-assisted/i,
      /LLM-generated/i,
      /written (?:by|with) AI/i,
    ],
    weight: 25,
    description: 'Explicit mention of AI generation',
  },
  // Hallucinated references
  {
    name: 'hallucinated_refs',
    patterns: [
      /as (?:discussed|mentioned) in (?:the )?issue #\d+/i,
      /per (?:the )?discussion in/i,
      /following up on (?:the )?conversation/i,
      /as requested by @\w+/i,
    ],
    weight: 30,
    description: 'References that may be hallucinated',
  },
  // Filler phrases
  {
    name: 'filler_phrases',
    patterns: [
      /It(?:'s| is) worth noting that/i,
      /It should be noted that/i,
      /Additionally,\s+(?:I've|this)/i,
      /Furthermore,\s+(?:I've|this)/i,
      /Moreover,\s+(?:I've|this)/i,
      /In addition to the above/i,
    ],
    weight: 8,
    description: 'Filler phrases common in AI content',
  },
];

/**
 * Analyze PR content for linguistic AI patterns
 */
export function analyzeLinguistic(input: SlopAnalysisInput): AnalyzerResult {
  const signals: SlopSignal[] = [];
  let totalWeight = 0;

  // Combine all text content for analysis
  const textContent = [
    input.prTitle,
    input.prBody,
    ...(input.commitMessages || []),
  ].join('\n');

  // Check each pattern
  for (const pattern of LINGUISTIC_PATTERNS) {
    for (const regex of pattern.patterns) {
      const match = typeof regex === 'string'
        ? textContent.toLowerCase().includes(regex.toLowerCase())
        : regex.test(textContent);

      if (match) {
        // Extract evidence (the matched text)
        let evidence: string | undefined;
        if (typeof regex !== 'string') {
          const matchResult = textContent.match(regex);
          if (matchResult) {
            evidence = matchResult[0].slice(0, 100); // Limit evidence length
          }
        }

        signals.push({
          type: 'linguistic',
          signal: pattern.name,
          weight: pattern.weight,
          evidence,
        });
        totalWeight += pattern.weight;

        // Only count each pattern once (even if multiple regex match)
        break;
      }
    }
  }

  // Additional check: diff contains obvious comment additions
  const commentSignal = analyzeCommentAdditions(input.diff);
  if (commentSignal) {
    signals.push(commentSignal);
    totalWeight += commentSignal.weight;
  }

  return { signals, totalWeight };
}

/**
 * Check if diff primarily adds obvious comments
 */
function analyzeCommentAdditions(diff: string): SlopSignal | null {
  const lines = diff.split('\n');
  const addedLines = lines.filter(l => l.startsWith('+') && !l.startsWith('+++'));

  if (addedLines.length === 0) return null;

  // Count comment-only additions
  const commentPatterns = [
    /^\+\s*\/\//,          // JS/TS single-line
    /^\+\s*#/,             // Python/Shell
    /^\+\s*\/\*\*/,        // JSDoc start
    /^\+\s*\*/,            // JSDoc continuation
    /^\+\s*\*\//,          // JSDoc end
    /^\+\s*<!--/,          // HTML comment
    /^\+\s*"""/,           // Python docstring
  ];

  let commentLines = 0;
  for (const line of addedLines) {
    if (commentPatterns.some(p => p.test(line))) {
      commentLines++;
    }
  }

  const commentRatio = commentLines / addedLines.length;

  // If more than 70% of additions are comments, flag it
  if (commentRatio > 0.7 && addedLines.length > 5) {
    return {
      type: 'linguistic',
      signal: 'comment_heavy_pr',
      weight: 20,
      evidence: `${Math.round(commentRatio * 100)}% of additions are comments`,
    };
  }

  return null;
}

/**
 * Check for obvious/redundant comments in code
 */
export function hasObviousComments(code: string): boolean {
  const obviousPatterns = [
    // Increment comments
    /\/\/\s*increment\s+\w+/i,
    /\/\/\s*add\s+1\s+to/i,
    // Loop comments
    /\/\/\s*(?:loop|iterate)\s+(?:through|over)/i,
    // Variable comments
    /\/\/\s*(?:set|assign|store)\s+(?:the\s+)?(?:value|result)/i,
    // Return comments
    /\/\/\s*return\s+(?:the\s+)?(?:result|value)/i,
    // Initialize comments
    /\/\/\s*initialize/i,
    // Self-documenting function calls
    /\/\/\s*call\s+\w+\s*\(/i,
  ];

  return obviousPatterns.some(p => p.test(code));
}
