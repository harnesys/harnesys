import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AttachProviderModelInput,
  attachProviderModel,
  createProvider,
  deleteProvider,
  detachProviderModel,
  discoverProviderModels,
  exportProviders,
  importProviders,
  providersQuery,
  providersQueryKeyFor,
  type UpdateProviderInput,
  type UpdateProviderModelInput,
  updateProvider,
  updateProviderModel,
} from '@/shared/api';
export function useProviders(orgId: string) {
  return useQuery(providersQuery(orgId));
}
export function useCreateProvider(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createProvider>[1]) => createProvider(orgId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(orgId) }),
  });
}
export function useUpdateProvider(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: UpdateProviderInput & {
      id: string;
    }) => updateProvider(orgId, id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(orgId) }),
  });
}
export function useDeleteProvider(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProvider(orgId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(orgId) }),
  });
}
export function useDiscoverProviderModels(orgId: string) {
  return useMutation({
    mutationFn: (id: string) => discoverProviderModels(orgId, id),
  });
}
export function useAttachProviderModel(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      providerId,
      ...input
    }: {
      providerId: string;
    } & AttachProviderModelInput) => attachProviderModel(orgId, providerId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(orgId) }),
  });
}
export function useUpdateProviderModel(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      providerId,
      modelId,
      ...input
    }: {
      providerId: string;
      modelId: string;
    } & UpdateProviderModelInput) => updateProviderModel(orgId, providerId, modelId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(orgId) }),
  });
}
export function useDetachProviderModel(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, modelId }: { providerId: string; modelId: string }) =>
      detachProviderModel(orgId, providerId, modelId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(orgId) }),
  });
}
export function useExportProviders(orgId: string) {
  return useMutation({
    mutationFn: () => exportProviders(orgId),
  });
}
export function useImportProviders(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bundle: Parameters<typeof importProviders>[1]) => importProviders(orgId, bundle),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(orgId) }),
  });
}
