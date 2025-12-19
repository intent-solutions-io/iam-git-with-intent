# Provider Configuration - OpenTofu
# R4 Compliance: Supports Workload Identity Federation for CI-only deployments
# Migrated from Terraform to OpenTofu (open-source, Terraform-compatible)
#
# Note: Version constraints and backend configuration are in versions.tf

provider "google" {
  project = var.project_id
  region  = var.region

  # Workload Identity Federation (for GitHub Actions CI)
  # This allows CI to authenticate without service account keys (R4)
  # Configure in GitHub Actions workflow with:
  #   - uses: google-github-actions/auth@v2
  #     with:
  #       workload_identity_provider: 'projects/.../locations/global/workloadIdentityPools/.../providers/...'
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}
