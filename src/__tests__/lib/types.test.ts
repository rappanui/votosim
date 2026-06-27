import { derivarConcordancia } from '@/lib/types'

describe('derivarConcordancia', () => {
  it('returns discordo for answer 1', () => {
    expect(derivarConcordancia(1)).toBe('discordo')
  })

  it('returns discordo for answer 2', () => {
    expect(derivarConcordancia(2)).toBe('discordo')
  })

  it('returns neutro for answer 3', () => {
    expect(derivarConcordancia(3)).toBe('neutro')
  })

  it('returns concordo for answer 4', () => {
    expect(derivarConcordancia(4)).toBe('concordo')
  })

  it('returns concordo for answer 5', () => {
    expect(derivarConcordancia(5)).toBe('concordo')
  })
})
