import Link from 'next/link'

/**
 * The written sections of Sobre, one component per slug in the registry.
 * Everything outside the "Por dentro da plataforma" group is written for a
 * reader with no background: short sentences, no unexplained jargon, nothing
 * that does not change what the reader understands.
 */

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 leading-relaxed text-gray-700">{children}</p>
}

function Destaque({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 rounded-lg border-l-4 border-highlight bg-gray-50 px-4 py-3 leading-relaxed text-gray-700">
      {children}
    </p>
  )
}

function Lista({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ul className="mb-4 list-disc space-y-2 pl-5 leading-relaxed text-gray-700">
      {itens.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

function OQueEOVotoSim() {
  return (
    <>
      <P>
        O VotoSim compara o que você pensa sobre 14 assuntos com o que cada candidato já
        defendeu publicamente. No fim, mostra uma porcentagem de afinidade com cada um.
      </P>
      <P>
        A parte importante vem depois do número: mostramos a conta inteira. Dá para ver
        tema por tema onde vocês concordam, onde discordam, e de onde tiramos a posição
        do candidato. Se você achar que erramos, dá para conferir na fonte.
      </P>
      <Destaque>
        O VotoSim não diz em quem votar. Ele mostra em que vocês se parecem e em que
        vocês diferem. A escolha continua inteiramente sua.
      </Destaque>
      <P>
        Não temos ligação com partido, candidato ou veículo de imprensa, e ninguém paga
        para aparecer aqui.
      </P>
    </>
  )
}

function ComoLerSeuResultado() {
  return (
    <>
      <P>
        Cada candidato aparece num card. De cima para baixo, é isto que ele está te
        contando:
      </P>
      <Lista
        itens={[
          <>
            <strong>O nome e o partido</strong>, com o número da urna.
          </>,
          <>
            <strong>A barra de afinidade</strong>, com a porcentagem. Quanto mais cheia,
            mais vocês pensam parecido nos temas que você marcou como importantes.
          </>,
          <>
            <strong>Alertas</strong>, em vermelho, quando existe algo registrado sobre a
            pessoa em fontes oficiais. Zero alertas também aparece, para você saber que a
            checagem foi feita.
          </>,
          <>
            <strong>Observações</strong>, em laranja, para ressalvas que não chegam a ser
            um alerta.
          </>,
          <>
            <strong>Cobertura e confiança</strong>, dois números pequenos que dizem
            quanto conseguimos apurar sobre aquele candidato.
          </>,
        ]}
      />
      <P>
        Clicando no card ele se abre e mostra a conta tema por tema, junto com os links
        das fontes. É ali que você confere se concorda com a nossa leitura.
      </P>
    </>
  )
}

function OQuePercentualSignifica() {
  return (
    <>
      <P>
        A porcentagem responde a uma pergunta só: entre os temas em que você tomou
        partido, em quantos esse candidato pensa parecido com você, dando mais peso aos
        que você marcou como mais importantes.
      </P>
      <P>É só isso. E é bom deixar claro o que ela não é:</P>
      <Lista
        itens={[
          'Não é uma nota do candidato. Um número alto não quer dizer que a pessoa é boa, honesta ou competente.',
          'Não é uma previsão de como ele vai governar. É o que ele disse até agora.',
          'Não é uma recomendação de voto. Nós não temos candidato.',
        ]}
      />
      <Destaque>
        Duas pessoas com respostas diferentes veem porcentagens diferentes para o mesmo
        candidato. Isso é esperado: o número fala da relação entre vocês dois, não do
        candidato sozinho.
      </Destaque>
    </>
  )
}

function Privacidade() {
  return (
    <>
      <P>
        Não pedimos cadastro, não pedimos e-mail e não guardamos nada sobre você. Suas
        respostas ficam na memória do navegador enquanto você usa o site e somem quando
        você fecha a página.
      </P>
      <P>
        Isso significa que não dá para voltar depois e recuperar o seu resultado. É uma
        troca consciente: preferimos não ter os seus dados a ter um histórico bonito.
      </P>
      <P>Também não vendemos nada, porque não há nada para vender.</P>
    </>
  )
}

function AFormula() {
  return (
    <>
      <P>
        Para cada um dos 14 temas, comparamos a sua resposta com a posição do candidato e
        damos uma nota de 0 a 100 para aquele tema:
      </P>
      <Lista
        itens={[
          'Vocês concordam: 100.',
          'O candidato se pronunciou, mas sem tomar partido: 50.',
          'Vocês discordam: 0.',
          'Não encontramos posição nenhuma: 10.',
        ]}
      />
      <P>
        Depois, cada tema entra na média com o peso que você deu a ele. Tema que você
        marcou como muito importante pesa mais; tema que você marcou como pouco
        importante pesa menos. A porcentagem final é essa média.
      </P>
      <P>
        Nada disso usa inteligência artificial na hora que você responde. É a mesma conta
        sempre: as mesmas respostas produzem exatamente o mesmo resultado, hoje e daqui a
        um mês. A inteligência artificial trabalha antes, na hora de pesquisar o
        candidato e registrar a posição dele.
      </P>
      <P>
        A conta aparece inteira dentro do card, tema por tema. Você consegue refazê-la no
        papel se quiser.
      </P>
    </>
  )
}

function CoberturaEConfianca() {
  return (
    <>
      <P>
        São duas medidas parecidas que respondem a coisas diferentes. Elas existem porque
        não sabemos tudo sobre todo mundo, e esconder isso seria desonesto.
      </P>
      <Lista
        itens={[
          <>
            <strong>Cobertura</strong>: entre os temas em que você tomou partido, em
            quantos conseguimos descobrir a posição desse candidato.
          </>,
          <>
            <strong>Confiança</strong>: a mesma ideia, mas contando mais os temas que
            você disse que são importantes para você.
          </>,
        ]}
      />
      <Destaque>
        Cobertura alta com confiança baixa quer dizer: sabemos bastante sobre esse
        candidato, só que não sobre o que interessa a você.
      </Destaque>
      <P>
        É a confiança que entra no cálculo da porcentagem. Quando ela está baixa,
        desconfie do número e abra o card para ver quais temas ficaram em branco.
      </P>
    </>
  )
}

function PorQueNaoSaberCustaCaro() {
  return (
    <>
      <P>
        Quando não encontramos a posição de um candidato sobre um tema, esse tema não é
        ignorado. Ele entra na conta valendo 10, bem abaixo dos 50 de quem se pronunciou
        sem tomar partido.
      </P>
      <P>Isso é de propósito, e vale explicar por quê.</P>
      <P>
        Se um tema sem informação simplesmente saísse da conta, quem nunca falou sobre
        nada teria as melhores porcentagens, calculadas em cima de dois ou três temas.
        Silêncio viraria vantagem.
      </P>
      <Destaque>
        A consequência é direta: quem publica um programa de governo claro tende a
        pontuar mais alto do que quem evita se comprometer, mesmo quando as posições
        conhecidas são parecidas. Não saber tem custo.
      </Destaque>
      <P>
        Continua sendo uma escolha nossa, e você pode discordar dela. Por isso mostramos
        a cobertura ao lado de cada porcentagem: dá para ver quanto do número veio de
        informação e quanto veio de silêncio.
      </P>
    </>
  )
}

function FontesOficiais() {
  return (
    <>
      <P>Tudo que mostramos sai de fontes públicas, que qualquer pessoa pode conferir:</P>
      <Lista
        itens={[
          'Dados Abertos do TSE, com as candidaturas registradas e as certidões criminais.',
          'DivulgaCandContas, onde ficam os planos de governo entregues no registro.',
          'Câmara dos Deputados e Senado Federal, com o histórico de votações de quem já tem mandato.',
          'Imprensa, para declarações públicas registradas.',
        ]}
      />
      <P>
        Cada posição que aparece no card vem com o link da fonte. Se a fonte não convence
        você, o número também não deveria convencer.
      </P>
    </>
  )
}

function AlertasECuradoria() {
  return (
    <>
      <P>
        Alerta é uma informação sobre a vida pública do candidato que talvez pese na sua
        decisão, e que não tem nada a ver com opinião política.
      </P>
      <P>
        Os alertas de ficha suja saem automaticamente das certidões criminais do TSE. Os
        outros passam por conferência antes de aparecer.
      </P>
      <Destaque>
        Alerta nenhum tira candidato do resultado. Nós mostramos, você decide o peso.
      </Destaque>
      <P>
        Quando o card diz &quot;nenhum alerta&quot;, isso também é informação: quer dizer
        que procuramos e não achamos, não que deixamos de olhar.
      </P>
    </>
  )
}

function CasosResolvidos() {
  return (
    <>
      <P>
        Processo que terminou em absolvição, condenação anulada, caso arquivado: nada
        disso some daqui. Mostramos o que aconteceu e como terminou.
      </P>
      <P>Só que separamos duas perguntas que costumam ser confundidas:</P>
      <Lista
        itens={[
          'Quão grave foi o fato registrado. Isso nunca muda, porque é história.',
          'Quanto aquilo ainda deveria pesar hoje, sabendo como o caso terminou.',
        ]}
      />
      <P>
        As duas coisas não andam juntas. Uma condenação anulada porque o processo correu
        no tribunal errado deixa muito mais dúvida do que uma absolvição em que ficou
        provado que a pessoa não fez aquilo.
      </P>
      <Destaque>
        Essa segunda avaliação é feita pela mesma inteligência artificial que pesquisa os
        candidatos, e não por uma pessoa. É deliberado: julgar &quot;quanto isso ainda
        importa&quot; sobre um político carrega o viés de quem julga.
      </Destaque>
      <P>
        Sempre que essa leitura for diferente da gravidade original, o motivo aparece ao
        lado, para você concordar ou discordar dele.
      </P>
    </>
  )
}

function BaseLegal() {
  return (
    <>
      <P>
        O VotoSim segue a Resolução TSE nº 23.755/2026, que trata de propaganda e
        informação eleitoral na internet.
      </P>
      <P>
        Os dados do TSE são usados a partir do Portal de Dados Abertos do Tribunal
        Superior Eleitoral, que autoriza livremente o acesso, o uso e o
        compartilhamento dessas informações.
      </P>
      <P>
        Se você é candidato ou representa uma campanha e encontrou um dado errado sobre
        você, fale com a gente pela página{' '}
        <Link href="/contato" className="text-highlight underline hover:text-primary">
          Fale conosco
        </Link>
        . Corrigimos com a fonte na mão.
      </P>
    </>
  )
}

function CodigoAberto() {
  return (
    <>
      <P>
        Todo o código do VotoSim é público, junto com a documentação técnica e as
        migrações do banco. Está em{' '}
        <a
          href="https://github.com/rappanui/votosim"
          className="text-highlight underline hover:text-primary"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/rappanui/votosim
        </a>
        .
      </P>
      <P>
        Isso não é enfeite. O produto inteiro se apoia na ideia de que você pode conferir
        a conta, e conferir a conta inclui poder ler o código que a faz.
      </P>
      <P>
        A licença é a <strong>AGPL-3.0</strong>. Em português comum, ela diz que você
        pode:
      </P>
      <Lista
        itens={[
          'Usar o código para o que quiser, inclusive comercialmente.',
          'Estudar, alterar e redistribuir.',
          'Rodar a sua própria versão.',
        ]}
      />
      <Destaque>
        A contrapartida é uma só: se você alterar o código e colocar essa versão no ar
        para outras pessoas usarem, precisa publicar as suas alterações sob a mesma
        licença. Não dá para pegar um projeto que existe para ser auditável e transformá-lo
        numa caixa-preta.
      </Destaque>
      <P>
        O texto completo da licença está no arquivo <code>LICENSE</code>, na raiz do
        repositório.
      </P>
    </>
  )
}

export const TEXTOS: Record<string, (() => React.JSX.Element) | undefined> = {
  'o-que-e-o-votosim': OQueEOVotoSim,
  'como-ler-seu-resultado': ComoLerSeuResultado,
  'o-que-o-percentual-significa': OQuePercentualSignifica,
  privacidade: Privacidade,
  'a-formula': AFormula,
  'cobertura-e-confianca': CoberturaEConfianca,
  'por-que-nao-saber-custa-caro': PorQueNaoSaberCustaCaro,
  'fontes-oficiais': FontesOficiais,
  'alertas-e-curadoria': AlertasECuradoria,
  'casos-resolvidos': CasosResolvidos,
  'codigo-aberto': CodigoAberto,
  'base-legal': BaseLegal,
}
