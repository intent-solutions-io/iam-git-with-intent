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

# Worker Service Image (for scheduler and background jobs)
gwi_worker_image = "us-central1-docker.pkg.dev/git-with-intent/gwi-docker/worker:latest"

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

# =============================================================================
# Epic H1: Cloud Run Service Topology
# =============================================================================

# VPC Networking (enabled for production security)
enable_vpc_connector        = true
vpc_connector_cidr          = "10.8.0.0/28"
vpc_connector_machine_type  = "e2-micro"
vpc_connector_min_instances = 2
vpc_connector_max_instances = 3
vpc_egress_setting          = "private-ranges-only"

# Service Topology (production-grade)
service_topology = {
  api = {
    cpu               = "1000m"
    memory            = "512Mi"
    concurrency       = 100
    timeout_seconds   = 60
    min_instances     = 1 # Always-on for production
    max_instances     = 20
    cpu_throttling    = true
    startup_cpu_boost = true
  }
  gateway = {
    cpu               = "1000m"
    memory            = "512Mi"
    concurrency       = 80
    timeout_seconds   = 300
    min_instances     = 1 # Always-on for production
    max_instances     = 20
    cpu_throttling    = true
    startup_cpu_boost = true
  }
  webhook = {
    cpu               = "1000m"
    memory            = "512Mi"
    concurrency       = 80
    timeout_seconds   = 300
    min_instances     = 1 # Always-on for production
    max_instances     = 20
    cpu_throttling    = true
    startup_cpu_boost = true
  }
  worker = {
    cpu               = "2000m"
    memory            = "1Gi"
    concurrency       = 1
    timeout_seconds   = 600
    min_instances     = 1 # Always-on for production
    max_instances     = 20
    cpu_throttling    = false # Keep CPU active for background jobs
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
