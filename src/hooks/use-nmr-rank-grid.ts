import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NmrRankGridData, NmrRankGridUpdateParams, APIResponse } from '@shared/types';

export function useNmrRankGrid() {
  return useQuery<NmrRankGridData>({
    queryKey: ['nmr-rank-grid'],
    queryFn: async () => {
      const response: APIResponse<NmrRankGridData> = await window.sqts.nmrRankGrid.get();
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch NMR rank grid');
      }
      return response.data;
    },
  });
}

export function useUpdateNmrRanks() {
  const queryClient = useQueryClient();

  return useMutation<{ updated: number }, Error, NmrRankGridUpdateParams>({
    mutationFn: async (params) => {
      const response: APIResponse<{ updated: number }> = await window.sqts.nmrRankGrid.update(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update NMR ranks');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nmr-rank-grid'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-projects'] });
    },
  });
}
