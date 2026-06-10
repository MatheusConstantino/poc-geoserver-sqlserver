import { Pool } from 'pg'

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

export async function ping(): Promise<number> {
  const start = Date.now()
  await getPool().query('SELECT 1')
  return Date.now() - start
}

export async function getVersion(): Promise<string> {
  const res = await getPool().query<{ v: string }>(
    'SELECT version() AS v'
  )
  return (res.rows[0]?.v ?? '').split(',')[0].trim()
}
