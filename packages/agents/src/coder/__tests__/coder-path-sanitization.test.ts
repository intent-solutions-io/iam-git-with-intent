/**
 * Coder Agent Path Sanitization Tests
 *
 * Verifies that LLM-generated file paths are sanitized
 * to prevent path traversal, shell injection, and absolute path writes.
 */

import { describe, it, expect } from 'vitest';

/**
 * Extracted sanitizePath logic for unit testing.
 * Mirrors the private method in CoderAgent.
 */
function sanitizePath(filePath: string): string {
  if (!filePath) return '';

  let sanitized = filePath.replace(/\\/g, '/');
  sanitized = sanitized.replace(/^\/+/, '');

  if (sanitized.includes('..')) {
    throw new Error(`Path traversal detected in LLM output: ${filePath}`);
  }

  if (/[;&|`$(){}!#]/.test(sanitized)) {
    throw new Error(`Shell metacharacters detected in LLM path: ${filePath}`);
  }

  if (sanitized.includes('\0')) {
    throw new Error(`Null byte detected in LLM path: ${filePath}`);
  }

  return sanitized;
}

describe('CoderAgent Path Sanitization', () => {
  describe('valid paths', () => {
    it('allows simple relative paths', () => {
      expect(sanitizePath('src/feature/file.ts')).toBe('src/feature/file.ts');
    });

    it('allows paths with hyphens and underscores', () => {
      expect(sanitizePath('src/my-feature/my_file.test.ts')).toBe('src/my-feature/my_file.test.ts');
    });

    it('allows paths with dots in filenames', () => {
      expect(sanitizePath('src/config.prod.ts')).toBe('src/config.prod.ts');
    });

    it('returns empty string for empty input', () => {
      expect(sanitizePath('')).toBe('');
    });
  });

  describe('path traversal rejection', () => {
    it('rejects ../ path traversal', () => {
      expect(() => sanitizePath('../../../etc/passwd')).toThrow('Path traversal detected');
    });

    it('rejects mid-path traversal', () => {
      expect(() => sanitizePath('src/../../secret.ts')).toThrow('Path traversal detected');
    });

    it('rejects Windows-style traversal normalized to unix', () => {
      expect(() => sanitizePath('src\\..\\..\\secret.ts')).toThrow('Path traversal detected');
    });
  });

  describe('absolute path stripping', () => {
    it('strips leading slash from absolute paths', () => {
      expect(sanitizePath('/etc/passwd')).toBe('etc/passwd');
    });

    it('strips multiple leading slashes', () => {
      expect(sanitizePath('///usr/bin/node')).toBe('usr/bin/node');
    });
  });

  describe('shell metacharacter rejection', () => {
    it.each([
      ['semicolon', 'file;rm -rf /'],
      ['pipe', 'file|cat /etc/passwd'],
      ['ampersand', 'file&whoami'],
      ['backtick', 'file`id`'],
      ['dollar', 'file$(id)'],
      ['parentheses', 'file(test)'],
      ['braces', 'file{a,b}'],
      ['bang', 'file!important'],
      ['hash', 'file#comment'],
    ])('rejects path with %s', (_name, path) => {
      expect(() => sanitizePath(path)).toThrow('Shell metacharacters detected');
    });
  });

  describe('null byte rejection', () => {
    it('rejects null bytes in path', () => {
      expect(() => sanitizePath('file.ts\0.jpg')).toThrow('Null byte detected');
    });
  });

  describe('backslash normalization', () => {
    it('converts Windows backslashes to forward slashes', () => {
      expect(sanitizePath('src\\feature\\file.ts')).toBe('src/feature/file.ts');
    });
  });
});
