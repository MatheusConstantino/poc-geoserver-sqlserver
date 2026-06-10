# Validation Rules Specification

**Status**: Accepted
**Version**: 1.0
**Refs**: Data Model `specs/03-data-model-spec.md` | API `specs/02-api-spec.md`

---

## Overview

The validation layer detects 5 categories of spatial inconsistency injected into the synthetic dataset.
All rules are implemented as SQL Server views in schema `verifier`, with PostGIS equivalents in the
`verifier` schema of PostgreSQL.

Each view must:
- Be read-only (SELECT only — no side effects)
- Complete in < 5 seconds on the full dataset
- Return consistent columns: `id`, `type`, `geom`, `rule_code`, `severity`, `detail`

---

## VR-001 — Point Outside Expected Polygon

**Severity**: HIGH
**Description**: A utility pole (`poste`) does not intersect any concession area (`subestacao` polygon).
In a real network, every pole must belong to exactly one concession area.

**SQL Server:**
```sql
CREATE OR ALTER VIEW verifier.vw_pontos_fora_poligono AS
SELECT
    p.id,
    'poste'         AS tipo,
    p.geom,
    'VR-001'        AS rule_code,
    'HIGH'          AS severity,
    'Poste fora de area de concessao' AS detail,
    MIN(p.geom.STDistance(s.geom)) AS distancia_mais_proxima_m
FROM rede_eletrica.postes p
WHERE NOT EXISTS (
    SELECT 1
    FROM rede_eletrica.subestacoes s
    WHERE p.geom.STIntersects(s.geom) = 1
)
CROSS APPLY (
    SELECT TOP 1 geom
    FROM rede_eletrica.subestacoes
    ORDER BY p.geom.STDistance(geom)
) nearest(geom_nearest)
GROUP BY p.id, p.geom;
```

**PostGIS:**
```sql
CREATE OR REPLACE VIEW verifier.vw_pontos_fora_poligono AS
SELECT
    p.id,
    'poste'         AS tipo,
    p.geom,
    'VR-001'        AS rule_code,
    'HIGH'          AS severity,
    'Poste fora de area de concessao' AS detail,
    (SELECT MIN(ST_Distance(p.geom, s.geom)) FROM rede_eletrica.subestacoes s) AS distancia_mais_proxima_m
FROM rede_eletrica.postes p
WHERE NOT EXISTS (
    SELECT 1
    FROM rede_eletrica.subestacoes s
    WHERE ST_Intersects(p.geom, s.geom)
);
```

**Expected count**: 2000–4000 (injected ~3000)
**False positive rate**: < 0.1% (poles on exact polygon boundary may appear — use STIntersects, not STContains)

---

## VR-002 — Line with Dangling Endpoint

**Severity**: MEDIUM
**Description**: A network line (`trecho`) has one or both endpoints that are not connected to any
other line or pole — they "dangle" in space. Threshold: > 0.5 meters from any adjacent geometry.

**SQL Server:**
```sql
CREATE OR ALTER VIEW verifier.vw_linhas_extremidade_solta AS
SELECT
    t.id,
    'trecho'        AS tipo,
    t.geom,
    'VR-002'        AS rule_code,
    'MEDIUM'        AS severity,
    'Extremidade solta (endpoint nao conectado)' AS detail
FROM rede_eletrica.trechos t
WHERE
    -- Start point has no neighbor within 0.5m
    NOT EXISTS (
        SELECT 1 FROM rede_eletrica.postes p
        WHERE t.geom.STStartPoint().STDistance(p.geom) < 0.005  -- ~0.5m in degrees at lat -25
    )
    AND NOT EXISTS (
        SELECT 1 FROM rede_eletrica.trechos t2
        WHERE t.id <> t2.id
          AND t.geom.STStartPoint().STDistance(t2.geom.STEndPoint()) < 0.005
    );
```

**Expected count**: 3000–6000 (injected ~4500)
**Performance note**: This is the most expensive view — uses STDistance on 100k rows. Ensure IX_trechos_geom is applied.

---

## VR-003 — Self-Intersecting Polygon

**Severity**: HIGH
**Description**: A concession area polygon (`subestacao`) has self-intersections, making it
geometrically invalid according to OGC Simple Features standard.

