import type { WorkspaceRef } from '@harnesys/contracts';
import { describeEnvironment, resolveEnvironment } from '@harnesys/studio-shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  FolderGit2Icon,
  FolderIcon,
  GitBranchIcon,
  MonitorIcon,
} from 'lucide-react';
import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import { type Thread, toClientThread, useThreadStore } from '@/entities/thread';
import {
  isAbsoluteDirectoryPath,
  loadRecentDirectories,
  rememberRecentDirectory,
} from '@/entities/thread/model/thread-binding';
import { executionProfilesQuery, updateThreadBinding } from '@/shared/api';
import { getSourceLocation, sourceLocationQueryKey } from '@/shared/api/source-location';
import { listSources, sourceHasGitVcs } from '@/shared/api/sources';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { toast } from '@/shared/ui/toast';
import { FolderBrowser } from '@/widgets/folder-browser';
import { GitRepoMenuItems, useGitStatus } from '@/widgets/project-sidebar/ui/git-menu';
import {
  type DirSource,
  isSubpathRef,
  LockedBadge,
  provenanceLabelOf,
  type SubpathRef,
  sourceForRef,
  useIssueWorkspaceRef,
  WorkspaceOptions,
  withoutSubpath,
  workspaceLayers,
  workspaceValueOf,
} from './thread-binding-parts';

const CHIP_TRIGGER_CLASS =
  'inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-sm outline-none hover:bg-muted disabled:pointer-events-none disabled:opacity-50';

