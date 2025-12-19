# Git With Intent - Artifact Registry
# Docker image repository for application containers

# Artifact Registry Repository for Docker images
resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "${var.app_name}-docker-${var.environment}"
  description   = "Docker repository for Git With Intent containers (${var.environment})"
  format        = "DOCKER"
  project       = var.project_id

  # Cleanup policy: Delete untagged images after 30 days
  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "2592000s" # 30 days
    }
  }

  # Cleanup policy: Keep only last 10 tagged images per name
  cleanup_policies {
    id     = "keep-recent-tagged"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }

  labels = merge(
    local.common_labels,
    {
      component = "artifact-registry"
      purpose   = "docker-images"
    }
  )

  depends_on = [
    google_project_service.required_apis
  ]
}

# Grant Cloud Build read/write access
# Note: Cloud Build service account email uses project number
# If needed, create manually or use: {PROJECT_NUMBER}@cloudbuild.gserviceaccount.com
# Commenting out for initial deployment - add after project number is known
# resource "google_artifact_registry_repository_iam_member" "cloud_build_writer" {
#   project    = var.project_id
#   location   = google_artifact_registry_repository.docker.location
#   repository = google_artifact_registry_repository.docker.name
#   role       = "roles/artifactregistry.writer"
#   member     = "serviceAccount:${data.google_project.project.number}@cloudbuild.gserviceaccount.com"
# }

# Grant GitHub Actions service account read/write access
resource "google_artifact_registry_repository_iam_member" "github_actions_writer" {
  project    = var.project_id
  location   = google_artifact_registry_repository.docker.location
  repository = google_artifact_registry_repository.docker.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.github_actions.email}"
}

# Grant Cloud Run service accounts read access
resource "google_artifact_registry_repository_iam_member" "cloud_run_reader" {
  for_each = toset([
    google_service_account.agent_engine.email,
    google_service_account.a2a_gateway.email,
    google_service_account.github_webhook.email,
  ])

  project    = var.project_id
  location   = google_artifact_registry_repository.docker.location
  repository = google_artifact_registry_repository.docker.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${each.value}"
}

# Output for CI/CD workflows
output "artifact_registry_repository" {
  description = "Artifact Registry repository name"
  value       = google_artifact_registry_repository.docker.name
}

output "artifact_registry_url" {
  description = "Artifact Registry repository URL"
  value       = "${google_artifact_registry_repository.docker.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}
