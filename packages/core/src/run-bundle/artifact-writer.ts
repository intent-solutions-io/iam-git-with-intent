/**
 * Artifact Writer
 *
 * Handles reading and writing artifacts to the .gwi/runs/<runId>/ directory.
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import type { ArtifactName } from './types.js';

/**
 * Base path for run bundles
 */
export const RUN_BUNDLES_BASE = '.gwi/runs';

/**
 * Get the full path for a run's artifact directory
 */
export function getRunDir(runId: string, basePath: string = process.cwd()): string {
  return join(basePath, RUN_BUNDLES_BASE, runId);
}

/**
 * Get the full path for a specific artifact
 */
export function getArtifactPath(runId: string, artifactName: ArtifactName, basePath: string = process.cwd()): string {
  return join(getRunDir(runId, basePath), artifactName);
}

/**
 * Ensure the run directory exists
 */
export async function ensureRunDir(runId: string, basePath: string = process.cwd()): Promise<string> {
  const runDir = getRunDir(runId, basePath);
  await fs.mkdir(runDir, { recursive: true });
  return runDir;
}

/**
 * Check if a run directory exists
 */
export async function runExists(runId: string, basePath: string = process.cwd()): Promise<boolean> {
  const runDir = getRunDir(runId, basePath);
  try {
    await fs.access(runDir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write an artifact to the run bundle
 *
 * @param runId - The run ID
 * @param artifactName - The artifact file name (e.g., 'triage.json')
 * @param content - The content to write (string or object to be JSON stringified)
 * @param basePath - Base directory (defaults to cwd)
 */
export async function writeArtifact(
  runId: string,
  artifactName: ArtifactName | string,
  content: string | object,
  basePath: string = process.cwd()
): Promise<string> {
  const artifactPath = join(getRunDir(runId, basePath), artifactName);

  // Ensure directory exists
  await fs.mkdir(dirname(artifactPath), { recursive: true });

  // Convert object to JSON string with pretty printing
  const contentStr = typeof content === 'string'
    ? content
    : JSON.stringify(content, null, 2);

  await fs.writeFile(artifactPath, contentStr, 'utf-8');

  return artifactPath;
}

/**
 * Read an artifact from the run bundle
 *
 * @param runId - The run ID
 * @param artifactName - The artifact file name
 * @param basePath - Base directory (defaults to cwd)
 * @returns The artifact content as string, or null if not found
 */
export async function readArtifact(
  runId: string,
  artifactName: ArtifactName | string,
  basePath: string = process.cwd()
): Promise<string | null> {
  const artifactPath = join(getRunDir(runId, basePath), artifactName);

  try {
    return await fs.readFile(artifactPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Read and parse a JSON artifact
 *
 * @param runId - The run ID
 * @param artifactName - The artifact file name
 * @param basePath - Base directory (defaults to cwd)
 * @returns The parsed JSON, or null if not found/invalid
 */
export async function readJsonArtifact<T = unknown>(
  runId: string,
  artifactName: ArtifactName | string,
  basePath: string = process.cwd()
): Promise<T | null> {
  const content = await readArtifact(runId, artifactName, basePath);
  if (!content) return null;

  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Check if an artifact exists
 */
export async function artifactExists(
  runId: string,
  artifactName: ArtifactName | string,
  basePath: string = process.cwd()
): Promise<boolean> {
  const artifactPath = join(getRunDir(runId, basePath), artifactName);
  try {
    await fs.access(artifactPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all artifacts in a run bundle
 */
export async function listArtifacts(
  runId: string,
  basePath: string = process.cwd()
): Promise<string[]> {
  const runDir = getRunDir(runId, basePath);

  try {
    const files = await fs.readdir(runDir);
    return files.sort();
  } catch {
    return [];
  }
}

/**
 * Compute SHA256 hash of an artifact
 */
export async function hashArtifact(
  runId: string,
  artifactName: ArtifactName | string,
  basePath: string = process.cwd()
): Promise<string | null> {
  const content = await readArtifact(runId, artifactName, basePath);
  if (!content) return null;

  const hash = createHash('sha256');
  hash.update(content);
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Compute SHA256 hash of a string
 */
export function hashString(content: string): string {
  const hash = createHash('sha256');
  hash.update(content);
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Delete a run bundle (for cleanup)
 */
export async function deleteRunBundle(
  runId: string,
  basePath: string = process.cwd()
): Promise<void> {
  const runDir = getRunDir(runId, basePath);
  await fs.rm(runDir, { recursive: true, force: true });
}

/**
 * List all run IDs in the bundles directory
 */
export async function listRuns(basePath: string = process.cwd()): Promise<string[]> {
  const bundlesDir = join(basePath, RUN_BUNDLES_BASE);

  try {
    const dirs = await fs.readdir(bundlesDir);
    // Filter to only UUIDs (basic validation)
    return dirs.filter(d => d.match(/^[a-f0-9-]{36}$/i));
  } catch {
    return [];
  }
}
