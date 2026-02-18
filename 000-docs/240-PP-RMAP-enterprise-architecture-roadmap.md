# 240-PP-RMAP: Enterprise Architecture Roadmap

| Field | Value |
|-------|-------|
| Document ID | 240-PP-RMAP |
| Category | PP (Project Plan) |
| Type | RMAP (Roadmap) |
| Version | 1.0 |
| Status | Draft |
| Author | Intent Solutions Engineering |
| Date | 2026-02-17 |
| Filing Standard | 6767-a-DR-STND v4.2 |

---

## 1. Executive Summary

This PRD defines the enterprise architecture enhancement roadmap for Git With Intent (GWI). The platform currently runs on GCP with 5 Cloud Run services, Firestore, Pub/Sub, and OpenTofu IaC. This document maps the gap between current state and a full 8-layer GCP enterprise reference architecture, prioritizing additions that deliver the highest value for GWI's use case.

### Target Outcome

Transform GWI from an alpha-stage developer tool into an enterprise-grade SaaS platform with defense-in-depth networking, scalable analytics, and enterprise identity management.

### Phases Overview

| Phase | Timeline | Focus |
|-------|----------|-------|
| 6 | Q2-Q3 2026 | Enterprise Infrastructure (WAF, LB, Redis, API Gateway) |
| 7 | Q3-Q4 2026 | Analytics and Scale (BigQuery, CQRS, SLO) |
| 8 | Q4 2026 - Q1 2027 | Enterprise Identity (SCIM, App Integration, RBAC) |

---

## 2. Reference Architecture (8-Layer GCP Enterprise Pattern)

The target architecture follows the GCP enterprise foundation blueprint:

| Layer | Components | Purpose |
|-------|------------|---------|
| 1. Network & Edge | Cloud Armor, External LB, Cloud CDN | DDoS protection, traffic routing, caching |
| 2. API Management | API Gateway, Apigee (optional) | Rate limiting, API keys, developer portal |
| 3. Compute | Cloud Run, GKE (future) | Stateless service hosting |
| 4. Data & Storage | Firestore, BigQuery, Memorystore | Operational DB, analytics, caching |
| 5. Messaging | Pub/Sub, Eventarc | Async communication, event routing |
| 6. Identity | IAM, WIF, SCIM 2.0 | Authentication, authorization, provisioning |
| 7. Observability | Cloud Monitoring, Trace, Logging | SLOs, distributed tracing, alerting |
| 8. Security | Secret Manager, VPC-SC, KMS | Secret management, network perimeter, encryption |

---

## 3. Current State Inventory

### Infrastructure Files (infra/)

| File | Resources | Status |
|------|-----------|--------|
| `main.tf` | Project, providers | Active |
| `provider.tf` | GCP provider config | Active |
| `variables.tf` | Input variables (~50) | Active |
| `versions.tf` | Provider version constraints | Active |
| `outputs.tf` | Stack outputs | Active |
| `cloud_run.tf` | 5 Cloud Run services (api, gateway, webhook, worker, mcp-server) | Active |
| `service_topology.tf` | Per-service CPU/memory/scaling config | Active |
| `service_auth.tf` | Service-to-service IAM bindings | Active |
| `iam.tf` | Service accounts, WIF, roles | Active |
| `network.tf` | VPC, subnets, firewall rules | Active |
| `pubsub.tf` | Topics and subscriptions | Active |
| `storage.tf` | GCS buckets | Active |
| `firestore-backup.tf` | Scheduled Firestore exports | Active |
| `artifact_registry.tf` | Docker image registry | Active |
| `monitoring.tf` | Alert policies, notification channels | Active |
| `scheduler.tf` | Cloud Scheduler jobs | Active |
| `agent_engine.tf` | Vertex AI Agent Engine | Active |
| `webhook_receiver.tf` | Webhook receiver Cloud Run | Active |

### Deployed Services

| Service | Type | Description |
|---------|------|-------------|
| gwi-api | Cloud Run | REST API |
| gwi-gateway | Cloud Run | A2A agent coordination |
| gwi-webhook | Cloud Run | GitHub webhook handler |
| gwi-worker | Cloud Run | Background job processor |
| gwi-mcp-server | Cloud Run | MCP tool server |

---

## 4. Gap Analysis Matrix

