import type { FastifyInstance } from 'fastify'
import * as sqlServer from '../db/sqlserver.js'
import * as postGIS   from '../db/postgis.js'

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    const [sql, pg] = await Promise.allSettled([
      Promise.all([sqlServer.ping(), sqlServer.getVersion()]),
      Promise.all([postGIS.ping(), postGIS.getVersion()]),
    ])

    const sqlStatus = sql.status === 'fulfilled'
      ? { status: 'connected' as const, latency_ms: sql.value[0], version: sql.value[1] }
      : { status: 'disconnected' as const, error: (sql.reason as Error).message }

    const pgStatus = pg.status === 'fulfilled'
      ? { status: 'connected' as const, latency_ms: pg.value[0], version: pg.value[1] }
      : { status: 'disconnected' as const, error: (pg.reason as Error).message }

    const degraded = sqlStatus.status === 'disconnected' || pgStatus.status === 'disconnected'

    return reply.code(degraded ? 503 : 200).send({
      status:    degraded ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      uptime:    Math.floor(process.uptime()),
      version:   '1.0.0',
      databases: { sqlserver: sqlStatus, postgis: pgStatus },
    })
  })
}
