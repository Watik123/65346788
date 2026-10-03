import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClaimCompare } from './ClaimCompare'

describe('ClaimCompare', () => {
  it('порівнює обіцяну й реальну знижку', () => {
    render(<ClaimCompare claimed={23} real={0.4} />)
    expect(screen.getByText('Обіцяє магазин')).toBeTruthy()
    expect(screen.getByText('−23%')).toBeTruthy()
    expect(screen.getByText('Насправді')).toBeTruthy()
    expect(screen.getByText('0%')).toBeTruthy()
  })

  it('без заявленої знижки нічого не малює', () => {
    const { container } = render(<ClaimCompare claimed={null} real={0} />)
    expect(container.innerHTML).toBe('')
  })
})
