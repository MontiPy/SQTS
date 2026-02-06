import { useQuery } from '@tanstack/react-query';
import type { DashboardStats, OverdueItem, APIResponse } from '@shared/types';

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
