# VotoSim — Procedimento de pesquisa de candidato

> **Status:** válido · **Atualizado em:** 2026-08-24 20:45
> **Contexto:** este é o procedimento que um agente de pesquisa segue para
> transformar o brief de um candidato (produzido por `modules/ingest-candidates/src/comandos/build-brief.ts`)
> em um documento JSON de pesquisa validado (o formato definido por
> `modules/ingest-candidates/src/lib/research-contract.ts`). Todo documento que o agente produz é
> verificado por `validateResearch()` antes de qualquer gravação no banco —
> um documento que falha na validação é rejeitado por completo, e nada é
> persistido. Leitor: um agente de pesquisa (Claude Code). Leia isto antes de
> rodar o agente de pesquisa por candidato, e antes de alterar o formato do
> brief, o contrato, ou o pipeline de ingestão.

---

**Regra de idioma:** toda string voltada ao eleitor na saída — `dossie.resumoPerfil`,
a `justificativa` de cada posição, e o `titulo` e a `descricao` de cada alerta — é
escrita em **português do Brasil (pt-BR)**. Nomes de campo, valores de enum, slugs
de tema e URLs permanecem exatamente como o contrato os define; só o texto legível
por humanos muda. Essas strings são exibidas diretamente a eleitores brasileiros.

---

## 1. Os cinco estágios

O agente roda em uma única passagem, nesta ordem, acumulando contexto conforme
avança. Nada aqui é uma invocação separada — estágios posteriores dependem do
que os estágios anteriores já mantêm em contexto.

### E1 — Ler material oficial

**Produz:** Prioridades declaradas, estruturadas — a própria plataforma
declarada pelo candidato, extraída do plano de governo (quando um foi
protocolado) e de outro material oficial presente no brief. `dossie.resumoPerfil`
também declara **cargos eletivos e mandatos anteriores**, não só a plataforma
atual — um ex-presidente concorrendo novamente é descrito como ex-presidente.
Uma biografia que começa com "concorre à reeleição" e nunca diz o que veio
antes está incompleta.

**Não pode:** pontuar intensidade, confiança ou coerência ainda — isso é
trabalho de E5 e E4. Não pode tirar conclusões sobre coerência com a conduta;
E1 só registra o que o candidato diz sobre si mesmo. Não pode fabricar conteúdo
para um plano de governo ausente — um plano ausente é declarado como ausente,
nunca contornado.

**Só `presidente` e `governador` protocolam plano de governo no TSE.** Para
`senador`, `deputado_federal` e `deputado_estadual` o brief sempre dirá que
nenhum plano foi protocolado, e o ledger já marca o estágio `documentos_oficiais`
deles como `nao_aplicavel`. Este é o caso esperado, **não** uma anomalia — não
registre isso como achado, e não trate como evidência de nada sobre o
candidato. Para esses cargos, o material oficial da E1 é, em vez disso: as
contas de campanha declaradas pelo candidato (no brief), a plataforma
publicada pelo partido dele e — para um titular do cargo ou ex-legislador —
os próprios projetos de lei e o histórico de votações nominais dele (ver E4a
abaixo), que é evidência bem mais forte de prioridades declaradas do que
qualquer documento de plano seria. No contrato de saída, um documento de
plataforma partidária é tipado `fontes[].tipo = "plataforma_partidaria"` e um
perfil biográfico `"biografia"` — nunca `"noticia"`, e nunca `"plano_governo"`,
que é reservado para um plano de governo real do TSE.

### E2 — Ficha limpa / judicial

**Produz:** alertas `ficha_suja` e `investigacao`, com fonte primária vinda
apenas da camada 1 (TSE, STF, STJ, TCU, MPF e órgãos oficiais equivalentes).

**Não pode:** recorrer a cobertura jornalística ou checagem de fatos para
esses dois tipos de alerta — eles existem especificamente porque carregam o
peso de um registro oficial, e diluir isso com fonte secundária deturparia
essa certeza. Não pode se apoiar em boato, redes sociais ou agregadores não
oficiais. **Não pode se apoiar em conhecimento de base em vez de uma busca.**
Rode uma consulta nomeando o candidato especificamente para histórico
judicial/criminal — uma busca genérica por "ficha limpa 2026" que retorna
resultados sobre *outros* candidatos não é evidência de que este candidato
não tem nada; é evidência de que a consulta não os trouxe à tona. Um fato
lembrado dos dados de treinamento sem citação não pertence à E2, resolvido
ou não — este estágio existe precisamente para que afirmações sobre o
registro de uma pessoa real nunca sejam feitas de memória.

