# =============================================================================
# Multi-Source Webhook Receiver Service
# =============================================================================
#
# Epic B: Data Ingestion & Connector Framework
# Task B3.4: Add webhook receiver service
#
# Cloud Run service for receiving webhooks from multiple sources:
# - GitHub, GitLab, Linear, Slack
#
# Features:
# - HMAC signature verification
# - Per-tenant rate limiting (100/min)
# - Pub/Sub publishing for async processing
# - <500ms p95 response time target
#
# =============================================================================

# =============================================================================
# Service Account
# =============================================================================

resource "google_service_account" "webhook_receiver" {
  count        = var.webhook_receiver_image != "" ? 1 : 0
  account_id   = "${var.app_name}-webhook-${var.environment}"
  display_name = "GWI Webhook Receiver (${var.environment})"
  description  = "Service account for multi-source webhook receiver"
  project      = var.project_id
}

# =============================================================================
# IAM Permissions
# =============================================================================

# Pub/Sub Publisher - publish to webhook topics
resource "google_project_iam_member" "webhook_receiver_pubsub_publisher" {
  count   = var.webhook_receiver_image != "" ? 1 : 0
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.webhook_receiver[0].email}"
}

# Logging - write structured logs
resource "google_project_iam_member" "webhook_receiver_logging" {
  count   = var.webhook_receiver_image != "" ? 1 : 0
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.webhook_receiver[0].email}"
}

# Cloud Trace - distributed tracing
resource "google_project_iam_member" "webhook_receiver_trace" {
  count   = var.webhook_receiver_image != "" ? 1 : 0
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.webhook_receiver[0].email}"
}

# =============================================================================
# Secret Access (Per-Secret IAM Bindings)
# =============================================================================

# GitHub webhook secret
resource "google_secret_manager_secret_iam_member" "webhook_receiver_github_secret" {
  count     = var.webhook_receiver_image != "" ? 1 : 0
  project   = var.project_id
  secret_id = "gwi-webhook-secret-github"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.webhook_receiver[0].email}"

  lifecycle {
    ignore_changes = [secret_id]
  }
}

# GitLab webhook secret
resource "google_secret_manager_secret_iam_member" "webhook_receiver_gitlab_secret" {
  count     = var.webhook_receiver_image != "" ? 1 : 0
  project   = var.project_id
  secret_id = "gwi-webhook-secret-gitlab"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.webhook_receiver[0].email}"

  lifecycle {
    ignore_changes = [secret_id]
  }
}

# Linear webhook secret
resource "google_secret_manager_secret_iam_member" "webhook_receiver_linear_secret" {
  count     = var.webhook_receiver_image != "" ? 1 : 0
  project   = var.project_id
  secret_id = "gwi-webhook-secret-linear"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.webhook_receiver[0].email}"

  lifecycle {
    ignore_changes = [secret_id]
  }
}

# Slack webhook secret
resource "google_secret_manager_secret_iam_member" "webhook_receiver_slack_secret" {
  count     = var.webhook_receiver_image != "" ? 1 : 0
  project   = var.project_id
  secret_id = "gwi-webhook-secret-slack"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.webhook_receiver[0].email}"

  lifecycle {
    ignore_changes = [secret_id]
  }
}

# =============================================================================
# Pub/Sub Topics for Webhook Events
# =============================================================================

# GitHub webhooks topic
resource "google_pubsub_topic" "github_webhooks" {
  count   = var.webhook_receiver_image != "" ? 1 : 0
  name    = "${var.webhook_topic_prefix}-github-webhooks"
  project = var.project_id

  message_retention_duration = "604800s" # 7 days

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "github-webhooks-topic"
      epic        = "b"
    }
  )
}

# GitLab webhooks topic
resource "google_pubsub_topic" "gitlab_webhooks" {
  count   = var.webhook_receiver_image != "" ? 1 : 0
  name    = "${var.webhook_topic_prefix}-gitlab-webhooks"
  project = var.project_id

  message_retention_duration = "604800s" # 7 days

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "gitlab-webhooks-topic"
      epic        = "b"
    }
  )
}

# Linear webhooks topic
resource "google_pubsub_topic" "linear_webhooks" {
  count   = var.webhook_receiver_image != "" ? 1 : 0
  name    = "${var.webhook_topic_prefix}-linear-webhooks"
  project = var.project_id

  message_retention_duration = "604800s" # 7 days

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "linear-webhooks-topic"
      epic        = "b"
    }
  )
}

# Slack webhooks topic
resource "google_pubsub_topic" "slack_webhooks" {
  count   = var.webhook_receiver_image != "" ? 1 : 0
  name    = "${var.webhook_topic_prefix}-slack-webhooks"
  project = var.project_id

  message_retention_duration = "604800s" # 7 days

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "slack-webhooks-topic"
      epic        = "b"
    }
  )
}

# =============================================================================
# Dead Letter Queue for Failed Webhooks
# =============================================================================

resource "google_pubsub_topic" "webhook_dlq" {
  count   = var.webhook_receiver_image != "" ? 1 : 0
  name    = "${var.webhook_topic_prefix}-webhooks-dlq"
  project = var.project_id

  message_retention_duration = "1209600s" # 14 days

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "webhooks-dlq-topic"
      epic        = "b"
    }
  )
}

# DLQ Subscription for manual investigation
resource "google_pubsub_subscription" "webhook_dlq_sub" {
  count   = var.webhook_receiver_image != "" ? 1 : 0
  name    = "${var.webhook_topic_prefix}-webhooks-dlq-sub"
  topic   = google_pubsub_topic.webhook_dlq[0].id
  project = var.project_id

  message_retention_duration = "1209600s" # 14 days

  expiration_policy {
    ttl = "" # Never expire
  }

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "webhooks-dlq-subscription"
      epic        = "b"
    }
  )
}

