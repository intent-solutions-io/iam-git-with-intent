# Git With Intent - OpenTofu Variables
# The baddest MF git tool - AI-powered DevOps automation

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "git-with-intent"
}

variable "app_version" {
  description = "Application version"
  type        = string
  default     = "0.1.0"
}

# Agent Images
variable "orchestrator_image" {
  description = "Docker image for Orchestrator agent"
  type        = string
  default     = ""
}

variable "triage_image" {
  description = "Docker image for Triage agent (Gemini Flash)"
  type        = string
  default     = ""
}

variable "resolver_image" {
  description = "Docker image for Resolver agent (Claude Sonnet/Opus)"
  type        = string
  default     = ""
}

variable "reviewer_image" {
  description = "Docker image for Reviewer agent (Claude Sonnet)"
  type        = string
  default     = ""
}

# Gateway
variable "a2a_gateway_image" {
  description = "Docker image for A2A Gateway"
  type        = string
}

variable "gateway_max_instances" {
  description = "Max Cloud Run instances"
  type        = number
  default     = 10
}

# GitHub Integration
variable "github_app_id" {
  description = "GitHub App ID"
  type        = string
  default     = ""
}

variable "github_private_key_secret" {
  description = "Secret Manager ID for GitHub private key"
  type        = string
  default     = "gwi-github-private-key"
}

variable "github_webhook_secret" {
  description = "Secret Manager ID for GitHub webhook secret"
  type        = string
  default     = "gwi-github-webhook-secret"
}

variable "github_webhook_image" {
  description = "Docker image for GitHub webhook handler"
  type        = string
  default     = ""
}

variable "github_webhook_secret_id" {
  description = "Secret Manager secret ID for webhook validation"
  type        = string
  default     = "gwi-github-webhook-secret"
}

# SPIFFE
variable "agent_spiffe_id" {
  description = "SPIFFE ID base for agents"
  type        = string
  default     = "spiffe://intent.solutions/agent/gwi"
}

# URLs
variable "a2a_gateway_url" {
  description = "Public URL for A2A Gateway"
  type        = string
  default     = ""
}

variable "github_webhook_url" {
  description = "Public URL for GitHub webhook"
  type        = string
  default     = ""
}

# Models - Multi-model strategy
variable "triage_model" {
  description = "Model for Triage (fast classification)"
  type        = string
  default     = "gemini-2.0-flash"
}

variable "resolver_model" {
  description = "Model for Resolver (deep reasoning)"
  type        = string
  default     = "claude-sonnet-4-20250514"
}

variable "resolver_complex_model" {
  description = "Model for complex resolutions"
  type        = string
  default     = "claude-opus-4-20250514"
}

variable "reviewer_model" {
  description = "Model for Reviewer"
  type        = string
  default     = "claude-sonnet-4-20250514"
}

# Networking
variable "allow_public_access" {
  description = "Allow unauthenticated access"
  type        = bool
  default     = false
}

# Telemetry
variable "enable_telemetry" {
  description = "Enable Cloud Trace/Monitoring"
  type        = bool
  default     = true
}

# Labels
variable "labels" {
  description = "Resource labels"
  type        = map(string)
  default     = {}
}

# ============================================================================
# Phase 11: SaaS API and Firestore Configuration
# ============================================================================

variable "gwi_api_image" {
  description = "Docker image for GWI SaaS API"
  type        = string
  default     = ""
}

variable "gwi_api_max_instances" {
  description = "Max Cloud Run instances for API"
  type        = number
  default     = 10
}

variable "enable_firestore" {
  description = "Enable Firestore configuration"
  type        = bool
  default     = true
}

variable "firestore_location" {
  description = "Firestore database location"
  type        = string
  default     = "us-central1"
}

# ============================================================================
# Phase 16: Worker Service Configuration
# ============================================================================

variable "gwi_worker_image" {
  description = "Docker image for GWI Worker service"
  type        = string
  default     = ""
}

