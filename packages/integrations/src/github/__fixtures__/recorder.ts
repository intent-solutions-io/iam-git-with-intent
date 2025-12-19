/**
 * HTTP Fixture Recorder
 *
 * Records live GitHub API HTTP interactions for replay in tests.
 * Provides deterministic, offline-capable test fixtures.
 *
 * Usage:
 *   1. Set RECORD_FIXTURES=true environment variable
 *   2. Run tests - fixtures will be recorded to http-recordings/
 *   3. Commit fixtures to git
 *   4. Future test runs replay from fixtures
 *
 * @module @gwi/integrations/github/fixtures/recorder
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  RecordedRequest,
  RecordedResponse,
  FixtureMeta,
  HttpFixture,
} from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECORDINGS_DIR = join(__dirname, 'http-recordings');

export interface RecorderOptions {
  /**
   * Whether to record new fixtures (overwrite existing)
   */
  record?: boolean;

  /**
   * Whether to update existing fixtures if they differ
   */
  updateFixtures?: boolean;

  /**
   * Sanitize sensitive data before recording
   */
  sanitize?: boolean;
}

/**
 * Fixture recorder for GitHub API HTTP interactions
 */
export class FixtureRecorder {
  private readonly options: RecorderOptions;
  private readonly isRecording: boolean;

  constructor(options: RecorderOptions = {}) {
    this.options = {
      record: process.env.RECORD_FIXTURES === 'true',
      updateFixtures: process.env.UPDATE_FIXTURES === 'true',
      sanitize: true,
      ...options,
    };

    this.isRecording = this.options.record || this.options.updateFixtures || false;
  }

  /**
   * Record an HTTP interaction
   */
  async recordInteraction(
    name: string,
    request: RecordedRequest,
    response: RecordedResponse,
    meta: Omit<FixtureMeta, 'recordedAt'>
  ): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    const fixtureDir = join(RECORDINGS_DIR, name);

    // Check if fixture exists
    const exists = existsSync(fixtureDir);

    // Skip if exists and we're not updating
    if (exists && !this.options.updateFixtures) {
      return;
    }

    // Create directory if needed
    if (!existsSync(fixtureDir)) {
      mkdirSync(fixtureDir, { recursive: true });
    }

    // Sanitize if requested
    let sanitizedRequest = request;
    if (this.options.sanitize) {
      sanitizedRequest = this.sanitizeRequest(request);
    }

    const fixture: HttpFixture = {
      name,
      request: sanitizedRequest,
      response,
      meta: {
        ...meta,
        recordedAt: new Date().toISOString(),
      },
    };

    // Write files
    writeFileSync(
      join(fixtureDir, 'request.json'),
      JSON.stringify(sanitizedRequest, null, 2)
    );

    writeFileSync(
      join(fixtureDir, 'response.json'),
      JSON.stringify(response, null, 2)
    );

    writeFileSync(
      join(fixtureDir, 'meta.json'),
      JSON.stringify(fixture.meta, null, 2)
    );

    console.log(`Recorded fixture: ${name}`);
  }

  /**
   * Sanitize sensitive data from request
   */
  private sanitizeRequest(request: RecordedRequest): RecordedRequest {
    const sanitized = JSON.parse(JSON.stringify(request)) as RecordedRequest;

    // Remove authorization headers
    if (sanitized.headers.authorization) {
      sanitized.headers.authorization = 'Bearer REDACTED_TOKEN';
    }
    if (sanitized.headers.Authorization) {
      sanitized.headers.Authorization = 'Bearer REDACTED_TOKEN';
    }

    // Remove tokens from URL
    sanitized.url = sanitized.url.replace(
      /access_token=[^&]+/g,
      'access_token=REDACTED_TOKEN'
    );

    // Remove sensitive data from body
    if (sanitized.body && typeof sanitized.body === 'object') {
      const body = sanitized.body as Record<string, unknown>;
      if (body.token) {
        body.token = 'REDACTED_TOKEN';
      }
      if (body.access_token) {
        body.access_token = 'REDACTED_TOKEN';
      }
      if (body.client_secret) {
        body.client_secret = 'REDACTED_SECRET';
      }
    }

    return sanitized;
  }

  /**
   * Check if we should record
   */
  shouldRecord(): boolean {
    return this.isRecording;
  }
}

/**
 * Global recorder instance
 */
export const recorder = new FixtureRecorder();
