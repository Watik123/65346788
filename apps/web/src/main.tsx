import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router'
import { isStaticMode } from './api/client'
import { Layout } from './components/Layout'
import { CatalogPage } from './pages/CatalogPage'
import { ComparePage } from './pages/ComparePage'
import { FeedPage } from './pages/FeedPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProductPage } from './pages/ProductPage'
import { RejectedPage } from './pages/RejectedPage'
import './styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000, refetchOnWindowFocus: false } },
})

/**
 * Збірка без сервера (GitHub Pages) тримає маршрут у частині адреси після «#»: сторінку товару можна
 * оновити, відкрити за посиланням чи повернутись до неї кнопкою «Назад», а серверу для цього нічого
 * не треба вміти. Звичайний сайт використовує адресу браузера.
 */
const Router = isStaticMode ? HashRouter : BrowserRouter

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<FeedPage />} />
            <Route path="product/:id" element={<ProductPage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="compare" element={<ComparePage />} />
            <Route path="rejected" element={<RejectedPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Router>
    </QueryClientProvider>
  </StrictMode>,
)
