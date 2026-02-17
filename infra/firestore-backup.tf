# Firestore Backup Infrastructure
#
# Daily automated Firestore exports to GCS for disaster recovery.
# See: 000-docs/112-DR-RUNB-disaster-recovery-runbook.md
#
# RPO Target: 24 hours (daily exports)
# Retention: 90 days

# ============================================================================
# GCS Bucket for Firestore Exports
# ============================================================================

resource "google_storage_bucket" "firestore_backups" {
  name          = "${var.project_id}-firestore-backups"
  location      = var.region
  project       = var.project_id
  force_destroy = false # Protect backup data

  # Security: Block public access
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # Lifecycle: Delete backups older than 90 days
  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "Delete"
    }
  }

  # Versioning: Track backup history
  versioning {
    enabled = true
  }

  # Soft delete: 7-day protection against accidental deletion
  soft_delete_policy {
    retention_duration_seconds = 604800 # 7 days
  }

  # Labels for resource management
  labels = merge(
    var.labels,
    {
      component = "firestore-backups"
      purpose   = "disaster-recovery"
    }
  )
}

# ============================================================================
# Service Account for Firestore Export
# ============================================================================

resource "google_service_account" "firestore_backup" {
  account_id   = "${var.app_name}-fs-backup-${var.environment}"
  display_name = "Firestore Backup Service Account (${var.environment})"
  project      = var.project_id
}

# Grant Firestore export/import permissions
resource "google_project_iam_member" "firestore_backup_export" {
  project = var.project_id
  role    = "roles/datastore.importExportAdmin"
  member  = "serviceAccount:${google_service_account.firestore_backup.email}"
}

# Grant write access to the backup bucket
resource "google_storage_bucket_iam_member" "firestore_backup_writer" {
  bucket = google_storage_bucket.firestore_backups.name
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.firestore_backup.email}"
}

# ============================================================================
# Cloud Scheduler Job for Daily Firestore Export
# ============================================================================

resource "google_cloud_scheduler_job" "firestore_backup" {
  name        = "${var.app_name}-firestore-backup-${var.environment}"
  description = "Daily Firestore export to GCS for disaster recovery"
  project     = var.project_id
  region      = var.region

  # Run daily at 02:00 UTC
  schedule  = "0 2 * * *"
  time_zone = "UTC"

  # Retry configuration
  retry_config {
    retry_count          = 3
    min_backoff_duration = "60s"
    max_backoff_duration = "600s"
    max_doublings        = 2
  }

  # HTTP target: Firestore Admin API export endpoint
  http_target {
    http_method = "POST"
    uri         = "https://firestore.googleapis.com/v1/projects/${var.project_id}/databases/(default)/exportDocuments"

    body = base64encode(jsonencode({
      outputUriPrefix = "gs://${google_storage_bucket.firestore_backups.name}/scheduled"
    }))

    headers = {
      "Content-Type" = "application/json"
    }

    # Use the backup service account's OIDC token
    oauth_token {
      service_account_email = google_service_account.firestore_backup.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }
}

# ============================================================================
# Outputs
# ============================================================================

output "firestore_backup_bucket_url" {
  description = "GCS bucket URL for Firestore backups"
  value       = "gs://${google_storage_bucket.firestore_backups.name}"
}

output "firestore_backup_bucket_name" {
  description = "GCS bucket name for Firestore backups"
  value       = google_storage_bucket.firestore_backups.name
}

output "firestore_backup_service_account" {
  description = "Service account email for Firestore backup operations"
  value       = google_service_account.firestore_backup.email
}

output "firestore_backup_scheduler_job" {
  description = "Cloud Scheduler job name for daily Firestore backup"
  value       = google_cloud_scheduler_job.firestore_backup.name
}
