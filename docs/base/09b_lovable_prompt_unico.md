# VotoSim — Prompt Único para o Lovable

> **Arquivo:** `09b_lovable_prompt_unico.md`  
> **Versão:** 1.0  
> **Quando usar:** assim que os créditos do Lovable resetarem (21h horário de Brasília / meia-noite UTC)  
> **Pré-requisito:** `08_supabase_setup.md` concluído — Supabase conectado com todas as tabelas criadas  
> **Contexto:** substitui os prompts individuais do `09_lovable_briefing.md` por um único prompt denso que constrói o MVP inteiro de uma tacada, minimizando consumo de créditos

---

## Estratégia de uso

Cole o prompt abaixo integralmente no chat do Lovable em uma única mensagem. Se o Lovable fizer alguma pergunta durante a construção, responda sempre com: "Pode decidir por conta própria e continuar construindo."

Se travar ou regredir em alguma tela, use o botão de histórico do Lovable para voltar ao último estado estável antes de tentar novamente com um prompt mais específico descrevendo apenas o que está errado.

Quando os créditos acabarem ou o MVP estiver 70% pronto, exporte o código para o GitHub via Settings → Git e finalize no Cursor, usando os documentos desta pasta como contexto.

---

## O prompt

```
Você vai construir o MVP completo do VotoSim, uma ferramenta de informação eleitoral para as eleições brasileiras 2026. O Supabase já está conectado e as tabelas já existem — não crie nenhuma tabela nova. Construa tudo agora sem me fazer perguntas, tomando as decisões técnicas por conta própria.

CONTEXTO DO PRODUTO: O usuário responde 14 perguntas sobre temas políticos numa escala de 1 a 5, e recebe uma lista de candidatos do seu estado com percentual de alinhamento temático. O produto nunca usa as expressões "vote em" ou "recomendo" — apenas mostra alinhamento informativo. Produto stateless, sem login, sem salvar dados do usuário no banco.

IDENTIDADE VISUAL: Paleta com azul escuro #1A3A5C como cor primária, azul médio #1A56A0 como destaque, branco #FFFFFF e cinza claro #F4F4F4 como fundos, #222222 para texto, verde #3B6D11 para alinhamento positivo, laranja #854F0B para alertas médios e vermelho #A32D2D para alertas críticos. Tipografia Inter do Google Fonts. Header fixo com logo "VotoSim" em todas as páginas. Barra de progresso no header visível apenas durante o questionário mostrando "Pergunta X de 14". Rodapé em todas as páginas com o texto "O VotoSim é uma ferramenta informativa. Não somos filiados a partidos políticos. A decisão de voto é exclusivamente do eleitor." e link para /sobre. Mobile first, funcionar bem em 375px. Favicon com iniciais VS em azul escuro. Title de cada página no formato "VotoSim — [nome da página]".

TABELAS JÁ EXISTENTES NO SUPABASE (não recriar): themes_catalog com os campos slug, nome, afirmacao_questionario, contexto_questionario, nota_educativa e ordem_exibicao. Politicians com id, nome_urna, partido_atual e foto_url. Candidacies com politician_id, cargo, estado e status. Politician_positions com politician_id, theme_id, posicao e intensidade. Politician_alerts com politician_id, tipo, severidade, titulo, descricao e fonte_url. Views prontas: v_candidates_2026_matchable e v_candidate_alerts.

ESTRUTURA DE ROTAS: /inicio, /perfil, /questionario, /revisao, /resultado e /sobre.

TELA /inicio: Headline "Descubra quais candidatos pensam como você". Subtítulo "Responda 14 perguntas sobre temas que importam para você e veja quais candidatos têm propostas alinhadas com seus valores — sem indicação de voto." Três cards lado a lado explicando como funciona: primeiro com ícone de formulário e texto "Responda o questionário — 14 perguntas sobre temas políticos reais", segundo com ícone de gráfico e texto "Veja o alinhamento — candidatos do seu estado ordenados por percentual de alinhamento", terceiro com ícone de escudo e texto "Sem recomendação de voto — a decisão é sempre sua". Botão CTA "Começar" navegando para /perfil. Texto pequeno abaixo do botão "Não coletamos dados pessoais. Suas respostas não são salvas." Badge discreto "Eleições Gerais 2026" no canto superior direito.

TELA /perfil: Título "Onde você vota?" e subtítulo "Essas informações definem quais candidatos aparecem no seu resultado." Campo select de estado com todos os 27 estados no formato "SP — São Paulo". Campo de texto livre para município com placeholder "Digite seu município". Campo select de faixa etária com as opções "16 a 17 anos (voto facultativo)", "18 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 59 anos" e "60 anos ou mais". Botão "Continuar" que só habilita quando os 3 campos estiverem preenchidos, navegando para /questionario. Botão "Voltar" retornando para /inicio. Salvar os três valores em React state, não no banco.

TELA /questionario: Exibe uma pergunta por vez com animação de transição suave. Carregar todas as 14 perguntas da tabela themes_catalog ordenadas por ordem_exibicao. Cada pergunta mostra o nome do tema e número da pergunta no topo, o texto de afirmacao_questionario em destaque com fonte grande e weight medium, um botão acordeão "Saiba mais" que ao clicar expande o contexto_questionario e fica fechado por padrão, um ícone de informação que ao clicar mostra a nota_educativa sobre qual cargo tem atribuição naquele tema, um slider de 1 a 5 com os labels "1 — Discordo totalmente", "2 — Discordo parcialmente", "3 — Não tenho opinião formada", "4 — Concordo parcialmente" e "5 — Concordo totalmente", o slider começa sem valor selecionado, um botão "Pular esta pergunta" que registra valor 3 como neutro e avança, um botão "Próxima" que só habilita após o usuário mover o slider e um botão "Voltar" que retorna para a pergunta anterior permitindo alterar a resposta. Após a pergunta 14 navegar para /revisao. Guardar todas as respostas em React state como array de objetos com slug, resposta numérica de 1 a 5 e concordancia derivada onde 1 e 2 é discordo, 3 é neutro e 4 e 5 é concordo.

TELA /revisao: Título "Revise suas respostas" e subtítulo "Você pode alterar qualquer resposta antes de ver os candidatos." Lista de todas as 14 perguntas mostrando o nome do tema, a resposta em texto por extenso e fundo colorido por posição sendo vermelho claro para discordo, cinza para neutro e verde claro para concordo. Botão "Alterar" em cada linha que retorna para aquela pergunta específica no questionário. Contador mostrando "X de 14 temas respondidos, Y pulados". Se menos de 3 respostas não-neutras exibir mensagem "Responda pelo menos mais X pergunta(s) para uma análise mais precisa" com botão "Completar questionário". Botão principal "Ver candidatos alinhados" só ativo com pelo menos 3 respostas não-neutras navegando para /resultado. Botão secundário "Voltar ao questionário".

TELA /resultado: Ao entrar disparar imediatamente chamada POST para a Supabase Edge Function "match-candidatos" passando no body um JSON com estado, municipio, faixa_etaria e o array de respostas. Exibir spinner com texto "Analisando candidatos do seu estado..." enquanto aguarda. Após retorno exibir cabeçalho com "Candidatos mais alinhados com você em [Estado]" e subtítulo "Resultado baseado nas suas X respostas — percentual indica alinhamento temático, não é recomendação de voto." Candidatos agrupados por cargo na ordem presidente, governador, senador, deputado federal e deputado estadual. Cada seção de cargo tem título, descrição curta das atribuições do cargo em texto pequeno e até 5 cards de candidato. Cada card mostra foto ou avatar com inicial do nome, nome em destaque, partido, barra de progresso colorida sendo verde para 80 a 100 por cento, azul para 60 a 79, amarelo para 40 a 59 e cinza abaixo de 40, o percentual em número grande como "87% de alinhamento", seção expansível "Ver detalhes" com temas alinhados em verde com ícone de check e temas divergentes em vermelho com ícone de x, e badge de alerta clicável se houver alertas mostrando titulo, descricao e link para fonte_url. Rodapé da tela com data de atualização e botão "Compartilhar resultado" que usa a Web Share API no mobile e copia o link no desktop com a mensagem "Fiz o questionário do VotoSim e descobri meu perfil político. Faça o seu também: [URL]". Se a Edge Function retornar erro exibir "Não foi possível carregar os candidatos. Tente novamente." com botão de retry. Se não houver candidatos no estado exibir "Ainda não temos candidatos cadastrados para este estado. Volte em breve."

TELA /sobre: Título "Sobre o VotoSim". Quatro seções de texto: "O que é" dizendo que é ferramenta gratuita de informação eleitoral sem indicação de candidatos, "Como funciona" explicando o questionário e o cálculo de alinhamento temático, "De onde vêm os dados" com links clicáveis para dadosabertos.tse.jus.br, divulgacandcontas.tse.jus.br, dadosabertos.camara.gov.br e dadosabertos.senado.leg.br, "Privacidade" explicando que não coleta dados pessoais e não salva respostas. Bloco de disclaimer em destaque com borda azul: "O VotoSim é uma ferramenta de informação. Não somos filiados a partidos políticos, candidatos ou organizações político-partidárias. O percentual de alinhamento é um indicador informativo baseado em dados públicos — não constitui recomendação, sugestão ou indução de voto. A decisão de voto é exclusivamente do eleitor. Esta ferramenta está alinhada à Resolução TSE nº 23.755/2026." Botão "Começar o questionário" navegando para /inicio.

EDGE FUNCTION "match-candidatos": Criar uma Supabase Edge Function em Deno TypeScript que recebe POST com body contendo estado como string de UF, municipio como string, faixa_etaria como string e respostas como array de objetos com slug string, resposta número de 1 a 5 e concordancia string. A função deve buscar no Supabase todos os candidatos do estado via v_candidates_2026_matchable com suas posições via politician_positions e alertas via v_candidate_alerts usando a service role key no secret SERVICE_ROLE_KEY. Montar um JSON estruturado de cada candidato com nome_urna, partido, cargo, array de posicoes com slug posicao e intensidade, array de alertas com tipo severidade titulo descricao e fonte_url. Chamar a API do Gemini Flash na URL https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key= concatenando o valor do secret GEMINI_API_KEY. O prompt enviado ao Gemini deve dizer: você é um assistente de informação eleitoral neutro. Recebeu o perfil de um eleitor com as seguintes respostas ao questionário onde 1 é discordo totalmente e 5 é concordo totalmente, mais a lista de candidatos disponíveis no estado com suas posições documentadas por tema. Calcule um percentual de alinhamento de 0 a 100 para cada candidato comparando as posições do candidato com as respostas do eleitor, dando peso maior para respostas extremas 1 ou 5, considerando a relevância do cargo para cada tema sendo que temas federais como privatização e previdência têm maior peso para presidente deputado federal e senador enquanto temas como segurança pública têm maior peso para governador e deputado estadual. Agrupe por cargo na ordem presidente governador senador deputado_federal deputado_estadual com no máximo 5 candidatos por cargo ordenados do maior para o menor score. Para cada candidato inclua quais slugs de temas alinharam e quais divergiram. Nunca use as expressões vote em, escolha ou recomendo. Retorne apenas JSON válido sem texto adicional com a estrutura: objeto com campo cargos sendo array onde cada item tem campo cargo string e campo candidatos array onde cada candidato tem politician_id string, nome_urna string, partido string, score número inteiro de 0 a 100, temas_alinhados array de strings com slugs, temas_divergentes array de strings com slugs, tem_alertas boolean e alertas array de objetos com tipo severidade titulo descricao e fonte_url. Também incluir campo total_candidatos_analisados número e campo estado string. Configurar timeout de 30 segundos. Se o Gemini retornar erro ou JSON inválido retornar status 500 com mensagem em português "Não foi possível analisar os candidatos. Tente novamente em alguns instantes."
```

