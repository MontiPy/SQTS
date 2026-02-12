import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { APIResponse, TemplateSyncPreview, ProjectActivity } from '@shared/types';

interface OutOfSyncActivity {
  id: number;
  templateVersion: number;
  latestVersion: number;
  templateName: string;
}

export function useOutOfSyncActivities(projectId: number) {
  return useQuery<OutOfSyncActivity[]>({
    queryKey: ['projects', projectId, 'out-of-sync'],
    queryFn: async () => {
      const response: APIResponse<OutOfSyncActivity[]> = await window.sqts.templateSync.checkOutOfSync(projectId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to check out-of-sync activities');
      }
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useTemplateSyncPreview(projectActivityId: number | null) {
  return useQuery<TemplateSyncPreview>({
    queryKey: ['template-sync-preview', projectActivityId],
    queryFn: async () => {
      const response: APIResponse<TemplateSyncPreview> = await window.sqts.templateSync.preview(projectActivityId!);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch sync preview');
      }
      return response.data;
    },
    enabled: projectActivityId != null,
  });
}

export function useApplyTemplateSync() {
  const queryClient = useQueryClient();

  return useMutation<ProjectActivity, Error, { projectActivityId: number; projectId: number }>({
    mutationFn: async ({ projectActivityId }) => {
      const response: APIResponse<ProjectActivity> = await window.sqts.templateSync.apply(projectActivityId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to apply template sync');
      }
      return response.data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'activities'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'out-of-sync'] });
      queryClient.invalidateQueries({ queryKey: ['template-sync-preview'] });
    },
  });
}
