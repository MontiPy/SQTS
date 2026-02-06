import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, ProjectMilestone, APIResponse } from '@shared/types';

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const response: APIResponse<Project[]> = await window.sqts.projects.list();
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch projects');
      }
      return response.data;
    },
  });
}

export function useProject(id: number) {
  return useQuery<Project>({
    queryKey: ['projects', id],
    queryFn: async () => {
      const response: APIResponse<Project> = await window.sqts.projects.get(id);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch project');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

interface CreateProjectParams {
  name: string;
  version: string;
  defaultAnchorRule?: string;
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation<Project, Error, CreateProjectParams>({
    mutationFn: async (params) => {
      const response: APIResponse<Project> = await window.sqts.projects.create(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create project');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

interface UpdateProjectParams {
  id: number;
  name?: string;
  version?: string;
  defaultAnchorRule?: string;
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation<Project, Error, UpdateProjectParams>({
    mutationFn: async (params) => {
      const response: APIResponse<Project> = await window.sqts.projects.update(params.id, params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update project');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', data.id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const response: APIResponse<void> = await window.sqts.projects.delete(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete project');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

// Milestones
export function useMilestones(projectId: number) {
  return useQuery<ProjectMilestone[]>({
    queryKey: ['projects', projectId, 'milestones'],
    queryFn: async () => {
      const response: APIResponse<ProjectMilestone[]> = await window.sqts.milestones.list(projectId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch milestones');
      }
      return response.data;
    },
    enabled: !!projectId,
  });
}

interface CreateMilestoneParams {
  projectId: number;
  name: string;
  date: string | null;
  sortOrder: number;
}

export function useCreateMilestone() {
  const queryClient = useQueryClient();

  return useMutation<ProjectMilestone, Error, CreateMilestoneParams>({
    mutationFn: async (params) => {
      const response: APIResponse<ProjectMilestone> = await window.sqts.milestones.create(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create milestone');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects', data.projectId, 'milestones'] });
    },
  });
}

interface UpdateMilestoneParams {
  id: number;
  name?: string;
  date?: string | null;
  sortOrder?: number;
}

export function useUpdateMilestone() {
  const queryClient = useQueryClient();

  return useMutation<ProjectMilestone, Error, UpdateMilestoneParams>({
    mutationFn: async (params) => {
      const response: APIResponse<ProjectMilestone> = await window.sqts.milestones.update(params.id, params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update milestone');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects', data.projectId, 'milestones'] });
    },
  });
}

export function useDeleteMilestone() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: number; projectId: number }>({
    mutationFn: async ({ id }) => {
      const response: APIResponse<void> = await window.sqts.milestones.delete(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete milestone');
      }
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'milestones'] });
    },
  });
}
