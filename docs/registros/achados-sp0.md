# Log de achados do SP-0

> **Status:** válido · **Atualizado em:** 2026-08-24
> **Contexto:** log corrente de anomalias encontradas ao rodar o pipeline
> SP-0 contra dados reais do TSE 2026. As entradas são registradas conforme
> encontradas e deliberadamente NÃO investigadas no momento — ficam
> estacionadas aqui para a execução continuar seguindo o plano. Revisar ao
> final do SP-0 para decidir quais, se alguma, bloqueiam trabalho posterior.
> **Exceção conhecida ao teto de 200 linhas de `docs/referencia/`:** este é
> um log append-only; dividi-lo por tamanho destruiria a cronologia dos
> achados. Ver `docs/referencia/README.md`.

---

## F1 — Números de partido são reaproveitados pelo TSE

**Encontrado:** 2026-08-21, durante a execução do censo presidencial.
**Status:** Resolvido, bloqueante → corrigido.

`parties.numero` carrega uma restrição UNIQUE, na suposição de que um número
de partido identifica um partido permanentemente. O TSE reatribui os números
de partidos extintos ou incorporados a novos partidos. Quatro colisões entre
as linhas de `parties` preservadas de 2022 e o censo de 2026:

| Número | Detentor em 2026 | Detentor em 2022 no banco |
|---|---|---|
| 14 | MISSÃO | PTB |
| 20 | PODE | PSC |
| 33 | MOBILIZA | PMN |
| 35 | DEMOCRATA | PMB |

`PODE` é o caso mais sutil: existia em 2022 com o número 19 e migrou para 20
em 2026, então até um UPDATE por sigla colide com o PSC ainda ocupando o 20.

**Resolução:** deletar de `parties` os seis partidos ausentes do censo de
2026 (PTB, PSC, PMN, PMB, PATRIOTA, PROS) antes de ingerir. Só o PMB carregava
um `espectro` curado, e o valor era `sem_classificacao` — nenhum dado curado
perdido.

---

## F2 — PCdoB aparecia ausente de 2026 até a canonicalização ser aplicada

**Encontrado:** 2026-08-21, ao investigar F1.
**Status:** Não é um defeito. Confirma uma correção já existente.

Uma comparação ingênua de conjuntos listou `PCdoB` entre os partidos
ausentes do censo de 2026. Ele não está ausente: o TSE escreve `PCDOB` em
maiúsculas enquanto o banco de dados guarda `PCdoB`. O mapa
`CANONICAL_PARTY_SPELLING` acrescentado a `normalizeParty` na Task 6 resolve
isso, e o partido mantém o número 65 em ambos.

Vale notar porque a mesma classe de erro deletaria silenciosamente um
partido ativo se qualquer limpeza futura comparar siglas brutas do TSE contra
siglas do banco de dados sem canonicalizar primeiro.

---

## F3 — Plano de governo ausente para um candidato a presidente

**Encontrado:** 2026-08-20.
**Status:** Estacionado. Afeta o SP-1, não o SP-0.

12 dos 13 candidatos a presidente protocolaram plano de governo. Pablo
Marçal (`SQ_CANDIDATO` 280002553884) não tem nenhum em
`proposta_governo_2026_BR.zip`.

O estágio `documentos_oficiais` do agente não pode se completar a partir de
um plano oficial para ele. Precisa de um fallback para outras fontes (site
de campanha, propostas publicadas, entrevistas) ou de uma reconferência
quando o TSE publicar um. Decidir quando o SP-1 for desenhado.

---

## F4 — `motivo_cassacao_2026` é publicado mas está vazio

**Encontrado:** 2026-08-20.
**Status:** Estacionado. Afeta o SP-1.

Todos os 29 arquivos carregam um cabeçalho e zero linhas de dados,
consistente com `DS_SITUACAO_CANDIDATURA` sendo `#NE` em toda candidatura —
o TSE ainda não julgou nada. O estágio `ficha_limpa` do agente ainda não
pode depender deste dataset e precisa alcançar fontes judiciais primárias
diretamente. Rebaixar novamente conforme as decisões chegarem.

---

## F5 — Status de candidatura é uniformemente não julgado

**Encontrado:** 2026-08-20.
**Status:** Estacionado. Operacional, não um defeito.

Toda candidatura de 2026 carrega `DS_SITUACAO_CANDIDATURA = '#NE'`, então
toda linha entra como `registrado`. Decisões de indeferimento e cassação
chegam nas próximas semanas e exigem reingestão periódica de
`consulta_cand_2026.zip` para atualizar o status. Ainda não existe job
agendado para isso.

