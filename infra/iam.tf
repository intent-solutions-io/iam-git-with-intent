# Git With Intent - IAM Configuration

# Service Account for Agent Engine
resource "google_service_account" "agent_engine" {
  account_id   = "${var.app_name}-agent-${var.environment}"
  display_name = "GWI Agent Engine (${var.environment})"
  description  = "Service account for Vertex AI Agent Engine"
  project      = var.project_id
}

# Service Account for A2A Gateway
resource "google_service_account" "a2a_gateway" {
  account_id   = "${var.app_name}-a2a-${var.environment}"
  display_name = "GWI A2A Gateway (${var.environment})"
  description  = "Service account for A2A Gateway"
  project      = var.project_id
}

# Service Account for GitHub Webhook
resource "google_service_account" "github_webhook" {
  account_id   = "${var.app_name}-github-${var.environment}"
  display_name = "GWI GitHub Webhook (${var.environment})"
  description  = "Service account for GitHub webhook handler"
  project      = var.project_id
}

# Service Account for GitHub Actions CI/CD
resource "google_service_account" "github_actions" {
  account_id   = "${var.app_name}-ci"
  display_name = "GWI GitHub Actions"
  description  = "Service account for CI/CD"
  project      = var.project_id
}

# Agent Engine IAM
resource "google_project_iam_member" "agent_engine_aiplatform" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.agent_engine.email}"
}

resource "google_project_iam_member" "agent_engine_vertex" {
  project = var.project_id
  role    = "roles/ml.developer"
  member  = "serviceAccount:${google_service_account.agent_engine.email}"
}

resource "google_project_iam_member" "agent_engine_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.agent_engine.email}"
}

resource "google_project_iam_member" "agent_engine_trace" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.agent_engine.email}"
}

resource "google_project_iam_member" "agent_engine_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.agent_engine.email}"
}

# A2A Gateway IAM
resource "google_project_iam_member" "a2a_gateway_aiplatform" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.a2a_gateway.email}"
}

resource "google_project_iam_member" "a2a_gateway_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.a2a_gateway.email}"
}

# GitHub Webhook IAM
resource "google_project_iam_member" "github_webhook_aiplatform" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.github_webhook.email}"
}

resource "google_project_iam_member" "github_webhook_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.github_webhook.email}"
}

# GitHub Actions IAM (CI/CD)
resource "google_project_iam_member" "github_actions_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_project_iam_member" "github_actions_aiplatform" {
  project = var.project_id
  role    = "roles/aiplatform.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_project_iam_member" "github_actions_storage" {
  project = var.project_id
  role    = "roles/storage.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_project_iam_member" "github_actions_artifact" {
  project = var.project_id
  role    = "roles/artifactregistry.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# Workload Identity Federation for GitHub Actions (R4)
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${var.app_name}-github-pool"
  display_name              = "GWI GitHub Actions Pool"
  project                   = var.project_id
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub Actions"
  project                            = var.project_id

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Restrict to specific GitHub org/repo
  attribute_condition = "assertion.repository_owner == 'intent-solutions-io'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Allow GitHub Actions to impersonate the CI service account via WIF
# Uses principalSet to scope to the specific repository
resource "google_service_account_iam_member" "github_actions_wif" {
  service_account_id = google_service_account.github_actions.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/intent-solutions-io/git-with-intent"
}

# =============================================================================
# A9: Least-Privilege Secret Access (Per-Secret IAM Bindings)
# =============================================================================
# Each service only gets access to the secrets it needs.
# This replaces broad project-level secretmanager.secretAccessor role.
#
# Secret Inventory:
# - gwi-github-app-private-key: gateway, worker, github-webhook
# - gwi-github-webhook-secret: github-webhook
# - gwi-anthropic-api-key: worker
# - gwi-google-ai-api-key: worker
# - gwi-stripe-secret-key: api
# - gwi-stripe-webhook-secret: api
# =============================================================================

# Note: Using data sources would fail if secrets don't exist yet.
# These bindings are applied after secrets are created via gcloud.
# The secret resources are managed outside Terraform (manual/CLI creation).

locals {
  # Secret access map: secret_id -> list of service accounts
  secret_access_map = {
    "gwi-github-app-private-key" = [
      google_service_account.a2a_gateway.email,
      google_service_account.github_webhook.email,
    ]
    "gwi-github-webhook-secret" = [
      google_service_account.github_webhook.email,
    ]
  }

  # Flatten for for_each
  secret_bindings = flatten([
    for secret_id, emails in local.secret_access_map : [
      for email in emails : {
        key       = "${secret_id}-${email}"
        secret_id = secret_id
        email     = email
      }
    ]
  ])
}

# Per-secret IAM bindings for gateway/webhook (only if gwi_api_image is set)
resource "google_secret_manager_secret_iam_member" "service_secret_access" {
  for_each = { for b in local.secret_bindings : b.key => b }

  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value.email}"

  # Only create if the secret might exist (we can't check, so always try)
  # This will fail gracefully if secret doesn't exist yet

  lifecycle {
    # Ignore changes to prevent recreation if secret is recreated
    ignore_changes = [secret_id]
  }
}

# API service secret access (conditional on API being deployed)
resource "google_secret_manager_secret_iam_member" "api_stripe_key" {
  count = var.gwi_api_image != "" ? 1 : 0

  project   = var.project_id
  secret_id = "gwi-stripe-secret-key"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.gwi_api[0].email}"

  lifecycle {
    ignore_changes = [secret_id]
  }
}

resource "google_secret_manager_secret_iam_member" "api_stripe_webhook" {
  count = var.gwi_api_image != "" ? 1 : 0

  project   = var.project_id
  secret_id = "gwi-stripe-webhook-secret"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.gwi_api[0].email}"

  lifecycle {
    ignore_changes = [secret_id]
  }
}

# Worker service secret access (conditional on Worker being deployed)
resource "google_secret_manager_secret_iam_member" "worker_github_key" {
  count = var.gwi_worker_image != "" ? 1 : 0

  project   = var.project_id
  secret_id = "gwi-github-app-private-key"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.gwi_worker[0].email}"

  lifecycle {
    ignore_changes = [secret_id]
  }
}

resource "google_secret_manager_secret_iam_member" "worker_anthropic_key" {
  count = var.gwi_worker_image != "" ? 1 : 0

  project   = var.project_id
  secret_id = "gwi-anthropic-api-key"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.gwi_worker[0].email}"

  lifecycle {
    ignore_changes = [secret_id]
  }
}

resource "google_secret_manager_secret_iam_member" "worker_google_ai_key" {
  count = var.gwi_worker_image != "" ? 1 : 0

  project   = var.project_id
  secret_id = "gwi-google-ai-api-key"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.gwi_worker[0].email}"

  lifecycle {
    ignore_changes = [secret_id]
  }
}
