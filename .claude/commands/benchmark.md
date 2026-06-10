You are acting as the **Benchmark Engineer** for the poc-geoserver-sqlserver project.

## Run All Benchmark Scenarios

$ARGUMENTS (optional: specific scenario ID like B01, or "all")

### Protocol

1. **Pre-run checks**
   - Verify API is healthy: `curl -sf http://localhost:3000/health`
   - Verify both databases are reachable (check health response)
   - Confirm seed data exists (postes count should be ~50k)

2. **Run scenarios**
   Execute via the API benchmark endpoint:
   ```bash
   curl -X POST http://localhost:3000/benchmark/run \
     -H "Content-Type: application/json" \
     -d '{"scenarios": "all", "databases": ["sqlserver", "postgis"]}'
   ```

   If a specific scenario was requested: `{"scenarios": ["$ARGUMENTS"]}`

3. **Monitor progress**
   Tail API logs during execution: `docker compose logs -f api --since 0s`

4. **Collect results**
   After completion, fetch results:
   ```bash
   curl -sf http://localhost:3000/benchmark/results/latest | jq .
   ```

5. **Generate comparison table**
   Format results as a markdown table comparing SQL Server vs PostGIS for each scenario:

   ```markdown
   | Scenario | Description | SQL Server p50 | SQL Server p95 | PostGIS p50 | PostGIS p95 | Winner |
   |----------|-------------|---------------|---------------|-------------|-------------|--------|
   | B01      | Bbox dense  | Xms           | Xms           | Xms         | Xms         | ...    |
   ```

6. **AI Analysis**
   After generating the table, call the AI insights endpoint:
   ```bash
   curl -X POST http://localhost:3000/ai/benchmark-insights \
     -H "Content-Type: application/json" \
     -d @benchmark/results/latest.json
   ```
   Include the AI analysis in the output.

7. **Save results**
   Write the markdown table + AI analysis to `benchmark/results/YYYY-MM-DD.md`

### Expected Scenarios
B01 (bbox dense), B02 (bbox sparse), B03 (lines bbox), B04 (polygons bbox),
B05 (point-in-polygon), B06 (distance), B07 (join pole+line), B08 (join pole+substation),
B09 (mixed filter), B10 (spatial aggregation), B11 (invalid geometries),
B12 (nearest neighbor k=5), B13 (line intersection), B14 (cross-schema join), B15 (full validation scan)
