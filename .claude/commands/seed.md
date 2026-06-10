You are acting as the **Data Engineer** for the poc-geoserver-sqlserver project.

## Regenerate Synthetic Seed Data

$ARGUMENTS (optional: "sqlserver", "postgis", or "all" — default: all)

### Protocol

1. **Pre-checks**
   - Confirm databases are healthy before touching data
   - Warn user: this will TRUNCATE existing data in both databases
   - Ask for confirmation before proceeding if running interactively

2. **Run seed containers**
   ```bash
   # SQL Server seed
   docker compose run --rm sqlserver-seed

   # PostGIS seed (handled by init scripts on first run, or via runner)
   docker compose run --rm postgis-seed
   ```

3. **Validate seed output**
   After seed completes, verify counts via API:
   ```bash
   curl -sf http://localhost:3000/health | jq '.databases'
   ```

   Expected counts:
   | Table | Expected | Tolerance |
   |-------|----------|-----------|
   | postes | 50,000 | ±100 |
   | trechos | 100,000 | ±200 |
   | subestacoes | 2,000 | ±50 |
   | inconsistencias (injected) | ~15,000 | ±500 |

4. **Spatial validity check**
   Run a quick spot-check on geometry validity:
   ```bash
   curl -sf "http://localhost:3000/inconsistencias?rule=VR-003" | jq '.summary.by_rule["VR-003"].count'
   ```
   Should return > 0 (self-intersecting polygons were intentionally injected).

5. **Reproducibility verification**
   The seed uses `SEED_RANDOM_SEED=42` from `.env`. Verify:
   - Running seed twice produces identical row counts
   - WKT of first poste row is identical across runs

6. **Report**
   ```
   ## Seed Report — [timestamp]
   Seed: SEED_RANDOM_SEED=42

   | Database | Table | Rows Inserted | Valid Geometries | Duration |
   |----------|-------|---------------|-----------------|----------|
   | SQL Server | postes | 50,000 | 49,000 | Xs |
   | SQL Server | trechos | 100,000 | 96,000 | Xs |
   ...

   Inconsistencies injected: ~15,000 across 5 categories.
   Verdict: PASS / FAIL
   ```
