# Severidade de alertas

> **Status:** válido · **Atualizado em:** 2026-08-25 20:15
> **Contexto:** como `severidade` e `severidade_atual` dirigem a cor e o
> texto dos contadores de alertas/observações no card do candidato, o
> vocabulário de exibição, e a distinção entre fato histórico (`severidade`)
> e peso presente (`severidade_atual`). Verificado contra
> `src/lib/severidade.ts`, `AlertaBadge.tsx`, `CandidatoCard.tsx` e
> `docs/migracoes/14_severidade_atual.sql`. Ver `docs/referencia/alertas.md`
> para o schema completo de `politician_alerts` e a divisão alertas/
> observações.

---

## Como ela dirige a exibição

`severidade` (`critica` · `alta` · `media` · `baixa`) dirige a cor e o texto
dos contadores de alertas/observações no card colapsado, e aparece por
extenso ao lado do badge no card expandido. O vocabulário de exibição não
repete os nomes do enum: `critica`→**crítico(a)**, `alta`→**grave**,
`media`→**moderado(a)**, `baixa`→**leve**. Trocado em 2026-08-25: o enum
original (baixo/médio/alto/crítico) só lê bem com um substantivo do lado
("alerta de severidade baixa"); este texto omite o substantivo ("1 leve
detectado"), e a maior parte desse enum soa estranho sozinho. A nova escala
é a mesma progressão leve/moderado/grave que ANVISA e a OMS usam para
gravidade clínica, criada para descrever um caso sem nomeá-lo. `leve` e
`grave` não mudam de forma por gênero; `moderado`/`crítico` mudam
(moderado/moderada, crítico/crítica). A lógica é toda client-side, em
`src/lib/severidade.ts`. A Edge Function só decide *qual* severidade cada
observação carrega, nunca como ela é exibida:

- **`severidadeMaisAlta`**: a mais grave entre uma lista de itens (`critica`
  \> `alta` \> `media` \> `baixa`); `null` para lista vazia.
- **`corPorSeveridade`**: verde (`text-success`) quando não há nada;
  cinza/âmbar/laranja/vermelho seguindo a mais grave presente, do mesmo jeito
  que `badge_cor` já colore o badge individual.
- **`rotuloSeveridade(severidade, genero)`**: rótulo singular de um valor só,
  ex. para o "Severidade: {rótulo}" do badge expandido.
- **`rotuloPorSeveridade(itens, genero)`**: agrupa por severidade, mais grave
  primeiro, concordando singular/plural no adjetivo e no verbo:
  `"1 crítico e 2 leves detectados"`. Lista vazia gera `"0 detectados"` (ou
  `"0 detectadas"`), não um texto especial: quantidade, nível e o verbo são
  três partes independentes, e quantidade zero simplesmente não tem nível
  para mostrar. `genero` é `'masc'` para alertas, `'fem'` para observações.

`CandidatoCard` monta `"Alertas: {rotuloPorSeveridade(...)}"` e
`"Observações: {rotuloPorSeveridade(...)}"`, aplicando as funções a
`candidato.alertas` e a `candidato.observacoes` separadamente, de modo que
cada contador reage só à própria lista: um alerta crítico não pinta o
contador de observações de vermelho. O contador de alertas continua sempre
renderizando (`"Alertas: 0 detectados"` em verde: ficha limpa é notícia
boa, não ausência de notícia); o de observações continua **omitido
inteiramente em zero**, sem mudança nessa regra. `AlertaBadge` (dentro de
`AlertasBloco`, ver `docs/referencia/frontend.md`) virou um header box antes
do título/descrição do alerta, com quatro linhas: Tipo, Status
(Ativo/Resolvido), Severidade original e Avaliação atual. **As duas últimas
sempre aparecem juntas, mesmo quando têm o mesmo valor**: escondê-las
condicionalmente quando não divergem foi a versão anterior deste
componente, trocada em 2026-08-25 porque um eleitor vendo dois alertas do
mesmo tipo com números finais diferentes, sem abrir hover nenhum, podia
suspeitar de viés na curadoria. Mostrar as duas sempre prova, sem exigir
interação, que a diferença vem de como cada caso foi resolvido. O hover de
Avaliação atual usa `severidade_atual_motivo` quando existe; do contrário
declara que o caso ainda não foi reavaliado (se resolvido) ou que o valor
só muda com uma resolução (se ativo), nunca finge uma explicação que não
existe.

## `severidade_atual`: quanto um alerta resolvido ainda deveria pesar

`severidade` é permanente; `severidade_atual` responde uma pergunta
diferente e pode mudar quando o caso é resolvido: quanto isso ainda deveria
pesar no julgamento do eleitor hoje. Existe porque colorir o contador pela
`severidade` bruta reintroduz, um nível acima, o mesmo problema que o badge
cinza + `", resolvido"` já resolveu no alerta individual: um alerta
crítico resolvido (a condenação anulada do Lula, por exemplo) pintava o
card inteiro de vermelho como se fosse uma preocupação atual.

A view coalesce `severidade_atual` para `severidade` quando é `NULL`
(`COALESCE(pa.severidade_atual, pa.severidade)`), então o frontend e a
Edge Function sempre recebem um valor utilizável, nunca precisam checar
nulidade. Consequência prática: nenhum dos ~25 alertas resolvidos já na
base muda de aparência até que uma pesquisa explicitamente os reavalie.

Quem decide o valor é o próprio agente de pesquisa, na ingestão, sob a
mesma disciplina de confiança de 95% usada em toda decisão automática
deste projeto, e **não** passa por curadoria humana adicional: um curador
revisando "o quanto devo me preocupar com este político" carrega o próprio
viés de quem revisa, e a ferramenta precisa estar livre disso. A taxonomia
completa (absolvição de mérito, anulação processual, prescrição, condenação
mantida) e o que cada uma implica está em `docs/procedimentos/
pesquisa-de-candidato.md`, seção E2. Regras estruturais, garantidas por
constraint no banco (`docs/migracoes/14_severidade_atual.sql`) e por
`validateResearch()`: `severidade_atual` nunca é mais grave que
`severidade`; só existe em alerta resolvido; `severidade_atual_motivo` é
obrigatório junto.

## De onde vem a severidade de cada observação

As três observações que vêm direto de um alerta (`incoerencia`,
`divergencia_espectro`, `ressalva_evidencias`) carregam `severidade_atual`
(já coalescido pela view), não `severidade` bruta: o peso atual de um
alerta e o da observação derivada dele nunca podem discordar um do outro.
As três que `deriveObservacoes` sintetiza sem nenhuma linha de
`politician_alerts` por trás (divergência de espectro do dossiê, tema
incoerente, posição via partido/baixa confiança) não têm de onde herdar uma
severidade real, então recebem um valor fixo:

| Observação sintética | Severidade padrão | Por quê |
|---|---|---|
| Divergência de espectro do dossiê | `baixa` | Inferência sobre discurso, não sobre conduta. |
| Tema incoerente (`coerencia_tema`) | `alta` | Escolha de produto, não derivada de dado: alertas `incoerencia` reais hoje se dividem entre `media`/`alta`/`baixa` sem maioria clara. |
| Posição via partido | `baixa` | Ressalva sobre a fonte da posição, não sobre o candidato. |
| Posição direta com baixa confiança de IA | `baixa` | Ressalva sobre a extração, não sobre o candidato. |
