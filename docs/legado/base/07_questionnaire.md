# VotoSim — Questionário de Valores Políticos

> **Status:** ⚠️ DEPRECIADO em 2026-08-24 · **Última atualização real:** 2026-06-27
> **Motivo:** Descreve o questionário como consumido pelo "frontend (Lovable)" — o frontend Lovable/Vite foi substituído pelo Next.js App Router.
> **Substituído por:** `docs/referencia/questionario.md`


> **Arquivo:** `07_questionnaire.md`  
> **Versão:** 1.0  
> **Depende de:** `02_schema_themes.v2.md` (slugs e ordem devem estar em sincronia)  
> **Consumido por:** frontend (Lovable), agente de IA (prompt de match)  
> **Não depende de:** candidatos, TSE, pipeline de dados

---

## Contexto

Este documento define o questionário exibido ao usuário antes da pesquisa de candidatos.

O questionário tem duas funções:
1. **Coletar o perfil político** do usuário (quais temas importam e qual a posição)
2. **Contextualizar** usuários que não têm opinião formada sobre um tema

O resultado do questionário é um objeto JSON enviado ao agente de IA para calcular o match com candidatos.

---

## Escala de resposta (universal para todos os temas)

```
1 — Discordo totalmente
2 — Discordo parcialmente
3 — Não tenho opinião formada
4 — Concordo parcialmente
5 — Concordo totalmente
```

**Regra de mapeamento para o algoritmo:**
- Resposta 1 ou 2 → `concordancia: 'discordo'`, intensidade proporcional
- Resposta 3 → `concordancia: 'neutro'` (não entra no cálculo de match)
- Resposta 4 ou 5 → `concordancia: 'concordo'`, intensidade proporcional

---

## Etapa 0 — Dados do eleitor (antes do questionário)

Campos obrigatórios coletados antes de exibir qualquer pergunta:

```
Campo 1: Estado onde vota
  Tipo: select
  Opções: 27 UFs brasileiras
  Obrigatório: sim

Campo 2: Município onde vota
  Tipo: select (filtrado pelo estado)
  Obrigatório: sim

Campo 3: Faixa etária
  Tipo: select
  Opções:
    - 16 a 17 anos (voto facultativo)
    - 18 a 24 anos
    - 25 a 34 anos
    - 35 a 44 anos
    - 45 a 59 anos
    - 60 anos ou mais
  Obrigatório: sim
  Uso: filtro informativo, não afeta o algoritmo de match no MVP
```

---

## As 14 perguntas do questionário

Ordem de exibição definida pelo campo `ordem_exibicao` no banco.
Cada pergunta corresponde a um `slug` em `themes_catalog`.

---

### Pergunta 1 — Reforma tributária
**Slug:** `reforma_tributaria` | **Categoria:** economia

**Afirmação:**
> O sistema tributário brasileiro deve ser reformado para simplificar e unificar os impostos cobrados sobre consumo, renda e produção.

**Contexto educativo** *(exibido em acordeão "Saiba mais")*:
> O Brasil tem um dos sistemas de impostos mais complexos do mundo, com tributos federais, estaduais e municipais sobrepostos. Uma reforma poderia simplificar esse sistema — mas há debate sobre quem ganha e quem perde com as mudanças.

**Nota de cargo** *(exibida como tooltip)*:
> Este tema é decidido pelo governo federal. Afeta principalmente Presidente, Deputados Federais e Senadores.

---

### Pergunta 2 — Saúde pública
**Slug:** `sus_saude_publica` | **Categoria:** saude

**Afirmação:**
> O governo deve aumentar o investimento público no SUS como principal forma de garantir saúde à população.

**Contexto educativo:**
> O SUS atende mais de 150 milhões de brasileiros que não têm plano de saúde privado. Há debate sobre se o caminho é investir mais no sistema público ou ampliar incentivos para planos privados populares.

**Nota de cargo:**
> Saúde é responsabilidade compartilhada entre União, estados e municípios. Afeta todos os cargos.

---

### Pergunta 3 — Privatização × estatização
**Slug:** `privatizacao_estatais` | **Categoria:** economia

**Afirmação:**
> O governo federal deve vender suas participações em empresas estatais como Petrobras, Correios e Eletrobras para a iniciativa privada.

