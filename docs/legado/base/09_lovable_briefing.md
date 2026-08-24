# VotoSim — Briefing para o Lovable

> **Status:** ⚠️ DEPRECIADO em 2026-08-24 · **Última atualização real:** 2026-06-27
> **Motivo:** Prompts para construir o MVP inteiro no Lovable, citando o Gemini como provedor de match — o frontend é Next.js App Router escrito à mão, sem Lovable, e o match não usa IA.
> **Substituído por:** `docs/referencia/frontend.md`


> **Arquivo:** `09_lovable_briefing.md`  
> **Versão:** 1.0  
> **Pré-requisito:** `08_supabase_setup.md` concluído — Supabase conectado e tabelas criadas  
> **Objetivo:** prompts prontos para construir o MVP do VotoSim no Lovable, na ordem correta

---

## Como usar este documento

Cada seção é um **prompt pronto para colar no chat do Lovable**, na ordem indicada.
Não pule etapas — cada prompt depende do anterior.

Antes de cada prompt há uma nota explicando o que ele faz e o que verificar antes de avançar.

---

## Prompt 0 — Contexto inicial do projeto

Cole este prompt **uma única vez**, no início, antes de qualquer outro.
Ele estabelece o contexto do produto para o Lovable e evita que ele tome decisões erradas nas etapas seguintes.

```
Vou construir um produto chamado VotoSim — uma ferramenta de informação eleitoral para as eleições brasileiras de 2026.

Contexto do produto:
- O usuário responde um questionário de 14 perguntas sobre temas políticos
- Com base nas respostas, um agente de IA (Gemini Flash) calcula o alinhamento com candidatos cadastrados no banco
- O resultado é uma lista de candidatos agrupada por cargo (presidente, senador, governador, deputado federal, deputado estadual) com percentual de alinhamento temático
- O produto NÃO recomenda voto — ele informa e compara. Nunca usar a expressão "vote em" ou equivalente

Tecnologia:
- Frontend: React + Tailwind gerado pelo Lovable
- Backend: Supabase Edge Functions (Deno/TypeScript)
- Banco: Supabase PostgreSQL já configurado e conectado — as tabelas já existem
- IA: Gemini Flash via API key já configurada nos secrets do Supabase (GEMINI_API_KEY)
- Produto stateless: nenhum dado do usuário é salvo no banco
- Sem autenticação no MVP

Tabelas já existentes no Supabase (não criar novamente):
- themes_catalog: 14 temas políticos com afirmações do questionário
- politicians: políticos cadastrados
- candidacies: candidaturas por cargo/estado/eleição
- politician_positions: posições dos políticos por tema
- politician_alerts: alertas de ficha suja, investigações e polêmicas
- parties: partidos políticos

Antes de começar a construir qualquer tela, confirme que consegue acessar a tabela themes_catalog e liste os 14 slugs disponíveis nela.
```

**Verificar antes de avançar:** o Lovable deve listar os 14 slugs da tabela `themes_catalog` — `reforma_tributaria`, `sus_saude_publica`, etc. Se não listar, revisar a conexão com o Supabase.

---

## Prompt 1 — Identidade visual e estrutura base

```
Crie a estrutura base do VotoSim com a seguinte identidade visual:

Nome do produto: VotoSim
Tagline: "Descubra quais candidatos pensam como você"
Tom: sério, cívico, neutro politicamente — sem cores de partidos

Paleta de cores:
- Primária: azul escuro #1A3A5C
- Destaque: azul médio #1A56A0
- Fundo: branco #FFFFFF e cinza claro #F4F4F4
- Texto: #222222
- Sucesso/alinhamento alto: verde #3B6D11
- Alerta: laranja #854F0B
- Alerta crítico: vermelho #A32D2D

Tipografia: Inter (Google Fonts)

Estrutura de páginas do MVP:
1. /inicio — tela de boas-vindas com CTA para começar
2. /perfil — coleta estado, município e faixa etária do eleitor
3. /questionario — as 14 perguntas, uma por vez
4. /revisao — revisão das respostas antes de enviar
5. /resultado — lista de candidatos com % de alinhamento
6. /sobre — página explicando o projeto e o disclaimer legal

Crie o layout base com header fixo contendo o logo "VotoSim" e a barra de progresso (visível apenas durante o questionário). Rodapé com: "O VotoSim é uma ferramenta informativa. Não somos filiados a partidos políticos. A decisão de voto é exclusivamente do eleitor." e links para /sobre.

Não crie conteúdo das páginas ainda — apenas a estrutura de navegação e o layout base.
```

