import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupplierLocationCode, Part, APIResponse } from '@shared/types';

// ==========================================
// Location Codes
// ==========================================

export function useLocationCodes(supplierId?: number) {
  return useQuery<SupplierLocationCode[]>({
    queryKey: ['location-codes', supplierId],
    queryFn: async () => {
      const response: APIResponse<SupplierLocationCode[]> = await window.sqts.locationCodes.list(supplierId!);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch location codes');
      }
      return response.data;
    },
    enabled: !!supplierId,
  });
}

interface CreateLocationCodeParams {
  supplierId: number;
  supplierNumber: string;
  locationCode: string;
}

export function useCreateLocationCode() {
  const queryClient = useQueryClient();

  return useMutation<SupplierLocationCode, Error, CreateLocationCodeParams>({
    mutationFn: async (params) => {
      const response: APIResponse<SupplierLocationCode> = await window.sqts.locationCodes.create(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create location code');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['location-codes', data.supplierId] });
    },
  });
}

interface UpdateLocationCodeParams {
  id: number;
  supplierId: number;
  supplierNumber?: string;
  locationCode?: string;
}

export function useUpdateLocationCode() {
  const queryClient = useQueryClient();

  return useMutation<SupplierLocationCode, Error, UpdateLocationCodeParams>({
    mutationFn: async (params) => {
      const response: APIResponse<SupplierLocationCode> = await window.sqts.locationCodes.update(params.id, params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update location code');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['location-codes', data.supplierId] });
    },
  });
}

export function useDeleteLocationCode() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: number; supplierId: number }>({
    mutationFn: async ({ id }) => {
      const response: APIResponse<void> = await window.sqts.locationCodes.delete(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete location code');
      }
    },
    onSuccess: (_, { supplierId }) => {
      queryClient.invalidateQueries({ queryKey: ['location-codes', supplierId] });
    },
  });
}

// ==========================================
// Parts
// ==========================================

export function useParts(supplierProjectId?: number) {
  return useQuery<(Part & { locationCode?: string; supplierNumber?: string })[]>({
    queryKey: ['parts', supplierProjectId],
    queryFn: async () => {
      const response: APIResponse<(Part & { locationCode?: string; supplierNumber?: string })[]> =
        await window.sqts.parts.list(supplierProjectId!);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch parts');
      }
      return response.data;
    },
    enabled: !!supplierProjectId,
  });
}

interface CreatePartParams {
  supplierProjectId: number;
  locationCodeId?: number | null;
  partNumber: string;
  description?: string | null;
  paRank?: string | null;
}

export function useCreatePart() {
  const queryClient = useQueryClient();

  return useMutation<Part, Error, CreatePartParams>({
    mutationFn: async (params) => {
      const response: APIResponse<Part> = await window.sqts.parts.create(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create part');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['parts', data.supplierProjectId] });
    },
  });
}

interface UpdatePartParams {
  id: number;
  supplierProjectId: number;
  locationCodeId?: number | null;
  partNumber?: string;
  description?: string | null;
  paRank?: string | null;
}

export function useUpdatePart() {
  const queryClient = useQueryClient();

  return useMutation<Part, Error, UpdatePartParams>({
    mutationFn: async (params) => {
      const response: APIResponse<Part> = await window.sqts.parts.update(params.id, params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update part');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['parts', data.supplierProjectId] });
    },
  });
}

export function useDeletePart() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: number; supplierProjectId: number }>({
    mutationFn: async ({ id }) => {
      const response: APIResponse<void> = await window.sqts.parts.delete(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete part');
      }
    },
    onSuccess: (_, { supplierProjectId }) => {
      queryClient.invalidateQueries({ queryKey: ['parts', supplierProjectId] });
    },
  });
}
