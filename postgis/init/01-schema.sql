-- =============================================================================
-- PostgreSQL 16 + PostGIS 3.4 — Spatial Schema
-- Project: poc-geoserver-sqlserver
-- Spec: specs/03-data-model-spec.md
--
-- IDEMPOTENT: uses IF NOT EXISTS, CREATE OR REPLACE VIEW
-- Schema mirrors SQL Server exactly (same table names, same column names)
-- to ensure benchmark comparisons are valid — see ADR-001.
--
-- PostGIS differences from SQL Server:
--   geometry type uses typed syntax: geometry(POINT, 4326)
--   IDENTITY → GENERATED ALWAYS AS IDENTITY
--   DATETIME2 → TIMESTAMPTZ
--   NVARCHAR → VARCHAR
--   Spatial indexes: GIST (no bounding box needed — adapts automatically)
-- =============================================================================

-- Enable PostGIS extension (idempotent)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- =============================================================================
-- SCHEMAS
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS rede_eletrica;
CREATE SCHEMA IF NOT EXISTS verifier;

-- =============================================================================
-- TABLE: rede_eletrica.postes
-- =============================================================================

CREATE TABLE IF NOT EXISTS rede_eletrica.postes (
    id          INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      VARCHAR(20)     NOT NULL,
    nome        VARCHAR(100)    NOT NULL,
    tensao      VARCHAR(20)     NOT NULL CHECK (tensao IN ('13.8kV', '34.5kV', '69kV')),
    material    VARCHAR(20)     NOT NULL CHECK (material IN ('concreto', 'madeira', 'metalico')),
    altura_m    DECIMAL(5,2)    NOT NULL CHECK (altura_m BETWEEN 8.0 AND 18.0),
    geom        geometry(POINT, 4326) NOT NULL,
    criado_em   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_postes_codigo UNIQUE (codigo)
);

-- GIST spatial index (no bounding box needed — PostGIS adapts automatically)
CREATE INDEX IF NOT EXISTS idx_postes_geom ON rede_eletrica.postes USING GIST(geom);

-- Attribute indexes to support mixed queries (benchmark B09)
CREATE INDEX IF NOT EXISTS idx_postes_tensao ON rede_eletrica.postes(tensao);

-- =============================================================================
-- TABLE: rede_eletrica.trechos
-- =============================================================================

CREATE TABLE IF NOT EXISTS rede_eletrica.trechos (
    id              INTEGER             GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          VARCHAR(20)         NOT NULL,
    tensao          VARCHAR(20)         NOT NULL CHECK (tensao IN ('13.8kV', '34.5kV', '69kV')),
    comprimento_m   DECIMAL(10,2)       NOT NULL DEFAULT 0,
    tipo_cabo       VARCHAR(30)         NOT NULL CHECK (tipo_cabo IN ('ACSR', 'XLPE', 'AAC')),
    poste_inicio_id INTEGER             NULL REFERENCES rede_eletrica.postes(id),
    poste_fim_id    INTEGER             NULL REFERENCES rede_eletrica.postes(id),
    geom            geometry(LINESTRING, 4326) NOT NULL,
    criado_em       TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_trechos_codigo UNIQUE (codigo)
);

CREATE INDEX IF NOT EXISTS idx_trechos_geom ON rede_eletrica.trechos USING GIST(geom);

-- =============================================================================
-- TABLE: rede_eletrica.subestacoes
-- =============================================================================

CREATE TABLE IF NOT EXISTS rede_eletrica.subestacoes (
    id              INTEGER             GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          VARCHAR(20)         NOT NULL,
    nome            VARCHAR(100)        NOT NULL,
    capacidade_mva  DECIMAL(8,2)        NOT NULL CHECK (capacidade_mva BETWEEN 10.0 AND 500.0),
    geom            geometry(POLYGON, 4326) NOT NULL,
    criado_em       TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_subestacoes_codigo UNIQUE (codigo)
);

CREATE INDEX IF NOT EXISTS idx_subestacoes_geom ON rede_eletrica.subestacoes USING GIST(geom);

-- =============================================================================
-- SCHEMA: verifier
-- TABLE: inconsist_result
-- =============================================================================

