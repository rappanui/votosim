import { render, screen } from '@testing-library/react'
import { AlertaBadge } from '@/components/AlertaBadge'
import type { Alerta } from '@/lib/types'

const makeAlerta = (
  tipo: Alerta['tipo'], badgeCor: Alerta['badgeCor'], overrides: Partial<Alerta> = {},
): Alerta => ({
  tipo,
  severidade: 'alta',
  severidadeAtual: 'alta',
  severidadeAtualMotivo: null,
  titulo: `Título ${tipo}`,
  descricao: `Descrição do alerta ${tipo}`,
  fonteUrl: 'https://example.com',
  badgeCor,
  ativo: true,
  resolucao: null,
  ...overrides,
})

describe('AlertaBadge', () => {
  it('shows the Tipo row with the human label for the alert type', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'vermelho')} />)
    expect(screen.getByText('Tipo:')).toBeInTheDocument()
    expect(screen.getByText('Ficha suja')).toBeInTheDocument()
  })

  it('shows Em investigação for investigacao type', () => {
    render(<AlertaBadge alerta={makeAlerta('investigacao', 'laranja')} />)
    expect(screen.getByText('Em investigação')).toBeInTheDocument()
  })

  it('shows Atenção for polemica type', () => {
    render(<AlertaBadge alerta={makeAlerta('polemica', 'cinza')} />)
    expect(screen.getByText('Atenção')).toBeInTheDocument()
  })

  it('shows Incoerência for incoerencia type', () => {
    render(<AlertaBadge alerta={makeAlerta('incoerencia', 'roxo')} />)
    expect(screen.getByText('Incoerência')).toBeInTheDocument()
  })

  it('shows Divergência de espectro for divergencia_espectro type', () => {
    render(<AlertaBadge alerta={makeAlerta('divergencia_espectro', 'azul')} />)
    expect(screen.getByText('Divergência de espectro')).toBeInTheDocument()
  })

  it('shows Ressalva for ressalva_evidencias type', () => {
    render(<AlertaBadge alerta={makeAlerta('ressalva_evidencias', 'amarelo')} />)
    expect(screen.getByText('Ressalva')).toBeInTheDocument()
  })

  it('shows Status: Ativo for an active alert', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'vermelho', { ativo: true })} />)
    expect(screen.getByText('Status:')).toBeInTheDocument()
    expect(screen.getByText('Ativo')).toBeInTheDocument()
  })

  it('shows Status: Resolvido for a resolved alert', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'cinza', { ativo: false })} />)
    expect(screen.getByText('Resolvido')).toBeInTheDocument()
  })

  it('shows Severidade original using the unified vocabulary', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'vermelho', { severidade: 'critica', severidadeAtual: 'baixa' })} />)
    expect(screen.getByText('Severidade original:')).toBeInTheDocument()
    expect(screen.getByText('Crítica')).toBeInTheDocument()
  })

  it('shows Avaliação atual always, even when it equals the severidade original', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'vermelho', { severidade: 'critica', severidadeAtual: 'critica' })} />)
    expect(screen.getByText('Avaliação atual:')).toBeInTheDocument()
    const values = screen.getAllByText('Crítica')
    expect(values).toHaveLength(2)
  })

  it('shows a different Avaliação atual value when it diverges from severidade', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'cinza', {
      ativo: false, severidade: 'critica', severidadeAtual: 'alta',
      severidadeAtualMotivo: 'Anulado por incompetência de foro; o mérito nunca foi rejulgado.',
    })} />)
    expect(screen.getByText('Crítica')).toBeInTheDocument()
    expect(screen.getByText('Grave')).toBeInTheDocument()
  })

  it('colors Severidade original by its own value', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'vermelho', { severidade: 'critica', severidadeAtual: 'baixa' })} />)
    expect(screen.getByText('Crítica').className).toContain('text-danger')
  })

  it('colors Avaliação atual by its own value, independent of severidade original', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'cinza', { severidade: 'critica', severidadeAtual: 'baixa' })} />)
    expect(screen.getByText('Leve').className).toContain('text-gray-500')
  })

  it('explains Avaliação atual with severidadeAtualMotivo when a reassessment happened', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'cinza', {
      ativo: false, severidade: 'critica', severidadeAtual: 'alta',
      severidadeAtualMotivo: 'Anulado por incompetência de foro; o mérito nunca foi rejulgado.',
    })} />)
    expect(screen.getByTitle(/incompetência de foro/)).toHaveTextContent('Avaliação atual:')
  })

  it('explains Avaliação atual as not yet reassessed for a resolved alert with no motivo', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'cinza', { ativo: false, severidadeAtualMotivo: null })} />)
    expect(screen.getByTitle(/ainda não foi reavaliado/i)).toHaveTextContent('Avaliação atual:')
  })

  it('explains Avaliação atual as the present-day weight for an active alert', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'vermelho', { ativo: true, severidadeAtualMotivo: null })} />)
    expect(screen.getByTitle(/nunca aumenta/i)).toHaveTextContent('Avaliação atual:')
  })

  it('explains what Severidade original means via a hover', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'vermelho')} />)
    expect(screen.getByTitle(/não muda mesmo se o caso for resolvido/i)).toHaveTextContent('Severidade original:')
  })

  it('explains what Status means via a hover', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'vermelho')} />)
    expect(screen.getByTitle(/em aberto/i)).toHaveTextContent('Status:')
  })
})
