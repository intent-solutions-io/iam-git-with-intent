# Git With Intent - Version Constraints
# Defines required versions for OpenTofu and providers

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
