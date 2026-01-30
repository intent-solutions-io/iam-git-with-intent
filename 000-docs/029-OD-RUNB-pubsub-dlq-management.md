# Pub/Sub DLQ Management Runbook

> **Document ID**: 029-OD-RUNB-pubsub-dlq-management
> **Category**: Operations & Deployment
> **Type**: Runbook
> **Epic**: B4 - Pub/Sub Queue and DLQ Semantics

## Overview

This runbook covers operational procedures for managing Pub/Sub queues and Dead Letter Queues (DLQs) in the Git With Intent platform.

---

## Architecture

### Queue Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PRODUCER                                    │
│  (API, Webhook Receiver, Gateway)                                   │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TOPICS                                                             │
│  ├── gwi-worker-jobs-{env}          Main worker job topic           │
│  ├── gwi-run-lifecycle-{env}        Run state transitions           │
│  ├── gwi-github-webhooks-{env}      GitHub webhook events           │
│  ├── gwi-gitlab-webhooks-{env}      GitLab webhook events           │
│  ├── gwi-linear-webhooks-{env}      Linear webhook events           │
│  └── gwi-slack-webhooks-{env}       Slack webhook events            │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SUBSCRIPTIONS (with retry policy)                                  │
│  ├── Retry Policy: 10s → 600s exponential backoff                   │
│  ├── Max Delivery Attempts: 5                                       │
│  └── Ack Deadline: 60s                                              │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
            ┌─────────┴─────────┐
            │                   │
            ▼                   ▼
┌─────────────────┐   ┌──────────────────────────────────────────────┐
│  WORKER         │   │  DEAD LETTER QUEUES                          │
│  (Cloud Run)    │   │  ├── gwi-worker-jobs-dlq-{env}               │
│                 │   │  ├── gwi-run-lifecycle-dlq-{env}             │
│  Success → ACK  │   │  └── gwi-webhooks-dlq-{env}                  │
│  Failure → NACK │   │                                              │
└─────────────────┘   │  Retention: 14 days                          │
                      │  Purpose: Investigation & Replay              │
                      └──────────────────────────────────────────────┘
```

### Error Classification

| Classification | Retry Behavior | Examples |
|----------------|----------------|----------|
| **Transient** | Retry with backoff | Timeout, connection refused, rate limit |
| **Permanent** | Route to DLQ immediately | Invalid schema, unauthorized, not found |
| **Poison** | Route to DLQ after max attempts | Any error after 5 attempts |

---

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `pubsub/subscription/num_undelivered_messages` | Backlog size | > 1000 |
| `pubsub/subscription/oldest_unacked_message_age` | Oldest message | > 1 hour |
| `pubsub/topic/num_delivered_messages` | Throughput | Sudden drop |
| `pubsub/subscription/dead_letter_message_count` | DLQ routing | > 10/hour |

### Dashboard Queries

```bash
# View DLQ message count
gcloud pubsub subscriptions describe gwi-worker-jobs-dlq-sub-prod \
  --format='value(numMessages)'

# View main queue backlog
gcloud pubsub subscriptions describe gwi-worker-jobs-sub-prod \
  --format='value(numMessages)'

# Check oldest message age
gcloud monitoring read \
  "pubsub.googleapis.com/subscription/oldest_unacked_message_age" \
  --filter="resource.labels.subscription_id=gwi-worker-jobs-sub-prod"
```

---

## Procedures

### 1. Investigate DLQ Messages

**When**: Alert fires for DLQ routing or manual investigation.

```bash
# Step 1: Pull messages without acking (peek)
gcloud pubsub subscriptions pull gwi-worker-jobs-dlq-sub-prod \
  --limit=10 \
  --format=json \
  | jq '.[].message.data' \
  | xargs -I {} echo {} | base64 -d

# Step 2: Check message attributes for context
gcloud pubsub subscriptions pull gwi-worker-jobs-dlq-sub-prod \
  --limit=1 \
  --format='json(message.attributes)'

# Step 3: Correlate with logs
gcloud logging read \
  'resource.type="cloud_run_revision" AND
   jsonPayload.jobId="<job-id-from-message>"' \
  --limit=50 \
  --format=json
```

### 2. Replay DLQ Messages

**When**: After fixing the underlying issue.

```bash
# Step 1: Create replay topic (one-time setup)
gcloud pubsub topics create gwi-worker-jobs-replay-temp

# Step 2: Export DLQ messages to replay topic
# (Use Cloud Functions or manual script)

# Step 3: Resubscribe worker to replay topic
# OR publish messages back to main topic

# Step 4: Verify processing
gcloud pubsub subscriptions pull gwi-worker-jobs-dlq-sub-prod \
  --limit=1 \
  --auto-ack  # Only after confirming success
```

### 3. Clear DLQ (Poison Messages)

**When**: Messages are confirmed unprocessable (e.g., test data, known bugs).

```bash
# Option A: Ack all messages (clear queue)
gcloud pubsub subscriptions seek gwi-worker-jobs-dlq-sub-prod \
  --time=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Option B: Pull and ack individually
gcloud pubsub subscriptions pull gwi-worker-jobs-dlq-sub-prod \
  --limit=100 \
  --auto-ack

# Option C: Delete and recreate subscription (nuclear option)
gcloud pubsub subscriptions delete gwi-worker-jobs-dlq-sub-prod
gcloud pubsub subscriptions create gwi-worker-jobs-dlq-sub-prod \
  --topic=gwi-worker-jobs-dlq-prod \
  --ack-deadline=600 \
  --message-retention-duration=14d
