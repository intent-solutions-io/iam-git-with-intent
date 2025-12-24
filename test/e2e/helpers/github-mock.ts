/**
 * GitHub API Mock Server for E2E Testing
 *
 * Provides a mock GitHub API server for testing integrations without
 * hitting the real GitHub API. Includes:
 * - Common GitHub API responses (issues, PRs, repos)
 * - Webhook event simulation
 * - Configurable responses
 * - Request history tracking
 */

import { vi } from 'vitest';

/**
 * GitHub Issue fixture
 */
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  user: {
    login: string;
    id: number;
  };
  labels: Array<{ name: string; color: string }>;
  created_at: string;
  updated_at: string;
  html_url: string;
  repository_url: string;
}

/**
 * GitHub Pull Request fixture
 */
export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  user: {
    login: string;
    id: number;
  };
  head: {
    ref: string;
    sha: string;
    repo: {
      name: string;
      owner: { login: string };
    };
  };
  base: {
    ref: string;
    sha: string;
    repo: {
      name: string;
      owner: { login: string };
    };
  };
  mergeable: boolean | null;
  mergeable_state: string;
  merged: boolean;
  created_at: string;
  updated_at: string;
  html_url: string;
  diff_url: string;
  patch_url: string;
}

/**
 * GitHub Repository fixture
 */
export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    id: number;
  };
  private: boolean;
  description: string;
  default_branch: string;
  html_url: string;
  clone_url: string;
  created_at: string;
  updated_at: string;
}

/**
 * GitHub Webhook Event
 */
export interface GitHubWebhookEvent {
  action: string;
  issue?: GitHubIssue;
  pull_request?: GitHubPullRequest;
  repository: GitHubRepository;
  sender: {
    login: string;
    id: number;
  };
}

/**
 * Mock GitHub API server
 */
export class GitHubMock {
  private issues: Map<string, GitHubIssue> = new Map();
  private pullRequests: Map<string, GitHubPullRequest> = new Map();
  private repositories: Map<string, GitHubRepository> = new Map();
  private requestHistory: Array<{ method: string; path: string; body?: unknown }> = [];

  /**
   * Add an issue fixture
   */
  addIssue(owner: string, repo: string, issue: Partial<GitHubIssue>): GitHubIssue {
    const fullIssue: GitHubIssue = {
      id: issue.id ?? Math.floor(Math.random() * 1000000),
      number: issue.number ?? 1,
      title: issue.title ?? 'Test Issue',
      body: issue.body ?? 'Test issue body',
      state: issue.state ?? 'open',
      user: issue.user ?? { login: 'testuser', id: 123 },
      labels: issue.labels ?? [],
      created_at: issue.created_at ?? new Date().toISOString(),
      updated_at: issue.updated_at ?? new Date().toISOString(),
      html_url: issue.html_url ?? `https://github.com/${owner}/${repo}/issues/${issue.number}`,
      repository_url: issue.repository_url ?? `https://api.github.com/repos/${owner}/${repo}`,
    };

    const key = `${owner}/${repo}#${fullIssue.number}`;
    this.issues.set(key, fullIssue);
    return fullIssue;
  }

  /**
   * Add a pull request fixture
   */
  addPullRequest(owner: string, repo: string, pr: Partial<GitHubPullRequest>): GitHubPullRequest {
    const fullPr: GitHubPullRequest = {
      id: pr.id ?? Math.floor(Math.random() * 1000000),
      number: pr.number ?? 1,
      title: pr.title ?? 'Test PR',
      body: pr.body ?? 'Test PR body',
      state: pr.state ?? 'open',
      user: pr.user ?? { login: 'testuser', id: 123 },
      head: pr.head ?? {
        ref: 'feature-branch',
        sha: 'abc123',
        repo: {
          name: repo,
          owner: { login: owner },
        },
      },
      base: pr.base ?? {
        ref: 'main',
        sha: 'def456',
        repo: {
          name: repo,
          owner: { login: owner },
        },
      },
      mergeable: pr.mergeable ?? true,
      mergeable_state: pr.mergeable_state ?? 'clean',
      merged: pr.merged ?? false,
      created_at: pr.created_at ?? new Date().toISOString(),
      updated_at: pr.updated_at ?? new Date().toISOString(),
      html_url: pr.html_url ?? `https://github.com/${owner}/${repo}/pull/${pr.number}`,
      diff_url: pr.diff_url ?? `https://github.com/${owner}/${repo}/pull/${pr.number}.diff`,
      patch_url: pr.patch_url ?? `https://github.com/${owner}/${repo}/pull/${pr.number}.patch`,
    };

    const key = `${owner}/${repo}#${fullPr.number}`;
    this.pullRequests.set(key, fullPr);
    return fullPr;
  }

