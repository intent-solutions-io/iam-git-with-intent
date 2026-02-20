# Agent Ecosystem Inventory

> **Document**: 241-PP-RMAP | **Category**: PP (Project Planning) | **Type**: RMAP (Roadmap)
> **Date**: 2026-02-18 | **Author**: Intent Solutions
> **Status**: Current Assessment

## Purpose

Comprehensive inventory of all agent projects across the Intent Solutions ecosystem, covering sovereign agents, enterprise orchestration, on-chain governance, commercial products, and developer tooling.

---

## Shipped & Revenue-Generating

### Products (4 Crypto Agents)

| Field | Detail |
|-------|--------|
| **What** | Crypto Portfolio Manager, AI Wallet Agent, Vincent DeFi Agent, Derivatives Signal Agent |
| **Stack** | Python, TypeScript, Lit Protocol TEE |
| **Revenue** | Whop membership ($29/mo) |
| **Status** | **Code exists, NOT deployed** — agents are built but not running in production |
| **Deployment** | Sold as membership access; actual agent execution pending infrastructure |

### GWI (Git With Intent)

| Field | Detail |
|-------|--------|
| **What** | AI-powered PR automation CLI — triage, resolve, review, autopilot with approval gating |
| **Stack** | TypeScript monorepo, 9 apps, 8 packages, 5 Cloud Run services |
| **Version** | v0.9.0 alpha |
| **Status** | **Active development, pre-GA** |
| **Agents** | 8: orchestrator, foreman, triage, coder, resolver, reviewer, slop, infra |
| **Infra** | 18 Terraform files, Firestore storage, SPIFFE identity |

### Membership Gateway

| Field | Detail |
|-------|--------|
| **What** | Whop webhook to GitHub team access automation |
| **Stack** | FastAPI, Cloud Run |
| **Status** | **Production** |
| **Function** | Automates team membership based on Whop payment events |

---

## Infrastructure & Governance Layer

### IRSB (Intent Receipts & Sovereign Banking)

| Field | Detail |
|-------|--------|
| **What** | On-chain guardrails — spend limits, receipts, disputes, ERC-8004 identity |
| **Stack** | Solidity 0.8.25, 37 contracts, 552 tests |
| **Status** | **Alpha, Sepolia testnet live, mainnet target H3 2026** |
| **Key Features** | WalletDelegate, SpendLimitEnforcer, AllowedTargetsEnforcer, dispute resolution |

### Moat

| Field | Detail |
|-------|--------|
| **What** | MCP-first policy, trust, and execution layer — receipts on every capability call |
| **Stack** | Python, FastAPI, 4 microservices |
| **Status** | **MVP** |
| **Key Features** | Default-deny capabilities, policy enforcement, receipt generation, trust scoring |

### Bob's Brain

| Field | Detail |
|-------|--------|
| **What** | Enterprise orchestrator — risk tiers R0-R4, policy gates, evidence bundles, Mission Spec v1 |
| **Stack** | Python, Google ADK, Vertex AI Agent Engine |
| **Repository** | `intent-solutions-io/iam-bobs-brain` (org repo, not personal) |
| **Status** | **Production-grade** |
| **Key Features** | Graduated autonomy (R0 read-only through R4 financial), evidence bundles, approval workflows |

### Lumera-Emanuel

| Field | Detail |
|-------|--------|
| **What** | Agent memory — hybrid local-search + cascade encrypted storage, MCP interface |
| **Stack** | Python, SQLite, AES-256-GCM encryption |
| **Version** | v0.1.0 |
| **Status** | **Initial release** |
| **Key Features** | Privacy-first memory, MCP tool interface, encrypted storage |

---

## Intelligence & Orchestration

### Perception

| Field | Detail |
|-------|--------|
| **What** | 8-agent news intelligence — 226 RSS feeds, daily briefs, Gemini analysis |
| **Stack** | Google ADK, Vertex AI, 5 Cloud Run MCP servers |
| **Version** | v0.3.0 beta |
| **Status** | **Beta** |
| **Agents** | Feed Scanner, Content Analyzer, Brief Writer, Trend Detector, + 4 more |

