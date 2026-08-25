# VotoSim — Pesquisa de candidatos (pacote de colaboração)

Este pacote contém tudo que é preciso para continuar a pesquisa e o
preenchimento da base de candidatos 2026 do VotoSim: identidade partidária,
posições em 14 temas, dossiê e alertas (ficha suja, investigações,
polêmicas). Foi feito para um agente de IA de outro desenvolvedor conseguir
trabalhar sem acesso ao repositório completo do projeto.

**⚠️ Segurança:** `.env` (na raiz deste pacote) contém a `SERVICE_ROLE_KEY` do
Supabase — essa chave ignora todo o controle de acesso (RLS) e dá
leitura/escrita/exclusão completa no banco de produção, não só nas tabelas de
pesquisa. Trate este ZIP como uma credencial de produção: não suba para um
repositório público, não cole em chat, não deixe em disco compartilhado. Se
vazar, a chave precisa ser revogada e trocada no painel do Supabase (Project
Settings → API).

## O que é o VotoSim

Um app que compara as respostas do eleitor a um questionário com as posições
reais de cada candidato em 14 temas, e mostra o percentual de afinidade. Para
isso funcionar sem custo de IA a cada uso, a interpretação acontece **uma vez,
na ingestão** — um agente de IA lê o material de campanha de cada candidato,
preenche um JSON estruturado e valida contra um contrato fixo. O app depois só
faz comparação determinística, sem IA.

## 1. Setup

```bash
npm install
```

O pacote se organiza em `src/comandos/` (um executável por comando npm),
`src/lib/` (o que os comandos compartilham) e `tests/` (um teste por arquivo
de `src/`) — abra `src/comandos/` para ver exatamente o que dá pra rodar, sem
precisar distinguir executável de biblioteca por leitura.

`.env` já vem preenchido com as credenciais do Supabase e `ELECTION_YEAR=2026`
— não precisa mexer.

Baixe os dados do TSE que os scripts precisam (planos de governo e redes
sociais declaradas):

```bash
# --uf=<UF> baixa os planos daquele estado; BR = cargos federais (presidente)
# --bulk baixa os datasets nacionais (redes sociais etc.), só precisa uma vez
npm run download-tse -- --uf=BR --uf=SP --bulk
```

**Atenção ao descompactar — os dois tipos de arquivo vão para pastas
diferentes, e errar isso falha em silêncio** (ver `docs/achados-sp0.md`,
F11). O próprio `download-tse` imprime os comandos certos no final; são estes:

```bash
# planos: o zip já contém uma pasta {UF}/ dentro, então extraia PARA planos/
unzip -o 'data/tse-2026/proposta_governo_*.zip' -d data/tse-2026/extracted/planos

# datasets nacionais: cada um na sua própria pasta, com o nome do arquivo
for z in data/tse-2026/rede_social_candidato_*.zip \
         data/tse-2026/consulta_coligacao_*.zip \
         data/tse-2026/motivo_cassacao_*.zip; do
  [ -e "$z" ] && unzip -o "$z" -d "data/tse-2026/extracted/$(basename "$z" .zip)"
done
```

**Confira antes de pesquisar qualquer candidato:**

```bash
ls data/tse-2026/extracted/planos/                          # deve listar BR/, SP/, ...
ls data/tse-2026/extracted/rede_social_candidato_2026/ | head -3   # deve listar CSVs
```

Se os planos estiverem no lugar errado, o `build-brief` **aborta com exit 1** e
imprime o comando exato para corrigir — ele detecta o caso do F11 (planos em
`extracted/{UF}/` em vez de `extracted/planos/{UF}/`) e manda o `mv` pronto.
Ele só aborta para `presidente` e `governador`; para senador e deputado, plano
ausente é o esperado e o brief é gerado normalmente.

Rode os testes para confirmar que tudo compila e resolve:

```bash
npm test
```

## 2. O ciclo de trabalho, candidato por candidato

