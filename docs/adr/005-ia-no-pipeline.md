# ADR-005: IA como Ferramenta de Engenharia no Pipeline

**Status**: Accepted
**Date**: 2025-01-15
**Deciders**: Matheus

---

## Contexto

IA generativa (LLMs) está rapidamente se tornando parte do workflow de engenharia, mas há dois
padrões distintos de uso que precisam ser diferenciados:

1. **IA no produto**: o sistema usa IA para entregar valor ao usuário final (ex.: endpoints `/ai/*`)
2. **IA no processo**: o engenheiro usa IA como ferramenta de trabalho (ex.: `.claude/`, GitHub Actions)

A maioria dos projetos de portfólio mostra apenas o primeiro padrão. Mostrar o segundo é raro e
mais valioso para demonstrar maturidade de engenharia.

A questão é: como integrar IA de forma que seja genuínas, transparente, e demonstre domínio — sem
parecer que o projeto "foi feito pelo Claude".

---

## Decisão

**Integrar IA em dois níveis explicitamente documentados:**

### Nível 1 — IA no Produto (endpoints `/ai/*`)
Claude API integrada como serviço dentro da API Node.js:
- `/ai/analyze-inconsistencies`: interpreta relatório de validação espacial
- `/ai/benchmark-insights`: interpreta comparação SQL Server vs PostGIS
- `/ai/query-suggestions`: sugere otimizações de query

Todos os endpoints usam structured output com Zod validation — IA como serviço confiável, não como
caixa preta.

### Nível 2 — IA no Processo (`.claude/`)
Claude Code configurado como conjunto de agentes especializados:
- **Agentes** com personas por papel (PO, QA, Infra, Reviewer, Spatial Expert)
- **Slash commands** para workflows recorrentes (`/project:review`, `/project:deploy`, etc.)
- **GitHub Action** `ai-pr-review.yml` que posta review automático em cada PR
- **CLAUDE.md** com contexto do projeto carregado em cada sessão

### Nível 3 — Transparência no Processo
`docs/07-ia-engineering.md` documenta:
- Quais partes do projeto foram aceleradas com IA
- Quais decisões foram tomadas pelo humano vs. sugeridas pela IA
- Como os agentes foram usados no dia a dia

---

## Consequências

### Positivas
- Diferencia o portfólio: poucos projetos documentam o processo de desenvolvimento com IA tão explicitamente
- Demonstra que o autor entende **como** usar IA, não apenas que "existe IA"
- Os slash commands são documentação executável — melhor que wikis desatualizadas
- O AI PR review cria evidência verificável de uso de IA no workflow (visible em cada PR)
- Structured output + Zod validation mostra IA production-ready, não apenas demo

### Negativas / Trade-offs
- Requer `ANTHROPIC_API_KEY` para os endpoints de IA — projetos sem a key têm experiência incompleta
  - Mitigação: endpoints de IA são opcionais; o core (validação, benchmark) funciona sem elas
- O review automático de PR pode ter falsos positivos ou sugestões incorretas
  - Mitigação: documentado no workflow que "é um primeiro passo, não substitui review humano"
- Existe o risco de que o portfólio pareça "gerado por IA" em vez de "feito por um humano com IA"
  - Mitigação: ADRs, specs, e comentários nos commits documentam o raciocínio humano

### Riscos
- **Prompt injection**: se a API recebe entrada do usuário e a envia ao Claude sem sanitização
  - Mitigação: inputs são validados com Zod antes de chegar ao prompt; user content é claramente delimitado do system prompt
- **Custo de API**: endpoints de IA têm custo por token
  - Mitigação: budget estimado em `specs/06-ai-integration-spec.md` (~$0.002-0.003/request)

---

## Filosofia: "IA Amplifica, Humano Decide"

Este projeto segue o princípio de que IA é uma ferramenta de amplificação:
- Specs foram **estruturadas pelo humano**, **refinadas com IA**
- ADRs foram **raciocínadas pelo humano**, **formatadas com IA**
- Código será **implementado com IA**, **revisado pelo humano** (via `/project:review`)
- Resultados do benchmark são **gerados pela infra**, **interpretados pela IA**, **validados pelo humano**

O agente Reviewer tem instruções explícitas para identificar prompt injection, `any` no TypeScript, e
segredos hardcoded — porque IA também erra, e o review é a rede de segurança.

---

## Alternativas Consideradas

### Opção A: Sem integração de IA (projeto puramente técnico)
**Pros**: mais focado no GeoServer + SQL Server + PostGIS
**Cons**: perde o diferencial de "engenheiro que sabe usar IA" que é cada vez mais relevante em 2025/2026
**Rejeitada porque**: contradiz um objetivo explícito do projeto

### Opção B: Usar OpenAI/GPT em vez de Claude
**Pros**: maior reconhecimento de marca
**Cons**: menos alinhado com as ferramentas que o autor usa no dia a dia; Claude tem melhor structured output para casos de uso técnicos
**Rejeitada porque**: Claude é a escolha genuína do autor

### Opção C: Apenas IA no processo (sem endpoints `/ai/*`)
**Pros**: mais honesto sobre onde a IA agrega valor real
**Cons**: não demonstra integração de LLM em código, que é um skill diferenciado
**Rejeitada porque**: ambos os níveis são importantes para o portfólio

---

## Referências
- `specs/06-ai-integration-spec.md` — contratos, prompts, schemas dos endpoints de IA
- `.claude/CLAUDE.md` — configuração do projeto para Claude Code
- `.claude/agents/` — personas dos agentes
- `docs/07-ia-engineering.md` — documentação do processo de desenvolvimento com IA
