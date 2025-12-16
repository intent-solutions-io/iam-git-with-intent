/**
 * GitHub Integration for Git With Intent
 *
 * Provides client for interacting with GitHub PRs, issues, and repositories.
 * Uses Octokit under the hood.
 */

import { Octokit } from 'octokit';
import type { PRMetadata, ConflictInfo, ComplexityScore, IssueMetadata } from '@gwi/core';

/**
 * Extended PR info with fetched conflicts
 * PRMetadata has hasConflicts: boolean, but conflicts are stored separately
 * This type includes both for convenience when first fetching a PR
 */
export interface PRWithConflicts {
  metadata: PRMetadata;
  conflicts: ConflictInfo[];
}

/**
 * @deprecated Legacy type for backward compatibility - use PRWithConflicts
 *
 * This extended metadata type includes inline conflicts for legacy CLI code.
 * New code should use PRWithConflicts which separates metadata and conflicts.
 */
export interface LegacyPRMetadata extends PRMetadata {
  conflicts: ConflictInfo[];
}

/**
 * GitHub client configuration
 */
export interface GitHubClientConfig {
  token?: string;
  appId?: string;
  privateKey?: string;
}

/**
 * Parsed PR URL
 */
export interface ParsedPRUrl {
  owner: string;
  repo: string;
  number: number;
}

/**
 * Parsed Issue URL
 */
export interface ParsedIssueUrl {
  owner: string;
  repo: string;
  number: number;
  fullName: string;
}

/**
 * GitHub PR file
 */
export interface GitHubFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  contentsUrl: string;
}

/**
 * GitHub client for PR operations
 */
export class GitHubClient {
  private octokit: Octokit;

