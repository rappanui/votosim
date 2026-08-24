# Fontes de dados e armadilhas do TSE 2026

> **Status:** válido · **Atualizado em:** 2026-08-24
> **Contexto:** a forma canônica de obter dados eleitorais oficiais de 2026,
> e as armadilhas que quebram tentativas ingênuas. Leia antes de escrever
> qualquer script que baixe do TSE ou parseie seus CSVs. Substitui a
> orientação de fontes em `docs/legado/06_data_pipeline.md`, que foi escrita
> contra dados de 2022. Todos os achados verificados em 2026-08-20.

---

## A fonte canônica é o CKAN, não a DivulgaCandContas

**Não construa sobre a API REST da DivulgaCandContas.** Ela está morta, não
apenas indisponível para eleições encerradas como `06_data_pipeline.md`
supunha antes:

| Endpoint | Resultado |
|---|---|
| `/divulga/rest/v1/eleicao/listar/2026` | 404 |
| `/divulga/rest/v1/eleicao/listar/2022` | 404 |
| `/divulga/rest/v1/eleicao/buscar/2022/…/BR/candidatos` | 404, corpo HTML |
| `/divulga/rest/v1/eleicao/eleicao-atual` | 400 |

O site `divulgacandcontas.tse.jus.br` agora serve uma single-page app sem
superfície REST v1.

**Use o portal CKAN do TSE em vez disso.** Ele enumera todo dataset de um
ciclo com sua URL de CDN:

```
https://dadosabertos.tse.jus.br/api/3/action/package_show?id=candidatos-2026
```

O pacote de 2026 carregava 91 recursos quando checado. `package_list`
também expõe `eleitorado-2026` e `pesquisas-eleitorais-2026`, nenhum dos
dois usado ainda.

## Arquivos em lote

| Dataset | URL sob `https://cdn.tse.jus.br/estatistica/sead/odsele/` |
|---|---|
| Candidatos (censo) | `consulta_cand/consulta_cand_2026.zip` |
| Dados complementares de candidato | `consulta_cand_complementar/consulta_cand_complementar_2026.zip` |
| Bens declarados | `bem_candidato/bem_candidato_2026.zip` |
| Coligações | `consulta_coligacao/consulta_coligacao_2026.zip` |
| Contas sociais oficiais | `consulta_cand/rede_social_candidato_2026.zip` |
| Cassações | `motivo_cassacao/motivo_cassacao_2026.zip` |
| Planos de governo (por UF) | `proposta_governo/proposta_governo_2026_{UF}.zip` |
| Fotos de candidatos (por UF) | `.../eleicoes/eleicoes2026/fotos/foto_cand2026_{UF}_div.zip` |

### `motivo_cassacao_2026` é publicado mas está **vazio**

Todos os 29 arquivos do pacote contêm um cabeçalho e **zero linhas de
dados**. O arquivo existe — documentação anterior estava errada ao dizer que
ele só aparece depois de decisões judiciais — mas ainda não carrega nenhuma
cassação, o que é consistente com `DS_SITUACAO_CANDIDATURA` sendo `#NE` em
todo lugar: o TSE ainda não julgou nada.

**Consequência para o pipeline:** a pesquisa de ficha limpa não pode depender
deste dataset hoje. O estágio `ficha_limpa` do agente precisa acessar fontes
judiciais primárias diretamente, e este pacote precisa ser baixado de novo
conforme as decisões saírem.

### `rede_social_candidato_2026` é rico e já é útil

98.604 linhas nacionalmente, cruzadas com candidatos por `SQ_CANDIDATO`.
`DS_URL` guarda a conta oficialmente declarada, em maiúsculas e formatada de
forma inconsistente:

```
HTTPS://WWW.INSTAGRAM.COM/MARIAAIRESOFICIAL/
HTTPS://INSTAGRAM.COM/FERNANDOPASQUALINO
HTTPS://PT.WIKIPEDIA.ORG/WIKI/S%C3%B4NIA_GUAJAJARA
```

Esquema, prefixo `www.` e barra final variam, e os valores estão com
percent-encoding, então qualquer agrupamento por domínio precisa normalizar
primeiro. Nem toda URL é uma rede social — páginas da Wikipédia também
aparecem.

Essas são contas **declaradas, oficiais**, o que as torna uma forma confiável
de restringir a busca de notícias do agente a handles verificados em vez de
adivinhar qual conta pertence a um candidato.

Planos de governo só são protocolados por `presidente` e `governador`. O
pacote `BR` guarda os planos presidenciais.

Os nomes de arquivo seguem **`{ano}{UF}{SQ_CANDIDATO}_{NN}.pdf`** — note o
sufixo de parte com dois dígitos, que todo plano presidencial de 2026 carrega
como `_01`. Os arquivos ficam dentro de uma pasta `{UF}/` dentro do pacote,
ao lado de um `leiame.pdf` que precisa ser ignorado. `SQ_CANDIDATO` é a
chave de junção com `candidacies.tse_sequencial`.

```
BR/2026BR280002542548_01.pdf   → SQ_CANDIDATO 280002542548 (Lula)
BR/leiame.pdf                  → não é um plano
```

**12 dos 13 candidatos a presidente protocolaram um plano.** Pablo Marçal
(`280002553884`) não tem nenhum no pacote em 2026-08-20. Os doze
sequenciais batem exatamente com os valores de `SQ_CANDIDATO` no CSV de
candidatos.

## Armadilhas de download

