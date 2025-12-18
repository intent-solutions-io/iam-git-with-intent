#!/usr/bin/env npx tsx
/**
 * AAR Generator
 *
 * Creates an After-Action Completion Report from the canonical template.
 *
 * Usage:
 *   npx tsx scripts/docs/create-aar.ts --phase 10 --slug registry-publish-updates
 *
 * Output:
 *   000-docs/NNN-AA-AACR-phase-10-registry-publish-updates.md
 *
 * @module scripts/docs/create-aar
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DOCS_DIR = join(PROJECT_ROOT, '000-docs');
const TEMPLATE_PATH = join(DOCS_DIR, '6767-AA-TMPL-after-action-report-template.md');

interface CreateAAROptions {
  phase: number;
  slug: string;
  title?: string;
}

/**
 * Find next available document number
 */
async function getNextDocNumber(): Promise<number> {
  const files = await readdir(DOCS_DIR);
  let maxNum = 0;

  for (const file of files) {
    const match = file.match(/^(\d{3})-/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum && num < 500) {
        // Exclude 6767-* special docs
        maxNum = num;
      }
    }
  }

  return maxNum + 1;
}

/**
 * Generate AAR from template
 */
async function createAAR(options: CreateAAROptions): Promise<string> {
  const { phase, slug, title } = options;

  // Check template exists
  if (!existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template not found: ${TEMPLATE_PATH}`);
  }

  // Read template
  let content = await readFile(TEMPLATE_PATH, 'utf-8');

  // Get next doc number
  const docNum = await getNextDocNumber();
  const docNumStr = docNum.toString().padStart(3, '0');

  // Generate filename
  const filename = `${docNumStr}-AA-AACR-phase-${phase}-${slug}.md`;
  const filepath = join(DOCS_DIR, filename);

  // Check if file already exists
  if (existsSync(filepath)) {
    throw new Error(`AAR already exists: ${filename}`);
  }

  // Replace template placeholders
  const phaseTitle = title || `Phase ${phase} Completion`;
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0] + ' ' +
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Chicago' }) + ' CST';

  content = content
    .replace(/# Phase \[N\]: \[Title\]/, `# Phase ${phase}: ${phaseTitle}`)
    .replace(/NNN-AA-AACR-phase-\[n\]-\[slug\]/, `${docNumStr}-AA-AACR-phase-${phase}-${slug}`)
    .replace(/\*\*Phase\*\*: \[N\]/g, `**Phase**: ${phase}`)
    .replace(/YYYY-MM-DD HH:MM CST/, dateStr)
    .replace(/\[Subphase N\.1\]/g, `[Subphase ${phase}.1]`)
    .replace(/\[Subphase N\.2\]/g, `[Subphase ${phase}.2]`);

  // Write the file
  await writeFile(filepath, content, 'utf-8');

  return filename;
}

/**
 * Parse CLI arguments
 */
function parseArgs(): CreateAAROptions {
  const args = process.argv.slice(2);
  let phase: number | undefined;
  let slug: string | undefined;
  let title: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--phase' && args[i + 1]) {
      phase = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--slug' && args[i + 1]) {
      slug = args[i + 1];
      i++;
    } else if (args[i] === '--title' && args[i + 1]) {
      title = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: npx tsx scripts/docs/create-aar.ts --phase <N> --slug <kebab-slug> [--title "Title"]

Options:
  --phase <N>      Phase number (required)
  --slug <slug>    Slug for filename (required, kebab-case)
  --title <title>  Optional title override
  --help, -h       Show this help message

Example:
  npx tsx scripts/docs/create-aar.ts --phase 10 --slug registry-publish-updates
`);
      process.exit(0);
    }
  }

  if (phase === undefined || isNaN(phase)) {
    console.error('Error: --phase is required and must be a number');
    process.exit(1);
  }

  if (!slug) {
    console.error('Error: --slug is required');
    process.exit(1);
  }

  // Validate slug is kebab-case
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
    console.error('Error: --slug must be kebab-case (lowercase letters, numbers, hyphens)');
    process.exit(1);
  }

  return { phase, slug, title };
}

async function main(): Promise<void> {
  const options = parseArgs();

  try {
    const filename = await createAAR(options);
    console.log(`Created AAR: ${filename}`);
    console.log(`Full path: ${join(DOCS_DIR, filename)}`);
  } catch (error) {
    console.error('Failed to create AAR:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
