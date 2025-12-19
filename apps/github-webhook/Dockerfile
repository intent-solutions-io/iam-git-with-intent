# Git With Intent - GitHub Webhook Service
# Handles GitHub App webhook events for the GWI SaaS platform
# R3: Cloud Run as gateway only (no agent logic)

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json ./
COPY package-lock.json ./

# Copy workspace package files
COPY packages/core/package.json ./packages/core/
COPY apps/github-webhook/package.json ./apps/github-webhook/

# Install dependencies
RUN npm ci --workspace=@gwi/core --workspace=@gwi/github-webhook

# Copy source files
COPY packages/core ./packages/core
COPY apps/github-webhook ./apps/github-webhook

# Build core first, then webhook
RUN npm run build --workspace=@gwi/core
RUN npm run build --workspace=@gwi/github-webhook

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 webhook

# Copy built files
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/apps/github-webhook/dist ./apps/github-webhook/dist
COPY --from=builder /app/apps/github-webhook/package.json ./apps/github-webhook/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Set ownership
RUN chown -R webhook:nodejs /app

# Switch to non-root user
USER webhook

# Environment
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start from webhook workspace
WORKDIR /app/apps/github-webhook
CMD ["node", "dist/index.js"]
