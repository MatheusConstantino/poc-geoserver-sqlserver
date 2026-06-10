# ADR-002: GeoServer para visualização, API REST para análise

**Status**: Accepted
**Date**: 2025-01-15
**Deciders**: Matheus, PO Agent

---

## Contexto

Há duas formas de expor dados geoespaciais para consumo externo:
1. **GeoServer WMS/WFS**: padrão OGC, amplamente usado em sistemas GIS corporativos
2. **API REST direta**: flexível, sem overhead de protocolo, mais fácil de integrar com JS/mobile

Para este projeto, precisamos de:
- Visualização dos dados no mapa (Layer Preview)
- Análise de inconsistências (queries complexas)
- Benchmark parametrizado (queries customizadas)
- Endpoints de IA (análise com Claude)

A questão é: qual abordagem para qual propósito?

---

## Decisão

**GeoServer para visualização (WMS/WFS), API Node.js para análise, benchmark e IA.**

GeoServer expõe os dados geoespaciais brutos em padrão OGC — qualquer cliente GIS (QGIS, Leaflet, OpenLayers) pode consumir sem código customizado. A API Node.js implementa lógica de negócio que o GeoServer não suporta: validação, benchmark orquestrado, integração com Claude API.

---

## Consequências

### Positivas
- GeoServer demonstra conhecimento do padrão OGC (WMS, WFS) — valorizado em projetos GIS enterprise
- API REST permite implementar qualquer lógica sem as limitações do GeoServer
- Separação clara de responsabilidades: visualização vs. análise
- Stack modular: pode trocar GeoServer por MapServer/MapProxy sem afetar a API

### Negativas / Trade-offs
- Dois servidores para manter (GeoServer + API) em vez de um
- GeoServer tem curva de aprendizado: workspace, store, layer, estilo — são conceitos distintos
- O bug de bbox do SQL Server JDBC só aparece com GeoServer (não com a API direta) — documentar é obrigatório

### Riscos
- **GeoServer + SQL Server JDBC**: plugin tem bugs conhecidos para não-POINT geometries
  - Mitigação: bbox explícito em cada layer config (documentado em `docs/03-setup-geoserver.md`)

---

## Alternativas Consideradas

### Opção A: Apenas API REST (sem GeoServer)
**Pros**: stack mais simples, menos containers, mais fácil de manter
**Cons**: não demonstra conhecimento de WMS/WFS e padrões OGC — remove um diferencial técnico do portfólio
**Rejeitada porque**: GeoServer é explicitamente um dos objetivos do projeto

### Opção B: Apenas GeoServer (sem API REST)
**Pros**: foco em GIS standards, menos código Node.js para manter
**Cons**: GeoServer não suporta: benchmark parametrizado, integração com Claude API, relatórios customizados
**Rejeitada porque**: a camada de IA e os endpoints de análise são objetivos do projeto

### Opção C: GeoServer + Python API (FastAPI)
**Pros**: Python tem melhor ecossistema GIS (shapely, geopandas)
**Cons**: contradiz o requisito de Node.js 20+ LTS declarado no `init.md`
**Rejeitada porque**: Node.js é o requisito explícito

---

## Impacto por Volume

| Escala | Impacto |
|--------|---------|
| POC (atual) | GeoServer + API Node.js em um Docker Compose — nenhum problema |
| 500k features | GeoServer precisa de tile caching (GeoWebCache já incluído) |
| 5M+ features | GeoServer cluster necessário; API precisa de connection pooling explícito |
| Produção | Separar GeoServer e API em serviços distintos com load balancer |

---

## Referências
- `docs/03-setup-geoserver.md` — configuração detalhada e bug fix do bbox
- `specs/02-api-spec.md` — contratos dos endpoints REST
