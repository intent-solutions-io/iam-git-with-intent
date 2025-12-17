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

# ============================================================================
# Phase 16: GWI Worker Service
# ============================================================================

# GWI Worker Service Account
resource "google_service_account" "gwi_worker" {
  count        = var.gwi_worker_image != "" ? 1 : 0
  account_id   = "${var.app_name}-worker-${var.environment}"
  display_name = "GWI Worker Service Account (${var.environment})"
  project      = var.project_id
}

# GWI Worker - Firestore access (for locking, idempotency, checkpoints)
resource "google_project_iam_member" "gwi_worker_firestore" {
  count   = var.gwi_worker_image != "" ? 1 : 0
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.gwi_worker[0].email}"
}

# GWI Worker - Pub/Sub Subscriber
resource "google_project_iam_member" "gwi_worker_pubsub_subscriber" {
  count   = var.gwi_worker_image != "" ? 1 : 0
  project = var.project_id
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${google_service_account.gwi_worker[0].email}"
}

# GWI Worker - Pub/Sub Publisher (for re-queueing)
resource "google_project_iam_member" "gwi_worker_pubsub_publisher" {
  count   = var.gwi_worker_image != "" ? 1 : 0
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.gwi_worker[0].email}"
}

# GWI Worker Cloud Run Service
resource "google_cloud_run_service" "gwi_worker" {
  count    = var.gwi_worker_image != "" ? 1 : 0
  name     = "${var.app_name}-worker-${var.environment}"
  location = var.region
  project  = var.project_id

  template {
    spec {
      service_account_name = google_service_account.gwi_worker[0].email

      containers {
        image = var.gwi_worker_image

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
          name  = "PUBSUB_SUBSCRIPTION"
          value = var.gwi_worker_subscription
        }

        env {
          name  = "PUBSUB_TOPIC"
          value = var.gwi_worker_topic
        }

        env {
          name  = "WORKER_PULL_MODE"
          value = "false" # Use push mode for Cloud Run
        }

        env {
          name  = "WORKER_MAX_CONCURRENT"
          value = tostring(var.gwi_worker_concurrency)
        }

        env {
          name  = "WORKER_JOB_TIMEOUT_MS"
          value = "300000" # 5 minutes
        }

        env {
          name  = "WORKER_LOCK_TTL_MS"
          value = "60000" # 1 minute
        }

        env {
          name  = "DEPLOYMENT_ENV"
          value = var.environment
        }

        env {
          name  = "APP_NAME"
          value = "${var.app_name}-worker"
        }

        env {
          name  = "APP_VERSION"
          value = var.app_version
        }

        env {
          name  = "PORT"
          value = "8080"
        }

        # Resource limits (workers need more resources)
        resources {
          limits = {
            cpu    = "2000m"
            memory = "1Gi"
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

        # Readiness probe
        readiness_probe {
          http_get {
            path = "/ready"
          }
          initial_delay_seconds = 5
          timeout_seconds       = 3
          period_seconds        = 5
          failure_threshold     = 3
        }
      }

      # Workers process one job at a time per container
      container_concurrency = var.gwi_worker_concurrency

      # Longer timeout for job processing
      timeout_seconds = 600 # 10 minutes
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale"  = var.environment == "prod" ? "1" : "0"
        "autoscaling.knative.dev/maxScale"  = tostring(var.gwi_worker_max_instances)
        "run.googleapis.com/cpu-throttling" = "false" # Keep CPU for background work
      }

      labels = merge(
        var.labels,
        {
          environment = var.environment
          app         = var.app_name
          version     = replace(var.app_version, ".", "-")
          component   = "worker"
          phase       = "phase-16"
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
    google_service_account.gwi_worker,
    google_project_iam_member.gwi_worker_firestore,
    google_project_iam_member.gwi_worker_pubsub_subscriber,
  ]
}

# GWI Worker - Allow Pub/Sub to invoke the service
resource "google_cloud_run_service_iam_member" "gwi_worker_pubsub_invoker" {
  count    = var.gwi_worker_image != "" ? 1 : 0
  service  = google_cloud_run_service.gwi_worker[0].name
  location = google_cloud_run_service.gwi_worker[0].location
  role     = "roles/run.invoker"
  member   = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# Pub/Sub Topic for worker jobs
resource "google_pubsub_topic" "gwi_worker_jobs" {
  count   = var.gwi_worker_image != "" ? 1 : 0
  name    = var.gwi_worker_topic
  project = var.project_id

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "worker-topic"
      phase       = "phase-16"
    }
  )
}

# Phase 17: Dead Letter Queue Topic for failed jobs
resource "google_pubsub_topic" "gwi_worker_dlq" {
  count   = var.gwi_worker_image != "" ? 1 : 0
  name    = "${var.gwi_worker_topic}-dlq"
  project = var.project_id

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "worker-dlq-topic"
      phase       = "phase-17"
    }
  )
}

