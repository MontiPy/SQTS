import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TemplateVersion, APIResponse } from '@shared/types';

export function useTemplateVersions(templateId: number) {
  return useQuery<TemplateVersion[]>({
    queryKey: ['template-versions', templateId],
    queryFn: async () => {
      const response: APIResponse<TemplateVersion[]> = await window.sqts.templateVersions.list(templateId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch template versions');
      }
      return response.data;
    },
    enabled: !!templateId,
  });
}

export function useSaveTemplateVersion() {
  const queryClient = useQueryClient();

  return useMutation<TemplateVersion, Error, { activityTemplateId: number; name: string; description?: string }>({
    mutationFn: async (params) => {
      const response: APIResponse<TemplateVersion> = await window.sqts.templateVersions.save(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to save template version');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['template-versions', data.activityTemplateId] });
    },
  });
}

export function useRestoreTemplateVersion() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: number; templateId: number }>({
    mutationFn: async ({ id }) => {
      const response: APIResponse<void> = await window.sqts.templateVersions.restore(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to restore template version');
      }
    },
    onSuccess: (_, { templateId }) => {
      queryClient.invalidateQueries({ queryKey: ['activity-templates', templateId] });
      queryClient.invalidateQueries({ queryKey: ['activity-templates', templateId, 'schedule-items'] });
    },
  });
}

export function useDeleteTemplateVersion() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: number; templateId: number }>({
    mutationFn: async ({ id }) => {
      const response: APIResponse<void> = await window.sqts.templateVersions.delete(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete template version');
      }
    },
    onSuccess: (_, { templateId }) => {
      queryClient.invalidateQueries({ queryKey: ['template-versions', templateId] });
    },
  });
}
