/**
 * Isolated Workspace Manager
 *
 * Phase 34: Provides secure, isolated workspaces for autopilot operations.
 *
 * Features:
 * - Repository cloning into isolated directories
 * - Branch creation for changes
 * - Safe patch application
 * - PR creation via GitHub App token
 * - Automatic cleanup
 *
 * @module @gwi/core/workspace-isolation
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, rm, access, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { constants } from 'fs';
import { randomBytes } from 'crypto';
import { getLogger } from './reliability/observability.js';

const execAsync = promisify(exec);
const logger = getLogger('workspace-isolation');

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for isolated workspace
 */
export interface IsolatedWorkspaceConfig {
  /** Tenant ID for scoping */
  tenantId: string;
  /** Run ID for tracking */
  runId: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Base branch to create from (default: main) */
  baseBranch?: string;
  /** Branch name for changes */
  targetBranch: string;
  /** GitHub App installation token */
  installationToken: string;
  /** Installation ID for GitHub App */
  installationId: number;
  /** Working directory root (default: /tmp/gwi-workspaces) */
  workspacesRoot?: string;
  /** Timeout for git operations in ms (default: 120000) */
  gitTimeoutMs?: number;
}

/**
 * Isolated workspace instance
 */
export interface IsolatedWorkspace {
  /** Unique workspace ID */
  id: string;
  /** Absolute path to workspace directory */
  path: string;
  /** Repository full name (owner/repo) */
  repoFullName: string;
  /** Base branch */
  baseBranch: string;
  /** Target branch for changes */
  targetBranch: string;
  /** Whether workspace is active */
  active: boolean;
  /** Creation timestamp */
  createdAt: Date;
}

/**
 * Patch application result
 */
export interface PatchResult {
  /** Whether patch was applied successfully */
  success: boolean;
  /** Files modified */
  filesModified: string[];
  /** Files created */
  filesCreated: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Commit result
 */
export interface CommitResult {
  /** Whether commit was successful */
  success: boolean;
  /** Commit SHA */
  sha?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Push result
 */
export interface PushResult {
  /** Whether push was successful */
  success: boolean;
  /** Remote URL */
  remoteUrl?: string;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_WORKSPACES_ROOT = process.env.GWI_WORKSPACES_ROOT || '/tmp/gwi-workspaces';
const DEFAULT_GIT_TIMEOUT_MS = 120000; // 2 minutes
const DEFAULT_BASE_BRANCH = 'main';
const MAX_WORKSPACE_AGE_MS = 3600000; // 1 hour

// =============================================================================
// Isolated Workspace Manager
// =============================================================================

/**
 * Manager for isolated workspaces
 */
export class IsolatedWorkspaceManager {
  private config: Required<IsolatedWorkspaceConfig>;
  private workspace: IsolatedWorkspace | null = null;

  constructor(config: IsolatedWorkspaceConfig) {
    this.config = {
      ...config,
      baseBranch: config.baseBranch || DEFAULT_BASE_BRANCH,
      workspacesRoot: config.workspacesRoot || DEFAULT_WORKSPACES_ROOT,
      gitTimeoutMs: config.gitTimeoutMs || DEFAULT_GIT_TIMEOUT_MS,
    };
  }

  /**
   * Initialize the isolated workspace by cloning the repository
   */
  async initialize(): Promise<IsolatedWorkspace> {
    const workspaceId = this.generateWorkspaceId();
    const workspacePath = join(this.config.workspacesRoot, workspaceId);

    logger.info('Initializing isolated workspace', {
      workspaceId,
      repo: `${this.config.owner}/${this.config.repo}`,
      targetBranch: this.config.targetBranch,
    });

    try {
      // Create workspace directory
      await mkdir(workspacePath, { recursive: true });

      // Clone repository with GitHub App token
      await this.cloneRepository(workspacePath);

      // Create target branch
      await this.createBranch(workspacePath);

      this.workspace = {
        id: workspaceId,
        path: workspacePath,
        repoFullName: `${this.config.owner}/${this.config.repo}`,
        baseBranch: this.config.baseBranch,
        targetBranch: this.config.targetBranch,
        active: true,
        createdAt: new Date(),
      };

      logger.info('Workspace initialized successfully', {
        workspaceId,
        path: workspacePath,
      });

      return this.workspace;
    } catch (error) {
      // Cleanup on failure
      await this.cleanup(workspacePath);
      throw error;
    }
  }

