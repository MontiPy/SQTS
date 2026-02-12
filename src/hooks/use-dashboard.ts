import { useQuery } from '@tanstack/react-query';
import type { DashboardStats, OverdueItem, DueSoonItem, SupplierProgressRow, ProjectProgressRow, APIResponse } from '@shared/types';

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const response: APIResponse<DashboardStats> = await window.sqts.dashboard.stats();
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch dashboard stats');
      }
      return response.data;
    },
  });
}

interface OverdueParams {
  supplierId?: number;
  projectId?: number;
}

export function useOverdueItems(params?: OverdueParams) {
  return useQuery<OverdueItem[]>({
    queryKey: ['dashboard', 'overdue', params],
    queryFn: async () => {
      const response: APIResponse<OverdueItem[]> = await window.sqts.dashboard.overdue(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch overdue items');
      }
      return response.data;
    },
  });
}

export function useDueSoonItems(params?: OverdueParams) {
  return useQuery<DueSoonItem[]>({
    queryKey: ['dashboard', 'due-soon', params],
    queryFn: async () => {
      const response: APIResponse<DueSoonItem[]> = await window.sqts.dashboard.dueSoon(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch due soon items');
      }
      return response.data;
    },
  });
}

export function useSupplierProgress() {
  return useQuery<SupplierProgressRow[]>({
    queryKey: ['dashboard', 'supplier-progress'],
    queryFn: async () => {
      const response: APIResponse<SupplierProgressRow[]> = await window.sqts.dashboard.supplierProgress();
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch supplier progress');
      }
      return response.data;
    },
  });
}

export function useProjectProgress() {
  return useQuery<ProjectProgressRow[]>({
    queryKey: ['dashboard', 'project-progress'],
    queryFn: async () => {
      const response: APIResponse<ProjectProgressRow[]> = await window.sqts.dashboard.projectProgress();
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch project progress');
      }
      return response.data;
    },
  });
}
