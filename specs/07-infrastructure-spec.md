# Infrastructure Specification

**Status**: Accepted
**Version**: 1.0
**Refs**: Technical Spec `specs/01-technical-spec.md` | ADR-005

---

## Docker Compose Services

### Startup Order & Dependencies
```
sqlserver ─────────────┐
                       ├──▶ sqlserver-seed (exits after seeding)
postgis ───────────────┤
                       ├──▶ geoserver (needs both DBs healthy)
                       └──▶ api (needs both DBs healthy)
```

All dependencies use `condition: service_healthy` — never `depends_on: [service]` alone.

### Health Check Specifications

| Service | Health Check Command | Interval | Retries | Start Period |
|---------|---------------------|----------|---------|-------------|
| sqlserver | `/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P '${SA_PASSWORD}' -Q 'SELECT 1' -No -C` | 15s | 10 | 30s |
| postgis | `pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}` | 10s | 10 | 20s |
| geoserver | `curl -sf http://localhost:8080/geoserver/web/` | 30s | 10 | 60s |
| api | `curl -sf http://localhost:3000/health` | 15s | 5 | 30s |

GeoServer has a 60s start period because it initializes the full Java servlet container.

---

## API Dockerfile

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM base AS development
RUN npm ci  # includes devDependencies for type-check
COPY . .
CMD ["npm", "run", "dev"]

FROM base AS production
COPY --from=development /app/dist ./dist
CMD ["node", "dist/server.js"]
```

Multi-stage build: `development` target used in docker-compose.yml (with live reload).
`production` target used in CI for image size validation.

---

## Volume Strategy

| Volume | Type | Purpose | Survives `down`? |
|--------|------|---------|-----------------|
| `sqlserver_data` | Named | SQL Server data files | Yes (until `down -v`) |
| `postgis_data` | Named | PostgreSQL data files | Yes (until `down -v`) |
| `geoserver_cache` | Named | GeoWebCache tiles | Yes (until `down -v`) |
| `./geoserver/data_dir` | Bind mount | Pre-configured workspaces | Always (committed to git) |
| `./api/src` | Bind mount (dev only) | Live reload in development | Always |
| `./benchmark` | Bind mount | Results written by API | Always |

`docker compose down` → preserves named volumes (data survives)
`docker compose down -v` → destroys all data (full reset, re-seeding required)

---

## Environment Variables

All variables documented in `.env.example`. Required vs optional:

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| SA_PASSWORD | YES | — | Must meet SQL Server complexity |
| POSTGRES_PASSWORD | YES | — | Any string |
| ANTHROPIC_API_KEY | YES (AI) | — | AI endpoints disabled if missing |
| GEOSERVER_PASSWORD | NO | `geoserver` | Change for any non-local deploy |
| SEED_RANDOM_SEED | NO | `42` | Change only to regenerate different dataset |
| AI_MODEL | NO | `claude-sonnet-4-6` | Override for testing with different model |

---

## GitHub Actions CI Requirements

### Secrets Required (GitHub repository settings)
| Secret Name | Used By | Notes |
|-------------|---------|-------|
| `ANTHROPIC_API_KEY` | `ai-pr-review.yml`, `benchmark-report.yml` | Claude API key |

### Workflow Triggers
| Workflow | Trigger | Duration Target |
|----------|---------|----------------|
| `ci.yml` | push to main/develop, PR to main/develop | < 5 min |
| `ai-pr-review.yml` | PR opened/synchronized (non-draft, non-dependabot) | < 2 min |
| `benchmark-report.yml` | manual dispatch, push to main touching benchmark files | < 15 min |

### CI Environment
- Runner: `ubuntu-latest` (GitHub-hosted)
- No self-hosted runners required
- No Docker registry push required (build + validate only in CI)

---

## Network

Single Docker bridge network `geo-net` for all services.
All inter-service communication uses service names as hostnames (Docker DNS).
No service exposes ports except to the host for developer access:
- SQL Server: `localhost:1433`
- PostGIS: `localhost:5432`
- GeoServer: `localhost:8080`
- API: `localhost:3000`

---

## Idempotency Requirements

All SQL scripts in `sqlserver/init/` and `postgis/init/` MUST:
1. Use `IF NOT EXISTS` for schema/table/index creation
2. Use `TRUNCATE TABLE` before bulk INSERT (not DROP + recreate — avoids index rebuild)
3. Be safe to run as a single transaction
4. Complete in < 120s for the full seed (50k + 100k + 2k features)

Validation: run `docker compose up sqlserver-seed` twice in succession — both runs must succeed.
