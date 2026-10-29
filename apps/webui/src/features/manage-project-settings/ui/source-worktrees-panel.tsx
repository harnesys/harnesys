import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useThreadWorktreeStore } from '@/entities/thread';
import { useSelectedThread } from '@/features/desk';
import { selfNodeCached } from '@/shared/api/fleet';
import {
  createRepositoryWorktree,
  deleteRepositoryWorktree,
  listRepositoryWorktrees,
  type RepositoryWorktree,
  repositoryWorktreesQueryKey,
} from '@/shared/api/repository-worktrees';
import { listGitBranches } from '@/shared/api/sources';
import { randomUUID } from '@/shared/lib/random-uuid';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/toast';

interface SourceWorktreesPanelProps {
  orgId: string;
  sourceId: string;
}

export function SourceWorktreesPanel({ orgId, sourceId }: SourceWorktreesPanelProps) {
  const queryClient = useQueryClient();
  const hostId = selfNodeCached() ?? '';
  const thread = useSelectedThread();
  const bind = useThreadWorktreeStore((state) => state.bind);
  const [branch, setBranch] = useState('');
  const [createBranch, setCreateBranch] = useState(false);
  const [newBranch, setNewBranch] = useState('');
  const worktreesQuery = useQuery({
    queryKey: repositoryWorktreesQueryKey(orgId, sourceId),
    queryFn: () => listRepositoryWorktrees(orgId, sourceId),
    enabled: Boolean(orgId && sourceId),
  });
  const branchesQuery = useQuery({
    queryKey: ['sources', orgId, sourceId, 'branches', hostId],
    queryFn: () => listGitBranches(orgId, sourceId, hostId),
    enabled: Boolean(orgId && sourceId && hostId),
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createRepositoryWorktree(orgId, sourceId, {
        hostId,
        operationId: randomUUID(),
        branch: createBranch ? newBranch.trim() : branch,
        createBranch,
        ...(createBranch && branch ? { from: branch } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: repositoryWorktreesQueryKey(orgId, sourceId),
      });
      setNewBranch('');
      toast.add({ title: 'Worktree created' });
    },
    onError: (error) => {
      toast.add({
        title: 'Create worktree failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (worktreeId: string) => deleteRepositoryWorktree(orgId, sourceId, worktreeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: repositoryWorktreesQueryKey(orgId, sourceId),
      });
      toast.add({ title: 'Worktree deleted' });
    },
    onError: (error) => {
      toast.add({
        title: 'Delete worktree failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
  const worktrees = worktreesQuery.data?.worktrees ?? [];
  const branches = branchesQuery.data?.branches ?? [];

  return (
    <section className="flex flex-col gap-3" data-testid="source-worktrees-panel">
      <div>
        <h2 className="font-medium text-sm">Standalone worktrees</h2>
        <p className="text-muted-foreground text-xs">
          Create a worktree without an Issue, bind it to the current chat, or delete when clean.
        </p>
      </div>
      <FieldGroup className="gap-3 rounded-md border p-3">
        <Field>
          <FieldLabel>Branch</FieldLabel>
          <Select
            value={branch || undefined}
            onValueChange={(value) => {
              if (typeof value === 'string') {
                setBranch(value);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            If the branch is already checked out, create a new branch from it instead.
          </FieldDescription>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={createBranch}
            onChange={(event) => setCreateBranch(event.target.checked)}
          />
          Create new branch from selected
        </label>
        {createBranch ? (
          <Field>
            <FieldLabel>New branch name</FieldLabel>
            <Input value={newBranch} onChange={(event) => setNewBranch(event.target.value)} />
          </Field>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={
            !hostId ||
            createMutation.isPending ||
            (!createBranch && !branch) ||
            (createBranch && !newBranch.trim())
          }
          onClick={() => createMutation.mutate()}
        >
          Create worktree
        </Button>
      </FieldGroup>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            <tr>
              <th className="px-3 py-2">Branch</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Git</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {worktrees.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-muted-foreground" colSpan={4}>
                  No standalone worktrees yet.
                </td>
              </tr>
            ) : (
              worktrees.map((row) => (
                <WorktreeRow
                  key={row.id}
                  row={row}
                  onUse={() => {
                    if (!thread?.id) {
                      toast.add({ title: 'Open a chat thread first' });
                      return;
                    }
                    bind(thread.id, {
                      sourceId,
                      worktreeId: row.id,
                      branch: row.branch,
                      hostId: row.hostId,
                    });
                    toast.add({ title: `Bound ${row.branch} to chat` });
                  }}
                  onDelete={() => deleteMutation.mutate(row.id)}
                  deleting={deleteMutation.isPending}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WorktreeRow({
  row,
  onUse,
  onDelete,
  deleting,
}: {
  row: RepositoryWorktree;
  onUse: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const canDelete =
    row.state === 'ready' && !row.activeRunId && row.dirty !== true && row.unpushed !== true;
  const gitLabel = [
    row.dirty ? 'dirty' : 'clean',
    row.unpushed ? 'unpushed' : null,
    row.activeRunId ? 'active run' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <tr className="border-t" data-testid={`source-worktree-${row.id}`}>
      <td className="px-3 py-2 font-mono text-xs">{row.branch}</td>
      <td className="px-3 py-2 text-xs">{row.state}</td>
      <td className="px-3 py-2 text-muted-foreground text-xs">{gitLabel}</td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={row.state !== 'ready'}
            onClick={onUse}
          >
            Use in chat
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!canDelete || deleting}
            title={canDelete ? 'Delete worktree' : 'Blocked until clean and idle'}
            onClick={onDelete}
          >
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}
