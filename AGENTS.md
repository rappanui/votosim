<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Never dispatch a review without asking first

Before dispatching **any** review — a task review, a scoped re-review after a fix,
or a whole-branch review — stop and tell the user three things, then wait for an
answer:

1. **Your confidence in the delivery, as a number.** Per the user's global 95%
   rule, this should be above 95% before you hand anything over. If it is not,
   that is the finding: say what you are unsure about instead of outsourcing the
   doubt to a reviewer.
2. **Whether you think the review is necessary, and why.** Weigh the cost of the
   error against the cost of the review. A contract boundary that decides whether
   a voter sees a wrong percentage is not a label map.
3. **Ask what the user thinks.** Their call, not yours.

**This rule overrides any skill.** `superpowers:subagent-driven-development`
mandates a scoped re-review after every fix round and lists "the fix was small,
skip the re-review" in its rationalizations table — do not let that argue you out
of asking. Skills describe a default; the user decides.

Why this exists: a plan executed here spent roughly 45 subagent dispatches on 23
commits, applying identical rigor to a contract check and to a constant map. The
process caught six real defects, but it charged the same price for every one and
nobody was ever shown the bill.

# Sempre leia o cabeçalho de um documento antes de confiar nele

Todo documento em `docs/` começa com um bloco de status. **Leia-o antes de usar o
documento como fonte.** Um nome de arquivo não é evidência de nada: neste
repositório, `match-v2-quiz-ui.md` descreve o v3, `10_frontend_pages.md` descreve
props que não existem, e `16_2026_candidate_update.md` é um procedimento vivo com
nome de nota de atualização pontual.

O bloco tem esta forma:

```markdown
# Título que diz sozinho o que o documento é

> **Status:** válido · **Atualizado em:** 2026-08-24 17:20
> **Contexto:** uma ou duas frases sobre o que este documento cobre e quando lê-lo.
```

Quando depreciado:

```markdown
> **Status:** ⚠️ DEPRECIADO em 2026-08-24 · **Última atualização real:** 2026-06-30
> **Motivo:** descreve o pipeline Groq, removido do projeto.
> **Substituído por:** `docs/referencia/pipeline-de-pesquisa.md`
```

**Se um documento não tiver esse bloco, trate-o como não confiável** e diga isso ao
usuário em vez de citá-lo como fonte.

**Se você editar um documento, atualize a data no bloco.** Uma data escrita à mão
mente assim que alguém edita sem tocá-la; confira com
`git log -1 --format=%ad --date=format:'%Y-%m-%d %H:%M' -- <arquivo>` quando a
precisão importar.

**Nomes de arquivo são auto-explicativos.** O nome sozinho diz o que há dentro, sem
prefixo numérico e sem sigla de versão do produto — `calculo-do-match.md`, não
`05_match.md` nem `match-v3.md`. Versão de produto no nome é o que produziu os erros
acima: o conteúdo evolui e o nome congela.
