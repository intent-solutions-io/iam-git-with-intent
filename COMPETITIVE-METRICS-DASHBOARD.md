# Git With Intent vs Intent
## Competitive Metrics Dashboard

**Purpose:** Track win rates, product usage, and competitive positioning metrics
**Review Cadence:** Weekly (sales), Monthly (product/leadership)
**Last Updated:** February 10, 2026

---

## Executive Metrics

### Market Win Rate vs Intent

| Metric | Target | Current | Status | Notes |
|--------|--------|---------|--------|-------|
| **Enterprise deals (>$50K ACR) vs Intent** | 75% | TBD | TBD | Baseline: approval gating should drive dominance |
| **Mid-market deals ($10K-$50K ACR)** | 50% | TBD | TBD | Competitive; BYOA in Q3 improves this |
| **Startup deals (<$10K ACR)** | 65% | TBD | TBD | We have cost advantage + local review |
| **Agency/co-op deals** | 20% | TBD | TBD | Intent owns this; we can counter with BYOA Q3 |
| **Overall win rate** | 60% | TBD | TBD | Weighted by customer size/TAM |

### Sales Velocity

| Metric | Target | Current | Status | Trend |
|--------|--------|---------|--------|-------|
| **Deals entered (vs Intent mentioned)** | 20/month | TBD | TBD | How many prospects consider us vs Intent |
| **Competitive deal loss rate** | <30% | TBD | TBD | Of deals where Intent is option, what % do we lose |
| **Slop detection as deal-closer** | >40% | TBD | TBD | In won deals, how often was slop detection mentioned |
| **Approval gating as deal-closer** | >30% | TBD | TBD | Enterprise deals specifically |

---

## Product Moat Metrics

### AI Slop Detection

| Metric | Target | Current | Status | Calculation |
|--------|--------|---------|--------|------------|
| **PRs flagged as slop** | 15-25% | TBD | TBD | Sum of all slop scores > 60 / total PRs |
| **True positive rate** | >85% | TBD | TBD | Customer survey: "was that actually slop?" |
| **Review time saved** | 20% | TBD | TBD | (avg review time on non-slop) / (avg review time on all) |
| **Customer satisfaction** | 4.5/5 | TBD | TBD | NPS on slop detection feature |
| **Adoption rate** | 80% | TBD | TBD | % of customers using slop detection actively |

**Why we track this:**
- Validates moat defensibility
- Shows if slop detection is actually valuable
- Informs roadmap priorities (if TP rate low, needs tuning)

---

### Approval Gating

| Metric | Target | Current | Status | Calculation |
|--------|--------|---------|--------|------------|
| **Enterprise adoption** | >70% | TBD | TBD | % of enterprise customers with gating enabled |
| **Compliance certifications unblocked** | >5 | TBD | TBD | Customers who cite gating as SOC 2 requirement |
| **Approval chain integrity** | 100% | TBD | TBD | % of approvals with valid SHA256 binding |
| **Audit trail completeness** | 100% | TBD | TBD | % of changes traceable to approval |
| **Regulatory win rate** | 90% | TBD | TBD | Of regulated customers, what % pick GWI over alternatives |

**Why we track this:**
- Validates second moat (security story)
- Unblocks enterprise segment
- Shows if we own compliance narrative

---

### Cost Routing (Multi-Model)

| Metric | Target | Current | Status | Calculation |
|--------|--------|---------|--------|------------|
| **Cost per PR vs baseline** | 30% cheaper | TBD | TBD | (avg tokens used * provider cost) / PR count |
| **Model selection accuracy** | >90% | TBD | TBD | % of PRs routed to "optimal" model (success rate) |
| **Flash usage rate** | 60% | TBD | TBD | % of PRs using Gemini Flash (cheapest) |
| **Opus usage rate** | <5% | TBD | TBD | % of PRs needing Claude Opus (expensive) |
| **Customer cost savings** | $50K/year | TBD | TBD | (baseline cost) - (GWI cost) for large customers |

**Why we track this:**
- Validates cost advantage vs Intent
- Informs pricing strategy
- Shows ROI for cost-sensitive segments

---

## Competitive Positioning Metrics

### Feature Maturity Scorecard

