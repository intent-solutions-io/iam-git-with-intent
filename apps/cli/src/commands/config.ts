/**
 * gwi config command
 *
 * Manage CLI configuration settings.
 * Phase 14: CLI DX improvements.
 */

import chalk from 'chalk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface ConfigOptions {
  global?: boolean;
  json?: boolean;
}

/**
 * GWI configuration structure
 */
export interface GWIConfig {
  storage: {
    backend: 'sqlite' | 'turso' | 'postgres' | 'firestore' | 'memory';
    path?: string;
    connectionString?: string;
  };
  api: {
    baseUrl: string;
    tenantId?: string;
    apiKey?: string;
  };
  github: {
    autoDetect: boolean;
    defaultOrg?: string;
  };
  defaults: {
    maxComplexity: number;
    autoApprove: boolean;
    verbose: boolean;
    jsonOutput: boolean;
  };
  agents: {
    model: 'sonnet' | 'opus' | 'haiku';
    maxTokens: number;
    temperature: number;
  };
}

const DEFAULT_CONFIG: GWIConfig = {
  storage: {
    backend: 'sqlite',
    path: '~/.gwi/data.db',
  },
  api: {
    baseUrl: 'http://localhost:8080',
  },
  github: {
    autoDetect: true,
  },
  defaults: {
    maxComplexity: 8,
    autoApprove: false,
    verbose: false,
    jsonOutput: false,
  },
  agents: {
    model: 'sonnet',
    maxTokens: 16384,
    temperature: 0.7,
  },
};

/**
 * Get config file path
 */
function getConfigPath(global: boolean): string {
  if (global) {
    const configDir = join(homedir(), '.gwi');
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    return join(configDir, 'config.json');
  }
  return join(process.cwd(), '.gwi', 'config.json');
}

/**
 * Load configuration
 */
export function loadConfig(global: boolean): GWIConfig {
  const configPath = getConfigPath(global);

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  return DEFAULT_CONFIG;
}

/**
 * Save configuration
 */
