# Cloud Scheduler - Scheduled Tasks
# Manages periodic jobs for maintenance operations

# ============================================================================
# Idempotency TTL Cleanup
# ============================================================================

# Service account for Cloud Scheduler to invoke Cloud Run
resource "google_service_account" "scheduler" {
  count        = var.gwi_worker_image != "" ? 1 : 0
  account_id   = "${var.app_name}-scheduler-${var.environment}"
  display_name = "Cloud Scheduler Service Account (${var.environment})"
  project      = var.project_id
}

# Allow scheduler to invoke the worker service
resource "google_cloud_run_service_iam_member" "scheduler_invoker" {
  count    = var.gwi_worker_image != "" ? 1 : 0
  service  = google_cloud_run_service.gwi_worker[0].name
  location = google_cloud_run_service.gwi_worker[0].location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler[0].email}"
}

# Idempotency Cleanup Job - runs hourly
resource "google_cloud_scheduler_job" "idempotency_cleanup" {
  count       = var.gwi_worker_image != "" ? 1 : 0
  name        = "${var.app_name}-idempotency-cleanup-${var.environment}"
  description = "Cleanup expired idempotency records from Firestore"
  project     = var.project_id
  region      = var.region

  # Run every hour at minute 15
  schedule  = "15 * * * *"
  time_zone = "UTC"

  # Retry configuration
  retry_config {
    retry_count          = 3
    min_backoff_duration = "30s"
    max_backoff_duration = "300s"
    max_doublings        = 2
  }

  # HTTP target (Cloud Run endpoint)
  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_service.gwi_worker[0].status[0].url}/tasks/cleanup-idempotency"

    # OIDC token for authentication
    oidc_token {
      service_account_email = google_service_account.scheduler[0].email
      audience              = google_cloud_run_service.gwi_worker[0].status[0].url
    }

    # Headers
    headers = {
      "Content-Type" = "application/json"
      "User-Agent"   = "Google-Cloud-Scheduler"
    }

    # Empty body
    body = base64encode("{}")
  }

  # Only run in production or staging (optional: remove count for all envs)
  # If you want to run in dev too, this is handled by the parent count

  depends_on = [
    google_cloud_run_service.gwi_worker,
    google_cloud_run_service_iam_member.scheduler_invoker,
  ]
}

# ============================================================================
# Outputs
# ============================================================================

output "scheduler_service_account" {
  description = "Cloud Scheduler service account email"
  value       = var.gwi_worker_image != "" ? google_service_account.scheduler[0].email : "NOT_DEPLOYED"
}

output "idempotency_cleanup_job" {
  description = "Idempotency cleanup Cloud Scheduler job name"
  value       = var.gwi_worker_image != "" ? google_cloud_scheduler_job.idempotency_cleanup[0].name : "NOT_DEPLOYED"
}
