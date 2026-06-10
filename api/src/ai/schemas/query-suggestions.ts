import { z } from 'zod'

export const QuerySuggestionsSchema = z.object({
  scenario:    z.string(),
  suggestions: z.array(z.object({
    database:             z.enum(['sqlserver', 'postgis']),
    current_query:        z.string(),
    optimized_query:      z.string(),
    explanation:          z.string(),
    estimated_improvement: z.string(),
  })),
})

export type QuerySuggestions = z.infer<typeof QuerySuggestionsSchema>
