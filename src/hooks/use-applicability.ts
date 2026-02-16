import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ActivityTemplateApplicabilityRule,
  ActivityTemplateApplicabilityClause,
  APIResponse,
  CreateApplicabilityRuleParams,
  UpdateApplicabilityRuleParams,
  CreateApplicabilityClauseParams,
  UpdateApplicabilityClauseParams,
} from '@shared/types';

// ── Rules ──────────────────────────────────────────────────────

export function useApplicabilityRule(templateId: number) {
  return useQuery<ActivityTemplateApplicabilityRule | null>({
    queryKey: ['applicability-rule', templateId],
    queryFn: async () => {
      const response: APIResponse<ActivityTemplateApplicabilityRule | null> =
        await window.sqts.applicabilityRules.get(templateId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch applicability rule');
      }
      return response.data ?? null;
    },
    enabled: !!templateId,
  });
}

export function useCreateApplicabilityRule() {
  const queryClient = useQueryClient();

  return useMutation<ActivityTemplateApplicabilityRule, Error, CreateApplicabilityRuleParams>({
    mutationFn: async (params) => {
      const response: APIResponse<ActivityTemplateApplicabilityRule> =
        await window.sqts.applicabilityRules.create(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create applicability rule');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['applicability-rule', data.activityTemplateId] });
    },
  });
}

export function useUpdateApplicabilityRule() {
  const queryClient = useQueryClient();

  return useMutation<
    ActivityTemplateApplicabilityRule,
    Error,
    { id: number; params: UpdateApplicabilityRuleParams }
  >({
    mutationFn: async ({ id, params }) => {
      const response: APIResponse<ActivityTemplateApplicabilityRule> =
        await window.sqts.applicabilityRules.update(id, params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update applicability rule');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['applicability-rule', data.activityTemplateId] });
    },
  });
}

export function useDeleteApplicabilityRule() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: number; templateId: number }>({
    mutationFn: async ({ id }) => {
      const response: APIResponse<void> = await window.sqts.applicabilityRules.delete(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete applicability rule');
      }
    },
    onSuccess: (_, { templateId }) => {
      queryClient.invalidateQueries({ queryKey: ['applicability-rule', templateId] });
      queryClient.invalidateQueries({ queryKey: ['applicability-clauses'] });
    },
  });
}

// ── Clauses ────────────────────────────────────────────────────

export function useApplicabilityClauses(ruleId: number | undefined) {
  return useQuery<ActivityTemplateApplicabilityClause[]>({
    queryKey: ['applicability-clauses', ruleId],
    queryFn: async () => {
      const response: APIResponse<ActivityTemplateApplicabilityClause[]> =
        await window.sqts.applicabilityClauses.list(ruleId!);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch applicability clauses');
      }
      return response.data;
    },
    enabled: !!ruleId,
  });
}

export function useCreateApplicabilityClause() {
  const queryClient = useQueryClient();

  return useMutation<ActivityTemplateApplicabilityClause, Error, CreateApplicabilityClauseParams>({
    mutationFn: async (params) => {
      const response: APIResponse<ActivityTemplateApplicabilityClause> =
        await window.sqts.applicabilityClauses.create(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create applicability clause');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['applicability-clauses', data.ruleId] });
    },
  });
}

export function useUpdateApplicabilityClause() {
  const queryClient = useQueryClient();

  return useMutation<
    ActivityTemplateApplicabilityClause,
    Error,
    { id: number; ruleId: number; params: UpdateApplicabilityClauseParams }
  >({
    mutationFn: async ({ id, params }) => {
      const response: APIResponse<ActivityTemplateApplicabilityClause> =
        await window.sqts.applicabilityClauses.update(id, params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update applicability clause');
      }
      return response.data;
    },
    onSuccess: (_, { ruleId }) => {
      queryClient.invalidateQueries({ queryKey: ['applicability-clauses', ruleId] });
    },
  });
}

export function useDeleteApplicabilityClause() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: number; ruleId: number }>({
    mutationFn: async ({ id }) => {
      const response: APIResponse<void> = await window.sqts.applicabilityClauses.delete(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete applicability clause');
      }
    },
    onSuccess: (_, { ruleId }) => {
      queryClient.invalidateQueries({ queryKey: ['applicability-clauses', ruleId] });
    },
  });
}
