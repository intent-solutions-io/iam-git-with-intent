/**
 * Slop Detector Module
 *
 * Detects AI-generated low-quality PRs ("AI slop") that
 * waste maintainer time with superficial changes.
 */

export { SlopDetectorAgent, createSlopDetectorAgent } from './slop-detector-agent.js';
export * from './types.js';
export { analyzeLinguistic, hasObviousComments } from './analyzers/linguistic.js';
export { analyzeContributor, fetchContributorContext, type ContributorContext } from './analyzers/contributor.js';
export { analyzeQuality } from './analyzers/quality.js';
