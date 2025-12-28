# =============================================================================
# Epic H1: Cloud Run Network Configuration
# =============================================================================
#
# H1.s3: VPC Serverless Connector for Cloud Run services
#
# Architecture:
# - Private VPC for internal service communication
# - VPC Serverless Connector for Cloud Run egress
# - Private Google Access for GCP services (Firestore, Secret Manager)
# - No direct internet egress (all traffic through VPC)
#
# Network Security:
# - Internal services communicate via VPC
# - Only webhook service has public endpoint
# - All other services require IAM authentication
#
# =============================================================================

# =============================================================================
# VPC Network Variables
# =============================================================================

variable "enable_vpc_connector" {
  description = "Enable VPC Serverless Connector for Cloud Run services"
  type        = bool
  default     = false
}

variable "vpc_connector_cidr" {
  description = "CIDR range for VPC Serverless Connector (/28 required)"
  type        = string
  default     = "10.8.0.0/28"
}

variable "vpc_connector_machine_type" {
  description = "Machine type for VPC Serverless Connector"
  type        = string
  default     = "e2-micro"
}

variable "vpc_connector_min_instances" {
  description = "Minimum instances for VPC Serverless Connector"
  type        = number
  default     = 2
}

variable "vpc_connector_max_instances" {
  description = "Maximum instances for VPC Serverless Connector"
  type        = number
  default     = 3
}

variable "vpc_connector_max_throughput" {
  description = "Maximum throughput in Mbps (200, 300, 400, 500, 600, 700, 800, 900, 1000)"
  type        = number
  default     = 300
}

variable "vpc_egress_setting" {
  description = "VPC egress setting: all-traffic or private-ranges-only"
  type        = string
  default     = "private-ranges-only"

  validation {
    condition     = contains(["all-traffic", "private-ranges-only"], var.vpc_egress_setting)
    error_message = "vpc_egress_setting must be 'all-traffic' or 'private-ranges-only'"
  }
}

# =============================================================================
# VPC Network
# =============================================================================

# Private VPC for GWI services
resource "google_compute_network" "gwi_vpc" {
  count = var.enable_vpc_connector ? 1 : 0

  name                    = "${var.app_name}-vpc-${var.environment}"
  project                 = var.project_id
  auto_create_subnetworks = false
  description             = "Private VPC for GWI Cloud Run services"
}

