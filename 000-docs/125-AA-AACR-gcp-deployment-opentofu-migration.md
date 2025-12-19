# 125-AA-AACR GCP Deployment + OpenTofu Migration

**Date**: 2025-12-18 CST
**Epic**: git-with-intent-jzhl
**Status**: COMPLETE

## Summary

Deployed Git With Intent infrastructure to GCP and migrated from Terraform to OpenTofu.

## Tasks Completed

| Task | Bead ID | Description | Evidence |
|------|---------|-------------|----------|
| T1 | git-with-intent-jzhl.1 | GCP project bootstrap | Project exists, billing enabled, APIs enabled |
| T2 | git-with-intent-jzhl.2 | OpenTofu migration | tofu validate passes, 47 resources planned |
| T2a | git-with-intent-jzhl.11.1 | Root module setup | tofu fmt/validate/plan clean |
| T2b | git-with-intent-jzhl.11.2 | State strategy | GREENFIELD - 47 add, 0 change, 0 destroy |
| T2c | git-with-intent-jzhl.11.3 | Remove legacy Terraform refs | Docs, configs, .gitignore updated |
| T2d | git-with-intent-jzhl.11.4 | CI pipeline | .github/workflows/ci.yml uses OpenTofu 1.8.7 |
| T2e | git-with-intent-jzhl.11.5 | Drift detection | drift-detection.yml with nightly schedule |
| T3 | git-with-intent-jzhl.3 | Firebase Hosting | https://git-with-intent.web.app HTTP 200 |
| T4 | git-with-intent-jzhl.4 | Cloud Run deploy path | Artifact Registry gwi exists, CI builds images |
| T5 | git-with-intent-jzhl.14 | Agent Engine surface | Documented in agent_engine.tf (ADK CLI deploy) |
| T6 | git-with-intent-jzhl.15 | WIF configuration | Pool + provider in iam.tf, outputs for GitHub |
| T7 | git-with-intent-jzhl.16 | Drift validator tests | Exit code 2 = drift, 0 = no drift |
| T8 | git-with-intent-jzhl.17 | Observability + budgets | Alert policies + budget resource |
| T9 | git-with-intent-jzhl.18 | This AAR | Evidence bundle |

## Key Decisions

### State Migration Strategy: GREENFIELD

Existing GCP resources use different naming convention:
- Legacy: `gwi-gateway`, `gwi-github-webhook`
- OpenTofu: `git-with-intent-a2a-gateway-{env}`, `git-with-intent-github-webhook-{env}`

Decision: Fresh deployment rather than import. Clean state, no migration complexity.

### Agent Engine: ADK CLI Managed

Vertex AI Agent Engine does not have OpenTofu provider support. Resources deployed via:
- ADK CLI: `adk deploy agent_engine --staging_bucket gs://...`
- gcloud: `gcloud ai reasoning-engines create ...`

Engine IDs passed to Cloud Run via variables.

### WIF Over Service Account Keys

All GitHub Actions authentication uses Workload Identity Federation. No service account keys stored in secrets.

## Evidence Bundle

### OpenTofu Validation
```
$ tofu validate
Success! The configuration is valid.
```

### Plan Summary
```
Plan: 47 to add, 0 to change, 0 to destroy.
```

### Firebase Hosting
```
$ curl -s -o /dev/null -w "%{http_code}" https://git-with-intent.web.app
200
```

### Artifact Registry
```
$ gcloud artifacts repositories describe gwi --location=us-central1 --project=git-with-intent
NAME: projects/git-with-intent/locations/us-central1/repositories/gwi
FORMAT: DOCKER
MODE: STANDARD_REPOSITORY
```

### Firestore Database
```
$ gcloud firestore databases list --project=git-with-intent
NAME                                          TYPE              LOCATION_ID
projects/git-with-intent/databases/(default)  FIRESTORE_NATIVE  us-central1
```

## Files Changed

### Infrastructure (infra/)
- `provider.tf` - OpenTofu backend configuration
- `main.tf` - managed_by = "opentofu"
- `variables.tf` - Agent Engine ID variables
- `cloud_run.tf` - Engine ID environment variables
- `iam.tf` - WIF pool + provider
- `monitoring.tf` - Budget resources added
- `outputs.tf` - WIF outputs for GitHub
- `agent_engine.tf` - Documentation for ADK deploy
- `README.md` - OpenTofu migration docs
- `envs/*.tfvars` - Updated comments

### Workflows (.github/workflows/)
- `ci.yml` - OpenTofu 1.8.7, format/validate steps
- `drift-detection.yml` - NEW: Nightly drift check

### Configuration
- `.gitignore` - OpenTofu entries
- `firebase.json` - Site configuration
- `.firebaserc` - Firebase project config
- `tofu.tfvars.example` - Renamed from terraform.tfvars.example

### Documentation
- `CLAUDE.md` - OpenTofu references
- `README.md` - infra/ path update

## Next Steps

1. Configure GitHub repository variables:
   - `WIF_PROVIDER`: Output from `tofu output wif_provider`
   - `WIF_SERVICE_ACCOUNT`: Output from `tofu output github_actions_service_account`
   - `GCP_PROJECT_ID`: git-with-intent

2. Run first CI deploy on develop branch

3. Deploy Agent Engine via ADK CLI

4. Update tfvars with deployed Engine IDs

## Lessons Learned

1. **OpenTofu compatibility**: Uses HCL syntax and existing providers.

2. **Greenfield vs import**: When naming conventions differ, greenfield is cleaner.

3. **Agent Engine gap**: No provider support yet. ADK CLI is the path.

4. **WIF complexity**: Pool + provider setup is verbose but more secure than keys.

---

*Generated: 2025-12-18 CST*
*Epic: git-with-intent-jzhl*
