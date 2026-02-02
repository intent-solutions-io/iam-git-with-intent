# GWI MCP Server - Cloud Run Deployment
#
# Hard Mode R3: Gateway Separation
# This is a REST proxy only - does NOT run agent Runners locally

FROM node:20-slim AS base
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/
COPY apps/mcp-server/package.json ./apps/mcp-server/
RUN npm ci --workspace=@gwi/mcp-server

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/apps/mcp-server/node_modules ./apps/mcp-server/node_modules
COPY . .
RUN npm run build --workspace=@gwi/core
RUN npm run build --workspace=@gwi/mcp-server

# Production image
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8080

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono
USER hono

# Copy built application
COPY --from=builder --chown=hono:nodejs /app/apps/mcp-server/dist ./dist
COPY --from=builder --chown=hono:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=hono:nodejs /app/packages/core/dist ./packages/core/dist

EXPOSE 8080
CMD ["node", "dist/index.js"]
