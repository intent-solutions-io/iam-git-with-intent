# Git With Intent vs Intent
## Customer Use Cases & Sales Plays

**Purpose:** Real-world scenarios for using GWI advantages in customer conversations
**Audience:** Sales team, customer success, pre-sales
**Last Updated:** February 10, 2026

---

## Use Case 1: Enterprise with SOC 2 Requirement

### Customer Profile
- 500+ engineers
- SaaS platform (regulated)
- SOC 2 Type II audit in 3 months
- GitHub/GitLab for code
- Slack for notifications

### Problem
> "Our auditors are asking who approved every code change. We use GitHub, but GitHub's native approval system doesn't give us the forensic trail we need. Everything is logged to Cloud Logging, but we need a system that binds approvals to changes cryptographically."

### Why GWI Wins

**Approval gating with SHA256 binding:**
```
Change: "Add database migration script"
├─ Proposed by: alice@company.com
├─ Reviewed by: bob@company.com
├─ Approved by: carol@company.com
│  ├─ Signature: Ed25519 (public key on HSM)
│  ├─ Binding: SHA256(change content)
│  ├─ Timestamp: 2026-02-10T14:32:00Z
│  └─ Audit trail: Immutable (Cloud Logging)
└─ Deployed by: (auto, via GitHub Actions)
   └─ Verified against approval signature ✓
```

