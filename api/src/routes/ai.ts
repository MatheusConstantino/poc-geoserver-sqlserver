import { readFileSync }      from 'fs'
import { join, dirname }    from 'path'
import { fileURLToPath }    from 'url'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z }                from 'zod'

import { ask,
  AiConfigError, AiRateLimitError, AiUpstreamError,
  AiInvalidResponse, AiTimeoutError, AiRequestTooLarge,
} from '../ai/claude-client.js'

import * as analyzePrompt    from '../ai/prompts/analyze-inconsistencies.js'
import * as insightsPrompt   from '../ai/prompts/benchmark-insights.js'
import * as optimizerPrompt  from '../ai/prompts/query-optimizer.js'

import { InconsistencyAnalysisSchema } from '../ai/schemas/inconsistency-analysis.js'
import { BenchmarkInsightsSchema }     from '../ai/schemas/benchmark-insights.js'
import { QuerySuggestionsSchema }      from '../ai/schemas/query-suggestions.js'

import { ScenarioIdSchema }            from '../schemas/benchmark.js'

// ---------------------------------------------------------------------------
// Scenarios file (for query-suggestions)
// ---------------------------------------------------------------------------
const __dirname    = dirname(fileURLToPath(import.meta.url))
const SCENARIOS_PATH = join(__dirname, '..', '..', '..', 'benchmark', 'scenarios.json')

interface ScenarioConfig {
  description: string
  type:        string
  table?:      string
  bbox?:       number[]
  point?:      number[]
  radius_degrees?: number
  k?:          number
  filter?:     Record<string, string>
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------
function handleAiError(err: unknown, reply: FastifyReply): void {
  if (err instanceof AiConfigError)     { reply.code(500).send({ error: err.message,  code: err.code }); return }
  if (err instanceof AiRateLimitError)  { reply.code(429).send({ error: err.message,  code: err.code, retry_after: err.retryAfter }); return }
  if (err instanceof AiUpstreamError)   { reply.code(502).send({ error: err.message,  code: err.code }); return }
  if (err instanceof AiInvalidResponse) { reply.code(500).send({ error: err.message,  code: err.code }); return }
  if (err instanceof AiTimeoutError)    { reply.code(504).send({ error: err.message,  code: err.code }); return }
  if (err instanceof AiRequestTooLarge) { reply.code(413).send({ error: err.message,  code: err.code }); return }
  throw err
}

// ---------------------------------------------------------------------------
export async function aiRoutes(app: FastifyInstance): Promise<void> {

  // -----------------------------------------------------------------------
  // POST /ai/analyze-inconsistencies
  // -----------------------------------------------------------------------
  app.post('/ai/analyze-inconsistencies', async (req, reply) => {
    const bodyCheck = z.object({ summary: z.object({}).passthrough(), samples: z.record(z.unknown()).optional() })
      .safeParse(req.body)
    if (!bodyCheck.success) {
      return reply.code(400).send({ error: 'Body must contain at least a "summary" object', code: 'INVALID_BODY' })
    }

    try {
      const { result, usage } = await ask(
        analyzePrompt.SYSTEM_PROMPT,
        analyzePrompt.buildUserMessage(req.body),
        InconsistencyAnalysisSchema,
      )
      app.log.info({ endpoint: 'analyze-inconsistencies', ...usage }, 'Claude usage')
      return reply.code(200).send({ ...result, _meta: { model: 'claude-sonnet-4-6', ...usage } })
    } catch (err) {
      handleAiError(err, reply)
    }
  })

  // -----------------------------------------------------------------------
  // POST /ai/benchmark-insights
  // -----------------------------------------------------------------------
  app.post('/ai/benchmark-insights', async (req, reply) => {
    const bodyCheck = z.object({ scenarios: z.record(z.unknown()) })
      .safeParse(req.body)
    if (!bodyCheck.success) {
      return reply.code(400).send({ error: 'Body must contain a "scenarios" object', code: 'INVALID_BODY' })
    }

    try {
      const { result, usage } = await ask(
        insightsPrompt.SYSTEM_PROMPT,
        insightsPrompt.buildUserMessage(req.body),
        BenchmarkInsightsSchema,
      )
      app.log.info({ endpoint: 'benchmark-insights', ...usage }, 'Claude usage')
      return reply.code(200).send({ ...result, _meta: { model: 'claude-sonnet-4-6', ...usage } })
    } catch (err) {
      handleAiError(err, reply)
    }
  })

  // -----------------------------------------------------------------------
  // GET /ai/query-suggestions?scenario=B07
  // -----------------------------------------------------------------------
  app.get('/ai/query-suggestions', async (req, reply) => {
    const parsed = z.object({ scenario: ScenarioIdSchema }).safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error:   'Invalid query parameter',
        details: parsed.error.flatten().fieldErrors,
        code:    'INVALID_QUERY',
      })
    }

