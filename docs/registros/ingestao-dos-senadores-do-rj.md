# Ingestão dos senadores do RJ, 2026-08-25

> **Status:** válido · **Atualizado em:** 2026-08-25 17:52
> **Contexto:** o que foi aprendido ao pesquisar e ingerir os 16 candidatos ao
> Senado pelo Rio de Janeiro em uma única sessão, com agentes em paralelo, em
> duas passadas. Leia antes de rodar um lote grande de pesquisa: quase todo
> obstáculo aqui reaparece, e três achados mudaram o procedimento no mesmo dia.
> Os candidatos são reais e os dados foram gravados em produção.

---

## O que foi feito

16 candidatos, um agente por candidato, duas passadas. A primeira produziu 14
posições para cada um e 27 alertas. A segunda foi rodada porque a primeira
esbarrou em limites de ferramenta, não de evidência, e recuperou fontes em
todos os dossiês trabalhados: André Monteiro saiu de 1 fonte para 8, Luiz
Eugenio de 1 para 6, Marcos Dias de 6 para 13, Crivella de 30 para 38.

O ganho da segunda passada não foi volume, foi correção. Cinco fatos errados
sobre pessoas reais só apareceram nela, e estão listados abaixo.

## O teto de busca é da sessão, não do agente

O orçamento de WebSearch (200 chamadas, na configuração de então) é compartilhado
por todos os agentes da sessão. Com 12 agentes em paralelo, ele acabou no sexto
candidato: os últimos rodaram com zero busca nativa e recorreram a `WebFetch`
contra páginas de buscador, que é frágil e às vezes devolve resultado genérico
para consulta com nome entre aspas.

Efeito medido: os quatro dossiês mais magros da primeira passada são exatamente
os quatro últimos a rodar. Não era escassez de informação sobre o candidato, era
falta de orçamento de busca. Antes de despachar um lote, confira o teto.

## Fonte oficial que não abre quase sempre é o cliente, não o site

Três agentes concluíram "fonte camada 1 inacessível" e um chegou a citar um
proxy de leitura de terceiros. Nenhuma das duas coisas era necessária. Foram
duas causas distintas, ambas do lado de cá:

**Cabeçalho de navegador incompleto.** Todo o domínio do TSE responde `403`
(Akamai) a requisição com cabeçalho pobre, inclusive `curl -A "Mozilla/..."`.
Não é bloqueio de IP: o mesmo IP recebe `200` assim que o conjunto completo de
cabeçalhos é enviado. Com ele voltaram `200` o `www.tse.jus.br`, o
`cdn.tse.jus.br`, o `dadosabertos.tse.jus.br` e o `www.tre-rj.jus.br`, e o
`divulgacandcontas.tse.jus.br` passou de `403` para `404`, ou seja, a
requisição chegou à aplicação.

**Cadeia de certificado incompleta.** `portal.stf.jus.br`, `www.tjrj.jus.br`,
`camara.rio` e `aplicnt.camara.rj.gov.br` servem só o certificado folha. O
navegador esconde o defeito buscando a intermediária sozinho; `curl` e Node
falham com `unable to get local issuer certificate`. A correção é baixar a
intermediária que o próprio certificado indica no campo AIA e anexá-la ao
bundle, não desligar a verificação com `-k`.

As duas causas coexistem no mesmo host: `camara.rio` precisa das duas. Um `401`
do `aplicnt.camara.rj.gov.br` também se revelou defeito de TLS disfarçado, não
falta de credencial. As receitas verificadas estão na seção 2.1 de
`docs/procedimentos/pesquisa-de-candidato.md`.

Consequência que ainda não foi corrigida: `download-tse.ts` faz `fetch(url)` sem
cabeçalho nenhum, então hoje toma `403` do Akamai. O comando está quebrado.

## O bug que apagou dois dossiês

`ingest-research.ts` apaga posições, alertas e fontes antes de inserir as novas,
e as duas operações não são transacionais, porque o cliente Supabase não tem
transação. Alertas resolvidos sobrevivem ao delete por regra editorial, e as
fontes que eles citam também. Quando o documento novo redeclara a URL de uma
dessas fontes preservadas, o insert viola o `UNIQUE (politician_id, url)` de
`candidate_sources` e aborta, depois de as posições já terem sido apagadas.

Aconteceu duas vezes na segunda passada, com Crivella e Pedro Paulo, que são
justamente os dois candidatos com alerta resolvido no banco. Ambos ficaram
temporariamente com zero posições em produção. O guard do ledger funcionou como
projetado e devolveu o candidato para `em_progresso`, então nenhum deles ficou
"concluído e vazio", que seria o estado perigoso.

