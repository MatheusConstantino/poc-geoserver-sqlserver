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

## Dados de Referência — Comparativo Real (via GeoServer WFS)

> Dados coletados em 2026-06-03 com a mesma volumetria deste POC (50k pontos, 100k linhas, 2k polígonos).
> Metodologia: 3 warmup + 10 medições, p50/p95/max reportados.
> **Importante**: PostGIS rodava em servidor remoto (DEV), incluindo ~50–100ms de latência de rede.
> SQL Server rodava local (Docker), equivalente ao ambiente deste POC.
> Todos os números abaixo são via **GeoServer WFS** (não query direta ao banco).

### SQL Server (local Docker) — todos os cenários

| Cenário | Descrição | p50 | p95 | Max | Status |
|---------|-----------|-----|-----|-----|--------|
| C3.1 | GetFeature PONNOT sem filtro (1k feat) | 570ms | 643ms | 643ms | OK |
| C3.2 | GetFeature SSDMT sem filtro (1k feat) | 510ms | 680ms | 680ms | OK |
| C3.3 | GetFeature SUB sem filtro (1k feat) | 539ms | 709ms | 709ms | OK |
| C4.1 | Bbox pequeno ~1km² — pontos | 482ms | 578ms | 578ms | OK |
| C4.2 | Bbox grande ~10km² — pontos | 601ms | 737ms | 737ms | OK |
| C4.3 | Bbox pequeno ~1km² — linhas | 603ms | 710ms | 710ms | OK |
| C4.4 | Bbox grande ~10km² — linhas | 588ms | 834ms | 834ms | OK |
| C5.1 | CQL atributo exato (`tip_pn='TE'`) | 639ms | 818ms | 818ms | OK |
| C5.4 | CQL ILIKE (`ILIKE '%trafo%'`) | 524ms | 583ms | 583ms | OK |
| C6.1 | Search cross-layer por código | 590ms | 702ms | 702ms | OK |
| C7.1 | SQL View JOIN — inconsistências sem filtro | 471ms | 561ms | 561ms | OK |
| C7.2 | SQL View JOIN — inconsistências com bbox | 535ms | 844ms | 844ms | OK |
| C8.1 | WMS GetMap PONNOT (256×256) | 476ms | 562ms | 562ms | OK |
| C8.2 | WMS GetMap SSDMT (256×256) | 481ms | 586ms | 586ms | OK |
| C8.3 | WMS GetMap SUB (256×256) | 475ms | 716ms | 716ms | OK |

Todos os 19 cenários ficaram abaixo de 1s (p95). Critério de aceitação: bbox < 1s, GetFeature < 2s, WMS < 500ms (p50 OK, p95 ligeiramente acima).

### Comparativo direto SQL Server vs PostGIS (via GeoServer WFS)

| Cenário | PostGIS DEV | SQL Server Local | Observação |
|---------|-------------|------------------|-----------|
| Listar layers | 772ms | 514ms | SQL Server 33% mais rápido — mas PostGIS tem Redis cache quente |
| Bbox pontos pequeno (~1km²) | 652ms | 662ms | **Empate** (~1.5%) |
| Bbox pontos grande (~10km²) | 598ms | 575ms | SQL Server 4% mais rápido |
| Bbox linhas pequeno | 724ms | 482ms | SQL Server 33% mais rápido |
| Bbox linhas grande | 635ms | 508ms | SQL Server 20% mais rápido |
| Bbox polígonos | 603ms | 490ms | SQL Server 19% mais rápido |
| CQL filtro atributo | 818ms | 572ms | SQL Server 30% mais rápido |
| Search cross-layer | 1.622ms | 605ms | SQL Server 63% — PostGIS busca em 40 layers vs 3 do POC |
| SQL View JOIN (inconsistências) | N/A | 663ms | Sem baseline PostGIS, mas < 1s |

**Conclusão observada**: SQL Server equivalente ou superior em todos os cenários WFS testados. Descontando ~100ms de latência de rede do PostGIS, a diferença real é pequena — os bancos são **equivalentes** neste workload.

### Hipóteses — validadas ou refutadas

| Hipótese original | Resultado observado | Veredito |
|-------------------|---------------------|---------|
| PostGIS mais rápido em bbox scan denso | Empate (~1.5%) para pontos; SQL Server 20-33% mais rápido para linhas | **Refutada** |
| PostGIS ganha em spatial JOINs (`ST_DWithin`) | Sem dados diretos — SQL Views com JOIN no SQL Server: 471-663ms, aceitável | **Inconclusiva** |
| SQL Server competitivo em filtros mistos | SQL Server 30% mais rápido no CQL via WFS | **Confirmada** |
| Views de validação similares | SQL Server: 561-844ms p95 — sem baseline PostGIS comparável | **Parcial** |
| PostGIS KNN com `<->` mais eficiente | Não testado via WFS — hipótese permanece para benchmark direto B12 | **Pendente** |

> **Nota metodológica**: os dados acima são de queries **via GeoServer WFS** (HTTP → GeoServer → banco).
> Os cenários B01–B15 deste POC medem queries **diretamente no banco** (sem GeoServer como proxy),
> eliminando a variável de serialização GeoJSON/GML e renderização do GeoServer.
> Os resultados diretos podem diferir — execute `npm run run` para obter números precisos.

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
