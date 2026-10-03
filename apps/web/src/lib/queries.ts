import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { toApiParams, type FeedFilters } from './feed-params'

export const useFeed = (filters: FeedFilters) =>
  useQuery({
    queryKey: ['feed', toApiParams(filters)],
    queryFn: () => api.feed(toApiParams(filters)),
    placeholderData: keepPreviousData,
  })

export const useFilters = () => useQuery({ queryKey: ['filters'], queryFn: api.filters, staleTime: 5 * 60_000 })

export const useRejected = () => useQuery({ queryKey: ['rejected'], queryFn: api.rejected })

export const useProduct = (id: number) => useQuery({ queryKey: ['product', id], queryFn: () => api.product(id), enabled: Number.isFinite(id) })
