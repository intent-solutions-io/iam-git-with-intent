/**
 * GitHub API Response Fixtures
 *
 * Sample API responses for testing GitHub connectors.
 *
 * @module @gwi/core/connectors/testing/fixtures
 */

/**
 * Sample GitHub repository response
 */
export const githubRepo = {
  id: 123456,
  name: 'hello-world',
  full_name: 'octocat/hello-world',
  owner: {
    login: 'octocat',
    id: 1,
    avatar_url: 'https://github.com/images/error/octocat_happy.gif',
    type: 'User',
  },
  private: false,
  description: 'My first repository on GitHub!',
  fork: false,
  created_at: '2011-01-26T19:01:12Z',
  updated_at: '2011-01-26T19:14:43Z',
  pushed_at: '2011-01-26T19:06:43Z',
  homepage: 'https://github.com',
  size: 180,
  stargazers_count: 80,
  watchers_count: 80,
  language: 'TypeScript',
  has_issues: true,
  has_projects: true,
  has_downloads: true,
  has_wiki: true,
  has_pages: false,
  forks_count: 9,
  archived: false,
  disabled: false,
  open_issues_count: 0,
  license: {
    key: 'mit',
    name: 'MIT License',
    url: 'https://api.github.com/licenses/mit',
  },
  topics: ['octocat', 'atom', 'electron', 'api'],
  visibility: 'public',
  default_branch: 'main',
  html_url: 'https://github.com/octocat/hello-world',
  clone_url: 'https://github.com/octocat/hello-world.git',
  git_url: 'git://github.com/octocat/hello-world.git',
  ssh_url: 'git@github.com:octocat/hello-world.git',
};

/**
 * Sample GitHub pull request response
 */
export const githubPullRequest = {
  id: 1,
  number: 42,
  state: 'open',
  title: 'Add authentication feature',
  body: 'This PR adds OAuth2 authentication support.\n\nCloses #123',
  user: {
    login: 'developer',
    id: 5678,
    avatar_url: 'https://avatars.githubusercontent.com/u/5678',
    type: 'User',
  },
  labels: [
    { id: 1, name: 'enhancement', color: 'a2eeef' },
    { id: 2, name: 'security', color: 'd73a4a' },
  ],
  milestone: {
    id: 1,
    number: 1,
    title: 'v1.0',
    state: 'open',
  },
  created_at: '2025-12-20T10:00:00Z',
  updated_at: '2025-12-27T15:30:00Z',
  closed_at: null,
  merged_at: null,
  head: {
    label: 'developer:feature-auth',
    ref: 'feature-auth',
    sha: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
    user: {
      login: 'developer',
      id: 5678,
    },
    repo: githubRepo,
  },
  base: {
    label: 'octocat:main',
    ref: 'main',
    sha: '0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9',
    user: {
      login: 'octocat',
      id: 1,
    },
    repo: githubRepo,
  },
  mergeable: true,
  mergeable_state: 'clean',
  merged: false,
  draft: false,
  commits: 5,
  additions: 120,
  deletions: 45,
  changed_files: 8,
  html_url: 'https://github.com/octocat/hello-world/pull/42',
  diff_url: 'https://github.com/octocat/hello-world/pull/42.diff',
  patch_url: 'https://github.com/octocat/hello-world/pull/42.patch',
};

/**
 * Sample GitHub issue response
 */
export const githubIssue = {
  id: 9876,
  number: 123,
  state: 'open',
  title: 'Bug: Login fails with OAuth',
  body: 'When trying to log in with OAuth, I get a 500 error.\n\nSteps to reproduce:\n1. Click login\n2. Authorize app\n3. See error',
  user: {
    login: 'reporter',
    id: 4321,
    avatar_url: 'https://avatars.githubusercontent.com/u/4321',
    type: 'User',
  },
  labels: [
    { id: 3, name: 'bug', color: 'd73a4a' },
    { id: 4, name: 'priority-high', color: 'b60205' },
  ],
  assignees: [
    {
      login: 'developer',
      id: 5678,
      avatar_url: 'https://avatars.githubusercontent.com/u/5678',
      type: 'User',
    },
  ],
  milestone: {
    id: 1,
    number: 1,
    title: 'v1.0',
    state: 'open',
  },
  comments: 3,
  created_at: '2025-12-15T08:00:00Z',
  updated_at: '2025-12-27T14:00:00Z',
  closed_at: null,
  html_url: 'https://github.com/octocat/hello-world/issues/123',
};

