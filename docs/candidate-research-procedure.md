# VotoSim — Candidate Research Procedure

**Context:** This is the procedure a research agent follows to turn one candidate's
brief (produced by `scripts/build-brief.ts`) into a validated research JSON
document (the shape defined by `scripts/lib/research-contract.ts`). Every document
the agent produces is checked by `validateResearch()` before anything is written to
the database — a document that fails validation is rejected outright, and nothing
is persisted. Read this before running the per-candidate research agent, and before
changing the brief format, the contract, or the ingestion pipeline.

---

**Language rule:** every voter-facing string in the output — `dossie.resumoPerfil`,
every position's `justificativa`, and every alert's `titulo` and `descricao` — is
written in **Brazilian Portuguese (pt-BR)**. Field names, enum values, theme slugs
and URLs stay exactly as the contract defines them; only the human-readable prose
changes. These strings are shown directly to Brazilian voters.

---

## 1. The five stages

The agent runs one pass, in this order, accumulating context as it goes. Nothing
here is a separate invocation — later stages depend on what earlier stages already
hold in context.

### E1 — Read official material

**Produces:** Declared priorities, structured — the candidate's own stated
platform, extracted from the government plan (when one was filed) and other
official material in the brief.

**Must not:** score intensity, confidence, or coherence yet — those are E5 and E4
work. Must not draw conclusions about coherence with conduct; E1 only records what
the candidate says about themselves. Must not fabricate content for a missing
government plan — an absent plan is stated as absent, not worked around.

### E2 — Clean record / judicial

**Produces:** `ficha_suja` and `investigacao` alerts, primary-sourced from layer 1
only (TSE, STF, STJ, TCU, MPF, and equivalent official bodies).

**Must not:** draw on news coverage or fact-checking for these two alert types —
they exist specifically because they carry the weight of an official record, and
diluting that with secondary sourcing would misrepresent their certainty. Must not
rely on rumor, social media, or unofficial aggregators.

### E3 — News research

**Produces:** Dated events, each with a source and a URL — the raw material E4 and
E5 will later interpret.

**Must not:** draw conclusions across events yet, and must not cite excluded
sources (partisan blogs, sites without an editorial masthead, aggregators, social
media as a primary source of fact). A single non-primary source on its own is not
yet a fact for D9 purposes — that judgment belongs to E5's alert construction.

### E4 — Coherence and spectrum

**Produces:** Cross-references E1 (promises) with votes and E3 (conduct) to
produce a coherence index, an inferred political spectrum, and a
`divergencia_espectro` alert when the declared and inferred spectra disagree.

**Must not:** score a coherence index of zero for a candidate with no track
record — the absence of evidence is `null`, not a measured `0` (see section 6).
Must not treat a single, uncorroborated news item as established conduct. This
stage only works with E1 and E3 already in the same context — splitting it into a
separate pass would mean re-reading everything.

### E5 — Synthesis

**Produces:** The profile dossier plus positions on the 14 questionnaire themes,
each with justification, intensity, sources, and confidence.

**Must not:** invent a position for a theme with no evidence — that theme gets
`neutro` with low `confiancaIa` and a justification stating evidence was not
found (see section 8). Must not write any claim that does not trace back to the
source catalogue — every position and every alert is checked against the sources
declared in the same document.

---

## 2. The source layers

| Layer | Sources |
|---|---|
| 1 — Primary/official | TSE, STF, STJ, TCU, MPF, Câmara, Senado, official gazettes, transparency portals |
| 2 — Reference press | Agência Brasil/EBC, Agências Câmara and Senado, G1, Folha, Estadão, O Globo, UOL, Valor, BBC Brasil, Reuters |
| 3 — Fact-checking | Agência Lupa, Aos Fatos, Projeto Comprova, Estadão Verifica |

Excluded: partisan blogs, sites without an editorial masthead, aggregators, and
social media as a primary source of fact.

**Every position and every alert must cite at least one voter-visible source** —
a source whose `destinoExibicao` is `card_candidato` or `pagina_sobre`. A source
marked `interno` (institutional material nobody wants to click from a candidate
card, like a raw TSE ficha) is real and stays in the catalogue, but it cannot be
the *only* citation on a claim: a reader has no way to reach it, so a claim
resting solely on an `interno` source ships untraceable, which is exactly what
D8 forbids. `interno` sources may still be cited alongside a visible one — they
just cannot carry a claim alone. The validator enforces this on every
`fonteRefs` array, positions and alerts alike.

---

## 3. The D9 admission rule

A `polemica` alert requires **two independent layer-2 sources that do not cite
each other, or one layer-1 source.** Nothing less clears the bar.

