# Git With Intent - Dev Environment
# terraform apply -var-file="envs/dev.tfvars"

# Project Configuration
project_id  = "git-with-intent-dev"
region      = "us-central1"
environment = "dev"

# Application Configuration
app_name    = "git-with-intent"
app_version = "0.1.0"

# Gateway Images (set by CI)
a2a_gateway_image    = "us-central1-docker.pkg.dev/git-with-intent-dev/gwi/gateway:latest"
github_webhook_image = "us-central1-docker.pkg.dev/git-with-intent-dev/gwi/github-webhook:latest"

# Gateway Scaling
gateway_max_instances = 5

# GitHub Integration
github_app_id            = ""
github_webhook_secret_id = "gwi-github-webhook-secret"

# SPIFFE ID
agent_spiffe_id = "spiffe://intent.solutions/agent/gwi"

# Model Configuration
triage_model          = "gemini-2.0-flash"
resolver_model        = "claude-sonnet-4-20250514"
resolver_complex_model = "claude-opus-4-20250514"
reviewer_model        = "claude-sonnet-4-20250514"

# Networking
allow_public_access = true

# Telemetry
enable_telemetry = true

# Labels
labels = {
  environment = "dev"
  team        = "platform"
  managed-by  = "terraform"
}
