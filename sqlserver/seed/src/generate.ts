// =============================================================================
// Synthetic Geospatial Data Generator
// Project: poc-geoserver-sqlserver
// Spec: specs/03-data-model-spec.md
//
// Usage:
//   ts-node src/generate.ts              → seeds both SQL Server and PostGIS
//   ts-node src/generate.ts --db sqlserver
//   ts-node src/generate.ts --db postgis
//
// Reproducibility: set SEED_RANDOM_SEED=42 in .env (default).
// Running this script twice with the same seed produces identical data.
// =============================================================================

import { SeededRng } from './rng.js'
import {
  COUNTS,
  RANDOM_SEED,
  BATCH_SIZE,
  INCONSISTENCY_COUNTS,
} from './config.js'
import {
  generatePoste,
  generateTrecho,
  generateSubestacao,
  generateVR001Poste,
  generateVR002Trecho,
  generateVR003Subestacao,
  generateVR005Poste,
  PosteRow,
  TrechoRow,
  SubestacaoRow,
} from './generators.js'
import * as sqlServer from './db/sqlserver.js'
import * as postGIS   from './db/postgis.js'

// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const targetDb = args.includes('--db') ? args[args.indexOf('--db') + 1] : 'all'

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

function logProgress(label: string, current: number, total: number): void {
  const pct = Math.floor((current / total) * 100)
  process.stdout.write(`\r  ${label}: ${current.toLocaleString()} / ${total.toLocaleString()} (${pct}%)`)
  if (current >= total) console.log()
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log(`=== Seed Generator Starting ===`)
  log(`Seed: SEED_RANDOM_SEED=${RANDOM_SEED}`)
  log(`Target: ${targetDb}`)
  log(`Counts: ${JSON.stringify(COUNTS)}`)
  log(`Inconsistencies: ${JSON.stringify(INCONSISTENCY_COUNTS)}`)

  const rng = new SeededRng(RANDOM_SEED)

  // ------------------------------------------------------------------
  // Phase 1: Generate all data in memory (deterministic order)
  // ------------------------------------------------------------------

  log('\nPhase 1: Generating synthetic data...')

  // --- Subestacoes (2k polygons — generated first, used to validate poles) ---
  log('  Generating subestacoes...')
  const subestacoes: SubestacaoRow[] = []
  for (let i = 1; i <= COUNTS.subestacoes; i++) {
    subestacoes.push(generateSubestacao(rng, i))
    if (i % 500 === 0) logProgress('subestacoes', i, COUNTS.subestacoes)
  }
  logProgress('subestacoes', COUNTS.subestacoes, COUNTS.subestacoes)

  // VR-003: self-intersecting polygons
  const vr003Subs: SubestacaoRow[] = []
  for (let i = 1; i <= INCONSISTENCY_COUNTS.vr003; i++) {
    vr003Subs.push(generateVR003Subestacao(rng, i))
  }
  log(`  VR-003: ${vr003Subs.length} self-intersecting polygons`)

  // --- Postes (50k points) ---
  log('  Generating postes...')
  const postes: PosteRow[] = []
  for (let i = 1; i <= COUNTS.postes; i++) {
    postes.push(generatePoste(rng, i))
    if (i % 10000 === 0) logProgress('postes', i, COUNTS.postes)
  }
  logProgress('postes', COUNTS.postes, COUNTS.postes)

  // VR-001: poles outside all polygons
  const vr001Postes: PosteRow[] = []
  for (let i = 1; i <= INCONSISTENCY_COUNTS.vr001; i++) {
    vr001Postes.push(generateVR001Poste(rng, i))
  }
  log(`  VR-001: ${vr001Postes.length} poles outside all polygons`)

  // VR-005: poles with wrong SRID
  const vr005Postes: PosteRow[] = []
  for (let i = 1; i <= INCONSISTENCY_COUNTS.vr005; i++) {
    vr005Postes.push(generateVR005Poste(rng, i))
  }
  log(`  VR-005: ${vr005Postes.length} poles with SRID=3857`)

  // VR-004: duplicate postes (exact copy of first N poles)
  const vr004PosteCount = Math.floor(INCONSISTENCY_COUNTS.vr004 / 2)
  const vr004Postes: PosteRow[] = postes.slice(0, vr004PosteCount).map((p, i) => ({
    ...p,
    codigo: `P-VR004D-${String(i).padStart(5, '0')}`,  // different code, same geometry
  }))
  log(`  VR-004: ${vr004Postes.length} duplicate pole geometries`)

  // All postes to insert
  const allPostes = [...postes, ...vr001Postes, ...vr005Postes, ...vr004Postes]
  log(`  Total postes: ${allPostes.length.toLocaleString()}`)

  // --- Trechos (100k lines) ---
  log('  Generating trechos...')
  const posteIds = Array.from({ length: postes.length }, (_, i) => i + 1)  // IDs assigned after insert
  const trechos: TrechoRow[] = []
  for (let i = 1; i <= COUNTS.trechos; i++) {
    trechos.push(generateTrecho(rng, i, posteIds, postes.length))
    if (i % 20000 === 0) logProgress('trechos', i, COUNTS.trechos)
  }
  logProgress('trechos', COUNTS.trechos, COUNTS.trechos)

  // VR-002: dangling line endpoints
  const vr002Trechos: TrechoRow[] = []
  for (let i = 1; i <= INCONSISTENCY_COUNTS.vr002; i++) {
    vr002Trechos.push(generateVR002Trecho(rng, i))
  }
  log(`  VR-002: ${vr002Trechos.length} dangling lines`)

  // VR-004: duplicate trechos (copy first N normal trechos)
  const vr004TrechoCount = Math.floor(INCONSISTENCY_COUNTS.vr004 / 2)
  const vr004Trechos: TrechoRow[] = trechos.slice(0, vr004TrechoCount).map((t, i) => ({
    ...t,
    codigo: `T-VR004D-${String(i).padStart(6, '0')}`,
    poste_inicio_id: null,  // no FK to avoid constraint issues
    poste_fim_id:    null,
  }))
  log(`  VR-004: ${vr004Trechos.length} duplicate trecho geometries`)

  const allTrechos    = [...trechos, ...vr002Trechos, ...vr004Trechos]
  const allSubestacoes = [...subestacoes, ...vr003Subs]
  log(`  Total trechos: ${allTrechos.length.toLocaleString()}`)
  log(`  Total subestacoes: ${allSubestacoes.length.toLocaleString()}`)

  // ------------------------------------------------------------------
  // Phase 2: Insert into database(s)
  // ------------------------------------------------------------------

  if (targetDb === 'all' || targetDb === 'sqlserver') {
    await seedSQLServer(allPostes, allTrechos, allSubestacoes)
  }

  if (targetDb === 'all' || targetDb === 'postgis') {
    await seedPostGIS(allPostes, allTrechos, allSubestacoes)
  }

  log('\n=== Seed complete ===')
}

