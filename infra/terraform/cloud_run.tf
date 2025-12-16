# Cloud Run Gateways
# R3: Cloud Run as gateway only (proxy to Agent Engine via REST)

# A2A Gateway Service
resource "google_cloud_run_service" "a2a_gateway" {
  name     = "${var.app_name}-a2a-gateway-${var.environment}"
  location = var.region
  project  = var.project_id

  template {
    spec {
      service_account_name = google_service_account.a2a_gateway.email

      containers {
        image = var.a2a_gateway_image

        # Environment variables
        env {
          name  = "PROJECT_ID"
          value = var.project_id
        }

        env {
          name  = "LOCATION"
          value = var.region
        }

        env {
          name  = "ORCHESTRATOR_ENGINE_ID"
          value = google_vertex_ai_reasoning_engine.orchestrator.id
        }

        env {
          name  = "TRIAGE_ENGINE_ID"
          value = google_vertex_ai_reasoning_engine.triage.id
        }

        env {
          name  = "RESOLVER_ENGINE_ID"
          value = google_vertex_ai_reasoning_engine.resolver.id
        }

        env {
          name  = "REVIEWER_ENGINE_ID"
          value = google_vertex_ai_reasoning_engine.reviewer.id
        }

        env {
          name  = "APP_NAME"
          value = var.app_name
        }

        env {
          name  = "APP_VERSION"
          value = var.app_version
        }

        env {
          name  = "AGENT_SPIFFE_ID"
          value = var.agent_spiffe_id
        }

        env {
          name  = "DEPLOYMENT_ENV"
          value = var.environment
        }

        env {
          name  = "PORT"
          value = "8080"
        }

        # Resource limits
        resources {
          limits = {
            cpu    = "1000m"
            memory = "512Mi"
          }
        }

        # Health check
        liveness_probe {
          http_get {
            path = "/health"
          }
          initial_delay_seconds = 10
          timeout_seconds       = 3
          period_seconds        = 10
          failure_threshold     = 3
        }
      }

      # Scaling
      container_concurrency = 80

      # Timeout
      timeout_seconds = 300
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale"  = "0"
        "autoscaling.knative.dev/maxScale"  = tostring(var.gateway_max_instances)
        "run.googleapis.com/cpu-throttling" = "true"
      }

      labels = merge(
        var.labels,
        {
          environment = var.environment
          app         = var.app_name
          version     = replace(var.app_version, ".", "-")
          component   = "a2a-gateway"
        }
      )
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true

  depends_on = [
    google_service_account.a2a_gateway,
    google_project_iam_member.a2a_gateway_aiplatform,
    google_vertex_ai_reasoning_engine.orchestrator,
    google_vertex_ai_reasoning_engine.triage,
    google_vertex_ai_reasoning_engine.resolver,
    google_vertex_ai_reasoning_engine.reviewer,
  ]
}

# A2A Gateway IAM Policy (allow unauthenticated access)
resource "google_cloud_run_service_iam_member" "a2a_gateway_public" {
  count = var.allow_public_access ? 1 : 0

  service  = google_cloud_run_service.a2a_gateway.name
  location = google_cloud_run_service.a2a_gateway.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# GitHub Webhook Gateway for PR events
resource "google_cloud_run_service" "github_webhook" {
  name     = "${var.app_name}-github-webhook-${var.environment}"
  location = var.region
  project  = var.project_id

  template {
    spec {
      service_account_name = google_service_account.github_webhook.email

      containers {
        image = var.github_webhook_image

        env {
          name  = "PROJECT_ID"
          value = var.project_id
        }

        env {
          name  = "ORCHESTRATOR_ENGINE_ID"
          value = google_vertex_ai_reasoning_engine.orchestrator.id
        }

        env {
          name = "GITHUB_WEBHOOK_SECRET"
          value_from {
            secret_key_ref {
              name = var.github_webhook_secret_id
              key  = "latest"
            }
          }
        }

        env {
          name  = "DEPLOYMENT_ENV"
          value = var.environment
        }

        env {
          name  = "PORT"
          value = "8080"
        }

        resources {
          limits = {
            cpu    = "1000m"
            memory = "512Mi"
          }
        }

        liveness_probe {
          http_get {
            path = "/health"
          }
          initial_delay_seconds = 10
          timeout_seconds       = 3
          period_seconds        = 10
          failure_threshold     = 3
        }
      }

      container_concurrency = 80
      timeout_seconds       = 300
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale"  = "0"
        "autoscaling.knative.dev/maxScale"  = tostring(var.gateway_max_instances)
        "run.googleapis.com/cpu-throttling" = "true"
      }

      labels = merge(
        var.labels,
        {
          environment = var.environment
          app         = var.app_name
          version     = replace(var.app_version, ".", "-")
          component   = "github-webhook"
        }
      )
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true

  depends_on = [
    google_service_account.github_webhook,
    google_project_iam_member.github_webhook_aiplatform,
    google_vertex_ai_reasoning_engine.orchestrator,
  ]
}

# GitHub Webhook IAM Policy (allow unauthenticated - webhook validation done in code)
resource "google_cloud_run_service_iam_member" "github_webhook_public" {
  count = var.allow_public_access ? 1 : 0

  service  = google_cloud_run_service.github_webhook.name
  location = google_cloud_run_service.github_webhook.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Note: data "google_project" "project" is defined in main.tf

# ============================================================================
# Phase 11: GWI SaaS API Service
# ============================================================================

# GWI API Service Account
resource "google_service_account" "gwi_api" {
  count        = var.gwi_api_image != "" ? 1 : 0
  account_id   = "${var.app_name}-api-${var.environment}"
  display_name = "GWI API Service Account (${var.environment})"
  project      = var.project_id
}

# GWI API - Firestore access
resource "google_project_iam_member" "gwi_api_firestore" {
  count   = var.gwi_api_image != "" ? 1 : 0
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.gwi_api[0].email}"
}

# GWI API Cloud Run Service
resource "google_cloud_run_service" "gwi_api" {
  count    = var.gwi_api_image != "" ? 1 : 0
  name     = "${var.app_name}-api-${var.environment}"
  location = var.region
  project  = var.project_id

  template {
    spec {
      service_account_name = google_service_account.gwi_api[0].email

      containers {
        image = var.gwi_api_image

        # Environment variables
        env {
          name  = "GCP_PROJECT_ID"
          value = var.project_id
        }

        env {
          name  = "GWI_STORE_BACKEND"
          value = "firestore"
        }

        env {
          name  = "DEPLOYMENT_ENV"
          value = var.environment
        }

        env {
          name  = "APP_NAME"
          value = "${var.app_name}-api"
        }

        env {
          name  = "APP_VERSION"
          value = var.app_version
        }

        env {
          name  = "PORT"
          value = "8080"
        }

        # Resource limits
        resources {
          limits = {
            cpu    = "1000m"
            memory = "512Mi"
          }
        }

        # Health check
        liveness_probe {
          http_get {
            path = "/health"
          }
          initial_delay_seconds = 10
          timeout_seconds       = 3
          period_seconds        = 10
          failure_threshold     = 3
        }
      }

      # Scaling
      container_concurrency = 100

      # Timeout
      timeout_seconds = 60
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale"  = var.environment == "prod" ? "1" : "0"
        "autoscaling.knative.dev/maxScale"  = tostring(var.gwi_api_max_instances)
        "run.googleapis.com/cpu-throttling" = "true"
      }

      labels = merge(
        var.labels,
        {
          environment = var.environment
          app         = var.app_name
          version     = replace(var.app_version, ".", "-")
          component   = "api"
          phase       = "phase-11"
        }
      )
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true

  depends_on = [
    google_service_account.gwi_api,
    google_project_iam_member.gwi_api_firestore,
  ]
}

# GWI API IAM Policy (configurable public access)
resource "google_cloud_run_service_iam_member" "gwi_api_public" {
  count    = var.gwi_api_image != "" && var.allow_public_access ? 1 : 0
  service  = google_cloud_run_service.gwi_api[0].name
  location = google_cloud_run_service.gwi_api[0].location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Output API URL
output "gwi_api_url" {
  description = "GWI API Cloud Run URL"
  value       = var.gwi_api_image != "" ? google_cloud_run_service.gwi_api[0].status[0].url : "NOT_DEPLOYED"
}