**Verificar:** navegação entre as 6 rotas funciona, header e footer aparecem corretamente.

---

## Prompt 2 — Tela de boas-vindas (/inicio)

```
Crie a tela /inicio com o seguinte conteúdo:

Headline principal: "Descubra quais candidatos pensam como você"

Subtítulo: "Responda 14 perguntas sobre temas que importam para você e veja quais candidatos têm propostas alinhadas com seus valores — sem indicação de voto."

Seção "Como funciona" com 3 cards horizontais:
1. Ícone de formulário — "Responda o questionário" — "14 perguntas sobre temas políticos reais, na escala que você escolher"
2. Ícone de gráfico — "Veja o alinhamento" — "Candidatos do seu estado ordenados por % de alinhamento com suas respostas"
3. Ícone de escudo — "Sem recomendação de voto" — "A decisão é sempre sua. Mostramos dados, não opiniões"

Botão CTA principal: "Começar" → navega para /perfil

Abaixo do CTA, texto pequeno: "Não coletamos dados pessoais. Suas respostas não são salvas."

Eleições 2026 — badge discreto no canto: "Eleições Gerais 2026"
```

---

## Prompt 3 — Tela de perfil do eleitor (/perfil)

```
Crie a tela /perfil com o título "Onde você vota?" e subtítulo "Essas informações definem quais candidatos aparecem no seu resultado."

Formulário com 3 campos em sequência:

Campo 1 — Estado:
  Label: "Estado onde você é eleitor"
  Tipo: select
  Opções: todos os 27 estados brasileiros com sigla e nome completo
  Ex: "SP — São Paulo", "RJ — Rio de Janeiro", etc.
  Placeholder: "Selecione seu estado"

Campo 2 — Município:
  Label: "Município"
  Tipo: select
  Placeholder: "Selecione seu município"
  Comportamento: só habilita após selecionar o estado. No MVP pode deixar como campo de texto livre com placeholder "Digite seu município" — a lista completa de municípios pode ser implementada depois.

Campo 3 — Faixa etária:
  Label: "Sua faixa etária"
  Tipo: select
  Opções:
    - "16 a 17 anos (voto facultativo)"
    - "18 a 24 anos"
    - "25 a 34 anos"
    - "35 a 44 anos"
    - "45 a 59 anos"
    - "60 anos ou mais"

Botão "Continuar para o questionário" — só habilita quando os 3 campos estiverem preenchidos.
Botão "Voltar" — retorna para /inicio.

Salvar estado e município em variável de estado local (React state) — não salvar no banco.
```

---

## Prompt 4 — Tela do questionário (/questionario)

