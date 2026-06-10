-- =============================================================================
-- SQL Server 2022 — Spatial Schema
-- Project: poc-geoserver-sqlserver
-- Spec: specs/03-data-model-spec.md
--
-- IDEMPOTENT: safe to run multiple times (IF NOT EXISTS guards throughout)
-- SRID: 4326 (WGS84 geographic — see ADR-003 for geometry vs geography choice)
-- Bounding box: Paraná state, Brazil (-54.6 to -48.0 lon, -26.7 to -22.5 lat)
-- =============================================================================

USE master;
GO

-- Create database if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'geo_poc')
BEGIN
    CREATE DATABASE geo_poc
        COLLATE Latin1_General_CI_AS;
    PRINT 'Database geo_poc created.'
END
GO

USE geo_poc;
GO

-- =============================================================================
-- SCHEMAS
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'rede_eletrica')
    EXEC('CREATE SCHEMA rede_eletrica AUTHORIZATION dbo');
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'verifier')
    EXEC('CREATE SCHEMA verifier AUTHORIZATION dbo');
GO

PRINT 'Schemas ready: rede_eletrica, verifier';
GO

-- =============================================================================
-- TABLE: rede_eletrica.postes
-- Utility poles — approximately 50,000 POINT geometries
-- =============================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.tables t
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = N'rede_eletrica' AND t.name = N'postes'
)
BEGIN
    CREATE TABLE rede_eletrica.postes (
        id          INT IDENTITY(1,1)   NOT NULL,
        codigo      NVARCHAR(20)        NOT NULL,   -- Business key: P-XXXXX
        nome        NVARCHAR(100)       NOT NULL,
        tensao      NVARCHAR(20)        NOT NULL,   -- '13.8kV', '34.5kV', '69kV'
        material    NVARCHAR(20)        NOT NULL,   -- 'concreto', 'madeira', 'metalico'
        altura_m    DECIMAL(5,2)        NOT NULL,   -- 8.0 to 18.0
        geom        GEOMETRY            NOT NULL,   -- POINT, SRID 4326
        criado_em   DATETIME2           NOT NULL CONSTRAINT DF_postes_criado_em DEFAULT GETUTCDATE(),

        CONSTRAINT PK_postes        PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_postes_codigo UNIQUE (codigo),
        CONSTRAINT CHK_postes_tensao CHECK (tensao IN (N'13.8kV', N'34.5kV', N'69kV')),
        CONSTRAINT CHK_postes_material CHECK (material IN (N'concreto', N'madeira', N'metalico')),
        CONSTRAINT CHK_postes_altura CHECK (altura_m BETWEEN 8.0 AND 18.0)
    );

    PRINT 'Table rede_eletrica.postes created.';
END
ELSE
    PRINT 'Table rede_eletrica.postes already exists — skipped.';
GO

-- Spatial index — GEOMETRY_AUTO_GRID with Paraná bounding box
-- CELLS_PER_OBJECT=8: optimal for POINT (each point maps to 1 cell; 8 gives redundancy)
-- See ADR-003 for the full indexing rationale
IF NOT EXISTS (SELECT 1 FROM sys.spatial_indexes WHERE name = N'IX_postes_geom')
BEGIN
    CREATE SPATIAL INDEX IX_postes_geom
    ON rede_eletrica.postes(geom)
    USING GEOMETRY_AUTO_GRID
    WITH (
        BOUNDING_BOX   = (-54.6, -26.7, -48.0, -22.5),
        CELLS_PER_OBJECT = 8
    );
    PRINT 'Spatial index IX_postes_geom created.';
END
GO

-- =============================================================================
-- TABLE: rede_eletrica.trechos
-- Medium-voltage lines — approximately 100,000 LINESTRING geometries
-- =============================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.tables t
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = N'rede_eletrica' AND t.name = N'trechos'
)
BEGIN
    CREATE TABLE rede_eletrica.trechos (
        id              INT IDENTITY(1,1)   NOT NULL,
        codigo          NVARCHAR(20)        NOT NULL,   -- Business key: T-XXXXXX
        tensao          NVARCHAR(20)        NOT NULL,
        comprimento_m   DECIMAL(10,2)       NOT NULL CONSTRAINT DF_trechos_comp DEFAULT 0,
        tipo_cabo       NVARCHAR(30)        NOT NULL,   -- 'ACSR', 'XLPE', 'AAC'
        poste_inicio_id INT                 NULL,       -- NULL allowed: some trechos are dangling (VR-002)
        poste_fim_id    INT                 NULL,
        geom            GEOMETRY            NOT NULL,   -- LINESTRING, SRID 4326
        criado_em       DATETIME2           NOT NULL CONSTRAINT DF_trechos_criado_em DEFAULT GETUTCDATE(),

        CONSTRAINT PK_trechos           PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_trechos_codigo    UNIQUE (codigo),
        CONSTRAINT CHK_trechos_tensao   CHECK (tensao IN (N'13.8kV', N'34.5kV', N'69kV')),
        CONSTRAINT CHK_trechos_cabo     CHECK (tipo_cabo IN (N'ACSR', N'XLPE', N'AAC')),
        CONSTRAINT FK_trechos_inicio    FOREIGN KEY (poste_inicio_id) REFERENCES rede_eletrica.postes(id),
        CONSTRAINT FK_trechos_fim       FOREIGN KEY (poste_fim_id)    REFERENCES rede_eletrica.postes(id)
    );

    PRINT 'Table rede_eletrica.trechos created.';