**`curl` é bloqueado.** O CDN fica atrás do Akamai, que retorna `403 Access
Denied` com corpo HTML para `curl`, mas serve `200 application/zip` para o
`fetch` do Node. Um script que dispara `curl` grava silenciosamente uma
página de erro HTML de 462 bytes nomeada `.zip`.

```
$ curl -O .../consulta_cand_2026.zip   → 403, HTML
Node fetch(url)                        → 200, application/zip
```

**`HEAD` é rejeitado.** As mesmas URLs retornam `403` para `HEAD` e `200`
para `GET`. Nunca sonde existência ou tamanho com `HEAD` — use um `GET` com
range ou simplesmente baixe.

**Os pacotes mudam diariamente.** `consulta_cand_2026.zip` foi regerado no
mesmo dia em que foi inspecionado. O registro fechou em 2026-08-15 e o total
nacional estava em 20.674 candidaturas contra aproximadamente 29.000 em
2022, então o arquivo muito provavelmente ainda está sendo preenchido.
Reingestão é obrigatória, não opcional.

## Peculiaridades de parsing do CSV

A codificação é **ISO-8859-1** (`latin1`), o delimitador é `;`. Ler como
UTF-8 destrói todo nome acentuado.

O pacote contém um CSV por UF, mais `consulta_cand_2026_BR.csv` (cargos
nacionais) e `consulta_cand_2026_BRASIL.csv`.

### `SG_UF = 'BR'` para cargos nacionais

`presidente` e `vice_presidente` carregam `SG_UF = 'BR'`. O enum
`brazilian_state` em `docs/legado/base/01_schema_politicians.md`
originalmente não tinha esse valor, então um schema reconstruído a partir da
documentação rejeitava toda candidatura presidencial com
`invalid input value for enum brazilian_state: "BR"`. O banco de dados em
produção já aceitava `BR` o tempo todo — documentação e banco haviam
divergido silenciosamente. Corrigido em
`docs/migracoes/11_sp0_foundation.sql` com um `ALTER TYPE` idempotente.

### `DS_SITUACAO_CANDIDATURA` é `#NE` para todo mundo

Todas as 41.348 linhas nacionais carregam `#NE` — o TSE ainda não julgou
nenhuma candidatura. Qualquer mapeamento de status precisa tratar texto não
reconhecido como "ainda registrado" em vez de adivinhar, e o status precisa
ser atualizado por redownload periódico.

### Colunas de coligação carregam sentinelas, não só nulos

`NM_COLIGACAO` guarda literalmente `PARTIDO ISOLADO` (1.882 linhas em SP) e
`FEDERACAO` (701 linhas em SP) ao lado de `#NULO`. Filtrar só `#NULO`
armazena `"PARTIDO ISOLADO"` como se fosse um nome de coligação.
`DS_COMPOSICAO_COLIGACAO` carrega a composição partidária real e é a coluna
mais útil.

### Federações são distintas de coligações

`SG_FEDERACAO` / `NM_FEDERACAO` / `DS_COMPOSICAO_FEDERACAO` descrevem
federações partidárias, que em 2026 são alianças permanentes em vez de por
eleição. Valores reais: `PT/PC do B/PV`, `PSDB/CIDADANIA`, `PSOL/REDE`,
`44-UNIÃO/11-PP`, `25-PRD/77-SOLIDARIEDADE`. Note a formatação inconsistente
— algumas carregam número de partido, outras não. Armazenado em
`candidacies.federacao`.

### Suplentes de senador são linhas separadas

`1º SUPLENTE` e `2º SUPLENTE` aparecem como candidaturas próprias (649
linhas nacionalmente). Não são votados individualmente e deliberadamente não
são ingeridos.

## Tamanho dos planos de governo — medido

Todos os 12 planos presidenciais extraem como texto real com `pdf2json`.
**Nenhum é uma imagem escaneada**, então nenhuma etapa de OCR é necessária.

| Sequencial | Caracteres | ≈ tokens |
|---|---|---|
| 280002551932 | 308.925 | 77k |
| 280002551547 | 296.357 | 74k |
| 280002538811 | 230.640 | 58k |
| 280002542548 | 166.345 | 42k |
| 280002551544 | 165.792 | 41k |
| 280002539826 | 142.064 | 36k |
| 280002540694 | 137.424 | 34k |
| 280002548139 | 111.378 | 28k |
| 280002541457 | 90.117 | 23k |
| 280002551975 | 44.278 | 11k |
| 280002552487 | 15.921 | 4k |
| 280002552484 | 15.044 | 4k |
| **Total** | **1.724.285** | **≈431k** |

Ler os doze planos uma vez custa aproximadamente 431k tokens de input antes
de qualquer pesquisa, raciocínio ou saída. O maior plano isolado tem 77k
tokens — grande, mas dentro do contexto de um único agente. O tamanho dos
planos varia por um fator de 20 entre o maior e o menor, então o custo por
candidato não é uniforme.

A extração emite avisos `Unable to decode image` em JPEGs embutidos; são
inofensivos — a extração de texto não é afetada.

## Censo de 2026 por cargo

Medido a partir do pacote gerado em 2026-08-20 19:33.

| Cargo | Contagem |
|---|---|
| Presidente | 13 |
| Vice-presidente | 13 |
| Governador | 199 |
| Vice-governador | 201 |
| Senador | 316 |
| 1º / 2º suplente de senador | 649 |
| Deputado federal | 7.691 |
| Deputado estadual | 11.165 |
| Deputado distrital | 427 |
| **Total nacional** | **20.674** |
