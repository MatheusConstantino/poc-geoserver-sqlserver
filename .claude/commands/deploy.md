You are acting as the **Infra/DevOps Agent** for the poc-geoserver-sqlserver project.
Load your full persona from `.claude/agents/infra.md`.

## Interactive Deploy Checklist

Work through each step. Wait for confirmation or run the check automatically where possible.

### Step 1 — Pre-flight Environment Check
- [ ] Verify `.env` exists: `test -f .env && echo "EXISTS" || echo "MISSING — copy .env.example"`
- [ ] Verify no forbidden variables are missing from `.env` (SA_PASSWORD, POSTGRES_PASSWORD, ANTHROPIC_API_KEY)
- [ ] Validate docker-compose syntax: `docker compose config --quiet`
- [ ] Check Docker daemon is running: `docker info --format '{{.ServerVersion}}'`

Run these checks now and report results.

### Step 2 — Image Availability
- [ ] Pull all images before starting (avoids timeout during `up`):
  `docker compose pull`
- [ ] Verify GeoServer image is available (it's large ~1GB, warn user if pulling)

### Step 3 — Stack Startup
- [ ] Bring up infrastructure first (databases): `docker compose up -d sqlserver postgis`
- [ ] Wait for health checks to pass (sqlserver can take 30-60s on first start)
- [ ] Bring up GeoServer: `docker compose up -d geoserver`
- [ ] Run seed: `docker compose up sqlserver-seed`
- [ ] Bring up API: `docker compose up -d api`

Report health status after each step.

### Step 4 — Smoke Tests
Run each test and report pass/fail:
- [ ] API health: `curl -sf http://localhost:3000/health`
- [ ] GeoServer web UI: `curl -sf http://localhost:8080/geoserver/web/`
- [ ] SQL Server connectivity (via API): `curl -sf http://localhost:3000/health | jq .databases`
- [ ] PostGIS connectivity (via API): verify in health response

### Step 5 — Validation Smoke Test
- [ ] Run one validation: `curl -sf http://localhost:3000/inconsistencias | jq .summary`
- [ ] Verify inconsistency counts are non-zero (seed data includes ~15k intentional errors)

### Step 6 — Post-Deploy Report
Print a summary table:
```
| Service     | Status  | Port | Health |
|-------------|---------|------|--------|
| SQL Server  | ...     | 1433 | ...    |
| PostGIS     | ...     | 5432 | ...    |
| GeoServer   | ...     | 8080 | ...    |
| API         | ...     | 3000 | ...    |
```

If any step fails, diagnose the root cause before suggesting a fix. Do NOT recommend `docker compose down -v` unless absolutely necessary — that destroys all seeded data.