The validator enforces this mechanically: `validateResearch()` counts the
distinct layer-2 refs cited by a `polemica` alert (after deduplication — citing
the same source twice does not count as two) and checks for a layer-1 ref among
them. A document that violates D9 is rejected outright, before anything reaches
the database.

---

## 4. The framing trap

This is the single most common failure mode. Each theme's affirmation is a
**specific political stance**, not a neutral topic description. `favoravel` means
the candidate agrees with the affirmation **as written** — not with the general
subject area, not with "caring about" the theme.

Three worked examples, verbatim:

- `reforma_previdencia` asks about *loosening* retirement rules. A candidate who
  tightened them is `contrario`.
- `politica_economica` asks about *more* state participation. A candidate
  favouring less is `contrario`.
- `politica_externa` asks about prioritising *Western* alignment. A candidate
  favouring South-South multilateralism is `contrario`.
- `autonomia_individual`'s affirmation is double-barrelled: *"O governo deve
  ampliar o direito dos cidadãos de tomarem decisões sobre sua própria vida,
  incluindo o acesso a armas de fogo para uso pessoal."* The slug name — a
  holdover from when the theme was called `porte_armas` — hides a specific and
  decisive second clause. A candidate's stance on personal autonomy **in
  general** does not settle this affirmation; it is settled by their position
  specifically on firearms access. A candidate who supports broad personal
  autonomy but opposes civilian firearm access is `contrario`, not `favoravel`.

Read the affirmation first, every time. Do not infer a position from the theme's
name alone.

---

## 5. Coherence rules

The coherence index compares the candidate's **2026 platform** against their
**conduct in 2023–2026** — what they promised versus what they did.

- It is `null`, never zero, when there is no track record to compare against.
  Zero means the comparison was made and it came out incoherent; `null` means the
  comparison could not be made at all. Conflating the two would misrepresent a
  first-time candidate as someone who broke their own promises.
- It is strong for **legislative** candidates, who have nominal roll-call votes
  to compare against their platform.
- It is weak for **executive** candidates, whose conduct surfaces only through
  news coverage rather than a votable record.
- `coerencia_base` must state, in plain language, what was compared against
  what — e.g. "2026 government plan pledges compared against nominal roll-call
  votes 2023–2026," not a bare number with no explanation of its basis.

---

## 6. The output contract

### 6.1 Enum reference

Every allowed value for every enum field, matching `scripts/lib/research-contract.ts`
exactly. The worked example below does not use every value — it cannot,
without becoming unreadable — so this table is the authority, not the example.

| Field | Allowed values |
|---|---|
| `fontes[].tipo` | `plano_governo`, `coligacao`, `bens_declarados`, `votacao`, `tse_oficial`, `noticia`, `checagem`, `judicial` |
| `fontes[].camada` | `1` (primary/official), `2` (reference press), `3` (fact-checking) |
| `fontes[].destinoExibicao` | `card_candidato`, `pagina_sobre`, `interno` |
| `posicoes[].posicao` | `favoravel`, `contrario`, `neutro` |
| `posicoes[].coerenciaTema` | `coerente`, `incoerente`, `sem_historico`, or `null` (no track record to compare — see section 5) |
| `alertas[].tipo` | `ficha_suja`, `investigacao`, `polemica`, `incoerencia`, `divergencia_espectro` |
| `alertas[].severidade` | `critica`, `alta`, `media`, `baixa` |

**Publication rule for alerts.** A `ficha_suja` or `investigacao` alert backed
by a layer-1 (official) source is **published to voters immediately, with no
human review** — Rule B of `docs/base/04_schema_alerts.md`. Every other alert
type, and a `ficha_suja` or `investigacao` backed by anything less than a
layer-1 source, waits for curation before it is ever shown. Choosing `tipo`
and deciding which sources to cite on E2's alerts **is** the publication
decision — the agent making that call must know that it is not an incidental
classification, it is a decision about whether a claim reaches a voter
unreviewed.

### 6.2 Worked example

A complete, filled example, matching `scripts/lib/research-contract.ts` exactly.
Every field below is populated with realistic values, and all 14 themes are
covered — a real submission carries all 14, and copying a partial shape is a
common mistake. Justifications on the less illustrative themes are kept to one
sentence; the point of those entries is to show the complete shape, not to be
elaborate. The example also demonstrates the honesty rule in action
(`corrupcao_transparencia` is `neutro` with low confidence, citing the source
that was checked and found silent), the D9 rule in action (the `polemica`
alert cites two independent layer-2 sources), a genuine `incoerente` reading
(`bolsa_familia_transferencia`, where the 2026 platform diverges from
documented past conduct), and E2's `ficha_suja` alert, auto-published on a
layer-1 source per the rule above.

