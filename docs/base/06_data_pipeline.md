# VotoSim — Pipeline de Dados

> **Arquivo:** `06_data_pipeline.md`  
> **Runtime:** Node.js 20 (scripts locais + Supabase Edge Functions)  
> **Depende de:** `01` a `04` (todas as tabelas devem existir)  
> **Frequência:** onboarding (carga inicial) + cron semanal

---

## Visão geral

```
Fontes públicas (TSE, Câmara, Senado)
        ↓
  [ingest_tse.ts]          Baixa e parseia dados de candidaturas
        ↓
  [extract_themes.ts]      Chama Claude API para extrair posições temáticas
        ↓
  [generate_embeddings.ts] Chama Voyage AI para gerar vetores
        ↓
  [compute_similarity.ts]  Pré-computa pares de similaridade (similarity_cache)
        ↓
     Supabase (banco de dados)
```

---

## Etapa 1 — Ingestão de dados do TSE

### Fonte: DivulgaCand

O TSE disponibiliza os dados de candidaturas em arquivos CSV no portal de dados abertos.

```
URL base: https://dadosabertos.tse.jus.br/dataset/candidatos-2026
Arquivo:  consulta_cand_2026_BRASIL.csv (atualizado após registro de candidaturas, jul/2026)

Antes de jul/2026 (pré-candidatos): usar a API da Câmara para parlamentares em exercício
URL: https://dadosabertos.camara.gov.br/api/v2/deputados?itens=513&ordem=ASC&ordenarPor=nome
```

```typescript
// scripts/ingest_tse.ts
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Mapeamento de colunas do CSV do TSE para o schema do banco
// Os nomes exatos variam por eleição — conferir no arquivo real antes de usar
const TSE_COLUMN_MAP = {
  NM_CANDIDATO:    'nome_completo',
  NM_URNA_CANDIDATO: 'nome_urna',
  NR_CPF_CANDIDATO:  '_cpf_raw',       // será hasheado, não armazenado
  DS_CARGO:          '_cargo_raw',      // será mapeado para office_type
  SG_PARTIDO:        'partido_eleicao',
  SG_UF:             'estado',
  NR_CANDIDATO:      'numero_urna',
  DS_SITUACAO_CANDIDATURA: '_status_raw',
  DT_NASCIMENTO:     'data_nascimento',
  DS_GENERO:         '_genero_raw',
  DS_GRAU_INSTRUCAO: 'escolaridade',
  DS_OCUPACAO:       'ocupacao',
  NM_MUNICIPIO_NASC: 'naturalidade',
} as const;

const CARGO_MAP: Record<string, string> = {
  'PRESIDENTE':            'presidente',
  'VICE-PRESIDENTE':       'vice_presidente',
  'SENADOR':               'senador',
  'GOVERNADOR':            'governador',
  'VICE-GOVERNADOR':       'vice_governador',
  'DEPUTADO FEDERAL':      'deputado_federal',
  'DEPUTADO ESTADUAL':     'deputado_estadual',
  'DEPUTADO DISTRITAL':    'deputado_distrital',
};

const STATUS_MAP: Record<string, string> = {
  'APTO':                  'deferido',
  'INAPTO':                'indeferido',
  'DEFERIDO':              'deferido',
  'INDEFERIDO':            'indeferido',
  'CANCELADO':             'indeferido',
};

async function ingestTSECandidates(csvPath: string) {
  const csvContent = await Bun.file(csvPath).text();  // ou fs.readFileSync

  const { data: rows } = Papa.parse(csvContent, {
    header: true,
    delimiter: ';',
    encoding: 'latin1',   // CSVs do TSE são ISO-8859-1
    skipEmptyLines: true,
  });

  let inserted = 0;
  let skipped = 0;

  for (const row of rows as any[]) {
    const cargo = CARGO_MAP[row.DS_CARGO?.trim()];
    if (!cargo) { skipped++; continue; }  // cargo fora do escopo (vereador, etc.)

    const cpfHash = crypto
      .createHash('sha256')
      .update(row.NR_CPF_CANDIDATO?.replace(/\D/g, '') ?? '')
      .digest('hex');

    // Upsert do político (pode já existir de eleições anteriores)
    const { data: pol, error: polError } = await supabase
      .from('politicians')
      .upsert({
        cpf_hash:      cpfHash,
        tse_id:        row.SQ_CANDIDATO,
        nome_completo: row.NM_CANDIDATO?.trim(),
        nome_urna:     row.NM_URNA_CANDIDATO?.trim(),
        partido_atual: row.SG_PARTIDO?.trim(),
        estado:        row.SG_UF?.trim(),
        genero:        row.DS_GENERO === 'MASCULINO' ? 'M' : row.DS_GENERO === 'FEMININO' ? 'F' : 'O',
        escolaridade:  row.DS_GRAU_INSTRUCAO?.trim(),
        ocupacao:      row.DS_OCUPACAO?.trim(),
        ativo:         true,
      }, { onConflict: 'cpf_hash', ignoreDuplicates: false })
      .select('id')
      .single();

    if (polError || !pol) {
      console.error('Erro ao inserir político:', polError, row.NM_CANDIDATO);
      continue;
    }

    // Upsert da candidatura
    const { error: candError } = await supabase
      .from('candidacies')
      .upsert({
        politician_id:  pol.id,
        ano_eleicao:    2026,
        turno:          1,
        cargo,
        estado:         row.SG_UF?.trim(),
        numero_urna:    row.NR_CANDIDATO?.trim(),
        partido_eleicao: row.SG_PARTIDO?.trim(),
        numero_partido: parseInt(row.NR_PARTIDO) || null,
        status:         STATUS_MAP[row.DS_SITUACAO_CANDIDATURA?.trim()] ?? 'pre_candidato',
        tse_sequencial: row.SQ_CANDIDATO,
      }, { onConflict: 'politician_id,ano_eleicao,turno,cargo,estado' });

    if (candError) {
      console.error('Erro ao inserir candidatura:', candError, row.NM_CANDIDATO);
      continue;
    }

    inserted++;
  }

  console.log(`Ingestão TSE concluída: ${inserted} inseridos, ${skipped} ignorados`);
}

// Executar: npx ts-node scripts/ingest_tse.ts ./data/consulta_cand_2026_BRASIL.csv
ingestTSECandidates(process.argv[2]);
```

