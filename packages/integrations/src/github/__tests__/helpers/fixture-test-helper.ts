/**
 * Fixture Test Helper
 *
 * Provides utilities for testing with recorded HTTP fixtures.
 * Simplifies setup of fixture-based tests.
 */

import { vi, expect } from 'vitest';
import { createReplayer, type FixtureReplayer } from '../../__fixtures__/replayer.js';
import type { HttpFixture } from '../../__fixtures__/index.js';

/**
 * Setup fixture-based testing for GitHub connector
 */
export interface FixtureTestSetup {
  replayer: FixtureReplayer;
  mockOctokit: ReturnType<typeof createMockOctokit>;
  cleanup: () => void;
}

/**
 * Create a mock Octokit instance that uses fixtures
 */
export function createMockOctokit(replayer: FixtureReplayer) {
  return {
    rest: {
      issues: {
        get: vi.fn((params) => {
          const response = replayer.getResponse({
            method: 'GET',
            url: `/repos/${params.owner}/${params.repo}/issues/${params.issue_number}`,
          });
          return Promise.resolve({ data: response });
        }),
        createComment: vi.fn((params) => {
          const response = replayer.getResponse({
            method: 'POST',
            url: `/repos/${params.owner}/${params.repo}/issues/${params.issue_number}/comments`,
          });
          return Promise.resolve({ data: response });
        }),
        addLabels: vi.fn((params) => {
          const response = replayer.getResponse({
            method: 'POST',
            url: `/repos/${params.owner}/${params.repo}/issues/${params.issue_number}/labels`,
          });
          return Promise.resolve({ data: response });
        }),
      },
      git: {
        getRef: vi.fn((params) => {
          const response = replayer.getResponse({
            method: 'GET',
            url: `/repos/${params.owner}/${params.repo}/git/ref/${params.ref}`,
          });
          return Promise.resolve({ data: response });
        }),
        createRef: vi.fn((params) => {
          const response = replayer.getResponse({
            method: 'POST',
            url: `/repos/${params.owner}/${params.repo}/git/refs`,
          });
          return Promise.resolve({ data: response });
        }),
        createCommit: vi.fn((params) => {
          const response = replayer.getResponse({
            method: 'POST',
            url: `/repos/${params.owner}/${params.repo}/git/commits`,
          });
          return Promise.resolve({ data: response });
        }),
      },
      pulls: {
        get: vi.fn((params) => {
          const response = replayer.getResponse({
            method: 'GET',
            url: `/repos/${params.owner}/${params.repo}/pulls/${params.pull_number}`,
          });
          return Promise.resolve({ data: response });
        }),
        create: vi.fn((params) => {
          const response = replayer.getResponse({
            method: 'POST',
            url: `/repos/${params.owner}/${params.repo}/pulls`,
          });
          return Promise.resolve({ data: response });
        }),
      },
    },
  };
}

/**
 * Setup fixture-based testing environment
 */
export function setupFixtureTests(fixtureNames: string[]): FixtureTestSetup {
  const replayer = createReplayer({ strict: false });
  replayer.loadFixtures(fixtureNames);

  const mockOctokit = createMockOctokit(replayer);

  return {
    replayer,
    mockOctokit,
    cleanup: () => {
      replayer.clear();
      vi.clearAllMocks();
    },
  };
}

/**
 * Assert that a fixture was used in a test
 */
export function assertFixtureUsed(
  fixture: HttpFixture,
  mockFn: ReturnType<typeof vi.fn>
): void {
  expect(mockFn).toHaveBeenCalled();

  const calls = mockFn.mock.calls;
  const matchingCall = calls.find((call) => {
    const params = call[0];
    const url = fixture.request.url;

    // Basic check - can be enhanced
    return (
      url.includes(params.owner) &&
      url.includes(params.repo)
    );
  });

  expect(matchingCall).toBeDefined();
}

/**
 * Create a fixture-based test scenario
 */
export interface TestScenario {
  name: string;
  fixtures: string[];
  setup?: () => void;
  teardown?: () => void;
}

/**
 * Run a test scenario with fixtures
 */
export async function runFixtureScenario(
  scenario: TestScenario,
  testFn: (setup: FixtureTestSetup) => Promise<void>
): Promise<void> {
  scenario.setup?.();

  const setup = setupFixtureTests(scenario.fixtures);

  try {
    await testFn(setup);
  } finally {
    setup.cleanup();
    scenario.teardown?.();
  }
}