### IntentVision

| Field | Detail |
|-------|--------|
| **What** | Forecasting + anomaly detection for SaaS metrics |
| **Stack** | TypeScript, Cloud Run, Nixtla TimeGPT |
| **Version** | v0.13.0 staging |
| **Status** | **Staging** |
| **Key Features** | Time series forecasting, anomaly detection, metric dashboards |

### PipelinePilot

| Field | Detail |
|-------|--------|
| **What** | SDR orchestration — Research, Enrich, Outreach agents |
| **Stack** | Google ADK, Vertex AI |
| **Status** | **Phase 1 complete** |
| **Agents** | Research Agent, Enrichment Agent, Outreach Agent |

### Hustle

| Field | Detail |
|-------|--------|
| **What** | Youth sports platform with 5 Vertex AI agents |
| **Stack** | Next.js, Firebase, Vertex AI |
| **Status** | **Active development** |

### Hybrid AI Stack

| Field | Detail |
|-------|--------|
| **What** | Cost-optimized model routing (local vs cloud, 60-80% savings) |
| **Stack** | Python, Ollama, Flask |
| **Status** | **Production-ready** |
| **Key Features** | Automatic model selection, local-first inference, cloud fallback |

---

## Frontier & Research

### Automaton (Forked)

| Field | Detail |
|-------|--------|
| **What** | Self-sovereign AI — earns existence, replicates, self-modifies, ERC-8004 identity |
| **Stack** | TypeScript, Conway Cloud, USDC payments |
| **Ownership** | Conway Research (forked, not original work) |
| **Status** | **Active research** |
| **Key Features** | SOUL.md constitution, survival tiers, self-modification, social inbox |

### Cortex

| Field | Detail |
|-------|--------|
| **What** | "The AI Layer For Linux" — OS-level AI integration |
| **Status** | **Early research** |
| **Notes** | Conceptual stage, exploring system-level agent integration |

### Executive Intent

| Field | Detail |
|-------|--------|
| **What** | DLP-enforced Gmail/Calendar proxy with vector search |
| **Stack** | Next.js, Supabase, Nightfall DLP |
| **Status** | **Alpha** |
| **Key Features** | Data loss prevention, vector search over email, calendar integration |

---

## Cross-Cutting Summary

### By Language

| Language | Projects |
|----------|----------|
| TypeScript | GWI, Automaton, IntentVision, Executive Intent |
| Python | Products, Bob's Brain, Moat, Perception, PipelinePilot, Lumera, Hybrid AI |
| Solidity | IRSB |
| Next.js | Hustle, Executive Intent |

### By Cloud Platform

| Platform | Projects |
|----------|----------|
| GCP (Cloud Run) | GWI, Membership Gateway, Perception, IntentVision |
| GCP (Vertex AI) | Bob's Brain, Perception, PipelinePilot, Hustle |
| GCP (Firebase) | GWI (web), Hustle |
| Conway Cloud | Automaton |
| Sepolia/Mainnet | IRSB |

### By Status

| Status | Count | Projects |
|--------|-------|----------|
| Production | 2 | Membership Gateway, Bob's Brain |
| Alpha/Beta | 5 | GWI, IRSB, Perception, Executive Intent, Lumera |
| Active Dev | 3 | Hustle, PipelinePilot, Automaton |
| Staging | 1 | IntentVision |
| Research | 2 | Cortex, Hybrid AI |
| Code Only (not deployed) | 1 | Products |

### Total Agents Across Ecosystem

| Project | Agent Count |
|---------|-------------|
| GWI | 8 |
| Perception | 8 |
| Bob's Brain | 1 (orchestrator) |
| Hustle | 5 |
| PipelinePilot | 3 |
| Products | 4 |
| Automaton | 1 (self-sovereign) |
| **Total** | **30+** |

---

*Document follows 6767 Filing Standard v4.2*