**Um caso resolvido não é um caso ausente.** Uma condenação depois anulada,
um processo arquivado, uma absolvição — esses continuam sendo eventos reais,
e a Regra D de `docs/legado/base/04_schema_alerts.md` exige que fiquem
registrados, não omitidos: "o alerta não é deletado — apenas ativo = false e
resolução preenchida." Busque por eles, cite-os e preencha `resolucao` (o que
aconteceu) e `dataResolucao` (quando, se conhecido) no alerta. Não represente
um caso resolvido como se nunca tivesse ocorrido, e não o represente como uma
desqualificação ativa tampouco — as duas coisas são falsas. Ver seção 6.1 para
o formato do campo; um alerta resolvido nunca é publicado automaticamente
independentemente da camada da fonte, já que o selo "sem necessidade de
revisão" da Regra B significa que a desqualificação é atual.

> **Incidente registrado (2026-08-22):** uma primeira passada sobre LULA
> (280002542548) produziu um dossiê que não declarava nem que ele havia
> cumprido dois mandatos presidenciais anteriores, nem que sua condenação de
> 2018 — depois anulada pelo STF em 2021 — jamais aconteceu. A omissão dos
> mandatos anteriores foi uma lacuna simples de E1. A omissão da condenação
> foi pior: E2 buscou apenas "ficha limpa 2026" de forma genérica, o que
> trouxe disputas de outros candidatos, e a ausência de resultado foi lida
> como "nada a relatar" em vez de motivo para buscar o histórico deste
> candidato especificamente, pelo nome. As duas correções acima existem por
> causa deste incidente.

### E3 — Pesquisa de notícias

**Produz:** eventos datados, cada um com uma fonte e uma URL — o material bruto
que E4 e E5 vão interpretar depois.

**Não pode:** tirar conclusões entre eventos ainda, e não pode citar fontes
excluídas (blogs partidários, sites sem expediente editorial, agregadores,
redes sociais como fonte primária de fato). Uma única fonte não primária,
isoladamente, ainda não é um fato para os fins da D9 — esse julgamento
pertence à construção de alertas da E5.

### E4a — Histórico de votações nominais (só candidatos legislativos)

**Aplica-se a:** qualquer candidato que atualmente ocupa ou já ocupou uma
cadeira legislativa — `senador`, `deputado_federal`, `deputado_estadual`,
`vereador`, e candidatos ao Executivo que já foram legisladores (um
governador que foi deputado federal, ou um vereador em exercício concorrendo
a governador, ambos também têm histórico de votações nominais). Pule
totalmente para um candidato que nunca ocupou cadeira legislativa.

**Produz:** votos nominais nos 14 temas do questionário, cada um uma fonte
citável. Esta é a forma de evidência mais forte que este procedimento pode
reunir: é o que o candidato *fez* em seu próprio nome e de forma registrada,
não o que diz que fará.

**Onde procurar, nesta ordem:**

| Cargo | Fonte | Camada |
|---|---|---|
| `deputado_federal` | `dadosabertos.camara.leg.br` — projetos de autoria (ver abaixo) | 1 |
| `senador` | `senado.leg.br` — a página do senador, "Votações" | 1 |
| `deputado_estadual` | o portal próprio da assembleia estadual (`al<UF>.<uf>.leg.br`, ex.: `al.sp.gov.br`) | 1 |
| `vereador` | o portal próprio da câmara municipal (ver abaixo — nem toda câmara publica votos nominais) | 1 |

**Para `vereador`, verifique se a câmara publica votos nominais antes de
supor que publica.** Verificado em 2026-08-23 contra a Câmara Municipal do
Rio de Janeiro (`aplicnt.camara.rj.gov.br`, camada 1, William Siri): as
deliberações do plenário são registradas apenas como **votos simbólicos**
("os senhores vereadores que aprovam permaneçam como estão") — não há
registro de sim/não por vereador para citar, em nenhum tema, nunca. Isto não
é falha de busca; o registro genuinamente não existe. Quando um voto nominal
não está disponível, recorra à mesma abordagem de legislação de autoria usada
no caso do deputado federal abaixo: consulte o sistema de legislação da
própria câmara por projetos que o candidato apresentou ou co-apresentou
(busca no estilo `contlei.nsf` em `aplicnt.camara.rj.gov.br` para a câmara do
Rio) e cite-os, com `coerenciaBase` declarando explicitamente que não existe
voto nominal e que a coerência se baseia em legislação de autoria em vez
disso. Não trate a ausência de um endpoint de votos como motivo para pular a
E4a inteiramente — legislação de autoria continua sendo evidência em
primeira pessoa, registrada, apenas não um voto.

**Para `deputado_federal`, consulte projetos de autoria, não votos nominais.**
Verificado em 2026-08-23: a API de dados abertos da Câmara **não tem endpoint
de voto por deputado** — `/deputados/{id}/votacoes` retorna HTTP 405, porque
os votos são indexados por sessão (`/votacoes/{id}/votos`), não por
parlamentar. Reconstruir o histórico de um deputado exigiria enumerar toda
sessão. Use isto em vez disso:

```
GET https://dadosabertos.camara.leg.br/api/v2/proposicoes
    ?idDeputadoAutor={id}&siglaTipo=PL&siglaTipo=PEC&siglaTipo=PLP
    &ano=2023&ano=2024&ano=2025&ano=2026&itens=100
```

O filtro `siglaTipo` importa: uma consulta sem filtro retorna ~90% de `REQ`
(requerimentos processuais — sinal de política quase nulo). `PL`/`PEC`/`PLP`
são o resultado substantivo, e cada `ementa` declara a política diretamente,
o que mapeia para os 14 temas de forma muito mais limpa do que um voto
sim/não. Um projeto que o candidato *apresentou* também é evidência mais
forte de prioridade do que um voto que deu acompanhando sua bancada.

Obtenha `{id}` em `GET /deputados?siglaUf={UF}` (uma chamada retorna toda a
bancada do estado).

`.leg.br` e `.gov.br` já estão na lista de domínios de camada 1 que o
validador aplica, então uma citação de votação nominal se qualifica como
`camada: 1` — cite com `fontes[].tipo: "votacao"`.

**O mandato a julgar é 2023–2026**, não a carreira inteira do candidato. Um
voto de um mandato anterior é contexto para `resumoPerfil`, não evidência de
coerência com uma plataforma de 2026.

**Não pode:** afirmar como um candidato votou a partir de conhecimento de
base. Se o voto não foi consultado nesta sessão e não pode ser citado com uma
URL, ele não existe para os fins deste procedimento — o tema recai sobre o
que E1/E3 sustentarem, exatamente como aconteceria para um candidato de
primeira viagem. Não pode inferir um voto a partir da posição do partido: um
legislador que votou contra sua própria bancada é precisamente o caso que
este estágio existe para capturar. Não pode extrapolar um voto para um tema
vizinho — a armadilha de enquadramento (seção 4) se aplica a votos tanto
quanto se aplica a texto de plataforma.

### E4b — Registro de desempenho do mandato (qualquer um com mandato legislativo)

**Aplica-se a:** qualquer candidato que **ocupa ou ocupou** um mandato
legislativo, **independentemente de qual cargo está disputando agora**. Um
deputado federal concorrendo ao Senado, um senador concorrendo a governador,
um deputado trocando de estado — todos se qualificam. O gatilho é *ter um
mandato a prestar contas*, não concorrer à mesma cadeira de novo. Pule apenas
para candidatos que nunca ocuparam um mandato.

**Produz:** quatro fatos de accountability voltados ao eleitor sobre como o
candidato usou o mandato que já teve: **presença**, **votos dados**,
**projetos apresentados (e quantos viraram lei)**, e **dinheiro público
gasto**.

**Regra rígida — só o que a fonte já fornece.** Colete esses dados *apenas*
dos endpoints abaixo, que retornam o dado em uma única chamada. **Não saia
caçando**: nada de raspar um portal, nada de consultas item a item para
reconstruir um total, nada de estimar, nada de inferir a partir de um proxy.
Se um item não está na tabela abaixo para aquela casa legislativa, ele é
**omitido do dossiê e declarado como indisponível** — nunca aproximado. Um
endpoint no estilo `/eventos` que lista eventos com presença registrada
**não é** uma taxa de comparecimento; usá-lo como tal seria inventar uma
estatística.

**Sempre cite a URL exata consultada** como uma entrada em `fontes[]`,
tipada `fontes[].tipo = "desempenho_mandato"`. Essas são afirmações numéricas
sobre o desempenho profissional de uma pessoa real; cada uma precisa ser
rastreável até a requisição que a produziu. Uma entrada por endpoint
efetivamente consultado — não cite o Radar uma vez e atribua a ele tanto a
cifra de presença quanto a de gastos de forma genérica.

**Onde os números vão.** O contrato não tem campo estruturado para eles
(`ResearchDossier` carrega apenas `resumoPerfil`, espectro e coerência),
então eles são escritos como texto corrido em **`dossie.resumoPerfil`**, que
é voltado ao eleitor. Declare-os de forma clara e completa — os números
brutos, não uma nota derivada: *"Em 2025 teve 117 presenças em 121 sessões
deliberativas, com 4 ausências justificadas e nenhuma injustificada.
Apresentou 120 projetos (PL/PEC/PLP) entre 2023 e 2026; quantos viraram lei
não foi possível obter na fonte consultada. Gastou R$ X da cota
parlamentar, com maior item em Y."* Nunca converta esses números em uma
nota, um ranking ou um adjetivo ("bom comparecimento") — o número é o fato;
o julgamento é do eleitor.

#### Câmara dos Deputados