# =============================================================================
# Cloud Run Service
# =============================================================================

resource "google_cloud_run_service" "webhook_receiver" {
  count    = var.webhook_receiver_image != "" ? 1 : 0
  name     = "${var.app_name}-webhook-receiver-${var.environment}"
  location = var.region
  project  = var.project_id

  template {
    spec {
      service_account_name = google_service_account.webhook_receiver[0].email

      containers {
        image = var.webhook_receiver_image

        # Environment variables
        env {
          name  = "GCP_PROJECT_ID"
          value = var.project_id
        }

        env {
          name  = "DEPLOYMENT_ENV"
          value = var.environment
        }

        env {
          name  = "RATE_LIMIT_PER_MINUTE"
          value = tostring(var.webhook_rate_limit_per_minute)
        }

        env {
          name  = "REQUIRE_SIGNATURE"
          value = var.environment == "prod" ? "true" : tostring(var.webhook_require_signature)
        }

        env {
          name  = "TOPIC_PREFIX"
          value = var.webhook_topic_prefix
        }

        # Resource limits (optimized for fast webhook processing)
        resources {
          limits = {
            cpu    = local.effective_webhook_receiver_topology.cpu
            memory = local.effective_webhook_receiver_topology.memory
          }
        }

        # Liveness probe
        liveness_probe {
          http_get {
            path = "/health"
          }
          initial_delay_seconds = var.health_check_config.liveness.initial_delay_seconds
          timeout_seconds       = var.health_check_config.liveness.timeout_seconds
          period_seconds        = var.health_check_config.liveness.period_seconds
          failure_threshold     = var.health_check_config.liveness.failure_threshold
        }

        # Startup probe
        startup_probe {
          http_get {
            path = "/health/ready"
          }
          initial_delay_seconds = var.health_check_config.startup.initial_delay_seconds
          timeout_seconds       = var.health_check_config.startup.timeout_seconds
          period_seconds        = var.health_check_config.startup.period_seconds
          failure_threshold     = var.health_check_config.startup.failure_threshold
        }
      }

      # High concurrency for webhook handling
      container_concurrency = local.effective_webhook_receiver_topology.concurrency

      # Fast timeout for webhook responses
      timeout_seconds = local.effective_webhook_receiver_topology.timeout_seconds
    }

    metadata {
      annotations = merge(
        {
          "autoscaling.knative.dev/minScale"     = tostring(local.effective_webhook_receiver_topology.min_instances)
          "autoscaling.knative.dev/maxScale"     = tostring(local.effective_webhook_receiver_topology.max_instances)
          "run.googleapis.com/cpu-throttling"    = tostring(local.effective_webhook_receiver_topology.cpu_throttling)
          "run.googleapis.com/startup-cpu-boost" = tostring(local.effective_webhook_receiver_topology.startup_cpu_boost)
        },
        local.vpc_connector_annotations
      )

      labels = merge(
        var.labels,
        {
          environment = var.environment
          app         = var.app_name
          version     = replace(var.app_version, ".", "-")
          component   = "webhook-receiver"
          epic        = "b"
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
    google_service_account.webhook_receiver,
    google_project_iam_member.webhook_receiver_pubsub_publisher,
    google_pubsub_topic.github_webhooks,
    google_pubsub_topic.gitlab_webhooks,
    google_pubsub_topic.linear_webhooks,
    google_pubsub_topic.slack_webhooks,
  ]
}

# =============================================================================
# IAM Policy - Allow Public Access (webhooks need unauthenticated access)
# =============================================================================

resource "google_cloud_run_service_iam_member" "webhook_receiver_public" {
  count    = var.webhook_receiver_image != "" && var.allow_public_access ? 1 : 0
  service  = google_cloud_run_service.webhook_receiver[0].name
  location = google_cloud_run_service.webhook_receiver[0].location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# =============================================================================
# Outputs
# =============================================================================

output "webhook_receiver_url" {
  description = "Webhook Receiver Cloud Run URL"
  value       = var.webhook_receiver_image != "" ? google_cloud_run_service.webhook_receiver[0].status[0].url : "NOT_DEPLOYED"
}

output "webhook_github_topic" {
  description = "GitHub Webhooks Pub/Sub Topic"
  value       = var.webhook_receiver_image != "" ? google_pubsub_topic.github_webhooks[0].id : "NOT_DEPLOYED"
}

output "webhook_gitlab_topic" {
  description = "GitLab Webhooks Pub/Sub Topic"
  value       = var.webhook_receiver_image != "" ? google_pubsub_topic.gitlab_webhooks[0].id : "NOT_DEPLOYED"
}

output "webhook_linear_topic" {
  description = "Linear Webhooks Pub/Sub Topic"
  value       = var.webhook_receiver_image != "" ? google_pubsub_topic.linear_webhooks[0].id : "NOT_DEPLOYED"
}

output "webhook_slack_topic" {
  description = "Slack Webhooks Pub/Sub Topic"
  value       = var.webhook_receiver_image != "" ? google_pubsub_topic.slack_webhooks[0].id : "NOT_DEPLOYED"
}

output "webhook_dlq_topic" {
  description = "Webhooks Dead Letter Queue Topic"
  value       = var.webhook_receiver_image != "" ? google_pubsub_topic.webhook_dlq[0].id : "NOT_DEPLOYED"
}