export function ThreadBindingBar({
  orgId,
  thread,
  agent,
}: {
  orgId: string | null;
  thread: Thread | null;
  agent: Agent | null;
}) {
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const runProfileId = thread?.runProfileId ?? null;
  const locked = thread?.bindingLocked ?? false;
  const rawRef = thread?.workspaceRef ?? null;
  const threadRef = rawRef !== null && rawRef.kind === 'inherit' ? null : rawRef;
  const profilesQuery = useQuery({
    ...executionProfilesQuery(orgId ?? ''),
    enabled: Boolean(orgId),
  });
  const sourcesQuery = useQuery({
    queryKey: ['sources', orgId] as const,
    queryFn: () => listSources(orgId ?? ''),
    enabled: Boolean(orgId),
  });
  const sources = sourcesQuery.data?.sources ?? [];
  const locations = useQueries({
    queries: sources.map((source) => ({
      queryKey: sourceLocationQueryKey(source.id),
      queryFn: () => getSourceLocation(source.id),
      enabled: sources.length > 0,
      staleTime: 600000,
    })),
  });
  const dirSources: DirSource[] = sources.map((source, index) => ({
    source,
    absoluteRoot: locations[index]?.data?.absoluteRoot ?? null,
  }));
  const { issueWorkspace, issueRef } = useIssueWorkspaceRef(orgId, thread, sources);
  const sourceNameOf = (sourceId: string) =>
    sources.find((source) => source.id === sourceId)?.name ?? sourceId.slice(0, 8);
  const layers = workspaceLayers({ issueWorkspace, issueRef, threadRef, agent });
  const environment = resolveEnvironment({ layers, issue: issueWorkspace });
  const resolved = issueWorkspace || threadRef !== null || agent !== null;
  const chipLabel = resolved ? describeEnvironment(environment, sourceNameOf) : 'Use agent default';
  const provenanceLabel = provenanceLabelOf(issueWorkspace, resolved, environment);
  const activeProfile = profilesQuery.data?.items.find((profile) => profile.id === runProfileId);
  const refSource = sourceForRef(threadRef, sources, dirSources);
  const gitSource = refSource && sourceHasGitVcs(refSource) ? refSource : undefined;
  const gitStatus = useGitStatus(gitSource?.id ?? '');
  const branchLabel = gitStatus?.branch ?? 'branch';
  const currentValue = workspaceValueOf(threadRef);
  const patch = (body: { runProfileId?: string | null; workspaceRef?: WorkspaceRef | null }) => {
    if (!thread) {
      return;
    }
    updateThreadBinding(thread.id, body)
      .then((summary) => {
        useThreadStore.getState().upsert(toClientThread(summary));
      })
      .catch((error: unknown) => {
        toast.add({ title: bindingErrorMessage(error) });
      });
  };
  return (
    <div className="flex min-w-0 items-center gap-1" data-testid="thread-binding-bar">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={locked || !thread}
          className={CHIP_TRIGGER_CLASS}
          aria-label="Execution profile"
          data-testid="thread-binding-profile"
        >
          <MonitorIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{activeProfile?.name ?? 'Inherit'}</span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-52">
          <DropdownMenuRadioGroup
            value={runProfileId ?? ''}
            onValueChange={(value) => patch({ runProfileId: value === '' ? null : value })}
          >
            <DropdownMenuRadioItem value="">Inherit</DropdownMenuRadioItem>
            {(profilesQuery.data?.items ?? []).map((profile) => (
              <DropdownMenuRadioItem key={profile.id} value={profile.id}>
                {profile.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={directoryOpen} onOpenChange={setDirectoryOpen}>
        <PopoverTrigger
          disabled={locked || !thread || issueWorkspace}
          className={CHIP_TRIGGER_CLASS}
          aria-label="Workspace"
          data-testid="thread-binding-directory"
        >
          {gitSource ? (
            <FolderGit2Icon className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{chipLabel}</span>
          {provenanceLabel ? (
            <span className="shrink-0 text-muted-foreground text-xs">{provenanceLabel}</span>
          ) : null}
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 p-2">
          <WorkspacePopoverBody
            orgId={orgId}
            workspaceRef={threadRef}
            dirSources={dirSources}
            currentValue={currentValue}
            onPatch={(workspaceRef) => patch({ workspaceRef })}
            onClose={() => setDirectoryOpen(false)}
          />
        </PopoverContent>
      </Popover>
      {gitSource ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={locked}
            className={CHIP_TRIGGER_CLASS}
            aria-label="Source git actions"
            data-testid="thread-binding-branch"
          >
            <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="max-w-40 truncate">{branchLabel}</span>
            <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <GitRepoMenuItems projectId={gitSource.id} />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {locked ? <LockedBadge /> : null}
    </div>
  );
}

function WorkspacePopoverBody({
  orgId,
  workspaceRef,
  dirSources,
  currentValue,
  onPatch,
  onClose,
}: {
  orgId: string | null;
  workspaceRef: WorkspaceRef | null;
  dirSources: DirSource[];
  currentValue: string;
  onPatch: (ref: WorkspaceRef | null) => void;
  onClose: () => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const [recents, setRecents] = useState<string[]>(() =>
    orgId ? loadRecentDirectories(orgId) : [],
  );
  const subpathRef = workspaceRef && isSubpathRef(workspaceRef) ? workspaceRef : null;
  const [subpathDraft, setSubpathDraft] = useState(subpathRef?.subpath ?? '');
  const subpathInvalid = subpathDraft.trim().startsWith('/');
  const pickFolder = (path: string) => {
    onPatch({ kind: 'folder', path });
    if (orgId) {
      setRecents(rememberRecentDirectory(orgId, path));
    }
    onClose();
  };
  const applySubpath = () => {
    if (!subpathRef) {
      return;
    }
    const trimmed = subpathDraft.trim();
    if (trimmed.startsWith('/')) {
      return;
    }
    onPatch(trimmed === '' ? withoutSubpath(subpathRef) : { ...subpathRef, subpath: trimmed });
  };
  if (customOpen) {
    return (
      <CustomFolderPicker
        orgId={orgId}
        path={customPath}
        onChange={setCustomPath}
        onCancel={() => setCustomOpen(false)}
        onSelect={(path) => {
          pickFolder(path);
          setCustomOpen(false);
        }}
      />
    );
  }
  return (
    <div className="flex flex-col">
      <WorkspaceOptions
        dirSources={dirSources}
        recents={recents}
        currentValue={currentValue}
        onInherit={() => {
          onPatch(null);
          onClose();
        }}
        onSandbox={() => {
          onPatch({ kind: 'sandbox' });
          onClose();
        }}
        onSource={(sourceId) => {
          onPatch(sourceRefWithSubpath(subpathRef, sourceId));
          onClose();
        }}
        onFolder={pickFolder}
        onCustom={() => {
          setCustomPath('');
          setCustomOpen(true);
        }}
      />
      {subpathRef ? (
        <SubpathEditor
          value={subpathDraft}
          invalid={subpathInvalid}
          onChange={setSubpathDraft}
          onApply={applySubpath}
        />
      ) : null}
    </div>
  );
}

function bindingErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Failed to update binding';
}

function sourceRefWithSubpath(subpathRef: SubpathRef | null, sourceId: string): WorkspaceRef {
  const subpath =
    subpathRef !== null && subpathRef.sourceId === sourceId ? subpathRef.subpath : undefined;
  return { kind: 'source', sourceId, ...(subpath ? { subpath } : {}) };
}

function SubpathEditor({
  value,
  invalid,
  onChange,
  onApply,
}: {
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <div className="mt-1 flex flex-col gap-1 border-t pt-2">
      <div className="flex items-center gap-1.5">
        <Input
          className="h-7 min-w-0 flex-1 font-mono text-xs"
          placeholder="subfolder"
          aria-label="Workspace subfolder"
          aria-invalid={invalid || undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onApply();
            }
          }}
        />
        <Button type="button" size="sm" variant="outline" disabled={invalid} onClick={onApply}>
          Apply
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {invalid
          ? 'Subfolder must not start with a slash'
          : 'Relative to the workspace root. Leave empty for the root.'}
      </p>
    </div>
  );
}

function CustomFolderPicker({
  orgId,
  path,
  onChange,
  onCancel,
  onSelect,
}: {
  orgId: string | null;
  path: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSelect: (path: string) => void;
}) {
  const trimmed = path.trim();
  return (
    <div className="flex flex-col gap-2">
      <FolderBrowser orgId={orgId ?? undefined} autoFocus onChange={onChange} />
      <div className="flex items-center justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!isAbsoluteDirectoryPath(trimmed)}
          onClick={() => {
            if (isAbsoluteDirectoryPath(trimmed)) {
              onSelect(trimmed);
            }
          }}
        >
          Select
        </Button>
      </div>
    </div>
  );
}
