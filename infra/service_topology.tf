# =============================================================================
# Epic H1: Cloud Run Service Topology
# =============================================================================
#
# H1.s1: Service Topology Definition
# H1.s2: Auto-scaling Configuration
# H1.s5: Health Check Configuration
#
# Service Architecture:
# +-------------------+     +-------------------+
# |    API Service    |<--->|  Gateway Service  |
# |  (Public/Auth)    |     |   (Public/IAM)    |
# +-------------------+     +-------------------+
#          |                         |
#          v                         v
# +-------------------+     +-------------------+
# |  Webhook Service  |     |  Worker Service   |
# |   (Public/HMAC)   |     |   (IAM Only)      |
# +-------------------+     +-------------------+
#
# =============================================================================

# =============================================================================
# Service Topology Variables (H1.s1)
# =============================================================================

variable "service_topology" {
  description = "Cloud Run service topology configuration"
  type = object({
    api = object({
      cpu               = string
      memory            = string
      concurrency       = number
      timeout_seconds   = number
      min_instances     = number
      max_instances     = number
      cpu_throttling    = bool
      startup_cpu_boost = bool
    })
    gateway = object({
      cpu               = string
      memory            = string
      concurrency       = number
      timeout_seconds   = number
      min_instances     = number
      max_instances     = number
      cpu_throttling    = bool
      startup_cpu_boost = bool
    })
    webhook = object({
      cpu               = string
      memory            = string
      concurrency       = number
      timeout_seconds   = number
      min_instances     = number
      max_instances     = number
      cpu_throttling    = bool
      startup_cpu_boost = bool
    })
    worker = object({
      cpu               = string
      memory            = string
      concurrency       = number
      timeout_seconds   = number
      min_instances     = number
      max_instances     = number
      cpu_throttling    = bool
      startup_cpu_boost = bool
    })
    # EPIC 024: MCP Server for AI Coding Assistant Integration
    mcp_server = object({
      cpu               = string
      memory            = string
      concurrency       = number
      timeout_seconds   = number
      min_instances     = number
      max_instances     = number
      cpu_throttling    = bool
      startup_cpu_boost = bool
    })
  })
  default = {
    # API Service: High concurrency, fast responses
    api = {
      cpu               = "1000m"
      memory            = "512Mi"
      concurrency       = 100
      timeout_seconds   = 60
      min_instances     = 0
      max_instances     = 10
      cpu_throttling    = true
      startup_cpu_boost = true
    }
    # Gateway Service: Agent orchestration, moderate resources
    gateway = {
      cpu               = "1000m"
      memory            = "512Mi"
      concurrency       = 80
      timeout_seconds   = 300
      min_instances     = 0
      max_instances     = 10
      cpu_throttling    = true
      startup_cpu_boost = true
    }
    # Webhook Service: Fast webhook processing
    webhook = {
      cpu               = "1000m"
      memory            = "512Mi"
      concurrency       = 80
      timeout_seconds   = 300
      min_instances     = 0
      max_instances     = 10
      cpu_throttling    = true
      startup_cpu_boost = true
    }
    # Worker Service: Long-running jobs, more resources
    worker = {
      cpu               = "2000m"
      memory            = "1Gi"
      concurrency       = 1
      timeout_seconds   = 600
      min_instances     = 0
      max_instances     = 10
      cpu_throttling    = false # Keep CPU active for background work
      startup_cpu_boost = true
    }
    # MCP Server: AI Coding Assistant Integration (EPIC 024)
    # Optimized for fast MCP protocol responses to IDE assistants
    mcp_server = {
      cpu               = "1000m"
      memory            = "512Mi"
      concurrency       = 100 # High concurrency for multiple IDE connections
      timeout_seconds   = 300 # Allow time for Agent Engine proxy calls
      min_instances     = 0
      max_instances     = 10
      cpu_throttling    = true
      startup_cpu_boost = true
    }
  }
}

# =============================================================================
# Health Check Configuration (H1.s5)
# =============================================================================

variable "health_check_config" {
  description = "Health check probe configuration for Cloud Run services"
  type = object({
    liveness = object({
      path                  = string
      initial_delay_seconds = number
      timeout_seconds       = number
      period_seconds        = number
      failure_threshold     = number
    })
    startup = object({
      path                  = string
      initial_delay_seconds = number
      timeout_seconds       = number
      period_seconds        = number
      failure_threshold     = number
    })
  })
  default = {
    # Liveness probe: Is the service responsive?
    liveness = {
      path                  = "/health"
      initial_delay_seconds = 5
      timeout_seconds       = 3
      period_seconds        = 10
      failure_threshold     = 3
    }
    # Startup probe: Has the service finished starting?
    startup = {
      path                  = "/health/ready"
      initial_delay_seconds = 0
      timeout_seconds       = 3
      period_seconds        = 5
      failure_threshold     = 10 # Allow 50 seconds for slow start
    }
  }
}

# =============================================================================
# Auto-scaling Configuration (H1.s2)
# =============================================================================

variable "scaling_behavior" {
  description = "Auto-scaling behavior configuration"
  type = object({
    scale_down_delay_seconds = number # Delay before scaling down
    target_cpu_utilization   = number # Target CPU % for scaling (0-100)
  })
  default = {
    scale_down_delay_seconds = 60
    target_cpu_utilization   = 70
  }
}

# =============================================================================
# Locals: Merge topology with environment-specific overrides
# =============================================================================

