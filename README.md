# VotoSim

App que compara as respostas do eleitor a um questionário com as posições reais
de cada candidato em 14 temas, e mostra o percentual de afinidade. Next.js 16
(App Router) + Supabase. A interpretação por IA acontece na ingestão de dados
(ver `scripts/`), não em tempo de execução — o app em si só faz comparação
determinística, sem chamar IA.

## Como subir a aplicação do zero

**Pré-requisitos:** Node.js instalado (qualquer versão recente — não há pin de
versão no projeto), acesso ao projeto Supabase (URL + chaves).

```bash
# 1. Instale as dependências
npm install

# 2. Crie o .env.local a partir do template e preencha com as credenciais
#    reais do projeto Supabase (Project Settings → API no painel do Supabase)
cp .env.example .env.local
# edite .env.local: as duas variáveis NEXT_PUBLIC_ já bastam para `npm run
# dev` — sem elas o app não conecta ao banco. As outras três (comentadas no
# template) são só para quem também for mexer na Edge Function.

# 3. Suba o servidor de desenvolvimento
npm run dev
```

Abra **http://localhost:3000** — a home redireciona automaticamente para
`/quiz`. Um `curl -sL -o /dev/null -w "%{http_code}\n" http://localhost:3000/`
retornando `200` confirma que subiu certo.

`npm run dev` sobe direto contra o Supabase remoto configurado no
`.env.local` — não precisa (nem depende de) Supabase local ou CLI para isto
funcionar. O diretório `supabase/` existe só para a Edge Function de
matching (`supabase/functions/`), não para rodar o app.

**Se `/quiz` carregar mas não mostrar candidatos:** a base pode estar vazia
ou sem candidatos ingeridos para o cargo/estado testado. Ver `scripts/` para
o pipeline de pesquisa e ingestão de candidatos (`export/README.md` tem o
passo-a-passo completo, ou `docs/procedimentos/pesquisa-de-candidato.md`).

## Este NÃO é o Next.js que você conhece

Ver `AGENTS.md` — a versão do Next.js usada aqui tem breaking changes em
relação ao que consta em dados de treinamento. Leia a documentação em
`node_modules/next/dist/docs/` antes de escrever qualquer código.
