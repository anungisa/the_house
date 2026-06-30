# The House v2 — container image build contract.
#
# Multi-stage build producing two runtime targets from one source tree:
#
#   docker build --target api    -t the-house-api    .
#   docker build --target worker -t the-house-worker .
#
# Both targets ship production dependencies only and run as a non-root user
# against the compiled output in dist/. No secrets are baked into the image:
# DATABASE_URL, AUTH_MODE, Service Bus, Key Vault, and observability settings
# are supplied at runtime via environment variables / managed identity.
#
# This is a packaging baseline. It performs no deployment by itself.

# ---------------------------------------------------------------------------
# Stage: builder — install all deps and compile TypeScript to dist/.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder
ENV NODE_ENV=development
WORKDIR /app

# Install dependencies against the lockfile first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Compile only src/ -> dist/ (tsconfig.build.json excludes tests and scripts).
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Stage: prod-deps — install production dependencies only.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS prod-deps
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# Stage: runtime-base — shared, minimal, non-root runtime layer.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime-base
ENV NODE_ENV=production
WORKDIR /app

# Production dependencies and compiled output only — no source, tests, or secrets.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Drop privileges: the stock node image ships an unprivileged "node" user.
USER node

# ---------------------------------------------------------------------------
# Stage: api — HTTP AffiliationApplication runtime.
# ---------------------------------------------------------------------------
FROM runtime-base AS api
LABEL org.opencontainers.image.title="the-house-api" \
      org.opencontainers.image.description="The House v2 governed API runtime"
# API_PORT defaults to 3000 (see src/config/index.ts); override at runtime.
EXPOSE 3000
CMD ["node", "dist/src/server/api.js"]

# ---------------------------------------------------------------------------
# Stage: worker — transactional outbox drain runtime (no HTTP ingress).
# ---------------------------------------------------------------------------
FROM runtime-base AS worker
LABEL org.opencontainers.image.title="the-house-worker" \
      org.opencontainers.image.description="The House v2 outbox worker runtime"
CMD ["node", "dist/src/server/worker.js"]
