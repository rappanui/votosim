# Procedimentos

**Context:** Documentos que se lê do início ao fim para executar alguma coisa —
por um agente de IA ou por uma pessoa. Diferente de `docs/referencia/`, que se
consulta pulando pra dentro.

---

## Convenções desta pasta

- **Sem limite de linhas.** Um procedimento que omite um passo está quebrado;
  completude vence concisão. `docs/referencia/` é que tem o teto de 200 linhas.
- **Pode repetir fatos** que moram na referência — quem executa não pode se dar
  ao luxo de seguir um link. Mas **todo fato repetido nomeia sua fonte**, para
  que a deriva seja encontrável com um grep.
- Toda página começa com `**Context:**` dizendo quem executa e quando.

## Isto não é `.claude/skills/`

Skills são **invocadas** pelo harness e carregam instruções na hora. Procedimentos
são **lidos**. Uma skill pode apontar para um procedimento; não duplique um dentro
da outra.
