import type { WorkspaceRef } from '@harnesys/contracts';
import {
  type RunEnvironment,
  WORKSPACE_PROVENANCE_LABEL,
  type WorkspaceLayer,
} from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import {
  CheckIcon,
  FolderGit2Icon,
  FolderIcon,
  FolderSearchIcon,
  HistoryIcon,
  LockIcon,
} from 'lucide-react';
import type { Agent } from '@/entities/agent';
import type { Thread } from '@/entities/thread';
import { getIssueDetail } from '@/shared/api';
import type { Source } from '@/shared/api/sources';
import { sourceHasGitVcs } from '@/shared/api/sources';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';

export const INHERIT_VALUE = '__inherit__';
export const THREAD_MODE_VALUE = '__thread__';
export const SOURCE_PREFIX = 'source:';
export const FOLDER_PREFIX = 'folder:';

export interface DirSource {
  source: Source;
  absoluteRoot: string | null;
}

export type SubpathRef = Extract<WorkspaceRef, { kind: 'source' | 'worktree' }>;

export function isSubpathRef(ref: WorkspaceRef): ref is SubpathRef {
  return ref.kind === 'source' || ref.kind === 'worktree';
}

export function withoutSubpath(ref: SubpathRef): WorkspaceRef {
  if (ref.kind === 'worktree') {
    return { kind: 'worktree', sourceId: ref.sourceId, worktreeId: ref.worktreeId };
  }
  return { kind: 'source', sourceId: ref.sourceId };
}

export function workspaceValueOf(ref: WorkspaceRef | null): string {
  if (ref === null || ref.kind === 'inherit') {
    return INHERIT_VALUE;
  }
  if (ref.kind === 'thread') {
    return THREAD_MODE_VALUE;
  }
  if (ref.kind === 'folder') {
    return `${FOLDER_PREFIX}${ref.path}`;
  }
  return `${SOURCE_PREFIX}${ref.sourceId}`;
}

export function sourceForRef(
  ref: WorkspaceRef | null,
  sources: Source[],
  dirSources: DirSource[],
): Source | undefined {
  if (ref === null) {
    return undefined;
  }
  if (ref.kind === 'source' || ref.kind === 'worktree') {
    return sources.find((source) => source.id === ref.sourceId);
  }
  if (ref.kind === 'folder') {
    return dirSources.find((entry) => entry.absoluteRoot === ref.path)?.source;
  }
  return undefined;
}

export function WorkspaceOptions({
  dirSources,
  recents,
  currentValue,
  onInherit,
  onThreadMode,
  onSource,
  onFolder,
  onCustom,
}: {
  dirSources: DirSource[];
  recents: string[];
  currentValue: string;
  onInherit: () => void;
  onThreadMode: () => void;
  onSource: (sourceId: string) => void;
  onFolder: (path: string) => void;
  onCustom: () => void;
}) {
  const rootValues = new Set(
    dirSources.filter((entry) => entry.absoluteRoot).map((entry) => entry.absoluteRoot),
  );
  const folderRecents = recents.filter((path) => !rootValues.has(path)).slice(0, 5);
  return (
    <div className="flex max-h-80 flex-col overflow-y-auto">
      <OptionRow
        icon={<HistoryIcon className="size-4" />}
        label="Use agent default"
        detail="Follow the agent's default workspace"
        selected={currentValue === INHERIT_VALUE}
        onClick={onInherit}
      />
      <OptionRow
        icon={<FolderIcon className="size-4" />}
        label="Thread directory"
        detail="Private to this thread"
        selected={currentValue === THREAD_MODE_VALUE}
        onClick={onThreadMode}
      />
      {dirSources.length > 0 ? (
        <div className="mt-1 px-2 py-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
          Sources
        </div>
      ) : null}
      {dirSources.map((entry) => (
        <OptionRow
          key={entry.source.id}
          icon={
            sourceHasGitVcs(entry.source) ? (
              <FolderGit2Icon className="size-4" />
            ) : (
              <FolderIcon className="size-4" />
            )
          }
          label={entry.source.name}
          detail={entry.absoluteRoot ?? entry.source.id}
          selected={currentValue === `${SOURCE_PREFIX}${entry.source.id}`}
          onClick={() => onSource(entry.source.id)}
        />
      ))}
      {folderRecents.length > 0 ? (
        <div className="mt-1 px-2 py-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
          Recent
        </div>
      ) : null}
      {folderRecents.map((path) => (
        <OptionRow
          key={path}
          icon={<HistoryIcon className="size-4" />}
          label={path.split('/').filter(Boolean).pop() ?? path}
          detail={path}
          selected={currentValue === `${FOLDER_PREFIX}${path}`}
          onClick={() => onFolder(path)}
        />
      ))}
      <div className="mt-1 border-t pt-1">
        <OptionRow
          icon={<FolderSearchIcon className="size-4" />}
          label="Browse file system..."
          detail=""
          selected={false}
          onClick={onCustom}
        />
      </div>
    </div>
  );
}

