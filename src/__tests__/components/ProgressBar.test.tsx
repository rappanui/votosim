import { render, screen } from '@testing-library/react'
import { ProgressBar } from '@/components/ProgressBar'

describe('ProgressBar', () => {
  it('displays current and total question numbers', () => {
    render(<ProgressBar current={3} total={14} />)
    expect(screen.getByText('Pergunta 3 de 14')).toBeInTheDocument()
  })

  it('fills to 50% when current is half of total', () => {
    const { container } = render(<ProgressBar current={7} total={14} />)
    const fill = container.querySelector('[data-testid="progress-fill"]')
    expect(fill).toHaveStyle({ width: '50%' })
  })

  it('fills to 100% on the last question', () => {
    const { container } = render(<ProgressBar current={14} total={14} />)
    const fill = container.querySelector('[data-testid="progress-fill"]')
    expect(fill).toHaveStyle({ width: '100%' })
  })
})
