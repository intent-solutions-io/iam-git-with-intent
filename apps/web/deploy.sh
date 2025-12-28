#!/bin/bash
# Deploy web app to Firebase Hosting
# Usage: ./deploy.sh [staging|production]

set -e

ENV="${1:-staging}"
echo "Deploying web app to $ENV..."

# Build the app
echo "Building web app..."
npm run build

# Deploy based on environment
if [ "$ENV" = "production" ]; then
  echo "Deploying to production Firebase Hosting..."
  firebase deploy --only hosting --project production
elif [ "$ENV" = "staging" ]; then
  echo "Deploying to staging Firebase Hosting..."
  firebase deploy --only hosting --project default
else
  echo "Unknown environment: $ENV"
  echo "Usage: ./deploy.sh [staging|production]"
  exit 1
fi

echo "Deployment complete!"
echo "Visit your site at the URL shown above."
