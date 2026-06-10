import sql from 'mssql'
import { getPool } from '../db/sqlserver.js'
import type { InconsistenciasResponse } from '../schemas/inconsistencias.js'

const RULE_DESCRIPTIONS: Record<string, string> = {
  'VR-001': 'Point outside expected polygon',
  'VR-002': 'Line with dangling endpoint',
  'VR-003': 'Self-intersecting polygon',
  'VR-004': 'Geometric duplicate',
  'VR-005': 'SRID inconsistency',
}

const VIEW_MAP: Record<string, string> = {
  'VR-001': 'verifier.vw_pontos_fora_poligono',
  'VR-002': 'verifier.vw_linhas_extremidade_solta',
  'VR-003': 'verifier.vw_poligonos_auto_intersecao',
  'VR-004': 'verifier.vw_duplicatas_geometricas',
  'VR-005': 'verifier.vw_srid_inconsistente',
}

export async function runValidation(opts: {
  rule?:           string
  limit:           number
  include_samples: boolean
}): Promise<InconsistenciasResponse> {
  const start = Date.now()
  const pool  = await getPool()

  const rulesToRun = opts.rule
    ? [opts.rule]
    : Object.keys(VIEW_MAP)

  // Run all views in parallel for speed
  const results = await Promise.all(
    rulesToRun.map(async (ruleCode) => {
      const view = VIEW_MAP[ruleCode]
      if (!view) return { ruleCode, count: 0, samples: [] }

      // Count query
      const countRes = await pool.request().query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM ${view}`
      )
      const count = countRes.recordset[0]?.total ?? 0

      // Samples query (only id, codigo, feature_type, detail — no geometry serialization)
      let samples: Array<{ id: number; feature_type: string; codigo: string; detail: string }> = []
      if (opts.include_samples && count > 0) {
        const samplesRes = await pool.request()
          .input('limit', sql.Int, opts.limit)
          .query<{ id: number; feature_type: string; codigo: string; detail: string }>(
            `SELECT TOP (@limit) id, feature_type, codigo, detail FROM ${view}`
          )
        samples = samplesRes.recordset
      }

      return { ruleCode, count, samples }
    })
  )

  // Fetch severity from summary view
  const summaryRes = await pool.request().query<{
    rule_code: string
    severity:  string
    total:     number
  }>('SELECT rule_code, severity, total FROM verifier.vw_resumo_inconsistencias')

  const severityMap: Record<string, string> = {}
  for (const row of summaryRes.recordset) {
    severityMap[row.rule_code] = row.severity
  }

  const byRule: InconsistenciasResponse['summary']['by_rule'] = {}
  const sampleMap: InconsistenciasResponse['samples'] = {}
  let grandTotal = 0

  for (const { ruleCode, count, samples } of results) {
    const key = ruleCode as keyof typeof byRule
    byRule[key] = {
      count,
      severity:    (severityMap[ruleCode] ?? 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW',
      description: RULE_DESCRIPTIONS[ruleCode] ?? ruleCode,
    }
    sampleMap[key] = samples
    grandTotal += count
  }

  return {
    timestamp:    new Date().toISOString(),
    database:     'sqlserver',
    execution_ms: Date.now() - start,
    summary:      { total: grandTotal, by_rule: byRule },
    samples:      sampleMap,
  }
}
