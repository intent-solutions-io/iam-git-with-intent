# Service Catalog Specification

> **Document**: 226-DR-SPEC-service-catalog
> **Epic**: EPIC 017 - Service Catalog
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

A service catalog provides a single source of truth for all services, their ownership, dependencies, and operational metadata. This spec defines the catalog structure, metadata schema, and integration points.

---

## Catalog Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SERVICE CATALOG                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        CATALOG UI                                     │   │
│  │  • Service list & search                                             │   │
│  │  • Dependency graph                                                  │   │
│  │  • Health dashboard                                                  │   │
│  │  • Documentation links                                               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      CATALOG API                                      │   │
│  │  • CRUD operations                                                   │   │
│  │  • Search & filter                                                   │   │
│  │  • Dependency resolution                                             │   │
│  │  • Health aggregation                                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    CATALOG STORE                                      │   │
│  │  • Service definitions (catalog-info.yaml)                           │   │
│  │  • Ownership metadata                                                │   │
│  │  • Dependency graph                                                  │   │
│  │  • Integration links                                                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐   │
│  │   GitHub    │  Cloud Run  │  PagerDuty  │  Datadog    │  OpenAPI    │   │
│  │   Repos     │  Services   │  Schedules  │  Monitors   │  Specs      │   │
│  └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘   │
│                           INTEGRATIONS                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Service Definition Schema

### catalog-info.yaml

```yaml
# catalog-info.yaml - Service metadata file (committed to repo root)
apiVersion: gwi.dev/v1
kind: Service
metadata:
  name: gwi-api
  title: "GWI API Service"
  description: "Main REST API for Git With Intent"
  tags:
    - api
    - backend
    - production

spec:
  # ═══════════════════════════════════════════════════════════════════════════
  # OWNERSHIP
  # ═══════════════════════════════════════════════════════════════════════════
  owner: team:backend
  lifecycle: production  # experimental | development | production | deprecated

  # Team members
  contacts:
    oncall:
      type: pagerduty
      target: "backend-primary"
    slack:
      type: slack
      target: "#gwi-backend"
    email:
      type: email
      target: "backend@company.com"

  # ═══════════════════════════════════════════════════════════════════════════
  # INFRASTRUCTURE
  # ═══════════════════════════════════════════════════════════════════════════
  system: gwi-platform
  type: service  # service | library | website | resource

  infrastructure:
    runtime: cloud-run
    region: us-central1
    project: git-with-intent
    service_name: gwi-api

  # Resource links
  links:
    - title: "Cloud Run Console"
      url: "https://console.cloud.google.com/run/detail/us-central1/gwi-api"
      type: console
    - title: "Logs"
      url: "https://console.cloud.google.com/logs?service=gwi-api"
      type: logs
    - title: "Metrics Dashboard"
      url: "https://console.cloud.google.com/monitoring/dashboards/gwi-api"
      type: dashboard
    - title: "Runbook"
      url: "./docs/runbook.md"
      type: runbook

  # ═══════════════════════════════════════════════════════════════════════════
  # DEPENDENCIES
  # ═══════════════════════════════════════════════════════════════════════════
  dependsOn:
    - component:gwi-core
    - component:gwi-agents
    - resource:firestore-main
    - resource:pubsub-runs

  providesApis:
    - gwi-api-v1

  consumesApis:
    - anthropic-api
    - openai-api
    - github-api

  # ═══════════════════════════════════════════════════════════════════════════
  # DOCUMENTATION
  # ═══════════════════════════════════════════════════════════════════════════
  documentation:
    readme: ./README.md
    api_spec: ./openapi.yaml
    architecture: ./docs/architecture.md
    runbook: ./docs/runbook.md
    adr: ./docs/adr/

  # ═══════════════════════════════════════════════════════════════════════════
  # SLOs
  # ═══════════════════════════════════════════════════════════════════════════
  slos:
    - name: availability
      target: 99.9%
      window: 30d
    - name: latency_p95
      target: 500ms
      window: 30d
    - name: error_rate
      target: 0.1%
      window: 30d

  # ═══════════════════════════════════════════════════════════════════════════
  # HEALTH CHECKS
  # ═══════════════════════════════════════════════════════════════════════════
  health:
    endpoint: /health
    ready_endpoint: /health/ready
    deep_endpoint: /health/deep
    interval: 30s
```

### API Definition

```yaml
# catalog-info.yaml for API definition
apiVersion: gwi.dev/v1
kind: API
metadata:
  name: gwi-api-v1
  title: "GWI REST API v1"
  description: "REST API for Git With Intent operations"
  tags:
    - rest
    - openapi

spec:
  type: openapi
  lifecycle: production
  owner: team:backend

  definition:
    $text: ./openapi.yaml

  # Versioning
  version: 1.0.0
  deprecation_date: null

  # Documentation
  documentation:
    - title: "API Reference"
      url: "https://docs.gwi.dev/api"
    - title: "Authentication Guide"
      url: "https://docs.gwi.dev/api/auth"
```

