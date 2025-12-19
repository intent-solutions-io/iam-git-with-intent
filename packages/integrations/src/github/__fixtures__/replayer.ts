/**
 * HTTP Fixture Replayer
 *
 * Replays recorded HTTP fixtures in tests for deterministic behavior.
 * Integrates with Vitest to mock Octokit responses.
 *
 * @module @gwi/integrations/github/fixtures/replayer
 */

import { loadHttpFixture, type HttpFixture } from './index.js';

/**
 * Match strategy for finding fixtures
 */
export type MatchStrategy = 'exact' | 'method-url' | 'url-only';

/**
 * Replayer options
 */
export interface ReplayerOptions {
  /**
   * How to match requests to fixtures
   */
  matchStrategy?: MatchStrategy;

  /**
   * Throw error if no matching fixture found
   */
  strict?: boolean;

  /**
   * Allow passthrough for unmatched requests
   */
  passthrough?: boolean;
}

/**
 * Request matcher
 */
export interface RequestMatcher {
  method?: string;
  url?: string | RegExp;
  headers?: Record<string, string>;
}

/**
 * Fixture replayer for tests
 */
export class FixtureReplayer {
  private readonly options: ReplayerOptions;
  private readonly fixtures: Map<string, HttpFixture>;

  constructor(options: ReplayerOptions = {}) {
    this.options = {
      matchStrategy: 'method-url',
      strict: true,
      passthrough: false,
      ...options,
    };

    this.fixtures = new Map();
  }

  /**
   * Load a fixture for replay
   */
  loadFixture(name: string): void {
    const fixture = loadHttpFixture(name);
    this.fixtures.set(name, fixture);
  }

  /**
   * Load multiple fixtures
   */
  loadFixtures(names: string[]): void {
    for (const name of names) {
      this.loadFixture(name);
    }
  }

  /**
   * Find matching fixture for a request
   */
  findFixture(matcher: RequestMatcher): HttpFixture | undefined {
    for (const fixture of this.fixtures.values()) {
      if (this.matches(fixture, matcher)) {
        return fixture;
      }
    }

    return undefined;
  }

  /**
   * Get response for a request (throws if not found in strict mode)
   */
  getResponse(matcher: RequestMatcher): unknown {
    const fixture = this.findFixture(matcher);

    if (!fixture) {
      if (this.options.strict) {
        throw new Error(
          `No fixture found for request: ${JSON.stringify(matcher)}`
        );
      }
      return undefined;
    }

    return fixture.response.body;
  }

  /**
   * Check if request matches fixture
   */
  private matches(fixture: HttpFixture, matcher: RequestMatcher): boolean {
    switch (this.options.matchStrategy) {
      case 'exact':
        return this.exactMatch(fixture, matcher);
      case 'method-url':
        return this.methodUrlMatch(fixture, matcher);
      case 'url-only':
        return this.urlMatch(fixture, matcher);
      default:
        return false;
    }
  }

  /**
   * Exact match (method, URL, and headers)
   */
  private exactMatch(fixture: HttpFixture, matcher: RequestMatcher): boolean {
    if (matcher.method && fixture.request.method !== matcher.method) {
      return false;
    }

    if (!this.urlMatches(fixture.request.url, matcher.url)) {
      return false;
    }

    if (matcher.headers) {
      for (const [key, value] of Object.entries(matcher.headers)) {
        if (fixture.request.headers[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Method + URL match
   */
  private methodUrlMatch(
    fixture: HttpFixture,
    matcher: RequestMatcher
  ): boolean {
    if (matcher.method && fixture.request.method !== matcher.method) {
      return false;
    }

    return this.urlMatches(fixture.request.url, matcher.url);
  }

  /**
   * URL-only match
   */
  private urlMatch(fixture: HttpFixture, matcher: RequestMatcher): boolean {
    return this.urlMatches(fixture.request.url, matcher.url);
  }

  /**
   * Check if URL matches
   */
  private urlMatches(
    fixtureUrl: string,
    matcherUrl: string | RegExp | undefined
  ): boolean {
    if (!matcherUrl) {
      return true;
    }

    if (typeof matcherUrl === 'string') {
      return fixtureUrl === matcherUrl || fixtureUrl.includes(matcherUrl);
    }

    return matcherUrl.test(fixtureUrl);
  }

  /**
   * Clear all loaded fixtures
   */
  clear(): void {
    this.fixtures.clear();
  }

  /**
   * Get all loaded fixture names
   */
  getLoadedFixtures(): string[] {
    return Array.from(this.fixtures.keys());
  }
}

/**
 * Create a replayer for Vitest tests
 */
export function createReplayer(options?: ReplayerOptions): FixtureReplayer {
  return new FixtureReplayer(options);
}
