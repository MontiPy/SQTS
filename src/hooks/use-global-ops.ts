import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SyncAndPropagateResult, APIResponse } from '@shared/types';

export function useSyncAndPropagate() {
  const queryClient = useQueryClient();

  return useMutation<SyncAndPropagateResult, Error>({
    mutationFn: async () => {
      const response: APIResponse<SyncAndPropagateResult> = await window.sqts.globalOps.syncAndPropagate();
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to sync and propagate');
      }
      return response.data;
    },
    onSuccess: () => {
      // Invalidate everything that could have changed
      queryClient.invalidateQueries({ queryKey: ['propagation-preview'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-grid'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['project-activities'] });
      queryClient.invalidateQueries({ queryKey: ['template-sync'] });
    },
  });
}
