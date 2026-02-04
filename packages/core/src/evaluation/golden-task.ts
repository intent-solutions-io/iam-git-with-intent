/**
 * Golden Task Framework
 *
 * EPIC 003: Evaluation Harness + Golden Tasks Framework
 *
 * Golden tasks are fixed input/output pairs used for regression testing.
 * When agent behavior changes, golden tasks detect regressions by comparing
 * current outputs against known-good (golden) outputs.
 *
 * @module @gwi/core/evaluation/golden-task
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { z } from 'zod';

/**
 * Recursively find all files matching a predicate in a directory
 * Type-safe alternative to fs.readdirSync with recursive option
 */
function findFilesRecursive(dir: string, predicate: (filename: string) => boolean): string[] {
  const results: string[] = [];

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && predicate(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}
import {
  type Rubric,
  type EvaluationResult,
  loadRubric,
} from './rubric.js';
import { EvaluationHarness, type EvaluationInput, type EvaluationHarnessConfig } from './harness.js';
import { createLogger } from '../telemetry/index.js';

const logger = createLogger('golden-task');

// ============================================================================
// Types
// ============================================================================

/**
 * Golden task definition schema
 */
export const GoldenTaskSchema = z.object({
  id: z.string().describe('Unique task identifier'),
  name: z.string().describe('Human-readable task name'),
  description: z.string().optional().describe('Description of what this tests'),
  workflow: z.string().describe('Workflow type (pr-review, conflict-resolution, etc.)'),
  rubric: z.string().describe('Rubric file path (relative to rubrics/)'),
  input: z.object({
    type: z.string().describe('Input type (pr-diff, issue, conflict-file, etc.)'),
    content: z.string().describe('Input content or path to file'),
    metadata: z.record(z.unknown()).optional().describe('Additional input metadata'),
  }),
  expectedOutput: z.object({
    minScore: z.number().min(0).max(100).default(70).describe('Minimum passing score'),
    requiredSections: z.array(z.string()).optional().describe('Sections that must be present'),
    requiredKeywords: z.array(z.string()).optional().describe('Keywords that must be present'),
    forbiddenPatterns: z.array(z.string()).optional().describe('Patterns that must NOT be present'),
    goldenOutput: z.string().optional().describe('Known-good output for comparison'),
  }),
  tags: z.array(z.string()).optional().describe('Tags for filtering'),
  skip: z.boolean().optional().describe('Skip this task'),
  timeout: z.number().optional().describe('Timeout in ms'),
});

export type GoldenTask = z.infer<typeof GoldenTaskSchema>;

/**
 * Golden task run result
 */
export interface GoldenTaskResult {
  taskId: string;
  taskName: string;
  workflow: string;
  passed: boolean;
  score: number;
  evaluation: EvaluationResult;
  actualOutput?: string;
  error?: string;
  durationMs: number;
  timestamp: string;
}

/**
 * Golden task suite result
 */
export interface GoldenSuiteResult {
  suiteName: string;
  totalTasks: number;
  passedTasks: number;
  failedTasks: number;
  skippedTasks: number;
  overallPassed: boolean;
  tasks: GoldenTaskResult[];
  summary: string;
  durationMs: number;
  timestamp: string;
}

/**
 * Output generator function signature
 */
export type OutputGeneratorFn = (
  input: GoldenTask['input'],
  workflow: string
) => Promise<string>;

// ============================================================================
// Golden Task Runner
// ============================================================================

/**
 * Configuration for golden task runner
 */
export interface GoldenRunnerConfig {
  /** Directory containing rubric files */
  rubricsDir: string;
  /** Directory containing golden task files */
  tasksDir: string;
  /** Function to generate output from input */
  outputGenerator: OutputGeneratorFn;
  /** Optional evaluation harness config */
  harnessConfig?: EvaluationHarnessConfig;
  /** Filter tasks by workflow */
  workflowFilter?: string;
  /** Filter tasks by tags */
  tagFilter?: string[];
  /** Run in verbose mode */
  verbose?: boolean;
  /** Fail fast on first failure */
  failFast?: boolean;
}

/**
 * Golden Task Runner - executes golden tasks and evaluates results
 */
export class GoldenTaskRunner {
  private config: GoldenRunnerConfig;
  private harness: EvaluationHarness;
  private rubricCache: Map<string, Rubric> = new Map();

  constructor(config: GoldenRunnerConfig) {
    this.config = config;
    this.harness = new EvaluationHarness(config.harnessConfig);
  }

  /**
   * Load a rubric (with caching)
   */
  private loadRubric(rubricPath: string): Rubric {
    const fullPath = path.join(this.config.rubricsDir, rubricPath);

    if (!this.rubricCache.has(fullPath)) {
      const rubric = loadRubric(fullPath);
      this.rubricCache.set(fullPath, rubric);
    }

    return this.rubricCache.get(fullPath)!;
  }

  /**
   * Load golden tasks from a file
   */
  loadTasksFromFile(filePath: string): GoldenTask[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.parse(content);

    // Handle both single task and array of tasks
    const tasksArray = Array.isArray(parsed) ? parsed : (parsed.tasks || [parsed]);

    return tasksArray.map((task: unknown, index: number) => {
      const result = GoldenTaskSchema.safeParse(task);
      if (!result.success) {
        const errors = result.error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`).join('\n');
        throw new Error(`Invalid task #${index + 1} in ${filePath}:\n${errors}`);
      }
      return result.data;
    });
  }

  /**
   * Discover all golden task files in directory
   * Uses type-safe recursive directory walking
   */
  discoverTaskFiles(): string[] {
    const tasksDir = this.config.tasksDir;
    if (!fs.existsSync(tasksDir)) {
      return [];
    }

    return findFilesRecursive(
      tasksDir,
      (filename) => filename.endsWith('.golden.yaml') || filename.endsWith('.golden.yml')
    );
  }

  /**
   * Filter tasks based on config
   */
  private filterTasks(tasks: GoldenTask[]): GoldenTask[] {
    return tasks.filter(task => {
      // Skip if marked
      if (task.skip) return false;

      // Filter by workflow
      if (this.config.workflowFilter && task.workflow !== this.config.workflowFilter) {
        return false;
      }

      // Filter by tags
      if (this.config.tagFilter && this.config.tagFilter.length > 0) {
        const taskTags = task.tags || [];
        if (!this.config.tagFilter.some(tag => taskTags.includes(tag))) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Run a single golden task
   */
  async runTask(task: GoldenTask): Promise<GoldenTaskResult> {
    const startTime = Date.now();

    try {
      // Load rubric
      const rubric = this.loadRubric(task.rubric);

      // Generate output
      const actualOutput = await this.config.outputGenerator(task.input, task.workflow);

      // Prepare evaluation input
      const evalInput: EvaluationInput = {
        output: actualOutput,
        data: {
          minLength: 50,
          requiredSections: task.expectedOutput.requiredSections,
          keywords: task.expectedOutput.requiredKeywords,
          forbiddenPatterns: task.expectedOutput.forbiddenPatterns,
        },
        context: {
          inputType: task.input.type,
          metadata: task.input.metadata,
        },
      };

      // Run evaluation
      const evaluation = await this.harness.evaluate(evalInput, rubric);

      // Check if passed
      const passed = evaluation.overallScore >= task.expectedOutput.minScore && evaluation.passed;

      return {
        taskId: task.id,
        taskName: task.name,
        workflow: task.workflow,
        passed,
        score: evaluation.overallScore,
        evaluation,
        actualOutput,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        taskId: task.id,
        taskName: task.name,
        workflow: task.workflow,
        passed: false,
        score: 0,
        evaluation: {
          rubricName: task.rubric,
          rubricVersion: '0.0.0',
          overallScore: 0,
          letterGrade: 'F',
          passed: false,
          dimensions: [],
          summary: `Error: ${error instanceof Error ? error.message : String(error)}`,
          strengths: [],
          weaknesses: ['Task execution failed'],
          recommendations: ['Fix the error and retry'],
          metadata: {
            evaluatedAt: new Date().toISOString(),
            inputHash: '',
            evaluationDurationMs: Date.now() - startTime,
          },
        },
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Run all golden tasks in a file
   */
  async runTaskFile(filePath: string): Promise<GoldenTaskResult[]> {
    const tasks = this.loadTasksFromFile(filePath);
    const filteredTasks = this.filterTasks(tasks);
    const results: GoldenTaskResult[] = [];

    for (const task of filteredTasks) {
      if (this.config.verbose) {
        logger.debug('Running task', { taskName: task.name });
      }

      const result = await this.runTask(task);
      results.push(result);

      if (this.config.verbose) {
        logger.debug('Task completed', { taskName: result.taskName, passed: result.passed, score: result.score });
      }

      if (this.config.failFast && !result.passed) {
        break;
      }
    }

    return results;
  }

  /**
   * Run all golden tasks (full suite)
   */
  async runSuite(suiteName?: string): Promise<GoldenSuiteResult> {
    const startTime = Date.now();
    const taskFiles = this.discoverTaskFiles();

    if (this.config.verbose) {
      logger.debug('Discovered golden task files', { count: taskFiles.length });
    }

    const allResults: GoldenTaskResult[] = [];
    let skippedCount = 0;

    for (const file of taskFiles) {
      if (this.config.verbose) {
        logger.debug('Running task file', { file: path.basename(file) });
      }

      const tasks = this.loadTasksFromFile(file);
      const filteredTasks = this.filterTasks(tasks);
      skippedCount += tasks.length - filteredTasks.length;

      const results = await this.runTaskFile(file);
      allResults.push(...results);

      if (this.config.failFast && results.some(r => !r.passed)) {
        break;
      }
    }

    const passedTasks = allResults.filter(r => r.passed).length;
    const failedTasks = allResults.filter(r => !r.passed).length;
    const overallPassed = failedTasks === 0;

    const summary = overallPassed
      ? `✓ All ${passedTasks} golden tasks passed`
      : `✗ ${failedTasks}/${allResults.length} golden tasks failed`;

    return {
      suiteName: suiteName || 'Golden Tasks',
      totalTasks: allResults.length,
      passedTasks,
      failedTasks,
      skippedTasks: skippedCount,
      overallPassed,
      tasks: allResults,
      summary,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Create a golden task runner with default configuration
 */
export function createGoldenRunner(config: GoldenRunnerConfig): GoldenTaskRunner {
  return new GoldenTaskRunner(config);
}

/**
 * Mock output generator for testing
 */
export function createMockGenerator(outputs: Record<string, string>): OutputGeneratorFn {
  return async (input, workflow) => {
    const key = `${workflow}:${input.type}`;
    if (outputs[key]) {
      return outputs[key];
    }
    // Default mock output
    return `# ${workflow} Output\n\nGenerated output for ${input.type}.\n\n## Summary\n\nThis is a mock output for testing purposes.`;
  };
}
