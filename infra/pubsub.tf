# =============================================================================
# Pub/Sub Configuration
# =============================================================================
#
# B4: Standardize Pub/Sub Queue and DLQ Semantics
#
# This file defines the core Pub/Sub topics and subscriptions for the
# gwi worker system with proper:
# - Retry policies with exponential backoff
# - Dead letter queues for failed messages
# - Message ordering for run-scoped operations
# - Acknowledgement deadline configuration
#
# Design Principles:
# - Transient failures → retry with exponential backoff
# - Permanent failures → route to DLQ after max attempts
# - Poison messages → quarantine in DLQ for investigation
# - All subscriptions have matching DLQ configuration
#
# =============================================================================

# =============================================================================
# Worker Topics
# =============================================================================

# Main worker job topic
resource "google_pubsub_topic" "worker_jobs" {
  name    = "${var.app_name}-worker-jobs-${var.environment}"
  project = var.project_id

  # Enable message ordering for run-scoped operations
  message_storage_policy {
    allowed_persistence_regions = [var.region]
  }

  message_retention_duration = "604800s" # 7 days

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "worker-jobs-topic"
      epic        = "b4"
    }
  )
}

# Worker jobs dead letter topic
resource "google_pubsub_topic" "worker_jobs_dlq" {
  name    = "${var.app_name}-worker-jobs-dlq-${var.environment}"
  project = var.project_id

  message_retention_duration = "1209600s" # 14 days (longer for investigation)

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "worker-jobs-dlq-topic"
      epic        = "b4"
    }
  )
}

# =============================================================================
# Worker Subscriptions with Retry and DLQ Policy
# =============================================================================

# Main worker subscription
resource "google_pubsub_subscription" "worker_jobs" {
  name    = "${var.app_name}-worker-jobs-sub-${var.environment}"
  topic   = google_pubsub_topic.worker_jobs.id
  project = var.project_id

  # Acknowledgement deadline (time for handler to process)
  ack_deadline_seconds = 60

  # Message retention for unacked messages
  message_retention_duration = "604800s" # 7 days

  # Retry policy with exponential backoff
  retry_policy {
    minimum_backoff = "10s"  # Start at 10 seconds
    maximum_backoff = "600s" # Cap at 10 minutes
  }

  # Dead letter policy - route to DLQ after 5 failed attempts
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.worker_jobs_dlq.id
    max_delivery_attempts = 5
  }

  # Never expire the subscription
  expiration_policy {
    ttl = "" # Never expire
  }

  # Enable message ordering for run-scoped operations
  enable_message_ordering = true

  # Enable exactly-once delivery (requires compatible client)
  enable_exactly_once_delivery = false # Set to true when clients support it

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "worker-jobs-subscription"
      epic        = "b4"
    }
  )
}

# DLQ subscription for manual investigation and replay
resource "google_pubsub_subscription" "worker_jobs_dlq" {
  name    = "${var.app_name}-worker-jobs-dlq-sub-${var.environment}"
  topic   = google_pubsub_topic.worker_jobs_dlq.id
  project = var.project_id

  # Longer ack deadline for manual processing
  ack_deadline_seconds = 600 # 10 minutes

  # Extended retention for investigation
  message_retention_duration = "1209600s" # 14 days

  # No retry policy - DLQ messages are manually processed
  # No dead letter policy - DLQ is the final destination

  # Never expire
  expiration_policy {
    ttl = "" # Never expire
  }

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "worker-jobs-dlq-subscription"
      epic        = "b4"
    }
  )
}

# =============================================================================
# Run Orchestration Topics (High Priority)
# =============================================================================

# Run lifecycle events (start, pause, resume, complete, fail)
resource "google_pubsub_topic" "run_lifecycle" {
  name    = "${var.app_name}-run-lifecycle-${var.environment}"
  project = var.project_id

  message_retention_duration = "604800s" # 7 days

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "run-lifecycle-topic"
      epic        = "b4"
    }
  )
}

# Run lifecycle DLQ
resource "google_pubsub_topic" "run_lifecycle_dlq" {
  name    = "${var.app_name}-run-lifecycle-dlq-${var.environment}"
  project = var.project_id

  message_retention_duration = "1209600s" # 14 days

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "run-lifecycle-dlq-topic"
      epic        = "b4"
    }
  )
}

# Run lifecycle subscription
resource "google_pubsub_subscription" "run_lifecycle" {
  name    = "${var.app_name}-run-lifecycle-sub-${var.environment}"
  topic   = google_pubsub_topic.run_lifecycle.id
  project = var.project_id

  ack_deadline_seconds       = 60
  message_retention_duration = "604800s"

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "300s" # 5 minutes - faster for lifecycle events
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.run_lifecycle_dlq.id
    max_delivery_attempts = 5
  }

  expiration_policy {
    ttl = ""
  }

  enable_message_ordering = true

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "run-lifecycle-subscription"
      epic        = "b4"
    }
  )
}

# Run lifecycle DLQ subscription
resource "google_pubsub_subscription" "run_lifecycle_dlq" {
  name    = "${var.app_name}-run-lifecycle-dlq-sub-${var.environment}"
  topic   = google_pubsub_topic.run_lifecycle_dlq.id
  project = var.project_id

  ack_deadline_seconds       = 600
  message_retention_duration = "1209600s"

  expiration_policy {
    ttl = ""
  }

  labels = merge(
    var.labels,
    {
      environment = var.environment
      app         = var.app_name
      component   = "run-lifecycle-dlq-subscription"
      epic        = "b4"
    }
  )
}

# =============================================================================
# IAM - Grant Pub/Sub Subscriber Permission to Write to DLQ
# =============================================================================

# Allow Pub/Sub service to forward messages to worker jobs DLQ
resource "google_pubsub_topic_iam_member" "worker_jobs_dlq_publisher" {
  project = var.project_id
  topic   = google_pubsub_topic.worker_jobs_dlq.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# Allow Pub/Sub service to forward messages to run lifecycle DLQ
resource "google_pubsub_topic_iam_member" "run_lifecycle_dlq_publisher" {
  project = var.project_id
  topic   = google_pubsub_topic.run_lifecycle_dlq.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# =============================================================================
# Data Sources
# =============================================================================

data "google_project" "current" {
  project_id = var.project_id
}

# =============================================================================
# Outputs
# =============================================================================

output "worker_jobs_topic" {
  description = "Worker Jobs Pub/Sub Topic"
  value       = google_pubsub_topic.worker_jobs.id
}

output "worker_jobs_subscription" {
  description = "Worker Jobs Pub/Sub Subscription"
  value       = google_pubsub_subscription.worker_jobs.id
}

output "worker_jobs_dlq_topic" {
  description = "Worker Jobs Dead Letter Queue Topic"
  value       = google_pubsub_topic.worker_jobs_dlq.id
}

output "worker_jobs_dlq_subscription" {
  description = "Worker Jobs Dead Letter Queue Subscription"
  value       = google_pubsub_subscription.worker_jobs_dlq.id
}

output "run_lifecycle_topic" {
  description = "Run Lifecycle Events Topic"
  value       = google_pubsub_topic.run_lifecycle.id
}

output "run_lifecycle_subscription" {
  description = "Run Lifecycle Events Subscription"
  value       = google_pubsub_subscription.run_lifecycle.id
}

output "run_lifecycle_dlq_topic" {
  description = "Run Lifecycle Dead Letter Queue Topic"
  value       = google_pubsub_topic.run_lifecycle_dlq.id
}
