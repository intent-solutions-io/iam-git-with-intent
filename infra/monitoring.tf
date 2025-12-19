# Phase 11: Monitoring and Alerting Configuration
# Phase 13 (B13): Observability and Budget Baseline
#
# Cloud Monitoring alerting policies for:
# - Error rate spikes (5xx responses)
# - High latency
# - Service unavailability
# - Uptime checks (HTTP health)
# - Log-based metrics for error tracking
# - Budget alerts for cost control

# ============================================================================
# Alert Variables
# ============================================================================

variable "alert_notification_channels" {
  description = "List of notification channel IDs for alerts (in addition to email)"
  type        = list(string)
  default     = []
}

variable "enable_alerts" {
  description = "Enable alerting policies"
  type        = bool
  default     = true
}

variable "error_rate_threshold" {
  description = "Error rate threshold for alerts (percentage)"
  type        = number
  default     = 5
}

variable "latency_threshold_ms" {
  description = "P95 latency threshold for alerts (milliseconds)"
  type        = number
  default     = 5000
}

variable "alert_email" {
  description = "Email address for alert notifications"
  type        = string
  default     = ""
}

variable "uptime_check_period" {
  description = "Uptime check period in seconds (60, 300, 600, or 900)"
  type        = number
  default     = 300
}

variable "uptime_check_timeout" {
  description = "Uptime check timeout in seconds"
  type        = number
  default     = 10
}

# ============================================================================
# Notification Channels
# ============================================================================

# Email Notification Channel
resource "google_monitoring_notification_channel" "email" {
  count        = var.alert_email != "" ? 1 : 0
  display_name = "GWI Alert Email (${var.environment})"
  project      = var.project_id
  type         = "email"

  labels = {
    email_address = var.alert_email
  }

  user_labels = {
    environment = var.environment
    app         = var.app_name
    phase       = "bead-13"
  }
}

# Build combined notification channels list
locals {
  all_notification_channels = concat(
    var.alert_email != "" ? [google_monitoring_notification_channel.email[0].id] : [],
    var.alert_notification_channels
  )
}

# ============================================================================
# Alert Policies
# ============================================================================

# High Error Rate Alert - GWI API
resource "google_monitoring_alert_policy" "gwi_api_error_rate" {
  count        = var.enable_alerts && var.gwi_api_image != "" ? 1 : 0
  display_name = "GWI API High Error Rate (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run 5xx Error Rate > ${var.error_rate_threshold}%"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "${var.app_name}-api-${var.environment}"
        AND metric.type = "run.googleapis.com/request_count"
        AND metric.labels.response_code_class = "5xx"
      EOT

      comparison      = "COMPARISON_GT"
      threshold_value = var.error_rate_threshold
      duration        = "60s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels

  user_labels = {
    component   = "api"
    environment = var.environment
    severity    = "critical"
    phase       = "phase-11"
  }

  documentation {
    content   = <<-EOT
      ## GWI API High Error Rate Alert

      The GWI API service is experiencing elevated 5xx error rates.

      ### Investigation Steps:
      1. Check Cloud Run logs for error details
      2. Verify Firestore connectivity
      3. Check for any recent deployments
      4. Review request patterns for anomalies

      ### Runbook:
      - Dashboard: https://console.cloud.google.com/run/detail/${var.region}/${var.app_name}-api-${var.environment}
      - Logs: https://console.cloud.google.com/logs/query?project=${var.project_id}
    EOT
    mime_type = "text/markdown"
  }
}

# High Latency Alert - GWI API
resource "google_monitoring_alert_policy" "gwi_api_latency" {
  count        = var.enable_alerts && var.gwi_api_image != "" ? 1 : 0
  display_name = "GWI API High Latency (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run P95 Latency > ${var.latency_threshold_ms}ms"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "${var.app_name}-api-${var.environment}"
        AND metric.type = "run.googleapis.com/request_latencies"
      EOT

      comparison      = "COMPARISON_GT"
      threshold_value = var.latency_threshold_ms
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels

  user_labels = {
    component   = "api"
    environment = var.environment
    severity    = "warning"
    phase       = "phase-11"
  }

  documentation {
    content   = <<-EOT
      ## GWI API High Latency Alert

      The GWI API service is experiencing elevated response times.

      ### Investigation Steps:
      1. Check Cloud Run instance scaling
      2. Verify Firestore query performance
      3. Check for database connection issues
      4. Review concurrent request load

      ### Runbook:
      - Dashboard: https://console.cloud.google.com/run/detail/${var.region}/${var.app_name}-api-${var.environment}
      - Metrics: https://console.cloud.google.com/monitoring/dashboards
    EOT
    mime_type = "text/markdown"
  }
}

