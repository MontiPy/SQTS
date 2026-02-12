import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProjectTemplate, ProjectTemplateDetail, APIResponse } from '@shared/types';

export function useProjectTemplates() {
  return useQuery<(ProjectTemplate & { milestoneCount: number; activityCount: number })[]>({
    queryKey: ['project-templates'],
    queryFn: async () => {
      const response: APIResponse<(ProjectTemplate & { milestoneCount: number; activityCount: number })[]> =
        await window.sqts.projectTemplates.list();
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch project templates');
      }
      return response.data;
    },
  });
}

export function useProjectTemplate(id: number) {
  return useQuery<ProjectTemplateDetail>({
    queryKey: ['project-templates', id],
    queryFn: async () => {
      const response: APIResponse<ProjectTemplateDetail> = await window.sqts.projectTemplates.get(id);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch project template');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

interface CreateProjectTemplateParams {
  name: string;
  description?: string | null;
}

export function useCreateProjectTemplate() {
  const queryClient = useQueryClient();

  return useMutation<ProjectTemplate, Error, CreateProjectTemplateParams>({
    mutationFn: async (params) => {
      const response: APIResponse<ProjectTemplate> = await window.sqts.projectTemplates.create(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create project template');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-templates'] });
    },
  });
}

interface UpdateProjectTemplateParams {
  id: number;
  name?: string;
  description?: string | null;
  milestones?: Array<{ category?: string | null; name: string; sortOrder: number }>;
  activities?: Array<{ activityTemplateId: number; sortOrder: number }>;
}

export function useUpdateProjectTemplate() {
  const queryClient = useQueryClient();

  return useMutation<ProjectTemplateDetail, Error, UpdateProjectTemplateParams>({
    mutationFn: async ({ id, ...params }) => {
      const response: APIResponse<ProjectTemplateDetail> = await window.sqts.projectTemplates.update(id, params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update project template');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project-templates'] });
      queryClient.invalidateQueries({ queryKey: ['project-templates', data.id] });
    },
  });
}

export function useDeleteProjectTemplate() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const response: APIResponse<void> = await window.sqts.projectTemplates.delete(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete project template');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-templates'] });
    },
  });
}

interface ApplyProjectTemplateParams {
  projectTemplateId: number;
  projectId: number;
}

interface ApplyProjectTemplateResult {
  milestonesAdded: number;
  milestonesSkipped: number;
  activitiesAdded: number;
  activitiesSkipped: number;
}

export function useApplyProjectTemplate() {
  const queryClient = useQueryClient();

  return useMutation<ApplyProjectTemplateResult, Error, ApplyProjectTemplateParams>({
    mutationFn: async (params) => {
      const response: APIResponse<ApplyProjectTemplateResult> = await window.sqts.projectTemplates.apply(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to apply project template');
      }
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects', variables.projectId, 'milestones'] });
      queryClient.invalidateQueries({ queryKey: ['project-activities'] });
    },
  });
}
