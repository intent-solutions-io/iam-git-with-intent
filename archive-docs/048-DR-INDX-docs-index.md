# Documentation Index

> **Timestamp**: 2025-12-16 19:25 CST
> **Branch**: phase-8-github-app-and-webhook
> **Purpose**: Index of current vs archived documentation

---

## Current Documentation (000-docs/)

These are the active, authoritative documents for git-with-intent:

| Doc | Purpose |
|-----|---------|
| `044-DR-GUID-agent-engine-context.md` | Agent Engine deployment context capsule (READ FIRST) |
| `045-DR-CHKL-agent-engine-compliance.md` | Compliance checklist for Agent Engine |
| `046-DR-GUID-agentfs-beads-setup.md` | AgentFS + Beads installation guide |
| `047-LS-CHKP-baseline-checkpoint.md` | Latest checkpoint (2025-12-16) |
| `048-DR-INDX-docs-index.md` | This index |
| `6767-a-DR-STND-document-filing-system-standard-v4.md` | Filing system standard (cross-repo) |
| `6767-f-DR-STND-work-tracking-beads-taskids.md` | Beads work tracking standard |
| `6767-g-DR-STND-beads-agentfs-complementary-systems.md` | AgentFS/Beads integration standard |

---

## Archived Documentation (archive-docs/)

Legacy docs moved to `archive-docs/` to keep `000-docs/` clean per 6767 v4.2 flat rule.

**48 documents archived**, including:

### Phase AARs (After-Action Reports)
- `001-AA-AACR-phase-0-template-foundation.md`
- `002-AA-AACR-phase-1-gcp-sop-addition.md`
- `005-AA-AACR-phase-1-runtime-devtools-reset.md`
- `008-AA-AACR-phase-1a-directory-scaffold-devtools-policy.md`
- `013-AA-AACR-phase-2-gwi-saas-core-design.md`
- `015-AA-AACR-phase-3-agentfs-beads-hooks-and-repo-wiring.md`
- `017-AA-AACR-phase-4-claude-internal-hook-protocol.md`
- `019-AA-AACR-phase-5-gwi-api-and-a2a-gateway-skeleton.md`
- `021-AA-AACR-phase-6-gwi-live-agentfs-and-beads-wiring.md`
- `023-AA-AACR-phase-7-firestore-runtime-stores-wiring.md`
- `026-AA-AACR-phase-8-github-app-webhook-tenant-linking.md`
- `028-AA-AACR-phase-9-staging-cloud-run-firestore-deployment.md`
- `030-AA-AACR-phase-10-firebase-hosting-saas-ui-shell.md`
- `033-AA-REPT-phase-01-gwi-repo-and-docs-normalization.md`
- `035-AA-AACR-phase-02-gwi-minimal-e2e-workflow.md`
- `038-AA-REPT-phase-04-coderagent-issue-to-code-workflow.md`
- `042-AA-REPT-agent-execution-backbone-plan.md`
- `043-AA-REPT-agent-execution-backbone-complete.md`

### Architecture Decision Records (ADRs)
- `004-DR-ADRC-runtime-vs-devtools.md`
- `006-DR-ADRC-agentfs-beads-policy.md`
- `007-DR-ADRC-directory-structure.md`
- `010-DR-ADRC-gwi-multi-tenant-model.md`
- `011-DR-ADRC-gwi-api-surface-v0-1.md`
- `014-DR-ADRC-agent-hook-system-policy.md`
- `016-DR-ADRC-claude-internal-hook-protocol.md`
- `018-DR-ADRC-gwi-api-and-gateway-skeleton.md`
- `020-DR-ADRC-gwi-live-agentfs-and-beads-config.md`
- `022-DR-ADRC-firestore-runtime-stores.md`
- `025-DR-ADRC-github-app-webhook-tenant-linking.md`
- `027-DR-ADRC-staging-cloud-run-firestore-deployment.md`
- `029-DR-ADRC-firebase-hosting-saas-ui-shell.md`

### Audits and Status Reports
- `003-AA-AUDT-appaudit-devops-playbook.md`
- `031-AA-AUDT-launch-readiness-assessment.md`
- `032-AA-AUDT-appaudit-devops-playbook.md`
- `036-AA-AUDT-status-report-2025-12-16.md`
- `037-AA-AUDT-status-report-2025-12-16-v2.md`
- `040-AA-AUDT-production-readiness-summary.md`

### Templates and SOPs
- `6767-b-AA-TMPL-after-action-report-template.md`
- `6767-c-DR-SOPS-project-start-sop.md`
- `6767-d-DR-TMPL-project-spec-pack.md`
- `6767-e-DR-GUID-how-to-use-template.md`
- `6767-h-OD-SOPS-gcp-firebase-setup-sop.md`

### Other
- `009-PM-PRDC-git-with-intent-cloud-saas-v0-1.md`
- `012-AT-ARCH-run-types-and-agent-pipeline.md`
- `024-AA-REPT-gwi-release-v0.2.0.md`
- `034-AA-PLAN-phase-02-gwi-minimal-e2e-workflow.md`
- `039-AA-REPT-p0-github-issue-fetching-fix.md`
- `041-AA-GUID-user-journey.md`

---

## Rationale

Per 6767 Document Filing System Standard v4.2:
- `000-docs/` must be **strictly flat** (no subdirectories)
- Moving legacy docs to `archive-docs/` keeps the active folder clean
- All docs preserved with git history intact (used `git mv`)

---

## See Also

- `CLAUDE.md` - Session boot requirements
- `README.md` - Project overview
- `archive-docs/` - Full historical documentation
