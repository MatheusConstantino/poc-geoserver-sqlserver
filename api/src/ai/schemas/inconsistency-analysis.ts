import { z } from 'zod'

export const InconsistencyAnalysisSchema = z.object({
  severity_assessment: z.string(),
  top_priorities: z.array(z.object({
    rank:           z.number().int().min(1),
    rule:           z.string().regex(/^VR-\d{3}$/),
    count:          z.number().int().min(0),
    recommendation: z.string().min(10),
    sql_hint:       z.string().optional(),
  })).max(5),
  patterns_detected: z.array(z.string()),
  next_steps:        z.array(z.string()).min(1).max(5),
})

export type InconsistencyAnalysis = z.infer<typeof InconsistencyAnalysisSchema>
