# SLO/SLA Targets

> **Document**: 111-DR-TARG-slo-sla-targets.md
> **Created**: 2025-12-18 02:30 CST
> **Phase**: 32 (GA Readiness)
> **Status**: Living document - update as requirements evolve

## 1. Service Level Objectives (SLOs)

### 1.1 Availability

| Service | Target | Measurement Window | Allowed Downtime |
|---------|--------|-------------------|------------------|
| GWI API | 99.5% | 30 days | 3.6 hours/month |
| A2A Gateway | 99.5% | 30 days | 3.6 hours/month |
| GitHub Webhook | 99.9% | 30 days | 43.8 min/month |
| Web Dashboard | 99.0% | 30 days | 7.2 hours/month |

### 1.2 Latency

| Endpoint | P50 Target | P95 Target | P99 Target |
|----------|-----------|-----------|-----------|
| API Read (GET) | 100ms | 500ms | 1s |
| API Write (POST) | 200ms | 1s | 2s |
| Webhook Processing | 500ms | 2s | 5s |
| Run Start to First Step | 2s | 5s | 10s |
| Full Run (small PR) | 30s | 60s | 120s |

### 1.3 Error Rate

| Service | Target | Threshold |
|---------|--------|-----------|
| GWI API | < 1% 5xx | Alert at 5% |
| Gateway | < 1% 5xx | Alert at 5% |
| Webhook | < 0.5% 5xx | Alert at 2% |

### 1.4 Throughput

| Operation | Baseline | Peak Capacity |
|-----------|----------|---------------|
| Webhooks/minute | 100 | 1,000 |
| API requests/minute | 500 | 5,000 |
| Concurrent runs | 50 | 200 |

## 2. Service Level Agreements (SLAs)

### 2.1 Commercial SLA Tiers

| Tier | Availability | Support Response | Price Point |
|------|-------------|------------------|-------------|
| Free | Best effort | Community | $0 |
| Team | 99.5% | 24h | $29/month |
| Business | 99.9% | 4h | $99/month |
| Enterprise | 99.95% + SLA credits | 1h | Custom |

### 2.2 SLA Credits (Enterprise)

| Availability | Credit |
|--------------|--------|
| 99.0% - 99.95% | 10% |
| 95.0% - 99.0% | 25% |
| < 95.0% | 50% |

## 3. Recovery Objectives

### 3.1 Recovery Time Objective (RTO)

| Scenario | RTO | Action |
|----------|-----|--------|
| Single service failure | 5 min | Auto-restart via Cloud Run |
| Regional outage | 30 min | Manual failover to backup region |
| Data corruption | 4 hours | Restore from backup |
| Full disaster | 24 hours | Full rebuild from Terraform |

### 3.2 Recovery Point Objective (RPO)

| Data Type | RPO | Backup Frequency |
|-----------|-----|------------------|
| Firestore data | 1 hour | Continuous (native) |
| User configuration | 24 hours | Daily export |
| Run artifacts | N/A | Ephemeral (regeneratable) |
| Audit logs | 0 | Real-time replication |

## 4. Monitoring

### 4.1 SLI Sources

| SLI | Source | Dashboard |
|-----|--------|-----------|
| Availability | Cloud Run uptime | Cloud Monitoring |
| Latency | Cloud Run metrics | Cloud Monitoring |
| Error Rate | Cloud Run 5xx count | Cloud Monitoring |
| Throughput | Request count | Cloud Monitoring |

### 4.2 Alerting Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Error Rate | > 2% | > 5% |
| P95 Latency | > 3s | > 5s |
| Availability (5min) | < 99% | < 95% |

## 5. Incident Severity

| Severity | Definition | Response Time |
|----------|------------|---------------|
| SEV1 | Service down, all users affected | 15 min |
| SEV2 | Major feature broken, many users | 1 hour |
| SEV3 | Minor feature broken, some users | 4 hours |
| SEV4 | Cosmetic or minor issue | Next business day |

## 6. Exclusions

SLA does not apply during:
- Scheduled maintenance (with 24h notice)
- Force majeure events
- Third-party outages (GitHub, GCP)
- Customer-caused incidents
- Beta/preview features

## 7. Review Cadence

- **Weekly**: SLO burn rate review
- **Monthly**: SLO compliance report
- **Quarterly**: SLA/SLO target review

## 8. Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-18 | Claude Code | Initial SLO/SLA targets for GA |
