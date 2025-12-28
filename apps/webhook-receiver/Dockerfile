# Git With Intent - Multi-Source Webhook Receiver
# Epic B: Data Ingestion & Connector Framework
# Task B3.4: Add webhook receiver service
#
# Production-ready Docker image for Cloud Run deployment.
# Optimized for fast startup and small image size.

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace configuration
COPY package*.json ./
COPY turbo.json ./

# Copy package files for dependency resolution
COPY packages/core/package.json ./packages/core/
COPY apps/webhook-receiver/package.json ./apps/webhook-receiver/

# Install dependencies
RUN npm ci --workspace=@gwi/webhook-receiver --include-workspace-root

# Copy source code
COPY packages/core/ ./packages/core/
COPY apps/webhook-receiver/ ./apps/webhook-receiver/

# Build the application
RUN npm run build --workspace=@gwi/core
RUN npm run build --workspace=@gwi/webhook-receiver

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/apps/webhook-receiver/package.json ./apps/webhook-receiver/

# Install production dependencies only
RUN npm ci --workspace=@gwi/webhook-receiver --include-workspace-root --omit=dev

# Copy built application
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/apps/webhook-receiver/dist ./apps/webhook-receiver/dist

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Cloud Run sets PORT environment variable
ENV PORT=8080
ENV NODE_ENV=production

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start the application
CMD ["node", "apps/webhook-receiver/dist/index.js"]
