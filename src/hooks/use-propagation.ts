import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PropagationPreview, PropagationResult, APIResponse } from '@shared/types';

export function usePropagationPreview(projectId: number) {
  return useQuery<PropagationPreview>({
    queryKey: ['propagation-preview', projectId],
    queryFn: async () => {
      const response: APIResponse<PropagationPreview> = await window.sqts.propagation.preview(projectId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch propagation preview');
      }
      return response.data;
    },
    enabled: !!projectId,
  });
}

interface ApplyPropagationParams {
  projectId: number;
  supplierIds?: number[];
}

export function useApplyPropagation() {
  const queryClient = useQueryClient();

  return useMutation<PropagationResult, Error, ApplyPropagationParams>({
    mutationFn: async (params) => {
      const response: APIResponse<PropagationResult> = await window.sqts.propagation.apply(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to apply propagation');
      }
      return response.data;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['propagation-preview', params.projectId] });
      queryClient.invalidateQueries({ queryKey: ['supplier-grid'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
