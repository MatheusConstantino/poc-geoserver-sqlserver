import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getPool as getSqlPool } from '../db/sqlserver.js'
import { getPool as getPgPool }  from '../db/postgis.js'
import type { BenchmarkRequest, BenchmarkResponse } from '../schemas/benchmark.js'

type ScenarioKey   = keyof NonNullable<BenchmarkResponse['scenarios']>
type ScenarioEntry = NonNullable<BenchmarkResponse['scenarios'][ScenarioKey]>

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCENARIOS_PATH = join(__dirname, '..', '..', '..', 'benchmark', 'scenarios.json')

interface ScenarioConfig {
  description:          string
  type:                 string
  table?:               string
  bbox?:                number[]
  point?:               number[]
  radius_degrees?:      number
  k?:                   number
  filter?:              Record<string, string>
  expected_rows_approx: number
}

interface ScenariosFile {
  scenarios: Record<string, ScenarioConfig>
}

// Build the SQL for each scenario type — same semantics, different syntax per DB
function buildQuery(id: string, cfg: ScenarioConfig, db: 'sqlserver' | 'postgis'): string {
  const isPg = db === 'postgis'

  switch (cfg.type) {
    case 'spatial_filter': {
      const [minX, minY, maxX, maxY] = cfg.bbox!
      if (isPg) {
        return `SELECT id, codigo FROM rede_eletrica.${cfg.table}
                WHERE geom && ST_MakeEnvelope(${minX},${minY},${maxX},${maxY},4326)
                  AND ST_Intersects(geom, ST_MakeEnvelope(${minX},${minY},${maxX},${maxY},4326))`
      }
      return `DECLARE @bbox geometry = geometry::STGeomFromText(
                'POLYGON((${minX} ${minY},${maxX} ${minY},${maxX} ${maxY},${minX} ${maxY},${minX} ${minY}))',4326)
              SELECT id,codigo FROM rede_eletrica.${cfg.table} WHERE geom.STIntersects(@bbox)=1`
    }

    case 'containment': {
      const [lon, lat] = cfg.point!
      if (isPg) {
        return `SELECT id,codigo FROM rede_eletrica.${cfg.table}
                WHERE ST_Contains(geom, ST_GeomFromText('POINT(${lon} ${lat})',4326))`
      }
      return `DECLARE @pt geometry=geometry::STGeomFromText('POINT(${lon} ${lat})',4326)
              SELECT id,codigo FROM rede_eletrica.${cfg.table} WHERE geom.STContains(@pt)=1`
    }

    case 'distance_filter': {
      const [lon, lat] = cfg.point!
      const r = cfg.radius_degrees!
      if (isPg) {
        return `SELECT id,codigo FROM rede_eletrica.${cfg.table}
                WHERE ST_DWithin(geom, ST_GeomFromText('POINT(${lon} ${lat})',4326), ${r})`
      }
      return `DECLARE @pt geometry=geometry::STGeomFromText('POINT(${lon} ${lat})',4326)
              SELECT id,codigo FROM rede_eletrica.${cfg.table} WHERE geom.STDistance(@pt)<${r}`
    }

    case 'spatial_join': {
      if (isPg) {
        return `SELECT p.id AS poste_id, t.id AS trecho_id
                FROM rede_eletrica.postes p
                JOIN rede_eletrica.trechos t ON ST_DWithin(p.geom, t.geom, 0.005)
                LIMIT 1000`
      }
      return `SELECT TOP 1000 p.id AS poste_id, t.id AS trecho_id
              FROM rede_eletrica.postes p
              JOIN rede_eletrica.trechos t ON p.geom.STDistance(t.geom)<0.005`
    }

    case 'spatial_aggregation_join':
    case 'aggregate': {
      if (isPg) {
        return `SELECT s.id, s.codigo, COUNT(p.id) AS total_postes
                FROM rede_eletrica.subestacoes s
                LEFT JOIN rede_eletrica.postes p ON ST_Within(p.geom, s.geom)
                GROUP BY s.id, s.codigo`
      }
      return `SELECT s.id, s.codigo, COUNT(p.id) AS total_postes
              FROM rede_eletrica.subestacoes s
              LEFT JOIN rede_eletrica.postes p ON p.geom.STWithin(s.geom)=1
              GROUP BY s.id, s.codigo`
    }

    case 'mixed': {
      const [minX, minY, maxX, maxY] = cfg.bbox!
      const tensao = cfg.filter?.tensao ?? '13.8kV'
      if (isPg) {
        return `SELECT id,codigo FROM rede_eletrica.postes
                WHERE tensao='${tensao}'
                  AND ST_Intersects(geom, ST_MakeEnvelope(${minX},${minY},${maxX},${maxY},4326))`
      }
      return `DECLARE @bbox geometry=geometry::STGeomFromText(
                'POLYGON((${minX} ${minY},${maxX} ${minY},${maxX} ${maxY},${minX} ${maxY},${minX} ${minY}))',4326)
              SELECT id,codigo FROM rede_eletrica.postes WHERE tensao=N'${tensao}' AND geom.STIntersects(@bbox)=1`
    }

    case 'validity_scan': {
      if (isPg) {
        return `SELECT id,codigo FROM rede_eletrica.${cfg.table} WHERE NOT ST_IsValid(geom)`
      }
      return `SELECT id,codigo FROM rede_eletrica.${cfg.table} WHERE geom.STIsValid()=0`
    }

    case 'knn': {
      const [lon, lat] = cfg.point!
      const k = cfg.k ?? 5
      if (isPg) {
        return `SELECT id,codigo FROM rede_eletrica.postes
                ORDER BY geom <-> ST_GeomFromText('POINT(${lon} ${lat})',4326)
                LIMIT ${k}`
      }
      return `SELECT TOP ${k} id,codigo
              FROM rede_eletrica.postes
              ORDER BY geom.STDistance(geometry::STGeomFromText('POINT(${lon} ${lat})',4326))`
    }

    case 'self_join': {
      if (isPg) {
        return `SELECT a.id AS id_a, b.id AS id_b
                FROM rede_eletrica.trechos a
                JOIN rede_eletrica.trechos b ON a.id < b.id AND ST_Intersects(a.geom,b.geom)
                LIMIT 500`
      }
      return `SELECT TOP 500 a.id AS id_a, b.id AS id_b
              FROM rede_eletrica.trechos a
              JOIN rede_eletrica.trechos b ON a.id<b.id AND a.geom.STIntersects(b.geom)=1`
    }

    case 'cross_schema': {
      if (isPg) {
        return `SELECT p.id,p.codigo,v.detail
                FROM rede_eletrica.postes p
                JOIN verifier.vw_pontos_fora_poligono v ON p.id=v.id`
      }
      return `SELECT p.id,p.codigo,v.detail
              FROM rede_eletrica.postes p
              JOIN verifier.vw_pontos_fora_poligono v ON p.id=v.id`
    }

    case 'validation_full': {
      if (isPg) {
        return `SELECT rule_code, severity, total FROM verifier.vw_resumo_inconsistencias`
      }
      return `SELECT rule_code, severity, total FROM verifier.vw_resumo_inconsistencias`
    }

    default:
      return isPg ? 'SELECT 1' : 'SELECT 1'
  }
}

