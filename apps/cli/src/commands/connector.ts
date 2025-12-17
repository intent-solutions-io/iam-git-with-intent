/**
 * Connector Command
 *
 * Phase 9: CLI commands for managing connectors.
 * Phase 10: Added publish, outdated, and update commands.
 *
 * Commands:
 *   gwi connector search <query>
 *   gwi connector info <id>
 *   gwi connector install <id>[@version]
 *   gwi connector uninstall <id>@<version>
 *   gwi connector list
 *   gwi connector publish --path <dir> --key <keyId>
 *   gwi connector outdated
 *   gwi connector update <id>[@version]
 *   gwi connector add-key <keyId> <publicKey>
 *   gwi connector list-keys
 *   gwi connector remove-key <keyId>
 *
 * @module @gwi/cli/commands/connector
 */

import chalk from 'chalk';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  createRemoteRegistry,
  installConnector,
  uninstallConnector,
  listInstalledConnectors,
  addTrustedKey,
  listTrustedKeys,
  removeTrustedKey,
  createTarball,
  // Phase 21: Real signing
  createSignedSignatureFile,
  generateKeyPair,
  // Phase 21: Federation
  createFederatedRegistry,
  listRegistries,
} from '@gwi/core';

/**
 * Connector command options
 */
export interface ConnectorOptions {
  registry?: string;
  json?: boolean;
  verbose?: boolean;
  limit?: number;
  allVersions?: boolean;
  skipSignature?: boolean;
  force?: boolean;
  description?: string;
  expires?: string;
  // Phase 10: Publish options
  path?: string;
  key?: string;
  privateKey?: string;
  dryRun?: boolean;
}

// =============================================================================
// Search Command
// =============================================================================

/**
 * Search for connectors
 */