# Phase 17: DLQ Subscription for monitoring failed jobs
resource "google_pubsub_subscription" "gwi_worker_dlq_sub" {
  count   = var.gwi_worker_image != "" ? 1 : 0
  name    = "${var.gwi_worker_topic}-dlq-sub"
  topic   = google_pubsub_topic.gwi_worker_dlq[0].id
  project = var.project_id

  # Keep failed messages for 14 days for investigation
  message_retention_duration = "1209600s"  # 14 days

  # No expiration - keep subscription alive
  expiration_policy {
    ttl = ""
  }

  # Pull mode for DLQ - manual investigation
  # No push_config = pull subscription

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "worker-dlq-subscription"
      phase       = "phase-17"
    }
  )

  depends_on = [google_pubsub_topic.gwi_worker_dlq]
}

# Pub/Sub Push Subscription to Cloud Run
resource "google_pubsub_subscription" "gwi_worker_push" {
  count   = var.gwi_worker_image != "" ? 1 : 0
  name    = var.gwi_worker_subscription
  topic   = google_pubsub_topic.gwi_worker_jobs[0].id
  project = var.project_id

  # Push configuration
  push_config {
    push_endpoint = "${google_cloud_run_service.gwi_worker[0].status[0].url}/push"

    oidc_token {
      service_account_email = google_service_account.gwi_worker[0].email
    }

    attributes = {
      x-goog-version = "v1"
    }
  }

  # Retry policy
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  # Acknowledgment deadline
  ack_deadline_seconds = 600 # 10 minutes to match Cloud Run timeout

  # Message retention
  message_retention_duration = "604800s" # 7 days

  # Enable message ordering (optional, per-key)
  enable_message_ordering = false

  # Phase 17: Dead Letter Queue configuration
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.gwi_worker_dlq[0].id
    max_delivery_attempts = var.gwi_worker_max_delivery_attempts
  }

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "worker-subscription"
      phase       = "phase-17"
    }
  )

  depends_on = [
    google_cloud_run_service.gwi_worker,
    google_cloud_run_service_iam_member.gwi_worker_pubsub_invoker,
    google_pubsub_topic.gwi_worker_dlq,
  ]
}

# Output Worker URL
output "gwi_worker_url" {
  description = "GWI Worker Cloud Run URL"
  value       = var.gwi_worker_image != "" ? google_cloud_run_service.gwi_worker[0].status[0].url : "NOT_DEPLOYED"
}

# Output Worker Topic
output "gwi_worker_topic" {
  description = "GWI Worker Pub/Sub Topic"
  value       = var.gwi_worker_image != "" ? google_pubsub_topic.gwi_worker_jobs[0].id : "NOT_DEPLOYED"
}

# Phase 17: Output DLQ Topic
output "gwi_worker_dlq_topic" {
  description = "GWI Worker Dead Letter Queue Topic"
  value       = var.gwi_worker_image != "" ? google_pubsub_topic.gwi_worker_dlq[0].id : "NOT_DEPLOYED"
}
