/**
 * Hooks Command (Epic J - J4.2)
 *
 * Manage git hooks for local review.
 *
 * Usage:
 *   gwi hooks install       Install pre-commit hook
 *   gwi hooks uninstall     Remove pre-commit hook
 *   gwi hooks status        Check hook status
 */

import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { isGitRepository } from '@gwi/core';

// =============================================================================
// Types
// =============================================================================

export interface HooksOptions {
  /** Strict mode - block on warnings */
  strict?: boolean;
  /** JSON output */
  json?: boolean;
  /** Working directory */
  cwd?: string;
}

export interface HooksStatus {
  installed: boolean;
  strict: boolean;
  path: string;
  hasOtherHooks: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const GWI_HOOK_MARKER = 'GWI Pre-Commit Hook';

// =============================================================================
// Install Command
// =============================================================================

/**
 * Install pre-commit hook
 */
export async function hooksInstallCommand(options: HooksOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  if (!isGitRepository(cwd)) {
    console.error(chalk.red('\n  Error: Not a git repository\n'));
    process.exit(1);
  }

  const hooksDir = join(cwd, '.git', 'hooks');
  const preCommitPath = join(hooksDir, 'pre-commit');
  const strictFlag = options.strict ? ' --strict' : '';

  const preCommitHook = `#!/bin/sh
# ${GWI_HOOK_MARKER} (Epic J)
# Installed by: gwi hooks install
#
# This hook runs gwi gate to check staged changes before commit.
# Exit codes:
#   0 - Ready to commit
#   1 - Review recommended (warn only unless --strict)
#   2 - Blocked (must fix before commit)
#
# To skip this hook temporarily: git commit --no-verify
# To uninstall: gwi hooks uninstall

# Check if gwi is available
if ! command -v gwi &> /dev/null; then
  # Try npx as fallback
  if command -v npx &> /dev/null; then
    npx gwi gate${strictFlag}
    exit $?
  fi
  echo "Warning: gwi not found, skipping pre-commit check"
  exit 0
fi

gwi gate${strictFlag}
`;

  try {
    // Check for existing hook
    if (existsSync(preCommitPath)) {
      const existing = readFileSync(preCommitPath, 'utf-8');
      if (existing.includes(GWI_HOOK_MARKER)) {
        // Already installed, update it
        writeFileSync(preCommitPath, preCommitHook);
        execSync(`chmod +x "${preCommitPath}"`);

        if (options.json) {
          console.log(JSON.stringify({ status: 'updated', path: preCommitPath, strict: !!options.strict }));
        } else {
          console.log(chalk.green('\n  ✓ Pre-commit hook updated\n'));
          if (options.strict) {
            console.log(chalk.dim('    Mode: strict (blocks on warnings)'));
          }
          console.log(chalk.dim(`    Path: ${preCommitPath}\n`));
        }
        return;
      }

      // Different hook exists, append our check
      const appendedCheck = `\n\n# ${GWI_HOOK_MARKER} (appended)\ngwi gate${strictFlag}\n`;
      writeFileSync(preCommitPath, existing + appendedCheck);
      execSync(`chmod +x "${preCommitPath}"`);

      if (options.json) {
        console.log(JSON.stringify({ status: 'appended', path: preCommitPath, strict: !!options.strict }));
      } else {
        console.log(chalk.yellow('\n  ⚠ Existing hook found - appended GWI check\n'));
        console.log(chalk.dim(`    Path: ${preCommitPath}\n`));
      }
      return;
    }

    // No existing hook, create new one
    writeFileSync(preCommitPath, preCommitHook);
    execSync(`chmod +x "${preCommitPath}"`);

    if (options.json) {
      console.log(JSON.stringify({ status: 'installed', path: preCommitPath, strict: !!options.strict }));
    } else {
      console.log(chalk.green('\n  ✓ Pre-commit hook installed\n'));
      if (options.strict) {
        console.log(chalk.dim('    Mode: strict (blocks on warnings)'));
      }
      console.log(chalk.dim(`    Path: ${preCommitPath}`));
      console.log();
      console.log(chalk.dim('    Your commits will now be reviewed automatically.'));
      console.log(chalk.dim('    To skip: git commit --no-verify'));
      console.log(chalk.dim('    To remove: gwi hooks uninstall\n'));
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : String(error) }));
    } else {
      console.error(chalk.red(`\n  Error installing hook: ${error instanceof Error ? error.message : String(error)}\n`));
    }
    process.exit(1);
  }
}

