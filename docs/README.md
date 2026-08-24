# Documentação do VotoSim

> **Status:** válido · **Atualizado em:** 2026-08-24 19:10
> **Contexto:** porta de entrada de `docs/`. Leia isto primeiro para saber
> onde procurar; ele não repete o conteúdo de cada pasta, só diz onde está.

---

## A divisão é pelo modo de leitura, não pelo assunto

- **`docs/referencia/`** — como a plataforma funciona hoje. Lê-se pulando
  pra dentro, para consultar um fato específico. Um conceito por arquivo,
  em torno de 200 linhas por arquivo. Índice: `docs/referencia/README.md`.
- **`docs/procedimentos/`** — como executar alguma coisa, por um agente de
  IA ou por uma pessoa. Lê-se do início ao fim; um passo omitido é uma
  falha. Sem teto de linhas — completude vence concisão aqui. Índice:
  `docs/procedimentos/README.md`.
- **`docs/registros/`** — o que foi descoberto operando o sistema, com data.
  Append-only, sem teto de linhas: a cronologia é o valor. Índice:
  `docs/registros/README.md`.
- **`docs/migracoes/`** — os `.sql` já aplicados ao banco de produção.
  Schema vivo, não histórico.
- **`docs/legado/`** — documentação superada, preservada como raciocínio
  histórico. **Nenhum arquivo ali é confiável como referência do sistema
  atual.** Índice e por quê: `docs/legado/README.md`.

Se você não sabe qual pasta procurar: uma pergunta do tipo "como o match
calcula o percentual?" é referência; uma tarefa do tipo "preciso pesquisar
um candidato" ou "vou implantar uma migração" é procedimento.

## Todo documento declara a própria validade

Todo arquivo em `docs/` começa com um bloco `**Status:**` logo após o
título — ver `AGENTS.md` na raiz para o formato exato e por que ele existe.
**Não confie em um documento sem esse bloco no topo**, e não confie no nome
do arquivo sozinho: nomes já mentiram sobre o conteúdo neste projeto.

## Para quem chega agora

- `docs/referencia/visao-geral.md` — o produto, a stack real, o princípio
  de que a IA interpreta na ingestão e o match em runtime é aritmética
  determinística.
- `docs/procedimentos/subir-ambiente-local.md` — colocar o app rodando na
  sua máquina.