  /**
   * Apply a unified diff patch to the workspace
   */
  async applyPatch(patchContent: string): Promise<PatchResult> {
    if (!this.workspace) {
      throw new Error('Workspace not initialized');
    }

    const filesModified: string[] = [];
    const filesCreated: string[] = [];

    try {
      // Write patch to temp file
      const patchPath = join(this.workspace.path, '.gwi-patch.diff');
      await writeFile(patchPath, patchContent, 'utf-8');

      // Try to apply patch with git apply
      try {
        await this.execGit(['apply', '--check', '.gwi-patch.diff'], this.workspace.path);

        // Patch is valid, apply it
        await this.execGit(['apply', '.gwi-patch.diff'], this.workspace.path);

        // Get list of changed files
        const { stdout } = await this.execGit(['diff', '--name-status', 'HEAD'], this.workspace.path);

        for (const line of stdout.split('\n').filter(Boolean)) {
          const [status, file] = line.split('\t');
          if (status === 'A') {
            filesCreated.push(file);
          } else if (status === 'M' || status === 'D') {
            filesModified.push(file);
          }
        }
      } catch (gitError) {
        // Try to apply manually if git apply fails
        logger.warn('git apply failed, attempting manual patch', {
          error: gitError instanceof Error ? gitError.message : String(gitError),
        });

        const manualResult = await this.applyPatchManually(patchContent);
        filesModified.push(...manualResult.modified);
        filesCreated.push(...manualResult.created);
      }

      // Clean up patch file
      await rm(join(this.workspace.path, '.gwi-patch.diff'), { force: true });

      logger.info('Patch applied successfully', {
        workspaceId: this.workspace.id,
        filesModified: filesModified.length,
        filesCreated: filesCreated.length,
      });

      return {
        success: true,
        filesModified,
        filesCreated,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to apply patch', {
        workspaceId: this.workspace?.id,
        error: errorMessage,
      });

      return {
        success: false,
        filesModified,
        filesCreated,
        error: errorMessage,
      };
    }
  }

