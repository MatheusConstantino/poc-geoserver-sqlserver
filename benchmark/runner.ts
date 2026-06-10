#!/usr/bin/env tsx
/**
 * Benchmark Runner
 *
 * Calls POST /benchmark/run on the running API, saves raw JSON results,
 * and generates a Markdown comparison table in benchmark/results/.
 *
 * Usage:
 *   tsx runner.ts [options]
 *
 * Options:
 *   --api   <url>       API base URL          (default: http://localhost:3000)
 *   --out   <dir>       Output directory      (default: ./results)
 *   --warmup  <n>       Warmup iterations     (default: 3)
 *   --iters   <n>       Measured iterations   (default: 10)
 *   --scenarios <ids>   Comma-separated IDs   (default: all)
 *   --db    <list>      Comma-separated DBs   (default: sqlserver,postgis)
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function arg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback
}

const API_URL    = arg('--api', 'http://localhost:3000')
const OUT_DIR    = arg('--out', './results')
const WARMUP     = parseInt(arg('--warmup', '3'), 10)
const ITERS      = parseInt(arg('--iters', '10'), 10)
const SCENARIOS  = arg('--scenarios', 'all')
const DBS        = arg('--db', 'sqlserver,postgis')

// ---------------------------------------------------------------------------
// Types (mirrors api/src/schemas/benchmark.ts)
// ---------------------------------------------------------------------------
interface Metrics {
  p50:            number
  p95:            number
  p99:            number
  throughput_rps: number
  iterations:     number
  error?:         string
}

interface ScenarioResult {
  description: string
  sqlserver?:  Metrics
  postgis?:    Metrics
  winner?:     'sqlserver' | 'postgis' | 'tie' | 'error'
  margin_pct?: number
}

interface BenchmarkResponse {
  timestamp:         string
  total_duration_ms: number
  scenarios:         Record<string, ScenarioResult>
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function run(): Promise<void> {
  const databases = DBS.split(',').map(d => d.trim()) as ['sqlserver' | 'postgis']
  const body = {
    scenarios: SCENARIOS === 'all' ? 'all' : SCENARIOS.split(',').map(s => s.trim()),
    databases,
    options: {
      warmup_iterations:   WARMUP,
      measured_iterations: ITERS,
      timeout_ms:          10000,
    },
  }

  console.log(`Benchmark runner — ${new Date().toISOString()}`)
  console.log(`  API:        ${API_URL}`)
  console.log(`  Scenarios:  ${SCENARIOS}`)
  console.log(`  Databases:  ${databases.join(', ')}`)
  console.log(`  Warmup:     ${WARMUP}  Measured: ${ITERS}`)
  console.log('')

  // Health check first
  const health = await fetch(`${API_URL}/health`)
  if (!health.ok) {
    console.error(`Health check failed (${health.status}) — is the stack running?`)
    process.exit(1)
  }
  const healthData = await health.json() as { status: string }
  if (healthData.status === 'degraded') {
    console.warn('Warning: stack is degraded — some results may be incomplete')
  }
  console.log(`Health: ${healthData.status}`)
  console.log('Running benchmarks (this may take a few minutes)...\n')

  // Run benchmark
  const res = await fetch(`${API_URL}/benchmark/run`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(5 * 60 * 1000), // 5 min total
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`Benchmark request failed (${res.status}): ${text}`)
    process.exit(1)
  }

  const data = await res.json() as BenchmarkResponse

  // Ensure output dir
  mkdirSync(OUT_DIR, { recursive: true })

  // Save raw JSON
  const ts = new Date(data.timestamp)
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\..+/, '')
  const jsonPath = join(OUT_DIR, `${ts}.json`)
  writeFileSync(jsonPath, JSON.stringify(data, null, 2))
  console.log(`Saved raw results → ${jsonPath}`)

  // Generate Markdown report
  const md = buildMarkdown(data)
  const mdPath = join(OUT_DIR, 'latest.md')
  writeFileSync(mdPath, md)
  console.log(`Generated report  → ${mdPath}`)

  // Print summary table to console
  printSummary(data)

  // Exit non-zero if any scenario errored
  const hasErrors = Object.values(data.scenarios).some(s => s.winner === 'error')
  if (hasErrors) {
    console.warn('\nSome scenarios returned errors — check the JSON for details.')
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Console summary
// ---------------------------------------------------------------------------
function printSummary(data: BenchmarkResponse): void {
  const cols = ['ID', 'Description', 'SQL p95', 'PG p95', 'Winner', 'Margin']
  const rows = Object.entries(data.scenarios).map(([id, s]) => {
    const sqlP95 = s.sqlserver?.error ? 'ERR' : (s.sqlserver?.p95 != null ? `${s.sqlserver.p95}ms` : '—')
    const pgP95  = s.postgis?.error   ? 'ERR' : (s.postgis?.p95  != null ? `${s.postgis.p95}ms`  : '—')
    const winner = s.winner === 'tie' ? 'TIE' : (s.winner ?? '—')
    const margin = s.margin_pct != null ? `${s.margin_pct}%` : '—'
    return [id, s.description.slice(0, 45), sqlP95, pgP95, winner, margin]
  })

  console.log('\n' + formatTable([cols, ...rows]))
  console.log(`\nTotal duration: ${data.total_duration_ms}ms`)
}

function formatTable(rows: string[][]): string {
  const widths = rows[0]!.map((_, ci) => Math.max(...rows.map(r => (r[ci] ?? '').length)))
  return rows
    .map((r, ri) => {
      const line = r.map((c, ci) => c.padEnd(widths[ci]!)).join(' | ')
      if (ri === 0) return `${line}\n${widths.map(w => '-'.repeat(w)).join('-+-')}`
      return line
    })
    .join('\n')
}

// ---------------------------------------------------------------------------
// Markdown report
// ---------------------------------------------------------------------------
function buildMarkdown(data: BenchmarkResponse): string {
  const date = new Date(data.timestamp).toISOString().split('T')[0]!

  let out = `# Benchmark Results — ${date}\n\n`
  out += `> Generated: \`${data.timestamp}\`  \n`
  out += `> Total duration: \`${data.total_duration_ms}ms\`  \n`
  out += `> Warmup: ${WARMUP} iterations, Measured: ${ITERS} iterations\n\n`
  out += `| ID | Scenario | Type | SQL p50 | SQL p95 | PG p50 | PG p95 | Winner | Margin |\n`
  out += `|----|----------|------|---------|---------|--------|--------|--------|--------|\n`

  for (const [id, s] of Object.entries(data.scenarios)) {
    const sql = s.sqlserver
    const pg  = s.postgis
    const sqlP50 = sql?.error ? '`ERR`' : (sql?.p50 != null ? `${sql.p50}ms` : '—')
    const sqlP95 = sql?.error ? '`ERR`' : (sql?.p95 != null ? `${sql.p95}ms` : '—')
    const pgP50  = pg?.error  ? '`ERR`' : (pg?.p50  != null ? `${pg.p50}ms`  : '—')
    const pgP95  = pg?.error  ? '`ERR`' : (pg?.p95  != null ? `${pg.p95}ms`  : '—')
    const winner = s.winner === 'sqlserver' ? '**SQL Server**'
                 : s.winner === 'postgis'   ? '**PostGIS**'
                 : s.winner === 'tie'       ? 'TIE'
                 : '`ERROR`'
    const margin = s.margin_pct != null ? `${s.margin_pct}%` : '—'
    out += `| ${id} | ${s.description} | — | ${sqlP50} | ${sqlP95} | ${pgP50} | ${pgP95} | ${winner} | ${margin} |\n`
  }

  out += `\n## Notes\n`
  out += `- All queries run on identical synthetic dataset (SEED=42)\n`
  out += `- Winner determined by p95 latency; ties when difference < 5ms\n`
  out += `- ERR indicates query failed (check stack logs)\n`

  return out
}

// ---------------------------------------------------------------------------
run().catch(err => {
  console.error('Fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
