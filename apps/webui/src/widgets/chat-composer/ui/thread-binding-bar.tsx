import { useQueries, useQuery } from '@tanstack/react-query';
import {
  CheckIcon,
  ChevronDownIcon,
  FolderGit2Icon,
  FolderIcon,
  FolderSearchIcon,
  GitBranchIcon,
  HistoryIcon,
  LockIcon,
  MonitorIcon,
} from 'lucide-react';
import { useState } from 'react';
import { type Thread, toClientThread, useThreadStore } from '@/entities/thread';
import {
  isAbsoluteDirectoryPath,
  loadRecentDirectories,
  rememberRecentDirectory,
} from '@/entities/thread/model/thread-binding';
import { executionProfilesQuery, updateThreadBinding } from '@/shared/api';
import { getSourceLocation, sourceLocationQueryKey } from '@/shared/api/source-location';
import { listSources, type Source, sourceHasGitVcs } from '@/shared/api/sources';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { toast } from '@/shared/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { FolderBrowser } from '@/widgets/folder-browser';
import { GitRepoMenuItems, useGitStatus } from '@/widgets/project-sidebar/ui/git-menu';

const CHIP_TRIGGER_CLASS =
  'inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-sm outline-none hover:bg-muted disabled:pointer-events-none disabled:opacity-50';

interface DirSource {
  source: Source;
  absoluteRoot: string | null;
}

export function ThreadBindingBar({
  orgId,
  thread,
}: {
  orgId: string | null;
  thread: Thread | null;
}) {
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const [recents, setRecents] = useState<string[]>(() =>
    orgId ? loadRecentDirectories(orgId) : [],
  );
  const runDirectory = thread?.runDirectory ?? null;
  const runProfileId = thread?.runProfileId ?? null;
  const locked = thread?.bindingLocked ?? false;
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
  const matched = runDirectory
    ? dirSources.find((entry) => entry.absoluteRoot === runDirectory)
    : undefined;
  const gitSource = matched && sourceHasGitVcs(matched.source) ? matched.source : undefined;
  const gitStatus = useGitStatus(gitSource?.id ?? '');
  const activeProfile = profilesQuery.data?.items.find((profile) => profile.id === runProfileId);
  const directoryLabel = directoryLabelOf(runDirectory, matched);
  const branchLabel = gitStatus?.branch ?? 'branch';
  const patch = (body: { runProfileId?: string | null; runDirectory?: string | null }) => {
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
          disabled={locked || !thread}
          className={CHIP_TRIGGER_CLASS}
          aria-label="Run directory"
          data-testid="thread-binding-directory"
        >
          {matched && sourceHasGitVcs(matched.source) ? (
            <FolderGit2Icon className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{directoryLabel}</span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 p-2">
          {customOpen ? (
            <div className="flex flex-col gap-2">
              <FolderBrowser orgId={orgId ?? undefined} autoFocus onChange={setCustomPath} />
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setCustomOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!isAbsoluteDirectoryPath(customPath.trim())}
                  onClick={() => {
                    const trimmed = customPath.trim();
                    if (!isAbsoluteDirectoryPath(trimmed)) {
                      return;
                    }
                    patch({ runDirectory: trimmed });
                    if (orgId) {
                      setRecents(rememberRecentDirectory(orgId, trimmed));
                    }
                    setCustomOpen(false);
                    setDirectoryOpen(false);
                  }}
                >
                  Select
                </Button>
              </div>
            </div>
          ) : (
            <DirectoryOptions
              dirSources={dirSources}
              recents={recents}
              runDirectory={runDirectory}
              onPick={(value) => {
                patch({ runDirectory: value });
                setDirectoryOpen(false);
              }}
              onCustom={() => {
                setCustomPath('');
                setCustomOpen(true);
              }}
            />
          )}
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

function bindingErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Failed to update binding';
}

function directoryLabelOf(runDirectory: string | null, matched: DirSource | undefined): string {
  if (!runDirectory) {
    return 'Sandbox';
  }
  if (matched) {
    return matched.source.name;
  }
  const tail = runDirectory.split('/').filter(Boolean).pop();
  return tail ?? runDirectory;
}

function DirectoryOptions({
  dirSources,
  recents,
  runDirectory,
  onPick,
  onCustom,
}: {
  dirSources: DirSource[];
  recents: string[];
  runDirectory: string | null;
  onPick: (value: string | null) => void;
  onCustom: () => void;
}) {
  const rootValues = new Set(
    dirSources.filter((entry) => entry.absoluteRoot).map((entry) => entry.absoluteRoot),
  );
  const recentOptions = recents.filter((path) => !rootValues.has(path)).slice(0, 5);
  return (
    <div className="flex max-h-80 flex-col overflow-y-auto">
      <OptionRow
        icon={<FolderIcon className="size-4" />}
        label="Sandbox"
        detail="Private thread directory"
        selected={runDirectory === null}
        onClick={() => onPick(null)}
      />
      {dirSources.length > 0 ? (
        <div className="mt-1 px-2 py-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
          Sources
        </div>
      ) : null}
      {dirSources.map((entry) =>
        entry.absoluteRoot ? (
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
            detail={entry.absoluteRoot}
            selected={runDirectory === entry.absoluteRoot}
            onClick={() => onPick(entry.absoluteRoot)}
          />
        ) : null,
      )}
      {recentOptions.length > 0 ? (
        <div className="mt-1 px-2 py-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
          Recent
        </div>
      ) : null}
      {recentOptions.map((path) => (
        <OptionRow
          key={path}
          icon={<HistoryIcon className="size-4" />}
          label={path.split('/').filter(Boolean).pop() ?? path}
          detail={path}
          selected={runDirectory === path}
          onClick={() => onPick(path)}
        />
      ))}
      <div className="mt-1 border-t pt-1">
        <OptionRow
          icon={<FolderSearchIcon className="size-4" />}
          label="Browse file system…"
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

function LockedBadge() {
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
