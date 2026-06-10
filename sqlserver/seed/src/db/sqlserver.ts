// =============================================================================
// SQL Server client + batch insert helpers
// Uses mssql driver with connection pooling
// =============================================================================

import sql from 'mssql'
import { PosteRow, TrechoRow, SubestacaoRow } from '../generators.js'

let pool: sql.ConnectionPool | null = null

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool) return pool

  const config: sql.config = {
    server:   process.env.SQLSERVER_HOST ?? 'localhost',
    port:     parseInt(process.env.SQLSERVER_PORT ?? '1433'),
    database: process.env.SQLSERVER_DB   ?? 'geo_poc',
    user:     process.env.SQLSERVER_USER ?? 'sa',
    password: process.env.SA_PASSWORD,
    options:  {
      trustServerCertificate: true,
      enableArithAbort:       true,
    },
    pool: {
      max:              10,
      min:              2,
      idleTimeoutMillis: 30000,
    },
  }

  pool = await sql.connect(config)
  return pool
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close()
    pool = null
  }
}

/** Truncates all data tables — idempotent reset before seeding */
export async function truncateTables(p: sql.ConnectionPool): Promise<void> {
  // Order matters: FK constraints (trechos → postes must go first)
  await p.request().query(`
    DELETE FROM verifier.inconsist_result;
    DELETE FROM rede_eletrica.trechos;
    DELETE FROM rede_eletrica.subestacoes;
    DELETE FROM rede_eletrica.postes;
    DBCC CHECKIDENT('rede_eletrica.postes',     RESEED, 0);
    DBCC CHECKIDENT('rede_eletrica.trechos',    RESEED, 0);
    DBCC CHECKIDENT('rede_eletrica.subestacoes', RESEED, 0);
  `)
}

/** Bulk-insert postes using a temp table + INSERT SELECT for performance */
export async function insertPostes(
  p:     sql.ConnectionPool,
  batch: PosteRow[]
): Promise<void> {
  if (batch.length === 0) return

  const table = new sql.Table()
  table.create = false
  table.columns.add('codigo',   sql.NVarChar(20),  { nullable: false })
  table.columns.add('nome',     sql.NVarChar(100), { nullable: false })
  table.columns.add('tensao',   sql.NVarChar(20),  { nullable: false })
  table.columns.add('material', sql.NVarChar(20),  { nullable: false })
  table.columns.add('altura_m', sql.Decimal(5, 2), { nullable: false })
  table.columns.add('wkt',      sql.NVarChar(sql.MAX), { nullable: false })
  table.columns.add('srid',     sql.Int,           { nullable: false })

  for (const row of batch) {
    table.rows.add(row.codigo, row.nome, row.tensao, row.material, row.altura_m, row.wkt, row.srid)
  }

  // Bulk load to temp table, then INSERT with geometry conversion
  await p.request().query(`
    IF OBJECT_ID('tempdb..#postes_staging') IS NOT NULL DROP TABLE #postes_staging;
    CREATE TABLE #postes_staging (
      codigo   NVARCHAR(20), nome NVARCHAR(100), tensao NVARCHAR(20),
      material NVARCHAR(20), altura_m DECIMAL(5,2), wkt NVARCHAR(MAX), srid INT
    );
  `)

  // Use multi-row VALUES for each batch
  const values = batch
    .map(r =>
      `(N'${r.codigo}', N'${r.nome}', N'${r.tensao}', N'${r.material}', ${r.altura_m}, N'${r.wkt}', ${r.srid})`
    )
    .join(',\n')

  await p.request().query(`
    INSERT INTO #postes_staging VALUES ${values};

    INSERT INTO rede_eletrica.postes (codigo, nome, tensao, material, altura_m, geom)
    SELECT codigo, nome, tensao, material, altura_m,
           geometry::STGeomFromText(wkt, srid)
    FROM #postes_staging;

    DROP TABLE #postes_staging;
  `)
}

export async function insertTrechos(
  p:     sql.ConnectionPool,
  batch: TrechoRow[]
): Promise<void> {
  if (batch.length === 0) return

  const values = batch
    .map(r => {
      const start = r.poste_inicio_id ?? 'NULL'
      const end   = r.poste_fim_id   ?? 'NULL'
      return `(N'${r.codigo}', N'${r.tensao}', ${r.comprimento_m}, N'${r.tipo_cabo}', ${start}, ${end}, N'${r.wkt}', ${r.srid})`
    })
    .join(',\n')

  await p.request().query(`
    IF OBJECT_ID('tempdb..#trechos_staging') IS NOT NULL DROP TABLE #trechos_staging;
    CREATE TABLE #trechos_staging (
      codigo NVARCHAR(20), tensao NVARCHAR(20), comprimento_m DECIMAL(10,2),
      tipo_cabo NVARCHAR(30), poste_inicio_id INT NULL, poste_fim_id INT NULL,
      wkt NVARCHAR(MAX), srid INT
    );
    INSERT INTO #trechos_staging VALUES ${values};

    INSERT INTO rede_eletrica.trechos (codigo, tensao, comprimento_m, tipo_cabo, poste_inicio_id, poste_fim_id, geom)
    SELECT codigo, tensao, comprimento_m, tipo_cabo, poste_inicio_id, poste_fim_id,
           geometry::STGeomFromText(wkt, srid)
    FROM #trechos_staging;

    DROP TABLE #trechos_staging;
  `)
}

export async function insertSubestacoes(
  p:     sql.ConnectionPool,
  batch: SubestacaoRow[]
): Promise<void> {
  if (batch.length === 0) return

  const values = batch
    .map(r =>
      `(N'${r.codigo}', N'${r.nome}', ${r.capacidade_mva}, N'${r.wkt}', ${r.srid})`
    )
    .join(',\n')

  await p.request().query(`
    IF OBJECT_ID('tempdb..#subs_staging') IS NOT NULL DROP TABLE #subs_staging;
    CREATE TABLE #subs_staging (
      codigo NVARCHAR(20), nome NVARCHAR(100), capacidade_mva DECIMAL(8,2),
      wkt NVARCHAR(MAX), srid INT
    );
    INSERT INTO #subs_staging VALUES ${values};

    INSERT INTO rede_eletrica.subestacoes (codigo, nome, capacidade_mva, geom)
    SELECT codigo, nome, capacidade_mva,
           geometry::STGeomFromText(wkt, srid)
    FROM #subs_staging;

    DROP TABLE #subs_staging;
  `)
}

/** Returns row counts for validation */
export async function getRowCounts(p: sql.ConnectionPool): Promise<Record<string, number>> {
  const result = await p.request().query(`
    SELECT 'postes'      AS tbl, COUNT(*) AS n FROM rede_eletrica.postes
    UNION ALL
    SELECT 'trechos',             COUNT(*) FROM rede_eletrica.trechos
    UNION ALL
    SELECT 'subestacoes',         COUNT(*) FROM rede_eletrica.subestacoes
  `)
  return Object.fromEntries(
    (result.recordset as Array<{ tbl: string; n: number }>).map(r => [r.tbl, r.n])
  )
}