END
ELSE
    PRINT 'Table rede_eletrica.trechos already exists — skipped.';
GO

-- Spatial index for trechos
-- CELLS_PER_OBJECT=16: LINESTRING features span multiple cells; more cells = better index coverage
IF NOT EXISTS (SELECT 1 FROM sys.spatial_indexes WHERE name = N'IX_trechos_geom')
BEGIN
    CREATE SPATIAL INDEX IX_trechos_geom
    ON rede_eletrica.trechos(geom)
    USING GEOMETRY_AUTO_GRID
    WITH (
        BOUNDING_BOX     = (-54.6, -26.7, -48.0, -22.5),
        CELLS_PER_OBJECT = 16
    );
    PRINT 'Spatial index IX_trechos_geom created.';
END
GO

-- =============================================================================
-- TABLE: rede_eletrica.subestacoes
-- Substations / concession areas — approximately 2,000 POLYGON geometries
-- =============================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.tables t
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = N'rede_eletrica' AND t.name = N'subestacoes'
)
BEGIN
    CREATE TABLE rede_eletrica.subestacoes (
        id              INT IDENTITY(1,1)   NOT NULL,
        codigo          NVARCHAR(20)        NOT NULL,   -- Business key: S-XXXX
        nome            NVARCHAR(100)       NOT NULL,
        capacidade_mva  DECIMAL(8,2)        NOT NULL,   -- 10.0 to 500.0 MVA
        geom            GEOMETRY            NOT NULL,   -- POLYGON, SRID 4326
        criado_em       DATETIME2           NOT NULL CONSTRAINT DF_subs_criado_em DEFAULT GETUTCDATE(),

        CONSTRAINT PK_subestacoes           PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_subestacoes_codigo    UNIQUE (codigo),
        CONSTRAINT CHK_subestacoes_cap      CHECK (capacidade_mva BETWEEN 10.0 AND 500.0)
    );

    PRINT 'Table rede_eletrica.subestacoes created.';
END
ELSE
    PRINT 'Table rede_eletrica.subestacoes already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.spatial_indexes WHERE name = N'IX_subestacoes_geom')
BEGIN
    CREATE SPATIAL INDEX IX_subestacoes_geom
    ON rede_eletrica.subestacoes(geom)
    USING GEOMETRY_AUTO_GRID
    WITH (
        BOUNDING_BOX     = (-54.6, -26.7, -48.0, -22.5),
        CELLS_PER_OBJECT = 16
    );
    PRINT 'Spatial index IX_subestacoes_geom created.';
END
GO

-- =============================================================================
-- SCHEMA: verifier
-- TABLE: inconsist_result — stores results of each validation run
-- =============================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.tables t
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = N'verifier' AND t.name = N'inconsist_result'
)
BEGIN
    CREATE TABLE verifier.inconsist_result (
        id           INT IDENTITY(1,1)   NOT NULL,
        run_id       UNIQUEIDENTIFIER    NOT NULL CONSTRAINT DF_inconsist_run DEFAULT NEWID(),
        rule_code    NVARCHAR(10)        NOT NULL,   -- 'VR-001' through 'VR-005'
        feature_type NVARCHAR(20)        NOT NULL,   -- 'poste', 'trecho', 'subestacao'
        feature_id   INT                 NOT NULL,
        severity     NVARCHAR(10)        NOT NULL,   -- 'HIGH', 'MEDIUM', 'LOW'
        detail       NVARCHAR(500)       NOT NULL,
        geom         GEOMETRY            NULL,       -- snapshot of the problematic geometry
        detected_at  DATETIME2           NOT NULL CONSTRAINT DF_inconsist_det DEFAULT GETUTCDATE(),

        CONSTRAINT PK_inconsist_result PRIMARY KEY CLUSTERED (id),
        CONSTRAINT CHK_rule_code    CHECK (rule_code IN (N'VR-001',N'VR-002',N'VR-003',N'VR-004',N'VR-005')),
        CONSTRAINT CHK_severity     CHECK (severity IN (N'HIGH',N'MEDIUM',N'LOW')),
        CONSTRAINT CHK_feature_type CHECK (feature_type IN (N'poste',N'trecho',N'subestacao'))
    );

    CREATE INDEX IX_inconsist_run  ON verifier.inconsist_result(run_id);
    CREATE INDEX IX_inconsist_rule ON verifier.inconsist_result(rule_code);

    PRINT 'Table verifier.inconsist_result created.';
END
ELSE
    PRINT 'Table verifier.inconsist_result already exists — skipped.';
GO

PRINT '=== Schema setup complete ===';
GO
