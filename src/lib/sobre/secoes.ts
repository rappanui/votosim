/**
 * The Sobre section tree. This is the only place the sidebar and the routes
 * both read from, so a menu item without a page (or a page missing from the
 * menu) is not expressible. Adding a section means adding it here and writing
 * its text; nothing else knows the list.
 */

export type Secao = {
  /** URL segment under /sobre. Lowercase, hyphenated, no accents. */
  slug: string
  /** Sidebar label and page heading. */
  titulo: string
  /** One line saying what the section covers. Shown on the /sobre index. */
  resumo: string
  /**
   * False means the section is announced but not written yet. The page says so
   * plainly instead of pretending, the same choice the empty menu pages make.
   */
  pronta: boolean
}

export type GrupoSobre = {
  slug: string
  titulo: string
  /** Why this group exists, in the reader's terms. Shown on the index. */
  resumo: string
  secoes: Secao[]
}

export const GRUPOS: GrupoSobre[] = [
  {
    slug: 'para-votar',
    titulo: 'Para quem vai votar',
    resumo: 'O básico, em linguagem simples: o que é isso aqui e como usar.',
    secoes: [
      {
        slug: 'o-que-e-o-votosim',
        titulo: 'O que é o VotoSim',
        resumo: 'Para que serve, e o que ele não faz.',
        pronta: true,
      },
      {
        slug: 'como-ler-seu-resultado',
        titulo: 'Como ler seu resultado',
        resumo: 'O que cada parte do card do candidato está te dizendo.',
        pronta: true,
      },
      {
        slug: 'o-que-o-percentual-significa',
        titulo: 'O que o percentual significa',
        resumo: 'E o que ele não significa, que importa ainda mais.',
        pronta: true,
      },
      {
        slug: 'privacidade',
        titulo: 'Privacidade',
        resumo: 'O que guardamos sobre você: nada.',
        pronta: true,
      },
    ],
  },
  {
    slug: 'a-conta',
    titulo: 'Como a conta é feita',
    resumo: 'A matemática por trás do percentual, aberta para você conferir.',
    secoes: [
      {
        slug: 'as-14-perguntas',
        titulo: 'As 14 perguntas',
        resumo: 'Quais são os temas, e por que esses.',
        pronta: false,
      },
      {
        slug: 'a-formula',
        titulo: 'A fórmula, passo a passo',
        resumo: 'Como sua resposta e a posição do candidato viram um número.',
        pronta: true,
      },
      {
        slug: 'escada-de-evidencia',
        titulo: 'Escada de evidência',
        resumo: 'Nem toda fonte vale o mesmo, e a conta sabe disso.',
        pronta: false,
      },
      {
        slug: 'cobertura-e-confianca',
        titulo: 'Cobertura e confiança',
        resumo: 'Duas medidas diferentes de quanto sabemos sobre o candidato.',
        pronta: true,
      },
      {
        slug: 'por-que-nao-saber-custa-caro',
        titulo: 'Por que não saber custa caro',
        resumo: 'Quem não se pronuncia perde pontos, e isso é de propósito.',
        pronta: true,
      },
    ],
  },
  {
    slug: 'os-dados',
    titulo: 'De onde vêm os dados',
    resumo: 'As fontes, o processo de pesquisa e o que ainda falta.',
    secoes: [
      {
        slug: 'fontes-oficiais',
        titulo: 'Fontes oficiais',
        resumo: 'TSE, Câmara, Senado e imprensa: tudo público e conferível.',
        pronta: true,
      },
      {
        slug: 'como-um-candidato-e-pesquisado',
        titulo: 'Como um candidato é pesquisado',
        resumo: 'O caminho entre a fonte pública e o card que você vê.',
        pronta: false,
      },
      {
        slug: 'alertas-e-curadoria',
        titulo: 'Alertas e curadoria',
        resumo: 'O que é um alerta, de onde ele vem e quem confere.',
        pronta: true,
      },
      {
        slug: 'casos-resolvidos',
        titulo: 'Casos resolvidos',
        resumo: 'Absolvição, anulação, arquivamento: por que nada some daqui.',
        pronta: true,
      },
      {
        slug: 'o-que-ainda-nao-temos',
        titulo: 'O que ainda não temos',
        resumo: 'Os limites da base, ditos na cara.',
        pronta: false,
      },
    ],
  },
  {
    slug: 'por-dentro',
    titulo: 'Por dentro da plataforma',
    resumo: 'A parte técnica, para quem quiser auditar ou contribuir.',
    secoes: [
      {
        slug: 'arquitetura',
        titulo: 'Arquitetura',
        resumo: 'IA na ingestão, aritmética no runtime, e por que essa separação.',
        pronta: false,
      },
      {
        slug: 'stack-e-banco',
        titulo: 'Stack e banco',
        resumo: 'Next.js, Supabase, Edge Functions e o modelo de dados.',
        pronta: false,
      },
      {
        slug: 'codigo-aberto',
        titulo: 'Código aberto',
        resumo: 'Onde está o código e sob quais termos você pode usá-lo.',
        pronta: true,
      },
    ],
  },
  {
    slug: 'o-projeto',
    titulo: 'O projeto',
    resumo: 'Quem faz, por que faz, e o que assumimos não dar conta.',
    secoes: [
      {
        slug: 'por-que-existe',
        titulo: 'Por que existe',
        resumo: 'O problema que motivou tudo isso.',
        pronta: false,
      },
      {
        slug: 'independencia',
        titulo: 'Independência',
        resumo: 'Sem partido, sem candidato, sem financiador político.',
        pronta: false,
      },
      {
        slug: 'limitacoes-assumidas',
        titulo: 'Limitações assumidas',
        resumo: 'O que esta ferramenta não consegue fazer por você.',
        pronta: false,
      },
      {
        slug: 'base-legal',
        titulo: 'Base legal',
        resumo: 'A resolução do TSE e o uso de dados públicos.',
        pronta: true,
      },
      {
        slug: 'contato',
        titulo: 'Contato',
        resumo: 'Como falar com a gente, inclusive para corrigir um dado.',
        pronta: false,
      },
    ],
  },
]

export const SECOES: Secao[] = GRUPOS.flatMap((grupo) => grupo.secoes)

export function encontrarSecao(slug: string): Secao | undefined {
  return SECOES.find((secao) => secao.slug === slug)
}

export function grupoDaSecao(slug: string): GrupoSobre | undefined {
  return GRUPOS.find((grupo) => grupo.secoes.some((secao) => secao.slug === slug))
}
