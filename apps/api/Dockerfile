# Git With Intent - API Server
# Multi-tenant REST API for the GWI SaaS platform

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json ./
COPY package-lock.json ./

# Copy workspace package files
COPY packages/core/package.json ./packages/core/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN npm ci --workspace=@gwi/core --workspace=@gwi/api

# Copy source files
COPY packages/core ./packages/core
COPY apps/api ./apps/api
COPY tsconfig.base.json ./

# Build core first, then api
RUN npm run build --workspace=@gwi/core
RUN npm run build --workspace=@gwi/api

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 api

# Copy built files
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Set ownership
RUN chown -R api:nodejs /app

# Switch to non-root user
USER api

# Environment
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start from api workspace
WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
