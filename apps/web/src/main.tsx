import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router'
import { isSnapshotMode } from './api/client'
import { Layout } from './components/Layout'
import { FeedPage } from './pages/FeedPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProductPage } from './pages/ProductPage'
import { RejectedPage } from './pages/RejectedPage'
import './styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000, refetchOnWindowFocus: false } },
})

/**
 * Збірка-знімок живе на сторінці, де адреса не наша, тому там маршрути тримаються
 * в пам'яті; звичайний сайт використовує адресу браузера.
 */
const Router = isSnapshotMode ? MemoryRouter : BrowserRouter

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<FeedPage />} />
            <Route path="product/:id" element={<ProductPage />} />
            <Route path="rejected" element={<RejectedPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Router>
    </QueryClientProvider>
  </StrictMode>,
)
