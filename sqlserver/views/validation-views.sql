-- =============================================================================
-- SQL Server 2022 — Spatial Validation Views
-- Project: poc-geoserver-sqlserver
-- Spec: specs/04-validation-rules-spec.md
--
-- IDEMPOTENT: uses CREATE OR ALTER VIEW (SQL Server 2016+)
-- All views query schema rede_eletrica and are read-only (no side effects)
-- Each view expected to complete in < 5 seconds on the full dataset
-- =============================================================================

USE geo_poc;
GO

-- =============================================================================
-- VR-001: Point outside expected polygon
-- Severity: HIGH
-- A utility pole (poste) does not intersect any concession area (subestacao).
-- Every pole must belong to exactly one concession area in a valid network.
--
-- NOTE: STIntersects includes boundary — use this, not STContains, to avoid
-- false positives for poles sitting exactly on a polygon edge.
-- =============================================================================

CREATE OR ALTER VIEW verifier.vw_pontos_fora_poligono
AS
SELECT
    p.id,
    p.codigo,
    N'poste'                                    AS feature_type,
    p.geom,
    N'VR-001'                                   AS rule_code,
    N'HIGH'                                     AS severity,
    N'Poste fora de qualquer area de concessao' AS detail
FROM rede_eletrica.postes p
WHERE NOT EXISTS (
    SELECT 1
    FROM rede_eletrica.subestacoes s
    WHERE p.geom.STIntersects(s.geom) = 1
);
GO

PRINT 'View verifier.vw_pontos_fora_poligono (VR-001) created.';
GO

-- =============================================================================
-- VR-002: Line with dangling endpoint
-- Severity: MEDIUM
-- A network line (trecho) has its START point not connected to any pole or
-- another line endpoint within tolerance (~0.5m in degrees at lat -25 ≈ 0.005°).
--
-- PERFORMANCE: this is the most expensive view (STDistance on 100k rows).
-- The spatial index on trechos and postes is essential here.
-- =============================================================================

CREATE OR ALTER VIEW verifier.vw_linhas_extremidade_solta
AS
SELECT
    t.id,
    t.codigo,
    N'trecho'                                       AS feature_type,
    t.geom,
    N'VR-002'                                       AS rule_code,
    N'MEDIUM'                                       AS severity,
    N'Extremidade inicial solta (nao conectada)'    AS detail
FROM rede_eletrica.trechos t
WHERE
    -- Start point is not near any pole
    NOT EXISTS (
        SELECT 1
        FROM rede_eletrica.postes p
        WHERE t.geom.STStartPoint().STDistance(p.geom) < 0.005
    )
    -- And not near the endpoint of any other trecho
    AND NOT EXISTS (
        SELECT 1
        FROM rede_eletrica.trechos t2
        WHERE t.id <> t2.id
          AND t.geom.STStartPoint().STDistance(t2.geom.STEndPoint()) < 0.005
    )

UNION ALL

SELECT
    t.id,
    t.codigo,
    N'trecho'                                       AS feature_type,
    t.geom,
    N'VR-002'                                       AS rule_code,
    N'MEDIUM'                                       AS severity,
    N'Extremidade final solta (nao conectada)'      AS detail
FROM rede_eletrica.trechos t
WHERE
    NOT EXISTS (
        SELECT 1
        FROM rede_eletrica.postes p
        WHERE t.geom.STEndPoint().STDistance(p.geom) < 0.005
    )
    AND NOT EXISTS (
        SELECT 1
        FROM rede_eletrica.trechos t2
        WHERE t.id <> t2.id
          AND t.geom.STEndPoint().STDistance(t2.geom.STStartPoint()) < 0.005
    );
GO

PRINT 'View verifier.vw_linhas_extremidade_solta (VR-002) created.';
GO

-- =============================================================================
-- VR-003: Self-intersecting polygon
-- Severity: HIGH
-- A concession area polygon (subestacao) has self-intersections, making it
-- geometrically invalid per OGC Simple Features standard.
--
-- STIsValid() returns:
--   1 = valid geometry
--   0 = invalid (self-intersecting, degenerate, etc.)
--   NULL = NULL input geometry (handled by STIsValid itself)
--
-- STIsValidReason() returns a human-readable explanation of the invalidity.
-- =============================================================================

CREATE OR ALTER VIEW verifier.vw_poligonos_auto_intersecao
AS
SELECT
    s.id,
    s.codigo,
    N'subestacao'               AS feature_type,
    s.geom,
    N'VR-003'                   AS rule_code,
    N'HIGH'                     AS severity,
    s.geom.STIsValidReason()    AS detail
