# Provider Configuration - OpenTofu
# R4 Compliance: Supports Workload Identity Federation for CI-only deployments
# Migrated from Terraform to OpenTofu (open-source, Terraform-compatible)

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.14.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.14.0"
    }
  }

  # Backend configuration for state management
  # Using GCS bucket for shared state (created via bootstrap)
  backend "gcs" {
    bucket = "git-with-intent-tofu-state"
    prefix = "opentofu/state"
  }
}

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
