/**
 * Webhook Payload Fixtures
 *
 * Sample webhook payloads for testing webhook handling.
 *
 * @module @gwi/core/connectors/testing/fixtures
 */

/**
 * GitHub pull request opened webhook
 */
export const githubPROpened = {
  action: 'opened',
  number: 42,
  pull_request: {
    id: 1234567890,
    number: 42,
    state: 'open',
    title: 'Add authentication feature',
    body: 'This PR adds OAuth2 authentication support.',
    user: {
      login: 'developer',
      id: 5678,
    },
    head: {
      ref: 'feature-auth',
      sha: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
    },
    base: {
      ref: 'main',
      sha: '0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9',
    },
    created_at: '2025-12-27T10:00:00Z',
    updated_at: '2025-12-27T10:00:00Z',
    html_url: 'https://github.com/octocat/hello-world/pull/42',
  },
  repository: {
    id: 123456,
    name: 'hello-world',
    full_name: 'octocat/hello-world',
    owner: {
      login: 'octocat',
      id: 1,
    },
    html_url: 'https://github.com/octocat/hello-world',
  },
  sender: {
    login: 'developer',
    id: 5678,
  },
};

/**
 * GitHub pull request synchronize webhook (new commits pushed)
 */
export const githubPRSynchronize = {
  action: 'synchronize',
  number: 42,
  before: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
  after: 'b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0a1',
  pull_request: {
    id: 1234567890,
    number: 42,
    state: 'open',
    title: 'Add authentication feature',
    head: {
      ref: 'feature-auth',
      sha: 'b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0a1',
    },
    base: {
      ref: 'main',
      sha: '0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9',
    },
    updated_at: '2025-12-27T11:00:00Z',
  },
  repository: {
    id: 123456,
    name: 'hello-world',
    full_name: 'octocat/hello-world',
    owner: {
      login: 'octocat',
      id: 1,
    },
  },
  sender: {
    login: 'developer',
    id: 5678,
  },
};

/**
 * GitHub pull request closed webhook (merged)
 */
export const githubPRMerged = {
  action: 'closed',
  number: 42,
  pull_request: {
    id: 1234567890,
    number: 42,
    state: 'closed',
    merged: true,
    merged_at: '2025-12-27T15:00:00Z',
    merged_by: {
      login: 'maintainer',
      id: 9999,
    },
    title: 'Add authentication feature',
    head: {
      ref: 'feature-auth',
      sha: 'b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0a1',
    },
    base: {
      ref: 'main',
      sha: '0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9',
    },
    closed_at: '2025-12-27T15:00:00Z',
  },
  repository: {
    id: 123456,
    name: 'hello-world',
    full_name: 'octocat/hello-world',
    owner: {
      login: 'octocat',
      id: 1,
    },
  },
  sender: {
    login: 'maintainer',
    id: 9999,
  },
};

/**
 * GitHub issue comment created webhook
 */
export const githubIssueCommentCreated = {
  action: 'created',
  issue: {
    number: 123,
    title: 'Bug: Login fails with OAuth',
    state: 'open',
    user: {
      login: 'reporter',
      id: 4321,
    },
    html_url: 'https://github.com/octocat/hello-world/issues/123',
  },
  comment: {
    id: 555,
    body: 'I can confirm this issue. Same problem on my setup.',
    user: {
      login: 'commenter',
      id: 1111,
    },
    created_at: '2025-12-27T12:00:00Z',
    updated_at: '2025-12-27T12:00:00Z',
    html_url: 'https://github.com/octocat/hello-world/issues/123#issuecomment-555',
  },
  repository: {
    id: 123456,
    name: 'hello-world',
    full_name: 'octocat/hello-world',
    owner: {
      login: 'octocat',
      id: 1,
    },
  },
  sender: {
    login: 'commenter',
    id: 1111,
  },
};

/**
 * GitHub push webhook
 */
export const githubPush = {
  ref: 'refs/heads/main',
  before: '0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9',
  after: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
  commits: [
    {
      id: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
      message: 'Fix critical security vulnerability',
      author: {
        name: 'Developer',
        email: 'developer@example.com',
        username: 'developer',
      },
      timestamp: '2025-12-27T14:00:00Z',
      added: ['src/auth/oauth.ts'],
      removed: [],
      modified: ['package.json', 'package-lock.json'],
    },
  ],
  repository: {
    id: 123456,
    name: 'hello-world',
    full_name: 'octocat/hello-world',
    owner: {
      login: 'octocat',
      id: 1,
    },
  },
  pusher: {
    name: 'developer',
    email: 'developer@example.com',
  },
  sender: {
    login: 'developer',
    id: 5678,
  },
};

/**
 * GitHub check run completed webhook
 */
export const githubCheckRunCompleted = {
  action: 'completed',
  check_run: {
    id: 9999,
    name: 'CI Tests',
    status: 'completed',
    conclusion: 'success',
    started_at: '2025-12-27T10:05:00Z',
    completed_at: '2025-12-27T10:15:00Z',
    output: {
      title: 'All tests passed',
      summary: '✅ 142 tests passed',
    },
    pull_requests: [
      {
        number: 42,
        head: {
          ref: 'feature-auth',
          sha: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
        },
        base: {
          ref: 'main',
          sha: '0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9',
        },
      },
    ],
  },
  repository: {
    id: 123456,
    name: 'hello-world',
    full_name: 'octocat/hello-world',
    owner: {
      login: 'octocat',
      id: 1,
    },
  },
  sender: {
    login: 'github-actions[bot]',
    id: 41898282,
  },
};

/**
 * GitLab merge request opened webhook
 */
export const gitlabMROpened = {
  object_kind: 'merge_request',
  event_type: 'merge_request',
  object_attributes: {
    id: 99,
    iid: 1,
    title: 'Add authentication feature',
    description: 'This MR adds OAuth2 authentication support.',
    state: 'opened',
    source_branch: 'feature-auth',
    target_branch: 'main',
    source_project_id: 123,
    target_project_id: 123,
    action: 'open',
    created_at: '2025-12-27 10:00:00 UTC',
    updated_at: '2025-12-27 10:00:00 UTC',
    url: 'https://gitlab.com/gitlab-org/gitlab/-/merge_requests/1',
  },
  project: {
    id: 123,
    name: 'GitLab',
    path_with_namespace: 'gitlab-org/gitlab',
    web_url: 'https://gitlab.com/gitlab-org/gitlab',
  },
  user: {
    id: 5678,
    name: 'Developer',
    username: 'developer',
    email: 'developer@example.com',
  },
};

/**
 * GitLab push webhook
 */
export const gitlabPush = {
  object_kind: 'push',
  event_name: 'push',
  before: '0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9',
  after: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
  ref: 'refs/heads/main',
  checkout_sha: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
  commits: [
    {
      id: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
      message: 'Fix critical security vulnerability',
      title: 'Fix critical security vulnerability',
      timestamp: '2025-12-27T14:00:00+00:00',
      author: {
        name: 'Developer',
        email: 'developer@example.com',
      },
      added: ['src/auth/oauth.ts'],
      modified: ['package.json'],
      removed: [],
    },
  ],
  project: {
    id: 123,
    name: 'GitLab',
    path_with_namespace: 'gitlab-org/gitlab',
    web_url: 'https://gitlab.com/gitlab-org/gitlab',
  },
  user_username: 'developer',
  user_name: 'Developer',
  user_email: 'developer@example.com',
};
