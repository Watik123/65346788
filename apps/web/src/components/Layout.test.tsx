import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { FILTERS } from '../test/fixtures'
import { Layout } from './Layout'

vi.mock('../api/client', () => ({
  isStaticMode: false,
  ApiRequestError: class extends Error {},
  api: { filters: async () => FILTERS },
}))

describe('Layout', () => {
  it('перехід між розділами не ламається, коли scrollTo повертає проміс (нові версії Chrome)', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation((() => Promise.resolve()) as unknown as typeof window.scrollTo)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<p>Стрічка знижок</p>} />
              <Route path="compare" element={<p>Сторінка порівняння</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getAllByRole('link', { name: 'Порівняння' })[0] as HTMLElement)
    expect(await screen.findByText('Сторінка порівняння')).toBeTruthy()
    await userEvent.click(screen.getAllByRole('link', { name: 'Знижки' })[0] as HTMLElement)
    expect(await screen.findByText('Стрічка знижок')).toBeTruthy()
    expect(scrollTo).toHaveBeenCalledTimes(3)
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
    scrollTo.mockRestore()
  })
})
