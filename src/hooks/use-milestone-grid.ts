import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { MilestoneDateGridData, APIResponse } from '@shared/types';

export function useMilestoneGrid() {
  return useQuery<MilestoneDateGridData>({
    queryKey: ['milestone-grid'],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const response: APIResponse<MilestoneDateGridData> = await window.sqts.milestoneGrid.get();
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch milestone grid');
      }
      return response.data;
    },
  });
}

interface UpdateMilestoneDatesParams {
  updates: Array<{ milestoneId: number; date: string | null }>;
}

export function useUpdateMilestoneDates() {
  const queryClient = useQueryClient();

  return useMutation<{ updated: number }, Error, UpdateMilestoneDatesParams>({
    mutationFn: async (params) => {
      const response: APIResponse<{ updated: number }> = await window.sqts.milestoneGrid.update(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update milestone dates');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['milestone-grid'] });
      // Also invalidate project milestones since we updated project_milestones.date
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
