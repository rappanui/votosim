# A página Sobre

> **Status:** válido · **Atualizado em:** 2026-08-25 19:22
> **Contexto:** como `/sobre` está estruturada: o registro que serve ao mesmo
> tempo de índice e de tabela de rotas, a regra de linguagem por grupo, e o
> passo a passo para acrescentar uma seção. Leia antes de mexer em qualquer
> arquivo sob `src/app/sobre/` ou `src/components/sobre/`.

---

## O que `/sobre` é

Uma seção de documentação pública, com índice lateral, dividida em 5 grupos e
22 seções. Cada seção tem URL própria (`/sobre/<slug>`), título de aba próprio
e entra na busca separadamente.

A divisão de primeiro nível é **por público**, não por assunto: quem vai votar
nunca esbarra em modelo de dados, e quem quer auditar a plataforma acha a parte
técnica sem garimpar.

| Grupo | Slug | Para quem |
|---|---|---|
| Para quem vai votar | `para-votar` | Eleitor, sem contexto nenhum |
| Como a conta é feita | `a-conta` | Quem quer conferir o número |
| De onde vêm os dados | `os-dados` | Quem quer saber a procedência |
| Por dentro da plataforma | `por-dentro` | Quem vai auditar ou contribuir |
| O projeto | `o-projeto` | Quem quer saber quem está por trás |

## O registro é a fonte única

`src/lib/sobre/secoes.ts` exporta `GRUPOS`, e dele sai tudo:

- a **sidebar** (`SidebarSobre.tsx`) percorre `GRUPOS` para desenhar o índice;
- a **rota** (`src/app/sobre/[secao]/page.tsx`) chama `generateStaticParams()`
  sobre `SECOES`, que é `GRUPOS.flatMap(g => g.secoes)`.

Os dois lados leem a mesma lista, então **item de menu sem página, ou página
fora do menu, não é um estado que o código consiga representar**. Não é
disciplina, é impossibilidade estrutural. Um slug fora do registro cai em
`notFound()` e devolve 404.

Cada seção declara `slug`, `titulo`, `resumo` e `pronta`.

## `pronta` distingue casca de conteúdo

`pronta: false` significa que a seção está anunciada mas ainda não foi escrita.
A página então mostra o título, o resumo e a frase "ainda não escrevemos esta
parte", em vez de fingir conteúdo ou dar 404. É a mesma escolha das páginas
vazias do menu do topo: nenhum destino do site termina em beco sem saída.

O texto de uma seção pronta vive em `src/components/sobre/Textos.tsx`, num mapa
`TEXTOS` de slug para componente. Um teste amarra os dois lados: toda seção
`pronta` precisa ter texto, e nenhuma casca pode ter.

## A regra de linguagem

Fora do grupo `por-dentro`, o texto é escrito para alguém sem nenhum
conhecimento prévio: frases curtas, nenhum termo técnico sem explicação, e nada
que não mude o que o leitor entende. "Cobertura" e "confiança" aparecem
explicadas em português comum, sem fórmula.

`por-dentro` é o único grupo onde termo técnico é bem-vindo, porque quem chega
lá foi atrás disso.

Duas regras são verificadas por teste, não por revisão:

- nenhum texto contém travessão, que é convenção de escrita do projeto;
- nenhum texto promete recomendação de voto.

## Os arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/sobre/secoes.ts` | Os grupos, as seções e as buscas por slug |
| `src/components/sobre/Textos.tsx` | O mapa `TEXTOS`, um componente por seção escrita |
| `src/components/sobre/SidebarSobre.tsx` | O índice; grupos abrem e fecham, todos abertos por padrão |
| `src/components/sobre/IndiceSobre.tsx` | Recolhe o índice abaixo de `md`, renderizando um `<nav>` só |
| `src/app/sobre/layout.tsx` | Índice à esquerda, texto à direita |
| `src/app/sobre/[secao]/page.tsx` | A rota, com `generateMetadata` e `notFound` |

`IndiceSobre` existe por um motivo específico: a alternativa seria montar a
sidebar duas vezes, uma para desktop e outra para mobile, e aí um leitor de tela
encontraria duas navegações idênticas. Ela é montada uma vez e escondida por
CSS.

## Como acrescentar uma seção

1. Acrescente a entrada em `GRUPOS`, no grupo certo, com `pronta: false`. A
   sidebar e a rota passam a existir na mesma hora, e a casca já responde.
2. Escreva o componente do texto em `Textos.tsx` e registre no mapa `TEXTOS`.
3. Vire `pronta: true`.
4. Rode `npm test`. Se você esqueceu o passo 2 ou o passo 3, o teste que amarra
   registro e texto quebra dizendo qual slug ficou órfão.

O slug precisa ser minúsculo, sem acento e separado por hífen; há teste para
isso, porque ele vira URL.

## O que ainda não está feito

`src/app/sobre/page.tsx` continua sendo a lista plana antiga, herdada de antes
desta estrutura, e hoje ela renderiza dentro do layout novo. A intenção é
reduzi-la a uma página-porta com uma frase por grupo e os links, já que o
conteúdo dela foi redistribuído nas seções. Onze das 22 seções ainda são casca.
