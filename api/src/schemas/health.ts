import { z } from 'zod'

const DbStatusSchema = z.object({
  status:    z.enum(['connected', 'disconnected']),
  latency_ms: z.number().int().nonnegative().optional(),
  version:   z.string().optional(),
  error:     z.string().optional(),
})

export const HealthResponseSchema = z.object({
  status:    z.enum(['healthy', 'degraded']),
  timestamp: z.string().datetime(),
  uptime:    z.number().nonnegative(),
  version:   z.string(),
  databases: z.object({
    sqlserver: DbStatusSchema,
    postgis:   DbStatusSchema,
  }),
})

export type HealthResponse = z.infer<typeof HealthResponseSchema>
