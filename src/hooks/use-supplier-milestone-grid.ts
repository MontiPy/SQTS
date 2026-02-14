import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupplierMilestoneDateGrid, APIResponse } from '@shared/types';

export function useSupplierMilestoneGrid(projectId: number) {
  return useQuery<SupplierMilestoneDateGrid>({
    queryKey: ['supplier-milestone-grid', projectId],
    enabled: projectId > 0,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const response: APIResponse<SupplierMilestoneDateGrid> = await window.sqts.supplierMilestoneGrid.get(projectId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch supplier milestone grid');
      }
      return response.data;
    },
  });
}

interface UpdateParams {
  updates: Array<{ supplierProjectId: number; milestoneId: number; date: string | null }>;
}

export function useUpdateSupplierMilestoneDates(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation<{ updated: number }, Error, UpdateParams>({
    mutationFn: async (params) => {
      const response: APIResponse<{ updated: number }> = await window.sqts.supplierMilestoneGrid.update(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update supplier milestone dates');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-milestone-grid', projectId] });
    },
  });
}

interface FillRowParams {
  projectId: number;
  milestoneId: number;
  date: string;
}

export function useFillMilestoneRow(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation<{ updated: number }, Error, FillRowParams>({
    mutationFn: async (params) => {
      const response: APIResponse<{ updated: number }> = await window.sqts.supplierMilestoneGrid.fillRow(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fill milestone row');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-milestone-grid', projectId] });
    },
  });
}
