import { useMutation, useQueryClient } from '@tanstack/react-query';
import { openNewBranchDialog } from '@/features/git-branch';
import { sourceFilesTreeQueryKey } from '@/shared/api/files';
import {
  checkoutGitBranch,
  commitGit,
  createGitBranch,
  discardGit,
  fetchGit,
  generateCommitMessage,
  gitFileStatusQueryKey,
  gitStatusQueryKey,
  invalidateGitOrgSummary,
  pullGit,
  pushGit,
  revertGit,
  stageGit,
  unstageGit,
} from '@/shared/api/git';
import { toast } from '@/shared/ui/toast';

export function useSourceControlMutations(projectId: string) {
  const qc = useQueryClient();
  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: gitStatusQueryKey(projectId) });
    void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(projectId) });
    void qc.invalidateQueries({ queryKey: ['sources', projectId, 'git', 'diff'] });
    void qc.invalidateQueries({ queryKey: ['sources', projectId, 'git', 'log'] });
    void qc.invalidateQueries({ queryKey: ['projects', projectId, 'git', 'file-status'] });
    void qc.invalidateQueries({ queryKey: sourceFilesTreeQueryKey(projectId) });
    invalidateGitOrgSummary(qc);
  };
  const stageMutation = useMutation({
    mutationFn: (paths: string[]) => stageGit(projectId, paths),
    onSuccess: (_result, paths) => {
      invalidateAll();
      toast.add({
        title: paths.length === 0 ? 'Staged all changes' : `Staged ${paths.length} file(s)`,
      });
    },
    onError: (err: unknown) => {
      toast.add({ title: 'Stage failed', description: errorMessage(err) });
    },
  });
  const unstageMutation = useMutation({
    mutationFn: (paths: string[]) => unstageGit(projectId, paths),
    onSuccess: (_result, paths) => {
      invalidateAll();
      toast.add({
        title: paths.length === 0 ? 'Unstaged all changes' : `Unstaged ${paths.length} file(s)`,
      });
    },
    onError: (err: unknown) => {
      toast.add({ title: 'Unstage failed', description: errorMessage(err) });
    },
  });
  const discardMutation = useMutation({
    mutationFn: (input: { paths: string[]; untrackedPaths: string[] }) =>
      discardGit(projectId, input.paths, input.untrackedPaths),
    onSuccess: (_result, input) => {
      invalidateAll();
      toast.add({ title: `Discarded ${input.paths.length} file(s)` });
    },
    onError: (err: unknown) => {
      toast.add({ title: 'Discard failed', description: errorMessage(err) });
    },
  });
  const generateMutation = useMutation({
    mutationFn: (paths: string[]) => generateCommitMessage(projectId, paths),
    onError: (err: unknown) => {
      toast.add({ title: 'Commit message failed', description: errorMessage(err) });
    },
  });
  const commitMutation = useMutation({
    mutationFn: async (input: { message: string; paths: string[]; amend: boolean }) => {
      await commitGit(projectId, input.message, input.paths, input.amend);
      return input;
    },
    onSuccess: () => {
      invalidateAll();
      toast.add({ title: 'Committed' });
    },
    onError: (err: unknown) => {
      toast.add({ title: 'Commit failed', description: errorMessage(err) });
    },
  });
  const fetchMutation = useMutation({
    mutationFn: () => fetchGit(projectId),
    onSuccess: () => {
      invalidateAll();
      toast.add({ title: 'Fetched from remote' });
    },
    onError: (err: unknown) => {
      toast.add({ title: 'Fetch failed', description: errorMessage(err) });
    },
  });
  const checkoutMutation = useMutation({
    mutationFn: (branch: string) => checkoutGitBranch(projectId, branch),
    onSuccess: (_result, branch) => {
      invalidateAll();
      toast.add({ title: `Switched to ${branch}` });
    },
    onError: (err: unknown) => {
      toast.add({ title: 'Checkout failed', description: errorMessage(err) });
    },
  });
  const pullMutation = useMutation({
    mutationFn: () => pullGit(projectId),
    onSuccess: () => {
      invalidateAll();
      toast.add({ title: 'Pulled' });
    },
    onError: (err: unknown) => {
      toast.add({ title: 'Pull failed', description: errorMessage(err) });
    },
  });
  const pushMutation = useMutation({
    mutationFn: () => pushGit(projectId),
    onSuccess: () => {
      invalidateAll();
      toast.add({ title: 'Pushed' });
    },
    onError: (err: unknown) => {
      toast.add({ title: 'Push failed', description: errorMessage(err) });
    },
  });
  const revertMutation = useMutation({
    mutationFn: (sha: string) => revertGit(projectId, sha),
    onSuccess: (_result, sha) => {
      invalidateAll();
      toast.add({ title: `Reverted ${sha.slice(0, 7)}` });
    },
    onError: (err: unknown) => {
      toast.add({ title: 'Revert failed', description: errorMessage(err) });
    },
  });
  const handleBranchFrom = (sha: string) => {
    void openNewBranchDialog(sha.slice(0, 7)).then(async (result) => {
      if (!result) {
        return;
      }
      try {
        await createGitBranch(projectId, {
          name: result.name,
          checkout: result.checkout,
          from: sha,
        });
        invalidateAll();
        toast.add({ title: `Created ${result.name}` });
      } catch (err: unknown) {
        toast.add({ title: 'Create branch failed', description: errorMessage(err) });
      }
    });
  };
  return {
    stageMutation,
    unstageMutation,
    discardMutation,
    generateMutation,
    commitMutation,
    fetchMutation,
    checkoutMutation,
    pullMutation,
    pushMutation,
    revertMutation,
    handleBranchFrom,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}