```
Crie a tela /questionario. Esta é a tela mais importante do produto.

Comportamento geral:
- Exibe UMA pergunta por vez (não lista todas juntas)
- Barra de progresso no header mostrando "Pergunta X de 14"
- Animação de transição suave entre perguntas (slide ou fade)

Layout de cada pergunta:
- Número da pergunta e categoria (ex: "3 de 14 · Economia")
- Texto da afirmação em destaque — fonte grande, weight medium
- Botão de acordeão "Saiba mais ▾" — ao expandir, mostra o contexto educativo. Fechado por padrão.
- Tooltip de ícone ℹ️ ao lado do número — ao hover/click mostra: qual cargo tem mais atribuição sobre esse tema
- Slider de 1 a 5 com os seguintes labels:
    1 — Discordo totalmente
    2 — Discordo parcialmente
    3 — Não tenho opinião formada
    4 — Concordo parcialmente
    5 — Concordo totalmente
  O slider começa sem valor selecionado (não começa no 3)
- Botão "Pular esta pergunta" abaixo do slider — registra como neutro (valor 3) e avança
- Botão "Próxima" — só habilita após o usuário mover o slider
- Botão "Voltar" — retorna para a pergunta anterior permitindo alterar a resposta

Carregar as perguntas da tabela themes_catalog do Supabase, ordenadas por ordem_exibicao, usando os campos:
- nome → categoria/título
- afirmacao_questionario → texto principal da afirmação
- contexto_questionario → texto do acordeão "Saiba mais"
- nota_educativa → texto do tooltip de cargo
- slug → identificador para o JSON de resposta

Após a pergunta 14, navegar automaticamente para /revisao.

Guardar todas as respostas em React state no formato:
[{ slug: string, resposta: number (1-5), concordancia: 'concordo'|'neutro'|'discordo' }]
onde concordancia é derivado: 1-2 = discordo, 3 = neutro, 4-5 = concordo
```

**Verificar:** as 14 perguntas carregam do banco corretamente, na ordem certa, com afirmação e contexto preenchidos.

---

## Prompt 5 — Tela de revisão (/revisao)

```
Crie a tela /revisao com título "Revise suas respostas" e subtítulo "Você pode alterar qualquer resposta antes de ver os candidatos."

Conteúdo:
- Lista de todas as 14 perguntas respondidas com:
  - Nome do tema (campo nome da themes_catalog)
  - Resposta dada em texto: "Discordo totalmente", "Discordo parcialmente", "Não tenho opinião formada", "Concordo parcialmente", "Concordo totalmente"
  - Cor de fundo do item: vermelho claro para discordo, cinza para neutro, verde claro para concordo
  - Botão "Alterar" em cada linha — volta para aquela pergunta específica no questionário

Contador de respostas válidas: "X de 14 temas respondidos (Y pulados)"
Respostas neutras/puladas são contadas como "puladas".

Validação antes de permitir avançar:
- Mínimo de 3 respostas não-neutras (concordo ou discordo)
- Se menos de 3: exibir mensagem "Responda pelo menos [N] pergunta(s) a mais para uma análise mais precisa" com botão "Completar questionário"

Botão principal "Ver candidatos alinhados" — só ativo se validação passar → dispara o Prompt 6
Botão "Voltar ao questionário"
```

---

## Prompt 6 — Edge Function de match com Gemini