| Item | Disponível? | Fonte |
|---|---|---|
| Presença | ✅ uma chamada | `radar.congressoemfoco.com.br/api/parlamentares/{idVoz}/assiduidade` — por ano: sessões, presenças, ausências justificadas vs. **injustificadas** |
| Gasto público (CEAP) | ✅ uma chamada | `…/api/parlamentares/{idVoz}/gastos-ceap` — detalhado: categoria, especificação, data, **fornecedor**, valor |
| Votos dados | ⚠️ só agregado | `…/api/parlamentares/{idVoz}/votos` — retorna `{proposicaoId-votacaoId: 1\|-1\|2}`. Os **totais** são de graça; o *assunto* de cada voto não é (as chaves são ids opacos; resolver 900+ seria caçar). Reporte totais, nunca por tema. |
| Projetos apresentados | ✅ uma chamada | `dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor={id}&siglaTipo=PL&siglaTipo=PEC&siglaTipo=PLP&ano=…` |
| Projetos **aprovados** | ❌ indisponível | Verificado em 2026-08-23: o filtro `codSituacao` da API é **silenciosamente ignorado** — um código inexistente retorna a mesma contagem que nenhum filtro. Consultar o status projeto a projeto seria caçar. **Declare a contagem de projetos apresentados com uma ressalva explícita de que o status de aprovação não foi obtido** — nunca implique que a cifra de projetos apresentados é uma cifra de aprovação. |

`{idVoz}` vem de `radar.congressoemfoco.com.br/api/parlamentares` (uma
chamada, os 513 deputados, inclui **CPF** para um cruzamento confiável).
`{id}` é o id da Câmara em `dadosabertos.camara.leg.br/api/v2/deputados?siglaUf={UF}`.

**O Radar é camada 2, não camada 1.** `congressoemfoco.com.br` é imprensa,
não um domínio `.leg.br`/`.gov.br`, então o validador vai tipá-lo `camada: 2`
— correto, e significa que um alerta apoiado nele nunca é publicado
automaticamente. Também é uma API interna de SPA não documentada: funciona
hoje, não é um contrato, e pode mudar sem aviso. Prefira o
`dadosabertos.camara.leg.br` oficial para tudo que ele cobre.

#### Senado Federal

Mais rico que a Câmara — os votos chegam **com a ementa embutida**, então o
assunto de cada voto é de graça aqui (diferente da Câmara).

| Item | Disponível? | Fonte |
|---|---|---|
| Votos + assunto | ✅ uma chamada | `legis.senado.leg.br/dadosabertos/senador/{cod}/votacoes.json` — cada item carrega `Materia.Ementa` e `SiglaDescricaoVoto` (`Sim`/`Não`/`Abstenção`/`Votou`) |
| Presença | ✅ mesma chamada | Derivada dos mesmos registros: `NCom` (não compareceu), `LS` (licença saúde), `MIS` (missão), `AP`, `P-NRV` (presente, não registrou voto) contra o total de sessões |
| Projetos apresentados | ✅ uma chamada | `…/senador/{cod}/autorias.json` — filtre `Sigla` por `PL/PEC/PLP/PLS`; também carrega `IndicadorAutorPrincipal`, então a autoria **principal** pode ser distinguida da coautoria |
| Gasto público | ❌ indisponível | `/senador/{cod}/despesas.json` → 404. Omita e declare como indisponível. |

`{cod}` vem de `legis.senado.leg.br/dadosabertos/senador/lista/atual.json`.

**`Votou` é um voto de sessão secreta** — o senador votou mas a direção não é
publicada. Conte como presença, nunca como posição sobre o tema.

**Um senador licenciado servindo como ministro é um caso especial.**
Verificado em 2026-08-23: Marina Silva e Simone Tebet ocupam cadeiras no
Senado mas estão ausentes de `lista/atual.json` porque estão licenciadas
para servir como ministras. As cifras de presença delas seriam lidas como
absenteísmo quando a causa é um cargo público diferente. Se um candidato não
está na lista atual mas é sabido que ocupa uma cadeira, declare isso em
`resumoPerfil` e **omita a cifra de presença** em vez de publicar um número
que significa o oposto do que parece significar.

#### Assembleias estaduais e câmaras municipais

Sem regra geral — cada casa publica de forma diferente, e a maioria publica
muito menos. Aplique a mesma regra rígida: uma chamada ou nada. Não construa
um raspador.

### E4 — Coerência e espectro

**Produz:** cruza E1 (promessas) com E4a (votos) e E3 (conduta) para
produzir um índice de coerência, um espectro político inferido, e um alerta
`divergencia_espectro` quando o espectro declarado e o inferido divergem.

**Não pode:** pontuar um índice de coerência zero para um candidato sem
histórico — a ausência de evidência é `null`, não um `0` medido (ver seção
6). Não pode tratar uma única notícia não corroborada como conduta
estabelecida. Este estágio só funciona com E1 e E3 já no mesmo contexto —
dividi-lo em uma passagem separada exigiria reler tudo de novo.

### E5 — Síntese