---

## O que fazer se o Lovable travar ou fizer perguntas

Se pedir confirmação sobre qualquer decisão técnica, responda: "Pode decidir por conta própria e continuar construindo."

Se uma tela ficar errada, descreva exatamente o problema em uma frase curta, por exemplo: "O slider está começando no valor 3 mas deveria começar sem valor selecionado." Não peça para refazer tudo.

Se regredir uma tela que estava correta, use o botão de histórico do Lovable para voltar ao estado anterior.

---

## Quando os créditos acabarem

Exporte o código para o GitHub via Settings → Git do Lovable. Abra o repositório no Cursor e use os documentos desta pasta como contexto para continuar — especialmente o `README_DOCS.v3.md` para visão geral e o `08_supabase_setup.md` para referência do banco.

---

## Checklist pós-build

```
Telas:
  [ ] /inicio carrega com os três cards e botão CTA
  [ ] /perfil tem os 27 estados no select e botão só habilita com 3 campos preenchidos
  [ ] /questionario carrega as 14 perguntas do Supabase na ordem correta
  [ ] /questionario o slider começa sem valor selecionado
  [ ] /questionario o botão Pular funciona e registra neutro
  [ ] /revisao mostra todas as respostas com cores corretas
  [ ] /revisao bloqueia avançar com menos de 3 respostas não-neutras
  [ ] /resultado dispara a Edge Function ao entrar e mostra spinner
  [ ] /resultado exibe candidatos agrupados por cargo com percentual
  [ ] /sobre tem o disclaimer legal completo
  [ ] Rodapé aparece em todas as páginas
  [ ] Header com barra de progresso aparece apenas no /questionario

Edge Function:
  [ ] Função "match-candidatos" criada e deployada no Supabase
  [ ] Secrets SERVICE_ROLE_KEY e GEMINI_API_KEY configurados
  [ ] Retorna JSON válido com a estrutura de cargos
  [ ] Retorna erro amigável em português em caso de falha
```

---

*Arquivo anterior: `09_lovable_briefing.md`*  
*Próximo arquivo: `10_gemini_prompts.md` — prompts do agente de extração de posições do pipeline de dados*
