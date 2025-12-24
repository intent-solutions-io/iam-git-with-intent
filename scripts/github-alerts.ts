#!/usr/bin/env node
/**
 * GitHub Alerting Library
 *
 * Reusable alerting functions for GitHub Actions workflows.
 * Posts comments, creates issues, and updates discussions.
 */

import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

// ============================================================================
// Types
// ============================================================================

export interface AlertConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface IssueCommentAlert {
  issueNumber: number;
  body: string;
  reaction?: '+1' | '-1' | 'laugh' | 'hooray' | 'confused' | 'heart' | 'rocket' | 'eyes';
}

export interface PRCommentAlert {
  prNumber: number;
  body: string;
  commitId?: string; // For review comments
  path?: string; // File path for inline comments
  line?: number; // Line number for inline comments
}

export interface NewIssueAlert {
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
}

export interface DiscussionAlert {
  categoryId: string;
  title: string;
  body: string;
}

export interface WorkflowStatus {
  success: boolean;
  duration_ms: number;
  cost_usd?: number;
  errors?: string[];
  warnings?: string[];
}

// ============================================================================
// GitHub Alerting Class
// ============================================================================

export class GitHubAlerts {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(config: AlertConfig) {
    this.octokit = new Octokit({ auth: config.token });
    this.owner = config.owner;
    this.repo = config.repo;
  }

  /**
   * Post a comment to an issue
   */
  async postIssueComment(alert: IssueCommentAlert): Promise<number> {
    const { data } = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: alert.issueNumber,
      body: alert.body,
    });

    // Add reaction if specified
    if (alert.reaction) {
      await this.octokit.reactions.createForIssueComment({
        owner: this.owner,
        repo: this.repo,
        comment_id: data.id,
        content: alert.reaction,
      });
    }

    return data.id;
  }

  /**
   * Post a comment to a PR
   */
  async postPRComment(alert: PRCommentAlert): Promise<number> {
    // If inline comment (with path and line), use review comment
    if (alert.path && alert.line && alert.commitId) {
      const { data } = await this.octokit.pulls.createReviewComment({
        owner: this.owner,
        repo: this.repo,
        pull_number: alert.prNumber,
        commit_id: alert.commitId,
        path: alert.path,
        line: alert.line,
        body: alert.body,
      });
      return data.id;
    }

    // Otherwise, use regular issue comment (PRs are issues)
    const { data } = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: alert.prNumber,
      body: alert.body,
    });

    return data.id;
  }

  /**
   * Create a new issue for alerting
   */
  async createIssue(alert: NewIssueAlert): Promise<number> {
    const { data } = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title: alert.title,
      body: alert.body,
      labels: alert.labels,
      assignees: alert.assignees,
    });

    return data.number;
  }

  /**
   * Post to a GitHub Discussion
   */
  async postDiscussion(alert: DiscussionAlert): Promise<string> {
    // GitHub Discussions require GraphQL API
    const mutation = `
      mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
        createDiscussion(input: {
          repositoryId: $repositoryId,
          categoryId: $categoryId,
          title: $title,
          body: $body
        }) {
          discussion {
            id
            url
          }
        }
      }
    `;

    // Get repository ID first
    const { data: repo } = await this.octokit.repos.get({
      owner: this.owner,
      repo: this.repo,
    });

    const result = await this.octokit.graphql(mutation, {
      repositoryId: repo.node_id,
      categoryId: alert.categoryId,
      title: alert.title,
      body: alert.body,
    });

    return (result as any).createDiscussion.discussion.id;
  }

  /**
   * Format workflow status as markdown
   */
  formatWorkflowStatus(status: WorkflowStatus, workflowName: string): string {
    const icon = status.success ? '✅' : '❌';
    const statusText = status.success ? 'Success' : 'Failed';

    let markdown = `## ${icon} ${workflowName} - ${statusText}\n\n`;
    markdown += `**Duration:** ${(status.duration_ms / 1000).toFixed(2)}s\n`;

    if (status.cost_usd !== undefined) {
      markdown += `**Cost:** $${status.cost_usd.toFixed(4)}\n`;
    }

    if (status.errors && status.errors.length > 0) {
      markdown += `\n### Errors\n`;
      status.errors.forEach(err => {
        markdown += `- ❌ ${err}\n`;
      });
    }

    if (status.warnings && status.warnings.length > 0) {
      markdown += `\n### Warnings\n`;
      status.warnings.forEach(warn => {
        markdown += `- ⚠️ ${warn}\n`;
      });
    }

    markdown += `\n---\n*Generated by GitHub Actions*\n`;

    return markdown;
  }

  /**
   * Post success alert to issue
   */
  async alertSuccess(issueNumber: number, message: string, details?: Record<string, any>): Promise<number> {
    let body = `## ✅ Success\n\n${message}\n`;

    if (details) {
      body += `\n### Details\n`;
      for (const [key, value] of Object.entries(details)) {
        body += `- **${key}**: ${value}\n`;
      }
    }

    return this.postIssueComment({ issueNumber, body, reaction: 'hooray' });
  }

  /**
   * Post failure alert to issue
   */
  async alertFailure(issueNumber: number, message: string, error?: string): Promise<number> {
    let body = `## ❌ Failure\n\n${message}\n`;

    if (error) {
      body += `\n### Error\n\`\`\`\n${error}\n\`\`\`\n`;
    }

    body += `\n---\n*Please review the logs for more details.*\n`;

    return this.postIssueComment({ issueNumber, body, reaction: 'confused' });
  }

  /**
   * Post budget warning
   */
  async alertBudgetWarning(threshold: number, current: number, projected: number): Promise<number> {
    const percentUsed = (current / threshold) * 100;

    const body = `## ⚠️ Budget Warning\n\n` +
      `**Current Spend:** $${current.toFixed(2)} (${percentUsed.toFixed(1)}% of budget)\n` +
      `**Budget Threshold:** $${threshold.toFixed(2)}\n` +
      `**Projected Monthly:** $${projected.toFixed(2)}\n\n` +
      `Please review auto-fix usage to stay within budget.\n\n` +
      `### Actions to Consider\n` +
      `- Review recent high-cost fixes\n` +
      `- Adjust fix complexity thresholds\n` +
      `- Optimize AI model usage\n` +
      `- Consider batching fixes\n`;

    return this.createIssue({
      title: `[Alert] Budget Warning: ${percentUsed.toFixed(1)}% Used`,
      body,
      labels: ['alert', 'budget', 'auto-fix'],
    });
  }
}

// ============================================================================
// CLI Exports
// ============================================================================

export function createAlerter(token?: string, owner?: string, repo?: string): GitHubAlerts {
  const config: AlertConfig = {
    token: token || process.env.GITHUB_TOKEN || '',
    owner: owner || process.env.GITHUB_REPOSITORY_OWNER || '',
    repo: repo || (process.env.GITHUB_REPOSITORY || '').split('/')[1] || '',
  };

  if (!config.token) {
    throw new Error('GITHUB_TOKEN is required');
  }

  if (!config.owner || !config.repo) {
    throw new Error('Repository owner and name are required');
  }

  return new GitHubAlerts(config);
}

// CLI mode
if (require.main === module) {
  const alerter = createAlerter();
  console.log('GitHub Alerts initialized for:', process.env.GITHUB_REPOSITORY);
}
