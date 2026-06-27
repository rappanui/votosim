# VotoSim — Questionnaire Specification

**Context:** Defines the 14 quiz questions, UX constraints, and the JSON payload sent to the Edge Function. Read before implementing questionnaire UI, building the match payload, or writing any Gemini prompt that references user answers.

---

## Answer Scale (universal for all 14 questions)

| Value | Label |
|---|---|
| 1 | Discordo totalmente |
| 2 | Discordo parcialmente |
| 3 | Não tenho opinião formada |
| 4 | Concordo parcialmente |
| 5 | Concordo totalmente |

**Concordância derivation — applied before sending to Edge Function:**

```typescript
function derivarConcordancia(resposta: number): 'concordo' | 'neutro' | 'discordo' {
  if (resposta <= 2) return 'discordo'
  if (resposta === 3) return 'neutro'
  return 'concordo'     // 4 or 5
}
```

**Neutral answers (`concordancia === 'neutro'`) are excluded from the Edge Function payload** — they do not affect the match score.

---

## Step 0 — Voter Profile (collected before questions)

| Field | UI type | Options | Effect on algorithm |
|---|---|---|---|
| `estado` | select | 27 UFs (format: "SP — São Paulo") | Filters which candidates appear |
| `municipio` | text input | Free text | Informational in MVP |
| `faixaEtaria` | select | See below | Informational in MVP |

Age range options:
- "16 a 17 anos (voto facultativo)"
- "18 a 24 anos" / "25 a 34 anos" / "35 a 44 anos" / "45 a 59 anos" / "60 anos ou mais"

All 3 fields required. "Continuar" button disabled until all are filled.

---

## The 14 Questions

Loaded from DB: `SELECT slug, nome, afirmacao_questionario, contexto_questionario, nota_educativa FROM themes_catalog WHERE exibir_no_quiz = true ORDER BY ordem_exibicao`

| # | slug | Statement (afirmacao_questionario) |
|---|---|---|
| 1 | `reforma_tributaria` | O sistema tributário brasileiro deve ser reformado para simplificar e unificar os impostos cobrados sobre consumo, renda e produção. |
| 2 | `sus_saude_publica` | O governo deve aumentar o investimento público no SUS como principal forma de garantir saúde à população. |
| 3 | `privatizacao_estatais` | O governo federal deve vender suas participações em empresas estatais como Petrobras, Correios e Eletrobras para a iniciativa privada. |
| 4 | `seguranca_publica_estadual` | O combate à criminalidade deve priorizar o endurecimento de penas, a ampliação do efetivo policial e a restrição à progressão de regime para condenados. |
| 5 | `educacao_basica` | O governo deve aumentar o investimento em escolas públicas e na valorização de professores como prioridade da política educacional. |
| 6 | `meio_ambiente_desmatamento` | O governo deve endurecer a fiscalização ambiental e as restrições ao desmatamento, mesmo que isso limite atividades econômicas em áreas rurais. |
| 7 | `reforma_previdencia` | O governo deve tornar as regras de aposentadoria mais flexíveis, reduzindo a idade mínima e os requisitos de contribuição exigidos atualmente. |
| 8 | `direitos_lgbtqia` | O governo deve criar e ampliar leis específicas de proteção contra discriminação de pessoas LGBTQIA+ em áreas como trabalho, saúde e moradia. |
| 9 | `porte_armas` | O governo deve ampliar o direito do cidadão comum de adquirir e portar armas de fogo para uso pessoal. |
| 10 | `bolsa_familia_transferencia` | O governo deve ampliar programas de transferência direta de renda para famílias de baixa renda como o Bolsa Família. |
| 11 | `corrupcao_transparencia` | O governo deve fortalecer os órgãos de controle e fiscalização para ampliar a punição de agentes públicos envolvidos em corrupção. |
| 12 | `politica_economica` | O governo deve adotar uma política econômica com maior participação estatal em investimentos estratégicos, mesmo que isso implique maior gasto público. |
| 13 | `politica_externa` | O Brasil deve priorizar acordos e alianças com países ocidentais como Estados Unidos e União Europeia em detrimento de blocos como BRICS e parcerias com China e Rússia. |
| 14 | `pauta_moral_costumes` | O governo deve adotar legislação baseada em princípios laicos e científicos ao tratar de temas como aborto, educação sexual e composição familiar, independentemente de posições religiosas. |

---

## UX Constraints (non-negotiable)

- One question per screen with smooth transition animation
- "Pergunta X de 14" progress shown in Header ProgressBar
- **Slider starts with no value selected** — thumb not visible until user interacts
- "Pular esta pergunta" → registers `{ resposta: 3, concordancia: 'neutro' }` and advances
- "Próxima" → **enabled only after slider is moved**, advances
- "Voltar" → returns to previous question and restores that answer
- "Saiba mais" collapsible → shows `contexto_questionario`, closed by default
- ⓘ tooltip → shows `nota_educativa` (which office owns this theme)
- After question 14 → navigate to `/revisao`
- **Minimum 3 non-neutral answers** to enable "Ver candidatos" button on `/revisao`

---

## Edge Function Payload

```typescript
// All neutral answers are excluded before sending
const payload: PerfilUsuario = {
  estado: perfil.estado,
  municipio: perfil.municipio,
  faixaEtaria: perfil.faixaEtaria,
  respostas: respostas.filter(r => r.concordancia !== 'neutro'),
  sessionToken: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
}

// RespostaUsuario shape
{
  temaSlug: 'sus_saude_publica',
  resposta: 5,
  concordancia: 'concordo',
  intensidade: 5         // same numeric value as resposta
}
```

**Example with 2 answers:**
```json
{
  "estado": "SP", "municipio": "São Paulo", "faixaEtaria": "25 a 34 anos",
  "sessionToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-08-15T14:23:00Z",
  "respostas": [
    { "temaSlug": "sus_saude_publica", "resposta": 5, "concordancia": "concordo", "intensidade": 5 },
    { "temaSlug": "privatizacao_estatais", "resposta": 1, "concordancia": "discordo", "intensidade": 1 }
  ]
}
```
