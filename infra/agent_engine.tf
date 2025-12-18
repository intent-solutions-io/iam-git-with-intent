# ============================================================================
# Vertex AI Agent Engine Configuration
# ============================================================================
#
# IMPORTANT: Agent Engine resources are NOT managed by OpenTofu
#
# Vertex AI Agent Engine (formerly Reasoning Engine) does not have
# Terraform/OpenTofu provider support as of December 2025.
#
# Agent Engine resources are deployed and managed via:
# 1. ADK CLI: `adk deploy agent_engine --staging_bucket gs://...`
# 2. gcloud: `gcloud ai reasoning-engines create ...`
# 3. Vertex AI Console
#
# ============================================================================
# Deployment Workflow
# ============================================================================
#
# 1. Deploy agents using ADK CLI:
#    ```bash
#    cd agents/triage
#    adk deploy agent_engine \
#      --project=git-with-intent \
#      --region=us-central1 \
#      --staging_bucket=gs://git-with-intent-adk-staging
#    ```
#
# 2. Capture the deployed Engine ID from output
#
# 3. Update tfvars with Engine IDs:
#    ```hcl
#    orchestrator_engine_id = "projects/git-with-intent/locations/us-central1/reasoningEngines/abc123"
#    triage_engine_id       = "projects/git-with-intent/locations/us-central1/reasoningEngines/def456"
#    resolver_engine_id     = "projects/git-with-intent/locations/us-central1/reasoningEngines/ghi789"
#    reviewer_engine_id     = "projects/git-with-intent/locations/us-central1/reasoningEngines/jkl012"
#    ```
#
# 4. Run `tofu apply` to update Cloud Run services with new Engine IDs
#
# ============================================================================
# Engine ID Variables (defined in variables.tf)
# ============================================================================
#
# - var.orchestrator_engine_id
# - var.triage_engine_id
# - var.resolver_engine_id
# - var.reviewer_engine_id
#
# These are passed to Cloud Run services as environment variables.
# See cloud_run.tf for usage.
#
# ============================================================================
# Future: When Provider Support is Added
# ============================================================================
#
# When the google/google-beta provider adds support for
# google_vertex_ai_reasoning_engine, this file will contain:
#
# resource "google_vertex_ai_reasoning_engine" "orchestrator" {
#   display_name = "gwi-orchestrator"
#   description  = "GWI Orchestrator Agent"
#   project      = var.project_id
#   location     = var.region
#   ...
# }
#
# Until then, use ADK CLI or gcloud for deployments.
# ============================================================================
