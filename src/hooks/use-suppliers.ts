import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Supplier, APIResponse } from '@shared/types';

export function useSuppliers() {
  return useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const response: APIResponse<Supplier[]> = await window.sqts.suppliers.list();
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch suppliers');
      }
      return response.data;
    },
  });
}

export function useSupplier(id: number) {
  return useQuery<Supplier>({
    queryKey: ['suppliers', id],
    queryFn: async () => {
      const response: APIResponse<Supplier> = await window.sqts.suppliers.get(id);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch supplier');
      }
      return response.data;
    },
    enabled: !!id,
  });
}

interface CreateSupplierParams {
  name: string;
  notes?: string;
  nmrRank?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();

  return useMutation<Supplier, Error, CreateSupplierParams>({
    mutationFn: async (params) => {
      const response: APIResponse<Supplier> = await window.sqts.suppliers.create(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create supplier');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}

interface UpdateSupplierParams {
  id: number;
  name?: string;
  notes?: string;
  nmrRank?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();

  return useMutation<Supplier, Error, UpdateSupplierParams>({
    mutationFn: async (params) => {
      const response: APIResponse<Supplier> = await window.sqts.suppliers.update(params.id, params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update supplier');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers', data.id] });
    },
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const response: APIResponse<void> = await window.sqts.suppliers.delete(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete supplier');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}
