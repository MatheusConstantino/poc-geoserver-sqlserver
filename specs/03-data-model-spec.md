# Data Model Specification

**Status**: Accepted
**Version**: 1.0
**Refs**: Technical Spec `specs/01-technical-spec.md` | ADR-003

---

## Bounding Box (Paraná State, Brazil)
- minLon: -54.6, maxLon: -48.0
- minLat: -26.7, maxLat: -22.5
- SRID: 4326 (WGS84 geographic)

---

## SQL Server Schema: `rede_eletrica`

### Table: postes (~50k rows)
| Column | Type | Notes |
|--------|------|-------|
| id | INT IDENTITY PK | |
| codigo | NVARCHAR(20) | Unique business key, format: P-XXXXX |
| nome | NVARCHAR(100) | Descriptive name |
| tensao | NVARCHAR(20) | '13.8kV', '34.5kV', '69kV' |
| material | NVARCHAR(20) | 'concreto', 'madeira', 'metalico' |
| altura_m | DECIMAL(5,2) | 8.0 to 18.0 |
| geom | GEOMETRY | POINT, SRID 4326 |
| criado_em | DATETIME2 | DEFAULT GETUTCDATE() |

Spatial index:
```sql
CREATE SPATIAL INDEX IX_postes_geom ON rede_eletrica.postes(geom)
USING GEOMETRY_AUTO_GRID
WITH (BOUNDING_BOX = (-54.6, -26.7, -48.0, -22.5), CELLS_PER_OBJECT = 8)
```

### Table: trechos (~100k rows)
| Column | Type | Notes |
|--------|------|-------|
| id | INT IDENTITY PK | |
| codigo | NVARCHAR(20) | Format: T-XXXXXX |
| tensao | NVARCHAR(20) | Same enum as postes |
| comprimento_m | DECIMAL(10,2) | Computed from geom |
| tipo_cabo | NVARCHAR(30) | 'ACSR', 'XLPE', 'AAC' |
| poste_inicio_id | INT FK | FK → postes.id (nullable — some trechos are dangling) |
| poste_fim_id | INT FK | FK → postes.id (nullable) |
| geom | GEOMETRY | LINESTRING, SRID 4326 |
| criado_em | DATETIME2 | DEFAULT GETUTCDATE() |

Spatial index:
```sql
CREATE SPATIAL INDEX IX_trechos_geom ON rede_eletrica.trechos(geom)
USING GEOMETRY_AUTO_GRID
WITH (BOUNDING_BOX = (-54.6, -26.7, -48.0, -22.5), CELLS_PER_OBJECT = 16)
```
*CELLS_PER_OBJECT=16 for LINESTRING (more cells = better index for long features)*

### Table: subestacoes (~2k rows)
| Column | Type | Notes |
|--------|------|-------|
| id | INT IDENTITY PK | |
| codigo | NVARCHAR(20) | Format: S-XXXX |
| nome | NVARCHAR(100) | |
| capacidade_mva | DECIMAL(8,2) | 10.0 to 500.0 |
| geom | GEOMETRY | POLYGON, SRID 4326 |
| criado_em | DATETIME2 | DEFAULT GETUTCDATE() |

Spatial index:
```sql
CREATE SPATIAL INDEX IX_subestacoes_geom ON rede_eletrica.subestacoes(geom)
USING GEOMETRY_AUTO_GRID
WITH (BOUNDING_BOX = (-54.6, -26.7, -48.0, -22.5), CELLS_PER_OBJECT = 16)
```

---

## SQL Server Schema: `verifier`

### Table: inconsist_result
| Column | Type | Notes |
|--------|------|-------|
| id | INT IDENTITY PK | |
| run_id | UNIQUEIDENTIFIER | Groups results per validation run |
| rule_code | NVARCHAR(10) | 'VR-001' through 'VR-005' |
| feature_type | NVARCHAR(20) | 'poste', 'trecho', 'subestacao' |
| feature_id | INT | FK to the source table (not enforced — cross-schema) |
| severity | NVARCHAR(10) | 'HIGH', 'MEDIUM', 'LOW' |
| detail | NVARCHAR(500) | Human-readable description |
| geom | GEOMETRY | Snapshot of the problematic geometry |
| detected_at | DATETIME2 | DEFAULT GETUTCDATE() |

### Views (5 — see `specs/04-validation-rules-spec.md`)
- `verifier.vw_pontos_fora_poligono` — VR-001
- `verifier.vw_linhas_extremidade_solta` — VR-002
- `verifier.vw_poligonos_auto_intersecao` — VR-003
- `verifier.vw_duplicatas_geometricas` — VR-004
- `verifier.vw_srid_inconsistente` — VR-005

---

## PostGIS Schema (identical structure)

Same table names, same columns — with PostGIS type equivalents:
- `GEOMETRY` → `geometry(POINT, 4326)`, `geometry(LINESTRING, 4326)`, `geometry(POLYGON, 4326)`
- `DATETIME2` → `TIMESTAMPTZ DEFAULT NOW()`
- `IDENTITY` → `SERIAL` or `GENERATED ALWAYS AS IDENTITY`
- `NVARCHAR` → `VARCHAR`

PostGIS indexes (GIST — no bounding box needed):
```sql
CREATE INDEX idx_postes_geom ON rede_eletrica.postes USING GIST(geom);
CREATE INDEX idx_trechos_geom ON rede_eletrica.trechos USING GIST(geom);
CREATE INDEX idx_subestacoes_geom ON rede_eletrica.subestacoes USING GIST(geom);
```

---

## Seed Data — Inconsistency Injection Strategy

~15k total errors injected deterministically via SEED_RANDOM_SEED=42:

| Rule | Injection Method | Count |
|------|-----------------|-------|
| VR-001 | Move ~3000 postes to coordinates outside all subestacao polygons | ~3000 |
| VR-002 | Create ~4500 trechos with endpoints at isolated random coordinates | ~4500 |
| VR-003 | Insert ~2000 subestacoes with self-crossing polygon rings | ~2000 |
| VR-004 | Duplicate ~1500 postes + ~1500 trechos with exact same geometry | ~3000 |
| VR-005 | Set SRID=3857 on ~2000 features across all 3 tables | ~2000 |
