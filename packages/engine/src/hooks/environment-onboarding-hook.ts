/**
 * Environment Onboarding Hook
 *
 * Harness Engineering Pattern 2: Context Engineering (Environment Onboarding)
 *
 * Scans repository structure on run start to discover language, framework,
 * test runner, and project layout. Injects findings into context metadata
 * so all subsequent agent steps have environmental awareness without
 * wasting cycles on discovery.
 *
 * @module @gwi/engine/hooks
 */

import { getLogger } from '@gwi/core';
import type { AgentHook, AgentRunContext } from './types.js';

const logger = getLogger('environment-onboarding-hook');

// =============================================================================
// Types
// =============================================================================

/**
 * Discovered environment information
 */
export interface EnvironmentProfile {
  /** Primary language(s) detected */
  languages: string[];
  /** Frameworks/libraries detected */
  frameworks: string[];
  /** Package managers detected */
  packageManagers: string[];
  /** Test runners detected */
  testRunners: string[];
  /** Build tools detected */
  buildTools: string[];
  /** Whether the project is a monorepo */
  isMonorepo: boolean;
  /** Key config files found */
  configFiles: string[];
  /** Repository root (if available) */
  repoRoot?: string;
}

/**
 * Configuration for environment onboarding
 */
export interface EnvironmentOnboardingConfig {
  /** Whether to inject profile into all step contexts. @default true */
  injectIntoSteps: boolean;
  /** Callback when environment is profiled */
  onProfiled?: (profile: EnvironmentProfile) => Promise<void>;
}

/**
 * Default configuration
 */
export const DEFAULT_ENV_ONBOARDING_CONFIG: EnvironmentOnboardingConfig = {
  injectIntoSteps: true,
};

// =============================================================================
// Detection Rules
// =============================================================================

/**
 * Map of config files to what they indicate
 */
const CONFIG_FILE_SIGNALS: Array<{
  file: string;
  language?: string;
  framework?: string;
  packageManager?: string;
  testRunner?: string;
  buildTool?: string;
  monorepo?: boolean;
}> = [
  // JavaScript/TypeScript ecosystem
  { file: 'package.json', language: 'typescript', packageManager: 'npm' },
  { file: 'package-lock.json', packageManager: 'npm' },
  { file: 'yarn.lock', packageManager: 'yarn' },
  { file: 'pnpm-lock.yaml', packageManager: 'pnpm' },
  { file: 'bun.lockb', packageManager: 'bun' },
  { file: 'tsconfig.json', language: 'typescript' },
  { file: 'vitest.config.ts', testRunner: 'vitest' },
  { file: 'vitest.config.js', testRunner: 'vitest' },
  { file: 'jest.config.ts', testRunner: 'jest' },
  { file: 'jest.config.js', testRunner: 'jest' },
  { file: '.eslintrc.json', buildTool: 'eslint' },
  { file: 'eslint.config.js', buildTool: 'eslint' },
  { file: 'turbo.json', buildTool: 'turbo', monorepo: true },
  { file: 'nx.json', buildTool: 'nx', monorepo: true },
  { file: 'lerna.json', monorepo: true },
  { file: 'next.config.js', framework: 'nextjs' },
  { file: 'next.config.ts', framework: 'nextjs' },
  { file: 'vite.config.ts', buildTool: 'vite' },
  { file: 'webpack.config.js', buildTool: 'webpack' },

  // Python ecosystem
  { file: 'pyproject.toml', language: 'python', packageManager: 'pip' },
  { file: 'setup.py', language: 'python', packageManager: 'pip' },
  { file: 'requirements.txt', language: 'python', packageManager: 'pip' },
  { file: 'Pipfile', language: 'python', packageManager: 'pipenv' },
  { file: 'poetry.lock', language: 'python', packageManager: 'poetry' },
  { file: 'pytest.ini', testRunner: 'pytest' },
  { file: 'conftest.py', testRunner: 'pytest' },

  // Go ecosystem
  { file: 'go.mod', language: 'go', packageManager: 'go-modules' },
  { file: 'go.sum', language: 'go' },

  // Rust ecosystem
  { file: 'Cargo.toml', language: 'rust', packageManager: 'cargo' },
  { file: 'Cargo.lock', language: 'rust' },

  // Java/JVM ecosystem
  { file: 'pom.xml', language: 'java', buildTool: 'maven' },
  { file: 'build.gradle', language: 'java', buildTool: 'gradle' },
  { file: 'build.gradle.kts', language: 'kotlin', buildTool: 'gradle' },

  // Infrastructure
  { file: 'Dockerfile', buildTool: 'docker' },
  { file: 'docker-compose.yml', buildTool: 'docker-compose' },
  { file: 'terraform.tf', buildTool: 'terraform' },
  { file: 'main.tf', buildTool: 'terraform' },
];

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Environment Onboarding Hook
 *
 * On run start, analyzes context metadata to build an environment profile.
 * The profile is injected into subsequent step contexts to give agents
 * immediate awareness of the project's tech stack.
 */
