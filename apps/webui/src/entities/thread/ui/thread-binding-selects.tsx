import type { WorkspaceRef } from '@harnesys/contracts';
import { useQueries, useQuery } from '@tanstack/react-query';
import { LockIcon } from 'lucide-react';
import { useState } from 'react';
import { executionProfilesQuery, updateThreadBinding } from '@/shared/api';
import { getSourceLocation, sourceLocationQueryKey } from '@/shared/api/source-location';
import { listSources } from '@/shared/api/sources';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { toast } from '@/shared/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { useThreadStore } from '../model/thread.store';
import {
  CUSTOM_DIR_VALUE,
  CUSTOM_PATH_ERROR,
  isAbsoluteDirectoryPath,
  loadRecentDirectories,
  profileOptions,
  rememberRecentDirectory,
  SANDBOX_DIR_VALUE,
  type SelectOption,
} from '../model/thread-binding';
import { toClientThread } from '../model/thread-record';

const INHERIT_VALUE = '__inherit__';
const SOURCE_PREFIX = 'source:';
const FOLDER_PREFIX = 'folder:';

export interface ThreadBindingSelectsProps {
  orgId: string;
  threadId: string;
  runProfileId: string | null;
  workspaceRef: WorkspaceRef | null;
  bindingLocked: boolean;
}

function bindingErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Failed to update binding';
}

function workspaceValueOf(ref: WorkspaceRef | null): string {
  if (ref === null || ref.kind === 'inherit') {
    return INHERIT_VALUE;
  }
  if (ref.kind === 'sandbox') {
    return SANDBOX_DIR_VALUE;
  }
  if (ref.kind === 'folder') {
    return `${FOLDER_PREFIX}${ref.path}`;
  }
  return `${SOURCE_PREFIX}${ref.sourceId}`;
}

export function ThreadBindingSelects({
  orgId,
  threadId,
  runProfileId,
  workspaceRef,
  bindingLocked,
}: ThreadBindingSelectsProps) {
  const [recents, setRecents] = useState<string[]>(() => loadRecentDirectories(orgId));
  const [customOpen, setCustomOpen] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const { data: profiles } = useQuery(executionProfilesQuery(orgId));
  const sourcesQuery = useQuery({
    queryKey: ['sources', orgId] as const,
    queryFn: () => listSources(orgId),
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
  const dirSources = sources.map((source, index) => ({
    id: source.id,
    name: source.name,
    absoluteRoot: locations[index]?.data?.absoluteRoot ?? null,
  }));
  const profileItems = profileOptions(profiles?.items ?? []);
  const workspaceItems = workspaceOptions({ sources: dirSources, recents, workspaceRef });
  const workspaceValue = workspaceValueOf(workspaceRef);
  const patch = (body: { runProfileId?: string | null; workspaceRef?: WorkspaceRef | null }) => {
    updateThreadBinding(threadId, body)
      .then((summary) => {
        useThreadStore.getState().upsert(toClientThread(summary));
      })
      .catch((error: unknown) => {
        toast.add({ title: bindingErrorMessage(error) });
      });
  };
  return (
    <div className="contents" data-testid="thread-binding-selects">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">
          Profile
          {bindingLocked ? <LockedBadge inline /> : null}
        </span>
        <Select
          items={profileItems}
          value={runProfileId ?? ''}
          disabled={bindingLocked}
          onValueChange={(value) => {
            if (typeof value !== 'string') {
              return;
            }
            patch({ runProfileId: value === '' ? null : value });
          }}
        >
          <SelectTrigger
            className="w-full"
            aria-label="Execution profile"
            data-testid="thread-binding-profile"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {profileItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">Workspace</span>
        <Select
          items={workspaceItems}
          value={workspaceValue}
          disabled={bindingLocked}
          onValueChange={(value) => {
            if (value === CUSTOM_DIR_VALUE) {
              setCustomOpen(true);
              setCustomPath('');
              setCustomError(null);
              return;
            }
            if (typeof value !== 'string') {
              return;
            }
            patch({ workspaceRef: workspaceRefFrom(value) });
          }}
        >
          <SelectTrigger
            className="w-full"
            aria-label="Workspace"
            data-testid="thread-binding-directory"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-w-80">
            <SelectGroup>
              {workspaceItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <span className="block max-w-72 truncate" title={item.label}>
                    {item.label}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {customOpen ? (
          <CustomPathRow
            error={customError}
            onConfirm={() => confirmCustomPath()}
            onCancel={() => setCustomOpen(false)}
            onChange={setCustomPath}
          />
        ) : null}
      </div>
    </div>
  );

  function confirmCustomPath() {
    const trimmed = customPath.trim();
    if (!isAbsoluteDirectoryPath(trimmed)) {
      setCustomError(CUSTOM_PATH_ERROR);
      return;
    }
    patch({ workspaceRef: { kind: 'folder', path: trimmed } });
    setRecents(rememberRecentDirectory(orgId, trimmed));
    setCustomOpen(false);
    setCustomPath('');
    setCustomError(null);
  }
}

function workspaceOptions(input: {
  sources: { id: string; name: string; absoluteRoot: string | null }[];
  recents: string[];
  workspaceRef: WorkspaceRef | null;
}): SelectOption[] {
  const options: SelectOption[] = [
    { value: INHERIT_VALUE, label: 'Use agent default' },
    { value: SANDBOX_DIR_VALUE, label: 'Thread sandbox' },
    ...input.sources.map((source) => ({
      value: `${SOURCE_PREFIX}${source.id}`,
      label: source.name,
    })),
  ];
  const current = workspaceValueOf(input.workspaceRef);
  for (const path of input.recents) {
    const value = `${FOLDER_PREFIX}${path}`;
    if (!options.some((option) => option.value === value)) {
      options.push({ value, label: path });
    }
  }
  if (!options.some((option) => option.value === current) && current !== INHERIT_VALUE) {
    options.push({
      value: current,
      label: current.startsWith(FOLDER_PREFIX) ? current.slice(FOLDER_PREFIX.length) : current,
    });
  }
  options.push({ value: CUSTOM_DIR_VALUE, label: 'Custom path...' });
  return options;
}

function workspaceRefFrom(value: string): WorkspaceRef {
  if (value === INHERIT_VALUE) {
    return { kind: 'inherit' };
  }
  if (value === SANDBOX_DIR_VALUE) {
    return { kind: 'sandbox' };
  }
  if (value.startsWith(SOURCE_PREFIX)) {
    return { kind: 'source', sourceId: value.slice(SOURCE_PREFIX.length) };
  }
  return { kind: 'folder', path: value.slice(FOLDER_PREFIX.length) };
}

function LockedBadge({ inline = false }: { inline?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              'text-muted-foreground',
              inline ? 'mr-auto inline-flex' : 'inline-flex shrink-0',
            )}
            data-testid="thread-binding-locked"
          />
        }
      >
        <LockIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>Binding is locked after the first run</TooltipContent>
    </Tooltip>
  );
}

interface CustomPathRowProps {
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onChange: (value: string) => void;
}

function CustomPathRow({ error, onConfirm, onCancel, onChange }: CustomPathRowProps) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Input
        className="h-7 min-w-0 flex-1 font-mono text-xs"
        placeholder="/absolute/path"
        aria-label="Custom workspace path"
        data-testid="thread-binding-custom-path"
        aria-invalid={error ? true : undefined}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onConfirm();
          }
          if (event.key === 'Escape') {
            onCancel();
          }
        }}
      />
      <Button type="button" size="sm" variant="outline" onClick={onConfirm}>
        Apply
      </Button>
    </div>
  );
}
