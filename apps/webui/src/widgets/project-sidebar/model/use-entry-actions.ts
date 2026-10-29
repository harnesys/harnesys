import { useQueryClient } from '@tanstack/react-query';
import {
  downloadProjectEntry,
  duplicateProjectEntry,
  revealProjectEntry,
} from '@/shared/api/files';
import { toast } from '@/shared/ui/toast';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useEntryActions(projectId: string, worktreeId?: string) {
  const queryClient = useQueryClient();
  const invalidateTree = () => {
    void queryClient.invalidateQueries({ queryKey: ['sources', projectId] });
  };
  return {
    duplicate: (path: string) => {
      duplicateProjectEntry(projectId, path, worktreeId)
        .then(() => {
          invalidateTree();
          toast.add({ title: 'Duplicated' });
        })
        .catch((error: unknown) => {
          toast.add({ title: errorMessage(error, 'Duplicate failed') });
        });
    },
    reveal: (path: string) => {
      revealProjectEntry(projectId, path, worktreeId).catch((error: unknown) => {
        toast.add({ title: errorMessage(error, 'Reveal failed') });
      });
    },
    download: (path: string, name: string, isDir: boolean) => {
      toast.add({ title: 'Preparing download…' });
      downloadProjectEntry(projectId, path, name, isDir, worktreeId).catch((error: unknown) => {
        toast.add({ title: errorMessage(error, 'Download failed') });
      });
    },
  };
}