---

## F6 — `_BRASIL.csv` é uma consolidação nacional em todo dataset do TSE

**Encontrado:** 2026-08-21, duas vezes — primeiro no censo, depois nas
contas sociais.
**Status:** Resolvido nos dois lugares.

Todo dataset em lote do TSE traz um CSV por unidade eleitoral **mais** um
`_BRASIL.csv` que é a união exata dos outros. Verificado por contagem de
linhas em dois datasets independentemente:

| Dataset | `_BRASIL.csv` | Soma do resto |
|---|---|---|
| `consulta_cand_2026` | 20.674 | 20.674 |
| `rede_social_candidato_2026` | 49.302 | 49.302 |

Qualquer código que itere todo `.csv` em um desses diretórios lê todo
registro duas vezes. No censo isso foi pego antes de rodar. No construtor de
briefs, chegou a produção, e os briefs gerados listavam cada conta social
declarada duas vezes.

**A armadilha é que a duplicação parece um problema de qualidade dos dados
na fonte.** Nas duas vezes, o primeiro diagnóstico foi "o TSE está enviando
duplicatas". Não está — nós lemos as mesmas linhas de dois arquivos.

**Regra daqui em diante:** ou leia só `_BRASIL.csv`, ou itere os arquivos
por unidade e pule esse. Nunca os dois. Onde a unidade eleitoral do registro
é conhecida (o `estado` de um candidato), ler o único arquivo correspondente
é estritamente melhor — também é ~29x menos I/O.

---

## F7 — Planos de governo em múltiplas partes não são tratados

**Encontrado:** 2026-08-21, durante a revisão da Task 3.
**Status:** Estacionado. Nenhuma ocorrência nos dados atuais.

Os nomes de arquivo de plano do TSE carregam um sufixo de parte (`_01`,
`_02`, …). `findPlanPath` retorna só a primeira correspondência, então um
plano dividido em partes seria lido parcialmente, em silêncio. Todos os 12
planos presidenciais no pacote atual usam exclusivamente `_01`, então nada
é afetado hoje.

Verificar antes de escalar para os 197 planos de governador: se algum
carregar `_02` ou superior, as partes precisam ser concatenadas em ordem em
vez de só a primeira ser lida.

---

## F8 — Alguns planos de governo extraem com embaralhamento de palavras a nível de caractere, não vazios

**Encontrado:** 2026-08-22, pesquisando Edmilson Costa (PCB, 280002551975).
**Status:** Estacionado. Contornado por candidato via busca externa; não
corrigido no código.

O guarda de vazio de `extractPdfText` (acrescentado depois que a revisão do
SP-1 encontrou `""` resolvido silenciosamente para PDFs só-imagem) captura
um resultado em branco, mas não um **não vazio, em ordem errada**. O plano
de Edmilson Costa extrai como texto contínuo embaralhado — ordem de palavras
e até de caracteres embaralhada por todo o documento, ex.:
`"posooscdpieerrodbapldoeepmuablasurdrgeausdemesmaa"` — amostrado em cinco
pontos ao longo do arquivo, uniformemente corrompido, não um defeito parcial.
Os planos de Lula e de Clariana Barão extraíram limpos pelo mesmo pipeline,
então isso é específico de como este PDF codifica seu fluxo de texto
(provavelmente um gerador/layout diferente), não uma falha sistêmica do
pdf2json — mas nada hoje detecta isso.

**Consequência:** um agente ingênuo lendo este brief ou fabricaria posições
a partir de fragmentos mal lidos, ou silenciosamente pularia conteúdo real.
Nenhuma das duas é aceitável pelas regras de honestidade.

**Contorno usado:** tratado como equivalente a um plano ausente para os fins
da E1 — declarado explicitamente no dossiê que o plano protocolado não pôde
ser lido, e usada reportagem externa sobre a plataforma do partido em vez
disso, mesma postura da regra de `docs/procedimentos/pesquisa-de-candidato.md`
para um plano ausente.

**Não corrigido:** detectar extração embaralhada-mas-não-vazia (ex.: uma
heurística de proporção de palavras de dicionário no texto limpo) é uma
lacuna real que vale a pena fechar antes de escalar para os 197 planos de
governador, mas está fora do escopo do piloto em si.