# Service Unavailable Alert - GWI API
resource "google_monitoring_alert_policy" "gwi_api_unavailable" {
  count        = var.enable_alerts && var.gwi_api_image != "" ? 1 : 0
  display_name = "GWI API Service Unavailable (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run Service Not Responding"

    condition_absent {
      filter = <<-EOT
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "${var.app_name}-api-${var.environment}"
        AND metric.type = "run.googleapis.com/request_count"
      EOT

      duration = "300s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels

  user_labels = {
    component   = "api"
    environment = var.environment
    severity    = "critical"
    phase       = "phase-11"
  }

  documentation {
    content   = <<-EOT
      ## GWI API Service Unavailable

      The GWI API service has not received any requests for 5 minutes.
      This could indicate the service is down or unreachable.

      ### Investigation Steps:
      1. Check Cloud Run service status
      2. Verify load balancer health
      3. Check for deployment issues
      4. Verify network connectivity

      ### Immediate Actions:
      - Check service: gcloud run services describe ${var.app_name}-api-${var.environment} --region=${var.region}
      - View logs: gcloud logging read 'resource.type="cloud_run_revision"'
    EOT
    mime_type = "text/markdown"
  }
}

# High Error Rate Alert - Gateway
resource "google_monitoring_alert_policy" "gateway_error_rate" {
  count        = var.enable_alerts ? 1 : 0
  display_name = "GWI Gateway High Error Rate (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Gateway 5xx Error Rate > ${var.error_rate_threshold}%"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "${var.app_name}-a2a-gateway-${var.environment}"
        AND metric.type = "run.googleapis.com/request_count"
        AND metric.labels.response_code_class = "5xx"
      EOT

      comparison      = "COMPARISON_GT"
      threshold_value = var.error_rate_threshold
      duration        = "60s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels

  user_labels = {
    component   = "gateway"
    environment = var.environment
    severity    = "critical"
    phase       = "phase-11"
  }
}

# Webhook Handler Error Alert
resource "google_monitoring_alert_policy" "webhook_error_rate" {
  count        = var.enable_alerts && var.github_webhook_image != "" ? 1 : 0
  display_name = "GitHub Webhook High Error Rate (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Webhook 5xx Error Rate > ${var.error_rate_threshold}%"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "${var.app_name}-github-webhook-${var.environment}"
        AND metric.type = "run.googleapis.com/request_count"
        AND metric.labels.response_code_class = "5xx"
      EOT

      comparison      = "COMPARISON_GT"
      threshold_value = var.error_rate_threshold
      duration        = "60s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels

  user_labels = {
    component   = "github-webhook"
    environment = var.environment
    severity    = "critical"
    phase       = "phase-11"
  }
}

# ============================================================================
# Uptime Checks (B13)
# ============================================================================

# A2A Gateway Uptime Check
resource "google_monitoring_uptime_check_config" "gateway_uptime" {
  count        = var.enable_alerts ? 1 : 0
  display_name = "GWI Gateway Health Check (${var.environment})"
  project      = var.project_id
  timeout      = "${var.uptime_check_timeout}s"
  period       = "${var.uptime_check_period}s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(google_cloud_run_service.a2a_gateway.status[0].url, "https://", "")
    }
  }

  content_matchers {
    content = "ok"
    matcher = "CONTAINS_STRING"
  }

  checker_type = "STATIC_IP_CHECKERS"
}

# GitHub Webhook Uptime Check
resource "google_monitoring_uptime_check_config" "webhook_uptime" {
  count        = var.enable_alerts && var.github_webhook_image != "" ? 1 : 0
  display_name = "GWI Webhook Health Check (${var.environment})"
  project      = var.project_id
  timeout      = "${var.uptime_check_timeout}s"
  period       = "${var.uptime_check_period}s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(google_cloud_run_service.github_webhook.status[0].url, "https://", "")
    }
  }

  content_matchers {
    content = "ok"
    matcher = "CONTAINS_STRING"
  }

  checker_type = "STATIC_IP_CHECKERS"
}

