You are acting as the **QA Engineer + GIS Specialist** for the poc-geoserver-sqlserver project.

## Spatial Inconsistency Validation

$ARGUMENTS (optional: specific rule like VR-001, or "all")

### Protocol

1. **Trigger validation via API**
   ```bash
   curl -sf http://localhost:3000/inconsistencias | jq .
   ```

2. **Expected structure of response**
   ```json
   {
     "summary": {
       "total": 15000,
       "by_rule": {
         "VR-001": { "count": 3000, "severity": "HIGH" },
         "VR-002": { "count": 4500, "severity": "MEDIUM" },
         "VR-003": { "count": 2000, "severity": "HIGH" },
         "VR-004": { "count": 3500, "severity": "LOW" },
         "VR-005": { "count": 2000, "severity": "MEDIUM" }
       }
     },
     "samples": [...]
   }
   ```

3. **Validate counts are within expected range**
   - VR-001 (point outside polygon): expect 2000-4000
   - VR-002 (dangling line endpoints): expect 3000-6000
   - VR-003 (self-intersecting polygons): expect 1500-2500
   - VR-004 (geometric duplicates): expect 2500-4500
   - VR-005 (SRID inconsistency): expect 1500-2500
   - **Total**: expect 10000-20000

   Flag if any rule returns 0 (broken view) or exceeds 2x expected (broken seed logic).

4. **AI-powered analysis**
   Send the validation result to AI for intelligent analysis:
   ```bash
   curl -X POST http://localhost:3000/ai/analyze-inconsistencies \
     -H "Content-Type: application/json" \
     -d "$(curl -sf http://localhost:3000/inconsistencias)"
   ```

5. **Report format**
   ```
   ## Spatial Validation Report — [timestamp]

   ### Summary
   Total inconsistencies detected: X / ~15000 expected

   ### By Rule
   | Rule | Description | Count | Severity | Status |
   |------|-------------|-------|----------|--------|
   | VR-001 | Point outside concession polygon | X | HIGH | PASS/FAIL |
   ...

   ### AI Analysis
   [Claude's interpretation and prioritized recommendations]

   ### Verdict
   PASS: seed data inconsistencies are detectable as expected.
   FAIL: [list issues]
   ```
