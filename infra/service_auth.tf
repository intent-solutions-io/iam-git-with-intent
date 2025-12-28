# =============================================================================
# Epic H1: Service-to-Service Authentication
# =============================================================================
#
# H1.s4: Cloud Run service-to-service authentication
#
# Architecture:
# - Each service has its own service account (least privilege)
# - Services authenticate via IAM for internal calls
# - Only webhook has public endpoint (GitHub cannot auth to IAM)
# - Token-based auth between services using OIDC identity tokens
#
# Service Communication Matrix:
# +-------------+--------+---------+--------+--------+
# | From\To     | API    | Gateway | Webhook| Worker |
# +-------------+--------+---------+--------+--------+
# | API         |   -    |    X    |        |   X    |
# | Gateway     |   X    |    -    |        |   X    |
# | Webhook     |   X    |    X    |    -   |   X    |
# | Worker      |   X    |    X    |        |   -    |
# | External    |   X    |    X    |   X*   |        |
# +-------------+--------+---------+--------+--------+
# * Webhook is public for GitHub callbacks
#
# =============================================================================

# =============================================================================
# Service-to-Service IAM Bindings
# =============================================================================
#
# These bindings allow services to invoke each other via Cloud Run IAM.
# Each service gets explicit permission to invoke only the services it needs.

# -----------------------------------------------------------------------------
# API Service Invocation Permissions
# -----------------------------------------------------------------------------

# Gateway can invoke API (for orchestration requests)
resource "google_cloud_run_service_iam_member" "api_invoked_by_gateway" {
  count = var.gwi_api_image != "" ? 1 : 0

  project  = var.project_id
  service  = google_cloud_run_service.gwi_api[0].name
  location = google_cloud_run_service.gwi_api[0].location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.a2a_gateway.email}"
}

# Webhook can invoke API (for webhook event processing)
resource "google_cloud_run_service_iam_member" "api_invoked_by_webhook" {
  count = var.gwi_api_image != "" && var.github_webhook_image != "" ? 1 : 0

  project  = var.project_id
  service  = google_cloud_run_service.gwi_api[0].name
  location = google_cloud_run_service.gwi_api[0].location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.github_webhook.email}"
}

# Worker can invoke API (for run status updates)
resource "google_cloud_run_service_iam_member" "api_invoked_by_worker" {
  count = var.gwi_api_image != "" && var.gwi_worker_image != "" ? 1 : 0

  project  = var.project_id
  service  = google_cloud_run_service.gwi_api[0].name
  location = google_cloud_run_service.gwi_api[0].location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.gwi_worker[0].email}"
}

# -----------------------------------------------------------------------------
# Gateway Service Invocation Permissions
# -----------------------------------------------------------------------------

# API can invoke Gateway (for agent orchestration)
resource "google_cloud_run_service_iam_member" "gateway_invoked_by_api" {
  count = var.gwi_api_image != "" ? 1 : 0

  project  = var.project_id
  service  = google_cloud_run_service.a2a_gateway.name
  location = google_cloud_run_service.a2a_gateway.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.gwi_api[0].email}"
}

# Webhook can invoke Gateway (for triggering agent workflows)
resource "google_cloud_run_service_iam_member" "gateway_invoked_by_webhook" {
  count = var.github_webhook_image != "" ? 1 : 0

  project  = var.project_id
  service  = google_cloud_run_service.a2a_gateway.name
  location = google_cloud_run_service.a2a_gateway.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.github_webhook.email}"
}

# Worker can invoke Gateway (for agent task execution)
resource "google_cloud_run_service_iam_member" "gateway_invoked_by_worker" {
  count = var.gwi_worker_image != "" ? 1 : 0

  project  = var.project_id
  service  = google_cloud_run_service.a2a_gateway.name
  location = google_cloud_run_service.a2a_gateway.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.gwi_worker[0].email}"
}

# -----------------------------------------------------------------------------
# Worker Service Invocation Permissions
# -----------------------------------------------------------------------------