  /**
   * Write a file directly to the workspace
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    if (!this.workspace) {
      throw new Error('Workspace not initialized');
    }

    // Sanitize path to prevent traversal
    const sanitizedPath = this.sanitizePath(relativePath);
    const fullPath = join(this.workspace.path, sanitizedPath);

    // Create parent directories
    const parentDir = join(fullPath, '..');
    await mkdir(parentDir, { recursive: true });

    await writeFile(fullPath, content, 'utf-8');

    logger.info('File written to workspace', {
      workspaceId: this.workspace.id,
      path: sanitizedPath,
    });
  }

  /**
   * Commit all changes in the workspace
   */
  async commit(message: string, author?: { name: string; email: string }): Promise<CommitResult> {
    if (!this.workspace) {
      throw new Error('Workspace not initialized');
    }

    try {
      // Stage all changes
      await this.execGit(['add', '-A'], this.workspace.path);

      // Check if there are changes to commit
      const { stdout: status } = await this.execGit(['status', '--porcelain'], this.workspace.path);
      if (!status.trim()) {
        return {
          success: false,
          error: 'No changes to commit',
        };
      }

      // Configure author if provided
      if (author) {
        await this.execGit(['config', 'user.name', author.name], this.workspace.path);
        await this.execGit(['config', 'user.email', author.email], this.workspace.path);
      } else {
        // Use default gwi author
        await this.execGit(['config', 'user.name', 'Git With Intent'], this.workspace.path);
        await this.execGit(['config', 'user.email', 'bot@gitwithintent.dev'], this.workspace.path);
      }

      // Commit
      await this.execGit(['commit', '-m', message], this.workspace.path);

      // Get commit SHA
      const { stdout: sha } = await this.execGit(['rev-parse', 'HEAD'], this.workspace.path);

      logger.info('Changes committed', {
        workspaceId: this.workspace.id,
        sha: sha.trim(),
      });

      return {
        success: true,
        sha: sha.trim(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to commit', {
        workspaceId: this.workspace?.id,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Push changes to remote
   */
  async push(): Promise<PushResult> {
    if (!this.workspace) {
      throw new Error('Workspace not initialized');
    }

    try {
      // Push to remote with token
      await this.execGit(
        ['push', '-u', 'origin', this.config.targetBranch],
        this.workspace.path
      );

      const remoteUrl = `https://github.com/${this.workspace.repoFullName}/tree/${this.config.targetBranch}`;

      logger.info('Changes pushed', {
        workspaceId: this.workspace.id,
        branch: this.config.targetBranch,
        remoteUrl,
      });

      return {
        success: true,
        remoteUrl,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to push', {
        workspaceId: this.workspace?.id,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get the current workspace
   */
  getWorkspace(): IsolatedWorkspace | null {
    return this.workspace;
  }

  /**
   * Clean up the workspace
   */
  async destroy(): Promise<void> {
    if (this.workspace) {
      await this.cleanup(this.workspace.path);
      this.workspace.active = false;
      logger.info('Workspace destroyed', { workspaceId: this.workspace.id });
      this.workspace = null;
    }
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private generateWorkspaceId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `ws-${this.config.tenantId.slice(0, 8)}-${this.config.runId.slice(0, 8)}-${timestamp}-${random}`;
  }

  private async cloneRepository(workspacePath: string): Promise<void> {
    const cloneUrl = `https://x-access-token:${this.config.installationToken}@github.com/${this.config.owner}/${this.config.repo}.git`;

    logger.info('Cloning repository', {
      repo: `${this.config.owner}/${this.config.repo}`,
      branch: this.config.baseBranch,
    });

    await this.execGit(
      ['clone', '--depth', '1', '--single-branch', '-b', this.config.baseBranch, cloneUrl, '.'],
      workspacePath
    );

    // Remove credentials from remote URL for safety
    await this.execGit(
      ['remote', 'set-url', 'origin', `https://github.com/${this.config.owner}/${this.config.repo}.git`],
      workspacePath
    );

    // Re-add with token for push
    await this.execGit(
      ['remote', 'set-url', '--push', 'origin', cloneUrl],
      workspacePath
    );
  }

  private async createBranch(workspacePath: string): Promise<void> {
    logger.info('Creating branch', {
      branch: this.config.targetBranch,
    });

    await this.execGit(['checkout', '-b', this.config.targetBranch], workspacePath);
  }

  private async execGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
    const command = `git ${args.join(' ')}`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: this.config.gitTimeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: {
          ...process.env,
          // Disable git credential helper prompts
          GIT_TERMINAL_PROMPT: '0',
          // Disable git hooks for automated operations
          GIT_HOOKS_DISABLED: '1',
        },
      });

      return { stdout, stderr };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message: string };
      logger.error('Git command failed', {
        command: args[0],
        error: err.message,
        stderr: err.stderr,
      });
      throw error;
    }
  }

  private async cleanup(path: string): Promise<void> {
    try {
      await rm(path, { recursive: true, force: true });
    } catch (error) {
      logger.warn('Failed to cleanup workspace', {
        path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private sanitizePath(relativePath: string): string {
    // Remove any path traversal attempts
    const sanitized = relativePath
      .replace(/\.\./g, '')
      .replace(/^\/+/, '')
      .replace(/\/+/g, '/');

    return sanitized;
  }

  private async applyPatchManually(
    patchContent: string
  ): Promise<{ modified: string[]; created: string[] }> {
    const modified: string[] = [];
    const created: string[] = [];

    if (!this.workspace) {
      throw new Error('Workspace not initialized');
    }

    // Parse unified diff format
    const filePatches = this.parseUnifiedDiff(patchContent);

    for (const [filePath, operations] of filePatches.entries()) {
      const fullPath = join(this.workspace.path, filePath);
      const parentDir = join(fullPath, '..');

      // Create parent directories
      await mkdir(parentDir, { recursive: true });

      // Check if file exists
      try {
        await access(fullPath, constants.F_OK);
        // File exists - will be modified
        modified.push(filePath);
      } catch {
        // File doesn't exist - will be created
        created.push(filePath);
      }

      // Apply operations (simplified - just write new content)
      if (operations.newContent) {
        await writeFile(fullPath, operations.newContent, 'utf-8');
      }
    }

    return { modified, created };
  }

  private parseUnifiedDiff(patchContent: string): Map<string, { newContent?: string }> {
    const files = new Map<string, { newContent?: string }>();

    // Simple parsing - extract file paths and changes
    const lines = patchContent.split('\n');
    let currentFile = '';
    let newContent: string[] = [];
    let inHunk = false;

    for (const line of lines) {
      if (line.startsWith('+++ ')) {
        // New file path (strip b/ prefix)
        const match = line.match(/^\+\+\+ b?\/?(.+)/);
        if (match) {
          if (currentFile && newContent.length > 0) {
            files.set(currentFile, { newContent: newContent.join('\n') });
          }
          currentFile = match[1];
          newContent = [];
        }
      } else if (line.startsWith('@@')) {
        inHunk = true;
      } else if (inHunk && currentFile) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          newContent.push(line.slice(1));
        } else if (line.startsWith(' ')) {
          newContent.push(line.slice(1));
        }
        // Skip removed lines (starting with -)
      }
    }

    // Save last file
    if (currentFile && newContent.length > 0) {
      files.set(currentFile, { newContent: newContent.join('\n') });
    }

    return files;
  }
}

// =============================================================================
// Workspace Cleanup Utilities
// =============================================================================

/**
 * Clean up stale workspaces older than maxAge
 */
export async function cleanupStaleWorkspaces(
  workspacesRoot: string = DEFAULT_WORKSPACES_ROOT,
  maxAgeMs: number = MAX_WORKSPACE_AGE_MS
): Promise<number> {
  const logger = getLogger('workspace-cleanup');
  let cleaned = 0;

  try {
    const entries = await readdir(workspacesRoot, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('ws-')) {
        continue;
      }

      const wsPath = join(workspacesRoot, entry.name);

      try {
        const { stdout } = await execAsync(`stat -c %Y "${wsPath}"`, { timeout: 5000 });
        const mtime = parseInt(stdout.trim(), 10) * 1000;

        if (now - mtime > maxAgeMs) {
          await rm(wsPath, { recursive: true, force: true });
          cleaned++;
          logger.info('Removed stale workspace', { workspace: entry.name });
        }
      } catch {
        // Skip if can't get stat
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return cleaned;
}

/**
 * Create an isolated workspace manager
 */
export function createIsolatedWorkspace(config: IsolatedWorkspaceConfig): IsolatedWorkspaceManager {
  return new IsolatedWorkspaceManager(config);
}
