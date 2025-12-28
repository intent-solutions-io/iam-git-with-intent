# Git With Intent - Dev Environment
# tofu plan -var-file="envs/dev.tfvars"

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
triage_model           = "gemini-2.0-flash"
resolver_model         = "claude-sonnet-4-20250514"
resolver_complex_model = "claude-opus-4-20250514"
reviewer_model         = "claude-sonnet-4-20250514"

# Networking
allow_public_access = true

# Telemetry
enable_telemetry = true

# Labels
labels = {
  environment = "dev"
  team        = "platform"
  managed-by  = "opentofu"
}

# =============================================================================
# Epic H1: Cloud Run Service Topology
# =============================================================================

# VPC Networking (disabled for dev to save costs)
enable_vpc_connector = false

# Service Topology (cost-optimized for dev)
service_topology = {
  api = {
    cpu               = "1000m"
    memory            = "512Mi"
    concurrency       = 100
    timeout_seconds   = 60
    min_instances     = 0
    max_instances     = 5
    cpu_throttling    = true
    startup_cpu_boost = true
  }
  gateway = {
    cpu               = "1000m"
    memory            = "512Mi"
    concurrency       = 80
    timeout_seconds   = 300
    min_instances     = 0
    max_instances     = 5
    cpu_throttling    = true
    startup_cpu_boost = true
  }
  webhook = {
    cpu               = "1000m"
    memory            = "512Mi"
    concurrency       = 80
    timeout_seconds   = 300
    min_instances     = 0
    max_instances     = 5
    cpu_throttling    = true
    startup_cpu_boost = true
  }
  worker = {
    cpu               = "2000m"
    memory            = "1Gi"
    concurrency       = 1
    timeout_seconds   = 600
    min_instances     = 0
    max_instances     = 5
    cpu_throttling    = false
    startup_cpu_boost = true
  }
}

# Health Check Configuration
health_check_config = {
  liveness = {
    path                  = "/health"
    initial_delay_seconds = 5
    timeout_seconds       = 3
    period_seconds        = 10
    failure_threshold     = 3
  }
  startup = {
    path                  = "/health/ready"
    initial_delay_seconds = 0
    timeout_seconds       = 3
    period_seconds        = 5
    failure_threshold     = 10
  }
}
