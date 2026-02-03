# Feature Flags Integration Specification

> **Document**: 228-DR-SPEC-feature-flags
> **Epic**: EPIC 018 - Feature Flags Integration
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Feature flags enable controlled rollouts, A/B testing, and instant kill switches. This spec defines the feature flag architecture, targeting rules, and integration with GWI workflows.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FEATURE FLAGS ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     FLAG MANAGEMENT UI                                │   │
│  │  • Create/edit flags                                                 │   │
│  │  • Configure targeting rules                                         │   │
│  │  • View rollout status                                               │   │
│  │  • Emergency kill switches                                           │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     FLAG SERVICE                                      │   │
│  │  • Flag evaluation                                                   │   │
│  │  • Targeting rules engine                                            │   │
│  │  • Caching layer                                                     │   │
│  │  • Audit logging                                                     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│           ┌────────────────────────┼────────────────────────┐              │
│           │                        │                        │              │
│           ▼                        ▼                        ▼              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │   GWI API       │    │   GWI Worker    │    │   GWI Agents    │        │
│  │   (services)    │    │   (jobs)        │    │   (AI)          │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flag Types

### 1. Boolean Flags

Simple on/off toggles for features.

```typescript
interface BooleanFlag {
  key: string;
  type: 'boolean';
  defaultValue: boolean;
  description: string;
  targeting?: TargetingRule[];
}

// Example
const flag: BooleanFlag = {
  key: 'enable-opus-model',
  type: 'boolean',
  defaultValue: false,
  description: 'Enable Claude Opus model for complex tasks',
  targeting: [
    {
      attribute: 'tenant.plan',
      operator: 'equals',
      value: 'enterprise',
      variation: true,
    },
  ],
};
```

### 2. String Flags

Return string values for configuration.

```typescript
interface StringFlag {
  key: string;
  type: 'string';
  defaultValue: string;
  variations: string[];
  description: string;
  targeting?: TargetingRule[];
}

// Example
const flag: StringFlag = {
  key: 'default-model',
  type: 'string',
  defaultValue: 'claude-sonnet-4',
  variations: ['claude-sonnet-4', 'claude-opus-4', 'gpt-4o'],
  description: 'Default AI model for new runs',
};
```

### 3. Number Flags

Return numeric values.

```typescript
interface NumberFlag {
  key: string;
  type: 'number';
  defaultValue: number;
  min?: number;
  max?: number;
  description: string;
  targeting?: TargetingRule[];
}

// Example
const flag: NumberFlag = {
  key: 'max-concurrent-runs',
  type: 'number',
  defaultValue: 5,
  min: 1,
  max: 20,
  description: 'Maximum concurrent runs per tenant',
};
```

### 4. JSON Flags

Return complex configuration objects.

```typescript
interface JsonFlag {
  key: string;
  type: 'json';
  defaultValue: Record<string, unknown>;
  schema?: JSONSchema;
  description: string;
  targeting?: TargetingRule[];
}

// Example
const flag: JsonFlag = {
  key: 'model-config',
  type: 'json',
  defaultValue: {
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9,
  },
  description: 'AI model generation configuration',
};
```

---

## Targeting Rules

### Rule Structure

```typescript
interface TargetingRule {
  // Rule identifier
  id: string;
  name: string;

  // Conditions (all must match)
  conditions: Condition[];

  // Value to return if conditions match
  variation: FlagValue;

  // Percentage rollout (0-100)
  percentage?: number;

  // Priority (lower = higher priority)
  priority: number;
}

interface Condition {
  // Attribute to evaluate
  attribute: string;

  // Operator
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'starts_with'
    | 'ends_with'
    | 'matches_regex'
    | 'in'
    | 'not_in'
    | 'greater_than'
    | 'less_than'
    | 'greater_than_or_equal'
    | 'less_than_or_equal'
    | 'semver_greater_than'
    | 'semver_less_than';

  // Value to compare against
  value: unknown;
}
```

### Common Targeting Patterns

```typescript
// Target by tenant plan
{
  attribute: 'tenant.plan',
  operator: 'equals',
  value: 'enterprise'
}

// Target by user email domain
{
  attribute: 'user.email',
  operator: 'ends_with',
  value: '@company.com'
}

// Target by tenant ID list
{
  attribute: 'tenant.id',
  operator: 'in',
  value: ['tenant-abc', 'tenant-def', 'tenant-ghi']
}

// Target by SDK version
{
  attribute: 'context.sdk_version',
  operator: 'semver_greater_than',
  value: '2.0.0'
}

// Target by environment
{
  attribute: 'context.environment',
  operator: 'equals',
  value: 'production'
}
```