export async function connectorSearchCommand(
  query: string,
  options: ConnectorOptions
): Promise<void> {
  const registry = createRemoteRegistry(options.registry);

  try {
    const result = await registry.search(query, {
      pageSize: options.limit ?? 20,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.connectors.length === 0) {
      console.log(chalk.yellow('\n  No connectors found.\n'));
      return;
    }

    console.log(chalk.blue.bold('\n  Connector Search Results\n'));

    for (const connector of result.connectors) {
      console.log(`  ${chalk.green(connector.id)}@${connector.latestVersion}`);
      console.log(chalk.dim(`    ${connector.description || 'No description'}`));
      if (options.verbose) {
        console.log(chalk.dim(`    Author: ${connector.author}`));
        console.log(chalk.dim(`    Capabilities: ${connector.capabilities.join(', ')}`));
        console.log(chalk.dim(`    Downloads: ${connector.downloads}`));
      }
      console.log();
    }

    console.log(chalk.dim(`  Showing ${result.connectors.length} of ${result.total} results\n`));
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// =============================================================================
// Info Command
// =============================================================================

/**
 * Get connector info
 */
export async function connectorInfoCommand(
  connectorId: string,
  options: ConnectorOptions
): Promise<void> {
  const registry = createRemoteRegistry(options.registry);

  try {
    const info = await registry.getInfo(connectorId);

    if (options.json) {
      console.log(JSON.stringify(info, null, 2));
      return;
    }

    console.log(chalk.blue.bold(`\n  ${info.displayName}`));
    console.log(chalk.dim(`  ${connectorId}\n`));

    console.log(`  ${chalk.bold('Description:')} ${info.description || 'No description'}`);
    console.log(`  ${chalk.bold('Author:')} ${info.author}`);
    console.log(`  ${chalk.bold('Latest:')} ${info.latestVersion}`);
    console.log(`  ${chalk.bold('Capabilities:')} ${info.capabilities.join(', ')}`);
    console.log(`  ${chalk.bold('Downloads:')} ${info.totalDownloads}`);

    if (options.allVersions) {
      console.log();
      console.log(chalk.bold('  Versions:'));
      for (const version of info.versions) {
        const isCurrent = version === info.latestVersion;
        console.log(`    ${isCurrent ? chalk.green('→') : ' '} ${version}`);
      }
    }

    console.log();
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// =============================================================================
// Install Command
// =============================================================================

/**
 * Install a connector
 */
export async function connectorInstallCommand(
  spec: string,
  options: ConnectorOptions
): Promise<void> {
  // Parse connector@version
  const match = spec.match(/^([a-z][a-z0-9-]*)(?:@(.+))?$/);
  if (!match) {
    console.error(chalk.red('Error:'), `Invalid connector specification: ${spec}`);
    console.error(chalk.dim('  Format: connector-id or connector-id@version'));
    process.exit(1);
  }

  const [, connectorId, version = 'latest'] = match;

  if (options.skipSignature) {
    console.log(chalk.yellow('\n  Warning: Skipping signature verification is not recommended!\n'));
  }

  console.log(chalk.blue(`\n  Installing ${connectorId}@${version}...\n`));

  try {
    const result = await installConnector(connectorId, version, {
      registryUrl: options.registry,
      skipSignature: options.skipSignature,
      force: options.force,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (!result.success) {
      console.error(chalk.red('  ✗ Installation failed'));
      console.error(chalk.dim(`    ${result.error}`));
      process.exit(1);
    }

    console.log(chalk.green('  ✓ Installed successfully'));
    console.log(chalk.dim(`    Path: ${result.installPath}`));
    if (result.receipt) {
      console.log(chalk.dim(`    Checksum: ${result.receipt.tarballChecksum}`));
      console.log(
        chalk.dim(
          `    Signature: ${result.receipt.signatureVerified ? `verified (${result.receipt.signatureKeyId})` : 'not verified'}`
        )
      );
    }
    console.log();
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// =============================================================================
// Uninstall Command
// =============================================================================

/**
 * Uninstall a connector
 */
export async function connectorUninstallCommand(
  spec: string,
  options: ConnectorOptions
): Promise<void> {
  // Parse connector@version (version required for uninstall)
  const match = spec.match(/^([a-z][a-z0-9-]*)@(.+)$/);
  if (!match) {
    console.error(chalk.red('Error:'), `Invalid specification: ${spec}`);
    console.error(chalk.dim('  Format: connector-id@version (version required)'));
    process.exit(1);
  }

  const [, connectorId, version] = match;

  console.log(chalk.blue(`\n  Uninstalling ${connectorId}@${version}...\n`));

  try {
    const result = await uninstallConnector(connectorId, version);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (!result.success) {
      console.error(chalk.red('  ✗ Uninstall failed'));
      console.error(chalk.dim(`    ${result.error}`));
      process.exit(1);
    }

    console.log(chalk.green('  ✓ Uninstalled successfully\n'));
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// =============================================================================
// List Command
// =============================================================================

/**
 * List installed connectors
 */
export async function connectorListCommand(options: ConnectorOptions): Promise<void> {
  try {
    const installed = await listInstalledConnectors();

    if (options.json) {
      console.log(JSON.stringify(installed, null, 2));
      return;
    }

    if (installed.length === 0) {
      console.log(chalk.yellow('\n  No connectors installed.\n'));
      console.log(chalk.dim('  Use `gwi connector install <id>` to install a connector.\n'));
      return;
    }

    console.log(chalk.blue.bold('\n  Installed Connectors\n'));

    for (const { id, version, receipt } of installed) {
      const sigIcon = receipt?.signatureVerified ? chalk.green('✓') : chalk.yellow('!');
      console.log(`  ${sigIcon} ${chalk.green(id)}@${version}`);

      if (options.verbose && receipt) {
        console.log(chalk.dim(`    Installed: ${new Date(receipt.installedAt).toLocaleString()}`));
        console.log(chalk.dim(`    From: ${receipt.installedFrom}`));
        console.log(chalk.dim(`    Checksum: ${receipt.tarballChecksum}`));
        if (receipt.signatureKeyId) {
          console.log(chalk.dim(`    Signed by: ${receipt.signatureKeyId}`));
        }
      }
    }

    console.log();
    console.log(chalk.dim(`  ${installed.length} connector(s) installed\n`));
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// =============================================================================
// Key Management Commands
// =============================================================================

/**
 * Add a trusted key
 */
export async function connectorAddKeyCommand(
  keyId: string,
  publicKey: string,
  options: ConnectorOptions
): Promise<void> {
  try {
    await addTrustedKey({
      keyId,
      publicKey,
      description: options.description ?? `Added via CLI on ${new Date().toISOString()}`,
      addedAt: new Date().toISOString(),
      expiresAt: options.expires,
    });

    if (options.json) {
      console.log(JSON.stringify({ success: true, keyId }));
      return;
    }

    console.log(chalk.green(`\n  ✓ Added trusted key: ${keyId}\n`));
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * List trusted keys
 */
export async function connectorListKeysCommand(options: ConnectorOptions): Promise<void> {
  try {
    const keys = await listTrustedKeys();

    if (options.json) {
      console.log(JSON.stringify(keys, null, 2));
      return;
    }

    if (keys.length === 0) {
      console.log(chalk.yellow('\n  No trusted keys configured.\n'));
      return;
    }

    console.log(chalk.blue.bold('\n  Trusted Keys\n'));

    for (const key of keys) {
      const expired = key.expiresAt && new Date(key.expiresAt) < new Date();
      const icon = expired ? chalk.red('✗') : chalk.green('✓');

      console.log(`  ${icon} ${chalk.bold(key.keyId)}`);
      console.log(chalk.dim(`    ${key.description}`));
      console.log(chalk.dim(`    Added: ${new Date(key.addedAt).toLocaleString()}`));
      if (key.expiresAt) {
        console.log(
          chalk.dim(
            `    Expires: ${new Date(key.expiresAt).toLocaleString()}${expired ? ' (EXPIRED)' : ''}`
          )
        );
      }
      console.log();
    }

    console.log(chalk.dim(`  ${keys.length} key(s) configured\n`));
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Remove a trusted key
 */
export async function connectorRemoveKeyCommand(
  keyId: string,
  options: ConnectorOptions
): Promise<void> {
  try {
    const removed = await removeTrustedKey(keyId);

    if (options.json) {
      console.log(JSON.stringify({ success: removed, keyId }));
      return;
    }

    if (!removed) {
      console.error(chalk.red(`\n  ✗ Key not found: ${keyId}\n`));
      process.exit(1);
    }

    console.log(chalk.green(`\n  ✓ Removed trusted key: ${keyId}\n`));
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// =============================================================================
// Publish Command (Phase 10 + Phase 21 enhancements)
// =============================================================================

/**
 * Publish a connector to a registry
 *
 * Phase 21: Now uses real Ed25519 signing
 */
export async function connectorPublishCommand(options: ConnectorOptions): Promise<void> {
  const connectorPath = options.path ?? process.cwd();
  const registryUrl = options.registry ?? process.env.GWI_REGISTRY_URL ?? 'http://localhost:3456';
  const keyId = options.key;
  const privateKeyBase64 = options.privateKey ?? process.env.GWI_SIGNING_KEY;

  if (!keyId) {
    console.error(chalk.red('Error:'), 'Key ID required (--key <keyId>)');
    console.error(chalk.dim('  Use: gwi connector publish --key <keyId> --private-key <base64>'));
    console.error(chalk.dim('  Or set GWI_SIGNING_KEY environment variable'));
    process.exit(1);
  }

  if (!privateKeyBase64) {
    console.error(chalk.red('Error:'), 'Private key required for signing');
    console.error(chalk.dim('  Use: --private-key <base64> or set GWI_SIGNING_KEY env var'));
    console.error(chalk.dim('\n  Generate a new keypair with: gwi connector generate-key'));
    process.exit(1);
  }

  // Load manifest
  const manifestPath = join(connectorPath, 'connector.manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(chalk.red('Error:'), `Manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  try {
    const manifestJson = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestJson);

    console.log(chalk.blue(`\n  Publishing ${manifest.id}@${manifest.version}...\n`));

    // Create tarball
    console.log(chalk.dim('  Creating tarball...'));
    const tarballResult = await createTarball(connectorPath);
    const checksum = tarballResult.checksum;
    console.log(chalk.dim(`  Checksum: ${checksum}`));

    // Phase 21: Create real Ed25519 signature
    console.log(chalk.dim('  Signing with Ed25519...'));
    const signature = await createSignedSignatureFile(keyId, checksum, privateKeyBase64);
    console.log(chalk.dim(`  Signed by: ${keyId}`));

    if (options.dryRun) {
      console.log(chalk.yellow('\n  Dry run - would publish:'));
      console.log(chalk.dim(`    Connector: ${manifest.id}@${manifest.version}`));
      console.log(chalk.dim(`    Registry: ${registryUrl}`));
      console.log(chalk.dim(`    Checksum: ${checksum}`));
      console.log(chalk.dim(`    Key ID: ${keyId}`));
      console.log(chalk.dim(`    Signature: ${signature.signature.slice(0, 32)}...`));
      console.log();
      return;
    }

    // Publish to registry
    console.log(chalk.dim('  Uploading to registry...'));
    const response = await fetch(`${registryUrl}/v1/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.REGISTRY_API_KEY ?? '',
      },
      body: JSON.stringify({
        manifest,
        tarball: tarballResult.tarball.toString('base64'),
        signature,
      }),
    });

    const result = (await response.json()) as { success: boolean; error?: string; warnings?: string[] };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (!result.success) {
      console.error(chalk.red('  ✗ Publish failed'));
      console.error(chalk.dim(`    ${result.error}`));
      process.exit(1);
    }

    console.log(chalk.green('  ✓ Published successfully'));
    console.log(chalk.dim(`    ${manifest.id}@${manifest.version}`));
    console.log(chalk.dim(`    Registry: ${registryUrl}`));

    if (result.warnings && result.warnings.length > 0) {
      console.log(chalk.yellow('\n  Warnings:'));
      for (const warning of result.warnings) {
        console.log(chalk.yellow(`    ⚠ ${warning}`));
      }
    }

    console.log();
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// =============================================================================
// Generate Key Command (Phase 21)
// =============================================================================

/**
 * Generate a new Ed25519 keypair for signing connectors
 */
export async function connectorGenerateKeyCommand(options: ConnectorOptions): Promise<void> {
  try {
    console.log(chalk.blue('\n  Generating Ed25519 keypair...\n'));

    const keyPair = await generateKeyPair();

    if (options.json) {
      console.log(JSON.stringify(keyPair, null, 2));
      return;
    }

    console.log(chalk.green('  ✓ Keypair generated\n'));
    console.log(chalk.bold('  Public Key (share this):'));
    console.log(chalk.cyan(`    ${keyPair.publicKey}`));
    console.log();
    console.log(chalk.bold('  Private Key (keep secret):'));
    console.log(chalk.yellow(`    ${keyPair.privateKey}`));
    console.log();
    console.log(chalk.dim('  To publish with this key:'));
    console.log(chalk.dim('    1. Add public key to registry trusted keys'));
    console.log(chalk.dim('    2. Set GWI_SIGNING_KEY environment variable to private key'));
    console.log(chalk.dim('    3. Use --key <your-key-id> when publishing'));
    console.log();
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// =============================================================================
// Federation Commands (Phase 21)
// =============================================================================

/**
 * List configured registries
 */
export async function connectorRegistriesCommand(options: ConnectorOptions): Promise<void> {
  try {
    const registries = await listRegistries();

    if (options.json) {
      console.log(JSON.stringify(registries, null, 2));
      return;
    }

    console.log(chalk.blue.bold('\n  Configured Registries\n'));

    if (registries.length === 0) {
      console.log(chalk.yellow('  No registries configured.\n'));
      return;
    }

    for (const registry of registries) {
      const enabledIcon = registry.enabled ? chalk.green('✓') : chalk.gray('○');
      const trustBadge =
        registry.trustLevel === 'official'
          ? chalk.green('[official]')
          : registry.trustLevel === 'enterprise'
            ? chalk.blue('[enterprise]')
            : registry.trustLevel === 'community'
              ? chalk.yellow('[community]')
              : chalk.gray('[local]');

      console.log(`  ${enabledIcon} ${chalk.bold(registry.name)} ${trustBadge}`);
      console.log(chalk.dim(`    ID: ${registry.id}`));
      console.log(chalk.dim(`    URL: ${registry.url}`));
      console.log(chalk.dim(`    Priority: ${registry.priority}`));
      if (registry.description) {
        console.log(chalk.dim(`    ${registry.description}`));
      }
      console.log();
    }
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Federated search across all enabled registries
 */
export async function connectorFederatedSearchCommand(
  query: string,
  options: ConnectorOptions
): Promise<void> {
  try {
    const federated = await createFederatedRegistry();
    const result = await federated.search(query);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(chalk.blue.bold('\n  Federated Search Results\n'));

    if (result.results.length === 0) {
      console.log(chalk.yellow('  No connectors found.\n'));
      if (result.errors.length > 0) {
        console.log(chalk.red('  Errors:'));
        for (const err of result.errors) {
          console.log(chalk.dim(`    ${err.registryId}: ${err.error}`));
        }
      }
      return;
    }

    for (const item of result.results) {
      console.log(`  ${chalk.green(item.connector.id)}@${item.connector.latestVersion}`);
      console.log(chalk.dim(`    Registry: ${item.registryName}`));
      console.log(chalk.dim(`    ${item.connector.description || 'No description'}`));
      console.log();
    }

    console.log(
      chalk.dim(`  Found ${result.total} connector(s) across ${result.registriesSearched} registry(ies)\n`)
    );
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// =============================================================================
// Outdated Command (Phase 10)
// =============================================================================

/**
 * Check for outdated connectors
 */
export async function connectorOutdatedCommand(options: ConnectorOptions): Promise<void> {
  const registry = createRemoteRegistry(options.registry);

  try {
    const installed = await listInstalledConnectors();

    if (installed.length === 0) {
      console.log(chalk.yellow('\n  No connectors installed.\n'));
      return;
    }

    console.log(chalk.blue.bold('\n  Checking for updates...\n'));

    const outdated: Array<{
      id: string;
      current: string;
      latest: string;
    }> = [];

    for (const { id, version } of installed) {
      try {
        const info = await registry.getInfo(id);
        if (info.latestVersion !== version) {
          outdated.push({
            id,
            current: version,
            latest: info.latestVersion,
          });
        }
      } catch {
        // Connector not in registry, skip
      }
    }

    if (options.json) {
      console.log(JSON.stringify(outdated, null, 2));
      return;
    }

    if (outdated.length === 0) {
      console.log(chalk.green('  All connectors are up to date!\n'));
      return;
    }

    console.log(chalk.yellow(`  ${outdated.length} connector(s) have updates available:\n`));

    for (const { id, current, latest } of outdated) {
      console.log(`  ${chalk.cyan(id)}`);
      console.log(`    ${chalk.dim(current)} → ${chalk.green(latest)}`);
      console.log();
    }

    console.log(chalk.dim('  Run `gwi connector update <id>` to update.\n'));
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// =============================================================================
// Update Command (Phase 10)
// =============================================================================

/**
 * Update a connector
 */
export async function connectorUpdateCommand(
  spec: string,
  options: ConnectorOptions
): Promise<void> {
  // Parse connector@version (version is optional, defaults to latest)
  const match = spec.match(/^([a-z][a-z0-9-]*)(?:@(.+))?$/);
  if (!match) {
    console.error(chalk.red('Error:'), `Invalid specification: ${spec}`);
    console.error(chalk.dim('  Format: connector-id or connector-id@version'));
    process.exit(1);
  }

  const [, connectorId, targetVersion = 'latest'] = match;

  // Check if installed
  const installed = await listInstalledConnectors();
  const current = installed.find((c) => c.id === connectorId);

  if (!current) {
    console.error(chalk.red('Error:'), `Connector not installed: ${connectorId}`);
    console.error(chalk.dim('  Use `gwi connector install` to install it first.'));
    process.exit(1);
  }

  // Get latest version from registry
  const registry = createRemoteRegistry(options.registry);
  let resolvedVersion = targetVersion;

  if (targetVersion === 'latest') {
    try {
      const info = await registry.getInfo(connectorId);
      resolvedVersion = info.latestVersion;
    } catch (error) {
      console.error(chalk.red('Error:'), `Failed to get latest version: ${error}`);
      process.exit(1);
    }
  }

  // Check if already at target version
  if (current.version === resolvedVersion) {
    console.log(chalk.green(`\n  ${connectorId} is already at version ${resolvedVersion}\n`));
    return;
  }

  if (options.dryRun) {
    console.log(chalk.yellow('\n  Dry run - would update:'));
    console.log(chalk.dim(`    ${connectorId}@${current.version} → ${resolvedVersion}`));
    console.log();
    return;
  }

  console.log(chalk.blue(`\n  Updating ${connectorId}...`));
  console.log(chalk.dim(`    ${current.version} → ${resolvedVersion}\n`));

  try {
    // Install new version (keeps old version)
    const result = await installConnector(connectorId, resolvedVersion, {
      registryUrl: options.registry,
      skipSignature: options.skipSignature,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (!result.success) {
      console.error(chalk.red('  ✗ Update failed'));
      console.error(chalk.dim(`    ${result.error}`));
      process.exit(1);
    }

    console.log(chalk.green('  ✓ Updated successfully'));
    console.log(chalk.dim(`    New version: ${resolvedVersion}`));
    console.log(chalk.dim(`    Path: ${result.installPath}`));
    console.log();
    console.log(chalk.dim(`  Note: Old version (${current.version}) is still installed.`));
    console.log(chalk.dim(`  Use 'gwi connector uninstall ${connectorId}@${current.version}' to remove it.\n`));
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
