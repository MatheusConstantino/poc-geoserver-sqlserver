import { z } from 'zod'

export const BenchmarkInsightsSchema = z.object({
  executive_summary:  z.string(),
  tradeoff_analysis: z.object({
    sql_server_wins: z.array(z.string()),
    postgis_wins:    z.array(z.string()),
    key_insight:     z.string(),
  }),
  optimization_suggestions: z.array(z.object({
    applies_to:           z.enum(['sqlserver', 'postgis']),
    scenario:             z.string(),
    suggestion:           z.string(),
    expected_improvement: z.string(),
  })),
  cost_analysis: z.object({
    note:        z.string(),
    break_even:  z.string(),
  }),
})

export type BenchmarkInsights = z.infer<typeof BenchmarkInsightsSchema>