### Resource Definition

```yaml
# catalog-info.yaml for infrastructure resource
apiVersion: gwi.dev/v1
kind: Resource
metadata:
  name: firestore-main
  title: "Main Firestore Database"
  description: "Primary Firestore database for GWI"

spec:
  type: database
  owner: team:platform
  system: gwi-platform

  infrastructure:
    provider: gcp
    service: firestore
    project: git-with-intent
    database: "(default)"
    location: nam5

  links:
    - title: "Firestore Console"
      url: "https://console.cloud.google.com/firestore"
      type: console
```

---

## Catalog API

### Service Endpoints

```typescript
// GET /api/v1/catalog/services
interface ListServicesResponse {
  services: ServiceSummary[];
  total: number;
  page: number;
  page_size: number;
}

interface ServiceSummary {
  name: string;
  title: string;
  description: string;
  owner: string;
  lifecycle: string;
  type: string;
  health_status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  tags: string[];
}

// GET /api/v1/catalog/services/:name
interface ServiceDetail extends ServiceSummary {
  spec: ServiceSpec;
  dependencies: Dependency[];
  dependents: Dependent[];
  health: HealthCheck;
  metrics: ServiceMetrics;
}

// GET /api/v1/catalog/services/:name/dependencies
interface DependencyGraph {
  service: string;
  dependencies: {
    name: string;
    type: 'component' | 'api' | 'resource';
    health_status: string;
  }[];
  dependents: {
    name: string;
    type: string;
  }[];
}

// GET /api/v1/catalog/search
interface SearchRequest {
  query: string;
  type?: string[];
  owner?: string[];
  lifecycle?: string[];
  tags?: string[];
}
```

### Catalog Sync

```typescript
// packages/core/src/catalog/sync.ts

class CatalogSync {
  async syncFromGitHub(): Promise<SyncResult> {
    const repos = await this.github.listOrgRepos();
    const services: ServiceDefinition[] = [];

    for (const repo of repos) {
      const catalogInfo = await this.github.getFile(repo, 'catalog-info.yaml');
      if (catalogInfo) {
        const parsed = yaml.parse(catalogInfo);
        services.push(this.validateAndTransform(parsed));
      }
    }

    await this.store.upsertServices(services);

    return {
      synced: services.length,
      errors: this.errors,
      timestamp: new Date(),
    };
  }

  async syncFromCloudRun(): Promise<void> {
    const services = await this.cloudRun.listServices();

    for (const service of services) {
      const catalogEntry = await this.store.getService(service.name);
      if (catalogEntry) {
        // Update health and metrics
        await this.store.updateServiceHealth(service.name, {
          status: service.status,
          lastChecked: new Date(),
          url: service.url,
        });
      }
    }
  }
}
```

---

