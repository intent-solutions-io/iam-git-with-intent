/**
 * Connector Tarball Packaging
 *
 * Phase 9: Deterministic tarball creation and extraction.
 *
 * Determinism rules:
 * - Files sorted alphabetically
 * - Timestamps normalized to Unix epoch (0)
 * - Permissions normalized (0644 files, 0755 dirs)
 * - Gzip compression level 9
 *
 * @module @gwi/core/connectors/tarball
 */

import { createHash } from 'crypto';
import { readFile, readdir, stat, mkdir, writeFile } from 'fs/promises';
import { join, relative, dirname } from 'path';
import { gzipSync, gunzipSync } from 'zlib';

// =============================================================================
// Types
// =============================================================================

/**
 * File entry in tarball
 */
interface TarEntry {
  name: string;
  content: Buffer;
  isDirectory: boolean;
}

/**
 * Tarball creation result
 */
export interface TarballResult {
  tarball: Buffer;
  checksum: string;
  files: string[];
  size: number;
}

/**
 * Extraction result
 */
export interface ExtractResult {
  files: string[];
  directories: string[];
}

// =============================================================================
// Tar Format Constants
// =============================================================================

const TAR_BLOCK_SIZE = 512;
const TAR_NAME_SIZE = 100;
const TAR_MODE_OFFSET = 100;
const TAR_UID_OFFSET = 108;
const TAR_GID_OFFSET = 116;
const TAR_SIZE_OFFSET = 124;
const TAR_MTIME_OFFSET = 136;
const TAR_CHECKSUM_OFFSET = 148;
const TAR_TYPEFLAG_OFFSET = 156;
const TAR_MAGIC_OFFSET = 257;

// =============================================================================
// Tarball Creation
// =============================================================================

/**
 * Create a deterministic tarball from a directory
 */
export async function createTarball(connectorDir: string): Promise<TarballResult> {
  const entries = await collectEntries(connectorDir, connectorDir);

  // Sort entries alphabetically for determinism
  entries.sort((a, b) => a.name.localeCompare(b.name));

  // Create tar archive
  const tarBuffer = createTarArchive(entries);

  // Gzip with max compression
  const gzippedBuffer = gzipSync(tarBuffer, { level: 9 });

  // Compute checksum of gzipped tarball
  const hash = createHash('sha256').update(gzippedBuffer).digest('hex');
  const checksum = `sha256:${hash}`;

  return {
    tarball: gzippedBuffer,
    checksum,
    files: entries.filter(e => !e.isDirectory).map(e => e.name),
    size: gzippedBuffer.length,
  };
}

/**
 * Collect all entries from a directory
 */
async function collectEntries(dir: string, baseDir: string): Promise<TarEntry[]> {
  const entries: TarEntry[] = [];
  const items = await readdir(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const relativePath = relative(baseDir, fullPath);
    const stats = await stat(fullPath);

    if (stats.isDirectory()) {
      entries.push({
        name: relativePath + '/',
        content: Buffer.alloc(0),
        isDirectory: true,
      });

      // Recurse into directory
      const subEntries = await collectEntries(fullPath, baseDir);
      entries.push(...subEntries);
    } else {
      const content = await readFile(fullPath);
      entries.push({
        name: relativePath,
        content,
        isDirectory: false,
      });
    }
  }

  return entries;
}

/**
 * Create tar archive buffer from entries
 */
function createTarArchive(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    // Create header block
    const header = createTarHeader(entry);
    blocks.push(header);

    if (!entry.isDirectory && entry.content.length > 0) {
      // Add content blocks
      blocks.push(entry.content);

      // Pad to block boundary
      const padding = TAR_BLOCK_SIZE - (entry.content.length % TAR_BLOCK_SIZE);
      if (padding < TAR_BLOCK_SIZE) {
        blocks.push(Buffer.alloc(padding));
      }
    }
  }

  // Add two empty blocks for end-of-archive
  blocks.push(Buffer.alloc(TAR_BLOCK_SIZE));
  blocks.push(Buffer.alloc(TAR_BLOCK_SIZE));

  return Buffer.concat(blocks);
}

/**
 * Create tar header for an entry
 */
