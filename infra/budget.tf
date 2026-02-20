# =============================================================================
# Budget Alerts — Scale & Ops Maturity (gwi-keq)
#
# Agent-first: Budget alerts fire to Pub/Sub so agents can subscribe.
# Agents query budget status via API to make cost-aware decisions
# (e.g., switch to cheaper models when budget is 80% consumed).
# =============================================================================

variable "enable_budget_alerts" {
  description = "Enable GCP billing budget alerts"
  type        = bool
  default     = false
}

variable "budget_amount_usd" {
  description = "Monthly budget amount in USD"
  type        = number
  default     = 500
}

variable "budget_alert_thresholds" {
  description = "Alert threshold percentages (0.0-1.0)"
  type        = list(number)
  default     = [0.5, 0.8, 0.9, 1.0]
}

variable "billing_account_id" {
  description = "GCP Billing Account ID (required if enable_budget_alerts = true)"
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# Pub/Sub topic for budget alert notifications
# -----------------------------------------------------------------------------

resource "google_pubsub_topic" "budget_alerts" {
  count   = var.enable_budget_alerts ? 1 : 0
  project = var.project_id
  name    = "${var.app_name}-budget-alerts"

  labels = merge(var.labels, {
    purpose = "budget-alerts"
  })
}

# -----------------------------------------------------------------------------
# Budget resource
# -----------------------------------------------------------------------------

resource "google_billing_budget" "monthly" {
  count = var.enable_budget_alerts && var.billing_account_id != "" ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "${var.app_name}-${var.environment}-monthly"

  budget_filter {
    projects = ["projects/${var.project_id}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.budget_amount_usd)
    }
  }

  dynamic "threshold_rules" {
    for_each = var.budget_alert_thresholds
    content {
      threshold_percent = threshold_rules.value
      spend_basis       = "CURRENT_SPEND"
    }
  }

  all_updates_rule {
    pubsub_topic = google_pubsub_topic.budget_alerts[0].id
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "budget_alert_topic" {
  description = "Pub/Sub topic for budget alerts"
  value       = var.enable_budget_alerts ? google_pubsub_topic.budget_alerts[0].name : "NOT_ENABLED"
}

output "budget_alert_topic_id" {
  description = "Pub/Sub topic ID for budget alerts"
  value       = var.enable_budget_alerts ? google_pubsub_topic.budget_alerts[0].id : "NOT_ENABLED"
}