```
Crie uma Supabase Edge Function chamada "match-candidatos" que recebe o perfil do usuário e retorna candidatos com percentual de alinhamento.

Endpoint: POST /functions/v1/match-candidatos

Body recebido:
{
  "estado": "SP",
  "municipio": "São Paulo",
  "faixa_etaria": "25 a 34 anos",
  "respostas": [
    { "slug": "sus_saude_publica", "resposta": 5, "concordancia": "concordo" },
    { "slug": "privatizacao_estatais", "resposta": 1, "concordancia": "discordo" },
    { "slug": "porte_armas", "resposta": 2, "concordancia": "discordo" }
  ]
}

Lógica da Edge Function:

1. Buscar no Supabase todos os candidatos do estado informado via a view v_candidates_2026_matchable, incluindo suas posições (politician_positions) e alertas (v_candidate_alerts)

2. Para cada candidato, montar um JSON estruturado com:
   - nome_urna, partido, cargo, estado
   - posicoes: array de { slug, posicao (favoravel/contrario/neutro), intensidade (1-5) }
   - alertas: array de { tipo, severidade, titulo, badge_cor }
   - plano_governo_resumo (se disponível)

3. Chamar a API do Gemini Flash com o seguinte prompt (substituindo as variáveis):

---PROMPT GEMINI---
Você é um assistente de informação eleitoral neutro e imparcial.

Perfil do eleitor:
- Estado: {estado}
- Respostas do questionário: {respostas_json}
  (escala: 1=discordo totalmente, 5=concordo totalmente)

Candidatos disponíveis para {estado} nas eleições 2026:
{candidatos_json}

Sua tarefa:
1. Para cada candidato, calcule um percentual de alinhamento (0 a 100%) comparando as posições do candidato com as respostas do eleitor
2. Dê peso maior para temas onde o eleitor discordou totalmente (1) ou concordou totalmente (5) — esses são os mais importantes para ele
3. Considere a relevância do cargo para cada tema (ex: privatização de estatais é mais relevante para presidente e deputado federal do que para governador)
4. Agrupe o resultado por cargo na seguinte ordem: presidente, governador, senador, deputado_federal, deputado_estadual
5. Para cada cargo, liste no máximo 5 candidatos, ordenados do maior para o menor alinhamento
6. Para cada candidato, inclua quais temas alinharam e quais divergiram

IMPORTANTE:
- Nunca use as expressões "vote em", "escolha", "recomendo" ou equivalentes
- Apresente apenas como percentual de alinhamento informativo
- Se um candidato tiver alertas, inclua no resultado mas não penalize automaticamente — deixe o eleitor decidir o peso

Responda APENAS com JSON válido no seguinte formato:
{
  "cargos": [
    {
      "cargo": "presidente",
      "candidatos": [
        {
          "politician_id": "uuid",
          "nome_urna": "Nome",
          "partido": "PT",
          "score": 87,
          "temas_alinhados": ["sus_saude_publica", "bolsa_familia_transferencia"],
          "temas_divergentes": ["privatizacao_estatais"],
          "tem_alertas": false,
          "alertas": []
        }
      ]
    }
  ],
  "total_candidatos_analisados": 47,
  "estado": "SP"
}
---FIM DO PROMPT---

4. Retornar o JSON do Gemini diretamente para o frontend

Usar a variável de ambiente GEMINI_API_KEY já configurada nos secrets.
Modelo a usar: gemini-2.5-flash-preview ou gemini-1.5-flash (o mais recente disponível no free tier).
URL da API: https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent?key={GEMINI_API_KEY}

Tratar erros: se o Gemini retornar erro ou JSON inválido, retornar status 500 com mensagem amigável.
Timeout: configurar para 30 segundos — o Gemini pode demorar com muitos candidatos.
```

**Verificar:** testar a Edge Function diretamente no Supabase Dashboard → Edge Functions → Test, com um body de exemplo. Deve retornar JSON com a estrutura de cargos.

---

## Prompt 7 — Tela de resultado (/resultado)

```
Crie a tela /resultado que exibe os candidatos retornados pela Edge Function match-candidatos.

Estado de carregamento:
- Ao navegar para /resultado, disparar imediatamente a chamada para a Edge Function
- Exibir tela de loading com mensagem: "Analisando candidatos do seu estado..." com spinner
- Após retornar, exibir os resultados

Layout da tela de resultado:

1. Cabeçalho do resultado:
   - "Candidatos mais alinhados com você em [Estado]"
   - Subtítulo: "Resultado baseado nas suas [X] respostas. Percentual indica alinhamento temático — não é recomendação de voto."
   - Botão "Refazer questionário" → volta para /inicio

2. Agrupamento por cargo em seções:
   Ordem: Presidente → Governador → Senador → Deputado Federal → Deputado Estadual
   Cada seção tem:
   - Título do cargo com ícone
   - Nota educativa do cargo em texto pequeno (ex: "Quem é eleito governa o estado e gerencia as polícias Civil e Militar")
   - Até 5 cards de candidatos

3. Card de candidato:
   - Foto do candidato (foto_url do banco, ou avatar genérico com inicial do nome)
   - Nome na urna em destaque
   - Partido
   - Barra de progresso visual do score (0–100%) com a cor variando:
       80–100% → verde
       60–79%  → azul
       40–59%  → amarelo
       0–39%   → cinza
   - Percentual em número grande: "87% de alinhamento"
   - Seção expandível "Ver detalhes":
       - Temas alinhados: lista com ícone ✓ verde
       - Temas divergentes: lista com ícone ✗ vermelho
   - Se tem_alertas = true: badge de alerta com cor correspondente (vermelho = ficha_suja, laranja = investigacao, cinza = polemica)
     Ao clicar no badge, expandir painel com titulo, descricao e link para fonte_url

4. Rodapé do resultado:
   - "Os dados de candidatos são obtidos de fontes públicas oficiais (TSE, Câmara dos Deputados, Senado Federal). Atualizado em [data]."
   - Botão "Compartilhar resultado" → copia link da página para a área de transferência (ou Web Share API no mobile) com mensagem: "Fiz o questionário do VotoSim e descobri meu perfil político. Faça o seu também: [URL]"

5. Tratamento de erro:
   - Se a Edge Function retornar erro: exibir "Não foi possível carregar os candidatos. Tente novamente." com botão de retry.
   - Se não houver candidatos cadastrados para o estado: "Ainda não temos candidatos cadastrados para [Estado]. Volte em breve — estamos atualizando os dados semanalmente."
```