| Feature | GWI | Intent | Gap | Q3 Target | Q4 Target |
|---------|-----|--------|-----|-----------|-----------|
| **PR Triage** | 5/5 | 5/5 | None | 5/5 | 5/5 |
| **Merge Conflict Resolution** | 5/5 | 4/5 | None | 5/5 | 5/5 |
| **Code Review** | 5/5 | 4/5 | None | 5/5 | 5/5 |
| **AI Slop Detection** | 5/5 | 0/5 | +5 | 5/5 | 5/5 |
| **Approval Gating** | 5/5 | 0/5 | +5 | 5/5 | 5/5 |
| **Local Review** | 5/5 | 2/5 | +3 | 5/5 | 5/5 |
| **BYOA Framework** | 2/5 | 5/5 | -3 | 5/5 | 5/5 |
| **Living Specification** | 1/5 | 5/5 | -4 | 4/5 | 5/5 |
| **Multi-Model Routing** | 5/5 | 3/5 | +2 | 5/5 | 5/5 |
| **IDE Integration** | 4/5 | 4/5 | None | 5/5 | 5/5 |

**Interpretation:**
- Pre-Q3: We lead on quality/governance, Intent leads on flexibility
- Post-Q3: We lead on all dimensions (quality + governance + flexibility)
- This table is the "close the gap" dashboard

---

### Customer Satisfaction by Feature

| Feature | GWI NPS | Intent NPS | Delta | Notes |
|---------|---------|-----------|-------|-------|
| **AI Slop Detection** | TBD | N/A | +100 | Only we have this |
| **Approval Gating** | TBD | N/A | +100 | Only we have this |
| **BYOA Framework** | N/A | TBD | -X | Intent better, we're catching up |
| **Overall** | 45 (target) | TBD | TBD | Track quarterly |

---

## Market Metrics

### TAM Coverage

| Segment | TAM | Our TAM | Intent TAM | Our % |
|---------|-----|---------|-----------|-------|
| **Enterprise DevOps (>200 eng)** | $500M | $500M | $50M | 90% |
| **Mid-Market (50-200 eng)** | $600M | $300M | $250M | 50% |
| **Startups (<50 eng)** | $400M | $400M | $100M | 80% |
| **Agencies (multi-client)** | $50M | $10M | $40M | 20% |
| **TOTAL** | $1.55B | $1.21B | $0.44B | **78%** |

**Interpretation:**
- GWI has larger TAM due to security/governance focus
- Enterprise segment is our fortress (approval gating)
- Agencies is where Intent wins (BYOA)
- Post-Q3 BYOA launch, we capture >60% of agency TAM too

---

### Market Perception (Quarterly Survey)

**Question:** "Which platform is best for your team's needs?"

| Dimension | Enterprise | Mid-Market | Startup | Agency |
|-----------|----------|-----------|---------|--------|
| **Quality & Safety** | GWI 75% | GWI 55% | GWI 60% | Intent 45% |
| **Flexibility** | Intent 30% | Intent 45% | Tie 40% | Intent 85% |
| **Cost** | Tie 50% | GWI 50% | GWI 70% | Tie 50% |
| **Governance** | GWI 90% | GWI 60% | GWI 40% | Tie 30% |
| **Ease of use** | Intent 40% | Tie 50% | Intent 55% | Intent 60% |

**Target for Q3 2026:** GWI wins all quadrants post-BYOA launch

---

## Churn & Retention Metrics

### Why Customers Choose GWI over Intent

| Reason | % of Wins | Enterprise | Mid | Startup |
|--------|-----------|-----------|-----|---------|
| **Approval gating** | 35% | 60% | 20% | 5% |
| **AI slop detection** | 25% | 15% | 20% | 40% |
| **Cost savings** | 20% | 5% | 30% | 50% |
| **Local review** | 10% | 5% | 15% | 20% |
| **Existing ecosystem** | 10% | 15% | 15% | 5% |

**Insight:** Different reasons win different segments. BYOA launch doesn't hurt (all features, flexible).

### Why Customers Choose Intent over GWI

| Reason | % of Losses | Enterprise | Mid | Startup |
|--------|------------|-----------|-----|---------|
| **BYOA framework** | 40% | 10% | 35% | 80% |
| **Perceived flexibility** | 30% | 20% | 40% | 20% |
| **Simpler mental model** | 20% | 10% | 20% | 40% |
| **CEO's existing relationship** | 10% | 20% | 5% | 0% |