async function measureQuery(
  query: string,
  db:    'sqlserver' | 'postgis',
  opts:  BenchmarkRequest['options']
): Promise<{ p50: number; p95: number; p99: number; throughput_rps: number; iterations: number }> {
  const timings: number[] = []

  const runOnce = async (): Promise<void> => {
    const t = Date.now()
    if (db === 'sqlserver') {
      const pool = await getSqlPool()
      await pool.request().query(query)
    } else {
      await getPgPool().query(query)
    }
    timings.push(Date.now() - t)
  }

  // Warmup
  for (let i = 0; i < opts.warmup_iterations; i++) await runOnce()

  // Measured
  timings.length = 0
  for (let i = 0; i < opts.measured_iterations; i++) await runOnce()

  timings.sort((a, b) => a - b)
  const n = timings.length
  const p50 = timings[Math.floor(n * 0.50)] ?? 0
  const p95 = timings[Math.floor(n * 0.95)] ?? 0
  const p99 = timings[Math.floor(n * 0.99)] ?? 0
  const avg = timings.reduce((s, v) => s + v, 0) / n
  const throughput_rps = avg > 0 ? Math.round(1000 / avg) : 0

  return { p50, p95, p99, throughput_rps, iterations: n }
}

export async function runBenchmark(req: BenchmarkRequest): Promise<BenchmarkResponse> {
  const start     = Date.now()
  const file      = JSON.parse(readFileSync(SCENARIOS_PATH, 'utf8')) as ScenariosFile
  const allScenarios = file.scenarios

  const scenarioIds = req.scenarios === 'all'
    ? (Object.keys(allScenarios) as Array<keyof typeof allScenarios>)
    : req.scenarios

  const scenarioResults: BenchmarkResponse['scenarios'] = {}

  for (const id of scenarioIds) {
    const cfg = allScenarios[id]
    if (!cfg) continue

    const entry: ScenarioEntry = { description: cfg.description }

    for (const db of req.databases) {
      try {
        const query   = buildQuery(id, cfg, db)
        const metrics = await measureQuery(query, db, req.options)
        entry[db] = metrics
      } catch (err) {
        entry[db] = {
          p50: 0, p95: 0, p99: 0, throughput_rps: 0,
          iterations: 0,
          error: err instanceof Error ? err.message : 'unknown error',
        }
      }
    }

    // Determine winner (by p95)
    if (entry.sqlserver && entry.postgis && !entry.sqlserver.error && !entry.postgis.error) {
      const diff = entry.postgis.p95 - entry.sqlserver.p95
      if (Math.abs(diff) < 5) {
        entry.winner = 'tie'
        entry.margin_pct = 0
      } else {
        entry.winner = diff > 0 ? 'sqlserver' : 'postgis'
        const loser = diff > 0 ? entry.postgis.p95 : entry.sqlserver.p95
        const winner = diff > 0 ? entry.sqlserver.p95 : entry.postgis.p95
        entry.margin_pct = loser > 0 ? Math.round(((loser - winner) / loser) * 100) : 0
      }
    } else {
      entry.winner = 'error'
    }

    scenarioResults[id as ScenarioKey] = entry
  }

  return {
    timestamp:         new Date().toISOString(),
    total_duration_ms: Date.now() - start,
    scenarios:         scenarioResults,
  }
}
