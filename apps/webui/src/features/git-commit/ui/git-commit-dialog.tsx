import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2Icon, SparklesIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  generateCommitMessage,
  getGitFileStatus,
  getGitStatus,
  gitFileStatusQueryKey,
  gitStatusQueryKey,
} from '@/shared/api/git';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldError } from '@/shared/ui/field';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import {
  type CommitDialogResult,
  type CommitInput,
  commitSchema,
  emptyCommit,
} from '../model/git-commit';
import { GitCommitDiffView } from './git-commit-diff-view';
import { GitCommitFileList } from './git-commit-file-list';

interface DialogData {
  projectId: string;
  message?: string;
  focusPath?: string;
}
export function GitCommitDialog({
  onResolve,
  data,
}: DialogComponentProps<CommitDialogResult, DialogData>) {
  const projectId = data?.projectId ?? '';
  const form = useForm<CommitInput, unknown, CommitDialogResult>({
    resolver: zodResolver(commitSchema),
    defaultValues: data?.message ? { message: data.message } : emptyCommit(),
  });
  const statusQuery = useQuery({
    queryKey: gitFileStatusQueryKey(projectId),
    queryFn: () => getGitFileStatus(projectId),
    enabled: Boolean(projectId),
  });
  const gitStatusQuery = useQuery({
    queryKey: gitStatusQueryKey(projectId),
    queryFn: () => getGitStatus(projectId),
    enabled: Boolean(projectId),
  });
  const hasRemote = Boolean(gitStatusQuery.data?.isGit && gitStatusQuery.data.remote);
  const statusMap = statusQuery.data?.map ?? {};
  const files = Object.entries(statusMap)
    .filter(([, s]) => s !== 'ignored')
    .map(([path, status]) => ({ path, status }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const [selected, setSelected] = useState<string | null>(data?.focusPath ?? null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (files.length === 0) {
      setSelected(null);
      return;
    }
    if (!selected || !files.some((f) => f.path === selected)) {
      setSelected(files[0]?.path ?? null);
    }
  }, [files, selected]);
  const checkedPaths = new Set(files.filter((f) => !excluded.has(f.path)).map((f) => f.path));
  const commitPaths = [...checkedPaths];
  const toggleChecked = (path: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };
  const toggleAll = (checked: boolean) => {
    setExcluded(checked ? new Set() : new Set(files.map((f) => f.path)));
  };
  const generateMutation = useMutation({
    mutationFn: () => generateCommitMessage(projectId, commitPaths),
    onSuccess: (result) => {
      form.setValue('message', result.message, {
        shouldValidate: true,
        shouldDirty: true,
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      toast.add({ title: 'Commit message failed', description: msg });
    },
  });
  const hasChanges = files.length > 0;
  const canCommit = commitPaths.length > 0;
  const handleCommit = form.handleSubmit((values) =>
    onResolve?.({ ...values, paths: commitPaths, push: false }),
  );
  const handleCommitPush = form.handleSubmit((values) =>
    onResolve?.({ ...values, paths: commitPaths, push: true }),
  );
  return (
    <form className="flex min-h-0 flex-col gap-4" onSubmit={handleCommit}>
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border">
        <div className="flex h-[56vh] min-h-[340px] flex-col sm:flex-row">
          <div className="flex min-h-0 w-full shrink-0 flex-col border-b bg-card sm:w-[320px] sm:border-r sm:border-b-0">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <GitCommitFileList
                files={files}
                selectedPath={selected}
                onSelect={setSelected}
                checkedPaths={checkedPaths}
                onToggleChecked={toggleChecked}
                onToggleAll={toggleAll}
                isLoading={statusQuery.isPending}
              />
            </div>
            <div className="flex shrink-0 flex-col gap-1 border-t bg-card p-3">
              <Controller
                control={form.control}
                name="message"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <div className="relative">
                      <Textarea
                        {...field}
                        id="git-commit-message"
                        placeholder={hasChanges ? 'Commit message' : 'No changes to commit'}
                        rows={4}
                        autoFocus
                        className="min-h-[80px] resize-y pr-9 text-sm"
                        aria-invalid={fieldState.invalid || undefined}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-1 right-1 size-7 text-muted-foreground"
                        disabled={!canCommit || generateMutation.isPending}
                        onClick={() => generateMutation.mutate()}
                        title="Generate commit message"
                        aria-label="Generate commit message"
                        data-testid="git-commit-generate"
                      >
                        {generateMutation.isPending ? (
                          <Loader2Icon className="size-3.5 animate-spin" />
                        ) : (
                          <SparklesIcon className="size-3.5" />
                        )}
                      </Button>
                    </div>
                    {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
                  </Field>
                )}
              />
              {!hasRemote ? (
                <p className="text-[11px] text-muted-foreground">No remote — push disabled</p>
              ) : null}
            </div>
          </div>
          <div className="flex min-h-[240px] flex-1 flex-col bg-background sm:min-h-0">
            <GitCommitDiffView projectId={projectId} path={selected} />
          </div>
        </div>
      </div>

      <DialogFooter>
        <div className="mr-auto hidden min-w-0 flex-1 items-center sm:flex">
          {selected ? (
            <span
              className="truncate font-mono text-[10px] text-muted-foreground leading-tight"
              title={selected}
            >
              {selected}
            </span>
          ) : null}
        </div>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleCommitPush}
          disabled={!canCommit || !hasRemote}
          title={!hasRemote ? 'No remote configured' : 'Commit and push to remote'}
        >
          Commit & Push
        </Button>
        <Button type="button" onClick={handleCommit} disabled={!canCommit}>
          Commit{hasChanges ? ` · ${commitPaths.length}` : ''}
        </Button>
      </DialogFooter>
    </form>
  );
}
