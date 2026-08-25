import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IndiceSobre } from '@/components/sobre/IndiceSobre'

jest.mock('next/navigation', () => ({
  usePathname: () => '/sobre',
}))

const gatilho = () => screen.getByRole('button', { name: /seções/i })

describe('IndiceSobre', () => {
  it('starts with the mobile index closed', () => {
    render(<IndiceSobre />)
    expect(gatilho()).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens the index when the trigger is pressed', async () => {
    const user = userEvent.setup()
    render(<IndiceSobre />)
    await user.click(gatilho())
    expect(gatilho()).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders the section index only once, so it is never duplicated in the DOM', () => {
    render(<IndiceSobre />)
    expect(screen.getAllByRole('navigation', { name: /seções do sobre/i })).toHaveLength(1)
  })
})
