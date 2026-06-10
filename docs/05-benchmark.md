# Benchmark — Metodologia e Resultados

> **Objetivo**: Comparar SQL Server 2022 e PostGIS 3.4 em 15 cenários de workload espacial
> representativos de uma rede de distribuição elétrica.
>
> Spec completa: [`specs/05-benchmark-spec.md`](../specs/05-benchmark-spec.md)

---

## Metodologia

### Princípios

1. **Dataset idêntico**: SQL Server e PostGIS recebem os mesmos dados gerados com `SEED=42`
2. **Isolamento**: cada cenário roda de forma independente, sem concorrência
3. **Warmup descartado**: 3 iterações aquecidas antes das medidas reais
4. **Métricas**: p50, p95, p99 (ms) e throughput (req/s) — 10 iterações medidas por padrão
5. **Vencedor por p95**: p95 é mais representativo que média (imune a outliers pontuais)
6. **Tie**: diferença < 5ms é considerada empate

### Configuração Padrão

```json
{
  "warmup_iterations": 3,
  "measured_iterations": 10,
  "timeout_ms": 5000
}
```

### Índices Utilizados

| Banco | Índice | Parâmetros |
|-------|--------|-----------|
| SQL Server | `GEOMETRY_AUTO_GRID` | `BOUNDING_BOX=(-54.6,-26.7,-48.0,-22.5)`, `CELLS_PER_OBJECT=8/16` |
| PostGIS | `GIST` | padrão — sem parâmetros adicionais necessários |

---

## Cenários (B01–B15)

| ID | Descrição | Tipo | Tabela(s) |
|----|-----------|------|-----------|
| B01 | Bbox — região densa (Grande Curitiba) | spatial_filter | postes |
| B02 | Bbox — região esparsa (oeste rural) | spatial_filter | postes |
| B03 | Bbox — features de linha (trechos) | spatial_filter | trechos |
| B04 | Bbox — polígonos (full Paraná) | spatial_filter | subestacoes |
| B05 | Ponto dentro do polígono | containment | subestacoes |
| B06 | Filtro por distância (raio 500m) | distance_filter | postes |
| B07 | Spatial JOIN — poste ↔ trecho | spatial_join | postes, trechos |
| B08 | Agregação — postes por subestação | spatial_aggregation_join | subestacoes, postes |
| B09 | Filtro misto — atributo + spatial | mixed | postes |
| B10 | Agregação COUNT — postes por área | aggregate | subestacoes, postes |
| B11 | Scan de geometrias inválidas | validity_scan | subestacoes |
| B12 | KNN — 5 postes mais próximos | knn | postes |
| B13 | Self-join — trechos que se cruzam | self_join | trechos |
| B14 | Cross-schema JOIN — postes + verifier | cross_schema | postes, vw_pontos_fora_poligono |
| B15 | Scan completo da view de validação | validation_full | vw_resumo_inconsistencias |

---

## Como Gerar os Resultados

### Pré-requisitos

```bash
docker compose up -d        # inicia o stack completo (inclui seed)
# aguardar seed terminar (~2 min)
```

### Executar

```bash
cd benchmark
npm install                 # apenas na primeira vez
npm run run                 # executa todos os 15 cenários
```

Resultado gravado em:
- `benchmark/results/<timestamp>.json` — dados brutos
- `benchmark/results/latest.md` — tabela Markdown formatada

### Execução Parcial

```bash
tsx runner.ts --scenarios B01,B05,B07,B12 --warmup 1 --iters 5
```

### Via CI (GitHub Actions)

O workflow `.github/workflows/benchmark-report.yml` roda manualmente:

```
GitHub → Actions → Benchmark Report → Run workflow
```

Os resultados são commitados automaticamente em `benchmark/results/`.

---

## Resultados

> Execute `npm run run` dentro de `benchmark/` com o stack rodando para gerar os resultados.
> Os dados abaixo serão preenchidos automaticamente em `benchmark/results/latest.md`.

| ID | Cenário | SQL p95 | PG p95 | Vencedor | Margem |
|----|---------|---------|--------|----------|--------|
| B01 | Bbox densa | — | — | TBD | — |
| B02 | Bbox esparsa | — | — | TBD | — |
| B03 | Bbox trechos | — | — | TBD | — |
| B04 | Bbox subestações | — | — | TBD | — |
| B05 | Ponto em polígono | — | — | TBD | — |
| B06 | Filtro distância | — | — | TBD | — |
| B07 | JOIN poste↔trecho | — | — | TBD | — |
| B08 | Agrega postes/subest. | — | — | TBD | — |
| B09 | Misto atrib.+spatial | — | — | TBD | — |
| B10 | COUNT por área | — | — | TBD | — |
| B11 | Scan inválidos | — | — | TBD | — |
| B12 | KNN 5 vizinhos | — | — | TBD | — |
| B13 | Self-join trechos | — | — | TBD | — |
| B14 | Cross-schema | — | — | TBD | — |
| B15 | Full validation scan | — | — | TBD | — |

---

## Hipóteses a Validar

Com base em literatura e experiência, esperamos:

| Cenário | Hipótese | Razão |
|---------|----------|-------|
| B12 KNN | PostGIS mais rápido | Operador `<->` com suporte nativo de índice GIST; SQL Server precisa de full scan + ORDER BY |
| B07 JOIN | PostGIS mais rápido | `ST_DWithin` aproveita GIST; `STDistance < r` no SQL Server pode fazer full scan |
| B09 Misto | SQL Server competitivo | Índice de atributo filtra antes do spatial; ambos têm essa otimização |
| B15 Validação | Similar | Ambos leem views simples sem geometria serializada |
| B01–B04 Bbox | PostGIS vantagem em scan denso | GIST com bbox-only scan vs AUTO_GRID com verificação em dois passos |

---

## Interpretação com IA

Após gerar os resultados, envie para a análise:

```bash
# Gera e salva o JSON
tsx runner.ts --out ./results

# Envia para o Claude interpretar
curl -X POST http://localhost:3000/ai/benchmark-insights \
  -H "Content-Type: application/json" \
  -d @results/latest.json
```

A resposta incluirá:
- `executive_summary` — resumo executivo
- `tradeoff_analysis` — quais cenários cada banco vence e por quê
- `optimization_suggestions` — sugestões concretas de índice ou rewrite de query
- `cost_analysis` — quando a diferença de licença compensa (ou não)
