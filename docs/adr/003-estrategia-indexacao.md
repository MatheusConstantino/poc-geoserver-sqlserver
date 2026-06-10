# ADR-003: Estratégia de Indexação Espacial

**Status**: Accepted
**Date**: 2025-01-15
**Deciders**: Matheus, Spatial Expert Agent

---

## Contexto

Índices espaciais têm comportamento contraintuitivo: eles podem piorar a performance em certos
cenários. A escolha de parâmetros (BOUNDING_BOX, CELLS_PER_OBJECT no SQL Server; tipo de índice
no PostGIS) impacta diretamente os resultados do benchmark.

Precisamos definir explicitamente a estratégia de indexação e documentar os trade-offs, porque
qualquer pessoa lendo o repo vai comparar os resultados do benchmark com e sem índice.

Perguntas a responder:
- Qual tipo de índice para cada geometry type?
- Quais parâmetros?
- Em quais cenários o índice é contraproducente?

---

## Decisão

### SQL Server: `GEOMETRY_AUTO_GRID` com BOUNDING_BOX ajustado ao extent real dos dados

```sql
-- postes (POINT)
CREATE SPATIAL INDEX IX_postes_geom ON rede_eletrica.postes(geom)
USING GEOMETRY_AUTO_GRID
WITH (BOUNDING_BOX = (-54.6, -26.7, -48.0, -22.5), CELLS_PER_OBJECT = 8)

-- trechos (LINESTRING) — mais células por objeto para features longas
CREATE SPATIAL INDEX IX_trechos_geom ON rede_eletrica.trechos(geom)
USING GEOMETRY_AUTO_GRID
WITH (BOUNDING_BOX = (-54.6, -26.7, -48.0, -22.5), CELLS_PER_OBJECT = 16)

-- subestacoes (POLYGON) — idem
CREATE SPATIAL INDEX IX_subestacoes_geom ON rede_eletrica.subestacoes(geom)
USING GEOMETRY_AUTO_GRID
WITH (BOUNDING_BOX = (-54.6, -26.7, -48.0, -22.5), CELLS_PER_OBJECT = 16)
```

### PostGIS: `GIST` (padrão para geometrias 2D)

```sql
CREATE INDEX idx_postes_geom     ON rede_eletrica.postes     USING GIST(geom);
CREATE INDEX idx_trechos_geom    ON rede_eletrica.trechos    USING GIST(geom);
CREATE INDEX idx_subestacoes_geom ON rede_eletrica.subestacoes USING GIST(geom);
```

---

## Justificativas dos Parâmetros

### BOUNDING_BOX no SQL Server
**Por que não usar os defaults ou bounds do mundo?**
O índice R-tree do SQL Server divide o espaço em uma grade hierárquica. Se a BOUNDING_BOX for
muito maior que os dados reais (ex.: mundo inteiro para dados do Paraná), as células da grade ficam
enormes, o índice perde seletividade e as queries ficam até 10x mais lentas.

Usar o extent exato do Paraná (-54.6 a -48.0 lon, -26.7 a -22.5 lat) maximiza a densidade da grade
no espaço relevante.

### CELLS_PER_OBJECT: 8 para POINT, 16 para LINESTRING/POLYGON
- POINT ocupa exatamente 1 célula da grade → 8 células por objeto é o suficiente
- LINESTRING e POLYGON podem cruzar múltiplas células → 16 células captura melhor a forma

### Por que GIST no PostGIS e não BRIN ou SP-GiST?
- **GIST**: R-tree generalizado, equilibrado para leitura aleatória, range queries, e containment
- **SP-GiST**: melhor para dados hierárquicos (quadtree) — não é o caso aqui
- **BRIN**: ótimo para dados fisicamente ordenados por localização — útil apenas se os dados foram
  inseridos em ordem geográfica, o que nosso seed não garante

---

## Quando o Índice PIORA a Performance

Documentado explicitamente para o benchmark (cenário B15):

| Situação | Por quê piora | Solução |
|----------|--------------|---------|
| Bbox cobre > 30% do extent total | O índice retorna quase todas as linhas, o overhead de index scan supera o sequential scan | Ignorar o índice com hint ou aceitar full scan |
| Tabelas pequenas (< 5k linhas) | Overhead do índice > custo do scan sequencial | Não criar índice para tabelas pequenas |
| STDistance com ORDER BY TOP N | SQL Server não suporta KNN nativo no índice — ordena após fetch | Limitar bbox antes do STDistance |
| Geometrias inválidas | STIntersects retorna NULL para geometrias inválidas → índice não é usado | Validar com STIsValid antes de indexar |

O benchmark inclui cenários **sem** hint de índice (default do otimizador) e **com** hint explícito
(`WITH (INDEX(IX_postes_geom))`) para demonstrar a diferença.

---

## Alternativas Consideradas

### Opção A: `GEOMETRY_GRID` manual (SQL Server)
**Pros**: controle total sobre os níveis da grade (LOW/MEDIUM/HIGH/VERY_HIGH)
**Cons**: requer tuning manual por tipo de dado; `AUTO_GRID` resolve isso automaticamente em SQL Server 2012+
**Rejeitada porque**: `AUTO_GRID` é a recomendação atual da Microsoft para a maioria dos casos

### Opção B: `SPGIST` (PostGIS)
**Pros**: mais eficiente em memória para dados com hierarquia espacial natural
**Cons**: menos suportado por extensões do PostGIS; comportamento menos previsível em range queries
**Rejeitada porque**: GIST é o padrão estabelecido e tem melhor suporte de documentação

---

## Impacto por Volume

| Volume | GEOMETRY_AUTO_GRID (SQL Server) | GIST (PostGIS) |
|--------|--------------------------------|----------------|
| 50k (POC) | Excelente — index fit in memory | Excelente |
| 500k | Bom — índice ocupa ~200MB | Bom — GIST escala bem |
| 5M | Considerar particionamento + índices por partição | Considerar índices parciais por região |
| 50M+ | Particionamento obrigatório; índice global não cabe em memória | Citus + índices distribuídos |

---

## Referências
- `specs/05-benchmark-spec.md` — cenários B01-B15 que testam os índices
- `docs/02-modelo-dados.md` — definição completa dos índices
- Microsoft Docs: [Spatial Indexes Overview](https://learn.microsoft.com/en-us/sql/relational-databases/spatial/spatial-indexes-overview)
