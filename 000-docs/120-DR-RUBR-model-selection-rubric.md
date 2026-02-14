# Model Selection Rubric

**Document ID**: 120-DR-RUBR
**Version**: 1.0
**Last Updated**: 2026-02-11

## Overview

Git With Intent uses an intelligent model selection system that routes tasks to optimal LLM providers based on complexity, task type, cost constraints, and required capabilities.

## Decision Matrix

### Task Type vs Complexity

| Task Type | Complexity 1-3 | Complexity 4-7 | Complexity 8-10 |
|-----------|----------------|----------------|-----------------|
| **Triage** | Flash (tier 1) | Haiku (tier 1) | Sonnet (tier 3) |
| **Code Generation** | Haiku (tier 1) | Sonnet (tier 3) | Opus (tier 5) |
| **Code Review** | Flash (tier 1) | Sonnet (tier 3) | Opus (tier 5) |
| **Merge Resolution** | Sonnet (tier 3) | Sonnet (tier 3) | Opus (tier 5) |
| **Documentation** | Flash (tier 1) | Sonnet (tier 3) | Sonnet (tier 3) |
| **Reasoning** | GPT-4o (tier 3) | GPT-4o (tier 3) | o1 (tier 5) |
| **JSON Extraction** | Flash (tier 1) | GPT-4o (tier 3) | GPT-4o (tier 3) |
| **Summarization** | Flash (tier 1) | Haiku (tier 1) | Sonnet (tier 3) |

### Complexity Bands

| Band | Complexity Range | Characteristics |
|------|------------------|-----------------|
| **Low** | 1-3 | Simple extraction, classification, single-file changes |
| **Medium** | 4-7 | Multi-file changes, moderate reasoning, standard patterns |
| **High** | 8-10 | Architectural decisions, complex reasoning, critical code |

## Cost-Quality Tradeoffs

| Tier | Typical Cost/1K tokens | Best For | Example Models |
|------|------------------------|----------|----------------|
| **1** | ~$0.0001 | Triage, classification, simple extraction | Gemini Flash, GPT-4o-mini, Haiku |
| **2** | ~$0.001 | Light code review, documentation | - |
| **3** | ~$0.003 | Code generation, reviews, most tasks | Claude Sonnet, GPT-4o |
| **4** | ~$0.01 | Complex code, detailed analysis | GPT-4 Turbo |
| **5** | ~$0.015+ | Opus-level reasoning, architecture | Claude Opus, o1 |

## Provider Capabilities

### Built-in Providers

| Provider | Models | Key Strengths |
|----------|--------|---------------|
| **Anthropic** | Claude Sonnet 4, Claude Opus 4, Haiku | Code generation, safety, reasoning |
| **Google** | Gemini 2.0 Flash, Gemini 1.5 Pro | Speed, cost, 1M+ context |
| **OpenAI** | GPT-4o, GPT-4o-mini, o1 | Broad capabilities, function calling |

### Capability Flags

| Capability | Description | When Required |
|------------|-------------|---------------|
| `jsonMode` | Structured JSON output | API responses, data extraction |
| `functionCalling` | Tool/function use | Agent workflows |
| `vision` | Image input support | Screenshot analysis |
| `codeOptimized` | Tuned for code tasks | Code generation, review |
| `reasoningOptimized` | Extended thinking | Complex architecture |

## Adding Custom Providers

### 1. Set Environment Variable

```bash
# Example: Adding Groq
export GROQ_API_KEY="your-api-key"

# Example: Adding Together AI
export TOGETHER_API_KEY="your-api-key"
```

### 2. Register Provider Programmatically

```typescript
import { registerCustomProvider } from '@gwi/core';

registerCustomProvider({
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  apiKeyEnvVar: 'GROQ_API_KEY',
  baseUrl: 'https://api.groq.com/openai/v1',
  capabilities: {
    jsonMode: true,
    functionCalling: true,
    vision: false,
    streaming: true,
    codeExecution: false,
    maxContextTokens: 128000,
    maxOutputTokens: 8192,
    systemPrompts: true,
    codeOptimized: false,
    reasoningOptimized: false,
  },
  cost: {
    inputPerToken: 0.00000059,
    outputPerToken: 0.00000079,
  },
  costTier: 1,
  apiCompat: 'openai',
});
```

### 3. Validate Provider

```bash
# CLI validation
gwi provider validate groq

# Programmatic validation
import { isProviderAvailable, getProviderSummary } from '@gwi/core';

console.log(isProviderAvailable('groq')); // true
console.log(getProviderSummary()); // { available: [...], unavailable: [...] }
```

## Selection Policy Configuration

### Override Default Selection

```typescript
import { createSelectionPolicy } from '@gwi/core';

const policy = createSelectionPolicy((provider, model) => {
  // Custom availability check
  return isMyProviderAvailable(provider, model);
});

const result = policy.select({
  taskType: 'code_generation',
  complexity: 7,
  maxCostTier: 3,
  requiredCapabilities: {
    codeOptimized: true,
  },
});
```

### Fallback Behavior

When preferred providers are unavailable:

1. Try next provider in task-type preference list
2. Fall back to cheaper models if `allowFallback: true`
3. Throw error if no suitable provider found

## Cost Estimation

```typescript
import { calculateRequestCost } from '@gwi/core';

// Estimate cost for a request
const cost = calculateRequestCost(
  'anthropic',
  'claude-sonnet-4-20250514',
  10000, // input tokens
  2000   // output tokens
);
console.log(`Estimated cost: $${cost.toFixed(4)}`);
```

## Safety Levels

| Level | Min Tier | Required Capabilities |
|-------|----------|----------------------|
| `low` | 1 | None |
| `medium` | 2 | System prompts |
| `high` | 3 | System prompts, JSON mode |
| `critical` | 4 | System prompts, JSON mode, Function calling |

## Environment Variables Reference

| Variable | Description |
|----------|-------------|
| `GWI_LLM_PROVIDER` | Force specific provider type |
| `GWI_LLM_MODEL` | Force specific model |
| `GWI_LLM_BASE_URL` | Custom API endpoint |
| `GWI_LLM_API_KEY` | Override API key |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `GOOGLE_AI_API_KEY` | Google AI (Gemini) API key |
| `OPENAI_API_KEY` | OpenAI API key |

## Troubleshooting

### No Provider Available

```bash
# Check which providers are configured
gwi provider list

# Verify API key is set
echo $ANTHROPIC_API_KEY | head -c 10
```

### Wrong Model Selected

```bash
# Debug selection decision
gwi provider select --task-type code_generation --complexity 7 --verbose
```

### Cost Exceeding Budget

```typescript
policy.select({
  taskType: 'code_generation',
  complexity: 8,
  maxCostTier: 3,  // Limit to tier 3 or below
});
```

## Related Documentation

- [Security Threat Model](110-DR-TMOD-security-threat-model.md)
- [SLO/SLA Targets](111-DR-TARG-slo-sla-targets.md)
- [CLAUDE.md](../CLAUDE.md) - Build commands and architecture