| Layer | Component | Current Status | Gap | Priority |
|-------|-----------|---------------|-----|----------|
| 1. Network | Cloud Armor WAF | Missing | No DDoS/WAF protection on Cloud Run endpoints | High |
| 1. Network | External HTTPS LB | Missing | Cloud Run uses default ingress, no centralized LB | High |
| 1. Network | Cloud CDN | Missing | No edge caching for static assets | Medium |
| 2. API Mgmt | API Gateway | Missing | No centralized rate limiting or API key management | High |
| 2. API Mgmt | Apigee | Missing | No developer portal or advanced API analytics | Low (skip) |
| 3. Compute | Cloud Run | Has (5 services) | Sufficient for current scale | N/A |
| 3. Compute | GKE | Missing | Not needed unless scale exceeds Cloud Run limits | Low (skip) |
| 4. Data | Firestore | Has | Operational database in place | N/A |
| 4. Data | BigQuery | Missing | No analytics warehouse for DORA/usage metrics | High |
| 4. Data | Memorystore Redis | Missing | No distributed cache, session store, or rate limit backend | High |
| 5. Messaging | Pub/Sub | Has | Topics and subscriptions configured | N/A |
| 5. Messaging | Eventarc | Partial | Some triggers, not fully wired | Low |
| 6. Identity | IAM + WIF | Has | Service accounts and workload identity in place | N/A |
| 6. Identity | SCIM 2.0 | Missing | No automated user provisioning from IdPs | Medium |
| 6. Identity | Advanced RBAC | Partial | Basic roles exist, no fine-grained permissions | Medium |
| 7. Observability | Monitoring | Has | Alert policies configured | N/A |
| 7. Observability | SLO Monitoring | Missing | No formal SLI/SLO definitions in IaC | High |
| 7. Observability | Tracing | Partial | Some spans, not comprehensive | Medium |
| 8. Security | Secret Manager | Has | Secrets stored and referenced | N/A |
| 8. Security | VPC Service Controls | Missing | No service perimeter for Firestore/BigQuery | Medium |
| 8. Security | KMS (CMEK) | Missing | Using Google-managed keys, not customer-managed | Low |

---

## 5. Implementation Roadmap

### Phase 6: Enterprise Infrastructure (Q2-Q3 2026)

**Goal:** Defense-in-depth networking and performance caching.

#### 6.1 Cloud Armor WAF

| Item | Value |
|------|-------|
| OpenTofu file | `infra/cloud_armor.tf` (new) |
| Resource | `google_compute_security_policy.gwi_waf` |
| Variables | `var.waf_enabled`, `var.waf_rules` |
| Rules | OWASP CRS 3.3, rate limiting (100 req/min default), geo-blocking (optional) |
| Binding | Attach to External LB backend services |

#### 6.2 External HTTPS Load Balancer

| Item | Value |
|------|-------|
| OpenTofu file | `infra/load_balancer.tf` (new) |
| Resources | `google_compute_global_address`, `google_compute_managed_ssl_certificate`, `google_compute_url_map`, `google_compute_target_https_proxy`, `google_compute_global_forwarding_rule` |
| Variables | `var.lb_enabled`, `var.lb_domain`, `var.lb_ssl_domains` |
| Backend services | One per Cloud Run service (serverless NEG) |
| Path routing | `/api/*` -> gwi-api, `/gateway/*` -> gwi-gateway, `/mcp/*` -> gwi-mcp-server |

#### 6.3 Memorystore Redis

| Item | Value |
|------|-------|
| OpenTofu file | `infra/memorystore.tf` (new) |
| Resource | `google_redis_instance.gwi_cache` |
| Variables | `var.redis_enabled`, `var.redis_tier` (BASIC/STANDARD), `var.redis_memory_size_gb` |
| Use cases | Session cache, rate limit counters, agent result caching |
| VPC connector | Requires Serverless VPC Access connector for Cloud Run |

#### 6.4 API Gateway

| Item | Value |
|------|-------|
| OpenTofu file | `infra/api_gateway.tf` (new) |
| Resources | `google_api_gateway_api`, `google_api_gateway_api_config`, `google_api_gateway_gateway` |
| Variables | `var.api_gateway_enabled`, `var.api_gateway_spec_path` |
| Features | Rate limiting, API key validation, request transformation |
| OpenAPI spec | `infra/api-gateway-spec.yaml` (new) |


### Phase 7: Analytics and Scale (Q3-Q4 2026)

**Goal:** Data-driven insights and event-sourced architecture.

#### 7.1 BigQuery Analytics Pipeline

| Item | Value |
|------|-------|
| OpenTofu file | `infra/bigquery.tf` (new) |
| Resources | `google_bigquery_dataset.gwi_analytics`, tables for runs, agents, billing, DORA metrics |
| Variables | `var.bigquery_enabled`, `var.bigquery_location`, `var.bigquery_retention_days` |
| Pipeline | Firestore -> Pub/Sub -> Cloud Run (ETL) -> BigQuery |
| Datasets | `gwi_analytics` (run metrics), `gwi_billing` (cost tracking) |

#### 7.2 CQRS Event Store

| Item | Value |
|------|-------|
| OpenTofu file | `infra/eventstore.tf` (new) |
| Architecture | Pub/Sub topics as event bus, Firestore subcollections as event log |
| Topics | `gwi-events-run`, `gwi-events-agent`, `gwi-events-approval` |
| Consumers | BigQuery sink, notification service, audit logger |
| Variables | `var.cqrs_enabled`, `var.event_retention_days` |

#### 7.3 SLO Monitoring

| Item | Value |
|------|-------|
| OpenTofu file | Update `infra/monitoring.tf` |
| Resources | `google_monitoring_slo` per service, `google_monitoring_service` |
| SLIs | Availability (99.9%), latency (p95 < 2s), error rate (< 0.1%) |
| Variables | `var.slo_enabled`, `var.slo_targets` (map of service -> target) |
| Burn rate alerts | Fast burn (1h window), slow burn (24h window) |


