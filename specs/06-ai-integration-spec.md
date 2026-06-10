# AI Integration Specification

**Status**: Accepted
**Version**: 1.0
**Refs**: API Spec `specs/02-api-spec.md` | Technical Spec `specs/01-technical-spec.md`

---

## Design Principles

1. **Production-ready, not demo-quality**: all AI responses are validated with Zod before use
2. **Structured output**: Claude always returns JSON — never free-form text parsed with regex
3. **Separation of concerns**: prompts are versioned files, not inline strings
4. **Graceful degradation**: AI endpoint failure never crashes the core validation/benchmark flow
5. **Cost awareness**: log token usage per request; keep system prompts < 500 tokens

---

## Endpoints

Three AI endpoints (full contracts in `specs/02-api-spec.md`):
1. `POST /ai/analyze-inconsistencies` — interprets spatial validation report
2. `POST /ai/benchmark-insights` — interprets benchmark comparison results
3. `GET /ai/query-suggestions?scenario=B07` — suggests query optimizations

---

## File Structure

```
api/src/ai/
├── claude-client.ts          # Anthropic SDK wrapper (singleton, retry logic)
├── prompts/
│   ├── analyze-inconsistencies.ts   # System + user prompt builder
│   ├── benchmark-insights.ts        # Benchmark analysis prompt
│   └── query-optimizer.ts           # Query suggestion prompt with few-shot examples
└── schemas/
    ├── inconsistency-analysis.ts    # Zod schema for analyze-inconsistencies response
    ├── benchmark-insights.ts        # Zod schema for benchmark-insights response
    └── query-suggestions.ts         # Zod schema for query-suggestions response
```

---

## Prompt Specifications

### analyze-inconsistencies — System Prompt
```
You are a senior GIS engineer analyzing spatial data quality issues in a utility network dataset
for the state of Paraná, Brazil. The dataset contains utility poles (postes), medium-voltage lines
(trechos), and concession area polygons (subestacoes) in SRID 4326.

You will receive a JSON object containing spatial inconsistency counts and samples.
Return a JSON object with the following structure — no other text, only JSON:
{
  "severity_assessment": "string (overall assessment)",
  "top_priorities": [
    {
      "rank": number,
      "rule": "VR-00X",
      "count": number,
      "recommendation": "string (specific, actionable)",
      "sql_hint": "string (optional SQL to fix or investigate)"
    }
  ],
  "patterns_detected": ["string"],
  "next_steps": ["string"]
}
```

### benchmark-insights — System Prompt
```
You are a database performance engineer comparing SQL Server 2022 and PostgreSQL/PostGIS 3.4
for geospatial workloads on a synthetic utility network dataset with 50k points, 100k lines,
and 2k polygons in the state of Paraná, Brazil.

You will receive benchmark results as JSON (p50, p95, p99, throughput per scenario per database).
Return a JSON object — no other text:
{
  "executive_summary": "string",
  "tradeoff_analysis": {
    "sql_server_wins": ["scenario_ids"],
    "postgis_wins": ["scenario_ids"],
    "key_insight": "string"
  },
  "optimization_suggestions": [
    {
      "applies_to": "sqlserver|postgis",
      "scenario": "BXX",
      "suggestion": "string",
      "expected_improvement": "string"
    }
  ],
  "cost_analysis": {
    "note": "string",
    "break_even": "string"
  }
}
```

### query-optimizer — System Prompt + Few-Shot
```
You are a spatial database query optimizer with expertise in SQL Server T-SQL spatial functions
(STIntersects, STDistance, STBuffer, STIsValid) and PostGIS (ST_Intersects, ST_Distance, ST_Buffer).

Given a benchmark scenario ID and description, suggest an optimized query.
Use these examples to calibrate your suggestions:

Example: STDistance for neighbor search → replace with STIntersects + STBuffer for index usage.
Example: SELECT * with geometry column → replace with SELECT id, attr, geom.STAsText() for serialization efficiency.

Return JSON only:
{
  "scenario": "BXX",
  "suggestions": [
    {
      "database": "sqlserver|postgis",
      "current_query": "string",
      "optimized_query": "string",
      "explanation": "string",
      "estimated_improvement": "string"
    }
  ]
}
```

---

## Zod Schemas (contracts)

### inconsistency-analysis.ts
```typescript
import { z } from 'zod'

export const InconsistencyAnalysisSchema = z.object({
  severity_assessment: z.string(),
  top_priorities: z.array(z.object({
    rank: z.number().int().min(1),
    rule: z.string().regex(/^VR-\d{3}$/),
    count: z.number().int().min(0),
    recommendation: z.string().min(10),
    sql_hint: z.string().optional()
  })).max(5),
  patterns_detected: z.array(z.string()),
  next_steps: z.array(z.string()).min(1).max(5)
})

export type InconsistencyAnalysis = z.infer<typeof InconsistencyAnalysisSchema>
```

---

## Error Handling Matrix

| Error Type | HTTP Status | Code | Behavior |
|-----------|-------------|------|----------|
| ANTHROPIC_API_KEY missing | 500 | AI_NOT_CONFIGURED | Return immediately, log warning |
| Claude API 429 (rate limit) | 429 | AI_RATE_LIMITED | Return 429 with retry-after |
| Claude API 5xx | 502 | AI_UPSTREAM_ERROR | Return 502 (upstream failure) |
| Zod validation failure (AI response) | 500 | AI_INVALID_RESPONSE | Log raw response, return 500 |
| Request body too large (> 50kb) | 413 | REQUEST_TOO_LARGE | Return 413 before calling AI |
| Timeout (> 30s) | 504 | AI_TIMEOUT | Return 504 with timeout info |

---

## Cost Budget (per request estimate)

| Endpoint | Input tokens (est.) | Output tokens (est.) | Cost (est.) |
|----------|--------------------|--------------------|------------|
| analyze-inconsistencies | ~800 | ~400 | ~$0.002 |
| benchmark-insights | ~1200 | ~600 | ~$0.003 |
| query-suggestions | ~600 | ~400 | ~$0.002 |

*Based on claude-sonnet-4-6 pricing. Log actual usage per request for monitoring.*