  /**
   * Add a repository fixture
   */
  addRepository(owner: string, repo: string, repository: Partial<GitHubRepository>): GitHubRepository {
    const fullRepo: GitHubRepository = {
      id: repository.id ?? Math.floor(Math.random() * 1000000),
      name: repo,
      full_name: `${owner}/${repo}`,
      owner: repository.owner ?? { login: owner, id: 123 },
      private: repository.private ?? false,
      description: repository.description ?? 'Test repository',
      default_branch: repository.default_branch ?? 'main',
      html_url: repository.html_url ?? `https://github.com/${owner}/${repo}`,
      clone_url: repository.clone_url ?? `https://github.com/${owner}/${repo}.git`,
      created_at: repository.created_at ?? new Date().toISOString(),
      updated_at: repository.updated_at ?? new Date().toISOString(),
    };

    const key = `${owner}/${repo}`;
    this.repositories.set(key, fullRepo);
    return fullRepo;
  }

  /**
   * Get an issue by key
   */
  getIssue(owner: string, repo: string, number: number): GitHubIssue | undefined {
    return this.issues.get(`${owner}/${repo}#${number}`);
  }

  /**
   * Get a pull request by key
   */
  getPullRequest(owner: string, repo: string, number: number): GitHubPullRequest | undefined {
    return this.pullRequests.get(`${owner}/${repo}#${number}`);
  }

  /**
   * Get a repository by key
   */
  getRepository(owner: string, repo: string): GitHubRepository | undefined {
    return this.repositories.get(`${owner}/${repo}`);
  }

  /**
   * Create webhook event payload
   */
  createWebhookEvent(
    type: 'issues' | 'pull_request',
    action: string,
    owner: string,
    repo: string,
    number: number
  ): GitHubWebhookEvent | null {
    const repository = this.getRepository(owner, repo);
    if (!repository) {
      return null;
    }

    const event: GitHubWebhookEvent = {
      action,
      repository,
      sender: { login: 'testuser', id: 123 },
    };

    if (type === 'issues') {
      const issue = this.getIssue(owner, repo, number);
      if (issue) {
        event.issue = issue;
      }
    } else if (type === 'pull_request') {
      const pr = this.getPullRequest(owner, repo, number);
      if (pr) {
        event.pull_request = pr;
      }
    }

    return event;
  }

  /**
   * Track a request
   */
  trackRequest(method: string, path: string, body?: unknown): void {
    this.requestHistory.push({ method, path, body });
  }

  /**
   * Get request history
   */
  getRequestHistory(): Array<{ method: string; path: string; body?: unknown }> {
    return [...this.requestHistory];
  }

  /**
   * Clear all fixtures and history
   */
  reset(): void {
    this.issues.clear();
    this.pullRequests.clear();
    this.repositories.clear();
    this.requestHistory = [];
  }

  /**
   * Get request count
   */
  getRequestCount(): number {
    return this.requestHistory.length;
  }

  /**
   * Find requests matching pattern
   */
  findRequests(pattern: { method?: string; path?: string }): Array<{ method: string; path: string; body?: unknown }> {
    return this.requestHistory.filter((req) => {
      if (pattern.method && req.method !== pattern.method) {
        return false;
      }
      if (pattern.path && !req.path.includes(pattern.path)) {
        return false;
      }
      return true;
    });
  }
}

/**
 * Create a GitHub mock instance
 */
export function createGitHubMock(): GitHubMock {
  return new GitHubMock();
}

/**
 * Mock GitHub API client
 *
 * Use this to mock the @gwi/integrations GitHub client
 */