---

## Flag Evaluation

### Evaluation Context

```typescript
interface EvaluationContext {
  // User context
  user?: {
    id: string;
    email?: string;
    name?: string;
    attributes?: Record<string, unknown>;
  };

  // Tenant context
  tenant?: {
    id: string;
    name?: string;
    plan?: string;
    attributes?: Record<string, unknown>;
  };

  // Request context
  context?: {
    environment: string;
    sdk_version: string;
    platform?: string;
    ip_address?: string;
    user_agent?: string;
    custom?: Record<string, unknown>;
  };
}
```

### Evaluation Flow

```typescript
// packages/core/src/flags/evaluator.ts

class FlagEvaluator {
  async evaluate<T>(
    flagKey: string,
    context: EvaluationContext,
    defaultValue: T
  ): Promise<EvaluationResult<T>> {
    // 1. Get flag definition
    const flag = await this.flagStore.getFlag(flagKey);
    if (!flag) {
      return {
        value: defaultValue,
        reason: 'FLAG_NOT_FOUND',
        flagKey,
      };
    }

    // 2. Check if flag is enabled
    if (!flag.enabled) {
      return {
        value: flag.defaultValue as T,
        reason: 'FLAG_DISABLED',
        flagKey,
      };
    }

    // 3. Evaluate targeting rules (in priority order)
    for (const rule of flag.targeting || []) {
      if (this.matchesConditions(rule.conditions, context)) {
        // Check percentage rollout
        if (rule.percentage !== undefined) {
          const bucket = this.getBucket(flagKey, context);
          if (bucket > rule.percentage) {
            continue; // Not in rollout percentage
          }
        }

        return {
          value: rule.variation as T,
          reason: 'TARGETING_MATCH',
          ruleId: rule.id,
          flagKey,
        };
      }
    }

    // 4. Return default value
    return {
      value: flag.defaultValue as T,
      reason: 'DEFAULT',
      flagKey,
    };
  }

  private getBucket(flagKey: string, context: EvaluationContext): number {
    // Deterministic bucketing based on user/tenant ID
    const key = context.user?.id || context.tenant?.id || 'anonymous';
    const hash = this.hash(`${flagKey}:${key}`);
    return hash % 100;
  }
}
```

---

## Integration with GWI

### SDK Usage

```typescript
// packages/core/src/flags/client.ts

class FeatureFlagClient {
  private evaluator: FlagEvaluator;
  private cache: FlagCache;

  async isEnabled(
    flagKey: string,
    context: EvaluationContext
  ): Promise<boolean> {
    return this.evaluate(flagKey, context, false);
  }

  async getString(
    flagKey: string,
    context: EvaluationContext,
    defaultValue: string
  ): Promise<string> {
    return this.evaluate(flagKey, context, defaultValue);
  }

  async getNumber(
    flagKey: string,
    context: EvaluationContext,
    defaultValue: number
  ): Promise<number> {
    return this.evaluate(flagKey, context, defaultValue);
  }

  async getJson<T>(
    flagKey: string,
    context: EvaluationContext,
    defaultValue: T
  ): Promise<T> {
    return this.evaluate(flagKey, context, defaultValue);
  }
}
```

### Usage in Agents

```typescript
// packages/agents/src/coder/agent.ts

class CoderAgent extends BaseAgent {
  async selectModel(task: Task): Promise<string> {
    const context = this.buildFlagContext(task);

    // Check if Opus is enabled for this tenant
    const opusEnabled = await this.flags.isEnabled('enable-opus-model', context);

    // Get complexity threshold for Opus
    const opusThreshold = await this.flags.getNumber(
      'opus-complexity-threshold',
      context,
      8 // default: complexity 8+
    );

    if (opusEnabled && task.complexity >= opusThreshold) {
      return 'claude-opus-4';
    }

    // Get default model from flag
    return this.flags.getString('default-coder-model', context, 'claude-sonnet-4');
  }

  private buildFlagContext(task: Task): EvaluationContext {
    return {
      tenant: {
        id: task.tenantId,
        plan: task.tenant.plan,
      },
      user: {
        id: task.userId,
        email: task.user.email,
      },
      context: {
        environment: process.env.NODE_ENV || 'development',
        sdk_version: SDK_VERSION,
        custom: {
          task_type: task.type,
          complexity: task.complexity,
        },
      },
    };
  }
}
```