# GWI API Uptime Check
resource "google_monitoring_uptime_check_config" "api_uptime" {
  count        = var.enable_alerts && var.gwi_api_image != "" ? 1 : 0
  display_name = "GWI API Health Check (${var.environment})"
  project      = var.project_id
  timeout      = "${var.uptime_check_timeout}s"
  period       = "${var.uptime_check_period}s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(google_cloud_run_service.gwi_api[0].status[0].url, "https://", "")
    }
  }

  content_matchers {
    content = "ok"
    matcher = "CONTAINS_STRING"
  }

  checker_type = "STATIC_IP_CHECKERS"
}

# GWI Worker Uptime Check
resource "google_monitoring_uptime_check_config" "worker_uptime" {
  count        = var.enable_alerts && var.gwi_worker_image != "" ? 1 : 0
  display_name = "GWI Worker Health Check (${var.environment})"
  project      = var.project_id
  timeout      = "${var.uptime_check_timeout}s"
  period       = "${var.uptime_check_period}s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(google_cloud_run_service.gwi_worker[0].status[0].url, "https://", "")
    }
  }

  content_matchers {
    content = "ok"
    matcher = "CONTAINS_STRING"
  }

  checker_type = "STATIC_IP_CHECKERS"
}

# Uptime Check Alert Policy - Gateway
resource "google_monitoring_alert_policy" "gateway_uptime_alert" {
  count        = var.enable_alerts ? 1 : 0
  display_name = "GWI Gateway Uptime Failure (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failing"

    condition_threshold {
      filter = <<-EOT
        resource.type = "uptime_url"
        AND metric.type = "monitoring.googleapis.com/uptime_check/check_passed"
        AND metric.labels.check_id = "${google_monitoring_uptime_check_config.gateway_uptime[0].uptime_check_id}"
      EOT

      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.project_id"]
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels

  user_labels = {
    component   = "gateway"
    environment = var.environment
    severity    = "critical"
    phase       = "bead-13"
  }

  documentation {
    content   = <<-EOT
      ## GWI Gateway Uptime Failure

      The A2A Gateway health check is failing from multiple regions.

      ### Investigation Steps:
      1. Check Cloud Run service status
      2. Verify the /health endpoint is responding
      3. Check for recent deployments
      4. Review Cloud Run logs for errors

      ### Quick Commands:
      ```bash
      gcloud run services describe ${var.app_name}-a2a-gateway-${var.environment} --region=${var.region}
      gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="${var.app_name}-a2a-gateway-${var.environment}"' --limit=50
      ```
    EOT
    mime_type = "text/markdown"
  }
}

# Uptime Check Alert Policy - API
resource "google_monitoring_alert_policy" "api_uptime_alert" {
  count        = var.enable_alerts && var.gwi_api_image != "" ? 1 : 0
  display_name = "GWI API Uptime Failure (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failing"

    condition_threshold {
      filter = <<-EOT
        resource.type = "uptime_url"
        AND metric.type = "monitoring.googleapis.com/uptime_check/check_passed"
        AND metric.labels.check_id = "${google_monitoring_uptime_check_config.api_uptime[0].uptime_check_id}"
      EOT

      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.project_id"]
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels

  user_labels = {
    component   = "api"
    environment = var.environment
    severity    = "critical"
    phase       = "bead-13"
  }

  documentation {
    content   = <<-EOT
      ## GWI API Uptime Failure

      The GWI API health check is failing from multiple regions.

      ### Investigation Steps:
      1. Check Cloud Run service status
      2. Verify the /health endpoint is responding
      3. Check Firestore connectivity
      4. Review Cloud Run logs for errors

      ### Quick Commands:
      ```bash
      gcloud run services describe ${var.app_name}-api-${var.environment} --region=${var.region}
      gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="${var.app_name}-api-${var.environment}"' --limit=50
      ```
    EOT
    mime_type = "text/markdown"
  }
}

# ============================================================================
# Log-Based Metrics (B13)
# ============================================================================

# Log-based metric for critical errors
resource "google_logging_metric" "critical_errors" {
  count       = var.enable_alerts ? 1 : 0
  name        = "gwi-critical-errors-${var.environment}"
  project     = var.project_id
  description = "Count of critical/error severity logs from GWI services"

  filter = <<-EOT
    resource.type = "cloud_run_revision"
    AND resource.labels.service_name =~ "^${var.app_name}-.*-${var.environment}$"
    AND (severity >= ERROR OR jsonPayload.level = "error" OR jsonPayload.level = "fatal")
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "service_name"
      value_type  = "STRING"
      description = "Cloud Run service name"
    }
  }

  label_extractors = {
    "service_name" = "EXTRACT(resource.labels.service_name)"
  }
}

