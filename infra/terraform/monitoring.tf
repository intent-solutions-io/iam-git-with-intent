# Phase 11: Monitoring and Alerting Configuration
#
# Cloud Monitoring alerting policies for:
# - Error rate spikes (5xx responses)
# - High latency
# - Service unavailability

# ============================================================================
# Alert Variables
# ============================================================================

variable "alert_notification_channels" {
  description = "List of notification channel IDs for alerts"
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

  notification_channels = var.alert_notification_channels

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

  notification_channels = var.alert_notification_channels

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

  notification_channels = var.alert_notification_channels

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

  notification_channels = var.alert_notification_channels

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

  notification_channels = var.alert_notification_channels

  user_labels = {
    component   = "github-webhook"
    environment = var.environment
    severity    = "critical"
    phase       = "phase-11"
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
  ])
}
