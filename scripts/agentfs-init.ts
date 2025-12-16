#!/usr/bin/env npx tsx
/**
 * AgentFS Initialization Script for git-with-intent
 *
 * Initializes the AgentFS database for this repo.
 * This creates a local SQLite database in .agentfs/ for auditing agent sessions.
 *
 * Usage:
 *   npx tsx scripts/agentfs-init.ts
 *
 * Prerequisites:
 *   - npm install agentfs-sdk (already in devDependencies)
 *   - Turso CLI installed (for cloud sync, optional)
 *
 * Environment Variables (for cloud sync):
 *   - TURSO_URL: Turso database URL
 *   - TURSO_AUTH_TOKEN: Turso auth token
 *
 * After running this script, set:
 *   - GWI_AGENTFS_ENABLED=true
 *   - GWI_AGENTFS_ID=gwi
 *
 * @internal - For Intent Solutions internal development only
 */

import { AgentFS } from 'agentfs-sdk';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const AGENT_ID = 'gwi';
const PROJECT_ROOT = process.cwd();

async function initAgentFS() {
  console.log('Initializing AgentFS for git-with-intent...\n');

  // Initialize AgentFS with persistent storage
  const agent = await AgentFS.open({ id: AGENT_ID });
  console.log(`AgentFS database created: .agentfs/${AGENT_ID}.db\n`);

  // Store initial project context in KV store
  await agent.kv.set('project:name', 'git-with-intent');
  await agent.kv.set('project:version', '0.1.0');
  await agent.kv.set('project:description', 'AI-powered DevOps automation platform');
  await agent.kv.set('project:initialized_at', new Date().toISOString());

  // Store phase status
  await agent.kv.set('phase:1', { status: 'completed', name: 'CLI + Core' });
  await agent.kv.set('phase:1a', { status: 'completed', name: 'CLI + Core (Real)' });
  await agent.kv.set('phase:2', { status: 'completed', name: 'Multi-Tenant Model + API' });
  await agent.kv.set('phase:3', { status: 'completed', name: 'AgentFS/Beads Hooks' });
  await agent.kv.set('phase:4', { status: 'completed', name: 'Claude Internal Hook Protocol' });
  await agent.kv.set('phase:5', { status: 'completed', name: 'gwi-api + Gateway Skeleton' });
  await agent.kv.set('phase:6', { status: 'in_progress', name: 'Live AgentFS + Beads Wiring' });

  console.log('Stored project context in KV store');

  // Record this initialization as a tool call
  const startTime = Date.now() / 1000;
  await agent.tools.record(
    'agentfs_init',
    startTime,
    Date.now() / 1000,
    { project: 'git-with-intent', agentId: AGENT_ID },
    { status: 'initialized', dbPath: `.agentfs/${AGENT_ID}.db` }
  );

  console.log('Recorded initialization in tool call audit trail\n');

  // Create config file for reference
  const configPath = join(PROJECT_ROOT, '.agentfs', 'config.json');
  const config = {
    agentId: AGENT_ID,
    project: 'git-with-intent',
    initialized: new Date().toISOString(),
    dbPath: `.agentfs/${AGENT_ID}.db`,
    envVars: {
      GWI_AGENTFS_ENABLED: 'true',
      GWI_AGENTFS_ID: AGENT_ID,
    },
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`Config written to ${configPath}`);

  // Ensure .gitignore for db files (keep config)
  const gitignorePath = join(PROJECT_ROOT, '.agentfs', '.gitignore');
  if (!existsSync(gitignorePath)) {
    const gitignoreContent = `# AgentFS database files (local only)
*.db
*.db-wal
*.db-shm
snapshots/

# Keep config
!config.json
!.gitignore
`;
    writeFileSync(gitignorePath, gitignoreContent);
    console.log('Created .agentfs/.gitignore');
  }

  console.log('\n--- AgentFS Initialization Complete ---');
  console.log('\nTo enable AgentFS hooks, set these environment variables:');
  console.log('  export GWI_AGENTFS_ENABLED=true');
  console.log('  export GWI_AGENTFS_ID=gwi');
  console.log('\nOr add to your .env file or shell profile.\n');
}

initAgentFS().catch((error) => {
  console.error('AgentFS initialization failed:', error);
  process.exit(1);
});
