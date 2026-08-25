# Registros

> **Status:** válido · **Atualizado em:** 2026-08-25 17:52
> **Contexto:** o que foi descoberto ao operar o sistema, com data. Leia quando
> precisar saber se uma anomalia já apareceu antes, ou por que uma decisão foi
> tomada. Não descreve como o sistema funciona; para isso, `docs/referencia/`.

---

## O que é um registro

Um registro responde **"o que aconteceu e quando"**, não "como funciona". É
histórico datado e append-only: um achado antigo não é apagado quando deixa de
valer, é anotado como resolvido. A cronologia é o valor.

Por isso esta pasta **não tem teto de linhas**. Cortar um log pelo tamanho
destruiria justamente o que ele guarda. `docs/referencia/` tem teto de 200
linhas porque lá o problema oposto é o real: um documento de consulta longo não
é lido, é folheado.

## O que mora aqui

| Arquivo | Conteúdo |
|---|---|
| `achados-sp0.md` | Anomalias encontradas ao rodar o pipeline de pesquisa de candidatos (fase SP-0 em diante): dados inconsistentes do TSE, casos que quebram premissas, decisões tomadas diante deles. |
| `ingestao-dos-senadores-do-rj.md` | O que a ingestão dos 16 candidatos ao Senado pelo RJ (2026-08-25) ensinou: teto de busca compartilhado entre agentes, fonte oficial que só abre com cabeçalho ou cadeia de certificado completos, o bug que apagou dois dossiês, e cinco erros de terceiros pegos na leitura da fonte primária. |

## O que **não** mora aqui

- Como o sistema funciona → `docs/referencia/`
- Como executar alguma coisa → `docs/procedimentos/`
- Documentos superados → `docs/legado/`

Um registro descreve o mundo; um documento de referência descreve o código.
Quando um achado vira comportamento permanente do sistema, ele é **promovido**
para a referência, e a entrada no registro fica, com a data, contando quando
aquilo foi aprendido.