// =============================================================================
// Uninstall Command
// =============================================================================

/**
 * Uninstall pre-commit hook
 */
export async function hooksUninstallCommand(options: HooksOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  if (!isGitRepository(cwd)) {
    console.error(chalk.red('\n  Error: Not a git repository\n'));
    process.exit(1);
  }

  const preCommitPath = join(cwd, '.git', 'hooks', 'pre-commit');

  try {
    if (!existsSync(preCommitPath)) {
      if (options.json) {
        console.log(JSON.stringify({ status: 'not_installed' }));
      } else {
        console.log(chalk.dim('\n  No pre-commit hook installed\n'));
      }
      return;
    }

    const existing = readFileSync(preCommitPath, 'utf-8');

    if (!existing.includes(GWI_HOOK_MARKER)) {
      if (options.json) {
        console.log(JSON.stringify({ status: 'not_gwi_hook' }));
      } else {
        console.log(chalk.yellow('\n  ⚠ Pre-commit hook exists but is not a GWI hook\n'));
        console.log(chalk.dim(`    Path: ${preCommitPath}\n`));
      }
      return;
    }

    // Check if this is a GWI-only hook or appended
    if (existing.includes('(appended)')) {
      // Remove only the appended section
      const cleanedHook = existing.replace(/\n\n# GWI Pre-Commit Hook \(appended\)\ngwi gate[^\n]*\n?/g, '');
      writeFileSync(preCommitPath, cleanedHook);

      if (options.json) {
        console.log(JSON.stringify({ status: 'removed_appended' }));
      } else {
        console.log(chalk.green('\n  ✓ GWI hook removed (other hooks preserved)\n'));
      }
      return;
    }

    // Full GWI hook - remove the file
    unlinkSync(preCommitPath);

    if (options.json) {
      console.log(JSON.stringify({ status: 'uninstalled' }));
    } else {
      console.log(chalk.green('\n  ✓ Pre-commit hook uninstalled\n'));
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : String(error) }));
    } else {
      console.error(chalk.red(`\n  Error uninstalling hook: ${error instanceof Error ? error.message : String(error)}\n`));
    }
    process.exit(1);
  }
}

// =============================================================================
// Status Command
// =============================================================================

/**
 * Check hook status
 */
export async function hooksStatusCommand(options: HooksOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  if (!isGitRepository(cwd)) {
    console.error(chalk.red('\n  Error: Not a git repository\n'));
    process.exit(1);
  }

  const preCommitPath = join(cwd, '.git', 'hooks', 'pre-commit');

  const status: HooksStatus = {
    installed: false,
    strict: false,
    path: preCommitPath,
    hasOtherHooks: false,
  };

  try {
    if (existsSync(preCommitPath)) {
      const content = readFileSync(preCommitPath, 'utf-8');

      if (content.includes(GWI_HOOK_MARKER)) {
        status.installed = true;
        status.strict = content.includes('--strict');
        status.hasOtherHooks = content.includes('(appended)');
      }
    }

    if (options.json) {
      console.log(JSON.stringify(status));
    } else {
      console.log();
      console.log(chalk.bold('  Git Hooks Status'));
      console.log();

      if (status.installed) {
        console.log(`    ${chalk.green('●')} Pre-commit hook: ${chalk.green('installed')}`);
        console.log(`    ${chalk.dim('Mode:')} ${status.strict ? 'strict' : 'normal'}`);
        if (status.hasOtherHooks) {
          console.log(`    ${chalk.dim('Note:')} Appended to existing hook`);
        }
      } else {
        console.log(`    ${chalk.dim('○')} Pre-commit hook: ${chalk.dim('not installed')}`);
      }

      console.log();
      console.log(chalk.dim(`    Path: ${preCommitPath}`));
      console.log();

      if (!status.installed) {
        console.log(chalk.dim('    To install: gwi hooks install'));
        console.log();
      }
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : String(error) }));
    } else {
      console.error(chalk.red(`\n  Error checking status: ${error instanceof Error ? error.message : String(error)}\n`));
    }
    process.exit(1);
  }
}
