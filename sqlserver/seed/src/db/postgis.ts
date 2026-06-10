// =============================================================================
// PostGIS client + batch insert helpers
// Uses node-postgres (pg) driver
// =============================================================================

import { Pool, PoolClient } from 'pg'
import { PosteRow, TrechoRow, SubestacaoRow } from '../generators.js'

let pool: Pool | null = null

export function getPool(): Pool {
  if (pool) return pool

  pool = new Pool({
    host:     process.env.POSTGRES_HOST     ?? 'localhost',
    port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
    database: process.env.POSTGRES_DB       ?? 'geo_poc',
    user:     process.env.POSTGRES_USER     ?? 'geouser',
    password: process.env.POSTGRES_PASSWORD,
    max:      10,
    idleTimeoutMillis: 30000,
  })

  return pool
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

export async function truncateTables(client: PoolClient): Promise<void> {
  await client.query(`
    TRUNCATE verifier.inconsist_result RESTART IDENTITY CASCADE;
    TRUNCATE rede_eletrica.trechos     RESTART IDENTITY CASCADE;
    TRUNCATE rede_eletrica.subestacoes RESTART IDENTITY CASCADE;
    TRUNCATE rede_eletrica.postes      RESTART IDENTITY CASCADE;
  `)
}

export async function insertPostes(client: PoolClient, batch: PosteRow[]): Promise<void> {
  if (batch.length === 0) return

  // Build a single multi-row INSERT using unnest for performance
  const codigos:   string[] = []
  const nomes:     string[] = []
  const tensoes:   string[] = []
  const materiais: string[] = []
  const alturas:   number[] = []
  const wkts:      string[] = []
  const srids:     number[] = []

  for (const r of batch) {
    codigos.push(r.codigo)
    nomes.push(r.nome)
    tensoes.push(r.tensao)
    materiais.push(r.material)
    alturas.push(r.altura_m)
    wkts.push(r.wkt)
    srids.push(r.srid)
  }

  await client.query(`
    INSERT INTO rede_eletrica.postes (codigo, nome, tensao, material, altura_m, geom)
    SELECT
      unnest($1::varchar[]),
      unnest($2::varchar[]),
      unnest($3::varchar[]),
      unnest($4::varchar[]),
      unnest($5::decimal[]),
      ST_GeomFromText(unnest($6::text[]), unnest($7::int[]))
  `, [codigos, nomes, tensoes, materiais, alturas, wkts, srids])
}

export async function insertTrechos(client: PoolClient, batch: TrechoRow[]): Promise<void> {
  if (batch.length === 0) return

  const codigos:  string[]           = []
  const tensoes:  string[]           = []
  const comps:    number[]           = []
  const cabos:    string[]           = []
  const starts:   (number | null)[]  = []
  const ends:     (number | null)[]  = []
  const wkts:     string[]           = []
  const srids:    number[]           = []

  for (const r of batch) {
    codigos.push(r.codigo)
    tensoes.push(r.tensao)
    comps.push(r.comprimento_m)
    cabos.push(r.tipo_cabo)
    starts.push(r.poste_inicio_id)
    ends.push(r.poste_fim_id)
    wkts.push(r.wkt)
    srids.push(r.srid)
  }

  await client.query(`
    INSERT INTO rede_eletrica.trechos
      (codigo, tensao, comprimento_m, tipo_cabo, poste_inicio_id, poste_fim_id, geom)
    SELECT
      unnest($1::varchar[]),
      unnest($2::varchar[]),
      unnest($3::decimal[]),
      unnest($4::varchar[]),
      unnest($5::int[]),
      unnest($6::int[]),
      ST_GeomFromText(unnest($7::text[]), unnest($8::int[]))
  `, [codigos, tensoes, comps, cabos, starts, ends, wkts, srids])
}

export async function insertSubestacoes(client: PoolClient, batch: SubestacaoRow[]): Promise<void> {
  if (batch.length === 0) return

  const codigos: string[] = []
  const nomes:   string[] = []
  const caps:    number[] = []
  const wkts:    string[] = []
  const srids:   number[] = []

  for (const r of batch) {
    codigos.push(r.codigo)
    nomes.push(r.nome)
    caps.push(r.capacidade_mva)
    wkts.push(r.wkt)
    srids.push(r.srid)
  }

  await client.query(`
    INSERT INTO rede_eletrica.subestacoes (codigo, nome, capacidade_mva, geom)
    SELECT
      unnest($1::varchar[]),
      unnest($2::varchar[]),
      unnest($3::decimal[]),
      ST_GeomFromText(unnest($4::text[]), unnest($5::int[]))
  `, [codigos, nomes, caps, wkts, srids])
}

export async function getRowCounts(client: PoolClient): Promise<Record<string, number>> {
  const result = await client.query<{ tbl: string; n: string }>(`
    SELECT 'postes'      AS tbl, COUNT(*)::text AS n FROM rede_eletrica.postes
    UNION ALL
    SELECT 'trechos',             COUNT(*)::text FROM rede_eletrica.trechos
    UNION ALL
    SELECT 'subestacoes',         COUNT(*)::text FROM rede_eletrica.subestacoes
  `)
  return Object.fromEntries(result.rows.map(r => [r.tbl, parseInt(r.n)]))
}