---

## Etapa 2 — Extração de temas por IA

```typescript
// scripts/extract_themes.ts
// Processa candidatos sem posições registradas e extrai temas via Claude API

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Prompt do agente extrator de temas
// Importante: retorna JSON estruturado, nunca texto livre
const EXTRACTION_SYSTEM_PROMPT = `
Você é um analista político especializado em política brasileira.
Sua função é analisar informações públicas sobre um político e identificar
suas posições em temas políticos específicos.

Responda APENAS com JSON válido, sem texto antes ou depois.
Não inclua markdown, backticks ou explicações.

Para cada posição identificada:
- Use apenas os slugs de temas fornecidos
- posicao: "favoravel" | "contrario" | "neutro"  
- intensidade: 1 (fraca) a 5 (bandeira identitária)
- confianca: 0.0 a 1.0 (sua confiança na extração)
- Inclua APENAS posições com evidência documentável
- Para cada posição, inclua pelo menos 1 fonte (votação, discurso, plano de governo)
`.trim();

interface ExtractionInput {
  politicianId: string;
  nomeUrna: string;
  partido: string;
  cargo: string;
  estado: string;
  planoGovernoTexto?: string;
  themeSlugs: string[];  // lista de slugs disponíveis no banco
}

interface ExtractedPosition {
  slug: string;
  posicao: 'favoravel' | 'contrario' | 'neutro';
  intensidade: number;
  confianca: number;
  fontes: Array<{
    tipo: string;
    descricao: string;
    url?: string;
    data?: string;
    confiabilidade: 'alta' | 'media' | 'baixa';
  }>;
}

async function extractThemesForPolitician(input: ExtractionInput): Promise<ExtractedPosition[]> {
  const userPrompt = `
Analise as posições políticas de:

Nome: ${input.nomeUrna}
Partido: ${input.partido}
Cargo disputado: ${input.cargo} — ${input.estado}

${input.planoGovernoTexto
  ? `Plano de governo (texto extraído do PDF do TSE):\n${input.planoGovernoTexto.slice(0, 4000)}`
  : 'Plano de governo: não disponível'
}

Temas disponíveis para classificação (use apenas estes slugs):
${input.themeSlugs.join(', ')}

Retorne um JSON com o formato:
{
  "posicoes": [
    {
      "slug": "nome_do_slug",
      "posicao": "favoravel",
      "intensidade": 4,
      "confianca": 0.85,
      "fontes": [
        {
          "tipo": "plano_governo",
          "descricao": "Propõe no plano de governo a unificação dos impostos sobre consumo",
          "confiabilidade": "alta"
        }
      ]
    }
  ]
}

