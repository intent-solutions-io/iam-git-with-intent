/**
 * Type declarations for @octokit/rest and @octokit/auth-app
 *
 * Minimal stubs to satisfy TypeScript compiler.
 * The package dist-types are missing from node_modules.
 */

declare module '@octokit/auth-app' {
  export interface AppAuthOptions {
    appId: string;
    privateKey: string;
    installationId?: string;
  }

  export function createAppAuth(options: AppAuthOptions): unknown;
}

declare module '@octokit/rest' {
  export interface OctokitOptions {
    auth?: string | {
      appId: string;
      privateKey: string;
      installationId?: string;
    };
    authStrategy?: unknown;
    baseUrl?: string;
    userAgent?: string;
    previews?: string[];
    timeZone?: string;
    request?: {
      agent?: unknown;
      fetch?: unknown;
      timeout?: number;
    };
  }

  export interface RequestParameters {
    baseUrl?: string;
    headers?: Record<string, string>;
    mediaType?: { format?: string; previews?: string[] };
    method?: string;
    request?: { agent?: unknown; fetch?: unknown; timeout?: number };
    url?: string;
    [key: string]: unknown;
  }

  export interface OctokitResponse<T> {
    data: T;
    status: number;
    url: string;
    headers: Record<string, string>;
  }

  export interface User {
    login: string;
    id: number;
    type: string;
    name?: string;
    email?: string;
    avatar_url?: string;
  }

  export interface RateLimitData {
    rate: {
      limit: number;
      remaining: number;
      reset: number;
      used: number;
    };
    resources: Record<string, { limit: number; remaining: number; reset: number; used: number }>;
  }

  export interface PullRequest {
    id: number;
    node_id: string;
    number: number;
    state: string;
    title: string;
    body: string | null;
    html_url: string;
    user: { login: string; id: number } | null;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    merged_at: string | null;
    merge_commit_sha: string | null;
    head: { ref: string; sha: string; repo: { full_name: string } | null };
    base: { ref: string; sha: string; repo: { full_name: string } | null };
    labels: Array<{ name: string }>;
    draft: boolean;
    mergeable: boolean | null;
    mergeable_state: string;
    additions: number;
    deletions: number;
    changed_files: number;
    pull_request?: unknown;
  }

  export interface Issue {
    id: number;
    node_id: string;
    number: number;
    state: string;
    title: string;
    body: string | null;
    html_url: string;
    user: { login: string; id: number } | null;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    labels: Array<{ name: string }>;
    assignees: Array<{ login: string }>;
    milestone: { title: string; number: number } | null;
    comments: number;
    pull_request?: unknown;
  }

  export interface FileContent {
    type: 'file' | 'dir' | 'symlink' | 'submodule';
    encoding?: string;
    size: number;
    name: string;
    path: string;
    content: string;
    sha: string;
    url: string;
    html_url: string;
  }

  export interface DirContent {
    type: 'dir';
    size: number;
    name: string;
    path: string;
    sha: string;
    url: string;
    html_url: string;
  }

  export interface PullRequestFile {
    sha: string;
    filename: string;
    status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
    previous_filename?: string;
    contents_url: string;
  }

  export interface Comment {
    id: number;
    body: string;
    user: { login: string } | null;
    created_at: string;
    updated_at: string;
  }

  export interface PullsListParams {
    owner: string;
    repo: string;
    state?: 'open' | 'closed' | 'all';
    sort?: 'created' | 'updated' | 'popularity' | 'long-running';
    direction?: 'asc' | 'desc';
    per_page?: number;
    page?: number;
  }

  export interface IssuesListForRepoParams {
    owner: string;
    repo: string;
    state?: 'open' | 'closed' | 'all';
    sort?: 'created' | 'updated' | 'comments';
    direction?: 'asc' | 'desc';
    since?: string;
    per_page?: number;
    page?: number;
  }

  export interface PaginateInterface {
    iterator<T = unknown>(
      route: unknown,
      parameters?: RequestParameters | PullsListParams | IssuesListForRepoParams
    ): AsyncIterableIterator<OctokitResponse<T[]>>;
  }

  export interface UsersEndpoints {
    getAuthenticated(): Promise<OctokitResponse<User>>;
  }

  export interface RateLimitEndpoints {
    get(): Promise<OctokitResponse<RateLimitData>>;
  }

  export interface PullsEndpoints {
    get(params: { owner: string; repo: string; pull_number: number }): Promise<OctokitResponse<PullRequest>>;
    list: unknown & ((params: PullsListParams) => Promise<OctokitResponse<PullRequest[]>>);
    listFiles: unknown & ((params: { owner: string; repo: string; pull_number: number; per_page?: number; page?: number }) => Promise<OctokitResponse<PullRequestFile[]>>);
  }

  export interface IssuesEndpoints {
    get(params: { owner: string; repo: string; issue_number: number }): Promise<OctokitResponse<Issue>>;
    listForRepo: unknown & ((params: IssuesListForRepoParams) => Promise<OctokitResponse<Issue[]>>);
    createComment(params: { owner: string; repo: string; issue_number: number; body: string }): Promise<OctokitResponse<Comment>>;
    addLabels(params: { owner: string; repo: string; issue_number: number; labels: string[] }): Promise<OctokitResponse<Array<{ name: string }>>>;
  }

  export interface ReposEndpoints {
    getContent(params: { owner: string; repo: string; path: string; ref?: string }): Promise<OctokitResponse<FileContent | DirContent | FileContent[]>>;
  }

  export interface RestInterface {
    users: UsersEndpoints;
    rateLimit: RateLimitEndpoints;
    pulls: PullsEndpoints;
    issues: IssuesEndpoints;
    repos: ReposEndpoints;
  }

  export class Octokit {
    constructor(options?: OctokitOptions);

    rest: RestInterface;
    paginate: PaginateInterface;
    graphql: <T = unknown>(query: string, parameters?: Record<string, unknown>) => Promise<T>;

    auth(): Promise<{ token: string }>;
  }
}