---

## Prompt 8 — Página Sobre (/sobre)

```
Crie a página /sobre com o seguinte conteúdo:

Título: "Sobre o VotoSim"

Seção 1 — O que é:
"O VotoSim é uma ferramenta gratuita de informação eleitoral criada para ajudar eleitores brasileiros a entender quais candidatos têm propostas mais próximas dos seus valores. Não indicamos candidatos — mostramos dados para que você tome sua própria decisão."

Seção 2 — Como funciona:
"Você responde 14 perguntas sobre temas como saúde, educação, economia e segurança pública. Com base nas suas respostas, nosso sistema compara seu perfil com as posições documentadas dos candidatos e calcula um percentual de alinhamento temático."

Seção 3 — De onde vêm os dados:
Lista com links:
- Portal de Dados Abertos do TSE (dadosabertos.tse.jus.br)
- DivulgaCandContas — TSE (divulgacandcontas.tse.jus.br)
- Dados Abertos da Câmara dos Deputados (dadosabertos.camara.gov.br)
- Dados Abertos do Senado Federal (dadosabertos.senado.leg.br)

"Todos os dados utilizados são públicos, oficiais e gratuitos, disponibilizados pelos próprios órgãos do governo brasileiro."

Seção 4 — Privacidade:
"O VotoSim não coleta dados pessoais. Suas respostas ao questionário não são salvas em nenhum banco de dados. Não criamos perfis de usuários. Não usamos cookies de rastreamento."

Seção 5 — Disclaimer legal (em destaque com borda):
"O VotoSim é uma ferramenta de informação. Não somos filiados a partidos políticos, candidatos ou organizações político-partidárias. O percentual de alinhamento é um indicador informativo baseado em dados públicos — não constitui recomendação, sugestão ou indução de voto. A decisão de voto é exclusivamente do eleitor, conforme assegurado pela Constituição Federal. Esta ferramenta está alinhada à Resolução TSE nº 23.755/2026."

Botão: "Começar o questionário" → /inicio
```

---

## Prompt 9 — Ajustes de responsividade e polish

```
Revise todas as telas e faça os seguintes ajustes:

Mobile first:
- Todas as telas devem funcionar bem em telas de 375px (iPhone SE) e 390px (iPhone 14)
- O slider do questionário deve ser fácil de usar com o polegar no mobile — altura mínima de 44px na área de toque
- Cards de candidato devem empilhar em coluna única no mobile
- Botões de ação principais sempre fixos na parte inferior da tela no mobile (sticky bottom)

Acessibilidade básica:
- Todos os elementos interativos com aria-label descritivo
- Contraste de texto mínimo 4.5:1
- Foco visível no teclado em todos os inputs e botões

Performance:
- Lazy loading nas fotos dos candidatos
- Skeleton loading nos cards enquanto a Edge Function responde

Pequenos detalhes:
- Favicon com as iniciais "VS" em azul escuro
- Title de cada página: "VotoSim — [nome da página]"
- Meta description: "Descubra quais candidatos nas eleições 2026 têm propostas alinhadas com seus valores. Ferramenta gratuita e sem recomendação de voto."
- Animação suave (200ms ease) nas transições entre perguntas do questionário
```

---

## Prompt 10 — AdSense (após aprovação do Google)

