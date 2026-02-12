/**
 * Agent Permission Profiles
 *
 * Defines permission sets for different agent types when running in Deno sandboxes.
 * Each profile specifies exactly what resources an agent can access.
 *
 * Security principle: Least privilege - agents only get permissions they need.
 */

import { z } from 'zod';

/**
 * Deno permission types
 */
export interface DenoPermissions {
  /** Network access: true = all, string[] = specific hosts */
  allowNet?: boolean | string[];
  /** File read access: true = all, string[] = specific paths */
  allowRead?: boolean | string[];
  /** File write access: true = all, string[] = specific paths */
  allowWrite?: boolean | string[];
  /** Environment variable access: true = all, string[] = specific vars */
  allowEnv?: boolean | string[];
  /** Subprocess execution: true = all, string[] = specific commands */
  allowRun?: boolean | string[];
  /** FFI access (native libraries) */
  allowFfi?: boolean;
  /** All permissions (dangerous - use only for trusted code) */
  allowAll?: boolean;
}

/**
 * Agent permission profile
 */
export interface AgentPermissionProfile {
  /** Profile name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Deno permission flags */
  permissions: DenoPermissions;
  /** Maximum execution time in ms */
  maxExecutionTimeMs: number;
  /** Maximum memory in MB (advisory) */
  maxMemoryMb: number;
  /** Whether this profile allows destructive operations */
  allowsDestructive: boolean;
}

/**
 * LLM API endpoints that agents may need to access
 */
const LLM_API_HOSTS = [
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'api.together.xyz',
  'api.deepseek.com',
  'api.fireworks.ai',
  'api.mistral.ai',
  'api.cohere.ai',
  'openrouter.ai',
];

/**
 * Predefined permission profiles for GWI agents
 */
export const AGENT_PERMISSIONS: Record<string, AgentPermissionProfile> = {
  /**
   * Triage Agent - Read-only analysis
   */
  triage: {
    name: 'triage',
    description: 'Read-only PR analysis and complexity scoring',
    permissions: {
      allowNet: LLM_API_HOSTS,
      allowRead: ['.'],
      allowWrite: false,
      allowEnv: ['ANTHROPIC_API_KEY', 'GOOGLE_AI_API_KEY', 'OPENAI_API_KEY'],
      allowRun: false,
      allowFfi: false,
    },
    maxExecutionTimeMs: 60000,
    maxMemoryMb: 512,
    allowsDestructive: false,
  },

  /**
   * Slop Detector Agent - Read-only analysis
   */
  'slop-detector': {
    name: 'slop-detector',
    description: 'Detect AI-generated low-quality PRs',
    permissions: {
      allowNet: LLM_API_HOSTS,
      allowRead: ['.'],
      allowWrite: false,
      allowEnv: ['ANTHROPIC_API_KEY', 'GOOGLE_AI_API_KEY', 'OPENAI_API_KEY'],
      allowRun: false,
      allowFfi: false,
    },
    maxExecutionTimeMs: 60000,
    maxMemoryMb: 512,
    allowsDestructive: false,
  },

  /**
   * Reviewer Agent - Read-only code review
   */
  reviewer: {
    name: 'reviewer',
    description: 'Generate PR review summaries',
    permissions: {
      allowNet: LLM_API_HOSTS,
      allowRead: ['.'],
      allowWrite: false,
      allowEnv: ['ANTHROPIC_API_KEY', 'GOOGLE_AI_API_KEY', 'OPENAI_API_KEY'],
      allowRun: false,
      allowFfi: false,
    },
    maxExecutionTimeMs: 120000,
    maxMemoryMb: 1024,
    allowsDestructive: false,
  },

  /**
   * Coder Agent - Can write code and run tests
   */
  coder: {
    name: 'coder',
    description: 'Generate and modify code, run tests',
    permissions: {
      allowNet: true, // Needs npm, API access
      allowRead: ['.'],
      allowWrite: ['.'],
      allowEnv: true, // Needs build env vars
      allowRun: ['npm', 'npx', 'node', 'git', 'pnpm', 'yarn', 'bun'],
      allowFfi: false,
    },
    maxExecutionTimeMs: 600000, // 10 minutes for builds
    maxMemoryMb: 4096,
    allowsDestructive: true, // Can modify files
  },

  /**
   * Resolver Agent - Merge conflict resolution
   */
  resolver: {
    name: 'resolver',
    description: 'Resolve merge conflicts',
    permissions: {
      allowNet: LLM_API_HOSTS,
      allowRead: ['.'],
      allowWrite: ['.'],
      allowEnv: ['ANTHROPIC_API_KEY', 'GOOGLE_AI_API_KEY', 'OPENAI_API_KEY'],
      allowRun: ['git'],
      allowFfi: false,
    },
    maxExecutionTimeMs: 300000,
    maxMemoryMb: 2048,
    allowsDestructive: true, // Modifies files during merge
  },

  /**
   * Orchestrator Agent - Coordinates other agents
   */
  orchestrator: {
    name: 'orchestrator',
    description: 'Coordinate multi-agent workflows',
    permissions: {
      allowNet: LLM_API_HOSTS,
      allowRead: ['.'],
      allowWrite: ['.gwi'], // Only write to .gwi directory
      allowEnv: ['ANTHROPIC_API_KEY', 'GOOGLE_AI_API_KEY', 'OPENAI_API_KEY'],
      allowRun: false,
      allowFfi: false,
    },
    maxExecutionTimeMs: 1800000, // 30 minutes for full pipelines
    maxMemoryMb: 1024,
    allowsDestructive: false,
  },

  /**
   * Minimal - For untrusted code analysis
   */
  minimal: {
    name: 'minimal',
    description: 'Minimal permissions for untrusted analysis',
    permissions: {
      allowNet: false,
      allowRead: false,
      allowWrite: false,
      allowEnv: false,
      allowRun: false,
      allowFfi: false,
    },
    maxExecutionTimeMs: 10000,
    maxMemoryMb: 256,
    allowsDestructive: false,
  },

  /**
   * Full - For trusted admin operations (use with caution)
   */
  full: {
    name: 'full',
    description: 'Full permissions for trusted operations',
    permissions: {
      allowAll: true,
    },
    maxExecutionTimeMs: 3600000, // 1 hour
    maxMemoryMb: 8192,
    allowsDestructive: true,
  },
};

