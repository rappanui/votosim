import { render, screen, fireEvent } from '@testing-library/react'
import { QuizProvider } from '@/context/QuizContext'
import PerfilPage from '@/app/perfil/page'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const renderWithProvider = () =>
  render(<QuizProvider><PerfilPage /></QuizProvider>)

describe('/perfil page', () => {
  beforeEach(() => { mockPush.mockClear() })

  it('renders the Continuar button as disabled initially', () => {
    renderWithProvider()
    expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled()
  })

  it('enables Continuar only when all 3 fields are filled', () => {
    renderWithProvider()
    const button = screen.getByRole('button', { name: /continuar/i })

    fireEvent.change(screen.getByLabelText(/estado/i), { target: { value: 'SP' } })
    expect(button).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/município/i), { target: { value: 'São Paulo' } })
    expect(button).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/faixa etária/i), { target: { value: '25 a 34 anos' } })
    expect(button).toBeEnabled()
  })

  it('navigates to /questionario on submit', () => {
    renderWithProvider()
    fireEvent.change(screen.getByLabelText(/estado/i), { target: { value: 'SP' } })
    fireEvent.change(screen.getByLabelText(/município/i), { target: { value: 'São Paulo' } })
    fireEvent.change(screen.getByLabelText(/faixa etária/i), { target: { value: '25 a 34 anos' } })
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    expect(mockPush).toHaveBeenCalledWith('/questionario')
  })
})