variable "gwi_worker_max_instances" {
  description = "Max Cloud Run instances for Worker"
  type        = number
  default     = 10
}

variable "gwi_worker_concurrency" {
  description = "Container concurrency for Worker (jobs per container)"
  type        = number
  default     = 1
}

variable "gwi_worker_topic" {
  description = "Pub/Sub topic name for worker jobs"
  type        = string
  default     = "gwi-worker-jobs"
}

variable "gwi_worker_subscription" {
  description = "Pub/Sub subscription name for worker"
  type        = string
  default     = "gwi-worker-push-sub"
}

# Phase 17: DLQ Configuration
variable "gwi_worker_max_delivery_attempts" {
  description = "Maximum delivery attempts before sending to DLQ"
  type        = number
  default     = 5
}

# ============================================================================
# Org Knowledge Hub Storage Configuration
# ============================================================================

variable "org_storage_enabled" {
  description = "Enable org-wide knowledge hub storage bucket"
  type        = bool
  default     = false
}

variable "org_storage_bucket_name" {
  description = "Name for org knowledge hub bucket"
  type        = string
  default     = "gwi-org-knowledge-hub"
}

variable "org_storage_location" {
  description = "Location for org knowledge hub bucket"
  type        = string
  default     = "US"
}

variable "org_storage_writer_service_accounts" {
  description = "Service accounts with write access to org knowledge hub"
  type        = list(string)
  default     = []
}

# ============================================================================
# Agent Engine IDs (managed outside OpenTofu via ADK CLI/gcloud)
# ============================================================================
# Note: Vertex AI Agent Engine resources are not yet supported by the
# Terraform/OpenTofu provider. These IDs are set after manual/CLI deployment.

variable "orchestrator_engine_id" {
  description = "Vertex AI Agent Engine ID for Orchestrator (set after ADK deploy)"
  type        = string
  default     = ""
}

variable "triage_engine_id" {
  description = "Vertex AI Agent Engine ID for Triage agent"
  type        = string
  default     = ""
}

variable "resolver_engine_id" {
  description = "Vertex AI Agent Engine ID for Resolver agent"
  type        = string
  default     = ""
}

variable "reviewer_engine_id" {
  description = "Vertex AI Agent Engine ID for Reviewer agent"
  type        = string
  default     = ""
}

# ============================================================================
# A8: Run Artifacts Configuration
# ============================================================================

variable "artifact_retention_days" {
  description = "Days to retain run artifacts (json, diff, md files)"
  type        = number
  default     = 90
}

variable "audit_log_retention_days" {
  description = "Days to retain audit logs (compliance requirement)"
  type        = number
  default     = 365
}

variable "artifact_signed_url_expiry_minutes" {
  description = "Signed URL expiration time in minutes"
  type        = number
  default     = 15
}

# ============================================================================
# Epic B: Multi-Source Webhook Receiver Configuration
# ============================================================================

variable "webhook_receiver_image" {
  description = "Docker image for multi-source webhook receiver"
  type        = string
  default     = ""
}

variable "webhook_rate_limit_per_minute" {
  description = "Maximum webhooks per minute per tenant per source"
  type        = number
  default     = 100
}

variable "webhook_require_signature" {
  description = "Require HMAC signature verification (always true in prod)"
  type        = bool
  default     = true
}

variable "webhook_topic_prefix" {
  description = "Prefix for Pub/Sub webhook topics"
  type        = string
  default     = "gwi"
}

# ============================================================================
# Secret Management (Optional - use Vertex AI WIF instead of API keys)
# ============================================================================

variable "enable_secret_bindings" {
  description = "Enable Secret Manager IAM bindings. Set to false to use Vertex AI via WIF instead of API keys."
  type        = bool
  default     = false
}

variable "enable_stripe" {
  description = "Enable Stripe billing integration secrets"
  type        = bool
  default     = false
}
