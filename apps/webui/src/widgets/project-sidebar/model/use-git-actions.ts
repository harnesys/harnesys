import { useMutation, useQueryClient } from '@tanstack/react-query';
import { openNewBranchDialog } from '@/features/git-branch';
import { openSourceControlDialog } from '@/features/source-control';
import { getActiveOrgId } from '@/shared/api/active-org';
import { sourceFilesTreeQueryKey } from '@/shared/api/files';
import { selfNodeCached } from '@/shared/api/fleet';
import {
  checkoutGitBranch,
  createGitBranch,
  gitFileStatusQueryKey,
  gitStatusQueryKey,
  invalidateGitOrgSummary,
  mergeGitBranch,
  pullGit,
  pushGit,
  stageGit,
} from '@/shared/api/git';
import { deleteGitBranch } from '@/shared/api/sources';
import { toast } from '@/shared/ui/toast';
export function useGitActions(projectId: string) {
  const qc = useQueryClient();
  const checkoutMutation = useMutation({
    mutationFn: (branch: string) => checkoutGitBranch(projectId, branch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(projectId) });
      invalidateGitOrgSummary(qc);
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(projectId) });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'git', 'file-status'] });
      void qc.invalidateQueries({ queryKey: sourceFilesTreeQueryKey(projectId) });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Checkout failed';
      toast.add({ title: 'Checkout failed', description: msg });
    },
  });
  const mergeMutation = useMutation({
    mutationFn: (branch: string) => mergeGitBranch(projectId, branch),
    onSuccess: (_data, branch) => {
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(projectId) });
      invalidateGitOrgSummary(qc);
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(projectId) });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'git', 'file-status'] });
      void qc.invalidateQueries({ queryKey: sourceFilesTreeQueryKey(projectId) });
      toast.add({ title: `Merged '${branch}'` });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Merge failed';
      toast.add({ title: 'Merge failed', description: msg });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (branch: string) => {
      const orgId = getActiveOrgId();
      const hostId = selfNodeCached();
      if (!orgId || !hostId) {
        throw new Error('No active org or host');
      }
      return deleteGitBranch(orgId, projectId, branch, hostId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(projectId) });
      invalidateGitOrgSummary(qc);
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(projectId) });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'git', 'file-status'] });
      void qc.invalidateQueries({ queryKey: ['git-branches'] });
      toast.add({ title: 'Branch deleted' });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Delete branch failed';
      toast.add({ title: 'Delete branch failed', description: msg });
    },
  });
  const createMutation = useMutation({
    mutationFn: (input: { name: string; checkout: boolean; from?: string }) =>
      createGitBranch(projectId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(projectId) });
      invalidateGitOrgSummary(qc);
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(projectId) });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Create branch failed';
      toast.add({ title: 'Create branch failed', description: msg });
    },
  });
  const pushMutation = useMutation({
    mutationFn: () => pushGit(projectId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(projectId) });
      invalidateGitOrgSummary(qc);
      toast.add({ title: 'Pushed' });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Push failed';
      toast.add({ title: 'Push failed', description: msg });
    },
  });
  const pullMutation = useMutation({
    mutationFn: () => pullGit(projectId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(projectId) });
      invalidateGitOrgSummary(qc);
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(projectId) });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'git', 'file-status'] });
      void qc.invalidateQueries({ queryKey: sourceFilesTreeQueryKey(projectId) });
      toast.add({ title: 'Updated' });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Update failed';
      toast.add({ title: 'Update failed', description: msg });
    },
  });
  const stageMutation = useMutation({
    mutationFn: (paths: string[]) => stageGit(projectId, paths),
    onSuccess: (_data, paths) => {
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(projectId) });
      invalidateGitOrgSummary(qc);
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(projectId) });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'git', 'file-status'] });
      void qc.invalidateQueries({ queryKey: sourceFilesTreeQueryKey(projectId) });
      const title = paths.length === 0 ? 'Staged all' : `Staged ${paths.length}`;
      toast.add({ title });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Stage failed';
      toast.add({ title: 'Stage failed', description: msg });
    },
  });
  const handleNewBranch = (from?: string) => {
    void openNewBranchDialog(from).then((result) => {
      if (!result) {
        return;
      }
      createMutation.mutate({ name: result.name, checkout: result.checkout, from });
    });
  };
  const handleCommit = () => {
    void openSourceControlDialog(projectId);
  };
  const handlePush = () => {
    pushMutation.mutate();
  };
  const handlePull = () => {
    pullMutation.mutate();
  };
  const handleAddAll = () => {
    stageMutation.mutate([]);
  };
  const handleAddSelected = (paths: string[]) => {
    if (paths.length === 0) {
      return;
    }
    stageMutation.mutate(paths);
  };
  return {
    checkoutMutation,
    mergeMutation,
    createMutation,
    deleteMutation,
    pushMutation,
    pullMutation,
    stageMutation,
    handleNewBranch,
    handleCommit,
    handlePush,
    handlePull,
    handleAddAll,
    handleAddSelected,
  };
}
