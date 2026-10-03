import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from './Pagination'

const labels = () => screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))

describe('Pagination', () => {
  it('одна сторінка: нічого не показує', () => {
    const { container } = render(<Pagination page={1} pages={1} onChange={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('скорочує довгий список: 1 … 5 6 7 … 12', () => {
    render(<Pagination page={6} pages={12} onChange={() => {}} />)
    expect(labels()).toEqual(['Попередня сторінка', 'Сторінка 1', 'Сторінка 5', 'Сторінка 6', 'Сторінка 7', 'Сторінка 12', 'Наступна сторінка'])
    expect(screen.getByLabelText('Сторінка 6').getAttribute('aria-current')).toBe('page')
  })

  it('на краях вимикає «назад» і «вперед»', () => {
    const { rerender } = render(<Pagination page={1} pages={3} onChange={() => {}} />)
    expect((screen.getByLabelText('Попередня сторінка') as HTMLButtonElement).disabled).toBe(true)
    rerender(<Pagination page={3} pages={3} onChange={() => {}} />)
    expect((screen.getByLabelText('Наступна сторінка') as HTMLButtonElement).disabled).toBe(true)
  })

  it('повідомляє про вибір сторінки', async () => {
    const onChange = vi.fn()
    render(<Pagination page={2} pages={4} onChange={onChange} />)
    await userEvent.click(screen.getByLabelText('Сторінка 4'))
    await userEvent.click(screen.getByLabelText('Попередня сторінка'))
    expect(onChange.mock.calls).toEqual([[4], [1]])
  })
})
