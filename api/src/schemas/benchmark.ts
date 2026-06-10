import { z } from 'zod'

export const ScenarioIdSchema = z.enum([
  'B01','B02','B03','B04','B05','B06','B07','B08',
  'B09','B10','B11','B12','B13','B14','B15',
])

export const BenchmarkRequestSchema = z.object({
  scenarios: z.union([z.literal('all'), z.array(ScenarioIdSchema)]).default('all'),
  databases: z.array(z.enum(['sqlserver', 'postgis'])).min(1).default(['sqlserver', 'postgis']),
  options: z.object({
    warmup_iterations:   z.number().int().min(0).max(10).default(3),
    measured_iterations: z.number().int().min(1).max(50).default(10),
    timeout_ms:          z.number().int().min(1000).max(30000).default(5000),
  }).default({}),
})

const MetricsSchema = z.object({
  p50:            z.number().nonnegative(),
  p95:            z.number().nonnegative(),
  p99:            z.number().nonnegative(),
  throughput_rps: z.number().nonnegative(),
  iterations:     z.number().int().positive(),
  error:          z.string().optional(),
})

const ScenarioResultSchema = z.object({
  description: z.string(),
  sqlserver:   MetricsSchema.optional(),
  postgis:     MetricsSchema.optional(),
  winner:      z.enum(['sqlserver', 'postgis', 'tie', 'error']).optional(),
  margin_pct:  z.number().optional(),
})

export const BenchmarkResponseSchema = z.object({
  timestamp:        z.string().datetime(),
  total_duration_ms: z.number().nonnegative(),
  scenarios:        z.record(ScenarioIdSchema, ScenarioResultSchema),
})

export type BenchmarkRequest  = z.infer<typeof BenchmarkRequestSchema>
export type BenchmarkResponse = z.infer<typeof BenchmarkResponseSchema>
