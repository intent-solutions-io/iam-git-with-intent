# Git With Intent CLI - Docker Image
#
# Provides isolated, sandboxed execution environment for the CLI.
# Optional deployment method for users who want extra security.
#
# Build:
#   docker build -t gwi-cli -f apps/cli/Dockerfile .
#
# Run:
#   docker run -it --rm \
#     -e ANTHROPIC_API_KEY="your-key" \
#     -e GITHUB_TOKEN="your-token" \
#     -v $(pwd):/workspace \
#     gwi-cli triage https://github.com/owner/repo/pull/123

FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY turbo.json ./
COPY apps/cli/package*.json ./apps/cli/
COPY packages/*/package*.json ./packages/

# Install dependencies
RUN npm ci --include=dev

# Copy source code
COPY apps/cli ./apps/cli
COPY packages ./packages

# Build
RUN npm run build --workspace=apps/cli

# Production stage
FROM node:20-alpine

# Security: Run as non-root user
RUN addgroup -g 1001 -S gwi && \
    adduser -u 1001 -S gwi -G gwi

# Install git (required for CLI operations)
RUN apk add --no-cache git

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/apps/cli/dist ./dist
COPY --from=builder /app/apps/cli/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy packages (needed for runtime)
COPY --from=builder /app/packages ./packages

# Set user
USER gwi

# Set working directory for user operations
WORKDIR /workspace

# Entry point
ENTRYPOINT ["node", "/app/dist/index.js"]

# Default command (show help)
CMD ["--help"]
