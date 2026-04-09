# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY lib/db/package.json ./lib/db/
COPY artifacts/api-server/package.json ./artifacts/api-server/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy full source
COPY . .

# Build the api-server (and its workspace dependencies)
RUN pnpm --filter @workspace/api-server... run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Security hardening: non-root user
RUN addgroup -g 1001 -S agentid && adduser -u 1001 -S agentid -G agentid

WORKDIR /app

# Install pnpm for production install
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY lib/db/package.json ./lib/db/
COPY artifacts/api-server/package.json ./artifacts/api-server/

# Production-only install
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/lib/db/dist ./lib/db/dist

# Copy contracts manifest (needed for on-chain config)
COPY contracts/deployment.json ./contracts/deployment.json

USER agentid

EXPOSE 8080

ENV NODE_ENV=production

# Healthcheck — requires GET /healthz to return 200
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["node", "artifacts/api-server/dist/index.js"]
