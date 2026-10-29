import type { ProjectMoveItem } from '@harnesys/studio-shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { useDeskStore } from '@/features/desk';
import { rememberProjectMoves, useIdeStore } from '@/features/ide';
import { moveProjectFiles, sourceFilesTreeQueryKey } from '@/shared/api/files';
import { gitFileStatusQueryKey, gitStatusQueryKey } from '@/shared/api/git';
import { useOrgId } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { normalizeProjectPath, remapProjectPath } from '@/shared/lib/project-path.ts';
import { toast } from '@/shared/ui/toast';

function migrateFileContentQueries(
  qc: ReturnType<typeof useQueryClient>,
  projectId: string,
  moves: ProjectMoveItem[],
  worktreeId?: string,
): void {
  const entries = qc.getQueriesData<string>({ queryKey: ['source-file-content', projectId] });
  for (const [key, data] of entries) {
    const path = key[2];
    const scope = key.length > 3 ? key[3] : '';
    if (typeof path !== 'string' || data === undefined) {
      continue;
    }
    if ((worktreeId ?? '') !== (typeof scope === 'string' ? scope : '')) {
      continue;
    }
    const current = normalizeProjectPath(path);
    const next = remapProjectPath(current, moves);
    if (next === current) {
      continue;
    }
    qc.setQueryData(['source-file-content', projectId, next, worktreeId ?? ''], data);
    qc.removeQueries({ queryKey: key, exact: true });
  }
}
function navigateIfFocusMoved(args: {
  navigate: ReturnType<typeof useNavigate>;
  orgId: string | null;
  pathname: string;
  projectId: string;
  moves: ProjectMoveItem[];
}): void {
  const { navigate, orgId, pathname, projectId, moves } = args;
  if (!orgId) {
    return;
  }
  const filePrefix = `/o/${orgId}/${projectId}/file/`;
  const diffPrefix = `/o/${orgId}/${projectId}/diff/`;
  let kind: 'file' | 'diff' | null = null;
  if (pathname.startsWith(filePrefix)) {
    kind = 'file';
  } else if (pathname.startsWith(diffPrefix)) {
    kind = 'diff';
  }
  if (!kind) {
    return;
  }
  const prefix = kind === 'file' ? filePrefix : diffPrefix;
  const current = normalizeProjectPath(decodeURIComponent(pathname.slice(prefix.length)));
  const next = remapProjectPath(current, moves);
  if (next === current) {
    return;
  }
  const to =
    kind === 'file'
      ? studioPath.file(orgId, projectId, next)
      : studioPath.diff(orgId, projectId, next);
  void navigate(to, { replace: true });
}
export function useMoveProjectFiles(projectId: string, worktreeId?: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const orgId = useOrgId();
  const location = useLocation();
  return useMutation({
    mutationFn: (items: ProjectMoveItem[]) => moveProjectFiles(projectId, items, worktreeId),
    onSuccess: (result) => {
      const moved = result.moved;
      if (!worktreeId) {
        rememberProjectMoves(projectId, moved);
      }
      useIdeStore.getState().remapPaths(projectId, moved, worktreeId);
      useDeskStore.getState().remapProjectFiles(projectId, moved);
      migrateFileContentQueries(qc, projectId, moved, worktreeId);
      if (!worktreeId) {
        navigateIfFocusMoved({
          navigate,
          orgId,
          pathname: location.pathname,
          projectId,
          moves: moved,
        });
      }
      void qc.invalidateQueries({ queryKey: sourceFilesTreeQueryKey(projectId) });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(projectId) });
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(projectId) });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'git', 'file-status'] });
    },
    onError: (err: unknown) => {
      toast.add({
        title: 'Move failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });
}
