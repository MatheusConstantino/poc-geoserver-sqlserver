# POC GeoServer + SQL Server — Claude Code Project Context

## Overview
Educational portfolio POC: geospatial engineering with GeoServer 2.25, SQL Server 2022, PostGIS 3.4,
Node.js 20 API with AI analysis layer (Claude API), fully containerized via Docker Compose.

## Domain Context
Synthetic electrical distribution network — state of Paraná, Brazil (bounding box):
- lon: -54.6 to -48.0 | lat: -26.7 to -22.5 | SRID: 4326 (WGS84)
- **postes** (~50k POINT): utility poles, table `rede_eletrica.postes`
- **trechos** (~100k LINESTRING): medium-voltage lines, table `rede_eletrica.trechos`
- **subestacoes** (~2k POLYGON): substations / concession areas, table `rede_eletrica.subestacoes`
- **inconsistencias**: ~15k intentional errors for validation (5 categories)

## Tech Stack
| Component | Technology |
|-----------|-----------|
| Primary spatial DB | SQL Server 2022 |
| Comparison DB | PostgreSQL 16 + PostGIS 3.4 |
| Map server | GeoServer 2.25+ |
| API | Node.js 20 LTS, Fastify, TypeScript |
| Container | Docker Compose v2 |
| AI layer | Claude API (Anthropic SDK, claude-sonnet-4-6) |
| Benchmark | k6 or autocannon |

## Agent Roles — Use the Right Agent for the Right Task

| Situation | Agent to Use |
|-----------|-------------|
| Sprint planning, scope questions, issue creation | `/project:po` or read `.claude/agents/po.md` |
| Before any PR merge, API contract, edge cases | `/project:qa` or read `.claude/agents/qa.md` |
| Docker, CI/CD, secrets, health checks | read `.claude/agents/infra.md` |
| Code PR, SQL security, performance review | `/project:review` (uses `.claude/agents/reviewer.md`) |
| GeoServer config, spatial SQL, SRID issues | read `.claude/agents/spatial-expert.md` |

## Slash Commands Available
- `/project:review [file or PR diff]` — Senior code review with security + spatial focus
- `/project:deploy` — Interactive deploy checklist
- `/project:benchmark` — Run all 15 benchmark scenarios and generate report
- `/project:validate` — Execute spatial inconsistency views + AI analysis
- `/project:seed` — Regenerate synthetic data with fixed seed
- `/project:new-adr [title]` — Scaffold new Architecture Decision Record
- `/project:sprint-status` — Check sprint progress against GitHub issues
- `/project:qa [scope]` — Full QA checklist before merge/release

## Coding Conventions
- **Commits**: Conventional Commits — `feat:`, `fix:`, `docs:`, `chore:`, `perf:`, `test:`, `refactor:`
- **Branches**: `spec/xxx` → specs | `feat/sprint-N-description` → features | `fix/description` → bugs
- **Language**: Code and README in English; `docs/*.md` in PT-BR
- **SQL**: ALL scripts must be idempotent (IF NOT EXISTS, DROP IF EXISTS, TRUNCATE before INSERT)
- **Secrets**: NEVER hardcode passwords, API keys, or connection strings — always use env vars
- **Spatial**: Always validate SRID before spatial operations; document bbox assumptions explicitly

## Key Known Issues
- **GeoServer bbox bug**: SQL Server JDBC plugin fails to auto-compute bbox for LineString/Polygon layers.
  Workaround: declare explicit native bbox in layer config. See `docs/03-setup-geoserver.md`.
- **SQL Server spatial index**: STIntersects with large POLYGON inputs can cause full scans if
  selectivity is low. Use filtered indexes for known geographic partitions.

## Spec-Driven Development Rule
Write the spec BEFORE implementing. Every feature branch should reference its spec:
- `specs/` — all specifications
- `docs/adr/` — architecture decisions
- PR description must link to the relevant spec section.

## File Map
```
specs/           → write here FIRST
docs/adr/        → architecture decisions
docs/            → technical deep-dives (PT-BR)
sqlserver/init/  → idempotent schema + seed scripts
postgis/init/    → PostGIS equivalents
geoserver/       → pre-configured data_dir
api/src/         → Fastify routes + services
api/src/ai/      → Claude API integration (prompts, schemas, client)
benchmark/       → scenarios.json + runner + results
.claude/         → this directory: agents, commands, hooks
.github/         → CI, PR template, issue templates
```