**Produz:** o dossiê de perfil mais as posições nos 14 temas do questionário,
cada uma com justificativa, intensidade, fontes e confiança. **Toda posição
cujo `posicao` é `neutro` também define `neutroMotivo`.** O contrato ainda
aceita um documento que o omite — por compatibilidade retroativa com
payloads escritos antes deste campo existir — mas uma omissão vinda deste
procedimento nunca está correta: um valor ausente é lido a jusante como
`nao_encontrado`, o que só está certo quando é de fato o que aconteceu, e
silenciosamente errado do contrário.

**Escolhendo o motivo — a distinção mais fácil de errar:**
- `nao_encontrado` — a busca não trouxe nada. Nenhuma posição sobre este
  tema foi encontrada em nenhum lugar de E1 a E4b.
- `nao_responde` — o candidato TEM uma posição documentada sobre o tema, mas
  ela não responde à afirmação específica perguntada. Isto não é "sem
  evidência"; é evidência que não acerta o alvo. Exemplo concreto: a
  afirmação pergunta sobre **ampliar** um programa, e o próprio material do
  candidato promete apenas **manter** o programa — isso é `nao_responde`,
  não `nao_encontrado`, porque uma posição foi encontrada e lida; ela
  simplesmente não resolve a afirmação como está redigida (a mesma
  disciplina da seção 4, a armadilha de enquadramento, aplicada ao caso
  neutro).
- `ambivalente` — a posição do candidato é contraditória entre fontes, ou
  explicitamente condicional ("depende do cenário/contexto").

Confundir `nao_encontrado` com `nao_responde` custa a um candidato real 0,40
de alinhamento naquele tema. "Encontrei uma posição que não acerta a
afirmação" e "não encontrei nada" nunca são intercambiáveis — se uma fonte é
citada descrevendo o que o candidato de fato disse ou fez sobre o tema, é
`nao_responde` ou `ambivalente`, nunca `nao_encontrado`.

**Não pode:** inventar uma posição para um tema sem evidência — esse tema
recebe `neutro` com `neutroMotivo: "nao_encontrado"`, um `confiancaIa` baixo,
e uma justificativa declarando que a evidência não foi encontrada (ver seção
7). Não pode escrever uma posição `neutro` sem `neutroMotivo` — todo veredito
`neutro` declara qual dos três motivos é. Não pode escrever nenhuma
afirmação que não remonte ao catálogo de fontes — toda posição e todo alerta
são conferidos contra as fontes declaradas no mesmo documento.

**`ressalva_evidencias` — quando a própria base de evidências precisa de uma
ressalva.** Emita este tipo de alerta quando as posições se apoiam em
evidência mais fraca do que declarações próprias e verificadas do candidato,
para que o leitor nunca fique achando que uma posição inferida de plataforma
partidária ou de uma extração degradada é uma declaração pessoal.
Concretamente:
- Posições inferidas de uma **plataforma partidária** em vez das palavras do
  próprio candidato (ex.: um candidato legislativo sem `plano_governo`): a
  ressalva deixa explícito que as posições são do partido, não do candidato.
- Uma fonte cuja **extração de texto foi degradada** (ex.: um PDF cujas
  palavras saíram embaralhadas, lido a partir de vocabulário preservado com
  confiança moderada).
- Qualquer outra lacuna material entre a evidência realmente lida e o que o
  card sugere.

Defina `severidade` como `baixa`, cite a fonte de evidência a que a ressalva
se refere, e deixe `resolucao`/`dataResolucao` como `null` — este é um sinal
permanente de transparência, não um caso resolvido. É publicado
automaticamente na ingestão (seção 6.1) e renderiza com o selo `amarelo`.

---

## 2. As camadas de fonte

| Camada | Fontes |
|---|---|
| 1 — Primária/oficial | TSE, STF, STJ, TCU, MPF, Câmara, Senado, diários oficiais, portais de transparência |
| 2 — Imprensa de referência | Agência Brasil/EBC, Agências Câmara e Senado, G1, Folha, Estadão, O Globo, UOL, Valor, BBC Brasil, Reuters |
| 3 — Checagem de fatos | Agência Lupa, Aos Fatos, Projeto Comprova, Estadão Verifica |

Excluídos: blogs partidários, sites sem expediente editorial, agregadores, e
redes sociais como fonte primária de fato.

**Toda posição e todo alerta precisam citar ao menos uma fonte visível ao
eleitor** — uma fonte cujo `destinoExibicao` é `card_candidato` ou
`pagina_sobre`. Uma fonte marcada `interno` (material institucional que
ninguém clicaria a partir do card de um candidato, como uma ficha bruta do
TSE) é real e permanece no catálogo, mas não pode ser a *única* citação em
uma afirmação: um leitor não tem como acessá-la, então uma afirmação apoiada
só em uma fonte `interno` sai não rastreável, exatamente o que a D8 proíbe.
Fontes `interno` ainda podem ser citadas ao lado de uma fonte visível — só
não podem sustentar uma afirmação sozinhas. O validador aplica isso em todo
array `fonteRefs`, tanto em posições quanto em alertas.

