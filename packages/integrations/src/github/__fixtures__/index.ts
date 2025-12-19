/**
 * GitHub HTTP Fixtures Index
 *
 * Provides structured access to recorded GitHub API HTTP interactions.
 *
 * Each fixture contains:
 * - request.json: The HTTP request (method, url, headers, body)
 * - response.json: The HTTP response (status, headers, body)
 * - meta.json: Test metadata (name, description, recordedAt)
 *
 * @module @gwi/integrations/github/fixtures
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECORDINGS_DIR = join(__dirname, 'http-recordings');

/**
 * HTTP request recorded from live interaction
 */
export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[]>;
  body?: unknown;
}

/**
 * HTTP response recorded from live interaction
 */
export interface RecordedResponse {
  status: number;
  statusText?: string;
  headers: Record<string, string | string[]>;
  body: unknown;
}

/**
 * Fixture metadata
 */
export interface FixtureMeta {
  name: string;
  description: string;
  recordedAt: string;
  category: 'read' | 'write' | 'destructive';
  apiEndpoint: string;
  notes?: string;
}

/**
 * Complete HTTP fixture
 */
export interface HttpFixture {
  name: string;
  request: RecordedRequest;
  response: RecordedResponse;
  meta: FixtureMeta;
}

/**
 * Load a single HTTP fixture by name
 */
export function loadHttpFixture(name: string): HttpFixture {
  const fixtureDir = join(RECORDINGS_DIR, name);

  if (!existsSync(fixtureDir)) {
    throw new Error(`HTTP fixture not found: ${name}`);
  }

  const request = JSON.parse(
    readFileSync(join(fixtureDir, 'request.json'), 'utf-8')
  ) as RecordedRequest;

  const response = JSON.parse(
    readFileSync(join(fixtureDir, 'response.json'), 'utf-8')
  ) as RecordedResponse;

  const meta = JSON.parse(
    readFileSync(join(fixtureDir, 'meta.json'), 'utf-8')
  ) as FixtureMeta;

  return { name, request, response, meta };
}

/**
 * Load all HTTP fixtures
 */
export function loadAllHttpFixtures(): HttpFixture[] {
  if (!existsSync(RECORDINGS_DIR)) {
    return [];
  }

  const entries = readdirSync(RECORDINGS_DIR, { withFileTypes: true });
  const fixtures: HttpFixture[] = [];

  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      existsSync(join(RECORDINGS_DIR, entry.name, 'meta.json'))
    ) {
      fixtures.push(loadHttpFixture(entry.name));
    }
  }

  return fixtures;
}

/**
 * Load fixtures by category
 */
export function loadHttpFixturesByCategory(
  category: FixtureMeta['category']
): HttpFixture[] {
  return loadAllHttpFixtures().filter((f) => f.meta.category === category);
}

/**
 * Sanitize sensitive data from fixture
 * Removes tokens, credentials, and other sensitive information
 */
export function sanitizeFixture(fixture: HttpFixture): HttpFixture {
  const sanitized = JSON.parse(JSON.stringify(fixture)) as HttpFixture;

  // Remove authorization headers
  if (sanitized.request.headers.authorization) {
    sanitized.request.headers.authorization = 'Bearer REDACTED';
  }
  if (sanitized.request.headers.Authorization) {
    sanitized.request.headers.Authorization = 'Bearer REDACTED';
  }

  // Remove any token fields in body
  if (sanitized.request.body && typeof sanitized.request.body === 'object') {
    const body = sanitized.request.body as Record<string, unknown>;
    if (body.token) {
      body.token = 'REDACTED';
    }
    if (body.access_token) {
      body.access_token = 'REDACTED';
    }
  }

  return sanitized;
}
