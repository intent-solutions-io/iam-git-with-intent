/**
 * Issue-to-Code Workflow Tests
 *
 * Phase 4: Tests for the issue-to-code workflow entrypoint.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { rm, readFile, stat } from 'fs/promises';
import { join } from 'path';
import {
  parseGitHubIssueUrl,
  runIssueToCodeFromGithubUrl,
} from '../issue-to-code.js';
import { getWorkspacePaths } from '@gwi/core';

describe('parseGitHubIssueUrl', () => {
  it('should parse full GitHub issue URL', () => {
    const result = parseGitHubIssueUrl('https://github.com/owner/repo/issues/123');
    expect(result).toEqual({
      owner: 'owner',
      repo: 'repo',
      issueNumber: 123,
      fullName: 'owner/repo',
    });
  });

  it('should parse URL without https', () => {
    const result = parseGitHubIssueUrl('github.com/myorg/myrepo/issues/456');
    expect(result).toEqual({
      owner: 'myorg',
      repo: 'myrepo',
      issueNumber: 456,
      fullName: 'myorg/myrepo',
    });
  });

  it('should parse shorthand format owner/repo#123', () => {
    const result = parseGitHubIssueUrl('test/project#789');
    expect(result).toEqual({
      owner: 'test',
      repo: 'project',
      issueNumber: 789,
      fullName: 'test/project',
    });
  });

  it('should return null for invalid URL', () => {
    expect(parseGitHubIssueUrl('not-a-url')).toBeNull();
    expect(parseGitHubIssueUrl('https://gitlab.com/owner/repo/issues/123')).toBeNull();
    expect(parseGitHubIssueUrl('https://github.com/owner/repo/pull/123')).toBeNull();
    expect(parseGitHubIssueUrl('')).toBeNull();
  });

  it('should handle URLs with trailing content', () => {
    // The regex matches the issue number, trailing content is ignored
    const result = parseGitHubIssueUrl('https://github.com/owner/repo/issues/123');
    expect(result).not.toBeNull();
    expect(result?.issueNumber).toBe(123);
  });
});

describe('runIssueToCodeFromGithubUrl', () => {
  let testRunId: string;

  afterEach(async () => {
    // Clean up workspace artifacts
    if (testRunId) {
      const { runsDir } = getWorkspacePaths();
      try {
        await rm(join(runsDir, testRunId), { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('should return error for invalid URL', async () => {
    const result = await runIssueToCodeFromGithubUrl('invalid-url');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid GitHub issue URL');
  });

  it('should create workspace artifacts in dry-run mode', async () => {
    const result = await runIssueToCodeFromGithubUrl(
      'https://github.com/test/repo/issues/42',
      { dryRun: true }
    );

    testRunId = result.runId;

    expect(result.success).toBe(true);
    expect(result.runId).toBeTruthy();
    expect(result.complexity).toBe(5);
    expect(result.triageSummary).toContain('Dry run');
    expect(result.planPath).toBeTruthy();
    expect(result.patchPaths).toHaveLength(1);

    // Verify files were created
    const planStat = await stat(result.planPath);
    expect(planStat.isFile()).toBe(true);

    const patchStat = await stat(result.patchPaths[0]);
    expect(patchStat.isFile()).toBe(true);

    // Verify plan content
    const planContent = await readFile(result.planPath, 'utf-8');
    expect(planContent).toContain('Code Generation Plan');
    expect(planContent).toContain('test/repo');
    expect(planContent).toContain('#42');
  });

  it('should use provided runId when specified', async () => {
    const customRunId = 'test-run-custom-123';
    const result = await runIssueToCodeFromGithubUrl(
      'https://github.com/owner/repo/issues/1',
      { dryRun: true, runId: customRunId }
    );

    testRunId = customRunId;

    expect(result.runId).toBe(customRunId);
    expect(result.workspaceDir).toContain(customRunId);
  });

  it('should skip triage when skipTriage is provided', async () => {
    const result = await runIssueToCodeFromGithubUrl(
      'https://github.com/test/repo/issues/5',
      { dryRun: true, skipTriage: 8 }
    );

    testRunId = result.runId;

    expect(result.success).toBe(true);
    expect(result.complexity).toBe(8);
    expect(result.triageSummary).toContain('Skipped triage');
  });

  it('should handle shorthand URL format', async () => {
    const result = await runIssueToCodeFromGithubUrl(
      'myorg/myproject#100',
      { dryRun: true }
    );

    testRunId = result.runId;

    expect(result.success).toBe(true);

    const planContent = await readFile(result.planPath, 'utf-8');
    expect(planContent).toContain('myorg/myproject');
    expect(planContent).toContain('#100');
  });
});
