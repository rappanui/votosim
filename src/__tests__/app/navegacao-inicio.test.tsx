import { render, screen } from '@testing-library/react'
import RootPage from '@/app/page'
import InicioPage from '@/app/inicio/page'

const redirectMock = jest.fn()

jest.mock('next/navigation', () => ({
  redirect: (destino: string) => redirectMock(destino),
}))

describe('root route', () => {
  it('sends the visitor to the presentation page, not straight into the quiz', () => {
    RootPage()
    expect(redirectMock).toHaveBeenCalledWith('/inicio')
  })
})

describe('presentation page', () => {
  it('starts the voter on the quiz instead of the route that no longer exists', () => {
    render(<InicioPage />)
    expect(screen.getByRole('link', { name: /agora/i })).toHaveAttribute('href', '/quiz')
  })
})
