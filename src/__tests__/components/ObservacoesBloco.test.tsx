import { render, screen, fireEvent } from '@testing-library/react'
import { ObservacoesBloco } from '@/components/ObservacoesBloco'
import type { Observacao } from '@/lib/types'

const contradicao: Observacao = {
  categoria: 'contradicao',
  titulo: 'Saúde pública',
  descricao: 'Defendeu no plano, votou contra em 2023.',
  temaSlug: 'saude_sus',
  fonteUrl: null,
}

const ressalva: Observacao = {
  categoria: 'ressalva',
  titulo: 'Segurança pública',
  descricao: 'Posição lida no programa do partido.',
  temaSlug: 'seguranca_publica_estadual',
  fonteUrl: null,
}

describe('ObservacoesBloco', () => {
  it('renders nothing when there are no observations', () => {
    const { container } = render(<ObservacoesBloco observacoes={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('counts every observation in the header', () => {
    render(<ObservacoesBloco observacoes={[contradicao, ressalva]} />)
    expect(screen.getByTestId('acordeao-contador')).toHaveTextContent('2')
  })

  it('groups contradictions and caveats under separate headings', () => {
    render(<ObservacoesBloco observacoes={[contradicao, ressalva]} />)
    fireEvent.click(screen.getByRole('button', { name: /Observações/ }))
    expect(screen.getByText('Contradições')).toBeInTheDocument()
    expect(screen.getByText('Ressalvas sobre a evidência')).toBeInTheDocument()
  })

  it('omits the contradictions heading when there are none', () => {
    render(<ObservacoesBloco observacoes={[ressalva]} />)
    fireEvent.click(screen.getByRole('button', { name: /Observações/ }))
    expect(screen.queryByText('Contradições')).not.toBeInTheDocument()
  })

  it('renders each observation title and description', () => {
    render(<ObservacoesBloco observacoes={[ressalva]} />)
    fireEvent.click(screen.getByRole('button', { name: /Observações/ }))
    expect(screen.getByText('Segurança pública')).toBeInTheDocument()
    expect(screen.getByText(/lida no programa do partido/)).toBeInTheDocument()
  })
})
