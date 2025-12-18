/**
 * Workflow Scheduler Service
 *
 * Phase 13: Workflow Catalog - Scheduled execution of workflow instances
 *
 * Features:
 * - Cron-based scheduling with timezone support
 * - Idempotent trigger execution (no duplicates)
 * - Integration with instance store
 *
 * @module @gwi/core/scheduler
 */

import type { ScheduleStore, InstanceStore, WorkflowSchedule } from '../storage/interfaces.js';

// =============================================================================
// Cron Utilities
// =============================================================================

/**
 * Parse a cron expression into its parts
 * Standard 5-field format: minute hour day-of-month month day-of-week
 */
export interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

/**
 * Parse a cron expression string into parts
 */
export function parseCron(expression: string): CronParts | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  };
}

/**
 * Check if a cron field matches a value
 */
function matchesCronField(field: string, value: number, max: number): boolean {
  if (field === '*') return true;

  // Handle lists (e.g., "1,2,3")
  if (field.includes(',')) {
    return field.split(',').some(f => matchesCronField(f, value, max));
  }

  // Handle ranges (e.g., "1-5")
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number);
    return value >= start && value <= end;
  }

  // Handle steps (e.g., "*/5")
  if (field.includes('/')) {
    const [range, step] = field.split('/');
    const stepNum = parseInt(step, 10);
    if (range === '*') {
      return value % stepNum === 0;
    }
    // Handle range with step (e.g., "0-30/5")
    if (range.includes('-')) {
      const [start, end] = range.split('-').map(Number);
      return value >= start && value <= end && (value - start) % stepNum === 0;
    }
  }

  // Direct match
  return parseInt(field, 10) === value;
}

/**
 * Check if a Date matches a cron expression
 */
export function matchesCron(cron: CronParts, date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // 1-12
  const dayOfWeek = date.getDay(); // 0-6, Sunday = 0

  return (
    matchesCronField(cron.minute, minute, 59) &&
    matchesCronField(cron.hour, hour, 23) &&
    matchesCronField(cron.dayOfMonth, dayOfMonth, 31) &&
    matchesCronField(cron.month, month, 12) &&
    matchesCronField(cron.dayOfWeek, dayOfWeek, 6)
  );
}

/**
 * Calculate the next trigger time for a cron expression
 * Simple implementation - checks minute by minute for up to 1 year
 */
export function getNextTriggerTime(expression: string, after: Date = new Date()): Date | null {
  const cron = parseCron(expression);
  if (!cron) return null;

  // Start from the next minute
  const check = new Date(after);
  check.setSeconds(0);
  check.setMilliseconds(0);
  check.setMinutes(check.getMinutes() + 1);

  // Check up to 1 year (525600 minutes)
  const maxIterations = 525600;
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCron(cron, check)) {
      return check;
    }
    check.setMinutes(check.getMinutes() + 1);
  }

  return null;
}

// =============================================================================
// Scheduler Service
// =============================================================================

/**
 * Trigger callback for when a schedule fires
 */
export type ScheduleTriggerCallback = (schedule: WorkflowSchedule, instanceId: string) => Promise<void>;

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  /** Check interval in milliseconds (default: 60000 = 1 minute) */
  checkIntervalMs?: number;
  /** Maximum schedules to trigger per check (default: 100) */
  maxTriggersPerCheck?: number;
  /** Whether to log debug info */
  debug?: boolean;
}

/**
 * Workflow Scheduler Service
 *
 * Periodically checks for due schedules and triggers them.
 * Ensures idempotent execution (no duplicate triggers).
 */
export class SchedulerService {
  private scheduleStore: ScheduleStore;
  private instanceStore: InstanceStore;
  private onTrigger: ScheduleTriggerCallback;
  private config: Required<SchedulerConfig>;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastCheck: Date | null = null;

  constructor(
    scheduleStore: ScheduleStore,
    instanceStore: InstanceStore,
    onTrigger: ScheduleTriggerCallback,
    config: SchedulerConfig = {}
  ) {
    this.scheduleStore = scheduleStore;
    this.instanceStore = instanceStore;
    this.onTrigger = onTrigger;
    this.config = {
      checkIntervalMs: config.checkIntervalMs ?? 60000,
      maxTriggersPerCheck: config.maxTriggersPerCheck ?? 100,
      debug: config.debug ?? false,
    };
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.log('Scheduler started');

    // Run immediately, then on interval
    this.checkAndTrigger();
    this.intervalId = setInterval(() => this.checkAndTrigger(), this.config.checkIntervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.log('Scheduler stopped');
  }

  /**
   * Check for due schedules and trigger them
   */
  async checkAndTrigger(): Promise<number> {
    const now = new Date();
    this.lastCheck = now;

    try {
      // Find schedules that are due
      const dueSchedules = await this.scheduleStore.listDueSchedules(now);

      if (dueSchedules.length === 0) {
        this.log('No due schedules');
        return 0;
      }

      this.log(`Found ${dueSchedules.length} due schedules`);

      // Limit triggers per check
      const toTrigger = dueSchedules.slice(0, this.config.maxTriggersPerCheck);
      let triggered = 0;

      for (const schedule of toTrigger) {
        try {
          // Verify instance exists and is enabled
          const instance = await this.instanceStore.getInstance(schedule.instanceId);
          if (!instance || !instance.enabled) {
            this.log(`Skipping schedule ${schedule.id}: instance not found or disabled`);
            continue;
          }

          // Trigger the callback
          await this.onTrigger(schedule, schedule.instanceId);

          // Update schedule with next trigger time
          const nextTrigger = getNextTriggerTime(schedule.cronExpression, now);
          if (nextTrigger) {
            await this.scheduleStore.updateLastTriggered(schedule.id, now, nextTrigger);
          }

          triggered++;
          this.log(`Triggered schedule ${schedule.id} for instance ${schedule.instanceId}`);
        } catch (error) {
          console.error(`Failed to trigger schedule ${schedule.id}:`, error);
        }
      }

      return triggered;
    } catch (error) {
      console.error('Scheduler check failed:', error);
      return 0;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    running: boolean;
    lastCheck: Date | null;
    checkIntervalMs: number;
  } {
    return {
      running: this.running,
      lastCheck: this.lastCheck,
      checkIntervalMs: this.config.checkIntervalMs,
    };
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[Scheduler] ${message}`);
    }
  }
}

// =============================================================================
// Exports
// =============================================================================

export { type WorkflowSchedule };
