/**
 * Contributor Analyzer
 *
 * Evaluates contributor reputation and history.
 * Phase 1: Basic structure with stubs
 * Phase 2: Full GitHub API integration
 */

import type { SlopAnalysisInput, AnalyzerResult, SlopSignal, ContributorContext } from '../types.js';

// Re-export for convenience
export type { ContributorContext } from '../types.js';

/**
 * Contributor signal weights
 */
const CONTRIBUTOR_SIGNALS = {
  firstTimeContributor: {
    weight: 15,
    description: 'First-time contributor to this repository',
  },
  noEngagement: {
    weight: 20,
    description: 'No prior issues, comments, or discussions in this repo',
  },
  burstSubmissions: {
    weight: 25,
    description: 'Multiple PRs submitted rapidly (>5 in 24h)',
  },
  newAccount: {
    weight: 15,
    description: 'Recently created account with limited activity',
  },
  crossRepoSpam: {
    weight: 30,
    description: 'Similar PR pattern detected across multiple repos',
  },
};

/**
 * Analyze contributor reputation
 *
 * Phase 1: Returns empty signals (no GitHub API calls)
 * Phase 2: Will fetch contributor data from GitHub
 */
export function analyzeContributor(
  _input: SlopAnalysisInput,
  context?: ContributorContext
): AnalyzerResult {
  const signals: SlopSignal[] = [];
  let totalWeight = 0;

  // Phase 1: Without context, we can't assess contributor
  // Return empty signals - will be implemented in Phase 2
  if (!context) {
    return { signals, totalWeight };
  }

  // First-time contributor
  if (context.isFirstTimeContributor) {
    signals.push({
      type: 'contributor',
      signal: 'first_time_contributor',
      weight: CONTRIBUTOR_SIGNALS.firstTimeContributor.weight,
      evidence: 'No previous PRs to this repository',
    });
    totalWeight += CONTRIBUTOR_SIGNALS.firstTimeContributor.weight;
  }

  // No prior engagement
  if (context.engagementCount === 0 && context.previousPRCount === 0) {
    signals.push({
      type: 'contributor',
      signal: 'no_engagement',
      weight: CONTRIBUTOR_SIGNALS.noEngagement.weight,
      evidence: 'No issues, comments, or discussions found',
    });
    totalWeight += CONTRIBUTOR_SIGNALS.noEngagement.weight;
  }

  // Burst submissions
  if (context.recentPRCount > 5) {
    signals.push({
      type: 'contributor',
      signal: 'burst_submissions',
      weight: CONTRIBUTOR_SIGNALS.burstSubmissions.weight,
      evidence: `${context.recentPRCount} PRs in the last 24 hours`,
    });
    totalWeight += CONTRIBUTOR_SIGNALS.burstSubmissions.weight;
  }

  // New account with limited activity
  if (context.accountAgeDays < 30 && context.repoCount < 3) {
    signals.push({
      type: 'contributor',
      signal: 'new_account',
      weight: CONTRIBUTOR_SIGNALS.newAccount.weight,
      evidence: `Account ${context.accountAgeDays} days old, ${context.repoCount} repos`,
    });
    totalWeight += CONTRIBUTOR_SIGNALS.newAccount.weight;
  }

  // Cross-repo spam detection
  if (context.crossRepoSimilarPRs > 3) {
    signals.push({
      type: 'contributor',
      signal: 'cross_repo_spam',
      weight: CONTRIBUTOR_SIGNALS.crossRepoSpam.weight,
      evidence: `${context.crossRepoSimilarPRs} similar PRs across different repos`,
    });
    totalWeight += CONTRIBUTOR_SIGNALS.crossRepoSpam.weight;
  }

  return { signals, totalWeight };
}

/**
 * Fetch contributor context from GitHub API
 *
 * Phase 2: To be implemented
 */
export async function fetchContributorContext(
  _contributor: string,
  _repoFullName: string
): Promise<ContributorContext | null> {
  // TODO: Phase 2 implementation
  // Will use GitHub GraphQL API to fetch:
  // - User's PR history to this repo
  // - User's issue/comment activity
  // - Account creation date
  // - Recent PR activity across repos
  return null;
}
