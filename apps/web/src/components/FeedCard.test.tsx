import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { makeItem } from '../test/fixtures'
import { FeedCard } from './FeedCard'

const NBSP = '\u00A0'

/** Точне порівняння тексту елемента: бібліотека тестів сама заміняє нерозривні пробіли звичайними */
const exact = (text: string) => (_: string, el: Element | null) => el !== null && el.children.length === 0 && el.textContent === text

function renderCard(over = {}) {
  return render(
    <MemoryRouter>
      <FeedCard item={makeItem(7, over)} />
    </MemoryRouter>,
  )
}

describe('FeedCard', () => {
  it('показує ціну, знижку у відсотках і гривнях, типову ціну', () => {
    renderCard()
    expect(screen.getByText(exact(`29${NBSP}399${NBSP}₴`))).toBeTruthy()
    expect(screen.getByText(exact(`−6${NBSP}600${NBSP}₴`))).toBeTruthy()
    expect(screen.getByLabelText('Знижка 18%')).toBeTruthy()
    expect(screen.getByText(exact(`35${NBSP}999${NBSP}₴`))).toBeTruthy()
  })

  it('показує оцінку з відгуками та кількість магазинів у правильному відмінку', () => {
    renderCard({ rating: 4.8, reviewCount: 214, shopsCount: 6 })
    expect(screen.getByText('4,8')).toBeTruthy()
    expect(screen.getByText('214 відгуків')).toBeTruthy()
    expect(screen.getByText('6 магазинів')).toBeTruthy()
  })

  it('товар без відгуків каже про це прямо', () => {
    renderCard({ rating: null, reviewCount: 0, shopsCount: 2 })
    expect(screen.getByText('Немає відгуків')).toBeTruthy()
    expect(screen.getByText('2 магазини')).toBeTruthy()
  })

  it('назва веде на сторінку товару', () => {
    renderCard()
    const link = screen.getByRole('link', { name: 'Телевізор Samsung 7' })
    expect(link.getAttribute('href')).toBe('/product/7')
  })

  it('без фото показує заглушку, а з фото саме фото', () => {
    const { unmount } = renderCard()
    expect(screen.getByRole('img', { name: 'Samsung: фото відсутнє' })).toBeTruthy()
    unmount()
    renderCard({ imageUrl: 'https://example.com/tv.jpg' })
    expect(screen.getByAltText('Телевізор Samsung 7').getAttribute('src')).toBe('https://example.com/tv.jpg')
  })

  it('міні-графік має текстовий опис для скрінрідерів', () => {
    renderCard()
    const label = screen.getByRole('img', { name: /Найкраща ціна за 30 днів: від/ }).getAttribute('aria-label')
    expect(label).toContain(`35${NBSP}999${NBSP}₴`)
    expect(label).toContain(`29${NBSP}399${NBSP}₴`)
  })
})
