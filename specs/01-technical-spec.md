# Technical Specification — System Architecture

**Status**: Accepted
**Version**: 1.0
**Refs**: PRD `specs/00-prd.md` | ADR-001 | ADR-002 | ADR-003

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Compose Network: geo-net               │
│                                                                  │
│  ┌──────────────┐     JDBC      ┌──────────────────────────┐   │
│  │  GeoServer   │──────────────▶│    SQL Server 2022        │   │
│  │  2.25+       │               │    Schema: rede_eletrica  │   │
│  │  :8080       │               │    Schema: verifier       │   │
│  │  WMS / WFS   │               └──────────────────────────┘   │
│  └──────┬───────┘                                               │
│         │                                                        │
│  ┌──────▼───────────────────────────────────────────────┐      │
│  │              Node.js API (Fastify)  :3000             │      │
│  │                                                        │      │
│  │  /health          /inconsistencias  /benchmark/run    │      │
│  │  /ai/analyze-inconsistencies        /ai/benchmark-insights│  │
│  │  /ai/query-suggestions                                 │      │
│  └──────┬────────────────────────┬────────────────────────┘    │
│         │ mssql                  │ pg                           │
│         ▼                        ▼                              │
│  ┌──────────────┐    ┌───────────────────────┐                 │
│  │ SQL Server   │    │ PostgreSQL 16          │                 │
│  │ 2022 :1433   │    │ + PostGIS 3.4 :5432    │                 │
│  └──────────────┘    └───────────────────────┘                 │
│                                                                  │
│  ┌─────────────────────────────────────┐                        │
│  │  sqlserver-seed (ephemeral runner)  │                        │
│  │  Runs once, exits. Generates ~152k  │                        │
│  │  features + ~15k inconsistencies.   │                        │
│  └─────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTPS
                              ▼
                    ┌──────────────────┐
                    │  Claude API      │
                    │  (Anthropic)     │
                    │  AI Analysis     │
                    └──────────────────┘
```

---

## Component Specifications

### SQL Server 2022
- Image: `mcr.microsoft.com/mssql/server:2022-latest` (Developer edition — free)
- Schemas: `rede_eletrica` (data), `verifier` (validation results)
- Spatial type: `geometry` with SRID 4326 (Euclidean — documented tradeoff in ADR-001)
- Indexes: `GEOMETRY_AUTO_GRID` with BOUNDING_BOX set to Paraná extent
- Init: idempotent T-SQL scripts mounted at `/docker-entrypoint-initdb.d/`

### PostgreSQL 16 + PostGIS 3.4
- Image: `postgis/postgis:16-3.4`
- Identical schema to SQL Server (same table names, same column names)
- Spatial type: `geometry(GEOMETRY, 4326)` — PostGIS typed geometry
- Indexes: GIST on all geometry columns
- Purpose: comparison baseline for benchmark, not primary datastore

### GeoServer 2.25+
- Image: `docker.osgeo.org/geoserver:2.25.x`
- Workspace: `poc-geoserver`
- DataStore: SQL Server JDBC (uses `gt-jdbc-sqlserver` plugin)
- Layers: `postes` (POINT), `trechos` (LINESTRING), `subestacoes` (POLYGON)
- Known issue: bbox auto-computation fails for non-POINT layers → explicit bbox in config
- data_dir: pre-configured and committed to repo (excluding runtime cache)

### API — Node.js 20 / Fastify
- Runtime: Node.js 20 LTS
- Framework: Fastify (chosen over Express for native TypeScript support and 2x throughput)
- Schema validation: Zod for all request/response validation
- DB clients: `mssql` for SQL Server, `pg` for PostGIS
- AI client: `@anthropic-ai/sdk` with structured output
- Architecture: flat route handlers → service layer → DB/AI clients (no heavy ORM)

### AI Integration
- Provider: Anthropic Claude API (model: `claude-sonnet-4-6`)
- Pattern: request/response with Zod-validated structured JSON output
- Prompt location: `api/src/ai/prompts/` — versioned alongside code
- Error handling: upstream failures (429, 5xx) → 502 to client with error body
- No streaming (not needed for batch analysis use case)

---

## Data Flow: Spatial Validation Request

```
Client → POST /inconsistencias (or GET)
  → Fastify validates request
  → ValidationService.runAll()
    → SQL Server: execute all 5 views in parallel
    → collect results into ValidationReport object
  → Zod validates report shape
  → return 200 with report JSON
  (optional) → POST /ai/analyze-inconsistencies
    → AI prompt built with report context
    → Claude API call with structured output schema
    → Zod validates AI response
    → return 200 with AI analysis merged into report
```

---

## Performance Targets

| Endpoint | p50 target | p95 target | Notes |
|----------|-----------|-----------|-------|
| GET /health | < 10ms | < 30ms | No DB query |
| GET /inconsistencias | < 500ms | < 2s | 5 SQL views in parallel |
| POST /benchmark/run | < 60s | < 120s | Full 15-scenario run |
| POST /ai/analyze-inconsistencies | < 5s | < 10s | Single Claude API call |
| GeoServer WMS GetMap (bbox query) | < 200ms | < 500ms | Depends on SQL Server index |

---

## Security Considerations

- SA_PASSWORD must meet SQL Server complexity (uppercase, number, symbol, 8+ chars)
- API does not expose raw SQL errors to clients — wrap and sanitize
- All geometry inputs validated as valid WKT before passing to DB
- Claude API key never logged or returned in responses
- No CORS configuration needed (no browser client in scope)
- GeoServer admin UI is accessible on :8080 — acceptable for POC, not production

---

## Scalability Notes (documented, not implemented)

This POC uses a single-node architecture. At larger scales:
- SQL Server → Azure SQL Hyperscale or table partitioning by geographic region
- PostGIS → Citus (distributed) or read replicas
- API → horizontal scaling behind a load balancer (Fastify is stateless)
- GeoServer → GeoServer cluster with shared data_dir (NFS or S3)

See `docs/08-volumetria-tradeoffs.md` for the full analysis.
