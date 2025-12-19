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
# Supporting Infrastructure (OpenTofu-Managed)
# ============================================================================
#
# The following resources ARE managed by OpenTofu and support Agent Engine:
#
# 1. APIs (main.tf):
#    - aiplatform.googleapis.com (Vertex AI platform)
#    - run.googleapis.com (Cloud Run)
#    - secretmanager.googleapis.com (API keys)
#
# 2. Service Accounts (iam.tf):
#    - git-with-intent-agent-{env} (Agent Engine runtime)
#
# 3. IAM Roles (iam.tf):
#    - roles/aiplatform.user (invoke Agent Engine)
#    - roles/ml.developer (Vertex AI operations)
#    - roles/logging.logWriter (Cloud Logging)
#    - roles/cloudtrace.agent (Cloud Trace)
#    - roles/secretmanager.secretAccessor (API keys)
#
# 4. Storage (storage.tf):
#    - {project-id}-adk-staging (deployment artifacts)
#    - {project-id}-adk-docs (Vertex AI Search indexing)
#
# 5. Cloud Run Gateways (cloud_run.tf):
#    - A2A Gateway (proxy to Agent Engine)
#    - GitHub Webhook (event ingestion)
#    - Worker Service (background jobs)
#
# 6. Pub/Sub (cloud_run.tf):
#    - gwi-worker-jobs (async job queue)
#    - gwi-worker-dlq (dead letter queue)
#
# 7. Monitoring (monitoring.tf):
#    - Error rate alerts
#    - Latency alerts
#    - Availability alerts
#
# ============================================================================
# Deployment Workflow
# ============================================================================
#
# STEP 1: Deploy supporting infrastructure via OpenTofu
# ------------------------------------------------------
# This creates all supporting resources (service accounts, storage, IAM, etc.)
#
# ```bash
# cd infra
# tofu init
# tofu plan -var-file=envs/dev.tfvars
# tofu apply -var-file=envs/dev.tfvars
# ```
#
# STEP 2: Deploy Agent Engine instances via ADK CLI
# --------------------------------------------------
# Deploy each agent to Vertex AI Agent Engine using the ADK CLI.
# Use the staging bucket created in STEP 1.
#
# Orchestrator Agent:
# ```bash
# cd packages/agents
# adk deploy agent_engine \
#   --project=git-with-intent \
#   --region=us-central1 \
#   --staging_bucket=gs://git-with-intent-adk-staging \
#   --service_account=git-with-intent-agent-dev@git-with-intent.iam.gserviceaccount.com \
#   --display_name=gwi-orchestrator-dev \
#   --agent=orchestrator
# ```
#
# Triage Agent (Gemini Flash):
# ```bash
# adk deploy agent_engine \
#   --project=git-with-intent \
#   --region=us-central1 \
#   --staging_bucket=gs://git-with-intent-adk-staging \
#   --service_account=git-with-intent-agent-dev@git-with-intent.iam.gserviceaccount.com \
#   --display_name=gwi-triage-dev \
#   --agent=triage
# ```
#
# Resolver Agent (Claude Sonnet/Opus):
# ```bash
# adk deploy agent_engine \
#   --project=git-with-intent \
#   --region=us-central1 \
#   --staging_bucket=gs://git-with-intent-adk-staging \
#   --service_account=git-with-intent-agent-dev@git-with-intent.iam.gserviceaccount.com \
#   --display_name=gwi-resolver-dev \
#   --agent=resolver
# ```
#
# Reviewer Agent (Claude Sonnet):
# ```bash
# adk deploy agent_engine \
#   --project=git-with-intent \
#   --region=us-central1 \
#   --staging_bucket=gs://git-with-intent-adk-staging \
#   --service_account=git-with-intent-agent-dev@git-with-intent.iam.gserviceaccount.com \
#   --display_name=gwi-reviewer-dev \
#   --agent=reviewer
# ```
#
# STEP 3: Capture Engine IDs
# ---------------------------
# Each `adk deploy` command outputs a Reasoning Engine ID.
# Format: projects/{project}/locations/{region}/reasoningEngines/{engine_id}
#
# Example output:
# ```
# Deployed Reasoning Engine: projects/git-with-intent/locations/us-central1/reasoningEngines/1234567890123456789
# ```
#
# STEP 4: Update tfvars with Engine IDs
# --------------------------------------
# Add the captured Engine IDs to your environment tfvars file:
#
# ```hcl
# # infra/envs/dev.tfvars
# orchestrator_engine_id = "projects/git-with-intent/locations/us-central1/reasoningEngines/1234567890123456789"
# triage_engine_id       = "projects/git-with-intent/locations/us-central1/reasoningEngines/2345678901234567890"
# resolver_engine_id     = "projects/git-with-intent/locations/us-central1/reasoningEngines/3456789012345678901"
# reviewer_engine_id     = "projects/git-with-intent/locations/us-central1/reasoningEngines/4567890123456789012"
# ```
#
# STEP 5: Re-apply OpenTofu to configure Cloud Run
# -------------------------------------------------
# This updates Cloud Run services with the new Engine IDs as environment variables:
#
# ```bash
# tofu apply -var-file=envs/dev.tfvars
# ```
#
# Cloud Run services will now proxy requests to the deployed Agent Engines.
#
# ============================================================================
# Manual Operations (gcloud alternative to ADK CLI)
# ============================================================================
#
# If ADK CLI is unavailable, use gcloud for Agent Engine operations:
#
# List deployed engines:
# ```bash
# gcloud ai reasoning-engines list \
#   --project=git-with-intent \
#   --region=us-central1
# ```
#
# Get engine details:
# ```bash
# gcloud ai reasoning-engines describe {ENGINE_ID} \
#   --project=git-with-intent \
#   --region=us-central1
# ```
#
# Delete an engine:
# ```bash
# gcloud ai reasoning-engines delete {ENGINE_ID} \
#   --project=git-with-intent \
#   --region=us-central1
# ```
#
# Query an engine (testing):
# ```bash
# gcloud ai reasoning-engines query {ENGINE_ID} \
#   --project=git-with-intent \
#   --region=us-central1 \
#   --input='{"message": "test"}'
# ```
#
# ============================================================================
# Engine ID Variables (defined in variables.tf)
# ============================================================================
#
# These variables are used to pass Engine IDs to Cloud Run services:
# - var.orchestrator_engine_id
# - var.triage_engine_id
# - var.resolver_engine_id
# - var.reviewer_engine_id
#
# They are injected as environment variables in cloud_run.tf:
# - ORCHESTRATOR_ENGINE_ID
# - TRIAGE_ENGINE_ID
# - RESOLVER_ENGINE_ID
# - REVIEWER_ENGINE_ID
#
# Cloud Run services use these IDs to invoke Agent Engine via REST API.
#
# ============================================================================
# Network Configuration (VPC/Networking NOT Required)
# ============================================================================
#
# Agent Engine and Cloud Run use Google-managed networking:
# - No VPC configuration needed
# - No VPC peering required
# - No Serverless VPC Access connectors needed
# - Direct invocation via Vertex AI REST API
#
# Cloud Run services authenticate via service account identity (WIF).
#
# ============================================================================
# Async Operations (Pub/Sub Integration)
# ============================================================================
#
# For long-running agent operations, the Worker service uses Pub/Sub:
#
# Architecture:
# 1. API receives request → publishes to gwi-worker-jobs topic
# 2. Worker service subscribes via push subscription
# 3. Worker invokes Agent Engine and processes results
# 4. Failed jobs go to gwi-worker-dlq (dead letter queue)
#
# Pub/Sub resources (cloud_run.tf):
# - google_pubsub_topic.gwi_worker_jobs
# - google_pubsub_topic.gwi_worker_dlq
# - google_pubsub_subscription.gwi_worker_push
# - google_pubsub_subscription.gwi_worker_dlq_sub
#
# Configuration:
# - Max delivery attempts: 5 (var.gwi_worker_max_delivery_attempts)
# - Acknowledgment deadline: 600s (10 minutes)
# - Retry policy: exponential backoff
#
# ============================================================================
# Secrets Management (Secret Manager Integration)
# ============================================================================
#
# Agent Engine requires API keys stored in Secret Manager:
#
# Required secrets:
# - gwi-anthropic-api-key (Claude models)
# - gwi-google-ai-api-key (Gemini models)
# - gwi-github-token (GitHub API)
#
# Service account permissions (iam.tf):
# - roles/secretmanager.secretAccessor
#
# Secrets are NOT managed by OpenTofu (manual creation required):
# ```bash
# echo -n "sk-ant-..." | gcloud secrets create gwi-anthropic-api-key \
#   --project=git-with-intent \
#   --replication-policy=automatic \
#   --data-file=-
#
# echo -n "..." | gcloud secrets create gwi-google-ai-api-key \
#   --project=git-with-intent \
#   --replication-policy=automatic \
#   --data-file=-
#
# echo -n "ghp_..." | gcloud secrets create gwi-github-token \
#   --project=git-with-intent \
#   --replication-policy=automatic \
#   --data-file=-
# ```
#
# ============================================================================
# CI/CD Integration (GitHub Actions)
# ============================================================================
#
# Agent Engine deployment is triggered via GitHub Actions:
#
# Workflow: .github/workflows/deploy-agents.yml
#
# 1. Authenticate via Workload Identity Federation (WIF)
# 2. Build agent Docker images (if applicable)
# 3. Deploy to Agent Engine via ADK CLI
# 4. Capture Engine IDs and update tfvars (manual or automated)
# 5. Trigger OpenTofu apply to update Cloud Run
#
# WIF Configuration (iam.tf):
# - google_iam_workload_identity_pool.github
# - google_iam_workload_identity_pool_provider.github
# - Service account: git-with-intent-ci@git-with-intent.iam.gserviceaccount.com
#
# Required GitHub Actions permissions:
# - roles/aiplatform.admin (deploy Agent Engine)
# - roles/storage.admin (access staging bucket)
# - roles/run.admin (update Cloud Run)
#
# ============================================================================
# Monitoring and Observability
# ============================================================================
#
# Agent Engine operations are monitored via:
#
# 1. Cloud Logging:
#    - Agent Engine invocation logs
#    - Cloud Run request logs
#    - Error stack traces
#
# 2. Cloud Trace:
#    - Distributed tracing across agents
#    - Latency breakdown (API → Gateway → Agent Engine)
#
# 3. Cloud Monitoring (monitoring.tf):
#    - Error rate alerts (5xx responses)
#    - Latency alerts (P95 > 5000ms)
#    - Availability alerts (service down)
#
# 4. Pub/Sub metrics:
#    - Message publish rate
#    - Dead letter queue depth
#    - Subscription backlog
#
# Dashboard: https://console.cloud.google.com/monitoring
#
# ============================================================================
# Future: When Provider Support is Added
# ============================================================================
#
# When the google/google-beta provider adds support for Agent Engine,
# this file will be updated to manage resources declaratively:
#
# resource "google_vertex_ai_reasoning_engine" "orchestrator" {
#   display_name = "gwi-orchestrator-${var.environment}"
#   description  = "GWI Orchestrator Agent"
#   project      = var.project_id
#   location     = var.region
#
#   service_account = google_service_account.agent_engine.email
#
#   # Agent configuration (TBD by provider)
#   agent_config {
#     model = "gemini-2.0-flash"
#     tools = ["github", "git"]
#   }
#
#   labels = local.common_labels
# }
#
# Until then, use ADK CLI or gcloud for Agent Engine lifecycle management.
# ============================================================================
#
# Documentation References:
# - Vertex AI Agent Engine: https://cloud.google.com/vertex-ai/docs/reasoning-engine
# - ADK (Agent Development Kit): https://cloud.google.com/vertex-ai/docs/adk
# - OpenTofu: https://opentofu.org/docs/
# - Project README: ../README.md
# - Agent Engine Context: ../archive-docs/044-DR-GUID-agent-engine-context.md
# - Compliance Checklist: ../archive-docs/045-DR-CHKL-agent-engine-compliance.md
#
# ============================================================================
