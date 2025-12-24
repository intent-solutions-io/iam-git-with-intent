/**
 * E2E Test Data Fixtures
 *
 * Provides factory functions for creating test data:
 * - Tenants
 * - Users
 * - Repositories
 * - Workflow runs
 * - Memberships
 */

import type {
  Tenant,
  User,
  Membership,
  TenantRole,
  PlanTier,
  TenantStatus,
  MembershipStatus,
  UserPreferences,
} from '@gwi/core';

/**
 * Counter for generating unique IDs
 */
let idCounter = 0;

/**
 * Generate a unique ID for testing
 */
export function generateId(prefix = 'test'): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

/**
 * Reset ID counter (useful between tests)
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

/**
 * Tenant fixture options
 */
export interface TenantFixtureOptions {
  id?: string;
  displayName?: string;
  githubOrgId?: number;
  githubOrgLogin?: string;
  installationId?: number;
  installedBy?: string;
  plan?: PlanTier;
  status?: TenantStatus;
}

/**
 * Create a tenant fixture
 */
export function createTenantFixture(options: TenantFixtureOptions = {}): Tenant {
  const id = options.id ?? generateId('tenant');
  const displayName = options.displayName ?? `Test Tenant ${id}`;
  const githubOrgLogin = options.githubOrgLogin ?? id.toLowerCase().replace(/\s+/g, '-');

  return {
    id,
    schemaVersion: 1,
    githubOrgId: options.githubOrgId ?? Math.floor(Math.random() * 1000000),
    githubOrgLogin,
    displayName,
    installationId: options.installationId ?? Math.floor(Math.random() * 1000000),
    installedAt: new Date(),
    installedBy: options.installedBy ?? 'test-installer',
    status: options.status ?? 'active',
    plan: options.plan ?? 'pro',
    planLimits: {
      runs: 1000,
      repos: 10,
      members: 5,
    },
    settings: {
      defaultRiskMode: 'suggest_patch',
      defaultTriageModel: 'gemini-flash',
      defaultCodeModel: 'claude-sonnet',
      complexityThreshold: 50,
      maxRunDuration: 1800,
      enableAutofix: true,
    },
    betaFeatures: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * User fixture options
 */
export interface UserFixtureOptions {
  id?: string;
  email?: string;
  displayName?: string;
  githubUserId?: number;
  githubLogin?: string;
  githubAvatarUrl?: string;
}

/**
 * Create a user fixture
 */
export function createUserFixture(options: UserFixtureOptions = {}): User {
  const id = options.id ?? generateId('user');
  const displayName = options.displayName ?? `Test User ${id}`;
  const email = options.email ?? `${id}@example.com`;
  const githubLogin = options.githubLogin ?? id.toLowerCase().replace(/\s+/g, '-');

  return {
    id,
    schemaVersion: 1,
    githubUserId: options.githubUserId ?? Math.floor(Math.random() * 1000000),
    githubLogin,
    githubAvatarUrl: options.githubAvatarUrl,
    displayName,
    email,
    preferences: {
      notificationsEnabled: true,
      theme: 'system',
    },
    createdAt: new Date(),
    lastLoginAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Membership fixture options
 */
export interface MembershipFixtureOptions {
  userId?: string;
  tenantId?: string;
  role?: TenantRole;
  status?: MembershipStatus;
}

/**
 * Create a membership fixture
 */
export function createMembershipFixture(options: MembershipFixtureOptions = {}): Membership {
  const userId = options.userId ?? generateId('user');
  const tenantId = options.tenantId ?? generateId('tenant');

  return {
    id: `${userId}_${tenantId}`,
    schemaVersion: 1,
    userId,
    tenantId,
    role: options.role ?? 'member',
    status: options.status ?? 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Repository fixture options
 */
export interface RepositoryFixtureOptions {
  owner?: string;
  name?: string;
  fullName?: string;
  url?: string;
  defaultBranch?: string;
  private?: boolean;
}

/**
 * Create a repository fixture
 */
export function createRepositoryFixture(options: RepositoryFixtureOptions = {}): {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  private: boolean;
} {
  const owner = options.owner ?? 'testorg';
  const name = options.name ?? 'testrepo';
  const fullName = options.fullName ?? `${owner}/${name}`;

  return {
    owner,
    name,
    fullName,
    url: options.url ?? `https://github.com/${fullName}`,
    defaultBranch: options.defaultBranch ?? 'main',
    private: options.private ?? false,
  };
}

/**
 * Workflow input fixture options
 */
export interface WorkflowInputFixtureOptions {
  issueUrl?: string;
  issueNumber?: number;
  issueTitle?: string;
  issueBody?: string;
  targetBranch?: string;
  owner?: string;
  repo?: string;
}

/**
 * Create a workflow input fixture for issue-to-code workflow
 */
export function createIssueToCodeInput(options: WorkflowInputFixtureOptions = {}): {
  issue: {
    url: string;
    number: number;
    title: string;
    body: string;
    owner: string;
    repo: string;
  };
  targetBranch: string;
} {
  const owner = options.owner ?? 'testorg';
  const repo = options.repo ?? 'testrepo';
  const number = options.issueNumber ?? 1;

  return {
    issue: {
      url: options.issueUrl ?? `https://github.com/${owner}/${repo}/issues/${number}`,
      number,
      title: options.issueTitle ?? 'Test Issue',
      body: options.issueBody ?? 'Test issue body',
      owner,
      repo,
    },
    targetBranch: options.targetBranch ?? 'main',
  };
}

/**
 * Test scenario: Complete tenant with user and repository
 */
export interface CompleteTestScenario {
  tenant: Tenant;
  user: User;
  membership: Membership;
  repository: {
    owner: string;
    name: string;
    fullName: string;
    url: string;
    defaultBranch: string;
    private: boolean;
  };
}

/**
 * Create a complete test scenario with tenant, user, membership, and repository
 */
export function createCompleteScenario(options: {
  tenantOptions?: TenantFixtureOptions;
  userOptions?: UserFixtureOptions;
  membershipRole?: MembershipRole;
  repoOptions?: RepositoryFixtureOptions;
} = {}): CompleteTestScenario {
  const tenant = createTenantFixture(options.tenantOptions);
  const user = createUserFixture(options.userOptions);
  const membership = createMembershipFixture({
    userId: user.id,
    tenantId: tenant.id,
    role: options.membershipRole ?? 'owner',
  });
  const repository = createRepositoryFixture(options.repoOptions);

  return {
    tenant,
    user,
    membership,
    repository,
  };
}

/**
 * Common test scenarios
 */
export const scenarios = {
  /**
   * Solo developer scenario - single user owns tenant
   */
  soloDeveloper(): CompleteTestScenario {
    return createCompleteScenario({
      tenantOptions: {
        displayName: 'Solo Dev',
        plan: 'free',
      },
      userOptions: {
        displayName: 'Solo Developer',
        email: 'solo@dev.com',
      },
      membershipRole: 'owner',
    });
  },

  /**
   * Team scenario - multiple members with different roles
   */
  team(): {
    tenant: Tenant;
    owner: User;
    admin: User;
    member: User;
    memberships: Membership[];
    repository: ReturnType<typeof createRepositoryFixture>;
  } {
    const tenant = createTenantFixture({
      displayName: 'Team Org',
      plan: 'team',
    });

    const owner = createUserFixture({
      displayName: 'Team Owner',
      email: 'owner@team.com',
    });

    const admin = createUserFixture({
      displayName: 'Team Admin',
      email: 'admin@team.com',
    });

    const member = createUserFixture({
      displayName: 'Team Member',
      email: 'member@team.com',
    });

    const memberships = [
      createMembershipFixture({
        userId: owner.id,
        tenantId: tenant.id,
        role: 'owner',
      }),
      createMembershipFixture({
        userId: admin.id,
        tenantId: tenant.id,
        role: 'admin',
      }),
      createMembershipFixture({
        userId: member.id,
        tenantId: tenant.id,
        role: 'member',
      }),
    ];

    const repository = createRepositoryFixture({
      owner: 'teamorg',
      name: 'project',
    });

    return {
      tenant,
      owner,
      admin,
      member,
      memberships,
      repository,
    };
  },

  /**
   * Enterprise scenario - large organization with complex setup
   */
  enterprise(): {
    tenant: Tenant;
    users: User[];
    memberships: Membership[];
    repositories: ReturnType<typeof createRepositoryFixture>[];
  } {
    const tenant = createTenantFixture({
      displayName: 'Enterprise Corp',
      plan: 'enterprise',
    });

    const users = Array.from({ length: 10 }, (_, i) => createUserFixture({
      displayName: `Enterprise User ${i + 1}`,
      email: `user${i + 1}@enterprise.com`,
    }));

    const memberships = users.map((user, i) => createMembershipFixture({
      userId: user.id,
      tenantId: tenant.id,
      role: i === 0 ? 'owner' : i < 3 ? 'admin' : 'member',
    }));

    const repositories = Array.from({ length: 5 }, (_, i) => createRepositoryFixture({
      owner: 'enterprise-corp',
      name: `project-${i + 1}`,
    }));

    return {
      tenant,
      users,
      memberships,
      repositories,
    };
  },

  /**
   * Multi-tenant scenario - user belongs to multiple tenants
   */
  multiTenant(): {
    user: User;
    tenants: Tenant[];
    memberships: Membership[];
  } {
    const user = createUserFixture({
      displayName: 'Multi-tenant User',
      email: 'multi@tenant.com',
    });

    const tenants = [
      createTenantFixture({ displayName: 'Personal', plan: 'free' }),
      createTenantFixture({ displayName: 'Work', plan: 'team' }),
      createTenantFixture({ displayName: 'Client', plan: 'pro' }),
    ];

    const memberships = tenants.map((tenant, i) => createMembershipFixture({
      userId: user.id,
      tenantId: tenant.id,
      role: i === 0 ? 'owner' : 'member',
    }));

    return {
      user,
      tenants,
      memberships,
    };
  },
};

/**
 * Batch creation helpers
 */
export const batch = {
  /**
   * Create multiple tenants
   */
  tenants(count: number, options?: TenantFixtureOptions): Tenant[] {
    return Array.from({ length: count }, () => createTenantFixture(options));
  },

  /**
   * Create multiple users
   */
  users(count: number, options?: UserFixtureOptions): User[] {
    return Array.from({ length: count }, () => createUserFixture(options));
  },

  /**
   * Create multiple repositories
   */
  repositories(count: number, options?: RepositoryFixtureOptions): ReturnType<typeof createRepositoryFixture>[] {
    return Array.from({ length: count }, () => createRepositoryFixture(options));
  },
};
