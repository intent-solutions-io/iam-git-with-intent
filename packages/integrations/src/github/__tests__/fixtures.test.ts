/**
 * GitHub Connector Tests with Recorded Fixtures
 *
 * Tests using VCR-style recorded HTTP fixtures for deterministic behavior.
 * Uses the fixture replayer to provide consistent GitHub API responses.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadHttpFixture,
  loadAllHttpFixtures,
  loadHttpFixturesByCategory,
} from '../__fixtures__/index.js';
import {
  createReplayer,
  type FixtureReplayer,
} from '../__fixtures__/replayer.js';

// =============================================================================
// Fixture Loading Tests
// =============================================================================

describe('Fixture Loading', () => {
  it('should load get-issue fixture', () => {
    const fixture = loadHttpFixture('get-issue');

    expect(fixture.name).toBe('get-issue');
    expect(fixture.meta.category).toBe('read');
    expect(fixture.request.method).toBe('GET');
    expect(fixture.request.url).toContain('/issues/123');
    expect(fixture.response.status).toBe(200);
    expect(fixture.response.body).toHaveProperty('number', 123);
  });

  it('should load create-branch fixture', () => {
    const fixture = loadHttpFixture('create-branch');

    expect(fixture.name).toBe('create-branch');
    expect(fixture.meta.category).toBe('destructive');
    expect(fixture.request.method).toBe('POST');
    expect(fixture.request.url).toContain('/git/refs');
    expect(fixture.response.status).toBe(201);
  });

  it('should load all fixtures', () => {
    const fixtures = loadAllHttpFixtures();

    expect(fixtures.length).toBeGreaterThanOrEqual(2);

    const fixtureNames = fixtures.map((f) => f.name);
    expect(fixtureNames).toContain('get-issue');
    expect(fixtureNames).toContain('create-branch');
  });

  it('should filter fixtures by category', () => {
    const readFixtures = loadHttpFixturesByCategory('read');
    const destructiveFixtures = loadHttpFixturesByCategory('destructive');

    expect(readFixtures.length).toBeGreaterThan(0);
    expect(destructiveFixtures.length).toBeGreaterThan(0);

    expect(readFixtures.every((f) => f.meta.category === 'read')).toBe(true);
    expect(
      destructiveFixtures.every((f) => f.meta.category === 'destructive')
    ).toBe(true);
  });
});

// =============================================================================
// Fixture Replayer Tests
// =============================================================================

describe('Fixture Replayer', () => {
  let replayer: FixtureReplayer;

  beforeEach(() => {
    replayer = createReplayer();
  });

  afterEach(() => {
    replayer.clear();
  });

  describe('Loading and Matching', () => {
    it('should load single fixture', () => {
      replayer.loadFixture('get-issue');

      const loaded = replayer.getLoadedFixtures();
      expect(loaded).toContain('get-issue');
      expect(loaded).toHaveLength(1);
    });

    it('should load multiple fixtures', () => {
      replayer.loadFixtures(['get-issue', 'create-branch']);

      const loaded = replayer.getLoadedFixtures();
      expect(loaded).toContain('get-issue');
      expect(loaded).toContain('create-branch');
      expect(loaded).toHaveLength(2);
    });

    it('should find fixture by method and URL', () => {
      replayer.loadFixture('get-issue');

      const fixture = replayer.findFixture({
        method: 'GET',
        url: 'https://api.github.com/repos/test-owner/test-repo/issues/123',
      });

      expect(fixture).toBeDefined();
      expect(fixture?.name).toBe('get-issue');
    });

    it('should find fixture by URL substring', () => {
      replayer.loadFixture('get-issue');

      const fixture = replayer.findFixture({
        method: 'GET',
        url: '/issues/123',
      });

      expect(fixture).toBeDefined();
      expect(fixture?.name).toBe('get-issue');
    });

    it('should return undefined for non-matching request', () => {
      replayer.loadFixture('get-issue');

      const fixture = replayer.findFixture({
        method: 'POST',
        url: '/issues/123',
      });

      expect(fixture).toBeUndefined();
    });
  });

  describe('Response Retrieval', () => {
    it('should get response body for matching request', () => {
      replayer.loadFixture('get-issue');

      const response = replayer.getResponse({
        method: 'GET',
        url: '/issues/123',
      });

      expect(response).toBeDefined();
      expect(response).toHaveProperty('number', 123);
      expect(response).toHaveProperty('title', 'Add new feature X');
    });

    it('should throw in strict mode when no fixture matches', () => {
      replayer.loadFixture('get-issue');

      expect(() => {
        replayer.getResponse({
          method: 'DELETE',
          url: '/issues/999',
        });
      }).toThrow('No fixture found for request');
    });

    it('should return undefined in non-strict mode when no fixture matches', () => {
      const nonStrictReplayer = createReplayer({ strict: false });
      nonStrictReplayer.loadFixture('get-issue');

      const response = nonStrictReplayer.getResponse({
        method: 'DELETE',
        url: '/issues/999',
      });

      expect(response).toBeUndefined();
    });
  });

  describe('Match Strategies', () => {
    it('should use method-url strategy by default', () => {
      replayer.loadFixture('get-issue');

      // Should match
      const match1 = replayer.findFixture({
        method: 'GET',
        url: '/issues/123',
      });
      expect(match1).toBeDefined();

      // Should not match (different method)
      const match2 = replayer.findFixture({
        method: 'POST',
        url: '/issues/123',
      });
      expect(match2).toBeUndefined();
    });

    it('should use url-only strategy', () => {
      const urlOnlyReplayer = createReplayer({ matchStrategy: 'url-only' });
      urlOnlyReplayer.loadFixture('get-issue');

      // Should match even with different method
      const match = urlOnlyReplayer.findFixture({
        method: 'POST',
        url: '/issues/123',
      });
      expect(match).toBeDefined();
    });
  });

  describe('Clear and Reset', () => {
    it('should clear all fixtures', () => {
      replayer.loadFixtures(['get-issue', 'create-branch']);

      expect(replayer.getLoadedFixtures()).toHaveLength(2);

      replayer.clear();

      expect(replayer.getLoadedFixtures()).toHaveLength(0);
    });
  });
});

// =============================================================================
// Fixture Metadata Validation
// =============================================================================

describe('Fixture Metadata Validation', () => {
  it('should have required metadata fields', () => {
    const fixtures = loadAllHttpFixtures();

    for (const fixture of fixtures) {
      expect(fixture.meta.name).toBeTruthy();
      expect(fixture.meta.description).toBeTruthy();
      expect(fixture.meta.recordedAt).toBeTruthy();
      expect(fixture.meta.category).toMatch(/^(read|write|destructive)$/);
      expect(fixture.meta.apiEndpoint).toBeTruthy();
    }
  });

  it('should have sanitized authorization headers', () => {
    const fixtures = loadAllHttpFixtures();

    for (const fixture of fixtures) {
      const authHeader =
        fixture.request.headers.authorization ||
        fixture.request.headers.Authorization;

      if (authHeader) {
        expect(authHeader).toContain('REDACTED');
        expect(authHeader).not.toMatch(/^Bearer ghp_/); // Real GitHub token pattern
        expect(authHeader).not.toMatch(/^Bearer gho_/);
      }
    }
  });

  it('should have valid HTTP status codes', () => {
    const fixtures = loadAllHttpFixtures();

    for (const fixture of fixtures) {
      expect(fixture.response.status).toBeGreaterThanOrEqual(200);
      expect(fixture.response.status).toBeLessThan(600);
    }
  });

  it('should have timestamps in ISO 8601 format', () => {
    const fixtures = loadAllHttpFixtures();

    for (const fixture of fixtures) {
      const timestamp = fixture.meta.recordedAt;
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      // Should be parseable as a date
      const date = new Date(timestamp);
      expect(date.toString()).not.toBe('Invalid Date');
    }
  });
});
