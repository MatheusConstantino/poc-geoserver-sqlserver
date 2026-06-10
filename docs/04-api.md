# REST API — Referência Técnica

> **Stack**: Node.js 20 LTS · Fastify 4 · TypeScript · Zod (validação de contratos em runtime)
>
> **Base URL local**: `http://localhost:3000`
>
> Spec completa: [`specs/02-api-spec.md`](../specs/02-api-spec.md)

---

## GET /health

Verifica a conectividade e latência de ambos os bancos de dados.

**Resposta 200 — healthy**

```json
{
  "status": "healthy",
  "timestamp": "2026-06-10T13:00:00.000Z",
  "uptime": 120,
  "version": "1.0.0",
  "databases": {
    "sqlserver": { "status": "connected", "latency_ms": 4, "version": "Microsoft SQL Server 2022 ..." },
    "postgis":   { "status": "connected", "latency_ms": 2, "version": "PostgreSQL 16.x ..." }
  }
}
```

**Resposta 503 — degraded** (um ou ambos os bancos inacessíveis)

```json
{
  "status": "degraded",
  "databases": {
    "sqlserver": { "status": "disconnected", "error": "connect ECONNREFUSED 127.0.0.1:1433" },
    "postgis":   { "status": "connected", "latency_ms": 3, "version": "..." }
  }
}
```

---

## GET /inconsistencias

Executa as views de validação espacial no SQL Server (VR-001 a VR-005) e retorna contagens, severidades e amostras.

**Query parameters**

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `rule` | `VR-001` \| `VR-002` \| `VR-003` \| `VR-004` \| `VR-005` | — | Filtra para uma regra específica. Omitir executa todas. |
| `limit` | `integer` (1–100) | `10` | Máximo de amostras retornadas por regra. |
| `include_samples` | `boolean` | `true` | Se `false`, retorna apenas contagens (mais rápido). |

**Exemplo**

```bash
curl "http://localhost:3000/inconsistencias?rule=VR-001&limit=5"
```

**Resposta 200**

```json
{
  "timestamp": "2026-06-10T13:00:00.000Z",
  "database": "sqlserver",
  "execution_ms": 38,
  "summary": {
    "total": 15000,
    "by_rule": {
      "VR-001": { "count": 3000, "severity": "HIGH",   "description": "Point outside expected polygon" },
      "VR-002": { "count": 4000, "severity": "MEDIUM", "description": "Line with dangling endpoint" },
      "VR-003": { "count": 2000, "severity": "HIGH",   "description": "Self-intersecting polygon" },
      "VR-004": { "count": 4000, "severity": "LOW",    "description": "Geometric duplicate" },
      "VR-005": { "count": 2000, "severity": "HIGH",   "description": "SRID inconsistency" }
    }
  },
  "samples": {
    "VR-001": [
      { "id": 12345, "feature_type": "poste", "codigo": "P-12345", "detail": "outside subestacao boundary" }
    ]
  }
}
```

**Regras de validação**

| Código | View | Severidade | Descrição |
|--------|------|-----------|-----------|
| VR-001 | `verifier.vw_pontos_fora_poligono` | HIGH | Postes fora do polígono de subestação |
| VR-002 | `verifier.vw_linhas_extremidade_solta` | MEDIUM | Trechos com extremidade sem conexão |
| VR-003 | `verifier.vw_poligonos_auto_intersecao` | HIGH | Subestações com geometria auto-intersectante |
| VR-004 | `verifier.vw_duplicatas_geometricas` | LOW | Geometrias duplicadas (mesma posição) |
| VR-005 | `verifier.vw_srid_inconsistente` | HIGH | Features com SRID diferente de 4326 |

---

## POST /benchmark/run

Executa cenários de benchmark espacial comparando SQL Server vs PostGIS. Mede p50/p95/p99 e determina o vencedor por p95.

**Body (JSON)**

```json
{
  "scenarios": "all",
  "databases": ["sqlserver", "postgis"],
  "options": {
    "warmup_iterations": 3,
    "measured_iterations": 10,
    "timeout_ms": 5000
  }
}
```

| Campo | Tipo | Padrão | Descrição |
|-------|------|--------|-----------|
| `scenarios` | `"all"` ou `["B01",…]` | `"all"` | Quais dos 15 cenários executar |
| `databases` | `array` (min 1) | `["sqlserver","postgis"]` | Bancos a testar |
| `options.warmup_iterations` | `0–10` | `3` | Iterações descartadas para aquecer cache |
| `options.measured_iterations` | `1–50` | `10` | Iterações contadas para as métricas |
| `options.timeout_ms` | `1000–30000` | `5000` | Timeout por query (ms) |