CREATE TABLE IF NOT EXISTS verifier.inconsist_result (
    id           INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id       UUID            NOT NULL DEFAULT gen_random_uuid(),
    rule_code    VARCHAR(10)     NOT NULL CHECK (rule_code IN ('VR-001','VR-002','VR-003','VR-004','VR-005')),
    feature_type VARCHAR(20)     NOT NULL CHECK (feature_type IN ('poste','trecho','subestacao')),
    feature_id   INTEGER         NOT NULL,
    severity     VARCHAR(10)     NOT NULL CHECK (severity IN ('HIGH','MEDIUM','LOW')),
    detail       VARCHAR(500)    NOT NULL,
    geom         geometry        NULL,
    detected_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inconsist_run  ON verifier.inconsist_result(run_id);
CREATE INDEX IF NOT EXISTS idx_inconsist_rule ON verifier.inconsist_result(rule_code);

-- =============================================================================
-- VALIDATION VIEWS
-- PostGIS equivalents of the SQL Server views in sqlserver/views/validation-views.sql
-- Uses ST_* functions (PostGIS) vs STXxx methods (SQL Server)
-- =============================================================================

-- VR-001: Point outside expected polygon
CREATE OR REPLACE VIEW verifier.vw_pontos_fora_poligono AS
SELECT
    p.id,
    p.codigo,
    'poste'                                         AS feature_type,
    p.geom,
    'VR-001'                                        AS rule_code,
    'HIGH'                                          AS severity,
    'Poste fora de qualquer area de concessao'      AS detail
FROM rede_eletrica.postes p
WHERE NOT EXISTS (
    SELECT 1
    FROM rede_eletrica.subestacoes s
    WHERE ST_Intersects(p.geom, s.geom)
);

-- VR-002: Line with dangling endpoint
-- PostGIS: ST_StartPoint / ST_EndPoint + ST_DWithin (index-aware distance check)
-- ST_DWithin uses the GIST index — more efficient than ST_Distance for radius checks
CREATE OR REPLACE VIEW verifier.vw_linhas_extremidade_solta AS
SELECT
    t.id,
    t.codigo,
    'trecho'                                        AS feature_type,
    t.geom,
    'VR-002'                                        AS rule_code,
    'MEDIUM'                                        AS severity,
    'Extremidade inicial solta (nao conectada)'     AS detail
FROM rede_eletrica.trechos t
WHERE
    NOT EXISTS (
        SELECT 1 FROM rede_eletrica.postes p
        WHERE ST_DWithin(ST_StartPoint(t.geom), p.geom, 0.005)
    )
    AND NOT EXISTS (
        SELECT 1 FROM rede_eletrica.trechos t2
        WHERE t.id <> t2.id
          AND ST_DWithin(ST_StartPoint(t.geom), ST_EndPoint(t2.geom), 0.005)
    )

UNION ALL

SELECT
    t.id,
    t.codigo,
    'trecho'                                        AS feature_type,
    t.geom,
    'VR-002'                                        AS rule_code,
    'MEDIUM'                                        AS severity,
    'Extremidade final solta (nao conectada)'       AS detail
FROM rede_eletrica.trechos t
WHERE
    NOT EXISTS (
        SELECT 1 FROM rede_eletrica.postes p
        WHERE ST_DWithin(ST_EndPoint(t.geom), p.geom, 0.005)
    )
    AND NOT EXISTS (
        SELECT 1 FROM rede_eletrica.trechos t2
        WHERE t.id <> t2.id
          AND ST_DWithin(ST_EndPoint(t.geom), ST_StartPoint(t2.geom), 0.005)
    );

-- VR-003: Self-intersecting polygon
-- Key difference: PostGIS ST_IsValid raises error for NULL input — guard with IS NOT NULL
CREATE OR REPLACE VIEW verifier.vw_poligonos_auto_intersecao AS
SELECT
    s.id,
    s.codigo,
    'subestacao'                AS feature_type,
    s.geom,
    'VR-003'                    AS rule_code,
    'HIGH'                      AS severity,
    ST_IsValidReason(s.geom)    AS detail
FROM rede_eletrica.subestacoes s
WHERE s.geom IS NOT NULL
  AND NOT ST_IsValid(s.geom);

-- VR-004: Geometric duplicate
CREATE OR REPLACE VIEW verifier.vw_duplicatas_geometricas AS
SELECT
    a.id,
    a.codigo,
    'poste'                                         AS feature_type,
    a.geom,
    'VR-004'                                        AS rule_code,
    'LOW'                                           AS severity,
    'Geometria identica ao id=' || b.id::text       AS detail
FROM rede_eletrica.postes a
JOIN rede_eletrica.postes b ON a.id < b.id AND ST_Equals(a.geom, b.geom)

UNION ALL

SELECT
    a.id,
    a.codigo,
    'trecho'                                        AS feature_type,
    a.geom,
    'VR-004'                                        AS rule_code,
    'LOW'                                           AS severity,
    'Geometria identica ao id=' || b.id::text       AS detail
FROM rede_eletrica.trechos a
JOIN rede_eletrica.trechos b ON a.id < b.id AND ST_Equals(a.geom, b.geom);

-- VR-005: SRID inconsistency
-- PostGIS: ST_SRID(geom) function vs SQL Server's geom.STSrid property
CREATE OR REPLACE VIEW verifier.vw_srid_inconsistente AS
SELECT id, codigo, 'poste' AS feature_type, geom, 'VR-005' AS rule_code, 'MEDIUM' AS severity,
       'SRID=' || ST_SRID(geom)::text || ' (esperado: 4326)' AS detail
FROM rede_eletrica.postes WHERE geom IS NOT NULL AND ST_SRID(geom) <> 4326

UNION ALL

SELECT id, codigo, 'trecho' AS feature_type, geom, 'VR-005' AS rule_code, 'MEDIUM' AS severity,
       'SRID=' || ST_SRID(geom)::text || ' (esperado: 4326)' AS detail
FROM rede_eletrica.trechos WHERE geom IS NOT NULL AND ST_SRID(geom) <> 4326

UNION ALL

SELECT id, codigo, 'subestacao' AS feature_type, geom, 'VR-005' AS rule_code, 'MEDIUM' AS severity,
       'SRID=' || ST_SRID(geom)::text || ' (esperado: 4326)' AS detail
FROM rede_eletrica.subestacoes WHERE geom IS NOT NULL AND ST_SRID(geom) <> 4326;

-- Summary view
CREATE OR REPLACE VIEW verifier.vw_resumo_inconsistencias AS
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