```

### 4. Handle Backlog Buildup

**When**: Main queue backlog exceeds threshold.

```bash
# Step 1: Check worker health
gcloud run services describe gwi-worker-prod \
  --region=us-central1 \
  --format='value(status.conditions[0].message)'

# Step 2: Check recent errors
gcloud logging read \
  'resource.type="cloud_run_revision" AND
   severity>=ERROR AND
   resource.labels.service_name="gwi-worker-prod"' \
  --limit=20

# Step 3: Scale workers if needed
gcloud run services update gwi-worker-prod \
  --region=us-central1 \
  --max-instances=10

# Step 4: Monitor drain
watch -n 30 'gcloud pubsub subscriptions describe gwi-worker-jobs-sub-prod \
  --format="value(numMessages)"'
```

### 5. Emergency: Pause Processing

**When**: Critical bug causing data corruption or cascading failures.

```bash
# Option A: Detach subscription (messages accumulate)
# Not directly supported - use Option B

# Option B: Scale workers to zero
gcloud run services update gwi-worker-prod \
  --region=us-central1 \
  --max-instances=0

# Option C: Seek subscription forward (skip messages)
gcloud pubsub subscriptions seek gwi-worker-jobs-sub-prod \
  --time=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Resume after fix
gcloud run services update gwi-worker-prod \
  --region=us-central1 \
  --max-instances=5
```

---

## Configuration Reference

### Subscription Settings

| Setting | Main Queue | DLQ |
|---------|------------|-----|
| Ack Deadline | 60s | 600s |
| Message Retention | 7 days | 14 days |
| Min Backoff | 10s | N/A |
| Max Backoff | 600s | N/A |
| Max Delivery Attempts | 5 | N/A |
| Message Ordering | Enabled | Disabled |

### Topic Settings

| Setting | Main Topics | DLQ Topics |
|---------|-------------|------------|
| Message Retention | 7 days | 14 days |
| Schema Validation | None | None |
| Encryption | Google-managed | Google-managed |

---

## Troubleshooting

### Common Issues

#### Messages Stuck in Queue

**Symptoms**: Backlog growing, messages not being processed.

**Causes**:
1. Worker crashed/not running
2. Worker returning errors for all messages
3. Ack deadline too short for processing time

**Resolution**:
```bash
# Check worker status
gcloud run services describe gwi-worker-prod --region=us-central1

# Check recent logs
gcloud logging read 'resource.labels.service_name="gwi-worker-prod"' --limit=50

# Increase ack deadline if needed
gcloud pubsub subscriptions update gwi-worker-jobs-sub-prod \
  --ack-deadline=120
```

#### High DLQ Rate

**Symptoms**: >10% of messages routing to DLQ.

**Causes**:
1. Bug in message processing
2. External dependency down
3. Invalid message format from producer

**Resolution**:
```bash
# Sample DLQ messages to find pattern
gcloud pubsub subscriptions pull gwi-worker-jobs-dlq-sub-prod \
  --limit=5 \
  --format=json | jq '.[] | {
    jobId: .message.attributes.jobId,
    type: .message.attributes.type,
    publishTime: .message.publishTime
  }'

# Check for common error patterns in logs
gcloud logging read \
  'severity=ERROR AND jsonPayload.component="dlq-handler"' \
  --limit=50
```

#### Message Ordering Issues

**Symptoms**: Run steps executing out of order.

**Causes**:
1. Message ordering not enabled on subscription
2. Missing ordering key in published messages
3. Multiple consumers with same ordering key

**Resolution**:
```bash
# Verify ordering enabled
gcloud pubsub subscriptions describe gwi-worker-jobs-sub-prod \
  --format='value(enableMessageOrdering)'

# Check message attributes for ordering key
gcloud pubsub subscriptions pull gwi-worker-jobs-sub-prod \
  --limit=1 \
  --format='json(message.orderingKey)'
```

---

## Appendix

### gcloud Commands Reference

```bash
# List all subscriptions
gcloud pubsub subscriptions list --filter="name:gwi-"

# List all topics
gcloud pubsub topics list --filter="name:gwi-"

# Get subscription metrics
gcloud pubsub subscriptions describe SUBSCRIPTION_NAME \
  --format='json(ackDeadlineSeconds,messageRetentionDuration,retryPolicy)'

# Modify ack deadline
gcloud pubsub subscriptions modify-ack-deadline SUBSCRIPTION_NAME \
  --ack-ids=ACK_ID \
  --ack-deadline=NEW_DEADLINE

# Seek to timestamp (skip old messages)
gcloud pubsub subscriptions seek SUBSCRIPTION_NAME \
  --time=TIMESTAMP

# Seek to snapshot (replay from point)
gcloud pubsub subscriptions seek SUBSCRIPTION_NAME \
  --snapshot=SNAPSHOT_NAME
```

### Alerting Rules

```yaml
# monitoring/pubsub-alerts.yaml
alerts:
  - name: DLQ High Rate
    condition: rate(pubsub_subscription_dead_letter_message_count) > 10
    duration: 5m
    severity: warning

  - name: Backlog Critical
    condition: pubsub_subscription_num_undelivered_messages > 10000
    duration: 10m
    severity: critical

  - name: Message Age Warning
    condition: pubsub_subscription_oldest_unacked_message_age > 3600
    duration: 5m
    severity: warning
```

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-29 | Claude | Initial B4 implementation |