> Só executar após receber aprovação do AdSense — o Google exige conteúdo publicado antes de aprovar.

```
Adicione slots do Google AdSense nas seguintes posições:

1. Na tela /resultado, entre o grupo de candidatos a Governador e o grupo de Senador:
   Slot horizontal 728x90 (desktop) / 320x50 (mobile)

2. Na tela /resultado, abaixo do último grupo de candidatos, antes do rodapé:
   Slot retangular 300x250

3. Na página /sobre, no final do conteúdo antes do botão CTA:
   Slot retangular 300x250

Código do AdSense para inserir (substituir com os valores reais após aprovação):
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX" crossorigin="anonymous"></script>

Regra importante: NÃO inserir anúncios dentro das telas /questionario e /revisao — manter foco do usuário durante o preenchimento.
Configurar no painel do AdSense para bloquear anúncios de candidatos e partidos políticos nas páginas do VotoSim.
```

---

## Ordem de execução recomendada

```
Prompt 0  → Contexto do projeto (obrigatório — fazer primeiro)
Prompt 1  → Estrutura base e identidade visual
Prompt 2  → Tela /inicio
Prompt 3  → Tela /perfil
Prompt 4  → Tela /questionario (carregar do banco)
Prompt 5  → Tela /revisao
Prompt 6  → Edge Function de match (Gemini)
Prompt 7  → Tela /resultado
Prompt 8  → Página /sobre
Prompt 9  → Polish e responsividade
Prompt 10 → AdSense (após aprovação — não bloqueia o lançamento)
```

---

## Dicas de uso no Lovable

**Se o Lovable travar ou regredir:** use o botão de histórico para voltar ao último estado estável antes de tentar novamente com prompt mais específico.

**Se uma tela ficar errada:** descreva exatamente o que está diferente do esperado — "o slider está começando no valor 3 mas deveria começar sem valor selecionado" — em vez de pedir para refazer tudo.

**Se a Edge Function não funcionar:** peça ao Lovable para mostrar os logs da Edge Function no Supabase. O erro quase sempre é de variável de ambiente ou de parsing do JSON do Gemini.

**Para iterar rapidamente:** use o Visual Edit do Lovable (clique direto nos elementos) para ajustes de cor, espaçamento e texto — sem gastar prompts.

**Ordem de prioridade se o tempo apertar:**
Prompts 0, 1, 2, 3, 4, 6, 7 → produto funcional mínimo
Prompts 5, 8, 9 → polish e completude
Prompt 10 → monetização (não bloqueia o lançamento)

---

## Checklist de lançamento do MVP

```
Produto:
  [ ] Prompt 0–9 executados e funcionando
  [ ] Questionário carrega 14 perguntas do banco corretamente
  [ ] Edge Function retorna resultado para pelo menos 1 estado de teste
  [ ] Tela de resultado exibe candidatos agrupados por cargo
  [ ] Alertas de ficha suja aparecem nos cards (quando houver dados)
  [ ] Botão de compartilhamento funciona
  [ ] Página /sobre com disclaimer legal publicada
  [ ] Rodapé com disclaimer em todas as páginas

Técnico:
  [ ] Deploy publicado no Lovable Cloud
  [ ] Domínio customizado configurado (votosim.com.br ou similar)
  [ ] GEMINI_API_KEY e SERVICE_ROLE_KEY nos secrets do Supabase
  [ ] Testar em iPhone (mobile) e Chrome desktop
  [ ] Testar fluxo completo: /inicio → /perfil → /questionario → /revisao → /resultado

Dados:
  [ ] Pelo menos 1 estado com candidatos cadastrados para teste (mesmo que manual)
  [ ] Seed dos 14 temas confirmado no banco

Pré-lançamento:
  [ ] Solicitar aprovação do AdSense assim que o site estiver publicado
  [ ] Compartilhar link com 3–5 pessoas para teste de usabilidade
```

---

*Arquivo anterior: `08_supabase_setup.md`*  
*Próximo arquivo: `10_gemini_prompts.md` — prompts detalhados para o agente de extração de posições e match*
