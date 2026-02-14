import { useQuery } from '@tanstack/react-query';
import type { SearchResult, APIResponse } from '@shared/types';

export function useGlobalSearch(queryStr: string) {
  return useQuery<{ results: SearchResult[] }>({
    queryKey: ['search', queryStr],
    enabled: queryStr.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const response: APIResponse<{ results: SearchResult[] }> = await window.sqts.search.global(queryStr);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Search failed');
      }
      return response.data;
    },
  });
}
