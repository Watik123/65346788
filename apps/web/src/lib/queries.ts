import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { CatalogQueryParams, CompareQueryParams } from '@znyzhky/shared'
import { toApiParams, type FeedFilters } from './feed-params'

/**
 * Стрічка, яку гортають: наступні знижки довантажуються порціями й додаються до вже показаних.
 * Номер сторінки з посилання не використовується: стрічка завжди починається згори.
 */
export const useFeed = (filters: FeedFilters) => {
  const params = { ...toApiParams(filters), page: 1 }
  return useInfiniteQuery({
    queryKey: ['feed', params],
    queryFn: ({ pageParam }) => api.feed({ ...params, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  })
}

export const useFilters = () => useQuery({ queryKey: ['filters'], queryFn: api.filters, staleTime: 5 * 60_000 })

export const useRejected = () => useQuery({ queryKey: ['rejected'], queryFn: api.rejected })

export const useProduct = (id: number) => useQuery({ queryKey: ['product', id], queryFn: () => api.product(id), enabled: Number.isFinite(id) })

export const useCompare = (q: CompareQueryParams) =>
  useQuery({ queryKey: ['compare', q], queryFn: () => api.compare(q), placeholderData: keepPreviousData })

export const useCatalog = (q: CatalogQueryParams, enabled = true) =>
  useQuery({ queryKey: ['catalog', q], queryFn: () => api.catalog(q), placeholderData: keepPreviousData, enabled })