**Atualização 2026-08-23:** o mesmo embaralhamento classe F8 apareceu na
cartilha do Podemos *Podemos Pensar Diferente* (Fundação Podemos, 2021),
lida para GERALDO RUFINO (250002544673). A resposta em nível de piloto não
foi auto-detecção, mas **honestidade**: o dado de posição foi lido a partir
de vocabulário preservado com confiança moderada, e essa ressalva agora é
um cidadão de primeira classe do schema. `source_tipo` ganhou
`plataforma_partidaria` e `biografia` (uma plataforma partidária não é um
`plano_governo`, e uma notícia também não é), e `alert_type` ganhou
`ressalva_evidencias` — um sinal de transparência que o agente anexa ao
candidato para que o leitor veja que as posições foram inferidas de uma
plataforma partidária e/ou de uma extração degradada. É publicado
automaticamente (a Regra B é estendida para ele) e renderiza com o selo
`amarelo`. Ver docs/referencia/schema-adicoes-sp0.md.

**Atualização 2026-08-23:** `pdftotext -layout` (Poppler, já instalado)
recupera de forma confiável esta classe de embaralhamento onde `pdf2json`
(o que `extractPdfText` usa) não recupera. Confirmado diretamente no plano
de Douglas Ruas (280002542887... governador RJ, sequencial 190002542887):
`pdftotext -layout` no mesmo PDF de origem extraiu de forma limpa, ordem das
frases intacta, enquanto o brief construído a partir de `extractPdfText`
estava embaralhado por inteiro. Mais cinco planos de governador do RJ no
mesmo lote (Cyro Garcia, Juliete, Luan Monteiro, Coronel Busnello, William
Siri) mostraram a variante mais branda de reordenação em blocos do mesmo
defeito — vocabulário intacto, ordem de parágrafo/linha não — e ainda eram
legíveis contornando a reordenação em vez de precisar do fallback do
Poppler. `extractPdfText` em si não foi alterado; cada agente de pesquisa
leu o plano afetado por cabeçalhos de seção ou, no caso de Douglas Ruas,
reextraindo diretamente com `pdftotext -layout`, e registrou um alerta
`ressalva_evidencias` só onde a variante mais branda deixou ambiguidade
real. Trocar `extractPdfText` para tentar `pdftotext -layout` antes do
`pdf2json`, ou como fallback quando o guarda de vazio/embaralhamento
disparar, vale a pena fazer antes de escalar além do piloto do RJ — não
feito aqui porque toca o caminho de extração compartilhado do qual todos os
candidatos em andamento dependem.

---

## F9 — Um plano protocolado perto do prazo pode estar ausente do export local do TSE

**Encontrado:** 2026-08-22, pesquisando Pablo Marçal (PRTB, 280002553884).
**Status:** Estacionado. Contornado via cobertura de imprensa do plano
protocolado; não corrigido no código.

`build-brief.ts` reportou `plan: NONE FILED` para este candidato, com fonte
no snapshot local em cache de `proposta_governo_2026_BR.zip`. Cobertura de
imprensa (SBT News, datada de 2026-08-18, buscada e lida integralmente de
forma independente) reporta que Marçal protocolou um plano de governo de 28
páginas e sete "missões" no TSE em 2026-08-18 — depois de qualquer data em
que o snapshot local do zip foi puxado. Então "NONE FILED" no brief
significa "nenhum neste snapshot", não "o candidato genuinamente não
protocolou nada", e os dois não são distinguíveis só a partir do brief.

**Consequência:** para um candidato que protocolou tarde, um agente que
confia no "NONE FILED" do brief ao pé da letra subestima a evidência
disponível e pode pular uma fonte `plano_governo` real e citável em favor de
cobertura de imprensa geral mais fraca.

**Contorno usado:** tratado o plano como ausente para a E1 deste candidato,
pela regra padrão para planos ausentes, e construídas posições a partir de
cobertura de imprensa verificada separadamente sobre o protocolo real de
2026 (com veículo/data checados candidato a candidato, já que essa mesma
busca trouxe propostas das campanhas de 2018, 2022 e 2024 de Marçal
rotuladas erroneamente como 2026 por pelo menos um resultado de busca
resumido por IA — pego só ao buscar a matéria original diretamente).

**Não corrigido:** rebaixar `proposta_governo_2026_BR.zip` em uma cadência
que acompanhe o próprio prazo de protocolo do TSE (ou reconferir por
candidato antes de concluir "sem plano") vale a pena fazer antes de escalar
além do piloto presidencial, mas está fora do escopo aqui.

---

## F10 — `findPlanPath` lia só o primeiro arquivo de um plano em múltiplas partes

**Encontrado:** 2026-08-22, pesquisando Vivian Mendes (UP, governador/SP,
250002544912).
**Status:** Corrigido — `findPlanPath` (build-brief.ts) agora lê toda parte.

