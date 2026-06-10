# Benchmark Specification

**Status**: Accepted
**Version**: 1.0
**Refs**: Technical Spec `specs/01-technical-spec.md` | API `specs/02-api-spec.md`

---

## Methodology

- **Warmup**: 3 iterations discarded before measurement
- **Measured**: 10 iterations per scenario per database
- **Metrics**: p50, p95, p99 (latency in ms), throughput (req/s)
- **Isolation**: each scenario runs independently — no concurrent queries
- **Determinism**: same bbox, same parameters for both databases
- **Dataset**: identical seed data in both SQL Server and PostGIS (SEED_RANDOM_SEED=42)

---

## Benchmark Scenarios

### B01 — Bbox Query: Dense Region
**Type**: Spatial filter
**Description**: Retrieve all postes within the Curitiba metropolitan area bbox (dense region).
**Input**: `bbox = [-49.5, -25.7, -49.0, -25.2]` (covers ~18% of total dataset)
**Expected result**: ~9000 postes
**Index expected**: R-tree / GIST scan (not full table scan)

SQL Server:
```sql
DECLARE @bbox geometry = geometry::STGeomFromText(
  'POLYGON((-49.5 -25.7, -49.0 -25.7, -49.0 -25.2, -49.5 -25.2, -49.5 -25.7))', 4326)
SELECT id, nome, tensao, geom.STAsText() FROM rede_eletrica.postes
WHERE geom.STIntersects(@bbox) = 1
```

---

### B02 — Bbox Query: Sparse Region
**Type**: Spatial filter
**Description**: Retrieve all postes in a rural area (low density).
**Input**: `bbox = [-53.0, -24.0, -52.5, -23.5]` (~2% of dataset)
**Expected result**: ~1000 postes

---

### B03 — Bbox Query: Line Features
**Type**: Spatial filter
**Description**: Retrieve all trechos intersecting a bbox.
**Input**: `bbox = [-51.0, -25.5, -50.0, -24.5]` (medium region)
**Expected result**: ~15000 trechos
**Note**: This scenario exposes the GeoServer bbox bug — verify index hit.

---

### B04 — Bbox Query: Polygon Features
**Type**: Spatial filter
**Description**: Retrieve all subestacoes intersecting a bbox.
**Input**: `bbox = [-54.0, -26.5, -48.0, -22.5]` (full Paraná)
**Expected result**: ~2000 subestacoes (all)

---

### B05 — Point in Polygon
**Type**: Containment test
**Description**: For a given point, find which subestacao contains it.
**Input**: `point = POINT(-49.27 -25.43)` (Curitiba center)
**Expected result**: 0 or 1 subestacao

SQL Server:
```sql
DECLARE @pt geometry = geometry::STGeomFromText('POINT(-49.27 -25.43)', 4326)
SELECT id, nome FROM rede_eletrica.subestacoes
WHERE geom.STContains(@pt) = 1
```

---

### B06 — Distance Query
**Type**: Nearest neighbor (fixed radius)
**Description**: Find all postes within 500m of a given point.
**Input**: `point = POINT(-49.27 -25.43)`, `radius = 0.0045` (degrees ≈ 500m at lat -25)
**Expected result**: ~50-200 postes

---

### B07 — Spatial JOIN: Pole ↔ Line
**Type**: Spatial join (50k × 100k)
**Description**: For each poste, find all trechos that start or end within 10m.
**Expected result**: ~150k pairs
**Critical**: This is the most index-sensitive scenario — must use spatial index on both tables.

---

### B08 — Spatial JOIN: Pole ↔ Substation Area
**Type**: Containment join (50k × 2k)
**Description**: For each subestacao, count how many postes it contains.
**Expected result**: 2000 rows with counts

---

### B09 — Mixed Filter: Attribute + Spatial
**Type**: Compound query
**Description**: Find all postes with tensao=13.8kV within the Curitiba bbox.
**Input**: `tensao = '13.8kV'`, `bbox = [-49.5, -25.7, -49.0, -25.2]`
**Note**: Tests whether the optimizer uses the spatial index or the attribute index first.

---

### B10 — Spatial Aggregation
**Type**: GROUP BY + spatial
**Description**: Count postes per subestacao area (spatial aggregation).
**Expected result**: 2000 rows (one per subestacao) with count

---

### B11 — Invalid Geometry Detection
**Type**: Function call on full table
**Description**: Scan all subestacoes and return those where STIsValid = 0.
**Expected result**: ~2000 rows (the injected VR-003 inconsistencies)

---

### B12 — Nearest Neighbor (k=5)
**Type**: KNN query
**Description**: For a given point, find the 5 nearest postes.
**Input**: `point = POINT(-49.27 -25.43)`
**Note**: SQL Server lacks a native KNN index operator — uses TOP + ORDER BY STDistance.

SQL Server:
```sql
SELECT TOP 5 id, geom.STDistance(geometry::STGeomFromText('POINT(-49.27 -25.43)',4326)) AS dist
FROM rede_eletrica.postes
ORDER BY geom.STDistance(geometry::STGeomFromText('POINT(-49.27 -25.43)',4326))
```

---

### B13 — Line Intersection
**Type**: Set operation
**Description**: Find all pairs of trechos that cross each other (self-intersection of the network).
**Expected result**: ~500–2000 pairs (mostly injected errors)

---

### B14 — Cross-Schema JOIN
**Type**: Multi-schema query
**Description**: Join rede_eletrica.postes with verifier.vw_pontos_fora_poligono to get full detail of inconsistent postes.
**Tests**: Cross-schema query performance and plan efficiency.

---

### B15 — Full Validation Scan
**Type**: Compound multi-table
**Description**: Execute all 5 validation views in a single transaction and return totals.
**Expected result**: ~15000 total across all 5 rules
**Represents**: The most realistic real-world workload for this system.

---

## Results Format

```markdown
| Scenario | Description | SQL Server p50 | SQL Server p95 | PostGIS p50 | PostGIS p95 | Winner | Margin |
|----------|-------------|:---:|:---:|:---:|:---:|:---:|:---:|
| B01 | Bbox dense | Xms | Xms | Xms | Xms | ... | X% |
```

Results file: `benchmark/results/YYYY-MM-DD.md`
