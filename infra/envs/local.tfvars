# Git With Intent - Local/Test Environment
# tofu plan -var-file="envs/local.tfvars"
# Uses the actual git-with-intent project for validation

# Project Configuration (actual project)
project_id  = "git-with-intent"
region      = "us-central1"
environment = "local"

# Application Configuration
app_name    = "git-with-intent"
app_version = "0.2.0"

# Gateway Images (placeholders - not deployed)
a2a_gateway_image    = "us-central1-docker.pkg.dev/git-with-intent/gwi/gateway:latest"
github_webhook_image = "us-central1-docker.pkg.dev/git-with-intent/gwi/github-webhook:latest"

# Phase 11: SaaS API Image
gwi_api_image = "us-central1-docker.pkg.dev/git-with-intent/gwi/api:latest"

# Gateway Scaling (minimal for testing)
gateway_max_instances = 3
gwi_api_max_instances = 3

# Firestore Configuration
enable_firestore   = true
firestore_location = "us-central1"

# GitHub Integration (not configured yet)
github_app_id            = ""
github_webhook_secret_id = "gwi-github-webhook-secret"

# SPIFFE ID
agent_spiffe_id = "spiffe://intent.solutions/agent/gwi"

# Model Configuration
triage_model           = "gemini-2.0-flash"
resolver_model         = "claude-sonnet-4-20250514"
resolver_complex_model = "claude-opus-4-20250514"
reviewer_model         = "claude-sonnet-4-20250514"

# Networking (public for testing)
allow_public_access = true

# Telemetry
enable_telemetry = true

# Labels
labels = {
  environment = "local"
  team        = "platform"
  managed-by  = "opentofu"
}