O TSE divide um plano de governo em vários arquivos quando é grande o
suficiente (`{ano}{UF}{SQ_CANDIDATO}_{NN}.pdf`, `_01`, `_02`, `_03`...).
`findPlanPath` usava `Array.find()` contra um padrão que batia com qualquer
número de parte, então sempre retornava a primeira correspondência de regex
na ordem do diretório — para este candidato, `_01.pdf` (2,0 MB) enquanto
ignorava silenciosamente `_02.pdf` (305 KB) e `_03.pdf` (2,0 MB), ou seja,
aproximadamente dois terços do documento efetivamente protocolado.

**Consequência:** todo candidato cujo plano foi dividido em várias partes
(não só este — qualquer plano grande que o TSE divida) teve um brief
construído a partir de uma fração do que de fato protocolou, sem nenhum
sinal de que algo estava faltando — o brief parecia completo porque um
plano foi encontrado.

**Corrigido:** acrescentado `findPlanPaths` (plural), que casa e retorna
toda parte ordenada por número de parte; `findPlanPath` agora é um wrapper
fino que retorna a primeira para quem só precisa de uma. `main()` de
`build-brief.ts` agora extrai texto de toda parte e as junta, e o log do
console imprime todo caminho encontrado em vez de um só. Coberto pela suíte
existente `build-brief.test.ts` (os 12 testes continuam passando) — nenhum
teste novo foi acrescentado especificamente para a junção multi-parte, já
que a correção é uma mudança pequena e diretamente inspecionável, e os
testes existentes de parte única já fixam o comportamento retrocompatível de
`findPlanPath`.

**Nota de escopo:** candidatos já ingeridos anteriormente neste piloto
tinham planos de parte única (verificado: nenhuma das resoluções de
`findPlanPath` deles atingiu `_02` ou superior) — este bug não corrompeu
silenciosamente pesquisa já publicada. Reverificar esta suposição antes de
confiar nela para o piloto de governador em geral, em vez de rederivá-la de
memória depois.

---

## F11 — O comando `unzip` documentado coloca os dados do TSE onde nada os lê

**Encontrado:** 2026-08-22, preparando o pacote de colaboração para cargos
legislativos.
**Status:** Corrigido — `download-tse.ts` agora imprime os comandos
corretos; README corrigido.

Tanto a dica final de `download-tse.ts` quanto o README de handoff
instruíam:

```
unzip -o 'data/tse-2026/*.zip' -d data/tse-2026/extracted
```

Isso está errado para **ambos** os formatos de pacote que o TSE publica:

| Pacote | Contém | Cai em | `build-brief.ts` lê |
|---|---|---|---|
| `proposta_governo_2026_{UF}.zip` | `{UF}/*.pdf` | `extracted/{UF}/` | `extracted/planos/{UF}/` |
| `rede_social_candidato_2026.zip` | `*.csv` plano | `extracted/*.csv` | `extracted/rede_social_candidato_2026/` |

**Consequência — e esta é a parte perigosa — ambas as falhas são
silenciosas.** Com os planos na pasta errada, `build-brief` reporta
`NONE FILED` para todo candidato e renderiza o parágrafo "este candidato não
protocolou plano de governo", que se lê como um fato sobre o candidato em
vez de uma configuração errada. Um agente seguindo as regras de honestidade
corretamente escreveria então "não protocolou plano de governo" em um
dossiê real voltado ao eleitor para alguém que de fato protocolou um. Com os
CSVs sociais na pasta errada, `loadSocialAccounts` retorna `[]` e o brief
diz "nenhuma declarada ao TSE" — mesma classe de afirmação falsa.

Eu mesmo caí nisso extraindo o pacote de SP e corrigi na mão na hora sem
perceber que o comando documentado era a origem, exatamente como um bug de
falha silenciosa sobrevive: quem tropeça nele conserta o sintoma
localmente e a instrução continua quebrada para todo mundo.

**Corrigido:** `download-tse.ts` agora imprime dois comandos distintos
(planos em `extracted/planos`, cada dataset nacional em sua própria pasta
nomeada) mais uma linha explícita nomeando os dois diretórios que
`build-brief.ts` de fato lê, para que o operador possa verificar em vez de
supor. O README de handoff carrega os mesmos comandos corrigidos e um passo
de verificação.

**Também corrigido (mesma sessão):** `build-brief.ts` agora distingue as
quatro causas de "nenhum plano encontrado" em vez de colapsá-las em
`NONE FILED`, via uma `diagnosePlanAvailability()` pura:

| Diagnóstico | Quando | Comportamento |
|---|---|---|
| `found` | um plano (ou toda parte) localizado | prossegue |
| `not_expected` | cargo é senador/deputado_* | prossegue — o TSE não exige plano |
| `genuinely_absent` | executivo, os planos desta UF estão em disco, nenhum para este candidato | prossegue (o caso F9) |
| `uf_not_downloaded` | executivo, planos existem mas nenhum para esta UF | **aborta, exit 1** |
| `misconfigured` | executivo, `PLANS_DIR` vazio ou ausente | **aborta, exit 1** |

Os dois caminhos de aborto imprimem o comando exato para corrigir, e o
caminho `misconfigured` sonda especificamente pela assinatura de F11 — se
os planos estão em `extracted/{UF}/`, ele diz isso e imprime o `mv`. Abortar
em vez de avisar é deliberado: um aviso passa despercebido rolando na tela,
e o custo de perdê-lo é uma afirmação falsa sobre um candidato real em um
dossiê voltado ao eleitor.

`not_expected` é avaliado *antes* dos ramos de configuração errada, então um
brief de senador ou deputado nunca aborta só porque nenhum plano executivo
foi baixado — verificado contra um senador real (ANDRÉ DO PRADO, exit 0) e
simulando F11 contra um governador real (exit 1, `mv` correto emitido).
Coberto por 7 testes novos em `build-brief.test.ts`; a suíte está em
224/224.

`FILES_GOVERNMENT_PLAN` foi movido para um export em `lib/ledger.ts` para
que a regra `nao_aplicavel` do ledger e a regra `not_expected` do brief não
possam divergir.

---

## F12 — Os domínios web/CDN do TSE são bloqueados pela Akamai neste ambiente, mas a API REST da DivulgaCandContas não é

**Encontrado:** 2026-08-23, durante o lote de governador do RJ (todos os
nove agentes).
**Status:** Não é um defeito no pipeline. Restrição de ambiente, contornada
por agente.

`cdn.tse.jus.br` e a SPA de `divulgacandcontas.tse.jus.br` retornam ambos
HTTP 403 para toda chamada de `curl` e `WebFetch` a partir deste ambiente
(proteção anti-bot da Akamai) — nenhum agente de pesquisa no lote conseguiu
abrir uma URL de plano de governo diretamente, nem navegar pela página de um
candidato na DivulgaCandContas como um humano faria. Todo agente citou em
vez disso a URL do pacote ZIP (`proposta_governo_2026_{UF}.zip`) como a
fonte `plano_governo`, já que esse é o arquivo real que `build-brief` leu —
essa agora é a convenção em todo JSON de pesquisa produzido até aqui,
governador e presidencial igualmente.

**A API REST é uma história diferente.** Os agentes de Garotinho e de
Eduardo Paes precisaram estabelecer, de fato, se um candidato ao Executivo
havia protocolado algum plano (a pergunta de F9) em vez de confiar na
possível defasagem do snapshot local do ZIP. Ambos consultaram
`divulgacandcontas.tse.jus.br/divulga/rest/...` diretamente e obtiveram uma
resposta JSON real — o registro de Garotinho listava três arquivos de
certidão judicial e nenhum `codTipo 5` (proposta de governo), enquanto uma
checagem de controle contra outros candidatos na mesma corrida confirmou que
a API de fato mostra `codTipo 5` quando um plano existe. Então o endpoint da
API em si é alcançável; só a SPA voltada ao navegador e o host de arquivos
estáticos do CDN é que estão bloqueados.

**Consequência:** um agente que só tenta a SPA ou o CDN e desiste depois de
um 403 vai tratar "não consegui checar" como equivalente a "nenhum plano foi
protocolado" — as duas coisas não são a mesma, e F9 existe precisamente
porque uma ausência real e uma lacuna de snapshot são fáceis de confundir. A
API REST é o jeito de distingui-las quando o ZIP local é inconclusivo.

**Não corrigido:** nada a corrigir no código — isto é uma propriedade de
rede do ambiente, não um bug do pipeline. Vale carregar adiante como
instrução para futuros agentes de pesquisa: não parar em um 403 do CDN/SPA
quando a pergunta é "este candidato protocolou um plano" — a API REST é o
jeito de de fato responder isso.

---

## F13 — O pacote `proposta_governo` de uma UF pode guardar planos de candidatos diferentes do cargo sendo pesquisado

**Encontrado:** 2026-08-23, verificando o plano ausente de André Marinho
(governador, RJ) antes de tratar "NONE FILED" como fato.

