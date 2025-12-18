/**
 * Basic usage examples for @gwi/sdk
 *
 * This file demonstrates common SDK usage patterns.
 * Run with: npx tsx examples/basic-usage.ts
 */

import { GWIClient, GWIApiError } from '@gwi/sdk';

// =============================================================================
// Configuration
// =============================================================================

const API_BASE_URL = process.env.GWI_API_URL || 'http://localhost:8080';
const DEBUG_USER_ID = process.env.GWI_DEBUG_USER || 'user-demo';

// =============================================================================
// Example 1: Initialize Client
// =============================================================================

async function example1_initializeClient() {
  console.log('\n=== Example 1: Initialize Client ===\n');

  // Development mode with debug headers
  const client = new GWIClient({
    baseUrl: API_BASE_URL,
    auth: {
      debugUserId: DEBUG_USER_ID,
      debugRole: 'owner',
    },
  });

  // Check API health
  const health = await client.health();
  console.log('API Status:', health.status);
  console.log('Backend:', health.storeBackend);
  console.log('Version:', health.version);

  return client;
}

// =============================================================================
// Example 2: User and Tenants
// =============================================================================

async function example2_userAndTenants(client: GWIClient) {
  console.log('\n=== Example 2: User and Tenants ===\n');

  try {
    // Get current user info
    const { user, memberships } = await client.user.me();
    console.log(`Logged in as: ${user.displayName} (${user.email})`);
    console.log(`Memberships: ${memberships.length}`);

    // List tenants
    const { tenants } = await client.tenants.list();
    console.log(`\nYou have access to ${tenants.length} tenant(s):`);

    tenants.forEach((t) => {
      console.log(`  - ${t.tenant.displayName} (${t.role})`);
      console.log(`    Plan: ${t.tenant.plan}, Runs: ${t.tenant.runsThisMonth}`);
    });

    return tenants[0]?.tenant.id;
  } catch (error) {
    if (error instanceof GWIApiError && error.status === 404) {
      console.log('User not found - you may need to sign up first');
    } else {
      console.error('Error:', error);
    }
  }
}

// =============================================================================
// Example 3: Create Tenant
// =============================================================================

async function example3_createTenant(client: GWIClient) {
  console.log('\n=== Example 3: Create Tenant ===\n');

  try {
    const { tenant } = await client.tenants.create({
      displayName: 'Example Team',
      githubOrgLogin: 'example-org',
    });

    console.log(`Created tenant: ${tenant.displayName}`);
    console.log(`Tenant ID: ${tenant.id}`);
    console.log(`Plan: ${tenant.plan}`);

    return tenant.id;
  } catch (error) {
    if (error instanceof GWIApiError) {
      console.error(`API Error (${error.status}): ${error.message}`);
    } else {
      console.error('Error:', error);
    }
  }
}

// =============================================================================
// Example 4: Repository Management
// =============================================================================

async function example4_repositories(client: GWIClient, tenantId: string) {
  console.log('\n=== Example 4: Repository Management ===\n');

  try {
    // Connect a repository
    const repo = await client.repos.connect(tenantId, {
      repoUrl: 'https://github.com/example-org/example-repo',
      displayName: 'Example Repo',
      settings: {
        autoTriage: true,
        autoReview: true,
        autoResolve: false,
      },
    });

    console.log(`Connected repository: ${repo.displayName}`);
    console.log(`GitHub: ${repo.githubFullName}`);

    // List repositories
    const { repos } = await client.repos.list(tenantId);
    console.log(`\nTotal repositories: ${repos.length}`);

    repos.forEach((r) => {
      console.log(`  - ${r.displayName} (${r.githubFullName})`);
      console.log(`    Enabled: ${r.enabled}, Runs: ${r.totalRuns}`);
    });

    return repo.id;
  } catch (error) {
    if (error instanceof GWIApiError && error.status === 429) {
      console.error('Plan limit exceeded - upgrade your plan to add more repos');
    } else {
      console.error('Error:', error);
    }
  }
}

// =============================================================================
// Example 5: Start a Run
// =============================================================================