---

## 3. A regra de admissão D9

Um alerta `polemica` exige **duas fontes de camada 2 independentes que não
se citam mutuamente, ou uma fonte de camada 1.** Nada menos que isso
atravessa a barra.

O validador aplica isso mecanicamente: `validateResearch()` conta as
referências distintas de camada 2 citadas por um alerta `polemica` (após
deduplicação — citar a mesma fonte duas vezes não conta como duas) e
verifica se há uma referência de camada 1 entre elas. Um documento que viola
a D9 é rejeitado por completo, antes de qualquer coisa chegar ao banco.

---

## 4. A armadilha de enquadramento

Este é o modo de falha mais comum de todos. A afirmação de cada tema é uma
**posição política específica**, não uma descrição neutra de assunto.
`favoravel` significa que o candidato concorda com a afirmação **como está
escrita** — não com a área geral do assunto, não com "se importar" com o
tema.

Três exemplos concretos, literais:

- `reforma_previdencia` pergunta sobre *flexibilizar* regras de
  aposentadoria. Um candidato que as endureceu é `contrario`.
- `politica_economica` pergunta sobre *mais* participação do Estado. Um
  candidato favorável a menos é `contrario`.
- `politica_externa` pergunta sobre priorizar alinhamento *Ocidental*. Um
  candidato favorável ao multilateralismo Sul-Sul é `contrario`.
- A afirmação de `autonomia_individual` tem duas partes: *"O governo deve
  ampliar o direito dos cidadãos de tomarem decisões sobre sua própria vida,
  incluindo o acesso a armas de fogo para uso pessoal."* O nome do slug —
  um resquício de quando o tema se chamava `porte_armas` — esconde uma
  segunda cláusula específica e decisiva. A posição de um candidato sobre
  autonomia pessoal **em geral** não resolve esta afirmação; ela é resolvida
  pela posição específica dele sobre acesso a armas de fogo. Um candidato
  que apoia ampla autonomia pessoal mas se opõe ao acesso civil a armas de
  fogo é `contrario`, não `favoravel`.

Leia a afirmação primeiro, sempre. Não infira uma posição só a partir do nome
do tema.

---

## 5. Regras de coerência

O índice de coerência compara a **plataforma de 2026** do candidato contra a
**conduta dele em 2023–2026** — o que prometeu versus o que fez.

- É `null`, nunca zero, quando não há histórico para comparar. Zero
  significa que a comparação foi feita e deu incoerente; `null` significa
  que a comparação não pôde ser feita. Confundir os dois representaria um
  candidato de primeira viagem como alguém que quebrou as próprias
  promessas.
- É forte para candidatos **legislativos**, que têm votos nominais para
  comparar com a plataforma. Reúna-os na E4a — esse estágio existe para
  tornar esta regra acionável, não apenas aspiracional.
- É fraca para candidatos ao **Executivo**, cuja conduta só aparece por
  cobertura jornalística, não por um histórico votável.
- `coerencia_base` precisa declarar, em linguagem clara, o que foi comparado
  contra o quê — ex.: "compromissos do plano de governo de 2026 comparados
  contra votos nominais de 2023–2026", não um número seco sem explicação da
  base.

**Coerência por tema para um legislador em exercício ou ex-legislador.**
`coerenciaTema` é decidida tema a tema, a partir do que a E4a de fato
encontrou — descreve o histórico *naquele tema*, não a carreira inteira do
candidato:

| O que a E4a encontrou para este tema | `coerenciaTema` |
|---|---|
| Um voto citado que confere com a posição declarada do candidato | `coerente` |
| Um voto citado que contradiz a posição declarada do candidato | `incoerente` |
| Nenhum voto encontrado sobre este tema | `sem_historico` |

**A declaração de nível de carreira pertence a `coerenciaBase`, não ao enum
por tema.** Um senador em quarto mandato cujo histórico de votações nominais
por acaso é silencioso na maioria dos temas ainda recebe `sem_historico`
nesses temas — isso é correto, porque não há voto *naquele* tema para
comparar. O que não pode acontecer é `coerenciaBase` dizer "não há base de
comparação: nunca ocupou cargo eletivo" sobre alguém que ocupa uma cadeira há
dezesseis anos. Para um legislador, `coerenciaBase` declara qual mandato foi
examinado, onde os votos foram consultados, e quantos temas tiveram voto
para comparar — ex.: "Plataforma de 2026 confrontada com o histórico de
votações nominais do mandato 2023-2026 na Câmara; 6 dos 14 temas tiveram
votação nominal identificada."

Um tema marcado `incoerente` é candidato a um alerta `incoerencia` — mas só
onde a contradição é direta e os dois lados são citados (o texto da
plataforma e o voto). Uma mudança de ênfase não é uma contradição, e um voto
em um projeto cujo assunto apenas tangencia o tema também não é uma
contradição.