# API can invoke Worker (for job enqueueing - direct HTTP fallback)
resource "google_cloud_run_service_iam_member" "worker_invoked_by_api" {
  count = var.gwi_api_image != "" && var.gwi_worker_image != "" ? 1 : 0

  project  = var.project_id
  service  = google_cloud_run_service.gwi_worker[0].name
  location = google_cloud_run_service.gwi_worker[0].location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.gwi_api[0].email}"
}

# Gateway can invoke Worker (for async job dispatch)
resource "google_cloud_run_service_iam_member" "worker_invoked_by_gateway" {
  count = var.gwi_worker_image != "" ? 1 : 0

  project  = var.project_id
  service  = google_cloud_run_service.gwi_worker[0].name
  location = google_cloud_run_service.gwi_worker[0].location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.a2a_gateway.email}"
}

# Webhook can invoke Worker (for async event processing)
resource "google_cloud_run_service_iam_member" "worker_invoked_by_webhook" {
  count = var.gwi_worker_image != "" && var.github_webhook_image != "" ? 1 : 0

  project  = var.project_id
  service  = google_cloud_run_service.gwi_worker[0].name
  location = google_cloud_run_service.gwi_worker[0].location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.github_webhook.email}"
}

# =============================================================================
# Service Account Token Creator (for OIDC tokens)
# =============================================================================
#
# Services need to create identity tokens to authenticate to other services.
# This is required for Cloud Run service-to-service authentication.

# API can create tokens for itself
resource "google_service_account_iam_member" "api_token_creator" {
  count = var.gwi_api_image != "" ? 1 : 0

  service_account_id = google_service_account.gwi_api[0].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.gwi_api[0].email}"
}

# Gateway can create tokens for itself
resource "google_service_account_iam_member" "gateway_token_creator" {
  service_account_id = google_service_account.a2a_gateway.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.a2a_gateway.email}"
}

# Webhook can create tokens for itself
resource "google_service_account_iam_member" "webhook_token_creator" {
  count = var.github_webhook_image != "" ? 1 : 0

  service_account_id = google_service_account.github_webhook.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.github_webhook.email}"
}

# Worker can create tokens for itself
resource "google_service_account_iam_member" "worker_token_creator" {
  count = var.gwi_worker_image != "" ? 1 : 0

  service_account_id = google_service_account.gwi_worker[0].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.gwi_worker[0].email}"
}

# =============================================================================
# Disable Public Access (except webhook)
# =============================================================================
#
# By default, Cloud Run services require IAM authentication.
# We only enable public access for the webhook (GitHub cannot authenticate).
# This is handled in cloud_run.tf via the allow_public_access variable and
# service-specific IAM bindings.

# =============================================================================
# Outputs
# =============================================================================

output "service_auth_bindings" {
  description = "Service-to-service authentication bindings"
  value = {
    api_invocable_by = compact([
      var.gwi_api_image != "" ? "gateway" : "",
      var.gwi_api_image != "" && var.github_webhook_image != "" ? "webhook" : "",
      var.gwi_api_image != "" && var.gwi_worker_image != "" ? "worker" : "",
    ])
    gateway_invocable_by = compact([
      var.gwi_api_image != "" ? "api" : "",
      var.github_webhook_image != "" ? "webhook" : "",
      var.gwi_worker_image != "" ? "worker" : "",
    ])
    worker_invocable_by = compact([
      var.gwi_api_image != "" && var.gwi_worker_image != "" ? "api" : "",
      var.gwi_worker_image != "" ? "gateway" : "",
      var.gwi_worker_image != "" && var.github_webhook_image != "" ? "webhook" : "",
    ])
  }
}

# =============================================================================
# Documentation: How to make authenticated service-to-service calls
# =============================================================================
#
# From Cloud Run service code (Node.js example):
#
# ```javascript
# const { GoogleAuth } = require('google-auth-library');
#
# async function callService(targetUrl: string) {
#   const auth = new GoogleAuth();
#
#   // Get an ID token for the target service
#   const client = await auth.getIdTokenClient(targetUrl);
#
#   // Make authenticated request
#   const response = await client.request({
#     url: targetUrl,
#     method: 'POST',
#     data: { /* payload */ }
#   });
#
#   return response.data;
# }
# ```
#
# The service account running the calling service must have
# roles/run.invoker on the target service.
# =============================================================================
