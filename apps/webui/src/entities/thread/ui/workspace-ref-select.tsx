import type { WorkspaceRef } from '@harnesys/contracts';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderSearchIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { browseDirs } from '@/shared/api/host-fs';
import { getSourceLocation, sourceLocationQueryKey } from '@/shared/api/source-location';
import { listSources } from '@/shared/api/sources';
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
import { FolderBrowserDialog } from '@/widgets/folder-browser';
import {
  WORKSPACE_BROWSE_VALUE,
  workspaceOptions,
  workspaceRefFrom,
  workspaceValueOf,
} from '../model/workspace-ref-options';

export interface WorkspaceRefSelectProps {
  orgId: string;
  value: WorkspaceRef | null;
  onChange: (ref: WorkspaceRef) => void;
  inheritLabel: string;
  label?: string;
  disabled?: boolean;
  testId?: string;
}

type BrowseTarget =
  | { mode: 'folder'; root: string; initialPath: string }
  | { mode: 'source'; sourceId: string; root: string; initialPath: string };

export function WorkspaceRefSelect({
  orgId,
  value,
  onChange,
  inheritLabel,
  label = 'Workspace',
  disabled = false,
  testId = 'workspace-ref-select',
}: WorkspaceRefSelectProps) {
  const [browse, setBrowse] = useState<BrowseTarget | null>(null);
  const [locating, setLocating] = useState(false);
  const queryClient = useQueryClient();
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
  const rootOf = (sourceId: string): string | null => {
    const index = sources.findIndex((source) => source.id === sourceId);
    return index === -1 ? null : (locations[index]?.data?.absoluteRoot ?? null);
  };
  const items = workspaceOptions({
    sources: sources.map((source) => ({ id: source.id, name: source.name })),
    workspaceRef: value,
    inheritLabel,
  });
  const sourceRef = value !== null && value.kind === 'source' ? value : null;
  const folderRef = value !== null && value.kind === 'folder' ? value : null;
  const sourceRoot = sourceRef === null ? null : rootOf(sourceRef.sourceId);
  const hostHome = async (): Promise<string | null> => {
    try {
      const listing = await queryClient.fetchQuery({
        queryKey: ['host-home', orgId] as const,
        queryFn: () => browseDirs(orgId, {}),
        staleTime: Number.POSITIVE_INFINITY,
      });
      return listing.path;
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not read the home folder',
      });
      return null;
    }
  };
  const chooseFolderMode = async () => {
    setLocating(true);
    const home = await hostHome();
    setLocating(false);
    if (home !== null) {
      onChange({ kind: 'folder', path: home });
    }
  };
  const openFolderPicker = async () => {
    setLocating(true);
    const home = await hostHome();
    setLocating(false);
    if (home === null) {
      return;
    }
    setBrowse({ mode: 'folder', root: home, initialPath: folderRef?.path ?? home });
  };
  const resolveBrowse = (target: BrowseTarget, path: string): void => {
    if (target.mode === 'folder') {
      onChange({ kind: 'folder', path });
      return;
    }
    if (path === target.root) {
      onChange({ kind: 'source', sourceId: target.sourceId });
      return;
    }
    const relative = path.startsWith(`${target.root}/`) ? path.slice(target.root.length + 1) : '';
    onChange(
      relative === ''
        ? { kind: 'source', sourceId: target.sourceId }
        : { kind: 'source', sourceId: target.sourceId, subpath: relative },
    );
  };
  const browseNodeLabel =
    browse?.mode === 'source'
      ? sources.find((source) => source.id === browse.sourceId)?.name
      : undefined;
  const locked = disabled || locating;
  return (
    <div className="contents">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <Select
          items={items}
          value={workspaceValueOf(value)}
          disabled={locked}
          onValueChange={(next) => {
            if (next === WORKSPACE_BROWSE_VALUE) {
              if (folderRef === null) {
                void chooseFolderMode();
              }
              return;
            }
            if (typeof next !== 'string') {
              return;
            }
            onChange(workspaceRefFrom(next));
          }}
        >
          <SelectTrigger className="w-full" aria-label={label} data-testid={testId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-w-80">
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <span className="block max-w-72 truncate" title={item.label}>
                    {item.label}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {sourceRef !== null ? (
        <FolderField>
          <SourceSubpathRow
            key={`${sourceRef.sourceId}:${sourceRef.subpath ?? ''}`}
            subpath={sourceRef.subpath ?? ''}
            canBrowse={sourceRoot !== null}
            disabled={locked}
            onChange={(subpath) =>
              onChange(
                subpath === ''
                  ? { kind: 'source', sourceId: sourceRef.sourceId }
                  : { kind: 'source', sourceId: sourceRef.sourceId, subpath },
              )
            }
            onBrowse={() => {
              if (sourceRoot !== null) {
                setBrowse({
                  mode: 'source',
                  sourceId: sourceRef.sourceId,
                  root: sourceRoot,
                  initialPath:
                    sourceRef.subpath === undefined || sourceRef.subpath === ''
                      ? sourceRoot
                      : `${sourceRoot}/${sourceRef.subpath}`,
                });
              }
            }}
          />
        </FolderField>
      ) : null}
      {folderRef !== null ? (
        <FolderField>
          <div className="flex min-w-0 items-center gap-1.5">
            <Input
              className="min-w-0 flex-1 cursor-pointer font-mono text-xs"
              value={folderRef.path}
              title={folderRef.path}
              aria-label="Folder path"
              readOnly
              disabled={locked}
              onClick={() => void openFolderPicker()}
            />
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              title="Browse folders on this host"
              aria-label="Browse folders on this host"
              disabled={locked}
              onClick={() => void openFolderPicker()}
            >
              <FolderSearchIcon className="size-3.5" />
            </Button>
          </div>
        </FolderField>
      ) : null}
      {browse ? (
        <FolderBrowserDialog
          orgId={orgId}
          nodeLabel={browseNodeLabel}
          initialPath={browse.initialPath}
          rootPath={browse.root}
          onResolve={(path) => {
            const target = browse;
            setBrowse(null);
            if (path !== undefined) {
              resolveBrowse(target, path);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function FolderField({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:col-span-full">
      <span className="text-[11px] text-muted-foreground">Folder</span>
      {children}
    </div>
  );
}

function SourceSubpathRow({
  subpath,
  canBrowse,
  disabled,
  onChange,
  onBrowse,
}: {
  subpath: string;
  canBrowse: boolean;
  disabled: boolean;
  onChange: (subpath: string) => void;
  onBrowse: () => void;
}) {
  const [draft, setDraft] = useState(subpath);
  const trimmed = draft.trim().replace(/^\/+|\/+$/g, '');
  const invalid = draft.trim().startsWith('/') || draft.trim().split('/').includes('..');
  const apply = () => {
    if (!invalid && trimmed !== subpath) {
      onChange(trimmed);
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <Input
          className="min-w-0 flex-1 font-mono text-xs"
          placeholder="subfolder (optional)"
          aria-label="Source subfolder"
          aria-invalid={invalid || undefined}
          disabled={disabled}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={apply}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              apply();
            }
          }}
        />
        {canBrowse ? (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="Browse source folders"
            aria-label="Browse source folders"
            disabled={disabled}
            onClick={onBrowse}
          >
            <FolderSearchIcon className="size-3.5" />
          </Button>
        ) : null}
      </div>
      {invalid ? (
        <p className="text-destructive text-xs">Subfolder must stay inside the source</p>
      ) : null}
    </div>
  );
}