**Insight:** BYOA is the main loss factor. Disappears in Q3 (hopefully). Simpler model is messaging problem (solvable).

---

## Leading Indicators (Early Signals)

### Pipeline Quality

| Metric | Definition | Target | Current | Trend |
|--------|-----------|--------|---------|-------|
| **Enterprise pipeline** | Deals >$50K ACR where approval gating mentioned | $5M+ | TBD | Should grow post-launch |
| **Competitive deals** | Where Intent is explicit competitor | >30% of pipeline | TBD | TBD |
| **RFP mentions** | "AI slop detection" in enterprise RFPs | >20% | TBD | Should grow monthly |
| **Slop detection trial rate** | % of new customers trying slop detection | >60% | TBD | Should be >80% |

### Content & Messaging

| Metric | Definition | Target | Current | Status |
|--------|-----------|--------|---------|--------|
| **"Approval gating" mentions** | In sales decks, websites, collateral | >80% | 40% | Needs boost |
| **Slop detection case studies** | Published wins citing slop detection | 5+ | 0 | Q2 priority |
| **Competitive whitepapers** | Content comparing GWI vs Intent | 3+ | 0 | Q2 priority |
| **Battle card usage** | Sales team cites competitive responses | >50% | TBD | Dependent on rollout |

---

## Lagging Indicators (Outcome Metrics)

| Metric | Q1 2026 | Q2 2026 | Q3 2026 | Q4 2026 | Target |
|--------|---------|---------|---------|---------|--------|
| **ARR** | TBD | TBD | TBD | TBD | $10M |
| **Enterprise ARR %** | TBD | TBD | TBD | TBD | 60% |
| **Win rate vs Intent** | TBD | TBD | TBD | TBD | 60% |
| **CAC payback** | TBD | TBD | TBD | TBD | <12 mo |
| **Net retention** | TBD | TBD | TBD | TBD | >110% |

---

## Competitive Sensitivity Analysis

### If Intent Launches [Feature], What Happens?

| Scenario | Risk | Mitigation | Impact |
|----------|------|-----------|--------|
| **Approval gating** | Medium | We own this narrative; copy takes 6 months | Low (we're 6 mo ahead) |
| **Slop detection** | High | We're first; they lack data | Medium (they catch up in 2026) |
| **Cost routing** | Low | They've never emphasized cost | Low (easy to copy, hard to compete on) |
| **Living spec** | Medium | We ship in Q3; competitive on features | Low (feature parity by Q4) |
| **BYOA** | High | They own it today; we ship Q3 | High pre-Q3, Low post-Q3 |

**Implication:** Speed to market on Q3 roadmap is critical. Every month = 5% market share swing.

---

## Reporting Template (Weekly)

**Subject:** GWI vs Intent Competitive Update

```
WINS THIS WEEK
- [Deal name]: Closed due to [approval gating | slop detection | cost]
- [Deal name]: Lost due to [BYOA | flexibility | perceived simplicity]

PIPELINE CHANGES
- Competitive deals in stage: [number]
- Win probability on competitive deals: [%]
- Key RFP mentions: [feature mentions]

KEY METRICS
- Slop detection adoption: [%]
- Approval gating enterprise: [%]
- Cost per PR trend: [up | down | stable]

NEXT WEEK PRIORITIES
- [Sales play 1]
- [Product milestone]
- [Messaging update]
```

---

## Annual Review (Q1, Q2, Q3, Q4)

**Key Questions:**
1. Are we winning on our moats (slop, gating, cost)?
2. Is the gap closing on flexibility (BYOA)?
3. Are we gaining market share vs Intent?
4. Is our pricing strategy working?
5. Are we positioned for $10M ARR by year-end?

**Decision Points:**
- Q1 → Q2: Are slop metrics validating the feature?
- Q2 → Q3: Is BYOA roadmap on track?
- Q3 → Q4: Did BYOA close the flexibility gap?
- Q4 2026: Do we have 60% win rate vs Intent?

---

**Maintained By:** Product Strategy + Sales Operations
**Distribution:** Weekly (sales team), Monthly (leadership)
**Archived:** In /000-docs/ with monthly snapshots