**Contexto educativo:**
> Empresas estatais são controladas pelo governo e prestam serviços considerados estratégicos. Defensores da privatização argumentam que empresas privadas são mais eficientes; opositores argumentam que o Estado perde controle sobre setores essenciais.

**Nota de cargo:**
> Este tema é exclusivamente federal. Afeta principalmente Presidente, Deputados Federais e Senadores.

---

### Pergunta 4 — Segurança pública
**Slug:** `seguranca_publica_estadual` | **Categoria:** seguranca

**Afirmação:**
> O combate à criminalidade deve priorizar o endurecimento de penas, a ampliação do efetivo policial e a restrição à progressão de regime para condenados.

**Contexto educativo:**
> Há dois grandes modelos de política de segurança: o que foca em repressão e punição mais severa, e o que foca em prevenção social, educação e redução da desigualdade. A maioria dos especialistas defende uma combinação dos dois.

**Nota de cargo:**
> Polícias Civil e Militar são estaduais. Este tema afeta principalmente Governadores e Deputados Estaduais.

---

### Pergunta 5 — Educação básica
**Slug:** `educacao_basica` | **Categoria:** educacao

**Afirmação:**
> O governo deve aumentar o investimento em escolas públicas e na valorização de professores como prioridade da política educacional.

**Contexto educativo:**
> O Brasil gasta valores significativos em educação, mas os resultados em qualidade ainda são baixos. O debate é sobre quanto investir no sistema público versus criar incentivos para que famílias acessem escolas privadas com vouchers ou subsídios.

**Nota de cargo:**
> Educação é responsabilidade compartilhada. Afeta todos os cargos, com peso maior para Presidente, Governadores e Deputados.

---

### Pergunta 6 — Meio ambiente
**Slug:** `meio_ambiente_desmatamento` | **Categoria:** meio_ambiente

**Afirmação:**
> O governo deve endurecer a fiscalização ambiental e as restrições ao desmatamento, mesmo que isso limite atividades econômicas em áreas rurais.

**Contexto educativo:**
> O Brasil abriga a maior floresta tropical do mundo e enfrenta pressão internacional para reduzir o desmatamento. Produtores rurais argumentam que restrições ambientais limitam o desenvolvimento; ambientalistas apontam os riscos climáticos e a perda de biodiversidade.

**Nota de cargo:**
> Política ambiental federal é responsabilidade do IBAMA e ICMBio. Estados têm papel relevante no licenciamento.

---

### Pergunta 7 — Previdência
**Slug:** `reforma_previdencia` | **Categoria:** economia

**Afirmação:**
> O governo deve tornar as regras de aposentadoria mais flexíveis, reduzindo a idade mínima e os requisitos de contribuição exigidos atualmente.

**Contexto educativo:**
> A Reforma da Previdência de 2019 aumentou a idade mínima para aposentadoria e o tempo de contribuição. Defensores dizem que era necessário para equilibrar as contas públicas; críticos dizem que prejudicou trabalhadores, especialmente os mais pobres e informais.

**Nota de cargo:**
> Previdência federal (INSS) é tema exclusivamente federal. Afeta principalmente Presidente, Deputados Federais e Senadores.

---

### Pergunta 8 — Direitos LGBTQIA+
**Slug:** `direitos_lgbtqia` | **Categoria:** direitos_sociais

**Afirmação:**
> O governo deve criar e ampliar leis específicas de proteção contra discriminação de pessoas LGBTQIA+ em áreas como trabalho, saúde e moradia.

**Contexto educativo:**
> O STF criminalizou a homofobia em 2019, mas não existe lei aprovada pelo Congresso sobre o tema. Há debate sobre o papel do Estado na proteção de grupos minoritários versus a autonomia de instituições religiosas e famílias.

**Nota de cargo:**
> Direitos civis são tema federal. Afeta principalmente Presidente, Deputados Federais e Senadores.

---

### Pergunta 9 — Porte de armas
**Slug:** `porte_armas` | **Categoria:** seguranca

**Afirmação:**
> O governo deve ampliar o direito do cidadão comum de adquirir e portar armas de fogo para uso pessoal.

