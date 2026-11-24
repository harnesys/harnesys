import type { WorkspaceRef } from '@harnesys/contracts';
import { useQueries, useQuery } from '@tanstack/react-query';
import { FolderSearchIcon } from 'lucide-react';
import { useState } from 'react';
import { getSourceLocation, sourceLocationQueryKey } from '@/shared/api/source-location';
import { listSources } from '@/shared/api/sources';
import { Button } from '@/shared/ui/button';
import { FieldDescription } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
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
  help?: string;
  disabled?: boolean;
  testId?: string;
}

type BrowseTarget = { mode: 'folder' } | { mode: 'source'; sourceId: string; root: string };

export function WorkspaceRefSelect({
  orgId,
  value,
  onChange,
  inheritLabel,
  label = 'Workspace',
  help,
  disabled = false,
  testId = 'workspace-ref-select',
}: WorkspaceRefSelectProps) {
  const [browse, setBrowse] = useState<BrowseTarget | null>(null);
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
  const sourceRoot = sourceRef === null ? null : rootOf(sourceRef.sourceId);
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
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Select
        items={items}
        value={workspaceValueOf(value)}
        disabled={disabled}
        onValueChange={(next) => {
          if (next === WORKSPACE_BROWSE_VALUE) {
            setBrowse({ mode: 'folder' });
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
      {sourceRef ? (
        <SourceSubpathRow
          key={`${sourceRef.sourceId}:${sourceRef.subpath ?? ''}`}
          sourceId={sourceRef.sourceId}
          subpath={sourceRef.subpath ?? ''}
          canBrowse={sourceRoot !== null}
          disabled={disabled}
          onChange={(subpath) =>
            onChange(
              subpath === ''
                ? { kind: 'source', sourceId: sourceRef.sourceId }
                : { kind: 'source', sourceId: sourceRef.sourceId, subpath },
            )
          }
          onBrowse={() => {
            if (sourceRoot !== null) {
              setBrowse({ mode: 'source', sourceId: sourceRef.sourceId, root: sourceRoot });
            }
          }}
        />
      ) : null}
      {help ? <FieldDescription>{help}</FieldDescription> : null}
      {browse ? (
        <FolderBrowserDialog
          orgId={orgId}
          initialPath={browse.mode === 'folder' ? folderStart(value) : browse.root}
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

function folderStart(value: WorkspaceRef | null): string | undefined {
  return value !== null && value.kind === 'folder' ? value.path : undefined;
}

function SourceSubpathRow({
  subpath,
  canBrowse,
  disabled,
  onChange,
  onBrowse,
}: {
  sourceId: string;
  subpath: string;
  canBrowse: boolean;
  disabled: boolean;
  onChange: (subpath: string) => void;
  onBrowse: () => void;
}) {
  const [draft, setDraft] = useState(subpath);
  const invalid = draft.trim().startsWith('/') || draft.trim().split('/').includes('..');
  const apply = () => {
    if (!invalid) {
      onChange(draft.trim().replace(/^\/+|\/+$/g, ''));
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <Input
          className="h-7 min-w-0 flex-1 font-mono text-xs"
          placeholder="subfolder (optional)"
          aria-label="Source subfolder"
          aria-invalid={invalid || undefined}
          disabled={disabled}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || invalid}
          onClick={apply}
        >
          Apply
        </Button>
      </div>
      <FieldDescription>
        {invalid
          ? 'Subfolder must stay inside the source'
          : 'Subfolder of the source; leave empty for the source root.'}
      </FieldDescription>
    </div>
  );
}
