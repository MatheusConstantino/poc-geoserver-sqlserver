# PRD — POC GeoServer + SQL Server

**Status**: Accepted
**Version**: 1.0
**Author**: Matheus
**Reviewed by**: PO Agent

---

## Problem Statement

Engineers evaluating geospatial technology stacks for utility network systems (electric, water, telecom)
frequently face the same two unresolved questions:

1. **SQL Server vs PostGIS for spatial data?** Both are viable but have distinct tradeoffs in
   performance, licensing cost, ecosystem integration, and spatial function behavior — and no
   definitive side-by-side comparison exists with realistic utility-network workloads.

2. **GeoServer with SQL Server: does it actually work in production?** The SQL Server JDBC datastore
   plugin has undocumented behaviors (bbox computation failure for non-POINT geometries) that only
   surface in real deployments. No public resource documents the workaround clearly.

This POC exists to answer both questions with reproducible evidence.

---

## Goals

| # | Goal | Success Metric |
|---|------|---------------|
| G1 | Demonstrate spatial data management in SQL Server 2022 | Schema + seed loads in < 2 min |
| G2 | Compare SQL Server vs PostGIS on identical spatial workloads | 15 benchmark scenarios with p50/p95/p99 for both |
| G3 | Document and resolve the GeoServer/SQL Server bbox bug | Layer Preview renders all 3 geometry types without errors |
| G4 | Show spatial inconsistency detection using SQL spatial functions | 5 validation views detecting ~15k intentional errors |
| G5 | Integrate AI (Claude API) for intelligent analysis of spatial data | 3 working AI endpoints with structured output |
| G6 | Be reproducible by anyone with Docker | `docker compose up` succeeds from cold start without manual steps |
| G7 | Demonstrate AI-driven engineering workflow | .claude/ setup, slash commands, agent personas, AI in CI |

---

## Non-Goals

- This is NOT a production system — no authentication, no rate limiting beyond basic validation
- This is NOT a real client project — all data is 100% synthetic
- This is NOT a GIS tutorial — assumes reader has basic familiarity with geographic data concepts
- We will NOT implement a full frontend map interface — GeoServer Layer Preview is sufficient for demo
- We will NOT optimize for cost — this is a developer machine workload, not cloud-scale

---

## User Stories

### Primary User: Technical Recruiter / Engineering Lead reviewing portfolio
> As a hiring engineer, I want to quickly understand what this POC demonstrates, run it locally in
> under 5 minutes, and see concrete evidence (benchmark numbers, rendered map, AI analysis output)
> that the author knows what they're doing.

**Acceptance criteria:**
- README Quickstart works in ≤ 5 commands
- Benchmark table has real numbers (not "TBD")
- Layer Preview renders a visible map
- AI endpoint returns a coherent analysis

### Secondary User: Developer learning spatial + AI stack
> As a developer, I want to understand the tradeoffs between SQL Server and PostGIS for spatial
> workloads, and see how AI can be integrated as an engineering tool — not just a product feature.

**Acceptance criteria:**
- All 5 ADRs are written and explain the reasoning behind non-obvious decisions
- docs/ directory has detailed PT-BR documentation for each component
- `.claude/` directory is self-explanatory — a new developer can understand the agent workflow

### Tertiary User: The author (portfolio maintenance)
> As the author, I want to be able to add new benchmark scenarios, new validation rules, or new AI
> endpoints without breaking existing behavior — and have the AI tooling assist me efficiently.

**Acceptance criteria:**
- `/project:review` catches issues before they hit main
- `/project:benchmark` runs all scenarios and updates the results table
- New ADRs can be created with `/project:new-adr` in < 2 minutes

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Cold start time | < 5 min from `docker compose up` to all services healthy |
| Seed data load time | < 2 min for all 152k features in both databases |
| Benchmark p95 (bbox query, dense) | < 100ms for both SQL Server and PostGIS |
| Inconsistency detection rate | > 95% of injected 15k errors detected by validation views |
| AI response time (analyze-inconsistencies) | < 10s |
| README Quickstart steps | ≤ 5 commands |
| CI pipeline time | < 5 min |

---

## Out of Scope

- Real-time data ingestion (streaming, CDC)
- Multi-tenant architecture
- Authentication / authorization
- Frontend application beyond GeoServer Layer Preview
- Mobile or native app
- Cloud deployment (AWS, Azure, GCP) — Docker Compose only
- Automated E2E tests (noted as a GitHub issue for next steps)
- Data migration tooling
- Backup and recovery procedures