## Service Dashboard

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ SERVICE CATALOG                                                               ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Search: [________________] [🔍]    Filter: [All Types ▼] [All Teams ▼]       ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║ ┌─────────────────────────────────────────────────────────────────────────┐  ║
║ │ gwi-api                                                    [●] Healthy  │  ║
║ │ Main REST API for Git With Intent                                       │  ║
║ │ Owner: backend │ Type: service │ Lifecycle: production                  │  ║
║ │ Tags: api, backend, production                                          │  ║
║ │ [Docs] [Logs] [Metrics] [Runbook]                                       │  ║
║ └─────────────────────────────────────────────────────────────────────────┘  ║
║                                                                               ║
║ ┌─────────────────────────────────────────────────────────────────────────┐  ║
║ │ gwi-gateway                                                [●] Healthy  │  ║
║ │ A2A Gateway for agent-to-agent communication                            │  ║
║ │ Owner: backend │ Type: service │ Lifecycle: production                  │  ║
║ │ Tags: gateway, a2a, agents                                              │  ║
║ │ [Docs] [Logs] [Metrics] [Runbook]                                       │  ║
║ └─────────────────────────────────────────────────────────────────────────┘  ║
║                                                                               ║
║ ┌─────────────────────────────────────────────────────────────────────────┐  ║
║ │ gwi-worker                                                 [◐] Degraded │  ║
║ │ Background job processor for async operations                           │  ║
║ │ Owner: backend │ Type: service │ Lifecycle: production                  │  ║
║ │ Tags: worker, async, pubsub                                             │  ║
║ │ [Docs] [Logs] [Metrics] [Runbook] [⚠ View Issues]                       │  ║
║ └─────────────────────────────────────────────────────────────────────────┘  ║
║                                                                               ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Showing 3 of 12 services                          [< Prev] [1] [2] [Next >]  ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## Service Detail View

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ gwi-api                                                                       ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Main REST API for Git With Intent                                             ║
║                                                                               ║
║ Status: [●] Healthy                     Lifecycle: production                 ║
║ Owner: team:backend                     System: gwi-platform                  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ QUICK LINKS                                                                   ║
║   [📄 Docs] [📊 Metrics] [📝 Logs] [🔧 Runbook] [📋 API Spec]                 ║
║   [☁️ Cloud Run] [📞 PagerDuty] [💬 Slack: #gwi-backend]                      ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ CONTACTS                                                                      ║
║   On-Call: backend-primary (PagerDuty)                                        ║
║   Slack: #gwi-backend                                                         ║
║   Email: backend@company.com                                                  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ SLOs (30-day window)                                                          ║
║   Availability:  99.94%  [██████████████████░░] Target: 99.9%  ✓             ║
║   Latency P95:   342ms   [████████████████░░░░] Target: 500ms  ✓             ║
║   Error Rate:    0.08%   [██░░░░░░░░░░░░░░░░░░] Target: 0.1%   ✓             ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ DEPENDENCIES                           │  DEPENDENTS                          ║
║   → gwi-core (component)    [●]        │  ← gwi-web (service)       [●]      ║
║   → gwi-agents (component)  [●]        │  ← gwi-cli (service)       [●]      ║
║   → firestore-main (db)     [●]        │  ← gwi-webhook (service)   [●]      ║
║   → pubsub-runs (queue)     [●]        │                                     ║
║   → anthropic-api (api)     [●]        │                                     ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ RECENT DEPLOYMENTS                                                            ║
║   v1.2.3  2026-02-03 10:15  [●] Healthy   "feat: add batch endpoint"         ║
║   v1.2.2  2026-02-01 14:30  [●] Healthy   "fix: memory leak in handler"      ║
║   v1.2.1  2026-01-28 09:00  [●] Healthy   "chore: bump dependencies"         ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ RECENT INCIDENTS                                                              ║
║   (none in last 30 days)                                                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## Dependency Graph

```
                    ┌─────────────┐
                    │   gwi-web   │
                    │  (service)  │
                    └──────┬──────┘
                           │
                           ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  gwi-cli    │────▶│   gwi-api   │◀────│ gwi-webhook │
│  (service)  │     │  (service)  │     │  (service)  │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │  gwi-core   │  │ gwi-agents  │  │ gwi-engine  │
   │ (component) │  │ (component) │  │ (component) │
   └──────┬──────┘  └──────┬──────┘  └─────────────┘
          │                │
          ▼                ▼
   ┌─────────────┐  ┌─────────────┐
   │  firestore  │  │anthropic   │
   │ (resource)  │  │   (api)    │
   └─────────────┘  └─────────────┘
```

---

## CLI Commands

```bash
# List all services
gwi catalog list

# Search services
gwi catalog search "api"

# Get service details
gwi catalog get gwi-api

# Show dependency graph
gwi catalog deps gwi-api

# Check service health
gwi catalog health gwi-api

# Sync catalog from GitHub
gwi catalog sync

# Validate catalog-info.yaml
gwi catalog validate ./catalog-info.yaml

# Generate catalog-info.yaml template
gwi catalog init
```

---

## Integration Points

### GitHub Integration

```typescript
// Sync service metadata from repositories
interface GitHubCatalogSync {
  // Watch for catalog-info.yaml changes
  webhookEvents: ['push', 'pull_request'];

  // Paths to watch
  paths: ['catalog-info.yaml', '.github/catalog-info.yaml'];

  // Auto-create PR for missing catalog-info.yaml
  autoCreateTemplate: boolean;
}
```

### Cloud Run Integration

```typescript
// Sync service health from Cloud Run
interface CloudRunCatalogSync {
  // Poll interval for health status
  pollInterval: '30s';

  // Fields to sync
  fields: ['status', 'url', 'revision', 'traffic'];

  // Auto-update service URLs
  autoUpdateUrls: boolean;
}
```

### PagerDuty Integration

```typescript
// Sync oncall schedules
interface PagerDutyCatalogSync {
  // Map service to PagerDuty service
  serviceMapping: Map<string, string>;

  // Include oncall in service contacts
  includeOncall: boolean;

  // Link to escalation policies
  includeEscalationPolicy: boolean;
}
```

---

## Related Documentation

- [227-DR-TMPL-catalog-info.md](./227-DR-TMPL-catalog-info.md)
- [217-DR-SPEC-devex-dashboard.md](./217-DR-SPEC-devex-dashboard.md)
