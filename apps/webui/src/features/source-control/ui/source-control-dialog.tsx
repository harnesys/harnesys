import type { GitFileStatus } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  getGitFileStatus,
  getGitStatus,
  gitFileStatusQueryKey,
  gitStatusQueryKey,
} from '@/shared/api/git';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import {
  buildDiscardRequest,
  type DiscardRequest,
  deriveFileGroups,
  type FileEntry,
  type SourceControlDialogData,
  type SourceControlTab,
} from '../model/source-control';
import { useSourceControlMutations } from '../model/use-source-control-mutations';
import { SourceControlChangeList } from './source-control-change-list';
import { SourceControlComposer } from './source-control-composer';
import { SourceControlDiffPane } from './source-control-diff-pane';
import { SourceControlDiscardOverlay } from './source-control-discard-overlay';
import { SourceControlHeader } from './source-control-header';
import { SourceControlHistory } from './source-control-history';

export function SourceControlDialog({
  onResolve,
  data,
}: DialogComponentProps<undefined, SourceControlDialogData>) {
  const projectId = data?.projectId ?? '';
  const [tab, setTab] = useState<SourceControlTab>('changes');
  const [message, setMessage] = useState(data?.message ?? '');
  const [amend, setAmend] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(data?.focusPath ?? null);
  const [discardRequest, setDiscardRequest] = useState<DiscardRequest | null>(null);
  const previousStatuses = useRef<Map<string, GitFileStatus>>(new Map());
  const fileStatusQuery = useQuery({
    queryKey: gitFileStatusQueryKey(projectId),
    queryFn: () => getGitFileStatus(projectId),
    enabled: Boolean(projectId),
  });
  const gitStatusQuery = useQuery({
    queryKey: gitStatusQueryKey(projectId),
    queryFn: () => getGitStatus(projectId),
    enabled: Boolean(projectId),
  });
  const mutations = useSourceControlMutations(projectId);
  const groups = deriveFileGroups(fileStatusQuery.data);
  const files = groups.files;
  const git = gitStatusQuery.data?.isGit ? gitStatusQuery.data : null;
  const hasRemote = Boolean(git?.remote);
  const checkedPaths = new Set(
    files.filter((file) => !excluded.has(file.path)).map((file) => file.path),
  );
  const stagedPaths = new Set(groups.staged.map((file) => file.path));
  const selectedEntry = files.find((file) => file.path === selectedPath) ?? null;
  useEffect(() => {
    const previous = previousStatuses.current;
    const next = new Set(excluded);
    let changed = false;
    for (const file of files) {
      if (!previous.has(file.path)) {
        if (file.status === 'untracked') {
          next.add(file.path);
          changed = true;
        }
      } else if (previous.get(file.path) === 'untracked' && file.status !== 'untracked') {
        if (next.delete(file.path)) {
          changed = true;
        }
      }
    }
    previousStatuses.current = new Map(files.map((file) => [file.path, file.status]));
    if (changed) {
      setExcluded(next);
    }
  }, [files, excluded]);
  useEffect(() => {
    if (files.length === 0) {
      if (selectedPath) {
        setSelectedPath(null);
      }
      return;
    }
    if (!selectedPath || !files.some((file) => file.path === selectedPath)) {
      setSelectedPath(files[0]?.path ?? null);
    }
  }, [files, selectedPath]);
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
    setExcluded(checked ? new Set() : new Set(files.map((file) => file.path)));
  };
  const openDiscard = (entries: FileEntry[]) => {
    if (entries.length > 0) {
      setDiscardRequest(buildDiscardRequest(entries));
    }
  };
  const canCommit =
    checkedPaths.size > 0 && message.trim().length > 0 && !mutations.commitMutation.isPending;
  const runCommit = (push: boolean) => {
    if (!canCommit) {
      return;
    }
    mutations.commitMutation.mutate(
      {
        message: message.trim(),
        paths: [...checkedPaths],
        amend,
      },
      {
        onSuccess: () => {
          if (push) {
            mutations.pushMutation.mutate(undefined, {
              onSuccess: () => onResolve?.(undefined),
              onError: () => onResolve?.(undefined),
            });
            return;
          }
          onResolve?.(undefined);
        },
      },
    );
  };
  return (
    <form
      className="relative flex min-h-0 flex-1 flex-col gap-3"
      onSubmit={(event) => event.preventDefault()}
    >
      <SourceControlHeader
        branch={git?.branch ?? null}
        detached={git?.detached ?? false}
        branches={git?.branches?.local ?? []}
        ahead={git?.ahead ?? 0}
        behind={git?.behind ?? 0}
        hasRemote={hasRemote}
        isFetching={mutations.fetchMutation.isPending}
        onCheckout={(branch) => mutations.checkoutMutation.mutate(branch)}
        onFetch={() => mutations.fetchMutation.mutate()}
        onPull={() => mutations.pullMutation.mutate()}
        onPush={() => mutations.pushMutation.mutate()}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
        {tab === 'changes' ? (
          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <div className="flex min-h-0 w-full shrink-0 flex-col border-b bg-card sm:w-[348px] sm:border-r sm:border-b-0">
              <div className="shrink-0 border-b p-2">
                <SourceControlTabs tab={tab} count={files.length} onChange={setTab} />
              </div>
              <SourceControlChangeList
                groups={groups}
                selectedPath={selectedPath}
                checkedPaths={checkedPaths}
                isLoading={fileStatusQuery.isPending}
                onSelect={setSelectedPath}
                onToggleChecked={toggleChecked}
                onToggleAll={toggleAll}
                onStage={(paths) => mutations.stageMutation.mutate(paths)}
                onUnstage={(paths) => mutations.unstageMutation.mutate(paths)}
                onDiscard={openDiscard}
              />
              <SourceControlComposer
                message={message}
                onMessageChange={setMessage}
                onGenerate={() =>
                  mutations.generateMutation.mutate([...checkedPaths], {
                    onSuccess: (result) => setMessage(result.message),
                  })
                }
                generatePending={mutations.generateMutation.isPending}
                amend={amend}
                onAmendChange={setAmend}
                headSha={git?.head ?? null}
                checkedCount={checkedPaths.size}
                totalCount={files.length}
                canCommit={checkedPaths.size > 0}
              />
            </div>
            <div className="flex min-h-[240px] flex-1 flex-col sm:min-h-0">
              <SourceControlDiffPane
                projectId={projectId}
                entry={selectedEntry}
                staged={selectedEntry ? stagedPaths.has(selectedEntry.path) : false}
                onStage={(paths) => mutations.stageMutation.mutate(paths)}
                onUnstage={(paths) => mutations.unstageMutation.mutate(paths)}
                onDiscard={openDiscard}
              />
            </div>
          </div>
        ) : (
          <SourceControlHistory
            projectId={projectId}
            active={tab === 'history'}
            remote={git?.remote ?? null}
            revertPending={mutations.revertMutation.isPending}
            tabs={<SourceControlTabs tab={tab} count={files.length} onChange={setTab} />}
            onRevert={(sha) => mutations.revertMutation.mutate(sha)}
            onBranchFrom={mutations.handleBranchFrom}
          />
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.(undefined)}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => runCommit(true)}
          disabled={!canCommit || !hasRemote}
          title={!hasRemote ? 'No remote configured' : 'Commit and push to remote'}
        >
          Commit & Push
        </Button>
        <Button type="button" disabled={!canCommit} onClick={() => runCommit(false)}>
          Commit{files.length > 0 ? ` · ${checkedPaths.size}` : ''}
        </Button>
      </DialogFooter>
      {discardRequest ? (
        <SourceControlDiscardOverlay
          key={discardRequest.paths.join('|')}
          request={discardRequest}
          pending={mutations.discardMutation.isPending}
          onCancel={() => setDiscardRequest(null)}
          onConfirm={(deleteUntracked) =>
            mutations.discardMutation.mutate(
              {
                paths: discardRequest.paths,
                untrackedPaths: deleteUntracked ? discardRequest.untrackedPaths : [],
              },
              { onSuccess: () => setDiscardRequest(null) },
            )
          }
        />
      ) : null}
    </form>
  );
}

function SourceControlTabs({
  tab,
  count,
  onChange,
}: {
  tab: SourceControlTab;
  count: number;
  onChange: (tab: SourceControlTab) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="tablist" aria-label="Source control views">
      <TabButton active={tab === 'changes'} onClick={() => onChange('changes')}>
        Changes <span className="text-muted-foreground tabular-nums">{count}</span>
      </TabButton>
      <TabButton active={tab === 'history'} onClick={() => onChange('history')}>
        History
      </TabButton>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? 'rounded-md bg-muted px-2 py-1 font-medium text-xs'
          : 'rounded-md px-2 py-1 text-muted-foreground text-xs hover:bg-muted/60'
      }
    >
      {children}
    </button>
  );
}