async function example5_startRun(client: GWIClient, tenantId: string) {
  console.log('\n=== Example 5: Start a Run ===\n');

  try {
    const run = await client.runs.start(tenantId, {
      repoUrl: 'https://github.com/example-org/example-repo',
      runType: 'TRIAGE',
      prNumber: 42,
      riskMode: 'comment_only',
    });

    console.log(`Run started: ${run.runId}`);
    console.log(`Status: ${run.status}`);
    console.log(`Message: ${run.message}`);

    // Poll for status
    console.log('\nPolling for status...');
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const status = await client.runs.get(tenantId, run.runId);
      console.log(`  [${i + 1}] Status: ${status.status}, Steps: ${status.steps.length}`);

      if (status.status === 'completed' || status.status === 'failed') {
        console.log(`\nRun ${status.status}!`);
        if (status.result) {
          console.log('Result:', status.result);
        }
        break;
      }
    }

    return run.runId;
  } catch (error) {
    if (error instanceof GWIApiError && error.status === 429) {
      console.error('Plan limit exceeded - you have used all runs this month');
      console.error('Details:', error.details);
    } else {
      console.error('Error:', error);
    }
  }
}

// =============================================================================
// Example 6: Workflow Management
// =============================================================================

async function example6_workflows(client: GWIClient, tenantId: string) {
  console.log('\n=== Example 6: Workflow Management ===\n');

  try {
    const workflow = await client.workflows.start(tenantId, {
      workflowType: 'issue-to-code',
      input: {
        issueUrl: 'https://github.com/example-org/example-repo/issues/123',
        targetBranch: 'main',
      },
    });

    console.log(`Workflow started: ${workflow.workflowId}`);
    console.log(`Status: ${workflow.status}`);

    // Get workflow status
    const status = await client.workflows.get(tenantId, workflow.workflowId);
    console.log(`\nWorkflow type: ${status.type}`);
    console.log(`Steps: ${status.steps.length}`);

    status.steps.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step.agent} - ${step.status}`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

// =============================================================================
// Example 7: Member Management
// =============================================================================

async function example7_members(client: GWIClient, tenantId: string) {
  console.log('\n=== Example 7: Member Management ===\n');

  try {
    // List current members
    const { members } = await client.members.list(tenantId);
    console.log(`Current members: ${members.length}`);

    members.forEach((m) => {
      console.log(`  - ${m.displayName || m.email} (${m.role})`);
    });

    // Invite a new member
    console.log('\nInviting a new member...');
    const { invite } = await client.members.invite(tenantId, {
      email: 'newuser@example.com',
      role: 'member',
    });

    console.log(`Invitation sent: ${invite.id}`);
    console.log(`Token: ${invite.inviteToken}`);

    // List pending invites
    const { invites } = await client.members.listInvites(tenantId);
    console.log(`\nPending invites: ${invites.length}`);
  } catch (error) {
    if (error instanceof GWIApiError && error.status === 429) {
      console.error('Member limit exceeded - upgrade your plan');
    } else {
      console.error('Error:', error);
    }
  }
}

// =============================================================================
// Example 8: Update Settings
// =============================================================================

async function example8_updateSettings(client: GWIClient, tenantId: string) {
  console.log('\n=== Example 8: Update Settings ===\n');

  try {
    const updated = await client.tenants.updateSettings(tenantId, {
      defaultRiskMode: 'suggest_patch',
      autoRunOnConflict: true,
      complexityThreshold: 3,
    });

    console.log('Settings updated:');
    console.log(`  Risk Mode: ${updated.settings.defaultRiskMode}`);
    console.log(`  Auto Run on Conflict: ${updated.settings.autoRunOnConflict}`);
    console.log(`  Complexity Threshold: ${updated.settings.complexityThreshold}`);
  } catch (error) {
    console.error('Error:', error);
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('GWI SDK Examples');
  console.log('='.repeat(60));

  try {
    // Initialize client
    const client = await example1_initializeClient();

    // User and tenants
    const tenantId = await example2_userAndTenants(client);

    if (!tenantId) {
      console.log('\nNo tenant found - creating one...');
      const newTenantId = await example3_createTenant(client);

      if (newTenantId) {
        // Repositories
        await example4_repositories(client, newTenantId);

        // Runs
        await example5_startRun(client, newTenantId);

        // Workflows
        await example6_workflows(client, newTenantId);

        // Members
        await example7_members(client, newTenantId);

        // Settings
        await example8_updateSettings(client, newTenantId);
      }
    } else {
      console.log(`\nUsing existing tenant: ${tenantId}`);

      // Run examples with existing tenant
      await example4_repositories(client, tenantId);
      await example5_startRun(client, tenantId);
      await example6_workflows(client, tenantId);
      await example7_members(client, tenantId);
      await example8_updateSettings(client, tenantId);
    }

    console.log('\n' + '='.repeat(60));
    console.log('All examples completed!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\nUnexpected error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