/**
 * Build Deno CLI flags from a permission profile
 */
export function buildPermissionFlags(profile: AgentPermissionProfile): string[] {
  const flags: string[] = [];
  const perms = profile.permissions;

  if (perms.allowAll) {
    flags.push('-A');
    return flags;
  }

  // Network
  if (perms.allowNet === true) {
    flags.push('--allow-net');
  } else if (Array.isArray(perms.allowNet) && perms.allowNet.length > 0) {
    flags.push(`--allow-net=${perms.allowNet.join(',')}`);
  }

  // Read
  if (perms.allowRead === true) {
    flags.push('--allow-read');
  } else if (Array.isArray(perms.allowRead) && perms.allowRead.length > 0) {
    flags.push(`--allow-read=${perms.allowRead.join(',')}`);
  }

  // Write
  if (perms.allowWrite === true) {
    flags.push('--allow-write');
  } else if (Array.isArray(perms.allowWrite) && perms.allowWrite.length > 0) {
    flags.push(`--allow-write=${perms.allowWrite.join(',')}`);
  }

  // Env
  if (perms.allowEnv === true) {
    flags.push('--allow-env');
  } else if (Array.isArray(perms.allowEnv) && perms.allowEnv.length > 0) {
    flags.push(`--allow-env=${perms.allowEnv.join(',')}`);
  }

  // Run
  if (perms.allowRun === true) {
    flags.push('--allow-run');
  } else if (Array.isArray(perms.allowRun) && perms.allowRun.length > 0) {
    flags.push(`--allow-run=${perms.allowRun.join(',')}`);
  }

  // FFI
  if (perms.allowFfi) {
    flags.push('--allow-ffi');
  }

  return flags;
}

/**
 * Get permission profile for an agent type
 */
export function getAgentPermissions(agentType: string): AgentPermissionProfile {
  const profile = AGENT_PERMISSIONS[agentType];
  if (!profile) {
    // Default to minimal for unknown agents
    return AGENT_PERMISSIONS.minimal;
  }
  return profile;
}

/**
 * Check if an agent can perform destructive operations
 */
export function canAgentModify(agentType: string): boolean {
  const profile = getAgentPermissions(agentType);
  return profile.allowsDestructive;
}

/**
 * Zod schema for permission profile validation
 */
export const AgentPermissionProfileSchema = z.object({
  name: z.string(),
  description: z.string(),
  permissions: z.object({
    allowNet: z.union([z.boolean(), z.array(z.string())]).optional(),
    allowRead: z.union([z.boolean(), z.array(z.string())]).optional(),
    allowWrite: z.union([z.boolean(), z.array(z.string())]).optional(),
    allowEnv: z.union([z.boolean(), z.array(z.string())]).optional(),
    allowRun: z.union([z.boolean(), z.array(z.string())]).optional(),
    allowFfi: z.boolean().optional(),
    allowAll: z.boolean().optional(),
  }),
  maxExecutionTimeMs: z.number().positive(),
  maxMemoryMb: z.number().positive(),
  allowsDestructive: z.boolean(),
});
