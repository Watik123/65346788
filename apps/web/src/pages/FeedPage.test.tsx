import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FILTERS, makeFeed, makeItem } from '../test/fixtures'

const feedMock = vi.fn()
vi.mock('../api/client', () => ({
  isSnapshotMode: false,
  ApiRequestError: class extends Error {},
  api: { feed: (q: unknown) => feedMock(q), filters: async () => FILTERS },
}))

import { FeedPage } from './FeedPage'

function renderPage(url = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <FeedPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const lastQuery = () => feedMock.mock.calls.at(-1)?.[0]

beforeEach(() => {
  feedMock.mockReset()
  feedMock.mockResolvedValue(makeFeed([makeItem(1), makeItem(2)], { total: 17, pages: 2 }))
})

describe('FeedPage', () => {
  it('показує кількість знижок і картки', async () => {
    renderPage()
    expect(await screen.findByText('17 знижок')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Телевізор Samsung 1' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Телевізор Samsung 2' })).toBeTruthy()
    expect(lastQuery()).toMatchObject({ sort: 'score', page: 1, limit: 12 })
  })

  it('читає фільтри з посилання', async () => {
    renderPage('/?category=televizory&shop=alfa&minDiscount=15&sort=price&page=2')
    await screen.findByText('17 знижок')
    expect(lastQuery()).toMatchObject({ category: 'televizory', shop: ['alfa'], minDiscount: 15, sort: 'price', page: 2 })
    expect(screen.getByRole('button', { name: 'Прибрати фільтр: Телевізори' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Прибрати фільтр: знижка від 15%' })).toBeTruthy()
  })

  it('вибір мінімальної знижки перезапитує стрічку з першої сторінки', async () => {
    renderPage('/?page=2')
    await screen.findByText('17 знижок')
    await userEvent.click(screen.getAllByRole('button', { name: 'від 15%' })[0] as HTMLElement)
    await waitFor(() => expect(lastQuery()).toMatchObject({ minDiscount: 15, page: 1 }))
  })

  it('зміна сортування скидає сторінку', async () => {
    renderPage('/?page=2')
    await screen.findByText('17 знижок')
    await userEvent.selectOptions(screen.getByLabelText('Сортувати'), 'price')
    await waitFor(() => expect(lastQuery()).toMatchObject({ sort: 'price', page: 1 }))
  })

  it('вибір магазину додає його до фільтра', async () => {
    renderPage()
    await screen.findByText('17 знижок')
    await userEvent.click((await screen.findAllByRole('checkbox', { name: /Альфа/ }))[0] as HTMLElement)
    await waitFor(() => expect(lastQuery()).toMatchObject({ shop: ['alfa'] }))
  })

  it('чіп фільтра прибирає його', async () => {
    renderPage('/?minDiscount=15')
    await screen.findByText('17 знижок')
    await userEvent.click(screen.getByRole('button', { name: 'Прибрати фільтр: знижка від 15%' }))
    await waitFor(() => expect(lastQuery().minDiscount).toBeUndefined())
  })

  it('порожній результат пропонує скинути фільтри', async () => {
    feedMock.mockResolvedValue(makeFeed([], { total: 0 }))
    renderPage('/?minDiscount=20')
    expect(await screen.findByText('За цими фільтрами нічого не знайшлося')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Скинути фільтри' }))
    await waitFor(() => expect(lastQuery().minDiscount).toBeUndefined())
  })

  it('помилка завантаження дає зрозуміле повідомлення й повтор', async () => {
    feedMock.mockRejectedValueOnce(new Error('offline'))
    renderPage()
    expect(await screen.findByText('Не вдалося завантажити стрічку')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Спробувати ще раз' }))
    expect(await screen.findByText('17 знижок')).toBeTruthy()
  })

  it('кнопка «Фільтри» на телефоні відкриває панель, Esc закриває', async () => {
    renderPage()
    await screen.findByText('17 знижок')
    await userEvent.click(screen.getByRole('button', { name: /^Фільтри/ }))
    expect(screen.getByRole('dialog', { name: 'Фільтри' })).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
