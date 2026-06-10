# API Specification

**Status**: Accepted
**Version**: 1.0
**Base URL**: `http://localhost:3000`
**Refs**: Technical Spec `specs/01-technical-spec.md`

---

## Conventions

- All responses are `application/json`
- All timestamps are ISO 8601 UTC (`2025-01-15T10:30:00Z`)
- All geometry in responses uses GeoJSON format (SRID 4326 implied)
- Error format: `{ "error": string, "code": string, "details"?: object }`
- Pagination: `?limit=100&offset=0` where applicable (default limit: 100, max: 1000)

---

## Endpoints

### `GET /health`

Returns system health including downstream service connectivity.

**Response 200:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00Z",
  "uptime": 3600,
  "version": "1.0.0",
  "databases": {
    "sqlserver": {
      "status": "connected",
      "latency_ms": 4,
      "version": "Microsoft SQL Server 2022"
    },
    "postgis": {
      "status": "connected",
      "latency_ms": 2,
      "version": "PostgreSQL 16.2 on PostGIS 3.4.0"
    }
  },
  "geoserver": {
    "status": "reachable",
    "latency_ms": 15
  }
}
```

**Response 503** (any dependency unhealthy):
```json
{
  "status": "degraded",
  "timestamp": "2025-01-15T10:30:00Z",
  "databases": {
    "sqlserver": { "status": "disconnected", "error": "connection refused" },
    "postgis": { "status": "connected", "latency_ms": 2 }
  }
}
```

---

### `GET /inconsistencias`

Executes all 5 spatial validation views against SQL Server and returns the inconsistency report.

**Query Parameters:**
- `rule` (optional): filter to specific rule, e.g., `?rule=VR-001`
- `limit` (optional): max samples per rule (default: 10, max: 100)
- `include_samples` (optional, boolean): include sample geometries (default: true)

**Response 200:**
```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "database": "sqlserver",
  "execution_ms": 420,
  "summary": {
    "total": 14982,
    "by_rule": {
      "VR-001": { "count": 2987, "severity": "HIGH", "description": "Point outside expected polygon" },
      "VR-002": { "count": 4521, "severity": "MEDIUM", "description": "Line with dangling endpoint" },
      "VR-003": { "count": 1998, "severity": "HIGH", "description": "Self-intersecting polygon" },
      "VR-004": { "count": 3001, "severity": "LOW", "description": "Geometric duplicate" },
      "VR-005": { "count": 2475, "severity": "MEDIUM", "description": "SRID inconsistency" }
    }
  },
  "samples": {
    "VR-001": [
      {
        "id": 12345,
        "type": "poste",
        "geometry": { "type": "Point", "coordinates": [-51.23, -25.45] },
        "expected_polygon_id": null,
        "distance_to_nearest_polygon_m": 1523.4
      }
    ]
  }
}
```

**Response 500:**
```json
{
  "error": "Validation query failed",
  "code": "VALIDATION_QUERY_ERROR",
  "details": { "rule": "VR-002", "sql_error": "..." }
}
```

---

### `POST /benchmark/run`

Runs parameterized benchmark scenarios against SQL Server and/or PostGIS.

**Request body:**
```json
{
  "scenarios": "all",
  "databases": ["sqlserver", "postgis"],
  "options": {
    "warmup_iterations": 3,
    "measured_iterations": 10,
    "timeout_ms": 5000
  }
}
```

`scenarios` accepts: `"all"` | `string[]` (e.g., `["B01", "B07", "B15"]`)
`databases` accepts: `["sqlserver"]` | `["postgis"]` | `["sqlserver", "postgis"]`

**Response 200:**
```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "total_duration_ms": 45230,
  "scenarios": {
    "B01": {
      "description": "Bbox query — dense region (Curitiba area)",
      "sqlserver": { "p50": 12, "p95": 28, "p99": 45, "throughput_rps": 385, "iterations": 10 },
      "postgis":   { "p50": 9,  "p95": 21, "p99": 34, "throughput_rps": 480, "iterations": 10 },
      "winner": "postgis",
      "margin_pct": 25
    },
    "B07": {
      "description": "JOIN: pole ↔ line (spatial join 50k × 100k)",
      "sqlserver": { "p50": 145, "p95": 312, "p99": 489, "throughput_rps": 32, "iterations": 10 },
      "postgis":   { "p50": 98,  "p95": 201, "p99": 287, "throughput_rps": 50, "iterations": 10 },
      "winner": "postgis",
      "margin_pct": 36
    }
  }
}
```

---

### `POST /ai/analyze-inconsistencies`

Sends a validation report to Claude API for intelligent natural-language analysis.

**Request body:** Same structure as `GET /inconsistencias` response (pass it directly).

**Response 200:**
```json
{
  "model": "claude-sonnet-4-6",
  "input_tokens": 842,
  "output_tokens": 412,
  "analysis": {
    "severity_assessment": "HIGH — 4985 critical inconsistencies require immediate attention",
    "top_priorities": [
      {
        "rank": 1,
        "rule": "VR-001",
        "count": 2987,
        "recommendation": "Run a bulk spatial join to identify which postes lack coverage. Filter by distance > 100m to distinguish true outliers from boundary cases.",
        "sql_hint": "SELECT p.id FROM postes p WHERE NOT EXISTS (SELECT 1 FROM subestacoes s WHERE p.geom.STWithin(s.geom) = 1)"
      }
    ],
    "patterns_detected": [
      "Dangling endpoints cluster in the northwestern region — likely a seed generation artifact",
      "Self-intersecting polygons appear to be uniformly distributed — expected from random injection"
    ],
    "next_steps": [
      "Prioritize VR-001 and VR-003 (HIGH severity) in the correction workflow",
      "VR-004 duplicates can be batch-resolved with a deduplication query",
      "Investigate VR-002 clustering in northwest region before bulk correction"
    ]
  }
}
```

**Response 502** (Claude API unavailable):
```json
{
  "error": "AI service temporarily unavailable",
  "code": "AI_UPSTREAM_ERROR",
  "details": { "status": 529, "anthropic_error": "overloaded_error" }
}
```

---

### `POST /ai/benchmark-insights`

Sends benchmark results to Claude for tradeoff analysis and optimization recommendations.

**Request body:** Same structure as `POST /benchmark/run` response.

**Response 200:**
```json
{
  "model": "claude-sonnet-4-6",
  "insights": {
    "executive_summary": "PostGIS outperforms SQL Server on 11 of 15 scenarios, with the largest gap in spatial JOIN operations (36% faster). SQL Server shows competitive performance on simple bbox queries.",
    "tradeoff_analysis": {
      "sql_server_wins": ["B01", "B02", "B09"],
      "postgis_wins": ["B03", "B05", "B06", "B07", "B08", "B10", "B11", "B12", "B13", "B14", "B15"],
      "key_insight": "SQL Server's performance advantage disappears above 10k result rows due to serialization overhead in the JDBC driver."
    },
    "optimization_suggestions": [
      {
        "applies_to": "sqlserver",
        "scenario": "B07",
        "suggestion": "Add a filtered spatial index on trechos for the Curitiba bounding box region — reduces index scan from full 100k to ~12k rows.",
        "expected_improvement": "40-60% p95 reduction"
      }
    ],
    "cost_analysis": {
      "note": "At 50k features, licensing cost dominates: SQL Server Developer is free; Standard is $3,586/core/year. PostGIS is free at any scale.",
      "break_even": "PostGIS is cost-superior from day 1 for open-source stacks."
    }
  }
}
```

---

### `GET /ai/query-suggestions`

Returns AI-generated query optimization suggestions for a specific scenario.

**Query parameters:**
- `scenario` (required): e.g., `B07`
- `database` (optional): `sqlserver` | `postgis` (default: both)

**Response 200:**
```json
{
  "scenario": "B07",
  "suggestions": [
    {
      "database": "sqlserver",
      "current_query": "SELECT p.id, t.id FROM postes p JOIN trechos t ON p.geom.STDistance(t.geom) < 0.001",
      "optimized_query": "SELECT p.id, t.id FROM postes p WITH (INDEX(IX_postes_geom)) JOIN trechos t WITH (INDEX(IX_trechos_geom)) ON p.geom.STIntersects(t.geom.STBuffer(0.001)) = 1",
      "explanation": "Use STIntersects with STBuffer instead of STDistance for index utilization. STDistance requires computing distance for all candidate pairs; STIntersects can use the spatial index to prune candidates early.",
      "estimated_improvement": "3-5x on datasets > 10k rows"
    }
  ]
}
```
