# ADR-001: Usar SQL Server E PostGIS (não escolher um)

**Status**: Accepted
**Date**: 2025-01-15
**Deciders**: Matheus, PO Agent, Spatial Expert Agent

---

## Contexto

Ao avaliar stacks geoespaciais para sistemas de rede de distribuição elétrica, a pergunta mais
frequente é: **SQL Server ou PostGIS?** Ambos suportam dados espaciais, ambos têm índices espaciais,
ambos integram com GeoServer. A tendência natural é escolher um.

O contexto de portfólio adiciona uma segunda dimensão: o projeto precisa demonstrar profundidade
técnica, não apenas que "funciona com um banco de dados".

Forças em jogo:
- Empresas do setor elétrico brasileiro frequentemente usam SQL Server (integração com SSRS, Power BI, ecossistema Microsoft)
- Startups e órgãos públicos tendem a PostGIS (custo zero, ecossistema open-source)
- A diferença de performance não é óbvia — depende do tipo de query e do volume
- Existe o bug de bbox do GeoServer com SQL Server que precisa ser documentado

---

## Decisão

**Usar os dois bancos de dados em paralelo, com os mesmos dados, para comparação explícita.**

SQL Server é o banco primário (integra com GeoServer, é o foco principal do portfólio).
PostGIS é o banco de comparação (mesmo schema, mesmo dataset, para benchmark lado a lado).

---

## Consequências

### Positivas
- Permite comparação quantitativa real (p50, p95) entre os dois — raro em projetos de portfólio
- Demonstra conhecimento de ambos os ecossistemas (diferencial para empresas que usam um e consideram migrar)
- O benchmark produz insights genuínos, não hipotéticos
- Qualquer desenvolvedor que clonar o repo pode reproduzir a comparação

### Negativas / Trade-offs
- Aumenta a complexidade da infraestrutura (dois bancos, dois schemas, dois sets de índices)
- Tempo de seed duplicado (inserir 152k features em dois bancos em vez de um)
- Custo de memória: SQL Server requer ~2GB RAM mínimo, PostGIS ~512MB — total ~3GB para o stack

### Riscos
- **Divergência de dados**: se o seed de um banco falhar parcialmente, o benchmark não é válido
  - Mitigação: healthcheck no seed runner que valida contagens antes de sair

---

## Alternativas Consideradas

### Opção A: Apenas SQL Server
**Pros**: mais simples, foco total no GeoServer+SQL Server (o tema principal)
**Cons**: sem comparação quantitativa — qualquer afirmação sobre performance é anedótica
**Rejeitada porque**: o benchmark comparativo é um diferencial técnico forte demais para abrir mão

### Opção B: Apenas PostGIS
**Pros**: PostGIS é mais maduro espacialmente, melhor documentado, mais usado em código aberto
**Cons**: não demonstra o conhecimento do ecossistema SQL Server que é o foco declarado
**Rejeitada porque**: contradiz o objetivo principal do projeto

### Opção C: SQL Server com plugin PostGIS (SQL Server on Linux)
**Pros**: um servidor, dois modos
**Cons**: não existe — SQL Server não tem extensão PostGIS
**Rejeitada porque**: não é uma opção real

---

## Impacto por Volume

| Escala | Impacto desta decisão |
|--------|----------------------|
| 50k features (POC) | Negligível — ambos os bancos sobem em < 2 min |
| 500k features | Seed leva 2x mais tempo; RAM necessária dobra |
| 5M+ features | Esta abordagem de dois bancos ficaria cara em produção (licença SQL Server + infra extra) |
| Produção | Escolher um banco com base nos dados reais do benchmark deste projeto |

---

## Referências
- `specs/03-data-model-spec.md` — schemas idênticos nos dois bancos
- `specs/05-benchmark-spec.md` — 15 cenários comparativos
- `docs/06-comparacao-postgis.md` — análise detalhada dos resultados