Inclua apenas posições com confiança >= 0.6 e com pelo menos uma fonte identificável.
Omita temas onde não há evidência suficiente.
  `.trim();

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',   // Haiku: mais barato, suficiente para extração estruturada
    max_tokens: 2000,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    const parsed = JSON.parse(text);
    return parsed.posicoes ?? [];
  } catch {
    console.error('Erro ao parsear resposta da IA para', input.nomeUrna, ':', text.slice(0, 200));
    return [];
  }
}

// Processar todos os candidatos sem posições (batch)
async function runExtractionBatch(limit = 50) {
  // Buscar candidatos 2026 sem posições registradas
  const { data: candidatos } = await supabase
    .from('v_candidates_2026')
    .select('politician_id, nome_urna, partido_atual, cargo, estado, plano_governo_texto')
    .not('politician_id', 'in',
      supabase.from('politician_positions').select('politician_id')
    )
    .limit(limit);

  // Buscar slugs disponíveis
  const { data: themes } = await supabase
    .from('themes_catalog')
    .select('id, slug')
    .eq('ativo', true);

  const themeSlugs = (themes ?? []).map(t => t.slug);
  const themeMap = Object.fromEntries((themes ?? []).map(t => [t.slug, t.id]));

  for (const candidato of candidatos ?? []) {
    console.log(`Extraindo temas: ${candidato.nome_urna}...`);

    const posicoes = await extractThemesForPolitician({
      politicianId:     candidato.politician_id,
      nomeUrna:         candidato.nome_urna,
      partido:          candidato.partido_atual,
      cargo:            candidato.cargo,
      estado:           candidato.estado,
      planoGovernoTexto: candidato.plano_governo_texto ?? undefined,
      themeSlugs,
    });

    // Salvar posições extraídas
    for (const pos of posicoes) {
      const themeId = themeMap[pos.slug];
      if (!themeId) continue;

      await supabase.from('politician_positions').upsert({
        politician_id:  candidato.politician_id,
        theme_id:       themeId,
        posicao:        pos.posicao,
        intensidade:    pos.intensidade,
        fontes:         pos.fontes,
        confianca_ia:   pos.confianca,
        gerado_por_ia:  true,
        validado:       pos.confianca >= 0.85,  // auto-validar posições de alta confiança
      }, { onConflict: 'politician_id,theme_id' });
    }

    // Rate limiting: 1 req/s para o plano gratuito da API
    await new Promise(r => setTimeout(r, 1000));
  }
}
```

---

## Etapa 3 — Geração de embeddings (Voyage AI)

```typescript
// scripts/generate_embeddings.ts

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY!;

// Template de texto para gerar embedding (versao_schema = 1)
function buildEmbeddingText(politician: any, positions: any[], themes: Map<string, string>): string {
  const posicoesFavoraveis = positions
    .filter(p => p.posicao === 'favoravel')
    .sort((a, b) => b.intensidade - a.intensidade)
    .map(p => `${themes.get(p.theme_id)} (intensidade ${p.intensidade})`)
    .join(' | ');

  const posicoesContrarias = positions
    .filter(p => p.posicao === 'contrario')
    .sort((a, b) => b.intensidade - a.intensidade)
    .map(p => `${themes.get(p.theme_id)} (intensidade ${p.intensidade})`)
    .join(' | ');

  const temasBandeira = positions
    .filter(p => p.intensidade >= 4)
    .map(p => themes.get(p.theme_id))
    .join(', ');

  return [
    `Nome: ${politician.nome_urna}`,
    `Partido: ${politician.partido_atual}`,
    `Cargo disputado em 2026: ${politician.cargo} pelo estado de ${politician.estado}`,
    posicoesFavoraveis ? `Posições favoráveis: ${posicoesFavoraveis}` : '',
    posicoesContrarias ? `Posições contrárias: ${posicoesContrarias}` : '',
    temasBandeira ? `Temas bandeira: ${temasBandeira}` : '',
    politician.plano_governo_resumo ? `Resumo plano de governo: ${politician.plano_governo_resumo}` : '',
  ].filter(Boolean).join('\n');
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'voyage-large-2',
      input: [text],
    }),
  });

  const data = await response.json();
  return data.data[0].embedding;  // array de 1024 floats
}

async function runEmbeddingBatch() {
  // Buscar candidatos com posições mas sem embedding atualizado
  const { data: desatualizados } = await supabase
    .from('v_embeddings_desatualizados')
    .select('politician_id, nome_urna')
    .limit(100);

  // Buscar mapa de temas (id → nome)
  const { data: themes } = await supabase.from('themes_catalog').select('id, nome');
  const themeMap = new Map((themes ?? []).map(t => [t.id, t.nome]));

  for (const cand of desatualizados ?? []) {
    const { data: politician } = await supabase
      .from('v_candidates_2026')
      .select('*')
      .eq('politician_id', cand.politician_id)
      .single();

    const { data: positions } = await supabase
      .from('politician_positions')
      .select('theme_id, posicao, intensidade')
      .eq('politician_id', cand.politician_id);

    const texto = buildEmbeddingText(politician, positions ?? [], themeMap);
    const embedding = await generateEmbedding(texto);

    await supabase.from('politician_embeddings').upsert({
      politician_id:  cand.politician_id,
      embedding:      `[${embedding.join(',')}]`,   // formato aceito pelo pgvector
      texto_fonte:    texto,
      tokens_usados:  Math.ceil(texto.length / 4),  // estimativa
      versao_schema:  1,
      valido_ate:     new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),  // 7 dias
    }, { onConflict: 'politician_id' });

    console.log(`Embedding gerado: ${cand.nome_urna}`);
    await new Promise(r => setTimeout(r, 200));  // rate limit Voyage AI
  }
}
```