Contorno usado enquanto não há correção: no reprocessamento, não redeclarar no
JSON o alerta resolvido nem a fonte que só ele cita. Os dois continuam no banco,
preservados pelo próprio pipeline.

## Cinco erros de terceiros que a pesquisa pegou

Todos sobre pessoa real, todos corrigidos antes de chegar ao eleitor:

1. **Resumo de busca atribuiu fatos ao candidato errado, duas vezes.** Um
   escândalo de outro candidato do RJ foi atribuído a Pedro Paulo, e uma fala
   sobre o Estatuto do Nascituro foi atribuída a Monica Benicio por uma matéria
   que não a menciona. Os dois foram pegos abrindo a página.
2. **Imprensa trocou o mandato de lugar.** Matérias de 2025 atribuem 1.195
   mortes por intervenção policial ao governo de Benedita da Silva; pela série
   histórica do ISP-RJ esse número é de 2003, da gestão seguinte. O dossiê usa o
   número correto e registra a divergência.
3. **Instância judicial invertida.** O primeiro dossiê de Carlos Jordy dizia que
   o TRE-RJ o absolveu em primeira instância. A Zona Eleitoral decidiu a favor
   dele; o TRE-RJ, como instância recursal, rejeitou por 7 a 0 o recurso da
   acusação.
4. **Wikipedia deu o motivo errado de uma cassação real.** A cassação de
   Crivella em 2023 existe, mas o documento do TRE-RJ aponta autopromoção no
   programa "Semana Carioca", não panfletos de fake news.
5. **Notícia desatualizada sobre a própria candidatura.** Uma matéria de abril
   dava Carlos Portinho como candidato à Câmara. O registro do TSE mostra
   Senado. O brief estava certo e a notícia, não.

O padrão é o mesmo nos cinco: o erro sobrevive à leitura rápida e morre na
leitura da fonte primária.

## Limites de ferramenta que moldaram o resultado

- `WebFetch` bloqueia domínios de imprensa que o `curl` alcança normalmente
  (g1, UOL, Estadão, GaúchaZH). Um agente conclui "inacessível" onde há fonte.
- Rede social do candidato é praticamente infetchável: Facebook e X devolvem
  login ou `402`, Instagram entrega só a prévia. A regra que passou a permitir
  citar a conta declarada para os 14 temas vale, mas rendeu pouco na prática.
- A Câmara Municipal do Rio registra apenas voto simbólico em plenário. Não é
  falha de busca: não existe voto nominal por vereador para citar, em tema
  nenhum. O caminho é a legislação de autoria.
- O `/votos` do Radar Congresso em Foco devolveu os inteiros `3` e `4` além dos
  `1|-1|2` documentados. Nenhum agente traduziu, corretamente.
- O comando de validação documentado no README do módulo estava quebrado por
  dois motivos (import relativo e `process.argv[2]` sob `-e`). Três agentes
  esbarraram nele antes da correção.

## Lacunas de modelagem que apareceram

- **Domínio oficial que não passa no teste de camada 1.** `tcerj.tc.br` (TCE-RJ)
  e `camara.rio` são fontes oficiais reais e falham o teste do validador, que
  só aceita `.jus.br`, `.gov.br`, `.leg.br` e `.mp.br`. Custo concreto: a
  rejeição de contas de Waguinho, provavelmente o fato mais consequente da
  candidatura dele, ficou em `polemica` aguardando curadoria.
- **Não há `tipo` para estatística oficial.** O dado do ISP-RJ usado no alerta
  de Benedita entrou como `noticia` por falta de opção melhor.
- **Não há `tipo` para conta declarada.** A conta oficial do candidato entra
  hoje como `biografia`, e a proibição de usá-la em alerta é editorial, não
  mecânica.

## Decisões editoriais tomadas nesta sessão

- Alerta resolvido passou a publicar sob o mesmo critério de um ativo, porque a
  view já o distingue visualmente. O primeiro caso concreto é um inquérito por
  agressão arquivado pelo STF em 2016, hoje visível ao eleitor sem curadoria.
  Decisão consciente, não efeito colateral.
- Conta declarada pelo candidato pode decidir os 14 temas e nunca pode sustentar,
  contestar ou atenuar um alerta. Aceitar autodefesa publicada como fonte de
  alerta deixaria o acusado editar a própria ficha.
- Quatro candidatos terminaram com quase todos os temas neutros. É o que existe
  publicamente sobre eles, não falha de pesquisa, e o card vai mostrar cobertura
  baixa por isso.
