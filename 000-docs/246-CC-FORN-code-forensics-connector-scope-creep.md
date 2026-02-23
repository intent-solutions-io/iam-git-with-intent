# 246-CC-FORN — Code Forensics: Connector Scope Creep (Epic B)

| Field       | Value                          |
|-------------|--------------------------------|
| ID          | 246-CC-FORN                    |
| Date        | 2026-02-22                     |
| Category    | Code Forensics                 |
| Status      | Resolved                       |
| Bead        | gwi-1gn                        |

## Summary

Epic B ("Data Ingestion & Connector Framework") introduced 7 connectors into `packages/connectors/`. Two of them — **Fivetran** and **Vertex AI** — have no plausible use in a PR automation tool. This document records the investigation and removal.

## What Was Found

### Connector Inventory (pre-removal)

| Connector  | Purpose in gwi context         | Imports outside own dir | Tests     | Verdict       |
|------------|--------------------------------|------------------------|-----------|---------------|
| GitHub     | PR/issue/repo operations       | Yes (apps, agents)     | Active    | **Justified** |
| GitLab     | MR/issue/repo operations       | No (unwired)           | Active    | Justified     |
| Slack      | Notifications, alerts          | No (unwired)           | Active    | Justified     |
| Jira       | Issue tracking integration     | No (unwired)           | Active    | Justified     |
| Linear     | Issue tracking integration     | No (unwired)           | Active    | Justified     |
| Fivetran   | ETL pipeline management        | None                   | Skipped   | **Unjustified** |
| Vertex AI  | MLOps platform management      | None                   | Skipped   | **Unjustified** |

### Evidence for Removal

**Fivetran connector** (`packages/connectors/src/fivetran/`, 6 files, ~1,726 LoC):
- Manages Fivetran ETL connectors, destinations, and sync schedules
- Zero imports from any app, agent, or engine package
- Tests marked `describe.skip` since 2025-02-12 with comment "not on the critical path"
- No issue or PR references this connector in any workflow

**Vertex AI connector** (`packages/connectors/src/vertex-ai/`, 5 files, ~2,079 LoC):
- Manages Vertex AI model endpoints, batch predictions, and pipelines
- Zero imports from any app, agent, or engine package
- Tests marked `describe.skip` since 2025-02-12 with comment "not on the critical path"
- gwi uses Vertex AI via `@gwi/core` LLM interfaces, not via a connector

### Root Cause

Agent-generated code during Epic B implementation. The agent interpreted "data ingestion connectors" broadly to include any external platform, rather than scoping to platforms relevant to PR automation workflows.

## Decision

**Remove both connectors.** ~3,800 lines of dead code eliminated.

### Files Deleted
- `packages/connectors/src/fivetran/` (entire directory)
- `packages/connectors/src/vertex-ai/` (entire directory)

### Files Edited
- `packages/connectors/src/index.ts` — removed barrel re-exports
- `packages/connectors/package.json` — removed `"./vertex-ai"` subpath export

### Remaining Connectors

GitLab, Slack, Jira, and Linear are justified by gwi's domain (PR automation integrates with issue trackers and notification systems) but are currently unwired — no app or agent imports them yet. They should be wired or pruned in a future pass.

## Lesson

When generating connectors or integrations via AI agents, scope review should verify each integration has a clear consumer in the application architecture. "Useful in general" is not sufficient — it must serve the product's actual workflows.
