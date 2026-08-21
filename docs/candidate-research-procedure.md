# VotoSim — Candidate Research Procedure

**Context:** This is the procedure a research agent follows to turn one candidate's
brief (produced by `scripts/build-brief.ts`) into a validated research JSON
document (the shape defined by `scripts/lib/research-contract.ts`). Every document
the agent produces is checked by `validateResearch()` before anything is written to
the database — a document that fails validation is rejected outright, and nothing
is persisted. Read this before running the per-candidate research agent, and before
changing the brief format, the contract, or the ingestion pipeline.

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

A complete, filled example, matching `scripts/lib/research-contract.ts` exactly.
Every field below is populated with realistic values — including the honesty
rule in action (`corrupcao_transparencia` is `neutro` with low confidence because
no evidence was found) and the D9 rule in action (the `polemica` alert cites two
independent layer-2 sources).

**Note:** the `tseSequencial` below is a placeholder, not a real TSE identifier.
The candidate name and party are placeholders too — this is an illustration of
shape, not a real dossier.

```json
{
  "tseSequencial": "000000000000",
  "dossie": {
    "resumoPerfil": "Cândido Exemplo (PEX) is a first-time presidential candidate whose 2026 government plan centers on expanding the state's role in strategic industries and tightening pension eligibility rules. No prior elected office means no nominal roll-call record; the coherence assessment below relies on news coverage of public statements against the plan's own commitments.",
    "espectroDeclarado": "centro",
    "espectroInferido": "centro_esquerda",
    "coerenciaIndice": 58,
    "coerenciaBase": "2026 government plan pledges on pension policy and the state's economic role compared against public statements and news coverage from 2023-2026; no nominal roll-call votes exist because this is an executive candidacy with no prior elected office."
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
    }
  ],
  "posicoes": [
    {
      "temaSlug": "reforma_previdencia",
      "posicao": "contrario",
      "intensidade": 4,
      "justificativa": "The government plan proposes raising the minimum contribution period rather than loosening it, and the candidate repeated this position in the G1 interview. Since the affirmation asks about loosening retirement rules, a candidate who tightens them is contrario, not favoravel.",
      "confiancaIa": 0.85,
      "coerenciaTema": "coerente",
      "fonteRefs": ["fonte-plano-2026", "fonte-g1-previdencia"]
    },
    {
      "temaSlug": "politica_economica",
      "posicao": "favoravel",
      "intensidade": 4,
      "justificativa": "The plan commits to expanding state participation in strategic sectors (energy, mining) even at higher public spending, matching the affirmation's stance on more state participation directly.",
      "confiancaIa": 0.8,
      "coerenciaTema": "coerente",
      "fonteRefs": ["fonte-plano-2026"]
    },
    {
      "temaSlug": "politica_externa",
      "posicao": "contrario",
      "intensidade": 3,
      "justificativa": "The candidate explicitly advocated for South-South multilateralism and deeper BRICS cooperation over prioritising alignment with the US and EU, which is the opposite of what the affirmation asks about.",
      "confiancaIa": 0.78,
      "coerenciaTema": "coerente",
      "fonteRefs": ["fonte-plano-2026", "fonte-uol-externa"]
    },
    {
      "temaSlug": "sus_saude_publica",
      "posicao": "favoravel",
      "intensidade": 2,
      "justificativa": "The government plan lists expanding primary care coverage under SUS as a stated priority, but no independent conduct evidence corroborates it beyond the plan itself.",
      "confiancaIa": 0.55,
      "coerenciaTema": "sem_historico",
      "fonteRefs": ["fonte-plano-2026"]
    },
    {
      "temaSlug": "corrupcao_transparencia",
      "posicao": "neutro",
      "intensidade": 1,
      "justificativa": "No clear declaration or documented conduct on strengthening oversight bodies was found in the plan or in news coverage available at research time. Recorded as neutro pending further evidence, not inferred from ideological alignment.",
      "confiancaIa": 0.25,
      "coerenciaTema": null,
      "fonteRefs": ["fonte-plano-2026"]
    }
  ],
  "alertas": [
    {
      "tipo": "polemica",
      "severidade": "media",
      "titulo": "Contrato de gestão anterior sob suspeita",
      "descricao": "Two independent outlets reported that a contract signed during the candidate's prior administrative role is under scrutiny for irregular bidding practices. No judicial finding exists yet; this is reported as a controversy, not a conviction.",
      "dataOcorrencia": "2026-05-20",
      "fonteRefs": ["fonte-folha-controversia", "fonte-estadao-controversia"]
    },
    {
      "tipo": "divergencia_espectro",
      "severidade": "baixa",
      "titulo": "Espectro declarado diverge da conduta observada",
      "descricao": "The candidate declares a centrist self-identification, but positions on pension policy and the state's economic role place the platform closer to centro_esquerda by the same criteria used for other candidates.",
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
- An absent government plan is stated as absent, plainly, in the dossier and in
  any position that would otherwise have relied on it. It is never worked
  around silently by treating other sources as if they were the plan.
