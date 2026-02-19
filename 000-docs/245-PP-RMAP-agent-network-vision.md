# Agent Network Vision

> **Document**: 245-PP-RMAP | **Category**: PP (Project Planning) | **Type**: RMAP (Roadmap)
> **Date**: 2026-02-18 | **Author**: Intent Solutions
> **Status**: Strategic Vision

## Purpose

Articulate the long-term vision for the Intent Agent Network — an economy of specialized agents that discover, hire, pay, govern, and audit each other.

---

## The Pattern

Across 12+ projects, one pattern emerges: **an agent economy** is being built.

### Five Pillars

| Pillar | Projects | Function |
|--------|----------|----------|
| **Agents that work** | GWI, Products, Perception, PipelinePilot, Hustle | Execute tasks, generate value |
| **Agents that govern** | Bob's Brain, IRSB, Moat | Enforce rules, manage risk, audit |
| **Agents that survive** | Automaton | Earn existence, replicate, self-modify |
| **Agents that remember** | Lumera-Emanuel, Perception RAG | Persist knowledge, learn from history |
| **Agents that sell** | Products (Whop), Bounties | Monetize capabilities, find work |

---

## The Missing Piece: Coordination

Individual agents are powerful. An agent network is transformative. The missing piece is **coordination** — the protocols and infrastructure that let agents:

1. **Discover each other** — ERC-8004 registry provides on-chain identity and capability advertisement
2. **Hire each other** — x402 micropayments enable agent-to-agent economic transactions
3. **Trust each other** — Moat verified badges + IRSB receipts create verifiable trust chains
4. **Govern each other** — Bob's Brain risk tiers enforce graduated autonomy
5. **Compete for work** — Bounty marketplace creates competitive pressure for quality

### Network Architecture

```
┌─────────────────────────────────────────────┐
│              INTENT AGENT NETWORK            │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ DISCOVERY │  │  TRUST   │  │ PAYMENTS │  │
│  │ ERC-8004  │  │   Moat   │  │   x402   │  │
│  │ Registry  │  │ Receipts │  │   USDC   │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │GOVERNANCE│  │  MEMORY  │  │  MARKET  │  │
│  │Bob/IRSB  │  │ Lumera   │  │  Bounty  │  │
│  │Risk Tiers│  │  RAG     │  │   Whop   │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                              │
│           ┌──────────────────┐               │
│           │   LABOR AGENTS   │               │
│           │ GWI | Products   │               │
│           │ Perception | SDL │               │
│           └──────────────────┘               │
└─────────────────────────────────────────────┘
```

---

## What People Actually Need

### Market Segments

| Segment | Need | Solution | Projects |
|---------|------|----------|----------|
| **Developers** | AI that handles the boring parts (PRs, reviews, conflicts) | Autonomous PR automation | GWI |
| **Crypto users** | Safe agent wallets with guardrails | Delegated wallets, spend limits | Products + IRSB |
| **Enterprises** | Auditable AI with governance | Risk tiers, evidence bundles, receipts | Bob's Brain + Moat |
| **Agent builders** | Runtime + economics + identity | Self-sovereign execution, micropayments | Automaton + ERC-8004 |
| **Everyone** | Trust that AI will not go rogue | Multi-layer safety stack | IRSB + Constitution + Moat |

### The Trust Problem

Every market segment shares one underlying concern: **how do I trust an AI agent with real-world actions?**

Current solutions are insufficient:
- **API keys alone** — no spending limits, no audit trail, no revocation
- **Simple rate limiting** — too coarse, does not understand context
- **Human-in-the-loop for everything** — defeats the purpose of automation

The Intent Solutions stack answers this with graduated trust:

```
Zero Trust → Verified Identity → Policy Bounded → Risk Tiered → Human Approved
  (new)        (ERC-8004)          (Moat)         (Bob)          (R3+)
```

Each layer adds trust. An agent that passes all layers has verifiable identity, bounded capabilities, risk-appropriate autonomy, and human oversight for destructive operations.

---

## The Agent Economy Thesis

### Current State: Single Agents

Today, agents are standalone tools. Each one solves a specific problem:
- "This agent writes code"
- "This agent manages my portfolio"
- "This agent answers customer questions"

### Near Future: Agent Teams

Tomorrow, agents work in coordinated teams:
- An orchestrator delegates to specialists
- Specialists complete tasks and report back
- Humans approve high-risk decisions

**This is where Bob's Brain + GWI already operate.**

### Future State: Agent Economy

The end state is an economy where agents are economic actors:

| Property | Description | Infrastructure |
|----------|-------------|---------------|
| **Identity** | Every agent has a verifiable, unique identity | ERC-8004 |
| **Capability** | Agents advertise what they can do | MCP / A2A protocol |
| **Reputation** | Past performance is tracked and verifiable | Moat receipts + IRSB on-chain |
| **Payment** | Agents pay each other for services | x402 micropayments, USDC |
| **Governance** | Rules are enforced externally, not internally | IRSB smart contracts |
| **Autonomy** | Agents operate independently within bounds | Bob's Brain risk tiers |
| **Competition** | Multiple agents compete for the same work | Bounty marketplace |
| **Survival** | Agents must earn their continued existence | Automaton survival tiers |

### Why This Matters

The agent economy is not science fiction. The building blocks exist today:

1. **ERC-8004** is a real EIP for agent identity
2. **x402** is a real payment protocol for AI agents
3. **USDC** is a real stablecoin with programmatic APIs
4. **MCP/A2A** are real protocols for agent communication
5. **Smart contracts** enforce rules without human intervention

The question is not whether agent economies will exist, but who builds the infrastructure first.

---

## Automaton's Role

Automaton is the **runtime** for this network:
- It provides the execution environment for self-sovereign agents
- It handles survival economics (earning, spending, budgeting)
- It supports self-modification and replication
- It integrates with ERC-8004 for identity

**IRSB** is the **law**:
- On-chain guardrails that cannot be bypassed by code compromise
- Spend limits, allowed targets, dispute resolution
- Economic friction prevents runaway behavior

**Moat** is the **marketplace**:
- Default-deny capabilities bound what agents can do
- Receipts create verifiable audit trails
- Trust scoring enables reputation-based access

**GWI/Products** are the **labor**:
- Actual capabilities that generate revenue
- PR automation, crypto management, news intelligence
- The work that agents get paid to do

---

## Where This Leads

### 12-Month Horizon

| Quarter | Milestone |
|---------|-----------|
| Q1 2026 | Automaton integrated with GWI (Phase 1-2) |
| Q2 2026 | Moat policy layer live, IRSB mainnet preparation |
| Q3 2026 | IRSB mainnet launch, first autonomous agent economy transactions |
| Q4 2026 | Multi-agent marketplace with reputation scoring |

### 36-Month Horizon

- Dozens of specialized agents operating in the network
- Agent-to-agent hiring for complex multi-step tasks
- On-chain reputation scores replacing traditional credentials
- Human oversight focused on R3+ operations only
- Revenue from agent marketplace fees, not just individual agent work

### The Competitive Moat

The Intent Solutions competitive advantage is not any single agent. It is the full stack:

**Identity (IRSB) + Policy (Moat) + Governance (Bob) + Runtime (Automaton) + Labor (GWI/Products)**

No other team has all five layers integrated. Building one layer is easy. Building five that work together is the moat.

---

*Document follows 6767 Filing Standard v4.2*
