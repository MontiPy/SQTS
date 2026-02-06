import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProjectActivity, APIResponse } from '@shared/types';

interface ProjectActivityWithTemplate extends ProjectActivity {
  templateName: string;
  templateCategory: string | null;
  scheduleItemCount: number;
}

export function useProjectActivities(projectId: number) {
  return useQuery<ProjectActivityWithTemplate[]>({
    queryKey: ['projects', projectId, 'activities'],
    queryFn: async () => {
      const response: APIResponse<ProjectActivityWithTemplate[]> = await window.sqts.projectActivities.list(projectId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch project activities');
      }
      return response.data;
    },
    enabled: !!projectId,
  });
}

interface AddProjectActivityParams {
  projectId: number;
  activityTemplateId: number;
}

export function useAddProjectActivity() {
  const queryClient = useQueryClient();

  return useMutation<ProjectActivity, Error, AddProjectActivityParams>({
    mutationFn: async (params) => {
      const response: APIResponse<ProjectActivity> = await window.sqts.projectActivities.add(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to add activity to project');
      }
      return response.data;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['projects', params.projectId, 'activities'] });
    },
  });
}

export function useRemoveProjectActivity() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { projectActivityId: number; projectId: number }>({
    mutationFn: async ({ projectActivityId }) => {
      const response: APIResponse<void> = await window.sqts.projectActivities.remove(projectActivityId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to remove activity from project');
      }
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'activities'] });
    },
  });
}