### Phase 8: Enterprise Identity (Q4 2026 - Q1 2027)

**Goal:** Automated user lifecycle and fine-grained access control.

#### 8.1 SCIM 2.0 Provisioning

| Item | Value |
|------|-------|
| Implementation | `apps/api/src/routes/scim/` (new) |
| Endpoints | `/scim/v2/Users`, `/scim/v2/Groups`, `/scim/v2/ServiceProviderConfig` |
| IdP support | Okta, Azure AD, Google Workspace |
| Storage | Firestore `tenants/{id}/scimUsers` collection |
| Variables | `var.scim_enabled` |

#### 8.2 Application Integration

| Item | Value |
|------|-------|
| Scope | Webhook-based integrations with enterprise tools |
| Integrations | PagerDuty (incidents), Datadog (metrics export), ServiceNow (tickets) |
| Implementation | `packages/integrations/src/enterprise/` (new) |
| Configuration | Per-tenant integration settings in Firestore |

#### 8.3 Advanced RBAC

| Item | Value |
|------|-------|
| Implementation | `packages/core/src/auth/rbac/` (enhance existing) |
| Roles | org_admin, project_admin, developer, reviewer, auditor, read_only |
| Permissions | Fine-grained: `runs.create`, `runs.approve`, `agents.configure`, `audit.export` |
| Storage | Firestore `tenants/{id}/roles` and `tenants/{id}/permissions` |
| Variables | `var.rbac_mode` (basic/advanced) |

---

## 6. Dependency Graph

```
Phase 6.2 (External LB)
  └── Phase 6.1 (Cloud Armor WAF) -- WAF attaches to LB
  └── Phase 6.3 (Memorystore) -- needs VPC connector shared with LB
Phase 6.4 (API Gateway) -- independent, can parallel with 6.1-6.3

Phase 7.1 (BigQuery)
  └── Phase 7.2 (CQRS Event Store) -- events feed into BigQuery
  └── Phase 7.3 (SLO Monitoring) -- SLO data stored in BigQuery

Phase 8.1 (SCIM) -- independent
Phase 8.2 (App Integration) -- independent
Phase 8.3 (Advanced RBAC) -- depends on 8.1 for user/group sync
```

### Critical Path

1. External LB (6.2) -> Cloud Armor (6.1) -> API Gateway (6.4)
2. BigQuery (7.1) -> CQRS (7.2) -> SLO Monitoring (7.3)
3. SCIM (8.1) -> Advanced RBAC (8.3)

---

## 7. Cost Estimates

| Component | Monthly Cost (Dev) | Monthly Cost (Prod) | Notes |
|-----------|--------------------|---------------------|-------|
| Cloud Armor | $5 (policy) | $5 + $0.75/M requests | Per-policy + per-request pricing |
| External LB | $18 | $18 + data processing | Forwarding rule + backend |
| Memorystore Redis | $37 (1GB Basic) | $146 (2GB Standard HA) | Persistent HA for prod |
| API Gateway | Free tier | ~$3/M calls | First 2M calls/month free |
| BigQuery | Free tier (1TB) | ~$25/month | On-demand query pricing |
| SLO Monitoring | Free | Free | Included with Cloud Monitoring |
| **Phase 6 Total** | **~$60/mo** | **~$190/mo** | Infrastructure layer |
| **Phase 7 Total** | **~$5/mo** | **~$30/mo** | Analytics layer |
| **Phase 8 Total** | **$0** | **$0** | Application-layer (code only) |
| **Grand Total** | **~$65/mo** | **~$220/mo** | All three phases |

---

## 8. Skip List (Not Needed for GWI)

| Component | Reason |
|-----------|--------|
| Apigee | Overkill for internal API management; API Gateway covers rate limiting and key management |
| GKE | Cloud Run handles current scale; GKE adds operational overhead with no benefit at current traffic |
| Cloud CDN | GWI is API-first with minimal static assets; Firebase Hosting covers web dashboard |
| KMS (CMEK) | Google-managed encryption sufficient for current threat model; CMEK adds key rotation overhead |
| VPC Service Controls | Adds complexity; revisit if handling PII or regulated data beyond current scope |
| Anthos Service Mesh | No multi-cluster or hybrid needs; Cloud Run service-to-service auth is sufficient |
| Cloud NAT | Cloud Run has built-in egress; NAT only needed for GCE/GKE workloads |

---

## 9. Success Criteria

| Phase | Metric | Target |
|-------|--------|--------|
| 6 | WAF blocking malicious requests | >99% OWASP attack prevention |
| 6 | Cache hit rate (Redis) | >80% for repeated agent queries |
| 6 | API Gateway latency overhead | <10ms p99 added latency |
| 7 | Analytics query time | <5s for 30-day DORA dashboards |
| 7 | SLO burn rate alert latency | <5min for fast burn detection |
| 8 | SCIM provisioning time | <30s user creation from IdP |
| 8 | RBAC permission check | <5ms per authorization check |

---

*Document follows 6767-a-DR-STND-document-filing-system-standard-v4-2 naming convention.*