export function mockGitHubClient(mock: GitHubMock) {
  return {
    getIssue: vi.fn((owner: string, repo: string, number: number) => {
      mock.trackRequest('GET', `/repos/${owner}/${repo}/issues/${number}`);
      return Promise.resolve(mock.getIssue(owner, repo, number));
    }),

    getPullRequest: vi.fn((owner: string, repo: string, number: number) => {
      mock.trackRequest('GET', `/repos/${owner}/${repo}/pulls/${number}`);
      return Promise.resolve(mock.getPullRequest(owner, repo, number));
    }),

    getRepository: vi.fn((owner: string, repo: string) => {
      mock.trackRequest('GET', `/repos/${owner}/${repo}`);
      return Promise.resolve(mock.getRepository(owner, repo));
    }),

    createIssueComment: vi.fn((owner: string, repo: string, number: number, body: string) => {
      mock.trackRequest('POST', `/repos/${owner}/${repo}/issues/${number}/comments`, { body });
      return Promise.resolve({ id: Math.floor(Math.random() * 1000000), body });
    }),

    updateIssue: vi.fn((owner: string, repo: string, number: number, update: unknown) => {
      mock.trackRequest('PATCH', `/repos/${owner}/${repo}/issues/${number}`, update);
      const issue = mock.getIssue(owner, repo, number);
      if (issue) {
        return Promise.resolve({ ...issue, ...update });
      }
      return Promise.resolve(null);
    }),

    updatePullRequest: vi.fn((owner: string, repo: string, number: number, update: unknown) => {
      mock.trackRequest('PATCH', `/repos/${owner}/${repo}/pulls/${number}`, update);
      const pr = mock.getPullRequest(owner, repo, number);
      if (pr) {
        return Promise.resolve({ ...pr, ...update });
      }
      return Promise.resolve(null);
    }),
  };
}

/**
 * Common test scenarios
 */
export const scenarios = {
  /**
   * Create a simple bug fix issue
   */
  bugFixIssue(owner = 'testorg', repo = 'testrepo'): { mock: GitHubMock; issue: GitHubIssue; repository: GitHubRepository } {
    const mock = createGitHubMock();
    const repository = mock.addRepository(owner, repo, {});
    const issue = mock.addIssue(owner, repo, {
      number: 1,
      title: 'Fix: Button click not working',
      body: 'The submit button does not respond to clicks. Need to add event handler.',
      labels: [{ name: 'bug', color: 'd73a4a' }],
    });
    return { mock, issue, repository };
  },

  /**
   * Create a feature request issue
   */
  featureIssue(owner = 'testorg', repo = 'testrepo'): { mock: GitHubMock; issue: GitHubIssue; repository: GitHubRepository } {
    const mock = createGitHubMock();
    const repository = mock.addRepository(owner, repo, {});
    const issue = mock.addIssue(owner, repo, {
      number: 2,
      title: 'Add dark mode support',
      body: 'Users have requested dark mode. Implement theme toggle in settings.',
      labels: [{ name: 'enhancement', color: 'a2eeef' }],
    });
    return { mock, issue, repository };
  },

  /**
   * Create a PR with conflicts
   */
  conflictingPR(owner = 'testorg', repo = 'testrepo'): { mock: GitHubMock; pr: GitHubPullRequest; repository: GitHubRepository } {
    const mock = createGitHubMock();
    const repository = mock.addRepository(owner, repo, {});
    const pr = mock.addPullRequest(owner, repo, {
      number: 3,
      title: 'Update dependencies',
      body: 'Bump package versions',
      mergeable: false,
      mergeable_state: 'dirty',
      head: { ref: 'update-deps', sha: 'abc123', repo: { name: repo, owner: { login: owner } } },
      base: { ref: 'main', sha: 'def456', repo: { name: repo, owner: { login: owner } } },
    });
    return { mock, pr, repository };
  },

  /**
   * Create a clean PR ready to merge
   */
  cleanPR(owner = 'testorg', repo = 'testrepo'): { mock: GitHubMock; pr: GitHubPullRequest; repository: GitHubRepository } {
    const mock = createGitHubMock();
    const repository = mock.addRepository(owner, repo, {});
    const pr = mock.addPullRequest(owner, repo, {
      number: 4,
      title: 'Add new feature',
      body: 'Implements new feature as requested',
      mergeable: true,
      mergeable_state: 'clean',
      head: { ref: 'feature', sha: 'ghi789', repo: { name: repo, owner: { login: owner } } },
      base: { ref: 'main', sha: 'jkl012', repo: { name: repo, owner: { login: owner } } },
    });
    return { mock, pr, repository };
  },
};