**Evidence for audit:**
- Approval chain is cryptographically verified
- Each approver's identity is bound to the approval
- Change content is hashed (can't tamper post-approval)
- Full timeline in Cloud Logging (tamper-evident)
- Compliance team can demonstrate control

**What Intent can't do:**
- Intent has no approval system (Coordinator pattern, but not gating)
- No signature binding
- No forensic trail
- Auditors will reject it

### Sales Conversation

**You:** "For SOC 2 audit, auditors need to see approval chains. GitHub's native system doesn't bind approvals to changes. GWI's approval gating does—every change is signed, hashed, and immutable in logs."

**Customer:** "But we already use GitHub's code review system."

**You:** "GitHub's reviews are opinions. Ours are attestations. Auditors care about attestations. Let me show you the audit trail..."

**[Pull up GWI run artifact]**
```
approval.json:
{
  "approvals": [
    {
      "approver": "carol@company.com",
      "timestamp": "2026-02-10T14:32:00Z",
      "changeHash": "sha256:abc123...",
      "signature": "ed25519:xyz789...",
      "publicKey": "hsm:...",
      "scope": "commit"
    }
  ],
  "auditTrail": [
    {
      "timestamp": "2026-02-10T14:30:00Z",
      "event": "change_proposed",
      "actor": "alice@company.com"
    },
    {
      "timestamp": "2026-02-10T14:31:00Z",
      "event": "change_reviewed",
      "actor": "bob@company.com"
    },
    {
      "timestamp": "2026-02-10T14:32:00Z",
      "event": "change_approved",
      "actor": "carol@company.com",
      "signature": "verified"
    }
  ]
}
```

**Customer:** "Can your auditors see this?"

**You:** "Yes. It's in Cloud Logging. Tamper-evident. Immutable by design. This is what your auditors will ask for."

**Close:** "Let's run a pilot with your audit team. Show them the approval gating and forensics. If they're convinced, you're golden."

### Deal Size
- **Contract:** $50K-$100K/year (SMB) | $200K-$500K/year (Enterprise)
- **Sales cycle:** 30-60 days (audit deadline drives urgency)
- **Win probability vs Intent:** 95% (Intent has no answer for approval gating)

---

## Use Case 2: Startup Drowning in AI Bot PRs

### Customer Profile
- 20 engineers
- Fast-moving startup
- Using GitHub Actions for automation
- Daily PRs from bots (Dependabot, Renovate, AI agents, etc.)
- Review time is becoming bottleneck

### Problem
> "We have Dependabot, Renovate, and our own AI automation creating PRs. 40% of our daily PRs are from bots. Some are valuable (security updates), many are noise (style changes, comment improvements). Our team spends 3 hours/day on PR review. We need to filter the noise."

### Why GWI Wins

**AI Slop Detection:**
```
Daily PRs: 15
├─ Valuable PRs: 9
│  ├─ Security updates: 3
│  ├─ Feature work: 4
│  └─ Bug fixes: 2
│
└─ Slop PRs: 6 (flagged by GWI)
   ├─ Whitespace only: 2 (auto-closed)
   ├─ Comment improvements: 2 (auto-closed)
   └─ "Refactoring" with no substance: 2 (auto-closed)
```

**Result:** Reviewers see 9 PRs instead of 15. 6 hours/week saved. ~3 hours/day becomes 2 hours/day.

**Detection layers:**
1. **Linguistic:** Detects repetition, filler, templating in commit messages
2. **Contributor:** New contrib? No history? Flagged.
3. **Quality:** Code churn analysis—did you actually change logic?
4. **LLM:** Gemini Flash validates signals (not false positives)

**What Intent can't do:**
- Intent has no slop detection
- Coordinator pattern doesn't address junk PRs
- Customer still spends 3 hours/day filtering noise

### Sales Conversation

**You:** "You're getting crushed by bot PRs. 40% of your review time is looking at garbage. GWI detects that garbage automatically. We catch junk before it hits your queue."

**Customer:** "But we already have GitHub filters."

**You:** "GitHub can't read the PR content. GWI reads the entire PR—commit message, code changes, contributor history. Here's what slop looks like..."

**[Show examples]**
```
Slop Example 1:
Title: "Update comment"
Description: "Updated the comment to better describe the function"
Changes: "Line 45: // Now processes data" → "// Now processes and validates data"
Score: 85/100 (SLOP)

Reason:
- New contributor (no history)
- Trivial comment change
- No code logic change
- Generic description
```

**Customer:** "Yeah, that's what's killing us. Can you auto-close these?"

**You:** "Yes. And we have rules for auto-close thresholds. You can say: 'close anything >75% slop from contributors with <5 merged PRs.' Or manual review. Your choice."

**Close:** "One-week pilot. Let's turn on slop detection and show you the backlog of junk. You'll see the value in day 1."

### Deal Size
- **Contract:** $500-$2K/month (freemium path)
- **Sales cycle:** 7 days (freemium, fast decision)
- **Win probability vs Intent:** 85% (Intent doesn't solve this problem)

---

## Use Case 3: Mid-Market Agency (Multi-Client Workflows)

### Customer Profile
- 75 engineers
- Digital agency (5-10 active clients)
- Each client has different PR approval workflow
- Some clients want fast auto-merge, some want strict gating
- Managing 5 separate tools today (GitHub, Jenkins, Jira, Slack, custom approval system)

### Problem
> "Every client has a different workflow. Client A wants auto-merge on green CI. Client B wants 2 approvals + legal sign-off. Client C wants to run custom checks before merge. We're managing this with custom GitHub Actions for each client. It's unmaintainable."

### Why GWI Wins (Post-Q3 BYOA Launch)

**Before Q3:** Intent has clear advantage (BYOA framework exists)

**After Q3 2026:** GWI matches Intent, but with slop detection + cost routing

**BYOA Framework:**
```
# client-a-agent.ts (Custom agent for Client A)
export class ClientAAgent extends BaseAgent {
  async processPR(prData) {
    // Auto-merge on green
    if (prData.ciStatus === 'passed') {
      return { action: 'merge', auto: true }
    }
    // For failures, notify Slack
    return { action: 'notify', channel: '#client-a-pr-review' }
  }
}

# client-b-agent.ts (Custom agent for Client B)
export class ClientBAgent extends BaseAgent {
  async processPR(prData) {
    // Require legal review + 2 approvals
    return {
      action: 'gate',
      requiredApprovals: [
        { role: 'legal', count: 1 },
        { role: 'engineer', count: 2 }
      ]
    }
  }
}
```

**Registration:**
```bash
gwi agent register ./client-a-agent.ts --org=client-a
gwi agent register ./client-b-agent.ts --org=client-b
```

**Workflow template:**
```yaml
# .gwi/workflows/client-a.yml
name: client-a-auto-merge
agents:
  - ClientAAgent           # Custom agent
  - SlopDetector           # Built-in: catch junk
  - Reviewer               # Built-in: code review
```

**Result:** Each client gets exactly their workflow. No custom GitHub Actions. No maintenance nightmare.

**GWI advantages over Intent:**
- Slop detection (Intent doesn't have)
- Cost routing (save money on high-volume clients)
- Approval gating (if client needs it)
- Full audit trail (if client is regulated)

### Sales Conversation

**You:** "Managing 5 clients = 5 different workflows. BYOA framework lets you build once, deploy everywhere."

**Customer:** "But Intent already has BYOA."

**You:** "True. But you're also dealing with a lot of junk PRs from your clients' bots. GWI detects and auto-closes that slop. Intent doesn't. Plus, we route cheaper models for high-volume clients—you save 30% on the large clients."

**Customer:** "How much savings are we talking?"

**You:** "Client A: 2,000 PRs/month. At current rates, that's $1,000/month in API costs. With smart routing, $700/month. Over a year, that's $3,600 saved. On Client C (500 PRs/month), savings are lower, but still add up."

**Close:** "We're shipping BYOA in Q3. Until then, let's do a pilot with your largest client. Show that we can save them money + catch their bot spam. Interest?"

### Deal Size
- **Contract:** $5K-$15K/month (multi-client)
- **Sales cycle:** 60-90 days (RFP, evaluation)
- **Win probability vs Intent:** 40-50% pre-Q3 | 70% post-Q3 (BYOA + slop + cost)

---

## Use Case 4: Scale-Up Team (Cost Optimization)

### Customer Profile
- 150 engineers
- SaaS company, Series B
- 3,000 PRs/month
- Using large language models for code review
- Spending $8K/month on AI PR review (at current rates)

### Problem
> "We're scaling fast. Every month, more PRs. Our AI budget is doubling every quarter. We need to optimize costs without sacrificing quality."

### Why GWI Wins

**Multi-Model Routing:**
```
Current approach (fixed tier):
- Every PR: Claude Opus (best but expensive)
- Cost: 3,000 PRs/month * $0.15/PR = $450/month base
  (+ token overhead) = ~$8,000/month

GWI approach (complexity-aware):
- 60% of PRs: Gemini Flash ($0.05/PR) = 1,800 * $0.05 = $90
- 30% of PRs: Claude Sonnet ($0.08/PR) = 900 * $0.08 = $72
- 10% of PRs: Claude Opus ($0.15/PR) = 300 * $0.15 = $45
- Total: $207/month base

Token efficiency: ~20% fewer tokens (structured outputs)
- Current: $8,000
- GWI: ~$2,500

Monthly savings: $5,500
Annual savings: $66,000
```

**How it works:**
1. **Triage** scores PR complexity (1-10)
2. **Router** selects model:
   - 1-3: Gemini Flash (fast triage)
   - 4-7: Claude Sonnet (balanced)
   - 8-10: Claude Opus (hard problems)
3. **Review** uses selected model
4. **Feedback loop:** Adjust thresholds based on success rates

**What Intent can't do:**
- Intent doesn't have multi-model routing
- Likely uses fixed-tier approach
- No cost optimization story

### Sales Conversation

**You:** "You're spending $8K/month on AI review. That's because you're using the same model for everything. We route smart. 60% of your PRs are simple (we use cheap models). 30% are medium (balanced). 10% are hard (best model). You save 30% immediately."

**Customer:** "But doesn't cheaper mean lower quality?"

**You:** "Nope. We tested. Gemini Flash is 98% accurate for triage. Claude Sonnet is 95% for medium complexity. Opus is 99%+ for hard cases. You're overthinking most PRs with Opus when Flash would do fine."

**Customer:** "What's the implementation effort?"

**You:** "Zero. It's built in. We analyze every PR, pick the model, get the review. No config needed. But you can tune thresholds if you want."

**Close:** "Let's run a cost analysis. I'll show you the current spend, the projected GWI spend, and the accuracy comparison. Then you decide."

### Deal Size
- **Contract:** $10K-$30K/month (large volume)
- **Sales cycle:** 45-60 days (financial evaluation)
- **Win probability vs Intent:** 80% (cost is clear differentiator)

---

## Use Case 5: Open Source Maintainer (AI Spam)

### Customer Profile
- Popular open-source project (10K stars)
- 50+ contributors
- Maintainers unpaid/volunteer
- Flooded with low-quality PRs from AI agents
- Using GitHub's native review system

### Problem
> "We're getting 5-10 AI-generated PRs per day that add nothing. Comments rewritten 5 different ways. Whitespace 'improvements.' We can't hire people to filter this spam. We're considering closing the project."

### Why GWI Wins

**AI Slop Detection:**
```
Daily PRs: 12
├─ Legitimate: 8 (merged in <2 days)
└─ Spam/slop: 4 (auto-closed by GWI)
   ├─ "Improved comments" (no code change)
   ├─ Whitespace only
   ├─ Generic "refactoring" with no delta
   └─ First-time contributor with suspicious history
```

**Setup:**
```
.gwi/config.json
{
  "slop_detection": {
    "enabled": true,
    "auto_close_threshold": 75,
    "auto_close_comment": "This PR was flagged as low-quality AI-generated content. "
  }
}
```

**Result:** Maintainers see 8 PRs instead of 12. 4 hours/week of filtering gone.

**Open Source Tier:** Free for OSS projects (GWI gives this away to build goodwill + data)

### Sales Conversation

**You:** "You're drowning in spam PRs. GWI detects AI slop with 85% accuracy. We can auto-close anything above a threshold. Saves you 30-40% of review time."

**Maintainer:** "Can you afford to give this away?"

**You:** "For open source, yes. Here's why: you have real data about what slop looks like. That helps us train better. Plus, open source developers become paying customers at their jobs. It's an investment in goodwill."

**Maintainer:** "What's the cost?"

**You:** "Free. Forever. For open source. That's the license."

**Close:** "Try it on your repo. You'll feel the difference in day 1."

### Deal Size
- **Contract:** Free (but leads to enterprise deals)
- **Sales cycle:** 2 days (free, instant)
- **Win probability vs Intent:** 100% (Intent doesn't do free OSS)
- **Lifetime value:** $10K-$50K (maintainer becomes PM/CTO, brings company)

---

## Sales Playbook Summary

### When to Lead with Slop Detection
- **Customer pain:** "Too many junk PRs"
- **Segment:** Startups, agencies, OSS maintainers
- **Conversation:** "Reduce review burden by 30-40%"
- **Demo:** Show real slop examples (rewrite comments, whitespace)

### When to Lead with Approval Gating
- **Customer pain:** "Auditors want approval trails"
- **Segment:** Enterprise, regulated industries
- **Conversation:** "Approval chains that hold up in audit"
- **Demo:** Show run artifacts (signatures, hashes, timestamps)

### When to Lead with Cost Routing
- **Customer pain:** "AI costs are exploding"
- **Segment:** Scale-ups, high-volume PRs
- **Conversation:** "30% cost savings with better quality"
- **Demo:** Show cost simulation (Flash vs Sonnet vs Opus)

### When to Lead with BYOA (Post-Q3)
- **Customer pain:** "Every client has different workflow"
- **Segment:** Agencies, multi-tenant platforms
- **Conversation:** "Custom agents for each customer, no code"
- **Demo:** Walk through agent registration + workflow templates

### When to Lead with Local Review
- **Customer pain:** "Developers need fast feedback"
- **Segment:** Startups, high-velocity teams
- **Conversation:** "Code review at CLI before opening PR"
- **Demo:** `gwi review --local` (instant, offline)

---

## Objection Handlers

### "Intent has BYOA, you don't"
> "We're launching Q3. But ask yourself: do you have a slop problem? Do you need approval gating? Intent has neither. Once we ship BYOA, you get all three. Let's pilot now, evaluate BYOA in July."

### "Intent seems simpler"
> "Until you scale. At 50 PRs/day, you need cost optimization. At 100/day, you need governance. At 500/day, you need quality. Complexity pays dividends at scale. What scale are you at today?"

### "We already have GitHub review system"
> "GitHub's review is read-only feedback. GWI's approval gating is cryptographic attestation. Different products. For audits, you need attestation. For slop, you need detection. GitHub can't do either."

### "How do we know slop detection works?"
> "Good question. Let's enable it on your repo for 1 week. No commitment. Show me the PRs it flags as slop. You tell me if it's right. If yes, we continue. If no, we adjust the thresholds."

### "This seems expensive"
> "Let's calculate ROI. You spend X hours/month on review. At your team's loaded cost, that's Y dollars. Slop detection saves you Z% of that. If Z% > cost, it pays for itself. Usually by month 1."

---

## Next Steps for Sales Team

1. **This week:** Read COMPETITIVE-STRATEGY.md (full strategy)
2. **This week:** Review all 5 use cases above, memorize the patterns
3. **This week:** Practice objection handlers with your manager
4. **Next week:** Start A/B testing opening statements ("approval gating" vs "slop detection" vs "cost savings") with prospects
5. **Monthly:** Update this guide with new use cases from wins/losses

---

**Maintained By:** Sales Leadership + Product Marketing
**Last Updated:** February 10, 2026
**Next Update:** May 2026 (post-BYOA launch feedback)
