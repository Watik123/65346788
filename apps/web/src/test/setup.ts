import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom не вміє прокручувати сторінку
window.scrollTo = vi.fn()

afterEach(() => cleanup())
