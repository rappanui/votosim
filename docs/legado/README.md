# Documentação legada — não descreve o sistema atual

**Context:** Versões anteriores do VotoSim, preservadas como histórico de
decisões. **Nenhum destes documentos é confiável como referência do sistema em
produção.** Para o estado atual, veja `docs/README.md`.

---

## Por que estão errados

| O que afirmam | O que é verdade hoje |
|---|---|
| Next.js 15 | Next.js 16.2.9 |
| O match chama Gemini (ou Groq) | O match não usa IA — é aritmética determinística |
| Extração de posições via Groq | A pesquisa é feita por agentes Claude Code |
| pgvector e embeddings | A tabela `theme_embeddings` nunca foi criada |
| Frontend gerado pelo Lovable | Next.js App Router escrito à mão |
| Algoritmo de match v1 / v2 | Substituído pelo v3 |

## O que ainda tem valor aqui

O raciocínio. `base/` guarda o desenho original em pt-br e os numerados registram
por que cada decisão foi tomada. Leia como história, nunca como especificação.

As migrações que ficavam em `base/` **não estão aqui** — são schema vivo e foram
para `docs/migracoes/`.