**Note:** the `tseSequencial` below is a placeholder, not a real TSE identifier.
The candidate name and party are placeholders too — this is an illustration of
shape, not a real dossier.

```json
{
  "tseSequencial": "000000000000",
  "dossie": {
    "resumoPerfil": "Cândido Exemplo (PEX) é candidato a presidente pela primeira vez, e seu plano de governo de 2026 tem como eixos centrais ampliar o papel do Estado em setores estratégicos e endurecer as regras de elegibilidade para aposentadoria. Por nunca ter ocupado cargo eletivo, não há registro de votações nominais; a avaliação de coerência abaixo se baseia na cobertura jornalística de declarações públicas comparada com os próprios compromissos do plano.",
    "espectroDeclarado": "centro",
    "espectroInferido": "centro_esquerda",
    "coerenciaIndice": 58,
    "coerenciaBase": "Promessas do plano de governo de 2026 sobre política previdenciária e o papel econômico do Estado comparadas com declarações públicas e cobertura jornalística de 2023 a 2026; não existem votações nominais porque esta é uma candidatura ao Executivo, sem cargo eletivo anterior."
  },
  "fontes": [
    {
      "ref": "fonte-plano-2026",
      "tipo": "plano_governo",
      "camada": 1,
      "titulo": "Plano de Governo 2026",
      "veiculo": "TSE - Tribunal Superior Eleitoral",
      "url": "https://divulgacandcontas.tse.jus.br/exemplo/plano-2026.pdf",
      "dataPublicacao": "2026-08-01",
      "destinoExibicao": "pagina_sobre"
    },
    {
      "ref": "fonte-tse-ficha",
      "tipo": "tse_oficial",
      "camada": 1,
      "titulo": "Ficha de candidatura",
      "veiculo": "TSE - Tribunal Superior Eleitoral",
      "url": "https://divulgacandcontas.tse.jus.br/exemplo/ficha-candidato",
      "dataPublicacao": null,
      "destinoExibicao": "interno"
    },
    {
      "ref": "fonte-g1-previdencia",
      "tipo": "noticia",
      "camada": 2,
      "titulo": "Candidato defende endurecimento das regras de aposentadoria",
      "veiculo": "G1",
      "url": "https://g1.globo.com/exemplo/previdencia-2026",
      "dataPublicacao": "2026-06-15",
      "destinoExibicao": "card_candidato"
    },
    {
      "ref": "fonte-uol-externa",
      "tipo": "noticia",
      "camada": 2,
      "titulo": "Candidato defende parcerias Sul-Sul em política externa",
      "veiculo": "UOL",
      "url": "https://noticias.uol.com.br/exemplo/politica-externa-2026",
      "dataPublicacao": "2026-07-02",
      "destinoExibicao": "card_candidato"
    },
    {
      "ref": "fonte-folha-controversia",
      "tipo": "noticia",
      "camada": 2,
      "titulo": "Reportagem revela contrato suspeito em gestão anterior",
      "veiculo": "Folha de S.Paulo",
      "url": "https://folha.uol.com.br/exemplo/controversia-contrato-1",
      "dataPublicacao": "2026-05-20",
      "destinoExibicao": "card_candidato"
    },
    {
      "ref": "fonte-estadao-controversia",
      "tipo": "noticia",
      "camada": 2,
      "titulo": "Contrato de gestão anterior é questionado por especialistas",
      "veiculo": "O Estado de S. Paulo",
      "url": "https://estadao.com.br/exemplo/controversia-contrato-2",
      "dataPublicacao": "2026-05-22",
      "destinoExibicao": "card_candidato"
    },
    {
      "ref": "fonte-tse-decisao-improbidade",
      "tipo": "judicial",
      "camada": 1,
      "titulo": "Decisão judicial - improbidade administrativa (2ª instância)",
      "veiculo": "TSE - Tribunal Superior Eleitoral",
      "url": "https://divulgacandcontas.tse.jus.br/exemplo/decisao-improbidade",
      "dataPublicacao": "2024-11-10",
      "destinoExibicao": "card_candidato"
    },
    {
      "ref": "fonte-folha-bolsa-familia",
      "tipo": "noticia",
      "camada": 2,
      "titulo": "Candidato defendeu corte no valor do Bolsa Família durante mandato anterior",
      "veiculo": "Folha de S.Paulo",
      "url": "https://folha.uol.com.br/exemplo/bolsa-familia-corte",
      "dataPublicacao": "2024-03-10",
      "destinoExibicao": "card_candidato"
    }
  ],
  "posicoes": [
    {
      "temaSlug": "reforma_tributaria",
      "posicao": "favoravel",
      "intensidade": 3,
      "justificativa": "O plano promete simplificar o sistema tributário e reduzir a cumulatividade de impostos, o que corresponde ao pedido de reforma tributária feito na afirmação.",
      "confiancaIa": 0.65,
      "coerenciaTema": "sem_historico",
      "fonteRefs": ["fonte-plano-2026"]
    },
    {
      "temaSlug": "sus_saude_publica",
      "posicao": "favoravel",
      "intensidade": 2,
      "justificativa": "O plano de governo lista a ampliação da cobertura da atenção básica pelo SUS como prioridade declarada, mas não há evidência independente de conduta que corrobore isso além do próprio plano.",
      "confiancaIa": 0.55,
      "coerenciaTema": "sem_historico",
      "fonteRefs": ["fonte-plano-2026"]
    },
    {
      "temaSlug": "privatizacao_estatais",
      "posicao": "contrario",
      "intensidade": 3,
      "justificativa": "O plano descarta explicitamente a privatização de estatais estratégicas, o que coloca o candidato como contrário à afirmação.",
      "confiancaIa": 0.6,
      "coerenciaTema": "sem_historico",
      "fonteRefs": ["fonte-plano-2026"]
    },
    {
      "temaSlug": "seguranca_publica_estadual",
      "posicao": "favoravel",
      "intensidade": 2,
      "justificativa": "O plano propõe repasse de recursos federais para apoiar as forças de segurança estaduais — um compromisso moderado, mas declarado.",
      "confiancaIa": 0.5,
      "coerenciaTema": "sem_historico",
      "fonteRefs": ["fonte-plano-2026"]
    },
    {
      "temaSlug": "educacao_basica",
      "posicao": "favoravel",
      "intensidade": 3,
      "justificativa": "O plano se compromete a aumentar o investimento federal em infraestrutura da educação básica.",
      "confiancaIa": 0.6,
      "coerenciaTema": "sem_historico",
      "fonteRefs": ["fonte-plano-2026"]
    },
    {
      "temaSlug": "meio_ambiente_desmatamento",
      "posicao": "favoravel",
      "intensidade": 3,
      "justificativa": "O plano propõe fiscalização mais rigorosa contra o desmatamento ilegal na Amazônia.",
      "confiancaIa": 0.6,
      "coerenciaTema": "sem_historico",
      "fonteRefs": ["fonte-plano-2026"]
    },
    {
      "temaSlug": "reforma_previdencia",
      "posicao": "contrario",
      "intensidade": 4,
      "justificativa": "O plano de governo propõe aumentar o tempo mínimo de contribuição em vez de flexibilizá-lo, e o candidato repetiu essa posição na entrevista ao G1. Como a afirmação pergunta sobre flexibilizar as regras de aposentadoria, um candidato que as endurece é contrário, não favorável.",
      "confiancaIa": 0.85,
      "coerenciaTema": "coerente",
      "fonteRefs": ["fonte-plano-2026", "fonte-g1-previdencia"]
    },
    {
      "temaSlug": "protecao_minorias",
      "posicao": "favoravel",
      "intensidade": 3,
      "justificativa": "O plano inclui compromissos explícitos de combate à discriminação de grupos minoritários.",
      "confiancaIa": 0.55,
      "coerenciaTema": "sem_historico",
      "fonteRefs": ["fonte-plano-2026"]
    },
    {
      "temaSlug": "autonomia_individual",
      "posicao": "neutro",
      "intensidade": 2,
      "justificativa": "O plano não assume posição clara sobre autonomia individual diante da intervenção do Estado nas escolhas pessoais e, em particular, não menciona o acesso a armas de fogo para uso pessoal — a cláusula que decide esta afirmação, já que o tema foi renomeado de porte_armas justamente para não se resumir à autonomia em geral. Sem declaração nem conduta documentada especificamente sobre armas, a posição permanece neutra.",
      "confiancaIa": 0.4,
      "coerenciaTema": "sem_historico",
      "fonteRefs": ["fonte-plano-2026"]
    },
    {
      "temaSlug": "bolsa_familia_transferencia",
      "posicao": "favoravel",
      "intensidade": 4,
      "justificativa": "O plano de 2026 promete ampliar a cobertura de transferência direta de renda além dos níveis atuais do Bolsa Família, mas a cobertura jornalística mostra o candidato defendendo publicamente a redução do valor do benefício durante seu mandato anterior — a plataforma diverge da conduta registrada.",
      "confiancaIa": 0.7,
      "coerenciaTema": "incoerente",
      "fonteRefs": ["fonte-plano-2026", "fonte-folha-bolsa-familia"]
    },
    {
      "temaSlug": "corrupcao_transparencia",
      "posicao": "neutro",
      "intensidade": 1,
      "justificativa": "Não foi encontrada declaração clara nem conduta documentada sobre o fortalecimento de órgãos de controle, nem no plano nem na cobertura jornalística disponível no momento da pesquisa. Registrado como neutro até que surjam mais evidências, sem inferência a partir de alinhamento ideológico.",
      "confiancaIa": 0.25,
      "coerenciaTema": null,
      "fonteRefs": ["fonte-plano-2026"]
    },
    {
      "temaSlug": "politica_economica",
      "posicao": "favoravel",
      "intensidade": 4,
      "justificativa": "O plano se compromete a ampliar a participação do Estado em setores estratégicos (energia, mineração) mesmo com maior gasto público, o que corresponde diretamente à posição da afirmação sobre mais participação estatal.",
      "confiancaIa": 0.8,
      "coerenciaTema": "coerente",
      "fonteRefs": ["fonte-plano-2026"]
    },
    {
      "temaSlug": "politica_externa",
      "posicao": "contrario",
      "intensidade": 3,
      "justificativa": "O candidato defendeu explicitamente o multilateralismo Sul-Sul e maior cooperação no BRICS em vez de priorizar o alinhamento com EUA e UE, o que é o oposto do que a afirmação pergunta.",
      "confiancaIa": 0.78,
      "coerenciaTema": "coerente",
      "fonteRefs": ["fonte-plano-2026", "fonte-uol-externa"]
    },
    {
      "temaSlug": "laicidade_valores",
      "posicao": "favoravel",
      "intensidade": 2,
      "justificativa": "O plano afirma que as políticas públicas devem se basear em critérios laicos e evidências.",
      "confiancaIa": 0.45,
      "coerenciaTema": "sem_historico",
      "fonteRefs": ["fonte-plano-2026"]
    }
  ],
  "alertas": [
    {
      "tipo": "ficha_suja",
      "severidade": "critica",
      "titulo": "Condenação por improbidade administrativa em segunda instância",
      "descricao": "O TSE registra condenação por improbidade administrativa confirmada em segunda instância, o que sujeita a candidatura à Lei da Ficha Limpa. Fonte oficial primária (camada 1); publicado automaticamente, sem revisão humana, conforme a regra de publicação da seção 6.1.",
      "dataOcorrencia": "2024-11-10",
      "fonteRefs": ["fonte-tse-decisao-improbidade"]
    },
    {
      "tipo": "polemica",
      "severidade": "media",
      "titulo": "Contrato de gestão anterior sob suspeita",
      "descricao": "Dois veículos independentes noticiaram que um contrato assinado durante a gestão anterior do candidato está sob suspeita de irregularidades no processo licitatório. Ainda não há decisão judicial; trata-se de uma controvérsia relatada, não de uma condenação.",
      "dataOcorrencia": "2026-05-20",
      "fonteRefs": ["fonte-folha-controversia", "fonte-estadao-controversia"]
    },
    {
      "tipo": "divergencia_espectro",
      "severidade": "baixa",
      "titulo": "Espectro declarado diverge da conduta observada",
      "descricao": "O candidato se autodeclara de centro, mas as posições sobre política previdenciária e o papel econômico do Estado aproximam a plataforma do centro_esquerda, pelos mesmos critérios usados para os demais candidatos.",
      "dataOcorrencia": null,
      "fonteRefs": ["fonte-g1-previdencia", "fonte-uol-externa"]
    }
  ]
}
```

---

## 7. Honesty rules

- A theme with no evidence gets `neutro` with a low `confiancaIa` and a
  justification that says evidence was not found. Never invent a position to
  fill a gap.
- The validator requires `fonteRefs` to be non-empty on **every** position,
  including a `neutro` one recording that no evidence was found — an empty
  array is a rejection, not an honest silence. A `neutro` position with no
  evidence still cites the sources that were **searched and found silent**:
  the government plan, the news search, whatever was actually consulted. The
  citation records where you looked, not what you found. This is not a
  loophole around the honesty rule; it is how the rule is expressed inside a
  contract that requires every claim to be traceable. Copy the
  `corrupcao_transparencia` entry in section 6 as the pattern — it cites
  `fonte-plano-2026` precisely because that is the document that was checked
  and came up silent on the theme.
- An absent government plan is stated as absent, plainly, in the dossier and in
  any position that would otherwise have relied on it. It is never worked
  around silently by treating other sources as if they were the plan.