```bash
# 1. Veja o que está pendente (presidentes primeiro, por padrão)
npm run next-candidates -- --cargo=presidente --limit=15

# 2. Escolha um nome da lista e reivindique ele — isso marca em_progresso no
#    banco, para outro dev/agente não pegar o mesmo candidato ao mesmo tempo
npm run claim-candidate -- <tse_sequencial>

# 3. Gere o brief (identidade, redes sociais, os 14 temas do questionário, o
#    texto do plano de governo já extraído do PDF)
npm run build-brief -- <tse_sequencial>
# escreve em data/briefs/<tse_sequencial>.md

# 4. PESQUISE E ESCREVA O JSON — é aqui que entra o trabalho do agente de IA.
#    Leia docs/pesquisa-de-candidato.md INTEIRO antes da primeira vez;
#    é o procedimento completo, com um exemplo de JSON válido no fim.
#    Escreva o resultado em data/research/<tse_sequencial>.json

# 5. Valide o contrato antes de gravar qualquer coisa
npx tsx -e "
import { validateResearch } from './src/lib/research-contract.js'
import { readFileSync } from 'fs'
const data = JSON.parse(readFileSync(process.argv[2], 'utf-8'))
const errors = validateResearch(data)
console.log(errors.length === 0 ? 'VALID' : errors)
" data/research/<tse_sequencial>.json

# 6. Dry-run — confira o nome/cargo/estado resolvido ANTES de gravar
npm run ingest-research -- data/research/<tse_sequencial>.json

# 7. Se a identidade bater, grave de verdade
npm run ingest-research -- data/research/<tse_sequencial>.json --confirm
```

O passo 7 já marca sozinho o candidato como `concluido` no banco (é o
`FINALIZADO` que vocês pediram) — não precisa de nenhum passo manual extra
para isso. O `claim-candidate` do passo 2 é o que cobre o `EM PROGRESSO`.

Depois de gravar, confirme que o candidato saiu da fila:

```bash
npm run next-candidates -- --cargo=presidente --limit=15
```

`next-candidates` aceita `--cargo`, `--estado` e `--limit`. Para disputas
estaduais, `--estado` é essencial — sem ele você pagina por todos os estados:

```bash
npm run next-candidates -- --cargo=governador --estado=SP
npm run next-candidates -- --cargo=deputado_federal --estado=MG --limit=20
```

## 3. Senadores e deputados — o que muda

O ciclo da seção 2 é o mesmo para todos os cargos. Muda o seguinte:

**Não existe plano de governo, e isso é normal.** Só `presidente` e
`governador` protocolam plano no TSE. Para `senador`, `deputado_federal` e
`deputado_estadual` o brief sempre vai dizer "no government plan" — é o
esperado, **não é anomalia**. Não registre como achado e não trate como
informação sobre o candidato. O `build-brief` sabe dessa diferença: ele nunca
aborta por plano ausente nesses cargos, só nos executivos. O ledger também já
marca a etapa `documentos_oficiais` como `nao_aplicavel` sozinho — por isso
esses candidatos aparecem com `PEND 4`, não `PEND 5`.

**O voto nominal é a evidência mais forte que existe, e é obrigatório
buscar.** Um senador ou deputado votou nominalmente em muita coisa dos 14
temas. Ignorar isso e marcar tudo `sem_historico` joga fora justamente o que
diferencia um legislador de um candidato estreante. A etapa **E4a** do
`docs/pesquisa-de-candidato.md` diz onde buscar e como citar
(`fontes[].tipo: "votacao"`). Atenção: a API da Câmara **não** tem endpoint de
voto por deputado (dá HTTP 405) — para deputado federal use projetos de
autoria; para senador, `legis.senado.leg.br` traz voto **com a ementa junto**.
Leia a E4a antes do primeiro legislador.

**Quem tem mandato precisa prestar contas dele — etapa E4b (obrigatória).**
Vale para quem **tem ou teve** mandato legislativo, **mesmo trocando de
cargo** (deputado disputando o Senado, senador disputando governo, quem muda
de estado). Colete assiduidade, votações, projetos apresentados e gastos
públicos — e escreva no `resumoPerfil` como contagem crua, nunca como nota ou
adjetivo. A E4b traz a tabela do que cada casa entrega **em uma chamada**.

A regra mais importante da E4b: **só o que a fonte já dá de graça.** Nada de
scraping, nada de reconstruir total item a item, nada de proxy. O que não vem,
o dossiê declara indisponível. Dois exemplos reais e verificados:
o filtro de "projetos aprovados" da Câmara é **silenciosamente ignorado** (um
código inexistente devolve o mesmo total — não confunda apresentados com
aprovados), e um endpoint de "eventos que participou" **não é** taxa de
presença. Toda cifra cita a URL exata consultada, tipada
`fontes[].tipo: "desempenho_mandato"`.