/**
 * Sample GitHub comment response
 */
export const githubComment = {
  id: 555,
  user: {
    login: 'reviewer',
    id: 7890,
    avatar_url: 'https://avatars.githubusercontent.com/u/7890',
    type: 'User',
  },
  body: 'LGTM! Just a few minor suggestions:\n\n- Add error handling for network failures\n- Consider adding rate limiting',
  created_at: '2025-12-27T12:00:00Z',
  updated_at: '2025-12-27T12:05:00Z',
  html_url: 'https://github.com/octocat/hello-world/pull/42#issuecomment-555',
};

/**
 * Sample GitHub commit response
 */
export const githubCommit = {
  sha: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
  commit: {
    message: 'Add OAuth2 authentication\n\nImplemented OAuth2 flow with Google provider.\nAdded tests and documentation.',
    author: {
      name: 'Developer',
      email: 'developer@example.com',
      date: '2025-12-27T10:00:00Z',
    },
    committer: {
      name: 'Developer',
      email: 'developer@example.com',
      date: '2025-12-27T10:00:00Z',
    },
    tree: {
      sha: 'tree1234567890abcdef',
    },
  },
  author: {
    login: 'developer',
    id: 5678,
  },
  committer: {
    login: 'developer',
    id: 5678,
  },
  parents: [
    {
      sha: '0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9',
    },
  ],
  html_url: 'https://github.com/octocat/hello-world/commit/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
};

/**
 * Sample GitHub review response
 */
export const githubReview = {
  id: 888,
  user: {
    login: 'reviewer',
    id: 7890,
    avatar_url: 'https://avatars.githubusercontent.com/u/7890',
    type: 'User',
  },
  body: 'Great work on the authentication implementation! A few suggestions for improvement.',
  state: 'APPROVED',
  submitted_at: '2025-12-27T13:00:00Z',
  commit_id: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
  html_url: 'https://github.com/octocat/hello-world/pull/42#pullrequestreview-888',
};

/**
 * Sample GitHub check run response
 */
export const githubCheckRun = {
  id: 9999,
  name: 'CI Tests',
  status: 'completed',
  conclusion: 'success',
  started_at: '2025-12-27T10:05:00Z',
  completed_at: '2025-12-27T10:15:00Z',
  output: {
    title: 'All tests passed',
    summary: '✅ 142 tests passed\n⏭️ 3 tests skipped\n⏱️ Duration: 8m 32s',
    text: 'All unit and integration tests completed successfully.',
  },
  html_url: 'https://github.com/octocat/hello-world/runs/9999',
  check_suite: {
    id: 7777,
  },
};

/**
 * Sample paginated repositories response
 */
export const githubReposPage1 = {
  data: [
    { ...githubRepo, id: 1, name: 'repo-1' },
    { ...githubRepo, id: 2, name: 'repo-2' },
  ],
  pagination: {
    next_cursor: 'cursor-page-2',
    has_more: true,
  },
};

export const githubReposPage2 = {
  data: [
    { ...githubRepo, id: 3, name: 'repo-3' },
    { ...githubRepo, id: 4, name: 'repo-4' },
  ],
  pagination: {
    next_cursor: 'cursor-page-3',
    has_more: true,
  },
};

export const githubReposPage3 = {
  data: [
    { ...githubRepo, id: 5, name: 'repo-5' },
  ],
  pagination: {
    next_cursor: null,
    has_more: false,
  },
};

/**
 * Sample error responses
 */
export const githubErrors = {
  unauthorized: {
    message: 'Bad credentials',
    documentation_url: 'https://docs.github.com/rest',
  },
  notFound: {
    message: 'Not Found',
    documentation_url: 'https://docs.github.com/rest/reference/repos#get-a-repository',
  },
  forbidden: {
    message: 'Resource not accessible by integration',
    documentation_url: 'https://docs.github.com/rest/reference/repos',
  },
  rateLimited: {
    message: 'API rate limit exceeded for user ID 5678.',
    documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
  },
  validationFailed: {
    message: 'Validation Failed',
    errors: [
      {
        resource: 'PullRequest',
        field: 'title',
        code: 'missing_field',
      },
    ],
    documentation_url: 'https://docs.github.com/rest/reference/pulls#create-a-pull-request',
  },
};
