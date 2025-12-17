/**
 * Comment Formatter Tests
 *
 * Tests for the 5W comment formatting standard.
 */

import { describe, it, expect } from 'vitest';
import {
  CommentMetadata,
  CheckRunSummary,
  formatComment,
  formatCheckRunSummary,
  createInfoComment,
  createSuccessComment,
  createErrorComment,
} from '../comment-formatter.js';

// =============================================================================
// Schema Validation Tests
// =============================================================================

describe('CommentMetadata Schema', () => {
  it('should validate minimal metadata', () => {
    const metadata = {
      why: 'Automated analysis',
      what: { summary: 'Analyzed PR for issues' },
      who: { bot: 'Git With Intent' },
      when: { timestamp: new Date().toISOString(), runId: 'run-123' },
      where: {},
      status: 'success' as const,
    };

    expect(() => CommentMetadata.parse(metadata)).not.toThrow();
  });

  it('should validate full metadata with evidence', () => {
    const metadata = {
      why: 'PR analysis requested',
      what: {
        summary: 'Found 3 issues',
        changes: ['Fixed type error', 'Updated imports'],
        filesAffected: 5,
      },
      who: {
        bot: 'Git With Intent',
        version: '1.0.0',
        triggeredBy: 'user123',
        workflow: 'pr-review',
      },
      when: {
        timestamp: new Date().toISOString(),
        runId: 'run-456',
        durationMs: 5000,
      },
      where: {
        files: ['src/index.ts', 'src/utils.ts'],
        repo: 'test/repo',
        branch: 'main',
        prNumber: 42,
      },
      evidence: {
        testsRun: 10,
        testsPassed: 10,
        confidence: 95,
        artifactLinks: [
          { name: 'Report', url: 'https://example.com/report' },
          { name: 'Patch', path: '/patches/1.patch' },
        ],
        warnings: ['Deprecated API usage'],
      },
      status: 'success' as const,
    };

    expect(() => CommentMetadata.parse(metadata)).not.toThrow();
  });

  it('should reject invalid status', () => {
    const metadata = {
      why: 'Test',
      what: { summary: 'Test' },
      who: { bot: 'Test' },
      when: { timestamp: new Date().toISOString(), runId: 'test' },
      where: {},
      status: 'invalid',
    };

    expect(() => CommentMetadata.parse(metadata)).toThrow();
  });

  it('should reject invalid confidence range', () => {
    const metadata = {
      why: 'Test',
      what: { summary: 'Test' },
      who: { bot: 'Test' },
      when: { timestamp: new Date().toISOString(), runId: 'test' },
      where: {},
      evidence: { confidence: 150 }, // Invalid: > 100
      status: 'success' as const,
    };

    expect(() => CommentMetadata.parse(metadata)).toThrow();
  });
});

describe('CheckRunSummary Schema', () => {
  it('should validate check run summary', () => {
    const summary = {
      name: 'GWI Analysis',
      status: 'completed' as const,
      conclusion: 'success' as const,
      metadata: {
        why: 'Automated check',
        what: { summary: 'All checks passed' },
        who: { bot: 'Git With Intent' },
        when: { timestamp: new Date().toISOString(), runId: 'check-123' },
        where: {},
        status: 'success' as const,
      },
    };

    expect(() => CheckRunSummary.parse(summary)).not.toThrow();
  });
});

// =============================================================================
// Formatter Tests
// =============================================================================

