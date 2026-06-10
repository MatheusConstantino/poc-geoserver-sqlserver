You are acting as the **QA Engineer** for the poc-geoserver-sqlserver project.
Load your full persona from `.claude/agents/qa.md`.

## Full QA Checklist

$ARGUMENTS (optional: scope like "api", "database", "geoserver", "all" — default: all)

### QA Protocol — work through each category systematically

#### Category 1: Infrastructure
- [ ] `docker compose config` passes without errors
- [ ] All services reach healthy state: `docker compose ps`
- [ ] No port conflicts detected
- [ ] `.env` has all required variables (compare against `.env.example`)
- [ ] No secrets in any tracked file: `git log --all -p | grep -iE "password|api_key|secret" | grep -v ".env.example"`

#### Category 2: Database — SQL Server
- [ ] Schema `rede_eletrica` exists with all 3 tables
- [ ] Schema `verifier` exists with `inconsist_result` table
- [ ] All spatial indexes are present
- [ ] Row counts within expected range (50k postes, 100k trechos, 2k subestacoes)
- [ ] Seed is idempotent: run twice, verify counts identical
- [ ] All validation views return results (not empty, not errors)
- [ ] SRID is consistently 4326 across all geometry columns

#### Category 3: Database — PostGIS
- [ ] Same schema structure as SQL Server
- [ ] Row counts identical to SQL Server (same seed data)
- [ ] GIST indexes present on all geometry columns
- [ ] PostGIS extension is installed: `SELECT PostGIS_Version()`

#### Category 4: GeoServer
- [ ] Workspace `poc-geoserver` exists
- [ ] All 3 layers published (postes, trechos, subestacoes)
- [ ] WMS GetCapabilities returns all layers: `curl http://localhost:8080/geoserver/wms?SERVICE=WMS&REQUEST=GetCapabilities`
- [ ] WFS GetFeature returns data: `curl "http://localhost:8080/geoserver/wfs?service=WFS&request=GetFeature&typeName=poc-geoserver:postes&maxFeatures=1"`
- [ ] No bbox errors on LineString/Polygon layers (known bug — verify workaround is applied)

#### Category 5: API Contracts
- [ ] `GET /health` → 200 with databases status
- [ ] `GET /inconsistencias` → 200 with summary + samples matching schema
- [ ] `POST /benchmark/run` → 202 or 200 with results
- [ ] `POST /ai/analyze-inconsistencies` → 200 with structured AI response
- [ ] `POST /ai/benchmark-insights` → 200 with structured AI response
- [ ] All error responses follow `{ error: string, code: string }` format
- [ ] Pagination works for large result sets

#### Category 6: Edge Cases (spatial)
- [ ] Empty bbox query returns empty array, not 500
- [ ] Invalid WKT input returns 400 with descriptive error
- [ ] SRID mismatch returns 400, not silent wrong result
- [ ] Bbox larger than Paraná bounds is clipped or rejected gracefully
- [ ] Null geometry values do not crash the API

#### Category 7: CI/CD
- [ ] `ci.yml` workflow passes on current branch
- [ ] `ai-pr-review.yml` would trigger correctly on a PR
- [ ] GitHub issue templates are valid YAML

### Final QA Report
```
## QA Report — [date] — [scope]

| Category | Status | Issues Found |
|----------|--------|-------------|
| Infrastructure | PASS/FAIL | ... |
| SQL Server | PASS/FAIL | ... |
| PostGIS | PASS/FAIL | ... |
| GeoServer | PASS/FAIL | ... |
| API Contracts | PASS/FAIL | ... |
| Edge Cases | PASS/FAIL | ... |
| CI/CD | PASS/FAIL | ... |

### Blocking Issues (must fix before merge/release)
[list]

### Non-blocking Issues (create GitHub issue)
[list]

### Verdict: READY TO MERGE / NOT READY
```