locals {
  # Environment-specific overrides
  env_min_instances = var.environment == "prod" ? 1 : 0

  # Effective service topology (merges defaults with environment)
  effective_topology = {
    api = merge(var.service_topology.api, {
      min_instances = var.environment == "prod" ? max(var.service_topology.api.min_instances, 1) : var.service_topology.api.min_instances
    })
    gateway = merge(var.service_topology.gateway, {
      min_instances = var.environment == "prod" ? max(var.service_topology.gateway.min_instances, 1) : var.service_topology.gateway.min_instances
    })
    webhook = merge(var.service_topology.webhook, {
      min_instances = var.environment == "prod" ? max(var.service_topology.webhook.min_instances, 1) : var.service_topology.webhook.min_instances
    })
    worker = merge(var.service_topology.worker, {
      min_instances = var.environment == "prod" ? max(var.service_topology.worker.min_instances, 1) : var.service_topology.worker.min_instances
    })
    mcp_server = merge(var.service_topology.mcp_server, {
      min_instances = var.environment == "prod" ? max(var.service_topology.mcp_server.min_instances, 1) : var.service_topology.mcp_server.min_instances
    })
  }

  # Epic B: Webhook Receiver topology (optimized for fast response <500ms)
  effective_webhook_receiver_topology = {
    cpu               = "1000m"
    memory            = "512Mi"
    concurrency       = 100 # High concurrency for webhook handling
    timeout_seconds   = 10  # Fast timeout for webhook responses
    min_instances     = var.environment == "prod" ? 1 : 0
    max_instances     = 50 # Scale quickly for webhook bursts
    cpu_throttling    = true
    startup_cpu_boost = true
  }

  # VPC connector annotation (if enabled)
  vpc_connector_annotations = var.enable_vpc_connector ? {
    "run.googleapis.com/vpc-access-connector" = google_vpc_access_connector.gwi_connector[0].id
    "run.googleapis.com/vpc-access-egress"    = var.vpc_egress_setting
  } : {}
}

# =============================================================================
# Outputs: Service Topology Summary
# =============================================================================

output "service_topology_summary" {
  description = "Summary of Cloud Run service topology"
  value = {
    api = {
      resources   = "${local.effective_topology.api.cpu} CPU, ${local.effective_topology.api.memory}"
      scaling     = "${local.effective_topology.api.min_instances}-${local.effective_topology.api.max_instances} instances"
      concurrency = local.effective_topology.api.concurrency
      timeout     = "${local.effective_topology.api.timeout_seconds}s"
    }
    gateway = {
      resources   = "${local.effective_topology.gateway.cpu} CPU, ${local.effective_topology.gateway.memory}"
      scaling     = "${local.effective_topology.gateway.min_instances}-${local.effective_topology.gateway.max_instances} instances"
      concurrency = local.effective_topology.gateway.concurrency
      timeout     = "${local.effective_topology.gateway.timeout_seconds}s"
    }
    webhook = {
      resources   = "${local.effective_topology.webhook.cpu} CPU, ${local.effective_topology.webhook.memory}"
      scaling     = "${local.effective_topology.webhook.min_instances}-${local.effective_topology.webhook.max_instances} instances"
      concurrency = local.effective_topology.webhook.concurrency
      timeout     = "${local.effective_topology.webhook.timeout_seconds}s"
    }
    worker = {
      resources   = "${local.effective_topology.worker.cpu} CPU, ${local.effective_topology.worker.memory}"
      scaling     = "${local.effective_topology.worker.min_instances}-${local.effective_topology.worker.max_instances} instances"
      concurrency = local.effective_topology.worker.concurrency
      timeout     = "${local.effective_topology.worker.timeout_seconds}s"
    }
    mcp_server = {
      resources   = "${local.effective_topology.mcp_server.cpu} CPU, ${local.effective_topology.mcp_server.memory}"
      scaling     = "${local.effective_topology.mcp_server.min_instances}-${local.effective_topology.mcp_server.max_instances} instances"
      concurrency = local.effective_topology.mcp_server.concurrency
      timeout     = "${local.effective_topology.mcp_server.timeout_seconds}s"
    }
  }
}

output "vpc_networking_enabled" {
  description = "Whether VPC networking is enabled for Cloud Run services"
  value       = var.enable_vpc_connector
}

# =============================================================================
# Cost Estimate by Environment
# =============================================================================
#
# Cloud Run Pricing (us-central1):
# - vCPU: $0.00002400/vCPU-second (first 180,000 free/month)
# - Memory: $0.00000250/GiB-second (first 360,000 free/month)
# - Min instances: Charged even when idle
#
# DEV Environment (min_instances=0 for all):
# - Pay per use only
# - Estimated: $5-15/month with light usage
#
# PROD Environment (min_instances=1 for all services):
# - API (1x): ~$20/month (1 CPU, 512Mi always running)
# - Gateway (1x): ~$20/month
# - Webhook (1x): ~$20/month
# - Worker (1x): ~$40/month (2 CPU, 1Gi)
# - Baseline: ~$100/month before usage spikes
#
# With VPC Connector (optional):
# - Add ~$15-25/month for VPC infrastructure
#
# Recommendations:
# - DEV: Disable VPC connector, min_instances=0
# - STAGING: min_instances=0, VPC optional
# - PROD: min_instances=1, VPC enabled for security
# =============================================================================