describe('formatComment', () => {
  it('should format basic comment with all sections', () => {
    const metadata: CommentMetadata = {
      why: 'Automated PR analysis',
      what: { summary: 'Analyzed PR for code quality issues' },
      who: { bot: 'Git With Intent' },
      when: { timestamp: '2024-01-15T10:00:00Z', runId: 'run-abc' },
      where: {},
      status: 'success',
    };

    const comment = formatComment(metadata);

    // Check header with status icon
    expect(comment).toContain('## ✅ Git With Intent');

    // Check Why section
    expect(comment).toContain('### Why');
    expect(comment).toContain('Automated PR analysis');

    // Check What section
    expect(comment).toContain('### What');
    expect(comment).toContain('Analyzed PR for code quality issues');

    // Check metadata footer
    expect(comment).toContain('| Bot | Git With Intent |');
    expect(comment).toContain('| Run ID | `run-abc` |');
  });

  it('should format failure comment with error icon', () => {
    const metadata: CommentMetadata = {
      why: 'Error occurred',
      what: { summary: 'Analysis failed' },
      who: { bot: 'Git With Intent' },
      when: { timestamp: '2024-01-15T10:00:00Z', runId: 'run-fail' },
      where: {},
      status: 'failure',
    };

    const comment = formatComment(metadata);
    expect(comment).toContain('## ❌ Git With Intent');
  });

  it('should format pending comment with clock icon', () => {
    const metadata: CommentMetadata = {
      why: 'Analysis in progress',
      what: { summary: 'Processing...' },
      who: { bot: 'Git With Intent' },
      when: { timestamp: '2024-01-15T10:00:00Z', runId: 'run-pending' },
      where: {},
      status: 'pending',
    };

    const comment = formatComment(metadata);
    expect(comment).toContain('## ⏳ Git With Intent');
  });

  it('should include changes list when provided', () => {
    const metadata: CommentMetadata = {
      why: 'Code review',
      what: {
        summary: 'Made improvements',
        changes: ['Fixed bug', 'Added tests', 'Updated docs'],
      },
      who: { bot: 'Git With Intent' },
      when: { timestamp: '2024-01-15T10:00:00Z', runId: 'run-changes' },
      where: {},
      status: 'success',
    };

    const comment = formatComment(metadata);

    expect(comment).toContain('**Changes:**');
    expect(comment).toContain('- Fixed bug');
    expect(comment).toContain('- Added tests');
    expect(comment).toContain('- Updated docs');
  });

  it('should include Where section with files', () => {
    const metadata: CommentMetadata = {
      why: 'File analysis',
      what: { summary: 'Analyzed files' },
      who: { bot: 'Git With Intent' },
      when: { timestamp: '2024-01-15T10:00:00Z', runId: 'run-files' },
      where: {
        files: ['src/index.ts', 'src/utils.ts', 'tests/index.test.ts'],
      },
      status: 'info',
    };

    const comment = formatComment(metadata);

    expect(comment).toContain('### Where');
    expect(comment).toContain('<summary>Files (3)</summary>');
    expect(comment).toContain('- `src/index.ts`');
    expect(comment).toContain('- `src/utils.ts`');
    expect(comment).toContain('- `tests/index.test.ts`');
  });

  it('should truncate file list over 20 files', () => {
    const files = Array.from({ length: 25 }, (_, i) => `file-${i}.ts`);

    const metadata: CommentMetadata = {
      why: 'Many files',
      what: { summary: 'Analyzed many files' },
      who: { bot: 'Git With Intent' },
      when: { timestamp: '2024-01-15T10:00:00Z', runId: 'run-many' },
      where: { files },
      status: 'success',
    };

    const comment = formatComment(metadata);

    expect(comment).toContain('<summary>Files (25)</summary>');
    expect(comment).toContain('- `file-0.ts`');
    expect(comment).toContain('- `file-19.ts`');
    expect(comment).toContain('- ... and 5 more');
    expect(comment).not.toContain('- `file-20.ts`');
  });

  it('should include Evidence section with confidence bar', () => {
    const metadata: CommentMetadata = {
      why: 'Confidence test',
      what: { summary: 'Test' },
      who: { bot: 'Git With Intent' },
      when: { timestamp: '2024-01-15T10:00:00Z', runId: 'run-conf' },
      where: {},
      evidence: { confidence: 75 },
      status: 'success',
    };

    const comment = formatComment(metadata);

    expect(comment).toContain('### Evidence');
    expect(comment).toContain('**Confidence:**');
    // 75% = 8 filled blocks (rounded)
    expect(comment).toMatch(/█{7,8}░{2,3} 75%/);
  });

  it('should include test results in Evidence', () => {
    const metadata: CommentMetadata = {
      why: 'Test results',
      what: { summary: 'Tests ran' },
      who: { bot: 'Git With Intent' },
      when: { timestamp: '2024-01-15T10:00:00Z', runId: 'run-tests' },
      where: {},
      evidence: { testsRun: 10, testsPassed: 8 },
      status: 'warning',
    };

    const comment = formatComment(metadata);

    expect(comment).toContain('**Tests:** ⚠️ 8/10 passed');
  });

  it('should show checkmark for all tests passed', () => {
    const metadata: CommentMetadata = {
      why: 'Test results',
      what: { summary: 'Tests passed' },
      who: { bot: 'Git With Intent' },
      when: { timestamp: '2024-01-15T10:00:00Z', runId: 'run-pass' },
      where: {},
      evidence: { testsRun: 10, testsPassed: 10 },
      status: 'success',
    };

    const comment = formatComment(metadata);

    expect(comment).toContain('**Tests:** ✅ 10/10 passed');
  });

  it('should include artifact links', () => {
    const metadata: CommentMetadata = {
      why: 'Artifacts',
      what: { summary: 'Generated artifacts' },
      who: { bot: 'Git With Intent' },
      when: { timestamp: '2024-01-15T10:00:00Z', runId: 'run-art' },
      where: {},
      evidence: {
        artifactLinks: [
          { name: 'Report', url: 'https://example.com/report' },
          { name: 'Patch', path: '/patches/1.patch' },
          { name: 'Log' },
        ],
      },
      status: 'success',
    };

    const comment = formatComment(metadata);

    expect(comment).toContain('**Artifacts:**');
    expect(comment).toContain('- [Report](https://example.com/report)');
    expect(comment).toContain('- Patch: `/patches/1.patch`');
    expect(comment).toContain('- Log');
  });

  it('should include warnings and errors', () => {
    const metadata: CommentMetadata = {
      why: 'Issues found',
      what: { summary: 'Found problems' },
      who: { bot: 'Git With Intent' },
      when: { timestamp: '2024-01-15T10:00:00Z', runId: 'run-issues' },
      where: {},
      evidence: {
        warnings: ['Deprecated API', 'Missing types'],
        errors: ['Build failed', 'Test failed'],
      },
      status: 'failure',
    };

    const comment = formatComment(metadata);

    expect(comment).toContain('**Warnings:**');
    expect(comment).toContain('- ⚠️ Deprecated API');
    expect(comment).toContain('- ⚠️ Missing types');

    expect(comment).toContain('**Errors:**');
    expect(comment).toContain('- ❌ Build failed');
    expect(comment).toContain('- ❌ Test failed');
  });

  it('should include triggeredBy and workflow in metadata', () => {
    const metadata: CommentMetadata = {
      why: 'User triggered',
      what: { summary: 'Manual run' },
      who: {
        bot: 'Git With Intent',
        version: '2.0.0',
        triggeredBy: 'johndoe',
        workflow: 'pr-review',
      },
      when: {
        timestamp: '2024-01-15T10:00:00Z',
        runId: 'run-user',
        durationMs: 5500,
      },
      where: { repo: 'test/repo', branch: 'feature-1' },
      status: 'success',
    };

    const comment = formatComment(metadata);

    expect(comment).toContain('| Bot | Git With Intent v2.0.0 |');
    expect(comment).toContain('| Triggered by | @johndoe |');
    expect(comment).toContain('| Workflow | pr-review |');
    expect(comment).toContain('| Duration | 5.5s |');
    expect(comment).toContain('| Repository | test/repo |');
    expect(comment).toContain('| Branch | feature-1 |');
  });
});

