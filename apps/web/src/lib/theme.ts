import { useCallback, useEffect, useState } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'

/**
 * Тема, яку сторінка отримала ззовні (наприклад, від переглядача, що вбудовує сайт).
 * Вибір «за системою» повертає саме її, а не просто прибирає атрибут.
 */
const hostTheme: string | null = typeof document === 'undefined' ? null : document.documentElement.getAttribute('data-theme')

function readStored(): ThemeChoice {
  try {
    const v = localStorage.getItem('theme')
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice !== 'system') root.setAttribute('data-theme', choice)
  else if (hostTheme) root.setAttribute('data-theme', hostTheme)
  else root.removeAttribute('data-theme')
}

/** Тема: за системою, світла або темна. Вибір зберігається, якщо браузер дозволяє. */
export function useTheme(): { choice: ThemeChoice; cycle: () => void } {
  const [choice, setChoice] = useState<ThemeChoice>(readStored)

  useEffect(() => {
    // Поки користувач сам нічого не вибирав, тему не чіпаємо
    if (choice !== 'system') apply(choice)
  }, [choice])

  const cycle = useCallback(() => {
    setChoice((cur) => {
      const next: ThemeChoice = cur === 'system' ? 'light' : cur === 'light' ? 'dark' : 'system'
      try {
        if (next === 'system') localStorage.removeItem('theme')
        else localStorage.setItem('theme', next)
      } catch {
        // сховище недоступне: тема працюватиме до закриття сторінки
      }
      apply(next)
      return next
    })
  }, [])

  return { choice, cycle }
}

export const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'Тема за системою',
  light: 'Світла тема',
  dark: 'Темна тема',
}