---

## 6. O contrato de saída

### 6.1 Referência de enums

Todo valor permitido para todo campo de enum, batendo exatamente com
`modules/ingest-candidates/src/lib/research-contract.ts`. O exemplo trabalhado abaixo não usa todo
valor — não pode, sem ficar ilegível — então esta tabela é a autoridade, não
o exemplo.

| Campo | Valores permitidos |
|---|---|
| `fontes[].tipo` | `plano_governo`, `coligacao`, `bens_declarados`, `votacao`, `tse_oficial`, `noticia`, `checagem`, `judicial`, `plataforma_partidaria`, `biografia` |
| `fontes[].camada` | `1` (primária/oficial — ver o requisito de domínio abaixo), `2` (imprensa de referência), `3` (checagem de fatos) |
| `fontes[].destinoExibicao` | `card_candidato`, `pagina_sobre`, `interno` |
| `posicoes[].posicao` | `favoravel`, `contrario`, `neutro` |
| `posicoes[].neutroMotivo` | `nao_encontrado`, `nao_responde`, `ambivalente`, ou `null`/omitido quando `posicao` não é `neutro` — obrigatório sempre que `posicao` é `neutro` (ver E5 acima para como escolher) |
| `posicoes[].coerenciaTema` | `coerente`, `incoerente`, `sem_historico`, ou `null` (sem histórico para comparar — ver seção 5) |
| `alertas[].tipo` | `ficha_suja`, `investigacao`, `polemica`, `incoerencia`, `divergencia_espectro`, `ressalva_evidencias` |
| `alertas[].severidade` | `critica`, `alta`, `media`, `baixa` |
| `alertas[].resolucao` | `null` (ainda em aberto) ou uma string descrevendo o que aconteceu e como foi resolvido |
| `alertas[].dataResolucao` | data ISO em que a resolução se tornou final, ou `null` se resolvido mas a data é desconhecida — nunca definido sem `resolucao` também definido |

**Um alerta resolvido continua sendo um alerta, e nunca é publicado
automaticamente.** `resolucao` mapeia para `politician_alerts.ativo = false`
e o próprio texto; uma `resolucao` `null` significa que o caso ainda está
aberto (`ativo = true`). Pela Regra B de `docs/legado/base/04_schema_alerts.md`,
um `ficha_suja` ou `investigacao` sobre fonte de camada 1 normalmente é
publicado sem nenhuma revisão humana — mas um resolvido nunca é, independente
da camada da fonte, porque o propósito daquele selo é que a desqualificação é
*atual*. Publicar um caso resolvido sem revisão diria ao eleitor algo
verdadeiro que não é.

**Camada 1 exige um domínio oficial.** `camada` não é uma autoavaliação — o
validador confere. Uma fonte só é aceita como `camada: 1` quando o hostname
da url termina em `.jus.br`, `.gov.br`, `.leg.br` ou `.mp.br` (ex.:
`tse.jus.br`, `camara.leg.br`, `www.gov.br`, `mpf.mp.br`). Uma matéria
jornalística, um blog, ou qualquer outra fonte que não esteja em um desses
domínios precisa ser `camada 2` ou `3`, independentemente de sua
confiabilidade real — não arredonde uma boa fonte para `camada: 1` para
fortalecer um alerta ou satisfazer a D9. O documento é rejeitado por completo
se uma fonte `camada: 1` falhar nessa checagem.

**Regra de publicação para alertas.** Um alerta `ficha_suja` ou
`investigacao` apoiado em fonte de camada 1 (oficial) é **publicado ao
eleitor imediatamente, sem revisão humana** — Regra B de
`docs/legado/base/04_schema_alerts.md`. Um alerta `ressalva_evidencias` — uma
ressalva metodológica sobre a base de evidências (ex.: uma extração de PDF
degradada, ou posições inferidas de uma plataforma partidária em vez das
declarações próprias do candidato) — também é publicado automaticamente,
porque é um sinal factual de transparência, nunca uma acusação, e escondê-lo
derrotaria seu propósito. Todo outro tipo de alerta, e um `ficha_suja` ou
`investigacao` apoiado em algo menos que uma fonte de camada 1, aguarda
curadoria antes de ser mostrado. Escolher `tipo` e decidir quais fontes citar
nos alertas da E2 **é** a decisão de publicação — o agente que faz essa
escolha precisa saber que não é uma classificação incidental, é uma decisão
sobre se uma afirmação chega a um eleitor sem revisão.

### 6.2 Exemplo trabalhado