    const scenarioId = parsed.data.scenario
    let scenariosFile: { scenarios: Record<string, ScenarioConfig> }
    try {
      scenariosFile = JSON.parse(readFileSync(SCENARIOS_PATH, 'utf8'))
    } catch {
      return reply.code(500).send({ error: 'Could not read scenarios.json', code: 'INTERNAL_ERROR' })
    }

    const cfg = scenariosFile.scenarios[scenarioId]
    if (!cfg) {
      return reply.code(404).send({ error: `Scenario ${scenarioId} not found`, code: 'NOT_FOUND' })
    }

    // Build representative queries from scenarios.json metadata for context
    const sqlQuery  = buildRepresentativeQuery(scenarioId, cfg, 'sqlserver')
    const pgQuery   = buildRepresentativeQuery(scenarioId, cfg, 'postgis')

    try {
      const { result, usage } = await ask(
        optimizerPrompt.SYSTEM_PROMPT,
        optimizerPrompt.buildUserMessage(scenarioId, cfg.description, sqlQuery, pgQuery),
        QuerySuggestionsSchema,
      )
      app.log.info({ endpoint: 'query-suggestions', scenario: scenarioId, ...usage }, 'Claude usage')
      return reply.code(200).send({ ...result, _meta: { model: 'claude-sonnet-4-6', ...usage } })
    } catch (err) {
      handleAiError(err, reply)
    }
  })
}

