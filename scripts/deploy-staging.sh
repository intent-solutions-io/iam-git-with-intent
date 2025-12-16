#!/bin/bash
# Git With Intent - Staging Deployment Script
#
# Deploys API and Webhook services to Cloud Run staging environment.
# Also deploys Firestore rules and indexes.
#
# Prerequisites:
#   - gcloud CLI authenticated
#   - GCP_PROJECT_ID environment variable set
#   - Artifact Registry repository created
#
# Usage:
#   ./scripts/deploy-staging.sh
#   ./scripts/deploy-staging.sh --skip-build
#   ./scripts/deploy-staging.sh --service=api
#   ./scripts/deploy-staging.sh --service=webhook

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-us-central1}"
ARTIFACT_REGISTRY="${GCP_ARTIFACT_REGISTRY:-gcr.io}"

# Service configurations
API_SERVICE="staging-gwi-api"
API_IMAGE="${ARTIFACT_REGISTRY}/${PROJECT_ID}/${API_SERVICE}"
API_PORT=8080
API_MEMORY="512Mi"
API_CPU="1"
API_MIN_INSTANCES=0
API_MAX_INSTANCES=3

WEBHOOK_SERVICE="staging-gwi-webhook"
WEBHOOK_IMAGE="${ARTIFACT_REGISTRY}/${PROJECT_ID}/${WEBHOOK_SERVICE}"
WEBHOOK_PORT=8080
WEBHOOK_MEMORY="256Mi"
WEBHOOK_CPU="1"
WEBHOOK_MIN_INSTANCES=0
WEBHOOK_MAX_INSTANCES=10

# Parse arguments
SKIP_BUILD=false
DEPLOY_SERVICE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --service=*)
      DEPLOY_SERVICE="${1#*=}"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# =============================================================================
# Validation
# =============================================================================

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: GCP_PROJECT_ID environment variable is required"
  exit 1
fi

echo "==========================================="
echo "Git With Intent - Staging Deployment"
echo "==========================================="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Skip Build: $SKIP_BUILD"
echo "Service Filter: ${DEPLOY_SERVICE:-all}"
echo ""

# =============================================================================
# Build Functions
# =============================================================================

build_api() {
  echo "Building API service..."
  docker build \
    -f apps/api/Dockerfile \
    -t "${API_IMAGE}:latest" \
    -t "${API_IMAGE}:$(git rev-parse --short HEAD)" \
    .

  echo "Pushing API image..."
  docker push "${API_IMAGE}:latest"
  docker push "${API_IMAGE}:$(git rev-parse --short HEAD)"
}

build_webhook() {
  echo "Building Webhook service..."
  docker build \
    -f apps/github-webhook/Dockerfile \
    -t "${WEBHOOK_IMAGE}:latest" \
    -t "${WEBHOOK_IMAGE}:$(git rev-parse --short HEAD)" \
    .

  echo "Pushing Webhook image..."
  docker push "${WEBHOOK_IMAGE}:latest"
  docker push "${WEBHOOK_IMAGE}:$(git rev-parse --short HEAD)"
}

# =============================================================================
# Deploy Functions
# =============================================================================

deploy_api() {
  echo "Deploying API service to Cloud Run..."
  gcloud run deploy "${API_SERVICE}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --image="${API_IMAGE}:latest" \
    --platform=managed \
    --port="${API_PORT}" \
    --memory="${API_MEMORY}" \
    --cpu="${API_CPU}" \
    --min-instances="${API_MIN_INSTANCES}" \
    --max-instances="${API_MAX_INSTANCES}" \
    --allow-unauthenticated \
    --set-env-vars="NODE_ENV=staging,GCP_PROJECT_ID=${PROJECT_ID}" \
    --service-account="gwi-api@${PROJECT_ID}.iam.gserviceaccount.com"

  API_URL=$(gcloud run services describe "${API_SERVICE}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --format='value(status.url)')

  echo "API deployed at: ${API_URL}"
}

deploy_webhook() {
  echo "Deploying Webhook service to Cloud Run..."
  gcloud run deploy "${WEBHOOK_SERVICE}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --image="${WEBHOOK_IMAGE}:latest" \
    --platform=managed \
    --port="${WEBHOOK_PORT}" \
    --memory="${WEBHOOK_MEMORY}" \
    --cpu="${WEBHOOK_CPU}" \
    --min-instances="${WEBHOOK_MIN_INSTANCES}" \
    --max-instances="${WEBHOOK_MAX_INSTANCES}" \
    --allow-unauthenticated \
    --set-env-vars="NODE_ENV=staging,GCP_PROJECT_ID=${PROJECT_ID}" \
    --service-account="gwi-webhook@${PROJECT_ID}.iam.gserviceaccount.com"

  WEBHOOK_URL=$(gcloud run services describe "${WEBHOOK_SERVICE}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --format='value(status.url)')

  echo "Webhook deployed at: ${WEBHOOK_URL}"
}

deploy_firestore() {
  echo "Deploying Firestore rules..."
  firebase deploy --only firestore:rules --project="${PROJECT_ID}"

  echo "Deploying Firestore indexes..."
  firebase deploy --only firestore:indexes --project="${PROJECT_ID}"
}

# =============================================================================
# Main
# =============================================================================

cd "$(dirname "$0")/.."

# Build phase
if [[ "$SKIP_BUILD" != "true" ]]; then
  if [[ -z "$DEPLOY_SERVICE" ]] || [[ "$DEPLOY_SERVICE" == "api" ]]; then
    build_api
  fi
  if [[ -z "$DEPLOY_SERVICE" ]] || [[ "$DEPLOY_SERVICE" == "webhook" ]]; then
    build_webhook
  fi
fi

# Deploy phase
if [[ -z "$DEPLOY_SERVICE" ]] || [[ "$DEPLOY_SERVICE" == "api" ]]; then
  deploy_api
fi

if [[ -z "$DEPLOY_SERVICE" ]] || [[ "$DEPLOY_SERVICE" == "webhook" ]]; then
  deploy_webhook
fi

if [[ -z "$DEPLOY_SERVICE" ]] || [[ "$DEPLOY_SERVICE" == "firestore" ]]; then
  deploy_firestore
fi

echo ""
echo "==========================================="
echo "Deployment Complete!"
echo "==========================================="
echo ""
echo "Next steps:"
echo "  1. Run smoke tests: npx tsx scripts/cloud-smoke-test.ts --env=staging"
echo "  2. Configure GitHub App webhook URL: ${WEBHOOK_URL:-<webhook-url>}/webhook"
echo "  3. Test installation flow in staging environment"
echo ""
