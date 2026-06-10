import { z } from 'zod'

export const RuleCode = z.enum(['VR-001', 'VR-002', 'VR-003', 'VR-004', 'VR-005'])
export const Severity  = z.enum(['HIGH', 'MEDIUM', 'LOW'])

export const RuleSummarySchema = z.object({
  count:       z.number().int().nonnegative(),
  severity:    Severity,
  description: z.string(),
})

export const SampleSchema = z.object({
  id:          z.number().int(),
  feature_type: z.string(),
  codigo:      z.string(),
  detail:      z.string(),
})

export const InconsistenciasResponseSchema = z.object({
  timestamp:    z.string().datetime(),
  database:     z.literal('sqlserver'),
  execution_ms: z.number().nonnegative(),
  summary: z.object({
    total:   z.number().int().nonnegative(),
    by_rule: z.record(RuleCode, RuleSummarySchema),
  }),
  samples: z.record(RuleCode, z.array(SampleSchema)),
})

export type InconsistenciasResponse = z.infer<typeof InconsistenciasResponseSchema>

// Query params
export const InconsistenciasQuerySchema = z.object({
  rule:            RuleCode.optional(),
  limit:           z.coerce.number().int().min(1).max(100).default(10),
  include_samples: z.coerce.boolean().default(true),
})
