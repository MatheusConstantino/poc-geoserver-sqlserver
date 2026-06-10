# ADR-004: Volumetria e Estratégia de Particionamento

**Status**: Accepted
**Date**: 2025-01-15
**Deciders**: Matheus, Infra Agent

---

## Contexto

O POC usa ~152k features (50k + 100k + 2k). Isso é suficiente para demonstrar índices espaciais,
mas é 2-3 ordens de magnitude abaixo de sistemas de produção reais (redes elétricas de distribuidoras
grandes têm 2-10 milhões de postes).

As decisões arquiteturais tomadas para 50k features são diferentes das decisões para 5M features.
Este ADR documenta explicitamente **quando e como a arquitetura precisa evoluir**, mesmo que não
implementemos as versões escaladas aqui.

Isso serve dois propósitos:
1. Mostra que o autor pensa além do MVP
2. Dá ao leitor do portfólio um roadmap de como escalar o sistema

---

## Decisão

**Não implementar particionamento no POC.** Documentar explicitamente o ponto de ruptura e a estratégia
de evolução em cada faixa de volume.

O POC usa tables simples (não particionadas) com índices espaciais globais. Isso é correto e suficiente
para até ~500k features com hardware modesto.

---

## Análise de Volume por Faixa

### Faixa 1: 50k–500k features (POC e pequenas distribuidoras)
**Arquitetura**: Tables simples + índices espaciais globais (implementada neste POC)
- SQL Server: `GEOMETRY_AUTO_GRID` com BOUNDING_BOX do Paraná
- PostGIS: GIST simples
- Performance de bbox query (dense): p95 < 50ms
- RAM necessária: < 4GB para o stack completo
- Nenhum particionamento necessário

**Ponto de atenção**: STDistance com ORDER BY em 500k linhas começa a ser lento (> 1s)
→ Solução: bbox pre-filter antes do STDistance

### Faixa 2: 500k–5M features (médias distribuidoras)
**Arquitetura**: Particionamento por região geográfica

SQL Server — Partition by macrorregião:
```sql
CREATE PARTITION FUNCTION pf_regiao (INT)
AS RANGE LEFT FOR VALUES (1, 2, 3, 4, 5)  -- 5 macrorregiões do Paraná

CREATE PARTITION SCHEME ps_regiao
AS PARTITION pf_regiao ALL TO ([PRIMARY])

ALTER TABLE rede_eletrica.postes
ADD regiao_id AS (-- computed column mapping geom to regiao)

CREATE CLUSTERED INDEX CX_postes_regiao ON rede_eletrica.postes(regiao_id, id)
ON ps_regiao(regiao_id)
```

PostGIS — Partition by bounding box region:
```sql
CREATE TABLE rede_eletrica.postes (id SERIAL, ...)
PARTITION BY LIST (regiao_id);

CREATE TABLE rede_eletrica.postes_curitiba
PARTITION OF rede_eletrica.postes FOR VALUES IN (1);
-- etc.
```

**Impacto no GeoServer**: layers precisam de views que unem as partições → sem impacto no cliente.
**Impacto no benchmark**: queries dentro de uma partição ficam 5-10x mais rápidas.

### Faixa 3: 5M–50M features (grandes distribuidoras ou sistemas nacionais)
**Arquitetura**: Banco distribuído ou cloud-native

SQL Server:
- Azure SQL Hyperscale (sharding automático, auto-scale)
- Custo: ~$1,200/mês para uma instância média (vs. ~$0 para PostgreSQL open-source)
- Diferencial: integração nativa com Power BI, SSRS, Azure Data Factory

PostGIS:
- Citus (distributed PostgreSQL) — sharding por `regiao_id`
- Ou AlloyDB (Google Cloud managed PostGIS) para workloads de leitura intensiva
- Custo: muito menor que SQL Server em produção

**Ponto de inflexão de custo**: acima de 5M features, SQL Server Standard (~$3,586/core/year) começa
a ser economicamente desfavorável versus PostGIS (gratuito). SQL Server Enterprise é necessário para
features avançadas de particionamento ($7,128/core/year).

### Faixa 4: 50M+ features (sistemas nacionais, ANEEL scale)
**Arquitetura**: Dedicated spatial data warehouse

Opções:
- BigQuery + BigQuery GIS (gerenciado, escala automática, preço por query)
- Snowflake + H3 (índice espacial por hexágono, excelente para análise)
- Apache Sedona (Spark + dados geoespaciais) para processamento batch

GeoServer neste cenário: substituído por tile servers (MapTiler, TileServer GL) que servem tiles
pré-gerados — não queries ao vivo no banco.

---

## Consequências desta Decisão (não implementar no POC)

### Positivas
- Mantém o POC simples e reproduzível
- Evita over-engineering para um dataset de 152k features
- A documentação do roadmap de escala é mais valiosa que a implementação em si (para portfólio)

### Negativas
- Alguém que tentar usar este projeto como base para 5M+ features vai precisar reescrever o schema
- O benchmark com 50k features pode não extrapolar linearmente para volumes maiores

---

## Alternativas Consideradas

### Opção A: Implementar particionamento já no POC
**Pros**: mais realista para produção
**Cons**: aumenta complexidade sem benefício mensurável com 152k features; mascara o benefício do índice simples
**Rejeitada porque**: complexidade desnecessária para o volume atual

### Opção B: Escalar o dataset do POC para 5M features
**Pros**: benchmark mais representativo
**Cons**: seed levaria 30+ min; SQL Server Developer teria que ser substituído por uma edição cara; container ficaria impraticável
**Rejeitada porque**: inviável para uso em developer machine

---

## Referências
- `docs/08-volumetria-tradeoffs.md` — análise detalhada com tabela de custos por volume
- ADR-001 — decisão de usar ambos os bancos (impactada por custo de licença em escala)
- ADR-003 — estratégia de indexação (base para o particionamento)
