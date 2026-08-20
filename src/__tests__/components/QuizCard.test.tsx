import { render, screen, fireEvent } from '@testing-library/react'
import { QuizCard } from '@/components/QuizCard'
import type { TemaQuestionario } from '@/lib/types'

const makeTema = (): TemaQuestionario => ({
  slug: 'sus_saude_publica',
  nome: 'Saúde pública (SUS)',
  afirmacaoQuestionario: 'O governo deve aumentar o investimento público no SUS.',
  contextoQuestionario: 'O SUS atende mais de 200 milhões de brasileiros.',
  notaEducativa: 'Política de saúde é responsabilidade federal e estadual.',
})

describe('QuizCard', () => {
  it('renders theme name and statement', () => {
    render(<QuizCard tema={makeTema()} onChange={() => {}} />)
    expect(screen.getByText('Saúde pública (SUS)')).toBeInTheDocument()
    expect(screen.getByText(/O governo deve aumentar o investimento/)).toBeInTheDocument()
  })

  it('renders all 3 position buttons immediately, before any interaction', () => {
    render(<QuizCard tema={makeTema()} onChange={() => {}} />)
    expect(screen.getByText('Discordo')).toBeInTheDocument()
    expect(screen.getByText('Neutro')).toBeInTheDocument()
    expect(screen.getByText('Concordo')).toBeInTheDocument()
  })

  it('no position button is selected by default', () => {
    render(<QuizCard tema={makeTema()} onChange={() => {}} />)
    expect(screen.getByText('Discordo')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Neutro')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Concordo')).toHaveAttribute('aria-pressed', 'false')
  })

  it('importance section is hidden before any position button is clicked', () => {
    render(<QuizCard tema={makeTema()} onChange={() => {}} />)
    expect(screen.queryByText('Baixa')).not.toBeInTheDocument()
    expect(screen.queryByText('Média')).not.toBeInTheDocument()
    expect(screen.queryByText('Alta')).not.toBeInTheDocument()
    expect(screen.queryByText('Quão importante é este tema para você?')).not.toBeInTheDocument()
  })

  it('importance section appears after clicking a position button', () => {
    render(<QuizCard tema={makeTema()} onChange={() => {}} />)
    fireEvent.click(screen.getByText('Concordo'))
    expect(screen.getByText('Baixa')).toBeInTheDocument()
    expect(screen.getByText('Média')).toBeInTheDocument()
    expect(screen.getByText('Alta')).toBeInTheDocument()
    expect(screen.getByText('Quão importante é este tema para você?')).toBeInTheDocument()
  })

  it('clicking Concordo calls onChange with favoravel and default importancia 2', () => {
    const onChange = jest.fn()
    render(<QuizCard tema={makeTema()} onChange={onChange} />)
    fireEvent.click(screen.getByText('Concordo'))
    expect(onChange).toHaveBeenCalledWith('favoravel', 2)
  })

  it('clicking Discordo calls onChange with contrario', () => {
    const onChange = jest.fn()
    render(<QuizCard tema={makeTema()} onChange={onChange} />)
    fireEvent.click(screen.getByText('Discordo'))
    expect(onChange).toHaveBeenCalledWith('contrario', 2)
  })

  it('clicking Neutro calls onChange with neutro', () => {
    const onChange = jest.fn()
    render(<QuizCard tema={makeTema()} onChange={onChange} />)
    fireEvent.click(screen.getByText('Neutro'))
    expect(onChange).toHaveBeenCalledWith('neutro', 2)
  })

  it('calls onChange with updated importancia when pill is clicked', () => {
    const onChange = jest.fn()
    render(<QuizCard tema={makeTema()} onChange={onChange} />)
    fireEvent.click(screen.getByText('Concordo'))
    fireEvent.click(screen.getByText('Alta'))
    expect(onChange).toHaveBeenLastCalledWith('favoravel', 3)
  })

  it('restores previous answer when initialPosicao is provided', () => {
    render(<QuizCard tema={makeTema()} initialPosicao="favoravel" initialImportancia={3} onChange={() => {}} />)
    expect(screen.getByText('Concordo')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Alta')).toBeInTheDocument()
  })

  it('shows info popover when ⓘ is clicked', () => {
    render(<QuizCard tema={makeTema()} onChange={() => {}} />)
    fireEvent.click(screen.getByLabelText('Informações sobre este tema'))
    expect(screen.getByText(/O SUS atende mais de 200 milhões/)).toBeInTheDocument()
  })
})