# Subnet for VPC Serverless Connector
resource "google_compute_subnetwork" "gwi_connector_subnet" {
  count = var.enable_vpc_connector ? 1 : 0

  name          = "${var.app_name}-connector-subnet-${var.environment}"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.gwi_vpc[0].id
  ip_cidr_range = var.vpc_connector_cidr

  # Enable Private Google Access for GCP services
  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# =============================================================================
# VPC Serverless Connector
# =============================================================================

# VPC Access Connector for Cloud Run
resource "google_vpc_access_connector" "gwi_connector" {
  count = var.enable_vpc_connector ? 1 : 0

  name          = "${var.app_name}-connector-${var.environment}"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.gwi_vpc[0].name
  ip_cidr_range = var.vpc_connector_cidr

  machine_type  = var.vpc_connector_machine_type
  min_instances = var.vpc_connector_min_instances
  max_instances = var.vpc_connector_max_instances

  # Note: max_throughput is deprecated, using min/max instances instead

  depends_on = [
    google_project_service.required_apis,
  ]
}

# =============================================================================
# Cloud NAT for Outbound Internet Access
# =============================================================================

# Cloud Router for NAT
resource "google_compute_router" "gwi_router" {
  count = var.enable_vpc_connector ? 1 : 0

  name    = "${var.app_name}-router-${var.environment}"
  project = var.project_id
  region  = var.region
  network = google_compute_network.gwi_vpc[0].id

  bgp {
    asn = 64514
  }
}

# Cloud NAT for outbound internet access
resource "google_compute_router_nat" "gwi_nat" {
  count = var.enable_vpc_connector ? 1 : 0

  name                               = "${var.app_name}-nat-${var.environment}"
  project                            = var.project_id
  region                             = var.region
  router                             = google_compute_router.gwi_router[0].name
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# =============================================================================
# Firewall Rules
# =============================================================================

# Allow internal communication between services
resource "google_compute_firewall" "allow_internal" {
  count = var.enable_vpc_connector ? 1 : 0

  name        = "${var.app_name}-allow-internal-${var.environment}"
  project     = var.project_id
  network     = google_compute_network.gwi_vpc[0].name
  description = "Allow internal communication between GWI services"

  allow {
    protocol = "tcp"
    ports    = ["443", "8080"]
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = [var.vpc_connector_cidr]
  target_tags   = ["gwi-service"]
}

# Allow health checks from Google's health check IPs
resource "google_compute_firewall" "allow_health_checks" {
  count = var.enable_vpc_connector ? 1 : 0

  name        = "${var.app_name}-allow-health-checks-${var.environment}"
  project     = var.project_id
  network     = google_compute_network.gwi_vpc[0].name
  description = "Allow GCP health check probes"

  allow {
    protocol = "tcp"
    ports    = ["8080"]
  }

  # Google's health check IP ranges
  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
  target_tags   = ["gwi-service"]
}

# Deny all other ingress by default (defense in depth)
resource "google_compute_firewall" "deny_all_ingress" {
  count = var.enable_vpc_connector ? 1 : 0

  name        = "${var.app_name}-deny-all-ingress-${var.environment}"
  project     = var.project_id
  network     = google_compute_network.gwi_vpc[0].name
  description = "Deny all other ingress traffic"
  priority    = 65534

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["gwi-service"]
}

# =============================================================================
# Private Service Connect (for Google APIs)
# =============================================================================

# Private DNS zone for googleapis.com
resource "google_dns_managed_zone" "googleapis" {
  count = var.enable_vpc_connector ? 1 : 0

  name        = "${var.app_name}-googleapis-${var.environment}"
  project     = var.project_id
  dns_name    = "googleapis.com."
  description = "Private DNS zone for Google APIs"
  visibility  = "private"

  private_visibility_config {
    networks {
      network_url = google_compute_network.gwi_vpc[0].id
    }
  }
}

# A record for private.googleapis.com
resource "google_dns_record_set" "googleapis_a" {
  count = var.enable_vpc_connector ? 1 : 0

  name         = "private.googleapis.com."
  project      = var.project_id
  managed_zone = google_dns_managed_zone.googleapis[0].name
  type         = "A"
  ttl          = 300

  # Google's Private Service Connect IP ranges
  rrdatas = ["199.36.153.8", "199.36.153.9", "199.36.153.10", "199.36.153.11"]
}

# CNAME for *.googleapis.com to private.googleapis.com
resource "google_dns_record_set" "googleapis_cname" {
  count = var.enable_vpc_connector ? 1 : 0

  name         = "*.googleapis.com."
  project      = var.project_id
  managed_zone = google_dns_managed_zone.googleapis[0].name
  type         = "CNAME"
  ttl          = 300

  rrdatas = ["private.googleapis.com."]
}

# =============================================================================
# Outputs
# =============================================================================

output "vpc_network_name" {
  description = "VPC network name"
  value       = var.enable_vpc_connector ? google_compute_network.gwi_vpc[0].name : "NOT_ENABLED"
}

output "vpc_network_id" {
  description = "VPC network ID"
  value       = var.enable_vpc_connector ? google_compute_network.gwi_vpc[0].id : "NOT_ENABLED"
}

output "vpc_connector_name" {
  description = "VPC Serverless Connector name"
  value       = var.enable_vpc_connector ? google_vpc_access_connector.gwi_connector[0].name : "NOT_ENABLED"
}

output "vpc_connector_id" {
  description = "VPC Serverless Connector ID (for Cloud Run)"
  value       = var.enable_vpc_connector ? google_vpc_access_connector.gwi_connector[0].id : "NOT_ENABLED"
}

output "nat_ip" {
  description = "Cloud NAT external IP (auto-allocated)"
  value       = var.enable_vpc_connector ? "AUTO_ALLOCATED" : "NOT_ENABLED"
}

# =============================================================================
# Cost Estimate
# =============================================================================
#
# VPC Serverless Connector:
# - e2-micro instances: ~$6.11/month per instance
# - With min_instances=2: ~$12.22/month baseline
# - With max_instances=3: Up to ~$18.33/month at peak
#
# Cloud NAT:
# - NAT gateway: ~$0.0013/GB processed
# - Minimal cost for typical workloads
#
# Total estimated monthly cost: ~$15-25/month for VPC networking
#
# Note: Can be disabled in dev (enable_vpc_connector=false) to save costs
# =============================================================================
