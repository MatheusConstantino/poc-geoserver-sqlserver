# =============================================================================
# API — Node.js 20 / Fastify
# Multi-stage: development (live reload) + production (compiled)
# =============================================================================

FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts

# ---------------------------------------------------------------------------
# Development — tsx watch for live reload (bind-mounted src/)
# ---------------------------------------------------------------------------
FROM base AS development
RUN npm ci --ignore-scripts  # includes devDependencies
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
# Build — compile TypeScript
# ---------------------------------------------------------------------------
FROM base AS builder
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Production — minimal image, only compiled output
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
