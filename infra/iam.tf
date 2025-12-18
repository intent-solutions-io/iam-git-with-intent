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