function createTarHeader(entry: TarEntry): Buffer {
  const header = Buffer.alloc(TAR_BLOCK_SIZE);

  // Name (100 bytes)
  header.write(entry.name, 0, TAR_NAME_SIZE, 'utf-8');

  // Mode (8 bytes, octal)
  const mode = entry.isDirectory ? '0000755' : '0000644';
  header.write(mode + ' ', TAR_MODE_OFFSET, 8, 'utf-8');

  // UID (8 bytes, octal) - normalized to 0
  header.write('0000000 ', TAR_UID_OFFSET, 8, 'utf-8');

  // GID (8 bytes, octal) - normalized to 0
  header.write('0000000 ', TAR_GID_OFFSET, 8, 'utf-8');

  // Size (12 bytes, octal)
  const size = entry.content.length.toString(8).padStart(11, '0');
  header.write(size + ' ', TAR_SIZE_OFFSET, 12, 'utf-8');

  // Mtime (12 bytes, octal) - normalized to 0 (Unix epoch)
  header.write('00000000000 ', TAR_MTIME_OFFSET, 12, 'utf-8');

  // Checksum placeholder (8 bytes)
  header.write('        ', TAR_CHECKSUM_OFFSET, 8, 'utf-8');

  // Type flag (1 byte)
  header[TAR_TYPEFLAG_OFFSET] = entry.isDirectory ? 53 : 48; // '5' or '0'

  // Magic (6 bytes)
  header.write('ustar ', TAR_MAGIC_OFFSET, 6, 'utf-8');

  // Calculate and write checksum
  let checksum = 0;
  for (let i = 0; i < TAR_BLOCK_SIZE; i++) {
    checksum += header[i];
  }
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', TAR_CHECKSUM_OFFSET, 8, 'utf-8');

  return header;
}

// =============================================================================
// Tarball Extraction
// =============================================================================

/**
 * Extract a tarball to a directory
 */
export async function extractTarball(tarball: Buffer, destDir: string): Promise<ExtractResult> {
  // Decompress gzip
  const tarBuffer = gunzipSync(tarball);

  const result: ExtractResult = {
    files: [],
    directories: [],
  };

  let offset = 0;

  while (offset < tarBuffer.length - TAR_BLOCK_SIZE) {
    const header = tarBuffer.subarray(offset, offset + TAR_BLOCK_SIZE);
    offset += TAR_BLOCK_SIZE;

    // Check for end of archive (empty blocks)
    if (header.every(b => b === 0)) {
      break;
    }

    // Parse header
    const name = header.subarray(0, TAR_NAME_SIZE).toString('utf-8').replace(/\0.*$/, '');
    const sizeStr = header.subarray(TAR_SIZE_OFFSET, TAR_SIZE_OFFSET + 12).toString('utf-8').trim();
    const size = parseInt(sizeStr, 8) || 0;
    const typeFlag = header[TAR_TYPEFLAG_OFFSET];

    const isDirectory = typeFlag === 53 || name.endsWith('/'); // '5' or trailing slash

    const fullPath = join(destDir, name);

    if (isDirectory) {
      await mkdir(fullPath, { recursive: true });
      result.directories.push(name);
    } else {
      // Ensure parent directory exists
      await mkdir(dirname(fullPath), { recursive: true });

      // Read content
      const content = tarBuffer.subarray(offset, offset + size);
      await writeFile(fullPath, content);
      result.files.push(name);

      // Skip to next block boundary
      const paddedSize = Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
      offset += paddedSize;
    }
  }

  return result;
}

// =============================================================================
// Checksum Verification
// =============================================================================

/**
 * Compute SHA256 checksum of a buffer
 */
export function computeTarballChecksum(tarball: Buffer): string {
  const hash = createHash('sha256').update(tarball).digest('hex');
  return `sha256:${hash}`;
}

/**
 * Verify tarball checksum
 */
export function verifyTarballChecksum(tarball: Buffer, expectedChecksum: string): boolean {
  const computed = computeTarballChecksum(tarball);
  return computed === expectedChecksum;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Check if a buffer is a valid gzipped tarball
 */
export function isValidTarball(buffer: Buffer): boolean {
  // Check gzip magic bytes
  if (buffer.length < 2) return false;
  if (buffer[0] !== 0x1f || buffer[1] !== 0x8b) return false;

  try {
    // Try to decompress
    const tarBuffer = gunzipSync(buffer);

    // Check for tar magic in first header
    if (tarBuffer.length < TAR_BLOCK_SIZE) return false;
    const magic = tarBuffer.subarray(TAR_MAGIC_OFFSET, TAR_MAGIC_OFFSET + 5).toString('utf-8');
    return magic === 'ustar';
  } catch {
    return false;
  }
}
