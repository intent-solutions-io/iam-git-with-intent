# catalog-info.yaml Template

> **Document**: 227-DR-TMPL-catalog-info
> **Epic**: EPIC 017 - Service Catalog
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Place a `catalog-info.yaml` file in the root of each repository to register it with the service catalog. This template covers all supported entity types.

---

## Service Template

```yaml
# catalog-info.yaml - Place in repository root
apiVersion: gwi.dev/v1
kind: Service
metadata:
  # REQUIRED: Unique service identifier (lowercase, hyphens)
  name: my-service

  # REQUIRED: Human-readable title
  title: "My Service"

  # REQUIRED: Brief description (one sentence)
  description: "A brief description of what this service does"

  # OPTIONAL: Tags for filtering and search
  tags:
    - backend
    - api
    - production

  # OPTIONAL: Annotations for integrations
  annotations:
    # PagerDuty service ID
    pagerduty.com/service-id: "PXXXXXX"
    # Datadog dashboard
    datadoghq.com/dashboard: "abc-123-def"
    # GitHub repo (auto-detected if in GitHub)
    github.com/project-slug: "org/repo"

spec:
  # ═══════════════════════════════════════════════════════════════════════════
  # OWNERSHIP (REQUIRED)
  # ═══════════════════════════════════════════════════════════════════════════

  # Team that owns this service
  # Format: team:<team-name> or user:<username>
  owner: team:backend

  # Service lifecycle stage
  # Values: experimental | development | production | deprecated
  lifecycle: production

  # ═══════════════════════════════════════════════════════════════════════════
  # CONTACTS (RECOMMENDED)
  # ═══════════════════════════════════════════════════════════════════════════

  contacts:
    # On-call contact (PagerDuty, OpsGenie, etc.)
    oncall:
      type: pagerduty
      target: "backend-primary"

    # Team Slack channel
    slack:
      type: slack
      target: "#my-service"

    # Team email
    email:
      type: email
      target: "team@company.com"

  # ═══════════════════════════════════════════════════════════════════════════
  # SYSTEM & TYPE (RECOMMENDED)
  # ═══════════════════════════════════════════════════════════════════════════

  # Parent system this service belongs to
  system: my-platform

  # Service type
  # Values: service | library | website | resource | documentation
  type: service

  # ═══════════════════════════════════════════════════════════════════════════
  # INFRASTRUCTURE (OPTIONAL)
  # ═══════════════════════════════════════════════════════════════════════════

  infrastructure:
    # Runtime platform
    runtime: cloud-run  # cloud-run | kubernetes | lambda | ec2 | other

    # Deployment region
    region: us-central1

    # GCP project (if applicable)
    project: my-gcp-project

    # Service name in platform
    service_name: my-service

  # ═══════════════════════════════════════════════════════════════════════════
  # LINKS (RECOMMENDED)
  # ═══════════════════════════════════════════════════════════════════════════

  links:
    # Cloud console
    - title: "Cloud Console"
      url: "https://console.cloud.google.com/run/detail/us-central1/my-service"
      type: console
      icon: cloud

    # Logs
    - title: "Logs"
      url: "https://console.cloud.google.com/logs?query=service=my-service"
      type: logs
      icon: list

    # Metrics dashboard
    - title: "Metrics"
      url: "https://grafana.company.com/d/my-service"
      type: dashboard
      icon: chart

    # Runbook
    - title: "Runbook"
      url: "./docs/runbook.md"
      type: runbook
      icon: book

    # Source code
    - title: "Repository"
      url: "https://github.com/org/my-service"
      type: repository
      icon: code

  # ═══════════════════════════════════════════════════════════════════════════
  # DEPENDENCIES (RECOMMENDED)
  # ═══════════════════════════════════════════════════════════════════════════

  # Components/services this depends on
  dependsOn:
    - component:shared-lib
    - resource:postgres-main
    - resource:redis-cache

  # APIs this service provides
  providesApis:
    - my-service-api-v1

  # External APIs this service consumes
  consumesApis:
    - stripe-api
    - sendgrid-api

  # ═══════════════════════════════════════════════════════════════════════════
  # DOCUMENTATION (OPTIONAL)
  # ═══════════════════════════════════════════════════════════════════════════

  documentation:
    readme: ./README.md
    api_spec: ./openapi.yaml
    architecture: ./docs/architecture.md
    runbook: ./docs/runbook.md
    adr: ./docs/adr/

  # ═══════════════════════════════════════════════════════════════════════════
  # SLOs (OPTIONAL)
  # ═══════════════════════════════════════════════════════════════════════════

  slos:
    - name: availability
      target: 99.9%
      window: 30d
      description: "Service availability target"

    - name: latency_p95
      target: 500ms
      window: 30d
      description: "95th percentile latency"

    - name: error_rate
      target: 0.1%
      window: 30d
      description: "Error rate threshold"

  # ═══════════════════════════════════════════════════════════════════════════
  # HEALTH CHECKS (OPTIONAL)
  # ═══════════════════════════════════════════════════════════════════════════

  health:
    # Basic health endpoint
    endpoint: /health

    # Readiness probe
    ready_endpoint: /health/ready

    # Deep health check (dependencies)
    deep_endpoint: /health/deep

    # Check interval
    interval: 30s
```

---

## API Template

