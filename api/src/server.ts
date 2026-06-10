import Fastify from 'fastify'
import cors from '@fastify/cors'
import { healthRoutes }         from './routes/health.js'
import { inconsistenciasRoutes } from './routes/inconsistencias.js'
import { benchmarkRoutes }       from './routes/benchmark.js'
import { aiRoutes }              from './routes/ai.js'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
})

// Plugins
await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? true,
})

// Routes
await app.register(healthRoutes)
await app.register(inconsistenciasRoutes)
await app.register(benchmarkRoutes)
await app.register(aiRoutes)

// Start
const host = process.env.API_HOST ?? '0.0.0.0'
const port = Number(process.env.API_PORT ?? 3000)

try {
  await app.listen({ host, port })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