**SQL Server:**
```sql
CREATE OR ALTER VIEW verifier.vw_poligonos_auto_intersecao AS
SELECT
    s.id,
    'subestacao'    AS tipo,
    s.geom,
    'VR-003'        AS rule_code,
    'HIGH'          AS severity,
    s.geom.STIsValidReason() AS detail
FROM rede_eletrica.subestacoes s
WHERE s.geom.STIsValid() = 0;
```

**PostGIS:**
```sql
CREATE OR REPLACE VIEW verifier.vw_poligonos_auto_intersecao AS
SELECT
    s.id,
    'subestacao'    AS tipo,
    s.geom,
    'VR-003'        AS rule_code,
    'HIGH'          AS severity,
    ST_IsValidReason(s.geom) AS detail
FROM rede_eletrica.subestacoes s
WHERE NOT ST_IsValid(s.geom);
```

**Expected count**: 1500–2500 (injected ~2000)
**Note**: STIsValid returns NULL for NULL geometries — handle NULLs before running spatial operations.

---

## VR-004 — Geometric Duplicate

**Severity**: LOW
**Description**: Two or more geometries of the same type are exactly equal (STEquals = 1), indicating
a duplicate entry — likely from an import or sync error.

**SQL Server:**
```sql
CREATE OR ALTER VIEW verifier.vw_duplicatas_geometricas AS
SELECT
    a.id            AS id,
    'poste'         AS tipo,
    a.geom,
    'VR-004'        AS rule_code,
    'LOW'           AS severity,
    CONCAT('Duplicata de id=', b.id) AS detail
FROM rede_eletrica.postes a
JOIN rede_eletrica.postes b
    ON a.id < b.id
   AND a.geom.STEquals(b.geom) = 1

UNION ALL

SELECT
    a.id,
    'trecho'        AS tipo,
    a.geom,
    'VR-004'        AS rule_code,
    'LOW'           AS severity,
    CONCAT('Duplicata de id=', b.id) AS detail
FROM rede_eletrica.trechos a
JOIN rede_eletrica.trechos b
    ON a.id < b.id
   AND a.geom.STEquals(b.geom) = 1;
```

**Expected count**: 2500–4500 (injected ~3000)
**Performance note**: Self-join on 50k + 100k rows is expensive without index. Add a computed hash column for production use.

---

## VR-005 — SRID Inconsistency

**Severity**: MEDIUM
**Description**: A geometry's SRID does not match the expected project SRID (4326). This can cause
silent wrong results in spatial operations that mix coordinate systems.

**SQL Server:**
```sql
CREATE OR ALTER VIEW verifier.vw_srid_inconsistente AS
SELECT id, 'poste' AS tipo, geom, 'VR-005' AS rule_code, 'MEDIUM' AS severity,
       CONCAT('SRID=', geom.STSrid, ' (esperado: 4326)') AS detail
FROM rede_eletrica.postes WHERE geom.STSrid <> 4326

UNION ALL

SELECT id, 'trecho' AS tipo, geom, 'VR-005' AS rule_code, 'MEDIUM' AS severity,
       CONCAT('SRID=', geom.STSrid, ' (esperado: 4326)') AS detail
FROM rede_eletrica.trechos WHERE geom.STSrid <> 4326

UNION ALL

SELECT id, 'subestacao' AS tipo, geom, 'VR-005' AS rule_code, 'MEDIUM' AS severity,
       CONCAT('SRID=', geom.STSrid, ' (esperado: 4326)') AS detail
FROM rede_eletrica.subestacoes WHERE geom.STSrid <> 4326;
```

**Expected count**: 1500–2500 (injected ~2000)

---

## Summary Table

| Rule | Description | Severity | SQL Function | Expected Count | Max Query Time |
|------|-------------|----------|-------------|---------------|---------------|
| VR-001 | Point outside polygon | HIGH | STIntersects | 3000 ± 1000 | 2s |
| VR-002 | Dangling line endpoint | MEDIUM | STDistance | 4500 ± 1500 | 4s |
| VR-003 | Self-intersecting polygon | HIGH | STIsValid | 2000 ± 500 | 0.5s |
| VR-004 | Geometric duplicate | LOW | STEquals | 3000 ± 1000 | 3s |
| VR-005 | SRID inconsistency | MEDIUM | STSrid | 2000 ± 500 | 0.2s |