# Log-based metric for authentication failures
resource "google_logging_metric" "auth_failures" {
  count       = var.enable_alerts ? 1 : 0
  name        = "gwi-auth-failures-${var.environment}"
  project     = var.project_id
  description = "Count of authentication/authorization failures"

  filter = <<-EOT
    resource.type = "cloud_run_revision"
    AND resource.labels.service_name =~ "^${var.app_name}-.*-${var.environment}$"
    AND (
      jsonPayload.message =~ "unauthorized|authentication failed|invalid token|forbidden"
      OR textPayload =~ "401|403|unauthorized|forbidden"
    )
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

# Log-based metric for AI/LLM errors
resource "google_logging_metric" "ai_errors" {
  count       = var.enable_alerts ? 1 : 0
  name        = "gwi-ai-errors-${var.environment}"
  project     = var.project_id
  description = "Count of AI/LLM API errors (Anthropic, Vertex AI)"

  filter = <<-EOT
    resource.type = "cloud_run_revision"
    AND resource.labels.service_name =~ "^${var.app_name}-.*-${var.environment}$"
    AND (
      jsonPayload.message =~ "anthropic|vertex|gemini|claude|rate.limit|quota"
      OR textPayload =~ "API error|rate limit|quota exceeded"
    )
    AND severity >= WARNING
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

# Alert on high critical error rate
resource "google_monitoring_alert_policy" "critical_error_rate" {
  count        = var.enable_alerts ? 1 : 0
  display_name = "GWI Critical Error Rate High (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Critical errors > 10/min"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_run_revision"
        AND metric.type = "logging.googleapis.com/user/gwi-critical-errors-${var.environment}"
      EOT

      comparison      = "COMPARISON_GT"
      threshold_value = 10
      duration        = "60s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels

  user_labels = {
    component   = "all"
    environment = var.environment
    severity    = "critical"
    phase       = "bead-13"
  }

  documentation {
    content   = <<-EOT
      ## High Critical Error Rate

      GWI services are logging critical/error level messages at an elevated rate.

      ### Investigation Steps:
      1. Check Cloud Run logs for error details
      2. Look for patterns in the error messages
      3. Check for external service failures (GitHub, Anthropic, Vertex AI)
      4. Review recent deployments

      ### Quick Commands:
      ```bash
      gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' --limit=100 --format=json
      ```
    EOT
    mime_type = "text/markdown"
  }

  depends_on = [google_logging_metric.critical_errors]
}

# ============================================================================
# Budget Alerts (B13)
# ============================================================================
#
# Budget Thresholds:
# - $50/month: Warning threshold (50% of $100 budget)
# - $80/month: Elevated warning (80% of budget)
# - $100/month: Critical threshold (budget exceeded)
# - $120/month: Overspend alert (120% of budget)
#
# To configure:
# 1. Set billing_account_id to your GCP billing account ID
# 2. Set enable_budget_alerts = true
# 3. Optionally set alert_email for notifications

variable "monthly_budget_amount" {
  description = "Monthly budget amount in USD (default $100, warning at $50)"
  type        = number
  default     = 100
}

variable "budget_warning_threshold" {
  description = "Warning threshold as percentage of budget (0.5 = $50 for $100 budget)"
  type        = number
  default     = 0.5
}

variable "enable_budget_alerts" {
  description = "Enable budget alert notifications (requires billing_account_id)"
  type        = bool
  default     = false
}

variable "billing_account_id" {
  description = "Billing account ID (format: XXXXXX-XXXXXX-XXXXXX)"
  type        = string
  default     = ""
}

data "google_billing_account" "account" {
  count           = var.enable_budget_alerts ? 1 : 0
  billing_account = var.billing_account_id
}

# Pub/Sub topic for budget alerts (for programmatic handling)
resource "google_pubsub_topic" "budget_alerts" {
  count   = var.enable_budget_alerts ? 1 : 0
  name    = "gwi-budget-alerts-${var.environment}"
  project = var.project_id

  labels = {
    environment = var.environment
    app         = var.app_name
    phase       = "bead-13"
  }
}

# Budget with tiered thresholds
resource "google_billing_budget" "monthly_budget" {
  count = var.enable_budget_alerts ? 1 : 0

  billing_account = data.google_billing_account.account[0].id
  display_name    = "GWI Monthly Budget (${var.environment})"

  budget_filter {
    projects = ["projects/${data.google_project.project.number}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.monthly_budget_amount)
    }
  }

  # $50 warning (50% of $100 default)
  threshold_rules {
    threshold_percent = var.budget_warning_threshold
    spend_basis       = "CURRENT_SPEND"
  }

  # $80 elevated warning (80% of budget)
  threshold_rules {
    threshold_percent = 0.8
    spend_basis       = "CURRENT_SPEND"
  }

  # $100 critical - budget reached
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  # $120 overspend - urgent action needed
  threshold_rules {
    threshold_percent = 1.2
    spend_basis       = "CURRENT_SPEND"
  }

  # Also alert based on forecasted spend
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  # Send notifications to Pub/Sub topic and email
  all_updates_rule {
    pubsub_topic = google_pubsub_topic.budget_alerts[0].id
    # Email notifications are configured via billing console or notification channels
    monitoring_notification_channels = local.all_notification_channels
  }
}

# ============================================================================
# Outputs
# ============================================================================

output "alert_policies" {
  description = "Created alert policy names"
  value = compact([
    var.enable_alerts && var.gwi_api_image != "" ? google_monitoring_alert_policy.gwi_api_error_rate[0].display_name : "",
    var.enable_alerts && var.gwi_api_image != "" ? google_monitoring_alert_policy.gwi_api_latency[0].display_name : "",
    var.enable_alerts && var.gwi_api_image != "" ? google_monitoring_alert_policy.gwi_api_unavailable[0].display_name : "",
    var.enable_alerts ? google_monitoring_alert_policy.gateway_error_rate[0].display_name : "",
    var.enable_alerts && var.github_webhook_image != "" ? google_monitoring_alert_policy.webhook_error_rate[0].display_name : "",
    var.enable_alerts ? google_monitoring_alert_policy.gateway_uptime_alert[0].display_name : "",
    var.enable_alerts && var.gwi_api_image != "" ? google_monitoring_alert_policy.api_uptime_alert[0].display_name : "",
    var.enable_alerts ? google_monitoring_alert_policy.critical_error_rate[0].display_name : "",
  ])
}

output "uptime_checks" {
  description = "Created uptime check names"
  value = compact([
    var.enable_alerts ? google_monitoring_uptime_check_config.gateway_uptime[0].display_name : "",
    var.enable_alerts && var.github_webhook_image != "" ? google_monitoring_uptime_check_config.webhook_uptime[0].display_name : "",
    var.enable_alerts && var.gwi_api_image != "" ? google_monitoring_uptime_check_config.api_uptime[0].display_name : "",
    var.enable_alerts && var.gwi_worker_image != "" ? google_monitoring_uptime_check_config.worker_uptime[0].display_name : "",
  ])
}

output "log_based_metrics" {
  description = "Created log-based metric names"
  value = compact([
    var.enable_alerts ? google_logging_metric.critical_errors[0].name : "",
    var.enable_alerts ? google_logging_metric.auth_failures[0].name : "",
    var.enable_alerts ? google_logging_metric.ai_errors[0].name : "",
  ])
}

output "notification_channel_email" {
  description = "Email notification channel ID"
  value       = var.alert_email != "" ? google_monitoring_notification_channel.email[0].id : "NOT_CONFIGURED"
}

output "budget_configured" {
  description = "Whether budget alerts are configured"
  value       = var.enable_budget_alerts
}

output "budget_amount" {
  description = "Monthly budget amount in USD"
  value       = var.enable_budget_alerts ? var.monthly_budget_amount : 0
}

output "budget_pubsub_topic" {
  description = "Pub/Sub topic for budget alerts"
  value       = var.enable_budget_alerts ? google_pubsub_topic.budget_alerts[0].id : "NOT_CONFIGURED"
}