**Contexto educativo:**
> O Brasil tem uma das maiores taxas de mortes por armas de fogo do mundo. Defensores da flexibilização argumentam que o cidadão armado pode se defender melhor; opositores apontam estudos que associam maior acesso a armas com mais mortes.

**Nota de cargo:**
> O Estatuto do Desarmamento é lei federal. Afeta principalmente Presidente, Deputados Federais e Senadores.

---

### Pergunta 10 — Transferência de renda
**Slug:** `bolsa_familia_transferencia` | **Categoria:** direitos_sociais

**Afirmação:**
> O governo deve ampliar programas de transferência direta de renda para famílias de baixa renda como o Bolsa Família.

**Contexto educativo:**
> Programas de transferência de renda pagam um valor mensal para famílias pobres. Apoiadores dizem que reduzem a fome e a pobreza imediata; críticos argumentam que devem ser temporários e condicionados à inserção no mercado de trabalho.

**Nota de cargo:**
> Bolsa Família é programa federal. Afeta principalmente Presidente, Deputados Federais e Senadores.

---

### Pergunta 11 — Combate à corrupção
**Slug:** `corrupcao_transparencia` | **Categoria:** reforma_politica

**Afirmação:**
> O governo deve fortalecer os órgãos de controle e fiscalização para ampliar a punição de agentes públicos envolvidos em corrupção.

**Contexto educativo:**
> O Brasil perdeu bilhões em esquemas de corrupção nas últimas décadas. Há debate sobre o equilíbrio entre eficiência das investigações e garantias do devido processo legal — e sobre quais órgãos devem ter mais autonomia e recursos.

**Nota de cargo:**
> Combate à corrupção envolve todos os níveis de governo. Afeta todos os cargos.

---

### Pergunta 12 — Política econômica
**Slug:** `politica_economica` | **Categoria:** economia

**Afirmação:**
> O governo deve adotar uma política econômica com maior participação estatal em investimentos estratégicos, mesmo que isso implique maior gasto público.

**Contexto educativo:**
> Há dois modelos predominantes: o liberal, que defende menos gasto público e menos intervenção estatal; e o desenvolvimentista, que defende investimento público em infraestrutura e indústria como motor de crescimento. Ambos buscam geração de empregos e controle da inflação por caminhos diferentes.

**Nota de cargo:**
> Política econômica é atribuição federal. Afeta principalmente Presidente, Deputados Federais e Senadores.

---

### Pergunta 13 — Política externa
**Slug:** `politica_externa` | **Categoria:** politica_externa

**Afirmação:**
> O Brasil deve priorizar acordos e alianças com países ocidentais como Estados Unidos e União Europeia em detrimento de blocos como BRICS e parcerias com China e Rússia.

**Contexto educativo:**
> O Brasil historicamente adotou uma política externa independente, buscando equidistância entre blocos. Há debate sobre se aproximar do ocidente traz mais benefícios comerciais e diplomáticos, ou se manter independência preserva mais soberania e diversifica parcerias econômicas.

**Nota de cargo:**
> Política externa é atribuição exclusiva do Presidente. Afeta principalmente Presidente e Senadores (aprovação de tratados).

---

### Pergunta 14 — Valores morais e costumes
**Slug:** `pauta_moral_costumes` | **Categoria:** religiao_costumes

**Afirmação:**
> O governo deve adotar legislação baseada em princípios laicos e científicos ao tratar de temas como aborto, educação sexual e composição familiar, independentemente de posições religiosas.

**Contexto educativo:**
> Há um debate central entre visões laicas — que defendem que o Estado não deve impor valores religiosos — e visões conservadoras — que defendem que a moral tradicional deve orientar as leis. Isso afeta temas como aborto legal, educação nas escolas e reconhecimento de diferentes arranjos familiares.

**Nota de cargo:**
> Leis sobre costumes são aprovadas pelo Congresso. Afeta principalmente Deputados Federais, Senadores e Presidente.

---

## Output do questionário — formato JSON para o agente

Ao finalizar o questionário, o frontend monta este objeto e envia para a Edge Function:

