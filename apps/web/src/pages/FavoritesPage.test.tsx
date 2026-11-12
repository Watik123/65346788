import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { queryCatalog, toCatalogItem, type CatalogQueryParams } from '@znyzhky/shared'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetFavoritesForTests } from '../lib/favorites'

const category = { slug: 'smartfony', name: 'Смартфони', parent: { slug: 'elektronika', name: 'Електроніка' } }
const ITEMS = [
  toCatalogItem({ id: 1, name: 'Apple iPhone 17 256GB Black', brand: 'Apple', imageUrl: null, category, deal: { status: 'none', bestPrice: 46199, shopsCount: 7, discountPercent: 0 } }),
  toCatalogItem({ id: 2, name: 'Смартфон Samsung Galaxy A17', brand: 'Samsung', imageUrl: null, category, deal: { status: 'none', bestPrice: 8999, shopsCount: 3, discountPercent: 0 } }),
]

const catalogMock = vi.fn()
vi.mock('../api/client', () => ({
  isStaticMode: false,
  ApiRequestError: class extends Error {},
  api: { catalog: (q: CatalogQueryParams) => catalogMock(q) },
}))

import { FavoritesPage } from './FavoritesPage'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/favorites']}>
        <FavoritesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  resetFavoritesForTests()
  catalogMock.mockReset()
  catalogMock.mockImplementation(async (q: CatalogQueryParams) => queryCatalog(ITEMS, q))
})

describe('FavoritesPage', () => {
  it('порожнє обране пояснює, як додати товар, і нічого не завантажує', () => {
    renderPage()
    expect(screen.getByText('Тут поки порожньо')).toBeTruthy()
    expect(catalogMock).not.toHaveBeenCalled()
  })

  it('показує збережені товари й зміну ціни відколи їх додали; сердечко прибирає товар', async () => {
    localStorage.setItem('favorites', JSON.stringify({ '1': { price: 49999, at: '2026-11-01' }, '2': { price: 8999, at: '2026-11-05' } }))
    renderPage()
    const iphone = (await screen.findByRole('link', { name: 'Apple iPhone 17 256GB Black' })).closest('article') as HTMLElement
    expect(iphone.textContent).toMatch(/Подешевшав на 3\s800\s₴ з 1 листопада/)
    expect((screen.getByRole('link', { name: 'Смартфон Samsung Galaxy A17' }).closest('article') as HTMLElement).textContent).toContain('Ціна не змінилась з 5 листопада')
    expect(catalogMock.mock.calls[0]?.[0]).toMatchObject({ ids: [1, 2] })

    await userEvent.click(iphone.querySelector('button[aria-pressed="true"]') as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Apple iPhone 17 256GB Black' })).toBeNull())
    expect(JSON.parse(localStorage.getItem('favorites') ?? '{}')).toEqual({ '2': { price: 8999, at: '2026-11-05' } })
  })
})