**Exemplo — benchmark rápido com 2 cenários**

```bash
curl -X POST http://localhost:3000/benchmark/run \
  -H "Content-Type: application/json" \
  -d '{
    "scenarios": ["B01","B05"],
    "options": { "warmup_iterations": 1, "measured_iterations": 5 }
  }'
```

**Resposta 200**

```json
{
  "timestamp": "2026-06-10T13:00:00.000Z",
  "total_duration_ms": 12450,
  "scenarios": {
    "B01": {
      "description": "Spatial filter — sparse region bbox",
      "sqlserver": { "p50": 12, "p95": 18, "p99": 22, "throughput_rps": 71, "iterations": 10 },
      "postgis":   { "p50":  8, "p95": 11, "p99": 14, "throughput_rps": 98, "iterations": 10 },
      "winner": "postgis",
      "margin_pct": 39
    }
  }
}
```

**Campos de métricas**

| Campo | Descrição |
|-------|-----------|
| `p50` | Mediana (ms) — latência típica |
| `p95` | Percentil 95 (ms) — usado para determinar vencedor |
| `p99` | Percentil 99 (ms) — pior caso excluindo outliers extremos |
| `throughput_rps` | Requisições por segundo estimadas (`1000 / avg_ms`) |
| `winner` | `"sqlserver"` \| `"postgis"` \| `"tie"` (< 5 ms diff) \| `"error"` |
| `margin_pct` | Quanto o vencedor é mais rápido em % |

---

## Endpoints AI

Todos os endpoints abaixo requerem `ANTHROPIC_API_KEY` configurado no ambiente.
Documentação detalhada: [`docs/06-ia.md`](06-ia.md)

### POST /ai/analyze-inconsistencies

Recebe a saída de `GET /inconsistencias` e retorna análise priorizada das inconsistências.

```bash
curl -X POST http://localhost:3000/ai/analyze-inconsistencies \
  -H "Content-Type: application/json" \
  -d "$(curl -s http://localhost:3000/inconsistencias)"
```

Resposta inclui: `severity_assessment`, `top_priorities[5]` (com `sql_hint`), `patterns_detected`, `next_steps`.

### POST /ai/benchmark-insights

Recebe a saída de `POST /benchmark/run` e retorna análise de tradeoff entre os bancos.

```bash
curl -X POST http://localhost:3000/ai/benchmark-insights \
  -H "Content-Type: application/json" \
  -d "$(curl -s -X POST http://localhost:3000/benchmark/run -H 'Content-Type: application/json' -d '{}')"
```

Resposta inclui: `executive_summary`, `tradeoff_analysis`, `optimization_suggestions[4]`, `cost_analysis`.

### GET /ai/query-suggestions?scenario=B07

Recebe um ID de cenário e retorna queries otimizadas para SQL Server e PostGIS.

```bash
curl "http://localhost:3000/ai/query-suggestions?scenario=B07"
```

Resposta inclui: `suggestions[]` com `current_query`, `optimized_query`, `explanation`, `estimated_improvement`.

### Erros específicos dos endpoints AI

| HTTP | Código | Causa |
|------|--------|-------|
| `500` | `AI_NOT_CONFIGURED` | `ANTHROPIC_API_KEY` não definida |
| `429` | `AI_RATE_LIMITED` | Rate limit da API Claude (com `retry_after`) |
| `502` | `AI_UPSTREAM_ERROR` | Claude API 5xx |
| `500` | `AI_INVALID_RESPONSE` | Resposta não passou na validação Zod |
| `504` | `AI_TIMEOUT` | Timeout > 30s |
| `413` | `REQUEST_TOO_LARGE` | Body > 50kB |

Todas as respostas AI incluem `_meta: { model, input_tokens, output_tokens }`.

---

## Tratamento de Erros

| HTTP | Situação |
|------|----------|
| `200` | Sucesso |
| `400` | Parâmetros inválidos (detalhe no campo `details` via Zod) |
| `503` | Um ou ambos os bancos inacessíveis (`/health` degraded) |
| `500` | Erro interno não tratado |

Erros de query individual no benchmark não interrompem o run — o cenário recebe `error` no campo correspondente e `winner: "error"`.
