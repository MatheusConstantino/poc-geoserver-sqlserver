import sql from 'mssql'

let pool: sql.ConnectionPool | null = null

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool

  pool = await sql.connect({
    server:   process.env.SQLSERVER_HOST   ?? 'localhost',
    port:     parseInt(process.env.SQLSERVER_PORT ?? '1433'),
    database: process.env.SQLSERVER_DB     ?? 'geo_poc',
    user:     process.env.SQLSERVER_USER   ?? 'sa',
    password: process.env.SA_PASSWORD,
    options:  { trustServerCertificate: true, enableArithAbort: true },
    pool:     { max: 10, min: 2, idleTimeoutMillis: 30000 },
  })

  return pool
}

export async function ping(): Promise<number> {
  const start = Date.now()
  const p = await getPool()
  await p.request().query('SELECT 1 AS ok')
  return Date.now() - start
}

export async function getVersion(): Promise<string> {
  const p = await getPool()
  const res = await p.request().query<{ v: string }>(
    "SELECT @@VERSION AS v"
  )
  // Return just the first line (e.g. "Microsoft SQL Server 2022 ...")
  return (res.recordset[0]?.v ?? '').split('\n')[0].trim()
}
