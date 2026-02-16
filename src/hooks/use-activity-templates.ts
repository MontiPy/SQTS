import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ActivityTemplate, ActivityTemplateScheduleItem, AnchorType, APIResponse } from '@shared/types';

export function useActivityTemplates() {
  return useQuery<ActivityTemplate[]>({
    queryKey: ['activity-templates'],
    queryFn: async () => {
      const response: APIResponse<ActivityTemplate[]> = await window.sqts.activityTemplates.list();
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch activity templates');
      }
      return response.data;
    },
  });
}

export function useActivityTemplate(id: number) {
  return useQuery<ActivityTemplate>({
    queryKey: ['activity-templates', id],
    queryFn: async () => {
      const response: APIResponse<ActivityTemplate> = await window.sqts.activityTemplates.get(id);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch activity template');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

interface CreateActivityTemplateParams {
  name: string;
  description?: string;
  category?: string;
}

export function useCreateActivityTemplate() {
  const queryClient = useQueryClient();

  return useMutation<ActivityTemplate, Error, CreateActivityTemplateParams>({
    mutationFn: async (params) => {
      const response: APIResponse<ActivityTemplate> = await window.sqts.activityTemplates.create(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create activity template');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-templates'] });
    },
  });
}

interface UpdateActivityTemplateParams {
  id: number;
  name?: string;
  description?: string;
  category?: string;
}

export function useUpdateActivityTemplate() {
  const queryClient = useQueryClient();

  return useMutation<ActivityTemplate, Error, UpdateActivityTemplateParams>({
    mutationFn: async (params) => {
      const response: APIResponse<ActivityTemplate> = await window.sqts.activityTemplates.update(params.id, params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update activity template');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['activity-templates'] });
      queryClient.invalidateQueries({ queryKey: ['activity-templates', data.id] });
    },
  });
}

export function useDeleteActivityTemplate() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const response: APIResponse<void> = await window.sqts.activityTemplates.delete(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete activity template');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-templates'] });
    },
  });
}

export function useDuplicateActivityTemplate() {
  const queryClient = useQueryClient();

  return useMutation<ActivityTemplate, Error, { id: number; newName: string }>({
    mutationFn: async ({ id, newName }) => {
      const response: APIResponse<ActivityTemplate> = await window.sqts.activityTemplates.duplicate(id, newName);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to duplicate activity template');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-templates'] });
    },
  });
}

// Template Schedule Items
export function useTemplateScheduleItems(templateId: number) {
  return useQuery<ActivityTemplateScheduleItem[]>({
    queryKey: ['activity-templates', templateId, 'schedule-items'],
    queryFn: async () => {
      const response: APIResponse<ActivityTemplateScheduleItem[]> = await window.sqts.templateScheduleItems.list(templateId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch schedule items');
      }
      return response.data;
    },
    enabled: !!templateId,
  });
}

interface CreateTemplateScheduleItemParams {
  activityTemplateId: number;
  kind: 'MILESTONE' | 'TASK';
  name: string;
  anchorType: AnchorType;
  anchorRefId?: number | null;
  anchorMilestoneName?: string | null;
  offsetDays?: number | null;
  fixedDate?: string | null;
  sortOrder: number;
}

export function useCreateTemplateScheduleItem() {
  const queryClient = useQueryClient();

  return useMutation<ActivityTemplateScheduleItem, Error, CreateTemplateScheduleItemParams>({
    mutationFn: async (params) => {
      const response: APIResponse<ActivityTemplateScheduleItem> = await window.sqts.templateScheduleItems.create(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create schedule item');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['activity-templates', data.activityTemplateId, 'schedule-items'] });
    },
  });
}

interface UpdateTemplateScheduleItemParams {
  id: number;
  templateId?: number;
  kind?: 'MILESTONE' | 'TASK';
  name?: string;
  anchorType?: AnchorType;
  anchorRefId?: number | null;
  anchorMilestoneName?: string | null;
  offsetDays?: number | null;
  fixedDate?: string | null;
  sortOrder?: number;
}

export function useUpdateTemplateScheduleItem() {
  const queryClient = useQueryClient();

  return useMutation<ActivityTemplateScheduleItem, Error, UpdateTemplateScheduleItemParams>({
    mutationFn: async (params) => {
      const response: APIResponse<ActivityTemplateScheduleItem> = await window.sqts.templateScheduleItems.update(params.id, params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update schedule item');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['activity-templates', data.activityTemplateId, 'schedule-items'] });
    },
  });
}

export function useDeleteTemplateScheduleItem() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: number; templateId: number }>({
    mutationFn: async ({ id }) => {
      const response: APIResponse<void> = await window.sqts.templateScheduleItems.delete(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete schedule item');
      }
    },
    onSuccess: (_, { templateId }) => {
      queryClient.invalidateQueries({ queryKey: ['activity-templates', templateId, 'schedule-items'] });
    },
  });
}