export class EnvironmentOnboardingHook implements AgentHook {
  readonly name = 'environment-onboarding';
  private config: EnvironmentOnboardingConfig;
  private runProfiles = new Map<string, EnvironmentProfile>();

  constructor(config?: Partial<EnvironmentOnboardingConfig>) {
    this.config = { ...DEFAULT_ENV_ONBOARDING_CONFIG, ...config };
  }

  /**
   * Profile the environment on run start
   */
  async onRunStart(ctx: AgentRunContext): Promise<void> {
    try {
      const profile = this.profileFromContext(ctx);
      this.runProfiles.set(ctx.runId, profile);

      // Inject into current context
      if (ctx.metadata) {
        ctx.metadata.environmentProfile = profile;
      }

      logger.info('Environment profiled', {
        runId: ctx.runId,
        languages: profile.languages,
        frameworks: profile.frameworks,
        testRunners: profile.testRunners,
        isMonorepo: profile.isMonorepo,
      });

      await this.config.onProfiled?.(profile);
    } catch (error) {
      logger.error('Environment profiling failed', {
        runId: ctx.runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * No-op — profile injection happens in onBeforeStep only
   */
  async onAfterStep(_ctx: AgentRunContext): Promise<void> {
    // Profile is injected via onBeforeStep; no post-step action needed
  }

  /**
   * Inject profile before each step
   */
  async onBeforeStep(ctx: AgentRunContext): Promise<void> {
    if (!this.config.injectIntoSteps) return;

    const profile = this.runProfiles.get(ctx.runId);
    if (profile && ctx.metadata) {
      ctx.metadata.environmentProfile = profile;
    }
  }

  /**
   * Clean up on run end
   */
  async onRunEnd(ctx: AgentRunContext, _success: boolean): Promise<void> {
    this.runProfiles.delete(ctx.runId);
  }

  /**
   * Check if this hook is enabled
   */
  async isEnabled(): Promise<boolean> {
    return process.env.GWI_ENVIRONMENT_ONBOARDING_ENABLED !== 'false';
  }

  /**
   * Build an environment profile from context metadata
   *
   * Uses file lists, repo info, and config file presence from context
   * to determine the project's tech stack without filesystem access.
   */
  profileFromContext(ctx: AgentRunContext): EnvironmentProfile {
    const languages = new Set<string>();
    const frameworks = new Set<string>();
    const packageManagers = new Set<string>();
    const testRunners = new Set<string>();
    const buildTools = new Set<string>();
    const configFiles: string[] = [];
    let isMonorepo = false;

    // Extract and validate file list from metadata (populated by triage or previous steps)
    const rawFiles = ctx.metadata?.files;
    const files: string[] = Array.isArray(rawFiles)
      ? rawFiles.filter((f): f is string => typeof f === 'string').slice(0, 10_000)
      : [];
    const rawRoot = ctx.metadata?.repoRoot;
    const repoRoot = typeof rawRoot === 'string' ? rawRoot : undefined;

    // Scan file list against known config signals
    for (const filePath of files) {
      const fileName = filePath.split('/').pop() ?? filePath;

      for (const signal of CONFIG_FILE_SIGNALS) {
        if (fileName === signal.file) {
          configFiles.push(filePath);
          if (signal.language) languages.add(signal.language);
          if (signal.framework) frameworks.add(signal.framework);
          if (signal.packageManager) packageManagers.add(signal.packageManager);
          if (signal.testRunner) testRunners.add(signal.testRunner);
          if (signal.buildTool) buildTools.add(signal.buildTool);
          if (signal.monorepo) isMonorepo = true;
        }
      }

      // Infer language from file extensions
      if (/\.[jt]sx?$/.test(filePath)) languages.add('typescript');
      if (/\.py$/.test(filePath)) languages.add('python');
      if (/\.go$/.test(filePath)) languages.add('go');
      if (/\.rs$/.test(filePath)) languages.add('rust');
      if (/\.java$/.test(filePath)) languages.add('java');
      if (/\.kt$/.test(filePath)) languages.add('kotlin');
      if (/\.rb$/.test(filePath)) languages.add('ruby');
    }

    // Check for monorepo signals in directory structure
    if (files.some((f) => /^(packages|apps|libs|modules)\//.test(f))) {
      isMonorepo = true;
    }

    return {
      languages: [...languages],
      frameworks: [...frameworks],
      packageManagers: [...packageManagers],
      testRunners: [...testRunners],
      buildTools: [...buildTools],
      isMonorepo,
      configFiles,
      repoRoot,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create an environment onboarding hook
 */
export function createEnvironmentOnboardingHook(
  config?: Partial<EnvironmentOnboardingConfig>,
): EnvironmentOnboardingHook {
  return new EnvironmentOnboardingHook(config);
}
