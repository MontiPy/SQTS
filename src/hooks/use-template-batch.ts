import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  APIResponse,
  ProjectTemplateStatus,
  BatchApplyResult,
  TemplateOutOfSyncActivity,
  BatchSyncResult,
} from '@shared/types';

export function useProjectTemplateStatus(templateId: number) {
  return useQuery<ProjectTemplateStatus[]>({
    queryKey: ['template-batch', 'project-status', templateId],
    queryFn: async () => {
      const response: APIResponse<ProjectTemplateStatus[]> = await window.sqts.templateBatch.getProjectStatus(templateId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to get project template status');
      }
      return response.data;
    },
    enabled: !!templateId,
  });
}

export function useBatchApplyToProjects() {
  const queryClient = useQueryClient();

  return useMutation<BatchApplyResult[], Error, { activityTemplateId: number; projectIds: number[] }>({
    mutationFn: async (params) => {
      const response: APIResponse<BatchApplyResult[]> = await window.sqts.templateBatch.applyToProjects(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to batch apply template');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['template-batch'] });
    },
  });
}

export function useTemplateOutOfSync(templateId: number) {
  return useQuery<TemplateOutOfSyncActivity[]>({
    queryKey: ['template-batch', 'out-of-sync', templateId],
    queryFn: async () => {
      const response: APIResponse<TemplateOutOfSyncActivity[]> = await window.sqts.templateBatch.checkOutOfSync(templateId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to check out-of-sync activities');
      }
      return response.data;
    },
    enabled: !!templateId,
  });
}

export function useBatchSync() {
  const queryClient = useQueryClient();

  return useMutation<BatchSyncResult[], Error, { projectActivityIds: number[] }>({
    mutationFn: async (params) => {
      const response: APIResponse<BatchSyncResult[]> = await window.sqts.templateBatch.syncAll(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to batch sync');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-batch'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