function saveConfig(config: GWIConfig, global: boolean): void {
  const configPath = getConfigPath(global);
  const dir = join(configPath, '..');

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Show current configuration
 */
export async function configShowCommand(options: ConfigOptions): Promise<void> {
  const config = loadConfig(options.global ?? true);

  if (options.json) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  const scope = options.global ? 'Global' : 'Local';

  console.log();
  console.log(chalk.bold(`  ${scope} Configuration`));
  console.log(chalk.dim(`  Path: ${getConfigPath(options.global ?? true)}`));
  console.log();

  // Storage
  console.log(chalk.bold('  Storage:'));
  console.log(`    Backend:          ${chalk.cyan(config.storage.backend)}`);
  if (config.storage.path) {
    console.log(`    Path:             ${chalk.dim(config.storage.path)}`);
  }
  console.log();

  // API
  console.log(chalk.bold('  API:'));
  console.log(`    Base URL:         ${chalk.cyan(config.api.baseUrl)}`);
  if (config.api.tenantId) {
    console.log(`    Tenant ID:        ${chalk.dim(config.api.tenantId)}`);
  }
  console.log(`    API Key:          ${config.api.apiKey ? chalk.green('Set') : chalk.dim('Not set')}`);
  console.log();

  // GitHub
  console.log(chalk.bold('  GitHub:'));
  console.log(`    Auto-detect:      ${config.github.autoDetect ? chalk.green('Yes') : chalk.dim('No')}`);
  if (config.github.defaultOrg) {
    console.log(`    Default Org:      ${chalk.dim(config.github.defaultOrg)}`);
  }
  console.log();

  // Defaults
  console.log(chalk.bold('  Defaults:'));
  console.log(`    Max Complexity:   ${chalk.cyan(config.defaults.maxComplexity.toString())}`);
  console.log(`    Auto-approve:     ${config.defaults.autoApprove ? chalk.yellow('Yes') : chalk.dim('No')}`);
  console.log(`    Verbose:          ${config.defaults.verbose ? chalk.green('Yes') : chalk.dim('No')}`);
  console.log();

  // Agents
  console.log(chalk.bold('  Agent Settings:'));
  console.log(`    Model:            ${chalk.cyan(config.agents.model)}`);
  console.log(`    Max Tokens:       ${chalk.dim(config.agents.maxTokens.toString())}`);
  console.log(`    Temperature:      ${chalk.dim(config.agents.temperature.toString())}`);
  console.log();
}

/**
 * Set a configuration value
 */
export async function configSetCommand(
  key: string,
  value: string,
  options: ConfigOptions
): Promise<void> {
  const config = loadConfig(options.global ?? true);

  // Parse the key path (e.g., "storage.backend" or "defaults.maxComplexity")
  const parts = key.split('.');

  if (parts.length !== 2) {
    console.error(chalk.red('Invalid key format. Use: section.key (e.g., storage.backend)'));
    process.exit(1);
  }

  const [section, property] = parts;

  // Validate section
  if (!(section in config)) {
    console.error(chalk.red(`Unknown section: ${section}`));
    console.error(chalk.dim(`Valid sections: ${Object.keys(config).join(', ')}`));
    process.exit(1);
  }

  // Type coercion based on existing value type
  const sectionConfig = config[section as keyof GWIConfig] as Record<string, unknown>;
  const existingValue = sectionConfig[property];

  let typedValue: unknown;

  if (typeof existingValue === 'number') {
    typedValue = parseFloat(value);
    if (isNaN(typedValue as number)) {
      console.error(chalk.red(`Value must be a number for ${key}`));
      process.exit(1);
    }
  } else if (typeof existingValue === 'boolean') {
    typedValue = value === 'true' || value === '1' || value === 'yes';
  } else {
    typedValue = value;
  }

  // Update the config
  sectionConfig[property] = typedValue;

  // Save
  saveConfig(config, options.global ?? true);

  console.log(chalk.green(`  ${key} = ${value}`));
  console.log(chalk.dim(`  Saved to ${getConfigPath(options.global ?? true)}`));
}

/**
 * Get a configuration value
 */
export async function configGetCommand(key: string, options: ConfigOptions): Promise<void> {
  const config = loadConfig(options.global ?? true);

  const parts = key.split('.');

  if (parts.length === 1) {
    // Get entire section
    const section = config[key as keyof GWIConfig];
    if (!section) {
      console.error(chalk.red(`Unknown key: ${key}`));
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(section, null, 2));
    } else {
      console.log(chalk.cyan(JSON.stringify(section, null, 2)));
    }
  } else if (parts.length === 2) {
    const [section, property] = parts;
    const sectionConfig = config[section as keyof GWIConfig] as Record<string, unknown>;

    if (!sectionConfig) {
      console.error(chalk.red(`Unknown section: ${section}`));
      process.exit(1);
    }

    const value = sectionConfig[property];

    if (value === undefined) {
      console.error(chalk.red(`Unknown property: ${property} in section ${section}`));
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(value));
    } else {
      console.log(value);
    }
  } else {
    console.error(chalk.red('Invalid key format. Use: section or section.key'));
    process.exit(1);
  }
}

/**
 * Reset configuration to defaults
 */
export async function configResetCommand(options: ConfigOptions): Promise<void> {
  saveConfig(DEFAULT_CONFIG, options.global ?? true);

  console.log(chalk.green('  Configuration reset to defaults.'));
  console.log(chalk.dim(`  Saved to ${getConfigPath(options.global ?? true)}`));
}

/**
 * List all configuration keys
 */
export async function configListCommand(options: ConfigOptions): Promise<void> {
  const config = loadConfig(options.global ?? true);

  if (options.json) {
    const keys: string[] = [];
    for (const [section, values] of Object.entries(config)) {
      for (const key of Object.keys(values as Record<string, unknown>)) {
        keys.push(`${section}.${key}`);
      }
    }
    console.log(JSON.stringify(keys, null, 2));
    return;
  }

  console.log();
  console.log(chalk.bold('  Available Configuration Keys'));
  console.log();

  for (const [section, values] of Object.entries(config)) {
    console.log(chalk.cyan(`  ${section}:`));
    for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
      const type = typeof value;
      console.log(`    ${section}.${key} ${chalk.dim(`(${type})`)}`);
    }
  }

  console.log();
  console.log(chalk.dim('  Set a value: gwi config set <key> <value>'));
  console.log(chalk.dim('  Get a value: gwi config get <key>'));
  console.log();
}
