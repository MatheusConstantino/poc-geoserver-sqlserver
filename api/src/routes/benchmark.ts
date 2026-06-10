import type { FastifyInstance } from 'fastify'
import { BenchmarkRequestSchema } from '../schemas/benchmark.js'
import { runBenchmark } from '../services/benchmark.service.js'

export async function benchmarkRoutes(app: FastifyInstance): Promise<void> {
  app.post('/benchmark/run', async (req, reply) => {
    const parsed = BenchmarkRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error:   'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      })
    }

    const result = await runBenchmark(parsed.data)
    return reply.code(200).send(result)
  })
}
