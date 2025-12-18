# Git With Intent - Main Terraform Configuration
# The baddest MF git tool for managing issues, PRs, merges
# Minimal human in the loop - AI agents handle it all
#
# Architecture:
# - Vertex AI Agent Engine for agent runtime
# - A2A Gateway for agent-to-agent protocol
# - GitHub Webhook for PR/Issue events
# - Cloud Trace/Monitoring for telemetry
#
# Note: Terraform and provider blocks are in provider.tf

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "aiplatform.googleapis.com",           # Vertex AI Agent Engine
    "run.googleapis.com",                  # Cloud Run
    "cloudbuild.googleapis.com",           # Cloud Build
    "secretmanager.googleapis.com",        # Secrets
    "cloudtrace.googleapis.com",           # Tracing
    "monitoring.googleapis.com",           # Monitoring
    "logging.googleapis.com",              # Logging
    "iam.googleapis.com",                  # IAM
    "cloudresourcemanager.googleapis.com", # Resource Manager
    "artifactregistry.googleapis.com",     # Artifact Registry
  ])

  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
}

# Locals
locals {
  resource_prefix = "${var.app_name}-${var.environment}"

  common_labels = merge(var.labels, {
    app         = var.app_name
    environment = var.environment
    version     = replace(var.app_version, ".", "-")
    managed_by  = "terraform"
  })

  # Agent SPIFFE IDs
  orchestrator_spiffe = "${var.agent_spiffe_id}/orchestrator"
  triage_spiffe       = "${var.agent_spiffe_id}/triage"
  resolver_spiffe     = "${var.agent_spiffe_id}/resolver"
  reviewer_spiffe     = "${var.agent_spiffe_id}/reviewer"
}

# Data sources
data "google_project" "project" {
  project_id = var.project_id
}
