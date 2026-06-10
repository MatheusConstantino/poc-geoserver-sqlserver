import type { FastifyInstance } from 'fastify'
import { InconsistenciasQuerySchema } from '../schemas/inconsistencias.js'
import { runValidation } from '../services/validation.service.js'

export async function inconsistenciasRoutes(app: FastifyInstance): Promise<void> {
  app.get('/inconsistencias', async (req, reply) => {
    const parsed = InconsistenciasQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error:   'Invalid query parameters',
        details: parsed.error.flatten().fieldErrors,
      })
    }

    const result = await runValidation(parsed.data)
    return reply.code(200).send(result)
  })
}