**`coerenciaBase` não pode dizer "nunca ocupou cargo eletivo"** para quem tem
mandato. Para legislador, ela deve dizer qual mandato foi examinado, onde os
votos foram consultados e quantos temas tiveram votação identificada.

**Prioridade: deputado não tem ordenação confiável ainda.** São 7.677
deputados federais e 11.162 estaduais no tier `por_score`, mas o
`viabilidade_score` que deveria ordená-los **nunca foi calculado** (o schema
diz "Computed by a later plan"). Na prática a fila sai em ordem alfabética. O
`next-candidates` avisa isso na saída. Não trate o topo da lista como "os mais
relevantes" — combinem um critério de priorização (bancada atual, votação de
2022, cobertura de imprensa) antes de gastar esforço.

**Deputado distrital está fora de escopo** (`fora_escopo`, 427 candidaturas) e
não aparece na fila. É decisão de produto, não bug.

**Sobre scripts de voto automático:** existem no repositório principal
(`ingest-camara-votes.ts`, `ingest-senado-votes.ts`) mas **não** neste pacote,
de propósito. Eles escrevem direto em `politician_positions`, por fora do
contrato validado, e o `ingest-research.ts` apaga as posições do político
antes de inserir — rodar os dois em qualquer ordem destrói o trabalho do
outro, em silêncio. Pesquise o voto manualmente pela E4a até isso ser
reescrito.

## 4. Coordenando mais de um dev/agente ao mesmo tempo

- **Sempre rode `claim-candidate` antes de começar a pesquisar** um nome —
  isso muda o status das etapas `dossie` e `posicoes` no `enrichment_ledger`
  de `pendente` para `em_progresso`.
- `next-candidates` agora mostra uma coluna `EMPR` (em progresso). Se ela for
  maior que zero para um nome, **não comece esse candidato** — outra pessoa já
  reivindicou. Combinem entre vocês (chat, planilha, etc.) quem está em qual
  candidato; o banco sinaliza, mas não impede uma corrida se dois rodarem
  `claim-candidate` no mesmo segundo.
- Um candidato reivindicado continua aparecendo em `next-candidates` (por
  design — se o processo travar no meio, ele não pode sumir da fila como se
  estivesse pronto). É esperado; use a coluna `EMPR`, não a ausência da linha,
  para saber se já tem gente nele.
- Se perceberem que um candidato ficou travado em `em_progresso` sem ninguém
  trabalhando nele de fato (pesquisador desistiu, sessão caiu), rodem
  `claim-candidate` de novo — ele reivindica normalmente porque `em_progresso`
  sem confirmação nunca virou `concluido`.

## 5. As regras que não podem ser quebradas

Resumo do que está detalhado em `docs/pesquisa-de-candidato.md`. Leiam
o documento inteiro — isto aqui é só o que mais gerou erro real na prática:

1. **Nunca afirme um fato sem fonte checável.** Se o agente "lembra" algo de
   treinamento mas não pesquisou nessa sessão, isso não é fonte — pesquise de
   verdade (busca na web + leitura da página) antes de escrever qualquer
   `justificativa` ou criar qualquer `alerta`.
2. **Busca de antecedentes tem que citar o nome do candidato**, não um termo
   genérico como "ficha limpa 2026" — uma busca genérica que não retorna nada
   sobre a pessoa não é evidência de ficha limpa, é uma busca que não
   funcionou. (Isso já causou um erro real: o perfil do Lula saiu do ar sem
   mencionar as condenações da Lava Jato porque a busca de antecedentes foi
   genérica demais.)
3. **A armadilha do enquadramento:** a afirmação de um tema é uma posição
   específica, não um assunto. "Estatizar a indústria de armas" não é a mesma
   coisa que "facilitar o porte de arma pessoal" — são o mesmo assunto
   (armas), posições diferentes. Quando a evidência encontrada é do mesmo
   assunto mas não decide exatamente a afirmação como está escrita, a posição
   correta é `neutro` com confiança baixa, não um `favoravel`/`contrario`
   estimado por proximidade temática.
4. **Sem evidência é `neutro`, nunca é inventado.** `neutro` exige
   `confiancaIa` baixa (~0.2–0.35) e uma `justificativa` que diga o que foi
   pesquisado e não achado. `fonteRefs` nunca fica vazio — mesmo numa posição
   neutra por ausência de evidência, cite a fonte que foi consultada (o plano
   de governo, por exemplo) para mostrar que a busca foi de fato feita ali.
