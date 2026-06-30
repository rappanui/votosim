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

  it('renders slider with initial value 3', () => {
    render(<QuizCard tema={makeTema()} onChange={() => {}} />)
    const slider = screen.getByRole('slider')
    expect(slider).toHaveValue('3')
  })

  it('hides importancia control before slider is moved', () => {
    render(<QuizCard tema={makeTema()} onChange={() => {}} />)
    expect(screen.queryByText('Baixa')).not.toBeInTheDocument()
    expect(screen.queryByText('Média')).not.toBeInTheDocument()
    expect(screen.queryByText('Alta')).not.toBeInTheDocument()
  })

  it('shows importancia control after slider is moved', () => {
    render(<QuizCard tema={makeTema()} onChange={() => {}} />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } })
    expect(screen.getByText('Baixa')).toBeInTheDocument()
    expect(screen.getByText('Média')).toBeInTheDocument()
    expect(screen.getByText('Alta')).toBeInTheDocument()
  })

  it('calls onChange with resposta and default importancia=2 on first slider move', () => {
    const onChange = jest.fn()
    render(<QuizCard tema={makeTema()} onChange={onChange} />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '4' } })
    expect(onChange).toHaveBeenCalledWith(4, 2)
  })

  it('calls onChange with updated importancia when pill is clicked', () => {
    const onChange = jest.fn()
    render(<QuizCard tema={makeTema()} onChange={onChange} />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Alta'))
    expect(onChange).toHaveBeenLastCalledWith(5, 3)
  })

  it('restores previous answer when initialResposta is provided', () => {
    render(<QuizCard tema={makeTema()} initialResposta={4} initialImportancia={3} onChange={() => {}} />)
    expect(screen.getByRole('slider')).toHaveValue('4')
    expect(screen.getByText('Alta')).toBeInTheDocument()
  })

  it('shows info popover when ⓘ is clicked', () => {
    render(<QuizCard tema={makeTema()} onChange={() => {}} />)
    fireEvent.click(screen.getByLabelText('Informações sobre este tema'))
    expect(screen.getByText(/O SUS atende mais de 200 milhões/)).toBeInTheDocument()
  })
})
