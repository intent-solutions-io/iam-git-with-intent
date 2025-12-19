# Subagent AgentFS Protocol

**Internal Use Only** - This document describes how subagents record evidence in AgentFS.

---

## Overview

AgentFS provides auditable, reproducible evidence storage for all subagent work. Every subagent task MUST record evidence in AgentFS before completion.

---

## AgentFS Stores

| Store | Purpose | Location |
|-------|---------|----------|
| `gwi.db` | Main project state, phases, certifications | `.agentfs/gwi.db` |
| `audit-YYYY-MM-DD.db` | Daily audit evidence | `.agentfs/audit-YYYY-MM-DD.db` |
| `subagent-*.db` | Per-subagent working state | `.agentfs/subagent-*.db` |

---

## Subagent Types

| Type | Capability | Evidence Focus |
|------|------------|----------------|
| infra | OpenTofu, Cloud Run, IAM | Terraform plans, resource diffs |
| security | Auth, RBAC, secrets | Threat models, permission matrices |
| backend | Firestore, Pub/Sub, APIs | Schema changes, API contracts |
| frontend | React, Firebase Hosting | Component changes, build outputs |
| connectors | GitHub, Slack integrations | Webhook schemas, API responses |
| ai | LLM prompts, agent logic | Prompt versions, model configs |
| qa | Tests, coverage, ARV | Test results, coverage reports |
| docs | Documentation, AARs | Doc changes, compliance evidence |

---

## Evidence Recording Protocol

### 1. Start Task

```sql
INSERT INTO tool_calls (name, parameters, status, started_at)
VALUES (
  'subagent:<type>:<task-id>',
  '{"bead":"<bead-id>","task":"<description>","scope":"<files-affected>"}',
  'running',
  strftime('%s', 'now')
);
```

### 2. Complete Task

```sql
UPDATE tool_calls
SET
  result = '{"files":[...],"tests":"passing/failing","commands":[...],"rollback":"..."}',
  status = 'success',
  completed_at = strftime('%s', 'now'),
  duration_ms = (strftime('%s', 'now') - started_at) * 1000
WHERE name = 'subagent:<type>:<task-id>' AND status = 'running';
```

### 3. Record Failure

```sql
UPDATE tool_calls
SET
  error = '{"message":"...","stack":"...","recovery":"..."}',
  status = 'failed',
  completed_at = strftime('%s', 'now')
WHERE name = 'subagent:<type>:<task-id>' AND status = 'running';
```

---

## Required Evidence Fields

### Parameters (Input)

```json
{
  "bead": "git-with-intent-xxx",
  "task": "Short description",
  "scope": "packages/core/src/...",
  "depends_on": ["bead-1", "bead-2"],
  "acceptance_criteria": ["AC1", "AC2"]
}
```

### Result (Output)

```json
{
  "files": ["path/to/file1.ts", "path/to/file2.ts"],
  "tests": "passing",
  "test_output": "5 passed, 0 failed",
  "commands": ["npm run build", "npm run test"],
  "risks": ["Edge case X not covered"],
  "rollback": "git revert <hash>"
}
```

### Error (Failure)

```json
{
  "message": "Build failed",
  "stack": "Error at line 42...",
  "recovery": "Fix type error in X",
  "blocked_by": ["Missing dependency Y"]
}
```

---

## KV Store Usage

Store persistent metadata in KV:

```sql
-- Store subagent checkpoint
INSERT INTO kv_store (key, value, created_at, updated_at)
VALUES (
  'subagent:<type>:checkpoint',
  '{"last_task":"A1.s3","status":"complete","timestamp":"..."}',
  strftime('%s', 'now'),
  strftime('%s', 'now')
);

-- Query checkpoints
SELECT key, value FROM kv_store WHERE key LIKE 'subagent:%';
```

---

## Evidence Index Updates

After each task, update the evidence index:

```markdown
## Subagent: <type>

| Task | Status | Evidence | Timestamp |
|------|--------|----------|-----------|
| A1.s1 | complete | tool_call #42 | 2025-12-19 |
```

---

## Verification Commands

```bash
# List all subagent tool calls
sqlite3 .agentfs/gwi.db "SELECT name, status, started_at FROM tool_calls WHERE name LIKE 'subagent:%';"

# Get subagent checkpoints
sqlite3 .agentfs/gwi.db "SELECT key, value FROM kv_store WHERE key LIKE 'subagent:%';"

# Count by status
sqlite3 .agentfs/gwi.db "SELECT status, COUNT(*) FROM tool_calls WHERE name LIKE 'subagent:%' GROUP BY status;"
```

---

## CI Guard

AgentFS is INTERNAL ONLY. The CI guard ensures no AgentFS references leak:

```bash
npm run arv:no-internal-tools
```

Forbidden in production paths: `agentfs`, `AgentFS`, `.agentfs`

---

## Quick Reference

```bash
# Create new store
agentfs init .agentfs/subagent-security.db

# Query store
sqlite3 .agentfs/gwi.db "SELECT * FROM tool_calls ORDER BY id DESC LIMIT 5;"

# Export evidence
sqlite3 .agentfs/gwi.db ".dump" > internal/rest-zone/gwi-backup.sql
```
