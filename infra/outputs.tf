# OpenTofu Outputs - Git With Intent
# Values available after deployment
# Note: Service-specific outputs are in their respective .tf files (cloud_run.tf, storage.tf)

# Configuration Outputs
output "environment" {
  description = "Deployment environment"
  value       = var.environment
}

output "project_id" {
  description = "GCP project ID"
  value       = var.project_id
}

output "app_version" {
  description = "Application version"
  value       = var.app_version
}

output "spiffe_id" {
  description = "Agent SPIFFE ID"
  value       = var.agent_spiffe_id
}

# Service Account Outputs
output "agent_engine_service_account" {
  description = "Agent Engine service account email"
  value       = google_service_account.agent_engine.email
}

output "github_actions_service_account" {
  description = "GitHub Actions service account email (for CI/CD)"
  value       = google_service_account.github_actions.email
}

# ============================================================================
# Workload Identity Federation Outputs (for GitHub Actions)
# ============================================================================
# Add these values to GitHub repository settings → Secrets and variables → Variables:
#   WIF_PROVIDER: <wif_provider output>
#   WIF_SERVICE_ACCOUNT: <github_actions_service_account output>

output "wif_provider" {
  description = "Workload Identity Provider resource name (for GitHub Actions WIF_PROVIDER variable)"
  value       = "projects/${data.google_project.project.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github.workload_identity_pool_id}/providers/${google_iam_workload_identity_pool_provider.github.workload_identity_pool_provider_id}"
}

output "wif_pool" {
  description = "Workload Identity Pool resource name"
  value       = google_iam_workload_identity_pool.github.name
}