### Usage in API Endpoints

```typescript
// apps/api/src/routes/runs.ts

router.post('/runs', async (req, res) => {
  const context = buildFlagContext(req);

  // Check if new run creation is enabled
  const enabled = await flags.isEnabled('enable-run-creation', context);
  if (!enabled) {
    return res.status(503).json({
      error: 'Run creation temporarily disabled',
      code: 'FEATURE_DISABLED',
    });
  }

  // Get rate limit from flag
  const rateLimit = await flags.getNumber('run-rate-limit', context, 10);

  // Check rate limit
  if (await exceedsRateLimit(req.tenant.id, rateLimit)) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      limit: rateLimit,
    });
  }

  // Create run
  const run = await runService.create(req.body);
  return res.json(run);
});
```

---

## Rollout Strategies

### Percentage Rollout

```yaml
# Gradual rollout to 25% of users
flag:
  key: new-review-algorithm
  enabled: true
  targeting:
    - id: percentage-rollout
      name: "25% Rollout"
      conditions: []
      variation: true
      percentage: 25
      priority: 1
  defaultValue: false
```

### Ring-Based Rollout

```yaml
# Rollout in rings: internal -> beta -> GA
flag:
  key: new-feature
  enabled: true
  targeting:
    # Ring 0: Internal users
    - id: ring-0-internal
      name: "Internal Users"
      conditions:
        - attribute: user.email
          operator: ends_with
          value: "@company.com"
      variation: true
      priority: 1

    # Ring 1: Beta tenants
    - id: ring-1-beta
      name: "Beta Tenants"
      conditions:
        - attribute: tenant.attributes.beta
          operator: equals
          value: true
      variation: true
      priority: 2

    # Ring 2: Enterprise tenants
    - id: ring-2-enterprise
      name: "Enterprise Tenants"
      conditions:
        - attribute: tenant.plan
          operator: equals
          value: "enterprise"
      variation: true
      percentage: 50  # 50% of enterprise
      priority: 3

  defaultValue: false
```

### Canary Rollout

```yaml
# Canary: specific tenant first
flag:
  key: database-migration-v2
  enabled: true
  targeting:
    # Canary tenant
    - id: canary
      name: "Canary Tenant"
      conditions:
        - attribute: tenant.id
          operator: equals
          value: "tenant-canary"
      variation: true
      priority: 1
  defaultValue: false
```

---

## Emergency Kill Switches

### Kill Switch Definition

```typescript
interface KillSwitch {
  key: string;
  name: string;
  description: string;
  scope: 'global' | 'tenant' | 'feature';
  enabled: boolean;
  activatedBy?: string;
  activatedAt?: Date;
  expiresAt?: Date;
}
```

### Predefined Kill Switches

```yaml
kill_switches:
  # Disable all AI operations
  - key: kill-ai-operations
    name: "Kill AI Operations"
    description: "Immediately stop all AI model calls"
    scope: global
    enabled: false

  # Disable new run creation
  - key: kill-run-creation
    name: "Kill Run Creation"
    description: "Stop accepting new runs"
    scope: global
    enabled: false

  # Disable specific model
  - key: kill-opus-model
    name: "Kill Opus Model"
    description: "Disable Claude Opus model usage"
    scope: feature
    enabled: false

  # Maintenance mode
  - key: maintenance-mode
    name: "Maintenance Mode"
    description: "Put system in maintenance mode"
    scope: global
    enabled: false
```

### Kill Switch UI

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ KILL SWITCHES                                                                 ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║ ⚪ kill-ai-operations          Kill AI Operations                            ║
║    Immediately stop all AI model calls                                        ║
║    [ACTIVATE]                                                                 ║
║                                                                               ║
║ ⚪ kill-run-creation           Kill Run Creation                             ║
║    Stop accepting new runs                                                    ║
║    [ACTIVATE]                                                                 ║
║                                                                               ║
║ 🔴 kill-opus-model             Kill Opus Model            ACTIVE             ║
║    Disable Claude Opus model usage                                            ║
║    Activated by: admin@company.com at 2026-02-03 10:15                       ║
║    [DEACTIVATE]                                                               ║
║                                                                               ║
║ ⚪ maintenance-mode            Maintenance Mode                              ║
║    Put system in maintenance mode                                             ║
║    [ACTIVATE]                                                                 ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## Flag Management API

