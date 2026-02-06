import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppSettings, APIResponse } from '@shared/types';

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const response: APIResponse<AppSettings> = await window.sqts.settings.getAll();
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch settings');
      }
      return response.data;
    },
  });
}

interface UpdateSettingParams {
  key: string;
  value: string | boolean | string[];
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, UpdateSettingParams>({
    mutationFn: async (params) => {
      const response: APIResponse<void> = await window.sqts.settings.update(params);
      if (!response.success) {
        throw new Error(response.error || 'Failed to update setting');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