**Status:** Não é um defeito. Confirma que o casamento por `SQ_CANDIDATO`
por candidato existente de `build-brief` já trata isso corretamente;
registrado porque um humano folheando a pasta extraída chegaria à conclusão
errada.

`proposta_governo_2026_RJ.zip` extrai para nove arquivos PDF, mas o RJ tem
nove candidatos a *governador* e, separadamente, o equivalente a um décimo
arquivo de conteúdo não relacionado: um dos nove arquivos em disco
(`2026RJ190002543534_01.pdf`) pertence a SILVIA QUEZADO, uma candidata a
**deputada estadual**, não a nenhum dos nove candidatos a governador.
`proposta_governo` é protocolado por candidatura, para qualquer cargo que o
exija naquela UF, não restrito a um único cargo — um plano de deputado
estadual e um plano de governador caem no mesmo pacote se ambos foram
protocolados no mesmo estado e eleição.

**Consequência:** contar arquivos na pasta extraída contra uma lista de
candidatos a governador não vai reconciliar 1:1, e escolher "o arquivo que
sobrou" para preencher uma lacuna (ex.: supondo que pertence a qualquer
candidato a governador que não tenha correspondência) atribuiria
silenciosamente a plataforma de um candidato a uma pessoa diferente. Isso
foi checado e descartado especificamente antes de concluir que EDUARDO PAES
e GAROTINHO genuinamente não protocolaram nenhum plano — ver F9 e F12.

**Não corrigido — nada a corrigir:** `build-brief.ts` já casa por
`SQ_CANDIDATO` embutido no nome do arquivo via `findPlanPaths`, não por
contagem nem por posição na pasta, então isso nunca produziu uma
correspondência errada no próprio pipeline. O risco existe puramente no
nível humano/operador ao olhar `ls extracted/planos/{UF}/` e supor que
contagem de arquivos == contagem de candidatos.

---

## F14 — O orçamento de `WebSearch` da sessão é compartilhado entre agentes de pesquisa paralelos e pode se esgotar no meio de um lote

**Encontrado:** 2026-08-23, durante o lote de governador de MG (11 agentes
disparados em paralelo).
**Status:** Não é um defeito no pipeline. Restrição de ambiente/ferramenta;
cobertura de E2/E3 degradada para vários candidatos, revelada em vez de
escondida.

`WebSearch` carrega um orçamento de chamadas por sessão (200), não um por
agente. Com 11 agentes de pesquisa rodando concorrentemente contra um lote
de MG, o orçamento se esgotou no meio do caminho — confirmado por pelo
menos seis agentes independentemente reportando `WebSearch` retornando um
estado de orçamento esgotado (200/200) antes ou durante seus estágios de E2
(ficha limpa) e E3 (notícias): ALEXANDRE KALIL, GABRIEL, PROFESSOR TÚLIO
LOPES, RAFAEL DUDA, PATRUS ANANIAS, BEN MENDES. Agentes anteriores no mesmo
disparo (HENRIQUE ÁREAS, CLEITINHO AZEVEDO, FLÁVIO ROSCOE) bateram na mesma
parede no meio da sessão em vez de nunca.

**Consequência:** para todo candidato acima, a busca judicial por nome da
E2 não pôde ser rodada como uma busca web real assim que o orçamento
acabou — cada agente recorreu a `WebFetch` contra URLs específicas
conhecidas/alcançáveis em vez disso (Wikipédia, domínios de imprensa,
portais oficiais onde alcançáveis), o que encontra o que já tem uma URL mas
não descobre um fato que ainda não suspeita existir. Isso é uma checagem
materialmente mais fraca do que o procedimento pressupõe, e atingiu dois dos
candidatos de perfil mais alto no lote: ALEXANDRE KALIL (ex-prefeito de Belo
Horizonte por dois mandatos) e PATRUS ANANIAS (deputado federal, duas vezes
ministro federal) passaram os dois por este pipeline **sem nenhuma busca
judicial/de antecedentes real realizada** — não "confirmado limpo", mas
"não pôde ser checado nesta sessão". Os dois dossiês declaram isso
explicitamente (`resumoPerfil`/`coerenciaBase`/um alerta
`ressalva_evidencias` onde aplicável) em vez de deixar a ausência de um
alerta `ficha_suja` ser lida como um registro limpo. Nenhum agente fabricou
um resultado de busca nem afirmou um registro limpo a partir do estado de
orçamento esgotado — as regras de honestidade se sustentaram sob a
restrição — mas a lacuna de cobertura é real e vale a pena fechar antes de
escalar mais.