// =============================================================================
// Check Run Summary Tests
// =============================================================================

describe('formatCheckRunSummary', () => {
  it('should format check run with title and summary', () => {
    const summary: CheckRunSummary = {
      name: 'GWI Analysis',
      status: 'completed',
      conclusion: 'success',
      metadata: {
        why: 'Automated analysis',
        what: { summary: 'All checks passed' },
        who: { bot: 'Git With Intent' },
        when: { timestamp: '2024-01-15T10:00:00Z', runId: 'check-1' },
        where: {},
        evidence: { confidence: 90, testsRun: 5, testsPassed: 5 },
        status: 'success',
      },
    };

    const result = formatCheckRunSummary(summary);

    expect(result.title).toBe('✅ GWI Analysis');
    expect(result.summary).toContain('All checks passed');
    expect(result.summary).toContain('**Confidence:**');
    expect(result.summary).toContain('**Tests:** ✅ 5/5');
    expect(result.text).toContain('## ✅ Git With Intent');
  });
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('createInfoComment', () => {
  it('should create info comment with minimal params', () => {
    const comment = createInfoComment('Analysis started', 'run-info-1');

    expect(comment).toContain('## ℹ️ Git With Intent');
    expect(comment).toContain('Analysis started');
    expect(comment).toContain('| Run ID | `run-info-1` |');
  });

  it('should include optional details', () => {
    const comment = createInfoComment('Analyzing files', 'run-info-2', {
      files: ['a.ts', 'b.ts'],
      triggeredBy: 'user1',
      workflow: 'triage',
    });

    expect(comment).toContain('| Triggered by | @user1 |');
    expect(comment).toContain('| Workflow | triage |');
    expect(comment).toContain('- `a.ts`');
    expect(comment).toContain('- `b.ts`');
  });
});

describe('createSuccessComment', () => {
  it('should create success comment with evidence', () => {
    const comment = createSuccessComment(
      'Code generated successfully',
      'run-success-1',
      { confidence: 85, testsRun: 3, testsPassed: 3 },
      { files: ['new.ts'], durationMs: 2500 }
    );

    expect(comment).toContain('## ✅ Git With Intent');
    expect(comment).toContain('Code generated successfully');
    expect(comment).toContain('**Confidence:**');
    expect(comment).toContain('85%');
    expect(comment).toContain('**Tests:** ✅ 3/3');
    expect(comment).toContain('| Duration | 2.5s |');
  });
});

describe('createErrorComment', () => {
  it('should create error comment with error list', () => {
    const comment = createErrorComment(
      'Code generation failed',
      'run-error-1',
      ['Invalid syntax', 'Missing dependencies'],
      { files: ['broken.ts'] }
    );

    expect(comment).toContain('## ❌ Git With Intent');
    expect(comment).toContain('Code generation failed');
    expect(comment).toContain('**Errors:**');
    expect(comment).toContain('- ❌ Invalid syntax');
    expect(comment).toContain('- ❌ Missing dependencies');
  });
});