Um exemplo completo e preenchido, batendo exatamente com
`modules/ingest-candidates/src/lib/research-contract.ts`. Todo campo abaixo está preenchido com
valores realistas, e os 14 temas estão cobertos — uma submissão real carrega
todos os 14, e copiar um formato parcial é um erro comum. As justificativas
nos temas menos ilustrativos são mantidas a uma frase; o ponto dessas
entradas é mostrar o formato completo, não ser elaborado. O exemplo também
demonstra a regra de honestidade em ação (`corrupcao_transparencia` é
`neutro` com confiança baixa, citando a fonte que foi checada e encontrada
silenciosa), a regra D9 em ação (o alerta `polemica` cita duas fontes de
camada 2 independentes), uma leitura `incoerente` genuína
(`bolsa_familia_transferencia`, onde a plataforma de 2026 diverge da conduta
passada documentada), e o alerta `ficha_suja` de E2, publicado
automaticamente sobre fonte de camada 1 pela regra acima.

**Nota:** o `tseSequencial` abaixo é um placeholder, não um identificador
real do TSE. O nome e o partido do candidato também são placeholders — isto
é uma ilustração de formato, não um dossiê real.

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
      "neutroMotivo": "nao_encontrado",
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
      "neutroMotivo": "nao_encontrado",
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
      "resolucao": null,
      "dataResolucao": null,
      "fonteRefs": ["fonte-tse-decisao-improbidade"]
    },
    {
      "tipo": "investigacao",
      "severidade": "alta",
      "titulo": "Inquérito por suspeita de irregularidade em contrato administrativo (arquivado)",
      "descricao": "O MPF abriu inquérito em 2022 para apurar suspeita de irregularidade em contrato firmado durante gestão anterior do candidato. Fonte oficial primária (camada 1).",
      "dataOcorrencia": "2022-09-14",
      "resolucao": "O MPF arquivou o inquérito em 2023 por falta de elementos que indicassem irregularidade.",
      "dataResolucao": "2023-04-02",
      "fonteRefs": ["fonte-tse-decisao-improbidade"]
    },
    {
      "tipo": "polemica",
      "severidade": "media",
      "titulo": "Contrato de gestão anterior sob suspeita",
      "descricao": "Dois veículos independentes noticiaram que um contrato assinado durante a gestão anterior do candidato está sob suspeita de irregularidades no processo licitatório. Ainda não há decisão judicial; trata-se de uma controvérsia relatada, não de uma condenação.",
      "dataOcorrencia": "2026-05-20",
      "resolucao": null,
      "dataResolucao": null,
      "fonteRefs": ["fonte-folha-controversia", "fonte-estadao-controversia"]
    },
    {
      "tipo": "divergencia_espectro",
      "severidade": "baixa",
      "titulo": "Espectro declarado diverge da conduta observada",
      "descricao": "O candidato se autodeclara de centro, mas as posições sobre política previdenciária e o papel econômico do Estado aproximam a plataforma do centro_esquerda, pelos mesmos critérios usados para os demais candidatos.",
      "dataOcorrencia": null,
      "resolucao": null,
      "dataResolucao": null,
      "fonteRefs": ["fonte-g1-previdencia", "fonte-uol-externa"]
    }
  ]
}
```

A segunda entrada demonstra o caminho de resolução acrescentado após o
incidente de 2026-08-22: o inquérito está registrado — não omitido — mas
`resolucao` está definida, então ele mapeia para `ativo = false` e **não** é
publicado automaticamente pela Regra B, mesmo com fonte de camada 1 e o tipo
se qualificando. Um eleitor lendo isso vê que foi investigado e arquivado,
não que é uma desqualificação em curso.

---

## 7. Regras de honestidade

- Um tema sem evidência recebe `neutro` com `neutroMotivo: "nao_encontrado"`,
  um `confiancaIa` baixo, e uma justificativa que diz que a evidência não foi
  encontrada. Nunca invente uma posição para preencher uma lacuna. Ver E5
  acima para como distinguir isso de `nao_responde` e `ambivalente`.
- O validador exige que `fonteRefs` seja não vazio em **toda** posição,
  inclusive uma `neutro` que registra que nenhuma evidência foi encontrada —
  um array vazio é uma rejeição, não um silêncio honesto. Uma posição
  `neutro` sem evidência ainda cita as fontes que foram **buscadas e
  encontradas silenciosas**: o plano de governo, a busca de notícias, o que
  quer que tenha sido de fato consultado. A citação registra onde você
  procurou, não o que você encontrou. Isto não é uma brecha para contornar a
  regra de honestidade; é como a regra se expressa dentro de um contrato que
  exige que toda afirmação seja rastreável. Copie a entrada
  `corrupcao_transparencia` da seção 6 como padrão — ela cita
  `fonte-plano-2026` precisamente porque esse é o documento que foi checado e
  ficou silencioso sobre o tema.
- Um plano de governo ausente é declarado como ausente, de forma clara, no
  dossiê e em qualquer posição que de outro modo dependeria dele. Nunca é
  contornado silenciosamente tratando outras fontes como se fossem o plano.