**Não corrigido:** nada a corrigir no pipeline em si — a disponibilidade de
`WebSearch` é uma propriedade do runtime em que os agentes rodam, não de
`candidate-research-procedure.md` ou do contrato de ingestão. Duas
mitigações valem consideração antes do próximo lote paralelo grande: (a)
disparar menos agentes de pesquisa concorrentemente, ou escaloná-los, para
que o orçamento compartilhado não seja dividido em 11 numa mesma janela; (b)
para um candidato em que o orçamento é sabidamente esgotado, preferir
`WebFetch` contra a página de resultado de um motor de busca específico
(onde alcançável) a desistir da E2 por completo — vários agentes neste lote
fizeram exatamente isso como contorno e funcionou parcialmente. Rerodar a E2
especificamente para KALIL e PATRUS ANANIAS com um orçamento fresco vale a
pena antes de qualquer um dos dois dossiês ser tratado como completo.

**Atualização 2026-08-24 — o mecanismo agora está identificado, e o
orçamento não reseta entre lotes.** O lote seguinte exato (7 agentes de
governador do PA, disparados como uma nova tarefa de operador logo depois
que MG terminou) começou com o orçamento já em 0/200 — pelo menos três
agentes (JOSÉ MOITA, ARACELI, WELL MACEDO) reportaram `WebSearch` falhando
já na primeira chamada. O operador confirmou isso diretamente, fora de
qualquer agente de pesquisa, chamando `WebSearch` na sessão de nível
superior: ele retornou

> `Web search was not performed: this session has used its web search
> budget (200 of 200 WebSearch calls). Continue with the information
> already gathered instead of issuing more searches. If more searches are
> genuinely needed, ask the user to raise
> CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION.`

Então: o teto é **200 chamadas por sessão do Claude Code, cumulativo ao
longo de todo turno e todo subagente pela vida daquela sessão** — não por
lote, por disparo, ou por agente, e não há reset observado enquanto a
sessão roda. É controlado pela variável de ambiente
`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` (não definida neste ambiente,
então o padrão de 200 se aplicou). **Não pode ser elevado de dentro de uma
sessão em execução** — o operador tentou `export
CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION=2000` via a ferramenta Bash e
imediatamente chamou `WebSearch` de novo; ainda reportou 200/200,
confirmando que a variável é lida uma vez na inicialização do processo pai
do Claude Code, não sondada a cada chamada, então um `export` de subshell
nunca a alcança. A única correção real é definir a variável no shell
**antes** de lançar a próxima sessão (`export
CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION=<N>`, ou em `~/.bashrc`/`~/.zshrc`
para torná-la permanente).

**Um substituto funcional, sem custo de orçamento, foi encontrado e usado
com sucesso duas vezes** (reforçando HANA GHASSAN e ARACELI, ambas
candidatas a governador do PA, 2026-08-24): buscar
`https://news.google.com/rss/search?q=<query>&hl=pt-BR&gl=BR&ceid=BR:pt-419`
via `WebFetch` é uma requisição HTTP simples — não toca a ferramenta
`WebSearch` nem seu orçamento de forma alguma, e retorna resultados de
imprensa reais, datados e com fonte. Recuperou achados genuínos de E2/E3
para as duas candidatas nesta sessão (incluindo uma `polemica` compatível
com D9 para HANA GHASSAN — uma multa do TRE-PA por propaganda antecipada de
campanha — encontrada por consultas de nome e tópico por essa via) depois
que a primeira passada bloqueada pelo orçamento havia produzido quase nada.
Corpos de matéria individuais atrás dos links de redirecionamento do Google
não são acessíveis por fetch (redirecionamento client-side em JS, não
HTTP), mas os metadados de título/veículo/data/link do item RSS já são um
fato utilizável e citável. Este agora é o fallback padrão a usar assim que
`WebSearch` reportar esgotado, antes de tentar adivinhar o próprio endpoint
de busca de um site alvo.

---

## F15 — `.jus.br` foi bloqueado por completo em uma sessão, não só o subconjunto de CDN/SPA que F12 descreve

**Encontrado:** 2026-08-23, pesquisando BEN MENDES (MISSÃO, governador, MG,
130002544411).
**Status:** Estacionado — observado uma vez, ainda não confirmado como um
padrão estável. Registrado para que uma repetição seja reconhecida em vez de
redescoberta do zero.

