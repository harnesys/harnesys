import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProject,
  deleteProject,
  pickProjectFolder,
  projectQuery,
  projectQueryKey,
  updateProject,
  wipeProject,
} from '@/shared/api';
export function useProjects() {
  return useQuery(projectQuery);
}
export function usePickProjectFolder() {
  return useMutation({
    mutationFn: pickProjectFolder,
  });
}
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { path?: string; name?: string; nodeId?: string }) => createProject(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectQueryKey });
    },
  });
}
export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      path?: string;
      color?: string | null;
    }) => updateProject(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectQueryKey });
    },
  });
}
export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectQueryKey });
    },
  });
}
export function useWipeProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, wipeFolder }: { id: string; wipeFolder?: boolean }) =>
      wipeProject(id, { wipeFolder }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectQueryKey });
    },
  });
}