function OptionRow({
  icon,
  label,
  detail,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
      onClick={onClick}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{label}</span>
        {detail ? (
          <span className="truncate font-mono text-muted-foreground text-xs">{detail}</span>
        ) : null}
      </span>
      {selected ? <CheckIcon className="ml-auto size-4 shrink-0" /> : null}
    </button>
  );
}

export function LockedBadge() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="inline-flex shrink-0 text-muted-foreground"
            data-testid="thread-binding-locked"
          />
        }
      >
        <LockIcon className="size-3.5 opacity-50" />
      </TooltipTrigger>
      <TooltipContent>Binding is locked after the first run</TooltipContent>
    </Tooltip>
  );
}

export function workspaceLayers(input: {
  issueWorkspace: boolean;
  issueRef: WorkspaceRef | null;
  threadRef: WorkspaceRef | null;
  agent: Agent | null;
}): WorkspaceLayer[] {
  const agentLayer: WorkspaceLayer = {
    origin: 'agent',
    ref: input.agent?.defaultWorkspaceRef ?? null,
  };
  if (input.issueWorkspace && input.issueRef !== null) {
    return [{ origin: 'run', ref: input.issueRef }, agentLayer];
  }
  if (input.threadRef === null) {
    return [{ origin: 'thread', ref: null }, agentLayer];
  }
  return [{ origin: 'thread', ref: input.threadRef }];
}

export function provenanceLabelOf(
  issueWorkspace: boolean,
  resolved: boolean,
  environment: RunEnvironment,
): string | null {
  if (issueWorkspace) {
    return 'issue';
  }
  if (!resolved || environment.provenance === 'fallback') {
    return null;
  }
  return WORKSPACE_PROVENANCE_LABEL[environment.provenance];
}

export function useIssueWorkspaceRef(
  orgId: string | null,
  thread: Thread | null,
  sources: Source[],
): { issueWorkspace: boolean; issueRef: WorkspaceRef | null } {
  const issueWorkspace = thread?.kind === 'issue';
  const issueId = thread?.issueId ?? null;
  const issueQuery = useQuery({
    queryKey: ['issue-workspace', orgId, issueId] as const,
    queryFn: () => getIssueDetail(orgId ?? '', issueId ?? ''),
    enabled: Boolean(orgId) && issueId !== null,
    staleTime: 60000,
  });
  const sourceId = issueQuery.data?.issue.sourceId ?? sources.find((s) => s.managed)?.id ?? null;
  const subpath = issueQuery.data?.issue.workspaceSubpath ?? null;
  return {
    issueWorkspace,
    issueRef:
      issueWorkspace && sourceId !== null
        ? { kind: 'source', sourceId, ...(subpath === null ? {} : { subpath }) }
        : null,
  };
}