5. **Plano de governo ausente ou ilegível é dito explicitamente**, nunca
   contornado em silêncio. Ver `docs/achados-sp0.md` F8 (PDF extrai
   embaralhado, não vazio) e F9 (plano protocolado perto do prazo pode não
   estar no snapshot local do TSE — confira a imprensa antes de concluir que
   o candidato genuinamente não filiou nada).
6. **Alerta de `ficha_suja`/`investigacao` só publica automaticamente com
   fonte camada 1** (domínio `.gov.br`/`.jus.br`/`.leg.br`/`.mp.br`) — sem
   isso, `validado` fica `false` e vai para curadoria humana. Isso é
   intencional, não um bug.
7. **Um caso resolvido (absolvição, prescrição, anulação) nunca é omitido
   nem apagado** — preencha `resolucao` e `dataResolucao` no alerta, o que
   automaticamente marca `ativo=false` no banco, mas o registro fica visível
   para transparência. Um alerta com resolução nunca publica
   automaticamente, mesmo com fonte camada 1.
8. **Polêmica exige duas fontes camada 2 independentes** (que não citam uma
   à outra) **ou uma fonte camada 1**. Uma manchete sozinha não basta.
9. **Sempre eco de identidade antes de gravar.** O `dry-run` do passo 6 existe
   para pegar um `tseSequencial` digitado errado antes que ele grave a
   pesquisa de um candidato na ficha de outro. Não pule esse passo.
10. **Voto nominal nunca é afirmado de memória.** Vale para legislador o
    mesmo que vale para o resto: se o voto não foi consultado nesta sessão e
    não pode ser citado com URL, ele não existe para esta pesquisa. E nunca
    deduza o voto pela posição do partido — o parlamentar que votou contra a
    própria bancada é exatamente o caso que a etapa E4a existe para pegar.
11. **Número de desempenho de mandato nunca é estimado.** Assiduidade,
    gastos, projetos: ou vieram da fonte numa chamada, ou o dossiê diz que
    não foi possível obter. Inventar proxy (usar "eventos que participou"
    como presença) ou apresentar "projetos apresentados" como se fosse
    "aprovados" são os dois erros que a E4b existe para impedir.

## 6. Os 14 temas e o formato do JSON

`src/lib/research-contract.ts` é a fonte da verdade — `THEME_SLUGS` lista
os 14 slugs válidos, e `validateResearch()` é exatamente o validador usado no
passo 5 acima. `docs/pesquisa-de-candidato.md` seção 6.2 tem um
exemplo completo de JSON válido, com um alerta ativo e um alerta resolvido,
para copiar a estrutura.

## 7. Arquivos deste pacote

```
ingest-candidates/
├── README.md                              este arquivo
├── package.json
├── .env                                   credenciais (NÃO versionar, NÃO compartilhar)
├── .env.example
├── docs/
│   ├── pesquisa-de-candidato.md           procedimento completo (leitura obrigatória)
│   ├── alertas.md                         schema e regras editoriais dos alertas
│   └── achados-sp0.md                     bugs/armadilhas já encontrados (F1–F15)
├── src/
│   ├── comandos/                          um executável por comando npm
│   │   ├── build-brief.ts                 monta o brief de um candidato
│   │   ├── ingest-research.ts             valida e grava o JSON no Supabase
│   │   ├── next-candidates.ts             lista quem falta (--cargo, --estado, --limit)
│   │   ├── claim-candidate.ts             reivindica um candidato (pendente → em_progresso)
│   │   ├── bootstrap-ledger.ts            semeia o ledger para candidaturas novas
│   │   └── download-tse.ts                baixa os dados oficiais do TSE
│   └── lib/                               o que os comandos compartilham
│       ├── supabase.ts                    cliente Supabase (service role)
│       ├── pdf.ts                         extração de texto de PDF
│       ├── research-contract.ts           contrato/validação do JSON de pesquisa
│       ├── neutro-motivo.ts               classificação do motivo de um veredito neutro
│       ├── ledger.ts                      tipos e construção do ledger
│       └── gov-plans.ts                   URLs dos arquivos do TSE
├── tests/                                 um teste por arquivo de src/
└── data/                                  briefs, pesquisas e zips do TSE (git-ignorado)
```
