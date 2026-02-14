import { useQuery } from '@tanstack/react-query';
import type { AuditListParams, AuditListResult, APIResponse } from '@shared/types';

export function useAuditLog(params: AuditListParams) {
  return useQuery<AuditListResult>({
    queryKey: ['audit', params],
    queryFn: async () => {
      const response: APIResponse<AuditListResult> = await window.sqts.audit.list(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch audit log');
      }
      return response.data;
    },
  });
}
