# Git With Intent - Production Environment
# tofu plan -var-file="envs/prod.tfvars"

# Project Configuration
project_id  = "git-with-intent"
region      = "us-central1"
environment = "prod"

# Application Configuration
app_name    = "git-with-intent"
app_version = "0.1.0"

# Gateway Images (set by CI)
a2a_gateway_image    = "us-central1-docker.pkg.dev/git-with-intent/gwi-docker/gateway:latest"
github_webhook_image = "us-central1-docker.pkg.dev/git-with-intent/gwi-docker/github-webhook:latest"

# Phase 11: SaaS API Image
gwi_api_image = "us-central1-docker.pkg.dev/git-with-intent/gwi-docker/api:latest"

# Gateway Scaling (higher for production)
gateway_max_instances = 20
gwi_api_max_instances = 10

# Firestore Configuration
enable_firestore   = true
firestore_location = "us-central1"

# GitHub Integration
github_app_id            = ""
github_webhook_secret_id = "gwi-github-webhook-secret"

# SPIFFE ID
agent_spiffe_id = "spiffe://intent.solutions/agent/gwi"

# Model Configuration
triage_model           = "gemini-2.0-flash"
resolver_model         = "claude-sonnet-4-20250514"
resolver_complex_model = "claude-opus-4-20250514"
reviewer_model         = "claude-sonnet-4-20250514"

# Networking
# Public access required for:
# - GitHub webhooks (GitHub can't authenticate to Cloud Run IAM)
# - A2A Gateway (external agents need to call it)
# - API health endpoints (actual ops protected by Firebase Auth)
allow_public_access = true

# Telemetry
enable_telemetry = true

# Labels
labels = {
  environment = "prod"
  team        = "platform"
  managed-by  = "opentofu"
  critical    = "true"
}
