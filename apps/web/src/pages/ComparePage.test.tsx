import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { queryCompare, toCompareItem, type CompareItemDto, type CompareQueryParams } from '@znyzhky/shared'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FILTERS } from '../test/fixtures'

const category = { slug: 'pylososy', name: 'Пилососи', parent: { slug: 'pobutova-tekhnika', name: 'Побутова техніка' } }
const ITEMS = [
  toCompareItem({
    id: 1,
    name: 'Робот-пилосос AENO RC3S ARC0003S',
    brand: 'Aeno',
    imageUrl: null,
    rating: null,
    reviewCount: 0,
    category,
    offers: [
      { shop: { slug: 'citrus', name: 'Цитрус' }, price: 4999, inStock: true, oldPrice: 17599 },
      { shop: { slug: 'ktc', name: 'KTC' }, price: 4999, inStock: true, oldPrice: null },
    ],
  }),
  toCompareItem({
    id: 2,
    name: 'Пилосос Electrolux EP61H21WET',
    brand: 'Electrolux',
    imageUrl: null,
    rating: null,
    reviewCount: 0,
    category,
    offers: [
      { shop: { slug: 'ktc', name: 'KTC' }, price: 8999, inStock: true, oldPrice: null },
      { shop: { slug: 'moyo', name: 'MOYO' }, price: 15199, inStock: true, oldPrice: null },
    ],
  }),
] as CompareItemDto[]

const compareMock = vi.fn()
vi.mock('../api/client', () => ({
  isSnapshotMode: false,
  ApiRequestError: class extends Error {},
  api: { compare: (q: CompareQueryParams) => compareMock(q), filters: async () => FILTERS },
}))

import { ComparePage } from './ComparePage'

function renderPage(url = '/compare') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <ComparePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const lastQuery = () => compareMock.mock.calls.at(-1)?.[0] as CompareQueryParams

beforeEach(() => {
  compareMock.mockReset()
  compareMock.mockImplementation(async (q: CompareQueryParams) => queryCompare(ITEMS, q))
})

describe('ComparePage', () => {
  it('показує підсумок, ціни магазинів, різницю і «знижку на папері»', async () => {
    renderPage()
    const electrolux = (await screen.findByRole('link', { name: 'Пилосос Electrolux EP61H21WET' })).closest('article') as HTMLElement
    expect(within(electrolux).getByText(/Різниця 6\s200\s₴ \(41%\)/)).toBeTruthy()
    expect(within(electrolux).getByText('найдешевше')).toBeTruthy()

    const aeno = screen.getByRole('link', { name: 'Робот-пилосос AENO RC3S ARC0003S' }).closest('article') as HTMLElement
    expect(within(aeno).getByText('Однакова ціна скрізь')).toBeTruthy()
    expect(within(aeno).getByText('Знижка на папері.')).toBeTruthy()
    expect(aeno.textContent).toMatch(/Цитрус показує «−72%, було 17\s599\s₴», а KTC продає за 4\s999\s₴ без жодної знижки/)
    expect(lastQuery()).toMatchObject({ sort: 'spread', page: 1, paperOnly: false })
  })

  it('фільтр «лише знижки на папері» і сортування потрапляють у запит', async () => {
    renderPage()
    await screen.findByRole('link', { name: 'Робот-пилосос AENO RC3S ARC0003S' })
    await userEvent.click(screen.getByLabelText('Лише знижки на папері'))
    await waitFor(() => expect(lastQuery()).toMatchObject({ paperOnly: true }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Пилосос Electrolux EP61H21WET' })).toBeNull())
    await userEvent.selectOptions(screen.getByLabelText('Сортувати'), 'price')
    await waitFor(() => expect(lastQuery()).toMatchObject({ sort: 'price', paperOnly: true, page: 1 }))
  })

  it('читає параметри з посилання', async () => {
    renderPage('/compare?category=pylososy&sort=shops&paper=1&page=2')
    await waitFor(() => expect(lastQuery()).toMatchObject({ category: 'pylososy', sort: 'shops', paperOnly: true, page: 2 }))
  })
})
