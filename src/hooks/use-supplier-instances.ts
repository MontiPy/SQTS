import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  SupplierProject,
  SupplierScheduleItemInstance,
  ActivityStatus,
  APIResponse
} from '@shared/types';

// Supplier Projects
export function useSupplierProjects(supplierId?: number) {
  return useQuery<SupplierProject[]>({
    queryKey: supplierId ? ['suppliers', supplierId, 'projects'] : ['supplier-projects'],
    queryFn: async () => {
      if (!supplierId) {
        throw new Error('Supplier ID is required');
      }
      const response: APIResponse<SupplierProject[]> = await window.sqts.supplierInstances.listSupplierProjects(supplierId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch supplier projects');
      }
      return response.data;
    },
    enabled: !!supplierId,
  });
}

export function useSupplierProject(supplierId: number, projectId: number) {
  return useQuery<SupplierProject>({
    queryKey: ['supplier-projects', supplierId, projectId],
    queryFn: async () => {
      const response: APIResponse<SupplierProject> = await window.sqts.supplierInstances.getSupplierProject(supplierId, projectId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch supplier project');
      }
      return response.data;
    },
    enabled: !!supplierId && !!projectId,
  });
}

// Supplier Grid - get all instances for a project-activity combo
export function useSupplierGrid(projectId: number, activityId?: number) {
  return useQuery({
    queryKey: ['supplier-grid', projectId, activityId],
    queryFn: async () => {
      const response: APIResponse<any> = await window.sqts.supplierInstances.getGrid(projectId, activityId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch supplier grid');
      }
      return response.data;
    },
    enabled: !!projectId,
  });
}

// Update instance status
interface UpdateInstanceStatusParams {
  instanceId: number;
  status: ActivityStatus;
  actualDate?: string | null;
  completionDate?: string | null;
}

export function useUpdateInstanceStatus() {
  const queryClient = useQueryClient();

  return useMutation<SupplierScheduleItemInstance, Error, UpdateInstanceStatusParams>({
    mutationFn: async (params) => {
      const response: APIResponse<SupplierScheduleItemInstance> = await window.sqts.supplierInstances.updateStatus(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update status');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-grid'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-projects'] });
    },
  });
}

// Batch update status
interface BatchUpdateStatusParams {
  instanceIds: number[];
  status: ActivityStatus;
  actualDate?: string | null;
  completionDate?: string | null;
}

export function useBatchUpdateStatus() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, BatchUpdateStatusParams>({
    mutationFn: async (params) => {
      const response: APIResponse<void> = await window.sqts.supplierInstances.batchUpdateStatus(params);
      if (!response.success) {
        throw new Error(response.error || 'Failed to batch update status');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-grid'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-projects'] });
    },
  });
}

// Update instance notes
interface UpdateInstanceNotesParams {
  instanceId: number;
  notes: string | null;
}

export function useUpdateInstanceNotes() {
  const queryClient = useQueryClient();

  return useMutation<SupplierScheduleItemInstance, Error, UpdateInstanceNotesParams>({
    mutationFn: async (params) => {
      const response: APIResponse<SupplierScheduleItemInstance> = await window.sqts.supplierInstances.updateNotes(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update notes');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-grid'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-projects'] });
    },
  });
}

// Toggle date override
interface ToggleOverrideParams {
  instanceId: number;
  enabled: boolean;
  date?: string | null;
}

export function useToggleOverride() {
  const queryClient = useQueryClient();

  return useMutation<SupplierScheduleItemInstance, Error, ToggleOverrideParams>({
    mutationFn: async (params) => {
      const response: APIResponse<SupplierScheduleItemInstance> = await window.sqts.supplierInstances.toggleOverride(params.instanceId, params.enabled, params.date);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to toggle override');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-grid'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-projects'] });
    },
  });
}

// Toggle locked
interface ToggleLockParams {
  instanceId: number;
  locked: boolean;
}

export function useToggleLock() {
  const queryClient = useQueryClient();

  return useMutation<SupplierScheduleItemInstance, Error, ToggleLockParams>({
    mutationFn: async (params) => {
      const response: APIResponse<SupplierScheduleItemInstance> = await window.sqts.supplierInstances.toggleLock(params.instanceId, params.locked);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to toggle lock');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-grid'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-projects'] });
    },
  });
}