```typescript
interface RespostaUsuario {
  tema_slug: string;
  resposta: 1 | 2 | 3 | 4 | 5;
  concordancia: 'concordo' | 'neutro' | 'discordo';  // derivado da resposta
  intensidade: 1 | 2 | 3 | 4 | 5;                   // igual à resposta
}

interface PerfilUsuario {
  estado: string;                    // ex: "SP"
  municipio_ibge: string;            // ex: "3550308"
  faixa_etaria: string;              // ex: "25 a 34 anos"
  respostas: RespostaUsuario[];      // apenas temas com resposta != 3 (neutro)
  timestamp: string;                 // ISO 8601
  session_token: string;             // UUID gerado no frontend, sem vínculo a usuário
}
```

### Regra de derivação de concordância

```typescript
function derivarConcordancia(resposta: number): 'concordo' | 'neutro' | 'discordo' {
  if (resposta <= 2) return 'discordo';
  if (resposta === 3) return 'neutro';
  return 'concordo';
}
```

### Exemplo de payload completo

```json
{
  "estado": "SP",
  "municipio_ibge": "3550308",
  "faixa_etaria": "25 a 34 anos",
  "session_token": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-08-15T14:23:00Z",
  "respostas": [
    {
      "tema_slug": "sus_saude_publica",
      "resposta": 5,
      "concordancia": "concordo",
      "intensidade": 5
    },
    {
      "tema_slug": "privatizacao_estatais",
      "resposta": 1,
      "concordancia": "discordo",
      "intensidade": 1
    },
    {
      "tema_slug": "reforma_tributaria",
      "resposta": 4,
      "concordancia": "concordo",
      "intensidade": 4
    }
  ]
}
```

*Temas com resposta 3 (neutro) são omitidos do payload — não entram no cálculo de match.*

---

## UX do questionário — regras para o frontend

```
- Exibir uma pergunta por tela (não listar todas de uma vez)
- Mostrar progresso: "Pergunta 3 de 14"
- Botão "Pular" disponível em todas as perguntas (equivale a resposta 3)
- Acordeão "Saiba mais" com o contexto educativo — fechado por padrão
- Tooltip no ícone de informação com a nota de cargo
- Permitir voltar e alterar resposta de perguntas anteriores
- Ao final: tela de revisão mostrando todas as respostas antes de confirmar
- Mínimo de 3 respostas não-neutras para habilitar o botão "Ver candidatos"
  → Se menos de 3: exibir mensagem "Responda pelo menos mais X perguntas para uma análise mais precisa"
```

---

## Seed para tabela auxiliar (opcional no MVP)

Se preferir guardar as perguntas no banco em vez de hardcodar no frontend:

```sql
CREATE TABLE IF NOT EXISTS quiz_questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  theme_id        UUID NOT NULL REFERENCES themes_catalog(id),
  ordem           SMALLINT NOT NULL,
  afirmacao       TEXT NOT NULL,
  contexto        TEXT NOT NULL,
  nota_cargo      TEXT NOT NULL,
  ativo           BOOLEAN DEFAULT true
);

-- Populado via SELECT dos campos de themes_catalog
INSERT INTO quiz_questions (theme_id, ordem, afirmacao, contexto, nota_cargo)
SELECT
  id,
  ordem_exibicao,
  afirmacao_questionario,
  contexto_questionario,
  nota_educativa
FROM themes_catalog
WHERE exibir_no_quiz = true
  AND afirmacao_questionario IS NOT NULL
ORDER BY ordem_exibicao;
```

*No MVP, hardcodar no frontend é mais simples. A tabela `quiz_questions` é útil quando você quiser editar perguntas sem fazer deploy.*

---

## Checklist de implementação

- [ ] Confirmar que `02_schema_themes.v2.md` foi aplicado (campos novos existem no banco)
- [ ] Confirmar que todos os 14 temas têm `afirmacao_questionario` preenchida
- [ ] Implementar componente de pergunta com slider 1–5 no Lovable
- [ ] Implementar acordeão "Saiba mais" com `contexto_questionario`
- [ ] Implementar tooltip de cargo com `nota_educativa`
- [ ] Implementar regra de mínimo 3 respostas não-neutras
- [ ] Implementar tela de revisão antes de enviar
- [ ] Validar geração do JSON de perfil no formato especificado acima
- [ ] Testar payload com Edge Function de match

---

*Arquivo anterior: `06_data_pipeline.md`*  
*Próximo: passo a passo de configuração do Supabase*