### API Endpoints

```typescript
// List all flags
// GET /api/v1/flags
interface ListFlagsResponse {
  flags: FlagSummary[];
  total: number;
}

// Get flag details
// GET /api/v1/flags/:key
interface GetFlagResponse {
  flag: FlagDefinition;
  evaluations: EvaluationStats;
}

// Create flag
// POST /api/v1/flags
interface CreateFlagRequest {
  key: string;
  type: FlagType;
  defaultValue: FlagValue;
  description: string;
  targeting?: TargetingRule[];
}

// Update flag
// PUT /api/v1/flags/:key
interface UpdateFlagRequest {
  enabled?: boolean;
  defaultValue?: FlagValue;
  targeting?: TargetingRule[];
}

// Toggle flag
// POST /api/v1/flags/:key/toggle
interface ToggleFlagRequest {
  enabled: boolean;
}

// Evaluate flag
// POST /api/v1/flags/:key/evaluate
interface EvaluateFlagRequest {
  context: EvaluationContext;
}
```

---

## Audit Logging

```typescript
interface FlagAuditEvent {
  timestamp: Date;
  event_type:
    | 'FLAG_CREATED'
    | 'FLAG_UPDATED'
    | 'FLAG_DELETED'
    | 'FLAG_ENABLED'
    | 'FLAG_DISABLED'
    | 'TARGETING_UPDATED'
    | 'KILL_SWITCH_ACTIVATED'
    | 'KILL_SWITCH_DEACTIVATED';
  flag_key: string;
  actor: string;
  changes?: {
    field: string;
    old_value: unknown;
    new_value: unknown;
  }[];
  reason?: string;
}
```

---

## Provider Integration

### LaunchDarkly

```typescript
// packages/core/src/flags/providers/launchdarkly.ts

class LaunchDarklyProvider implements FlagProvider {
  private client: LDClient;

  async initialize(config: LDConfig): Promise<void> {
    this.client = LDClient.init(config.sdkKey);
    await this.client.waitForInitialization();
  }

  async evaluate<T>(
    flagKey: string,
    context: EvaluationContext,
    defaultValue: T
  ): Promise<T> {
    const ldContext = this.toLDContext(context);
    return this.client.variation(flagKey, ldContext, defaultValue);
  }
}
```

### Firestore (Self-Hosted)

```typescript
// packages/core/src/flags/providers/firestore.ts

class FirestoreFlagProvider implements FlagProvider {
  private db: Firestore;
  private evaluator: FlagEvaluator;

  async getFlag(key: string): Promise<FlagDefinition | null> {
    const doc = await this.db.collection('flags').doc(key).get();
    return doc.exists ? (doc.data() as FlagDefinition) : null;
  }

  async evaluate<T>(
    flagKey: string,
    context: EvaluationContext,
    defaultValue: T
  ): Promise<T> {
    const flag = await this.getFlag(flagKey);
    if (!flag) return defaultValue;
    return this.evaluator.evaluate(flag, context, defaultValue);
  }
}
```

---

## CLI Commands

```bash
# List all flags
gwi flags list

# Get flag details
gwi flags get enable-opus-model

# Create flag
gwi flags create enable-new-feature \
  --type boolean \
  --default false \
  --description "Enable new feature"

# Toggle flag
gwi flags toggle enable-opus-model --on
gwi flags toggle enable-opus-model --off

# Add targeting rule
gwi flags target enable-opus-model \
  --condition "tenant.plan equals enterprise" \
  --variation true

# Evaluate flag
gwi flags evaluate enable-opus-model \
  --tenant tenant-123 \
  --user user-456

# Activate kill switch
gwi flags kill activate kill-ai-operations \
  --reason "API rate limits exceeded"

# View audit log
gwi flags audit enable-opus-model --limit 50
```

---

## Related Documentation

- [229-DR-TMPL-flag-definition.md](./229-DR-TMPL-flag-definition.md)
- [224-DR-SPEC-cost-optimization.md](./224-DR-SPEC-cost-optimization.md)
