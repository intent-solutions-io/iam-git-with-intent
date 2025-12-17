/**
 * GitHub Commenter Service
 *
 * Phase 11: Posts Intent Receipt comments back to GitHub.
 * Used for run status updates: started, awaiting approval, applied, failed.
 *
 * Intent Receipt format:
 * - Intent: What action was performed
 * - Change Summary: Brief description of changes
 * - Actor: Who/what triggered the action
 * - When: Timestamp
 * - Scope: Resources affected
 * - Policy/Approval: Policy status
 * - Evidence: Supporting context
 *
 * @module @gwi/github-webhook/services
 */

import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

/**
 * Intent Receipt for GitHub comments
 */
export interface IntentReceiptComment {
  intent: string;
  changeSummary: string;
  actor: string;
  when: string;
  scope: string;
  policyApproval: string;
  evidence: string;
}

/**
 * @deprecated Use IntentReceiptComment instead
 */
export interface Comment5W {
  who: string;
  what: string;
  when: string;
  where: string;
  why: string;
}

export type CommentType = 'run_started' | 'awaiting_approval' | 'changes_applied' | 'run_failed';

/**
 * GitHub comment poster
 */
export class GitHubCommenter {
  private appId: string;
  private privateKey: string;

  constructor() {
    this.appId = process.env.GITHUB_APP_ID || '';
    this.privateKey = process.env.GITHUB_APP_PRIVATE_KEY || '';
  }

  /**
   * Get authenticated Octokit client for installation
   */
  private async getOctokit(installationId: number): Promise<Octokit> {
    if (!this.appId || !this.privateKey) {
      throw new Error('GitHub App credentials not configured');
    }

    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.appId,
        privateKey: this.privateKey,
        installationId,
      },
    });
  }

  /**
   * Post a 5W comment to a PR or issue
   */
  async postComment(
    installationId: number,
    owner: string,
    repo: string,
    issueNumber: number,
    commentType: CommentType,
    details: Comment5W,
    additionalContext?: string
  ): Promise<{ commentId: number; url: string } | null> {
    try {
      const octokit = await this.getOctokit(installationId);
      const body = this.formatComment(commentType, details, additionalContext);

      const { data } = await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });

      console.log(JSON.stringify({
        type: 'github_comment_posted',
        commentType,
        owner,
        repo,
        issueNumber,
        commentId: data.id,
      }));

      return {
        commentId: data.id,
        url: data.html_url,
      };
    } catch (error) {
      console.error(JSON.stringify({
        type: 'github_comment_failed',
        commentType,
        owner,
        repo,
        issueNumber,
        error: error instanceof Error ? error.message : String(error),
      }));

      // Don't throw - commenting is best-effort
      return null;
    }
  }

  /**
   * Format an Intent Receipt comment for GitHub
   */
  private formatComment(
    commentType: CommentType,
    details: Comment5W,
    additionalContext?: string
  ): string {
    const titles: Record<CommentType, string> = {
      run_started: 'Intent Receipt: Run Started',
      awaiting_approval: 'Intent Receipt: Awaiting Approval',
      changes_applied: 'Intent Receipt: Changes Applied',
      run_failed: 'Intent Receipt: Run Failed',
    };

    const emojis: Record<CommentType, string> = {
      run_started: ':rocket:',
      awaiting_approval: ':hourglass:',
      changes_applied: ':white_check_mark:',
      run_failed: ':x:',
    };

    let body = `## ${emojis[commentType]} ${titles[commentType]}\n\n`;

    // Intent Receipt section (backward-compatible with 5W data)
    body += `| Field | Value |\n`;
    body += `|---|---|\n`;
    body += `| **Intent** | ${details.what} |\n`;
    body += `| **Actor** | ${details.who} |\n`;
    body += `| **When** | ${details.when} |\n`;
    body += `| **Scope** | ${details.where} |\n`;
    body += `| **Evidence** | ${details.why} |\n`;

    // Additional context if provided
    if (additionalContext) {
      body += `\n### Details\n\n${additionalContext}\n`;
    }

    // Footer
    body += `\n---\n`;
    body += `_Posted by [Git With Intent](https://gwi.dev) at ${new Date().toISOString()}_\n`;

    return body;
  }

  /**
   * Create Intent Receipt for run started
   */
  static runStarted(
    runId: string,
    runType: string,
    triggeredBy: string,
    prUrl: string
  ): Comment5W {
    return {
      who: triggeredBy || 'system',
      what: `Started ${runType} run`,
      when: new Date().toISOString(),
      where: prUrl,
      why: 'Triggered by webhook event',
    };
  }

  /**
   * Create Intent Receipt for awaiting approval
   */
  static awaitingApproval(
    runId: string,
    reason: string,
    dashboardUrl: string
  ): Comment5W {
    return {
      who: 'GWI System',
      what: 'Run paused awaiting human approval',
      when: new Date().toISOString(),
      where: dashboardUrl,
      why: reason,
    };
  }

  /**
   * Create Intent Receipt for changes applied
   */
  static changesApplied(
    runId: string,
    approvedBy: string,
    changesSummary: string
  ): Comment5W {
    return {
      who: approvedBy,
      what: 'Changes applied successfully',
      when: new Date().toISOString(),
      where: `Run ${runId}`,
      why: changesSummary || 'Approved by human reviewer',
    };
  }

  /**
   * Create Intent Receipt for run failed
   */
  static runFailed(
    runId: string,
    error: string,
    failedAt: string
  ): Comment5W {
    return {
      who: 'GWI System',
      what: 'Run failed',
      when: new Date().toISOString(),
      where: failedAt,
      why: error,
    };
  }
}

// Singleton instance
let commenterInstance: GitHubCommenter | null = null;

export function getGitHubCommenter(): GitHubCommenter {
  if (!commenterInstance) {
    commenterInstance = new GitHubCommenter();
  }
  return commenterInstance;
}