F12 (2026-08-22) documentou `cdn.tse.jus.br` e
`divulgacandcontas.tse.jus.br` retornando HTTP 403 a partir deste ambiente,
com a API REST da DivulgaCandContas como alternativa funcional. Nesta
sessão, o agente pesquisando BEN MENDES reportou um bloqueio mais amplo:
`divulgacandcontas.tse.jus.br`, `dadosabertos.tse.jus.br`,
`www.tse.jus.br` e `tre-mg.jus.br` retornaram 403 em toda variante de
endpoint tentada, inclusive o caminho da API REST em que F12 se apoia como
contorno. Nenhum outro agente no mesmo lote de MG reportou isso — o agente
de PATRUS ANANIAS, rodando concorrentemente, confirmou separadamente o
padrão mais estreito de F12 (bloqueio Akamai em
`divulgacandcontas.tse.jus.br` e `tse.jus.br`, mais um bloqueio de WAF em
`contas.tcu.gov.br`) sem descrever um bloqueio de `.jus.br` por completo.

**Consequência:** se isso for um bloqueio real e mais amplo em vez de um
evento isolado (rate-limiting disparado pelo próprio tráfego concorrente do
lote contra domínios do TSE, uma regra de WAF transitória, ou ruído), então
o contorno via API REST de F12 para confirmar um plano de governo
genuinamente ausente não pode ser presumido confiável — um agente precisa
de um segundo jeito, independente, de corroborar "nenhum plano protocolado"
(cobertura de imprensa, como o agente de BEN MENDES usou) em vez de tratar
um 403 no endpoint REST como decisivo em qualquer direção.

**Não corrigido — ainda não acionável:** uma observação de um agente em uma
sessão não é suficiente para mudar a orientação de F12. Vale revisitar esta
entrada se o caminho REST de `divulgacandcontas.tse.jus.br` der 403 de novo
em uma sessão futura; se recorrer, a correção provavelmente é parar de
tratar a API REST como confiavelmente alcançável e recorrer à corroboração
por imprensa por padrão para a pergunta de F9 (ausência de plano), do jeito
que o dossiê de BEN MENDES já fez.

**Atualização 2026-08-24 — não é mais um evento isolado; confirmado
recorrente no lote de governador do PA.** Pelo menos seis dos sete agentes
do PA bateram independentemente no mesmo 403 de `.jus.br` por completo
nesta sessão (`tse.jus.br`, `divulgacandcontas.tse.jus.br`, `tre-pa.jus.br`,
`stj.jus.br`, `stf.jus.br` — todo host `.jus.br` que qualquer um deles
tentou): ARACELI, CLEBER RABELO, DR. DANIEL, GAL LEITE, HANA GHASSAN, JOSÉ
MOITA, WELL MACEDO. O operador reproduziu isso independentemente, fora de
qualquer agente de pesquisa, com um `curl` direto:

```
curl https://www.tse.jus.br                       → 403
curl https://divulgacandcontas.tse.jus.br/...      → 403
```

**O bloqueio é restrito a `.jus.br` especificamente, não a "domínios
oficiais" em geral.** No mesmo teste direto, `curl
https://www.mppa.mp.br` (Ministério Público do Pará, um domínio `.mp.br`)
retornou `200` — alcançável, só sem capacidade útil de
consulta/busca, que é uma limitação separada de estar totalmente
bloqueado. Nos dois lotes, MG e PA, domínios `.leg.br`
(`dadosabertos.camara.leg.br`, `legis.senado.leg.br`,
`aplicnt.camara.rj.gov.br`, `cmbh.mg.gov.br`) e a maioria dos portais
estaduais `.gov.br` continuaram alcançáveis e foram usados com sucesso como
evidência de E4a/E4b o tempo todo. Então "um domínio oficial dá 403" não
deve mais ser lido como "toda a classe de domínios oficiais está fora do
ar" — verifique se o host específico está sob `.jus.br` antes de concluir
isso.

Um agente do lote de MG (PATRUS ANANIAS, 2026-08-23) reportou só o padrão
mais estreito de F12 na mesma sessão em que o agente de BEN MENDES viu o
bloqueio completo — então o bloqueio não é perfeitamente determinístico
mesmo dentro de uma sessão, e sua causa (uma regra Akamai/WAF mais ampla,
rate-limiting em nível de sessão disparado por agentes concorrentes martelando
os mesmos domínios, ou outra coisa) ainda não está confirmada. O que mudou é
a confiança de que isso se repete: isto não é mais "observado uma vez", é o
resultado típico para um domínio `.jus.br` neste ambiente a partir de
2026-08-24, não a exceção. Trate o contorno via API REST de F12 como não
confiável por padrão e lidere com corroboração de imprensa independente
(ver a técnica de RSS do Google News de F14) para qualquer coisa que F12 ou
F9 resolveria de outra forma via TSE.
