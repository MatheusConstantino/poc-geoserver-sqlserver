# Arquitetura do Sistema

> **Audiência**: Engenheiros que querem entender o design antes de ler o código.

---

## Visão Geral

O POC é composto por cinco serviços Docker com responsabilidades bem definidas:

```
┌─────────────────────────────────────────────────────────────┐
│                      Docker Compose                          │
│                                                             │
│  ┌──────────┐   REST    ┌──────────┐   JDBC    ┌─────────┐  │
│  │  Client  │ ────────► │  API     │ ─────────► │SQL Srvr │  │
│  │ /Browser │   WMS/WFS │ :3000    │   pg     │ :1433   │  │
│  └──────────┘ ────────► │ Fastify  │ ─────────► ├─────────┤  │
│                         │ TS + Zod │   HTTPS  │PostGIS  │  │
│                         └──────────┘ ─────►   │ :5432   │  │
│                              │       Claude   └─────────┘  │
│                         ┌────▼─────┐   API                 │
│  ┌──────────┐   JDBC    │GeoServer │                       │
│  │  Client  │ ◄─────── │ :8080    │                       │
│  └──────────┘   WMS/WFS └──────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Camadas de Responsabilidade

### 1. Camada de Dados

**SQL Server 2022** — banco primário.

- Schema `rede_eletrica`: `postes` (POINT), `trechos` (LINESTRING), `subestacoes` (POLYGON)
- Schema `verifier`: 5 views de validação (VR-001 → VR-005) + `vw_resumo_inconsistencias`
- Índices espaciais: `GEOMETRY_AUTO_GRID` com `BOUNDING_BOX` do Paraná (`-54.6,-26.7,-48.0,-22.5`)
- `CELLS_PER_OBJECT=8` para POINT, `16` para LINESTRING/POLYGON

**PostgreSQL 16 + PostGIS 3.4** — banco espelho para comparação.

- Schema idêntico ao SQL Server, com tipos `geometry(POINT/LINESTRING/POLYGON, 4326)`
- Índices: `GIST` (R-tree generalizado, nativo do PostGIS)
- `ST_DWithin` em vez de `STDistance` para aproveitamento de índice no VR-002

**Por que dois bancos?**

Ver [ADR-001](adr/001-sql-server-vs-postgis.md). Resumo: comparação empírica é mais valiosa que escolha arbitrária. O dataset é 100% idêntico (seed determinístico), tornando os benchmarks justos.

---

### 2. Camada de Visualização (GeoServer)

GeoServer 2.25+ serve as três camadas via WMS e WFS diretamente do SQL Server.

**Estrutura do data_dir:**
```
geoserver/data_dir/workspaces/poc-geoserver/
├── workspace.xml
├── namespace.xml
└── sqlserver-datastore/
    ├── datastore.xml          # conexão JDBC
    ├── postes/featuretype.xml
    ├── trechos/featuretype.xml    # bbox bug fix aplicado
    └── subestacoes/featuretype.xml # bbox bug fix aplicado
