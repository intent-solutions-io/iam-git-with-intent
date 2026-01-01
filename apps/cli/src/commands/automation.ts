/**
 * gwi config automation commands
 *
 * Manage automation triggers for issue-to-code workflows.
 * Phase 35: Customizable automation triggers.
 */

import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import {
  getTenantStore,
  type AutomationTriggers,
  type AutomationApprovalMode,
  type TenantRepo,
} from '@gwi/core';

export interface AutomationOptions {
  json?: boolean;
  tenant?: string;
  repo?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Detect current GitHub repo from git remote
 */
function detectGitHubRepo(): { owner: string; repo: string } | null {
  try {
    const remoteUrl = execSync('git remote get-url origin 2>/dev/null', {
      encoding: 'utf-8',
    }).trim();

    // Parse GitHub URL (SSH or HTTPS)
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get repo from tenant store
 */
async function getRepoFromStore(
  tenantId: string,
  githubFullName: string
): Promise<TenantRepo | null> {
  const tenantStore = getTenantStore();
  const repos = await tenantStore.listRepos(tenantId);
  return repos.find((r) => r.githubFullName === githubFullName) ?? null;
}

/**
 * Get the current automation triggers config
 */
async function getAutomationConfig(
  tenantId: string,
  githubFullName: string
): Promise<AutomationTriggers | null> {
  const repo = await getRepoFromStore(tenantId, githubFullName);
  return repo?.settings.automationTriggers ?? null;
}

/**
 * Default automation triggers
 */
const DEFAULT_TRIGGERS: AutomationTriggers = {
  labels: ['gwi-auto-code', 'gwi:autopilot'],
  commentCommands: ['/gwi generate', '/gwi code'],
  titleKeywords: [],
  bodyKeywords: [],
  approvalMode: 'smart',
  smartThreshold: 4,
  maxAutoRunsPerDay: 10,
  excludePatterns: [],
  enabled: true,
};

// =============================================================================
// Show Command
// =============================================================================

/**
 * Show current automation configuration
 */
export async function automationShowCommand(options: AutomationOptions): Promise<void> {
  const spinner = ora();

  try {
    // Detect repo
    const detected = detectGitHubRepo();
    const repoFullName = options.repo ?? (detected ? `${detected.owner}/${detected.repo}` : null);

    if (!repoFullName) {
      console.error(chalk.red('  Could not detect repository. Use --repo owner/repo'));
      process.exit(1);
    }

    const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';

    spinner.start('Loading automation configuration...');

    const config = await getAutomationConfig(tenantId, repoFullName);

    spinner.stop();

    if (options.json) {
      console.log(JSON.stringify(config ?? DEFAULT_TRIGGERS, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold(`  Automation Configuration for ${repoFullName}`));
    console.log(chalk.dim(`  Tenant: ${tenantId}`));
    console.log();

    const effective = config ?? DEFAULT_TRIGGERS;
    const isCustom = config !== null;

    // Status
    console.log(chalk.bold('  Status:'));
    const enabled = effective.enabled ?? true;
    console.log(`    Enabled:            ${enabled ? chalk.green('Yes') : chalk.red('No')}`);
    console.log(`    Configuration:      ${isCustom ? chalk.cyan('Custom') : chalk.dim('Default')}`);
    console.log();

    // Triggers
    console.log(chalk.bold('  Triggers:'));
    console.log(`    Labels:             ${effective.labels?.length ? chalk.cyan(effective.labels.join(', ')) : chalk.dim('none')}`);
    console.log(`    Comment Commands:   ${effective.commentCommands?.length ? chalk.cyan(effective.commentCommands.join(', ')) : chalk.dim('none')}`);
    console.log(`    Title Keywords:     ${effective.titleKeywords?.length ? chalk.cyan(effective.titleKeywords.join(', ')) : chalk.dim('none')}`);
    console.log(`    Body Keywords:      ${effective.bodyKeywords?.length ? chalk.cyan(effective.bodyKeywords.join(', ')) : chalk.dim('none')}`);
    console.log();

    // Approval
    console.log(chalk.bold('  Approval:'));
    const modeColors: Record<string, typeof chalk.yellow> = {
      always: chalk.yellow,
      never: chalk.red,
      smart: chalk.green,
    };
    const modeColor = modeColors[effective.approvalMode] ?? chalk.white;
    console.log(`    Mode:               ${modeColor(effective.approvalMode)}`);
    if (effective.approvalMode === 'smart') {
      console.log(`    Smart Threshold:    ${chalk.cyan(String(effective.smartThreshold ?? 4))}`);
    }
    console.log();

    // Safety
    console.log(chalk.bold('  Safety:'));
    console.log(`    Max Runs/Day:       ${chalk.cyan(String(effective.maxAutoRunsPerDay ?? 10))}`);
    console.log(`    Exclude Patterns:   ${effective.excludePatterns?.length ? chalk.dim(effective.excludePatterns.join(', ')) : chalk.dim('none')}`);
    console.log();

  } catch (error) {
    spinner.fail('Failed to load automation configuration');
    console.error(chalk.red(`  ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// =============================================================================
// Labels Commands
// =============================================================================

/**
 * Add trigger labels
 */
export async function automationLabelsAddCommand(
  labels: string[],
  options: AutomationOptions
): Promise<void> {
  const spinner = ora();

  try {
    const detected = detectGitHubRepo();
    const repoFullName = options.repo ?? (detected ? `${detected.owner}/${detected.repo}` : null);

    if (!repoFullName) {
      console.error(chalk.red('  Could not detect repository. Use --repo owner/repo'));
      process.exit(1);
    }

    const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';

    spinner.start('Updating automation labels...');

    const tenantStore = getTenantStore();
    const repo = await getRepoFromStore(tenantId, repoFullName);

    if (!repo) {
      spinner.fail(`Repository ${repoFullName} not found in tenant ${tenantId}`);
      process.exit(1);
    }

    const currentTriggers = repo.settings.automationTriggers ?? { ...DEFAULT_TRIGGERS };
    const currentLabels = currentTriggers.labels ?? [];
    const newLabels = [...new Set([...currentLabels, ...labels])];

    await tenantStore.updateRepo(tenantId, repo.id, {
      settings: {
        ...repo.settings,
        automationTriggers: {
          ...currentTriggers,
          labels: newLabels,
        },
      },
    });

    spinner.succeed('Labels updated');

    if (options.json) {
      console.log(JSON.stringify({ labels: newLabels }, null, 2));
    } else {
      console.log(chalk.green(`  Added labels: ${labels.join(', ')}`));
      console.log(chalk.dim(`  All labels: ${newLabels.join(', ')}`));
    }
  } catch (error) {
    spinner.fail('Failed to update labels');
    console.error(chalk.red(`  ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Remove trigger labels
 */
export async function automationLabelsRemoveCommand(
  labels: string[],
  options: AutomationOptions
): Promise<void> {
  const spinner = ora();

  try {
    const detected = detectGitHubRepo();
    const repoFullName = options.repo ?? (detected ? `${detected.owner}/${detected.repo}` : null);

    if (!repoFullName) {
      console.error(chalk.red('  Could not detect repository. Use --repo owner/repo'));
      process.exit(1);
    }

    const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';

    spinner.start('Updating automation labels...');

    const tenantStore = getTenantStore();
    const repo = await getRepoFromStore(tenantId, repoFullName);

    if (!repo) {
      spinner.fail(`Repository ${repoFullName} not found in tenant ${tenantId}`);
      process.exit(1);
    }

    const currentTriggers = repo.settings.automationTriggers ?? { ...DEFAULT_TRIGGERS };
    const currentLabels = currentTriggers.labels ?? [];
    const newLabels = currentLabels.filter((l) => !labels.includes(l));

    await tenantStore.updateRepo(tenantId, repo.id, {
      settings: {
        ...repo.settings,
        automationTriggers: {
          ...currentTriggers,
          labels: newLabels,
        },
      },
    });

    spinner.succeed('Labels updated');

    if (options.json) {
      console.log(JSON.stringify({ labels: newLabels }, null, 2));
    } else {
      console.log(chalk.yellow(`  Removed labels: ${labels.join(', ')}`));
      console.log(chalk.dim(`  Remaining labels: ${newLabels.length ? newLabels.join(', ') : 'none'}`));
    }
  } catch (error) {
    spinner.fail('Failed to update labels');
    console.error(chalk.red(`  ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// =============================================================================
// Commands (Comment Commands)
// =============================================================================

/**
 * Add comment commands
 */
export async function automationCommandsAddCommand(
  commands: string[],
  options: AutomationOptions
): Promise<void> {
  const spinner = ora();

  try {
    const detected = detectGitHubRepo();
    const repoFullName = options.repo ?? (detected ? `${detected.owner}/${detected.repo}` : null);

    if (!repoFullName) {
      console.error(chalk.red('  Could not detect repository. Use --repo owner/repo'));
      process.exit(1);
    }

    const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';

    spinner.start('Updating comment commands...');

    const tenantStore = getTenantStore();
    const repo = await getRepoFromStore(tenantId, repoFullName);

    if (!repo) {
      spinner.fail(`Repository ${repoFullName} not found in tenant ${tenantId}`);
      process.exit(1);
    }

    const currentTriggers = repo.settings.automationTriggers ?? { ...DEFAULT_TRIGGERS };
    const currentCommands = currentTriggers.commentCommands ?? [];
    const newCommands = [...new Set([...currentCommands, ...commands])];

    await tenantStore.updateRepo(tenantId, repo.id, {
      settings: {
        ...repo.settings,
        automationTriggers: {
          ...currentTriggers,
          commentCommands: newCommands,
        },
      },
    });

    spinner.succeed('Comment commands updated');

    if (options.json) {
      console.log(JSON.stringify({ commentCommands: newCommands }, null, 2));
    } else {
      console.log(chalk.green(`  Added commands: ${commands.join(', ')}`));
      console.log(chalk.dim(`  All commands: ${newCommands.join(', ')}`));
    }
  } catch (error) {
    spinner.fail('Failed to update comment commands');
    console.error(chalk.red(`  ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// =============================================================================
// Keywords Commands
// =============================================================================

/**
 * Add keywords (title or body)
 */
export async function automationKeywordsAddCommand(
  location: 'title' | 'body',
  keywords: string[],
  options: AutomationOptions
): Promise<void> {
  const spinner = ora();

  try {
    const detected = detectGitHubRepo();
    const repoFullName = options.repo ?? (detected ? `${detected.owner}/${detected.repo}` : null);

    if (!repoFullName) {
      console.error(chalk.red('  Could not detect repository. Use --repo owner/repo'));
      process.exit(1);
    }

    const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';

    spinner.start(`Updating ${location} keywords...`);

    const tenantStore = getTenantStore();
    const repo = await getRepoFromStore(tenantId, repoFullName);

    if (!repo) {
      spinner.fail(`Repository ${repoFullName} not found in tenant ${tenantId}`);
      process.exit(1);
    }

    const currentTriggers = repo.settings.automationTriggers ?? { ...DEFAULT_TRIGGERS };
    const field = location === 'title' ? 'titleKeywords' : 'bodyKeywords';
    const currentKeywords = currentTriggers[field] ?? [];
    const newKeywords = [...new Set([...currentKeywords, ...keywords])];

    await tenantStore.updateRepo(tenantId, repo.id, {
      settings: {
        ...repo.settings,
        automationTriggers: {
          ...currentTriggers,
          [field]: newKeywords,
        },
      },
    });

    spinner.succeed(`${location} keywords updated`);

    if (options.json) {
      console.log(JSON.stringify({ [field]: newKeywords }, null, 2));
    } else {
      console.log(chalk.green(`  Added ${location} keywords: ${keywords.join(', ')}`));
      console.log(chalk.dim(`  All ${location} keywords: ${newKeywords.length ? newKeywords.join(', ') : 'none'}`));
    }
  } catch (error) {
    spinner.fail(`Failed to update ${location} keywords`);
    console.error(chalk.red(`  ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// =============================================================================
// Approval Mode Commands
// =============================================================================

/**
 * Set approval mode
 */
export async function automationApprovalModeCommand(
  mode: string,
  options: AutomationOptions
): Promise<void> {
  const spinner = ora();

  // Validate mode
  const validModes: AutomationApprovalMode[] = ['always', 'never', 'smart'];
  if (!validModes.includes(mode as AutomationApprovalMode)) {
    console.error(chalk.red(`  Invalid approval mode: ${mode}`));
    console.error(chalk.dim(`  Valid modes: ${validModes.join(', ')}`));
    process.exit(1);
  }

  try {
    const detected = detectGitHubRepo();
    const repoFullName = options.repo ?? (detected ? `${detected.owner}/${detected.repo}` : null);

    if (!repoFullName) {
      console.error(chalk.red('  Could not detect repository. Use --repo owner/repo'));
      process.exit(1);
    }

    const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';

    spinner.start('Updating approval mode...');

    const tenantStore = getTenantStore();
    const repo = await getRepoFromStore(tenantId, repoFullName);

    if (!repo) {
      spinner.fail(`Repository ${repoFullName} not found in tenant ${tenantId}`);
      process.exit(1);
    }

    const currentTriggers = repo.settings.automationTriggers ?? { ...DEFAULT_TRIGGERS };

    await tenantStore.updateRepo(tenantId, repo.id, {
      settings: {
        ...repo.settings,
        automationTriggers: {
          ...currentTriggers,
          approvalMode: mode as AutomationApprovalMode,
        },
      },
    });

    spinner.succeed('Approval mode updated');

    const modeDescriptions: Record<string, string> = {
      always: 'Always require approval before creating PR',
      never: 'Never require approval (YOLO mode)',
      smart: 'Auto-approve if complexity < threshold, else require approval',
    };

    if (options.json) {
      console.log(JSON.stringify({ approvalMode: mode }, null, 2));
    } else {
      console.log(chalk.green(`  Approval mode set to: ${mode}`));
      console.log(chalk.dim(`  ${modeDescriptions[mode]}`));
    }
  } catch (error) {
    spinner.fail('Failed to update approval mode');
    console.error(chalk.red(`  ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Set smart threshold
 */
export async function automationSmartThresholdCommand(
  threshold: number,
  options: AutomationOptions
): Promise<void> {
  const spinner = ora();

  if (threshold < 1 || threshold > 10) {
    console.error(chalk.red('  Threshold must be between 1 and 10'));
    process.exit(1);
  }

  try {
    const detected = detectGitHubRepo();
    const repoFullName = options.repo ?? (detected ? `${detected.owner}/${detected.repo}` : null);

    if (!repoFullName) {
      console.error(chalk.red('  Could not detect repository. Use --repo owner/repo'));
      process.exit(1);
    }

    const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';

    spinner.start('Updating smart threshold...');

    const tenantStore = getTenantStore();
    const repo = await getRepoFromStore(tenantId, repoFullName);

    if (!repo) {
      spinner.fail(`Repository ${repoFullName} not found in tenant ${tenantId}`);
      process.exit(1);
    }

    const currentTriggers = repo.settings.automationTriggers ?? { ...DEFAULT_TRIGGERS };

    await tenantStore.updateRepo(tenantId, repo.id, {
      settings: {
        ...repo.settings,
        automationTriggers: {
          ...currentTriggers,
          smartThreshold: threshold,
        },
      },
    });

    spinner.succeed('Smart threshold updated');

    if (options.json) {
      console.log(JSON.stringify({ smartThreshold: threshold }, null, 2));
    } else {
      console.log(chalk.green(`  Smart threshold set to: ${threshold}`));
      console.log(chalk.dim(`  Issues with complexity >= ${threshold} will require approval`));
    }
  } catch (error) {
    spinner.fail('Failed to update smart threshold');
    console.error(chalk.red(`  ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// =============================================================================
// Rate Limit Commands
// =============================================================================

/**
 * Set max runs per day
 */
export async function automationMaxRunsCommand(
  maxRuns: number,
  options: AutomationOptions
): Promise<void> {
  const spinner = ora();

  if (maxRuns < 1 || maxRuns > 1000) {
    console.error(chalk.red('  Max runs must be between 1 and 1000'));
    process.exit(1);
  }

  try {
    const detected = detectGitHubRepo();
    const repoFullName = options.repo ?? (detected ? `${detected.owner}/${detected.repo}` : null);

    if (!repoFullName) {
      console.error(chalk.red('  Could not detect repository. Use --repo owner/repo'));
      process.exit(1);
    }

    const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';

    spinner.start('Updating max runs per day...');

    const tenantStore = getTenantStore();
    const repo = await getRepoFromStore(tenantId, repoFullName);

    if (!repo) {
      spinner.fail(`Repository ${repoFullName} not found in tenant ${tenantId}`);
      process.exit(1);
    }

    const currentTriggers = repo.settings.automationTriggers ?? { ...DEFAULT_TRIGGERS };

    await tenantStore.updateRepo(tenantId, repo.id, {
      settings: {
        ...repo.settings,
        automationTriggers: {
          ...currentTriggers,
          maxAutoRunsPerDay: maxRuns,
        },
      },
    });

    spinner.succeed('Max runs per day updated');

    if (options.json) {
      console.log(JSON.stringify({ maxAutoRunsPerDay: maxRuns }, null, 2));
    } else {
      console.log(chalk.green(`  Max runs per day set to: ${maxRuns}`));
    }
  } catch (error) {
    spinner.fail('Failed to update max runs');
    console.error(chalk.red(`  ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// =============================================================================
// Enable/Disable Commands
// =============================================================================

/**
 * Enable automation
 */
export async function automationEnableCommand(options: AutomationOptions): Promise<void> {
  const spinner = ora();

  try {
    const detected = detectGitHubRepo();
    const repoFullName = options.repo ?? (detected ? `${detected.owner}/${detected.repo}` : null);

    if (!repoFullName) {
      console.error(chalk.red('  Could not detect repository. Use --repo owner/repo'));
      process.exit(1);
    }

    const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';

    spinner.start('Enabling automation...');

    const tenantStore = getTenantStore();
    const repo = await getRepoFromStore(tenantId, repoFullName);

    if (!repo) {
      spinner.fail(`Repository ${repoFullName} not found in tenant ${tenantId}`);
      process.exit(1);
    }

    const currentTriggers = repo.settings.automationTriggers ?? { ...DEFAULT_TRIGGERS };

    await tenantStore.updateRepo(tenantId, repo.id, {
      settings: {
        ...repo.settings,
        automationTriggers: {
          ...currentTriggers,
          enabled: true,
        },
      },
    });

    spinner.succeed('Automation enabled');

    if (options.json) {
      console.log(JSON.stringify({ enabled: true }, null, 2));
    } else {
      console.log(chalk.green('  Automation is now enabled for this repository'));
    }
  } catch (error) {
    spinner.fail('Failed to enable automation');
    console.error(chalk.red(`  ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Disable automation
 */
export async function automationDisableCommand(options: AutomationOptions): Promise<void> {
  const spinner = ora();

  try {
    const detected = detectGitHubRepo();
    const repoFullName = options.repo ?? (detected ? `${detected.owner}/${detected.repo}` : null);

    if (!repoFullName) {
      console.error(chalk.red('  Could not detect repository. Use --repo owner/repo'));
      process.exit(1);
    }

    const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';

    spinner.start('Disabling automation...');

    const tenantStore = getTenantStore();
    const repo = await getRepoFromStore(tenantId, repoFullName);

    if (!repo) {
      spinner.fail(`Repository ${repoFullName} not found in tenant ${tenantId}`);
      process.exit(1);
    }

    const currentTriggers = repo.settings.automationTriggers ?? { ...DEFAULT_TRIGGERS };

    await tenantStore.updateRepo(tenantId, repo.id, {
      settings: {
        ...repo.settings,
        automationTriggers: {
          ...currentTriggers,
          enabled: false,
        },
      },
    });

    spinner.succeed('Automation disabled');

    if (options.json) {
      console.log(JSON.stringify({ enabled: false }, null, 2));
    } else {
      console.log(chalk.yellow('  Automation is now disabled for this repository'));
    }
  } catch (error) {
    spinner.fail('Failed to disable automation');
    console.error(chalk.red(`  ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}