  constructor(config?: GitHubClientConfig) {
    const token = config?.token ?? process.env.GITHUB_TOKEN;

    if (!token) {
      throw new Error('GitHub token is required. Set GITHUB_TOKEN environment variable.');
    }

    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Parse a GitHub PR URL
   */
  static parsePRUrl(url: string): ParsedPRUrl {
    // Support both full URLs and short form
    const patterns = [
      // https://github.com/owner/repo/pull/123
      /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
      // owner/repo#123
      /^([^/]+)\/([^#]+)#(\d+)$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2],
          number: parseInt(match[3], 10),
        };
      }
    }

    throw new Error(`Invalid PR URL: ${url}`);
  }

  /**
   * Parse a GitHub Issue URL
   * Supports:
   * - https://github.com/owner/repo/issues/123
   * - github.com/owner/repo/issues/123
   * - owner/repo#123
   */
  static parseIssueUrl(url: string): ParsedIssueUrl {
    const patterns = [
      // https://github.com/owner/repo/issues/123
      /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/,
      // owner/repo#123
      /^([^/]+)\/([^#]+)#(\d+)$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const owner = match[1];
        const repo = match[2];
        return {
          owner,
          repo,
          number: parseInt(match[3], 10),
          fullName: `${owner}/${repo}`,
        };
      }
    }

    throw new Error(`Invalid Issue URL: ${url}`);
  }

  /**
   * Get PR metadata and conflicts
   *
   * Returns both the PRMetadata (for storage) and conflicts (for separate storage).
   * Conflicts are NOT part of PRMetadata - they're stored via PRStore.saveConflicts().
   */
  async getPR(url: string): Promise<PRWithConflicts> {
    const { owner, repo, number } = GitHubClient.parsePRUrl(url);

    const { data: pr } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: number,
    });

    const { data: files } = await this.octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: number,
    });

    // Map GitHub API files to our interface
    const mappedFiles: GitHubFile[] = files.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch,
      contentsUrl: f.contents_url,
    }));

    // Get merge status to check for conflicts
    const conflicts = await this.getConflicts(owner, repo, number, mappedFiles);
    const hasConflicts = conflicts.length > 0 || pr.mergeable === false || pr.mergeable_state === 'dirty';

    // Generate ID from URL
    const id = `gh-${owner}-${repo}-${number}`;

    const metadata: PRMetadata = {
      id,
      url,
      owner,
      repo,
      number,
      title: pr.title,
      body: pr.body ?? '',
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      author: pr.user?.login ?? 'unknown',
      state: pr.state === 'open' ? 'open' : pr.merged ? 'merged' : 'closed',
      mergeable: pr.mergeable,
      mergeableState: pr.mergeable_state,
      hasConflicts,
      filesChanged: mappedFiles.length,
      additions: mappedFiles.reduce((sum, f) => sum + f.additions, 0),
      deletions: mappedFiles.reduce((sum, f) => sum + f.deletions, 0),
      createdAt: new Date(pr.created_at),
      updatedAt: new Date(pr.updated_at),
      fetchedAt: new Date(),
    };

    return { metadata, conflicts };
  }

  /**
   * Get just PR metadata (convenience wrapper for backward compatibility)
   *
   * Use getPR() to also get conflicts.
   */
  async getPRMetadata(url: string): Promise<PRMetadata> {
    const { metadata } = await this.getPR(url);
    return metadata;
  }

  /**
   * @deprecated Get PR with inline conflicts (legacy format)
   *
   * This method returns the old format where conflicts are embedded in the PR object.
   * New code should use getPR() which returns { metadata, conflicts } separately.
   *
   * This exists for backward compatibility with CLI commands.
   */
  async getPRLegacy(url: string): Promise<LegacyPRMetadata> {
    const { metadata, conflicts } = await this.getPR(url);
    return { ...metadata, conflicts };
  }

  /**
   * Get conflict information for a PR
   */
  private async getConflicts(
    owner: string,
    repo: string,
    number: number,
    files: GitHubFile[]
  ): Promise<ConflictInfo[]> {
    const conflicts: ConflictInfo[] = [];

    // Check if PR is mergeable
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: number,
    });

    // If mergeable is false or null, there may be conflicts
    if (pr.mergeable === false || pr.mergeable_state === 'dirty') {
      // Try to get merge conflict details
      try {
        // Get the diff with conflict markers
        const { data: diff } = await this.octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: number,
          mediaType: {
            format: 'diff',
          },
        });

        // Parse diff for conflict markers
        const diffText = typeof diff === 'string' ? diff : '';

        for (const file of files) {
          // Check if this file has conflicts in the diff
          const fileSection = this.extractFileDiff(diffText, file.filename);
          if (fileSection && fileSection.includes('<<<<<<<')) {
            conflicts.push({
              file: file.filename,
              baseContent: '', // Would need to fetch from base branch
              oursContent: '', // Would need to fetch from head branch
              theirsContent: '', // Would need to fetch from base branch
              conflictMarkers: fileSection,
              complexity: this.estimateComplexity(fileSection),
            });
          }
        }

        // If we found no explicit conflicts but mergeable is false, add all modified files
        if (conflicts.length === 0) {
          for (const file of files.filter((f) => f.status === 'modified')) {
            conflicts.push({
              file: file.filename,
              baseContent: '',
              oursContent: '',
              theirsContent: '',
              conflictMarkers: file.patch ?? '',
              complexity: this.estimateComplexity(file.patch ?? ''),
            });
          }
        }
      } catch {
        // Fallback: mark all modified files as potential conflicts
        for (const file of files.filter((f) => f.status === 'modified')) {
          conflicts.push({
            file: file.filename,
            baseContent: '',
            oursContent: '',
            theirsContent: '',
            conflictMarkers: '',
            complexity: 5 as ComplexityScore, // Default medium complexity
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Extract diff section for a specific file
   */
  private extractFileDiff(fullDiff: string, filename: string): string | null {
    const filePattern = new RegExp(
      `diff --git a/${filename}.*?(?=diff --git|$)`,
      'gs'
    );
    const match = fullDiff.match(filePattern);
    return match ? match[0] : null;
  }

  /**
   * Estimate complexity from diff content
   */
  private estimateComplexity(content: string): ComplexityScore {
    let score = 1;

    // Size-based scoring
    if (content.length > 500) score += 1;
    if (content.length > 2000) score += 2;
    if (content.length > 5000) score += 2;

    // Conflict marker count
    const markerCount = (content.match(/<<<<<<</g) || []).length;
    score += Math.min(markerCount, 3);

    // Content-based scoring
    if (content.includes('function') || content.includes('class')) score += 1;
    if (content.includes('async') || content.includes('await')) score += 1;
    if (content.includes('import') && content.includes('export')) score += 1;

    return Math.min(10, Math.max(1, score)) as ComplexityScore;
  }

  /**
   * Post a comment on the PR
   */
  async postComment(url: string, body: string): Promise<void> {
    const { owner, repo, number } = GitHubClient.parsePRUrl(url);

    await this.octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body,
    });
  }

  /**
   * Get file content from a specific ref
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<string> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if ('content' in data && data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }

      throw new Error('Unexpected content format');
    } catch {
      return '';
    }
  }

  /**
   * Create a review on the PR
   */
  async createReview(
    url: string,
    body: string,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'
  ): Promise<void> {
    const { owner, repo, number } = GitHubClient.parsePRUrl(url);

    await this.octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: number,
      body,
      event,
    });
  }

  /**
   * Get GitHub Issue metadata
   *
   * Fetches issue details from GitHub API and returns IssueMetadata.
   * Supports full URLs (https://github.com/owner/repo/issues/123)
   * and shorthand format (owner/repo#123).
   */
  async getIssue(url: string): Promise<IssueMetadata> {
    const { owner, repo, number, fullName } = GitHubClient.parseIssueUrl(url);

    const { data: issue } = await this.octokit.rest.issues.get({
      owner,
      repo,
      issue_number: number,
    });

    // Extract labels as strings
    const labels = issue.labels
      .map((label) => (typeof label === 'string' ? label : label.name))
      .filter((name): name is string => !!name);

    // Extract assignee logins
    const assignees = (issue.assignees ?? [])
      .map((a) => a?.login)
      .filter((login): login is string => !!login);

    return {
      url: issue.html_url,
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      author: issue.user?.login ?? 'unknown',
      labels,
      assignees,
      milestone: issue.milestone?.title,
      repo: {
        owner,
        name: repo,
        fullName,
      },
      createdAt: new Date(issue.created_at),
      updatedAt: new Date(issue.updated_at),
    };
  }
}

/**
 * Create a GitHub client instance
 */
export function createGitHubClient(config?: GitHubClientConfig): GitHubClient {
  return new GitHubClient(config);
}