FROM rede_eletrica.subestacoes s
WHERE s.geom IS NOT NULL
  AND s.geom.STIsValid() = 0;
GO

PRINT 'View verifier.vw_poligonos_auto_intersecao (VR-003) created.';
GO

-- =============================================================================
-- VR-004: Geometric duplicate
-- Severity: LOW
-- Two or more features of the same type have exactly equal geometries (STEquals),
-- indicating a duplicate entry from a failed import or sync.
--
-- Uses id < id2 to avoid returning both (A,B) and (B,A) for the same pair.
-- Only reports the lower-id feature as the "duplicate to investigate".
-- =============================================================================

CREATE OR ALTER VIEW verifier.vw_duplicatas_geometricas
AS
-- Duplicate postes
SELECT
    a.id,
    a.codigo,
    N'poste'                                        AS feature_type,
    a.geom,
    N'VR-004'                                       AS rule_code,
    N'LOW'                                          AS severity,
    CONCAT(N'Geometria identica ao id=', b.id)      AS detail
FROM rede_eletrica.postes a
JOIN rede_eletrica.postes b
    ON a.id < b.id
   AND a.geom.STEquals(b.geom) = 1

UNION ALL

-- Duplicate trechos
SELECT
    a.id,
    a.codigo,
    N'trecho'                                       AS feature_type,
    a.geom,
    N'VR-004'                                       AS rule_code,
    N'LOW'                                          AS severity,
    CONCAT(N'Geometria identica ao id=', b.id)      AS detail
FROM rede_eletrica.trechos a
JOIN rede_eletrica.trechos b
    ON a.id < b.id
   AND a.geom.STEquals(b.geom) = 1;
GO

PRINT 'View verifier.vw_duplicatas_geometricas (VR-004) created.';
GO

-- =============================================================================
-- VR-005: SRID inconsistency
-- Severity: MEDIUM
-- A geometry's SRID does not match the expected project SRID (4326).
-- This causes silent wrong results in spatial operations mixing coordinate systems.
--
-- Applies to all 3 geometry tables (postes, trechos, subestacoes).
-- =============================================================================

CREATE OR ALTER VIEW verifier.vw_srid_inconsistente
AS
SELECT
    id,
    codigo,
    N'poste'                                            AS feature_type,
    geom,
    N'VR-005'                                           AS rule_code,
    N'MEDIUM'                                           AS severity,
    CONCAT(N'SRID=', geom.STSrid, N' (esperado: 4326)') AS detail
FROM rede_eletrica.postes
WHERE geom IS NOT NULL AND geom.STSrid <> 4326

UNION ALL

SELECT
    id,
    codigo,
    N'trecho'                                           AS feature_type,
    geom,
    N'VR-005'                                           AS rule_code,
    N'MEDIUM'                                           AS severity,
    CONCAT(N'SRID=', geom.STSrid, N' (esperado: 4326)') AS detail
FROM rede_eletrica.trechos
WHERE geom IS NOT NULL AND geom.STSrid <> 4326

UNION ALL

SELECT
    id,
    codigo,
    N'subestacao'                                       AS feature_type,
    geom,
    N'VR-005'                                           AS rule_code,
    N'MEDIUM'                                           AS severity,
    CONCAT(N'SRID=', geom.STSrid, N' (esperado: 4326)') AS detail
FROM rede_eletrica.subestacoes
WHERE geom IS NOT NULL AND geom.STSrid <> 4326;
GO

PRINT 'View verifier.vw_srid_inconsistente (VR-005) created.';
GO

-- =============================================================================
-- Helper view: unified inconsistency summary
-- Returns count per rule — used by GET /inconsistencias endpoint
-- =============================================================================

CREATE OR ALTER VIEW verifier.vw_resumo_inconsistencias
AS
SELECT rule_code, severity, COUNT(*) AS total
FROM (
    SELECT rule_code, severity FROM verifier.vw_pontos_fora_poligono
    UNION ALL
    SELECT rule_code, severity FROM verifier.vw_linhas_extremidade_solta
    UNION ALL
    SELECT rule_code, severity FROM verifier.vw_poligonos_auto_intersecao
    UNION ALL
    SELECT rule_code, severity FROM verifier.vw_duplicatas_geometricas
    UNION ALL
    SELECT rule_code, severity FROM verifier.vw_srid_inconsistente
) all_results
GROUP BY rule_code, severity;
GO

PRINT 'View verifier.vw_resumo_inconsistencias (summary) created.';
PRINT '=== Validation views setup complete ===';
GO