```yaml
apiVersion: gwi.dev/v1
kind: API
metadata:
  name: my-api-v1
  title: "My API v1"
  description: "REST API for my service"
  tags:
    - rest
    - openapi
    - v1

spec:
  # API type: openapi | asyncapi | graphql | grpc
  type: openapi

  # Owner team
  owner: team:backend

  # Lifecycle stage
  lifecycle: production

  # API definition file (relative path or URL)
  definition:
    $text: ./openapi.yaml

  # API version
  version: 1.0.0

  # Deprecation date (if deprecated)
  deprecation_date: null  # e.g., "2027-01-01"

  # Documentation links
  documentation:
    - title: "API Reference"
      url: "https://docs.company.com/api/my-api"

    - title: "Authentication"
      url: "https://docs.company.com/api/auth"

    - title: "Rate Limits"
      url: "https://docs.company.com/api/rate-limits"
```

---

## Resource Template

```yaml
apiVersion: gwi.dev/v1
kind: Resource
metadata:
  name: postgres-main
  title: "Main PostgreSQL Database"
  description: "Primary database for user data"
  tags:
    - database
    - postgresql
    - production

spec:
  # Resource type: database | storage | queue | cache | other
  type: database

  # Owner team
  owner: team:platform

  # Parent system
  system: my-platform

  # Infrastructure details
  infrastructure:
    provider: gcp  # gcp | aws | azure | self-hosted
    service: cloud-sql
    project: my-gcp-project
    instance: postgres-main
    location: us-central1

  # Resource-specific configuration
  config:
    engine: postgresql
    version: "15"
    tier: db-standard-2
    storage_gb: 100
    high_availability: true

  # Links
  links:
    - title: "Cloud SQL Console"
      url: "https://console.cloud.google.com/sql/instances/postgres-main"
      type: console

    - title: "Connection Guide"
      url: "./docs/database-connection.md"
      type: documentation
```

---

## Component Template

```yaml
apiVersion: gwi.dev/v1
kind: Component
metadata:
  name: shared-lib
  title: "Shared Library"
  description: "Common utilities and types shared across services"
  tags:
    - library
    - typescript
    - shared

spec:
  # Component type: library | module | package
  type: library

  # Owner
  owner: team:platform

  # Parent system
  system: my-platform

  # Package information
  package:
    name: "@company/shared-lib"
    registry: npm
    version: "2.1.0"

  # Provides
  providesApis: []

  # Documentation
  documentation:
    readme: ./README.md
    api_docs: ./docs/api.md
    changelog: ./CHANGELOG.md
```

---

## System Template

```yaml
apiVersion: gwi.dev/v1
kind: System
metadata:
  name: my-platform
  title: "My Platform"
  description: "Complete platform for managing X"
  tags:
    - platform
    - production

spec:
  # Owner
  owner: team:platform

  # Domain this system belongs to
  domain: engineering

  # Child entities (auto-populated from their system field)
  # components: []
  # resources: []
```

---

## Team Template

```yaml
apiVersion: gwi.dev/v1
kind: Team
metadata:
  name: backend
  title: "Backend Team"
  description: "Responsible for API services and data processing"

spec:
  # Team type
  type: engineering

  # Parent team (if any)
  parent: team:engineering

  # Team members
  members:
    - user:alice
    - user:bob
    - user:charlie

  # Contacts
  contacts:
    slack:
      type: slack
      target: "#backend-team"
    email:
      type: email
      target: "backend@company.com"

  # On-call
  oncall:
    schedule: "backend-oncall"
    escalation: "backend-escalation"
```

---

## Validation

### Required Fields

| Entity | Required Fields |
|--------|-----------------|
| Service | `name`, `title`, `description`, `owner`, `lifecycle` |
| API | `name`, `title`, `type`, `owner`, `definition` |
| Resource | `name`, `title`, `type`, `owner` |
| Component | `name`, `title`, `type`, `owner` |
| System | `name`, `title`, `owner` |
| Team | `name`, `title` |

### Naming Conventions

- `name`: lowercase, alphanumeric with hyphens (e.g., `my-service`)
- `owner`: format `team:<name>` or `user:<username>`
- `lifecycle`: one of `experimental`, `development`, `production`, `deprecated`

### CLI Validation

```bash
# Validate catalog-info.yaml
gwi catalog validate ./catalog-info.yaml

# Check all files in repo
gwi catalog validate --recursive

# Generate from template
gwi catalog init --type service
```

---

## Examples

### Minimal Service

```yaml
apiVersion: gwi.dev/v1
kind: Service
metadata:
  name: simple-api
  title: "Simple API"
  description: "A simple REST API"
spec:
  owner: team:backend
  lifecycle: development
```

### Full Production Service

See the complete Service Template above.

### Monorepo with Multiple Services

```yaml
# Root catalog-info.yaml
apiVersion: gwi.dev/v1
kind: System
metadata:
  name: my-monorepo
  title: "My Monorepo"
  description: "Monorepo containing multiple services"
spec:
  owner: team:platform
---
apiVersion: gwi.dev/v1
kind: Service
metadata:
  name: api-service
  title: "API Service"
  description: "Main API"
spec:
  owner: team:backend
  lifecycle: production
  system: my-monorepo
---
apiVersion: gwi.dev/v1
kind: Service
metadata:
  name: worker-service
  title: "Worker Service"
  description: "Background worker"
spec:
  owner: team:backend
  lifecycle: production
  system: my-monorepo
```

---

## Related Documentation

- [226-DR-SPEC-service-catalog.md](./226-DR-SPEC-service-catalog.md)
- [Backstage Software Catalog](https://backstage.io/docs/features/software-catalog/)