```

**Bug do bbox (SQL Server JDBC):** o plugin `gt-jdbc-sqlserver` não consegue calcular automaticamente o bounding box de camadas LINESTRING e POLYGON porque a view `geometry_columns` não é populada pelo SQL Server. Solução: `nativeBoundingBox` declarado explicitamente nos `featuretype.xml` com o extent do Paraná. Ver [docs/03-setup-geoserver.md](03-setup-geoserver.md).

---

### 3. Camada de API (Fastify)

A API tem três grupos de rotas:

| Grupo | Responsabilidade |
|-------|-----------------|
| `/health` | Diagnóstico — ping + versão dos dois bancos |
| `/inconsistencias`, `/benchmark/run` | Lógica de domínio — consultas espaciais |
| `/ai/*` | Análise inteligente — Claude API com output estruturado |

**Princípios de design:**

- **Zod em toda fronteira**: requests e respostas validadas antes de processar
- **Serviços isolados**: `validation.service.ts` e `benchmark.service.ts` sem dependência de Fastify
- **Pool singleton**: um único pool por banco, reutilizado entre requests
- **Graceful degradation**: falha no AI nunca afeta as rotas de domínio

**Fluxo de uma request `/benchmark/run`:**

```
Client POST /benchmark/run
  → Fastify: Zod parse body
  → benchmark.service.ts
      → readFileSync scenarios.json
      → para cada scenario × DB:
          → buildQuery(type, config, db)
          → measureQuery(query, db) [warmup + measured]
          → p50/p95/p99 dos timings ordenados
          → determina winner por p95
  → retorna BenchmarkResponse tipado
```

---

### 4. Camada de IA (Claude API)

Três endpoints, cada um seguindo o mesmo padrão:

```
route handler
  → body guard (Zod, tamanho < 50kB)
  → claude-client.ask(systemPrompt, userMessage, schema)
      → Anthropic SDK messages.create()
      → AbortController com timeout 30s
      → retry único em 429 (honours retry-after)
      → JSON.parse do content[0].text
      → Zod.parse do output estruturado
  → retorna { ...aiResult, _meta: { model, tokens } }
```

Ver [ADR-005](adr/005-ia-no-pipeline.md) para a justificativa de usar IA em dois níveis (produto + engenharia).

---

### 5. Seed Determinístico

O serviço `sqlserver-seed` gera os dados sintéticos usando um LCG (Linear Congruential Generator) com `SEED_RANDOM_SEED=42`. Isso garante:

- **Reprodutibilidade**: qualquer `docker compose up` gera o mesmo dataset
- **Comparabilidade**: SQL Server e PostGIS têm dados geometricamente idênticos
- **Consistência de benchmark**: resultados podem ser comparados entre máquinas

Volumetria gerada:
| Tabela | Linhas | Tipo | Geometria |
|--------|--------|------|-----------|
| `postes` | ~50.000 | POINT | WGS84, bbox Paraná |
| `trechos` | ~100.000 | LINESTRING | 2–8 vértices |
| `subestacoes` | ~2.000 | POLYGON | Polígonos convexos |
| Inconsistências | ~15.000 | — | 5 categorias injetadas |

---

## Decisões de Arquitetura Documentadas

| ADR | Pergunta | Decisão |
|-----|----------|---------|
| [001](adr/001-sql-server-vs-postgis.md) | Por que dois bancos? | Comparação empírica > escolha arbitrária |
| [002](adr/002-geoserver-vs-api-direta.md) | GeoServer ou API direta? | GeoServer para WMS/WFS; API para análise/AI |
| [003](adr/003-estrategia-indexacao.md) | Qual índice espacial? | AUTO_GRID (SQL Server) + GIST (PostGIS), parâmetros documentados |
| [004](adr/004-volumetria-e-particionamento.md) | Como escalar além do POC? | Roadmap 50k→50M com estratégia por faixa |
| [005](adr/005-ia-no-pipeline.md) | IA no produto ou no processo? | Nos dois: endpoints de análise + tooling de engenharia |

---

## Variáveis de Ambiente Críticas

| Variável | Serviço | Descrição |
|----------|---------|-----------|
| `SA_PASSWORD` | sqlserver | Senha do SA (mín. 8 chars, maiúsc., núm., especial) |
| `POSTGRES_PASSWORD` | postgis | Senha do superuser |
| `ANTHROPIC_API_KEY` | api | Chave de API do Claude — sem ela, `/ai/*` retorna `AI_NOT_CONFIGURED` |
| `SEED_RANDOM_SEED` | sqlserver-seed | Seed do gerador (default: `42`) |
| `API_PORT` | api | Porta da API (default: `3000`) |

Todas as variáveis estão documentadas em `.env.example`. Nenhuma senha é hardcoded no código — ver regra no `.claude/agents/reviewer.md`.