---

## Etapa 4 — Pré-computação de similaridade (optional)

```typescript
// scripts/compute_similarity.ts
// Pré-computa pares mais similares para os TOP N candidatos mais buscados
// Permite busca instantânea sem chamar pgvector em tempo real

async function precomputeTopSimilarities(topN = 200) {
  // Pegar os N candidatos com mais posições (mais completos)
  const { data: topCandidates } = await supabase
    .from('v_politician_theme_coverage')
    .select('politician_id')
    .order('temas_com_posicao', { ascending: false })
    .limit(topN);

  const ids = (topCandidates ?? []).map(c => c.politician_id);

  // Para cada par, calcular similaridade e salvar em similarity_cache
  // Apenas pares (A < B) para evitar duplicatas
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [idA, idB] = [ids[i], ids[j]].sort();  // garantir idA < idB

      const { data } = await supabase.rpc('calculate_pair_similarity', {
        p_id_a: idA,
        p_id_b: idB
      });

      if (data && data.similarity >= 0.3) {  // ignorar pares muito diferentes
        await supabase.from('similarity_cache').upsert({
          politician_id_a:   idA,
          politician_id_b:   idB,
          similarity_coseno: data.similarity,
          similarity_final:  data.similarity,
          valido_ate:        new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        }, { onConflict: 'politician_id_a,politician_id_b' });
      }
    }
  }
}
```

---

## Agendamento (cron)

```typescript
// Supabase Edge Function: scheduled-pipeline
// Configurar em: Supabase Dashboard > Edge Functions > Schedule

// Frequência recomendada:
// - ingest_tse:           semanal (dom 03:00)   — dados mudam pouco
// - extract_themes:       diário  (02:00)        — processar candidatos novos
// - generate_embeddings:  diário  (03:00)        — após extração de temas
// - compute_similarity:   diário  (04:00)        — após embeddings
// - limpeza session/cache: diário (05:00)

// Exemplo de Edge Function de limpeza (Deno):
// supabase/functions/cleanup/index.ts
Deno.serve(async () => {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  await supabase.from('session_embeddings').delete().lt('expira_em', new Date().toISOString());
  await supabase.from('similarity_cache').delete().lt('valido_ate', new Date().toISOString());

  return new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
});
```

---

## Estimativa de custo do pipeline

| Etapa | Volume (eleição 2026) | Custo estimado |
|---|---|---|
| Ingestão TSE | ~30.000 candidatos (CSV) | R$0 |
| Extração de temas (Haiku) | 30.000 × ~1.000 tokens | ~R$15 total |
| Embeddings (Voyage AI) | 30.000 × ~300 tokens | R$0 (free tier 200M/mês) |
| Pré-computação similaridade | Apenas top 200 pares | R$0 (SQL interno) |
| **Total pipeline completo** | | **~R$15–30 por ciclo eleitoral** |

---

## Checklist de implementação

- [ ] Baixar CSV do TSE (disponível em jul/2026; usar API da Câmara antes disso)
- [ ] Instalar dependências: `npm install papaparse @anthropic-ai/sdk @supabase/supabase-js`
- [ ] Configurar variáveis de ambiente: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`
- [ ] Testar `ingest_tse.ts` com arquivo de amostra (5 candidatos)
- [ ] Testar `extract_themes.ts` com 3 candidatos conhecidos e validar output
- [ ] Testar `generate_embeddings.ts` e confirmar vector salvo no banco
- [ ] Agendar Edge Functions no Supabase
- [ ] Monitorar tokens usados (Voyage AI dashboard) para não ultrapassar free tier

---

*Este é o último arquivo do schema. Ver `README_DOCS.md` para índice completo da documentação.*