// ---------------------------------------------------------------------------
// Build a human-readable representative query from scenario config
// ---------------------------------------------------------------------------
function buildRepresentativeQuery(id: string, cfg: ScenarioConfig, db: 'sqlserver' | 'postgis'): string {
  const isPg = db === 'postgis'
  const t    = cfg.table ?? 'postes'

  switch (cfg.type) {
    case 'spatial_filter': {
      const [minX, minY, maxX, maxY] = cfg.bbox ?? [-49.5, -25.7, -49.0, -25.2]
      return isPg
        ? `SELECT id, codigo FROM rede_eletrica.${t} WHERE geom && ST_MakeEnvelope(${minX},${minY},${maxX},${maxY},4326) AND ST_Intersects(geom, ST_MakeEnvelope(${minX},${minY},${maxX},${maxY},4326))`
        : `DECLARE @bbox geometry=geometry::STGeomFromText('POLYGON((${minX} ${minY},${maxX} ${minY},${maxX} ${maxY},${minX} ${maxY},${minX} ${minY}))',4326) SELECT id,codigo FROM rede_eletrica.${t} WHERE geom.STIntersects(@bbox)=1`
    }
    case 'containment': {
      const [lon, lat] = cfg.point ?? [-49.27, -25.43]
      return isPg
        ? `SELECT id,codigo FROM rede_eletrica.${t} WHERE ST_Contains(geom,ST_GeomFromText('POINT(${lon} ${lat})',4326))`
        : `DECLARE @pt geometry=geometry::STGeomFromText('POINT(${lon} ${lat})',4326) SELECT id,codigo FROM rede_eletrica.${t} WHERE geom.STContains(@pt)=1`
    }
    case 'distance_filter': {
      const [lon, lat] = cfg.point ?? [-49.27, -25.43]
      const r = cfg.radius_degrees ?? 0.005
      return isPg
        ? `SELECT id,codigo FROM rede_eletrica.${t} WHERE ST_DWithin(geom,ST_GeomFromText('POINT(${lon} ${lat})',4326),${r})`
        : `DECLARE @pt geometry=geometry::STGeomFromText('POINT(${lon} ${lat})',4326) SELECT id,codigo FROM rede_eletrica.${t} WHERE geom.STDistance(@pt)<${r}`
    }
    case 'spatial_join':
      return isPg
        ? `SELECT p.id,t.id FROM rede_eletrica.postes p JOIN rede_eletrica.trechos t ON ST_DWithin(p.geom,t.geom,0.005) LIMIT 1000`
        : `SELECT TOP 1000 p.id,t.id FROM rede_eletrica.postes p JOIN rede_eletrica.trechos t ON p.geom.STDistance(t.geom)<0.005`
    case 'aggregate':
    case 'spatial_aggregation_join':
      return isPg
        ? `SELECT s.id,COUNT(p.id) FROM rede_eletrica.subestacoes s LEFT JOIN rede_eletrica.postes p ON ST_Within(p.geom,s.geom) GROUP BY s.id`
        : `SELECT s.id,COUNT(p.id) FROM rede_eletrica.subestacoes s LEFT JOIN rede_eletrica.postes p ON p.geom.STWithin(s.geom)=1 GROUP BY s.id`
    case 'mixed': {
      const [minX, minY, maxX, maxY] = cfg.bbox ?? [-49.5, -25.7, -49.0, -25.2]
      const tensao = cfg.filter?.tensao ?? '13.8kV'
      return isPg
        ? `SELECT id,codigo FROM rede_eletrica.postes WHERE tensao='${tensao}' AND ST_Intersects(geom,ST_MakeEnvelope(${minX},${minY},${maxX},${maxY},4326))`
        : `DECLARE @bbox geometry=geometry::STGeomFromText('POLYGON((${minX} ${minY},${maxX} ${minY},${maxX} ${maxY},${minX} ${maxY},${minX} ${minY}))',4326) SELECT id,codigo FROM rede_eletrica.postes WHERE tensao=N'${tensao}' AND geom.STIntersects(@bbox)=1`
    }
    case 'validity_scan':
      return isPg
        ? `SELECT id,codigo FROM rede_eletrica.${t} WHERE NOT ST_IsValid(geom)`
        : `SELECT id,codigo FROM rede_eletrica.${t} WHERE geom.STIsValid()=0`
    case 'knn': {
      const [lon, lat] = cfg.point ?? [-49.27, -25.43]
      const k = cfg.k ?? 5
      return isPg
        ? `SELECT id,codigo FROM rede_eletrica.postes ORDER BY geom<->ST_GeomFromText('POINT(${lon} ${lat})',4326) LIMIT ${k}`
        : `SELECT TOP ${k} id,codigo FROM rede_eletrica.postes ORDER BY geom.STDistance(geometry::STGeomFromText('POINT(${lon} ${lat})',4326))`
    }
    case 'self_join':
      return isPg
        ? `SELECT a.id,b.id FROM rede_eletrica.trechos a JOIN rede_eletrica.trechos b ON a.id<b.id AND ST_Intersects(a.geom,b.geom) LIMIT 500`
        : `SELECT TOP 500 a.id,b.id FROM rede_eletrica.trechos a JOIN rede_eletrica.trechos b ON a.id<b.id AND a.geom.STIntersects(b.geom)=1`
    case 'cross_schema':
      return `SELECT p.id,p.codigo,v.detail FROM rede_eletrica.postes p JOIN verifier.vw_pontos_fora_poligono v ON p.id=v.id`
    case 'validation_full':
      return `SELECT rule_code,severity,total FROM verifier.vw_resumo_inconsistencias`
    default:
      return isPg ? 'SELECT 1' : 'SELECT 1'
  }
}
