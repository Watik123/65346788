import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { queryCatalog, toCatalogItem, type CatalogQueryParams } from '@znyzhky/shared'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FILTERS } from '../test/fixtures'

const category = { slug: 'smartfony', name: 'Смартфони', parent: { slug: 'elektronika', name: 'Електроніка' } }
const ITEMS = [
  toCatalogItem({ id: 1, name: 'Apple iPhone 17 256GB Black (MG6J4)', brand: 'Apple', imageUrl: null, category, deal: { status: 'none', bestPrice: 46199, shopsCount: 7, discountPercent: 0 } }),
  toCatalogItem({ id: 2, name: 'Смартфон Samsung Galaxy A17 4/128GB Black', brand: 'Samsung', imageUrl: null, category, deal: { status: 'real', bestPrice: 8999, shopsCount: 3, discountPercent: 12 } }),
  toCatalogItem({ id: 3, name: 'Смартфон Nokia 3310', brand: 'Nokia', imageUrl: null, category, deal: null }),
]

const catalogMock = vi.fn()
vi.mock('../api/client', () => ({
  isStaticMode: false,
  ApiRequestError: class extends Error {},
  api: { catalog: (q: CatalogQueryParams) => catalogMock(q), filters: async () => FILTERS },
}))

import { CatalogPage } from './CatalogPage'

function renderPage(url = '/catalog') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <CatalogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const lastQuery = () => catalogMock.mock.calls.at(-1)?.[0] as CatalogQueryParams

beforeEach(() => {
  catalogMock.mockReset()
  catalogMock.mockImplementation(async (q: CatalogQueryParams) => queryCatalog(ITEMS, q))
})

describe('CatalogPage', () => {
  it('показує всі товари: з ціною й кількістю магазинів, зі знижкою і ті, яких зараз немає', async () => {
    renderPage()
    const iphone = (await screen.findByRole('link', { name: 'Apple iPhone 17 256GB Black (MG6J4)' })).closest('article') as HTMLElement
    expect(iphone.textContent).toMatch(/46\s199\s₴/)
    expect(iphone.textContent).toContain('7 магазинів')
    expect((screen.getByRole('link', { name: 'Смартфон Samsung Galaxy A17 4/128GB Black' }).closest('article') as HTMLElement).textContent).toContain('−12%')
    expect((screen.getByRole('link', { name: 'Смартфон Nokia 3310' }).closest('article') as HTMLElement).textContent).toContain('Зараз немає в наявності')
    expect(screen.getByText('3 товари')).toBeTruthy()
  })

  it('пошук потрапляє в запит і звужує список; порожній результат пояснюється', async () => {
    renderPage()
    await screen.findByRole('link', { name: 'Смартфон Nokia 3310' })
    await userEvent.type(screen.getByLabelText('Пошук товару'), 'iphone 17{Enter}')
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: 'iphone 17', page: 1 }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Смартфон Nokia 3310' })).toBeNull())
    expect(screen.getByRole('link', { name: 'Apple iPhone 17 256GB Black (MG6J4)' })).toBeTruthy()

    await userEvent.clear(screen.getByLabelText('Пошук товару'))
    await userEvent.type(screen.getByLabelText('Пошук товару'), 'пральна машина{Enter}')
    expect(await screen.findByText('Нічого не знайшлося')).toBeTruthy()
  })

  it('читає запит, категорію й сортування з посилання', async () => {
    renderPage('/catalog?q=galaxy&category=smartfony&sort=price_asc')
    await screen.findByRole('link', { name: 'Смартфон Samsung Galaxy A17 4/128GB Black' })
    expect(lastQuery()).toMatchObject({ q: 'galaxy', category: 'smartfony', sort: 'price_asc' })
    expect((screen.getByLabelText('Пошук товару') as HTMLInputElement).value).toBe('galaxy')
  })
})