// ---------------------------------------------------------------------------
// SQL Server seeder
// ---------------------------------------------------------------------------

async function seedSQLServer(
  postes:      PosteRow[],
  trechos:     TrechoRow[],
  subestacoes: SubestacaoRow[]
): Promise<void> {
  log('\nPhase 2a: Seeding SQL Server...')
  const pool = await sqlServer.getPool()

  try {
    log('  Truncating existing data...')
    await sqlServer.truncateTables(pool)

    log(`  Inserting ${subestacoes.length.toLocaleString()} subestacoes...`)
    for (let i = 0; i < subestacoes.length; i += BATCH_SIZE) {
      await sqlServer.insertSubestacoes(pool, subestacoes.slice(i, i + BATCH_SIZE))
      logProgress('subestacoes', Math.min(i + BATCH_SIZE, subestacoes.length), subestacoes.length)
    }

    log(`  Inserting ${postes.length.toLocaleString()} postes...`)
    for (let i = 0; i < postes.length; i += BATCH_SIZE) {
      await sqlServer.insertPostes(pool, postes.slice(i, i + BATCH_SIZE))
      logProgress('postes', Math.min(i + BATCH_SIZE, postes.length), postes.length)
    }

    log(`  Inserting ${trechos.length.toLocaleString()} trechos...`)
    for (let i = 0; i < trechos.length; i += BATCH_SIZE) {
      await sqlServer.insertTrechos(pool, trechos.slice(i, i + BATCH_SIZE))
      logProgress('trechos', Math.min(i + BATCH_SIZE, trechos.length), trechos.length)
    }

    const counts = await sqlServer.getRowCounts(pool)
    log('\n  SQL Server row counts:')
    for (const [table, count] of Object.entries(counts)) {
      log(`    ${table}: ${count.toLocaleString()}`)
    }
  } finally {
    await sqlServer.closePool()
  }
}

// ---------------------------------------------------------------------------
// PostGIS seeder
// ---------------------------------------------------------------------------

async function seedPostGIS(
  postes:      PosteRow[],
  trechos:     TrechoRow[],
  subestacoes: SubestacaoRow[]
): Promise<void> {
  log('\nPhase 2b: Seeding PostGIS...')
  const pool   = postGIS.getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    log('  Truncating existing data...')
    await postGIS.truncateTables(client)

    log(`  Inserting ${subestacoes.length.toLocaleString()} subestacoes...`)
    for (let i = 0; i < subestacoes.length; i += BATCH_SIZE) {
      await postGIS.insertSubestacoes(client, subestacoes.slice(i, i + BATCH_SIZE))
      logProgress('subestacoes', Math.min(i + BATCH_SIZE, subestacoes.length), subestacoes.length)
    }

    log(`  Inserting ${postes.length.toLocaleString()} postes...`)
    for (let i = 0; i < postes.length; i += BATCH_SIZE) {
      await postGIS.insertPostes(client, postes.slice(i, i + BATCH_SIZE))
      logProgress('postes', Math.min(i + BATCH_SIZE, postes.length), postes.length)
    }

    log(`  Inserting ${trechos.length.toLocaleString()} trechos...`)
    for (let i = 0; i < trechos.length; i += BATCH_SIZE) {
      await postGIS.insertTrechos(client, trechos.slice(i, i + BATCH_SIZE))
      logProgress('trechos', Math.min(i + BATCH_SIZE, trechos.length), trechos.length)
    }

    await client.query('COMMIT')

    const counts = await postGIS.getRowCounts(client)
    log('\n  PostGIS row counts:')
    for (const [table, count] of Object.entries(counts)) {
      log(`    ${table}: ${count.toLocaleString()}`)
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await postGIS.closePool()
  }
}

// ---------------------------------------------------------------------------

main().catch(err => {
  console.error('\n[ERROR]', err)
  process.exit(1)
})
