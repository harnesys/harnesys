import type { Source } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon, FileIcon, FolderIcon } from 'lucide-react';
import { Fragment, useState } from 'react';
import {
  type AddonSourceEntry,
  type AddonSourceKind,
  type AddonSourceRefreshResult,
  type AddonSourceRefreshState,
  attachOrgAddonSource,
  browseOrgAddonSourceKind,
  refreshOrgAddonSource,
} from '@/shared/api/addon-sources';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/ui/breadcrumb';
import { Button } from '@/shared/ui/button';
import { RowChip, RowItem } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import { SettingsErrorBanner, SettingsWarnBanner } from '@/shared/ui/settings-kit';

interface KnowledgeSourceKindProps {
  orgId: string;
  addonId: string;
  kind: AddonSourceKind;
  sources: Source[];
  onChanged: () => Promise<void>;
}

interface BrowsePathEntry {
  id: string;
  name: string;
}

interface RefreshEntry {
  result?: AddonSourceRefreshResult;
  error?: string;
}

export function KnowledgeSourceKind({
  orgId,
  addonId,
  kind,
  sources,
  onChanged,
}: KnowledgeSourceKindProps) {
  const [path, setPath] = useState<BrowsePathEntry[]>([]);
  const [attachName, setAttachName] = useState('');
  const [attachPending, setAttachPending] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshEntries, setRefreshEntries] = useState<Record<string, RefreshEntry>>({});

  const accountId = kind.accountIds[0];
  const blocked = Boolean(kind.connection) && kind.accountIds.length === 0;
  const folderId = path.length > 0 ? path[path.length - 1].id : undefined;

  const browse = useQuery({
    queryKey: ['addon-source-kind-browse', orgId, addonId, kind.id, folderId ?? 'root'] as const,
    queryFn: () =>
      browseOrgAddonSourceKind(orgId, addonId, kind.id, {
        ...(folderId ? { folderId } : {}),
        ...(accountId ? { accountId } : {}),
      }),
    enabled: !blocked,
  });

  const entries = browse.data?.entries ?? [];

  const descend = (entry: AddonSourceEntry) => {
    setPath((current) => [...current, { id: entry.id, name: entry.name }]);
  };

  const connect = async () => {
    setAttachPending(true);
    setAttachError(null);
    try {
      await attachOrgAddonSource(orgId, addonId, kind.id, {
        folderId: folderId ?? 'root',
        ...(attachName.trim() ? { name: attachName.trim() } : {}),
        ...(accountId ? { accountId } : {}),
      });
      setAttachName('');
      await onChanged();
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttachPending(false);
    }
  };

  const refresh = async (source: Source) => {
    setRefreshingId(source.id);
    setRefreshEntries((current) => ({ ...current, [source.id]: {} }));
    try {
      const result = await refreshOrgAddonSource(orgId, addonId, source.id);
      setRefreshEntries((current) => ({ ...current, [source.id]: { result } }));
      await onChanged();
    } catch (err) {
      setRefreshEntries((current) => ({
        ...current,
        [source.id]: { error: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-md border px-3 py-2"
      data-testid={`addon-source-kind-${kind.id}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-sm">{kind.title}</span>
        {kind.accountIds.map((id) => (
          <span
            key={id}
            className="rounded-full border bg-muted/40 px-2 py-0.5 font-mono text-[11px]"
            data-testid={`addon-source-kind-account-${id}`}
          >
            {id}
          </span>
        ))}
        <RowChip tone="neutral">{kind.attached} attached</RowChip>
      </div>

      {blocked ? (
        <SettingsWarnBanner
          title="Bind an account first"
          testId={`addon-source-kind-blocked-${kind.id}`}
        >
          This folder source uses the {kind.connection} connection. Bind an account before browsing.
        </SettingsWarnBanner>
      ) : (
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList>
                <BreadcrumbItem>
                  {path.length === 0 ? (
                    <BreadcrumbPage>Root</BreadcrumbPage>
                  ) : (
                    <button
                      type="button"
                      className="transition-colors hover:text-foreground"
                      onClick={() => setPath([])}
                    >
                      Root
                    </button>
                  )}
                </BreadcrumbItem>
                {path.map((part, index) => (
                  <Fragment key={part.id}>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {index === path.length - 1 ? (
                        <BreadcrumbPage>{part.name}</BreadcrumbPage>
                      ) : (
                        <button
                          type="button"
                          className="transition-colors hover:text-foreground"
                          onClick={() => setPath(path.slice(0, index + 1))}
                        >
                          {part.name}
                        </button>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
            {path.length > 0 ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => setPath(path.slice(0, -1))}
              >
                Up
              </Button>
            ) : null}
          </div>

          {browse.isError ? (
            <SettingsErrorBanner
              message={browse.error instanceof Error ? browse.error.message : String(browse.error)}
              onRetry={() => void browse.refetch()}
              testId={`addon-source-kind-browse-error-${kind.id}`}
            />
          ) : null}
          {browse.isPending ? (
            <p className="px-1 text-muted-foreground text-xs">Loading folder...</p>
          ) : null}
          {!browse.isPending && entries.length === 0 ? (
            <p className="px-1 text-muted-foreground text-xs">This folder is empty</p>
          ) : null}
          <div className="flex min-w-0 flex-col">
            {entries.map((entry) =>
              entry.kind === 'folder' ? (
                <button
                  key={entry.id}
                  type="button"
                  className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/40"
                  onClick={() => descend(entry)}
                  data-testid={`addon-source-folder-${entry.id}`}
                >
                  <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{entry.name}</span>
                  <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
                </button>
              ) : (
                <div key={entry.id} className="flex min-w-0 items-center gap-2 px-1 py-1">
                  <FileIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                    {entry.name}
                  </span>
                  {entry.size !== undefined ? (
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {formatBytes(entry.size)}
                    </span>
                  ) : null}
                </div>
              ),
            )}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 border-border/40 border-t pt-2">
            <Input
              value={attachName}
              onChange={(event) => setAttachName(event.target.value)}
              placeholder="Source name (optional)"
              className="h-7 max-w-56 text-[13px]"
            />
            <Button
              type="button"
              size="sm"
              disabled={attachPending}
              onClick={() => void connect()}
              data-testid={`addon-source-kind-connect-${kind.id}`}
            >
              {attachPending ? 'Connecting...' : 'Connect this folder'}
            </Button>
          </div>
          {attachError ? (
            <SettingsErrorBanner
              message={attachError}
              testId={`addon-source-kind-attach-error-${kind.id}`}
            />
          ) : null}
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
          Attached folders
        </span>
        {sources.length === 0 ? (
          <RowItem title="No folders attached yet" />
        ) : (
          sources.map((source) => {
            const entry = refreshEntries[source.id];
            const pending = refreshingId === source.id;
            return (
              <div
                key={source.id}
                className="flex min-w-0 flex-col gap-1 rounded-md border px-2 py-1.5"
                data-testid={`addon-source-${source.id}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                    {source.name}
                  </span>
                  {entry?.result ? (
                    <RowChip
                      tone={stateTone(entry.result.state)}
                      testId={`addon-source-state-${source.id}`}
                    >
                      {entry.result.state}
                    </RowChip>
                  ) : null}
                  {entry?.result && entry.result.conflicts.length > 0 ? (
                    <RowChip tone="warn">{entry.result.conflicts.length} conflicts</RowChip>
                  ) : null}
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={pending}
                    onClick={() => void refresh(source)}
                  >
                    {pending ? 'Refreshing...' : 'Refresh'}
                  </Button>
                </div>
                {entry?.error ? <p className="text-destructive text-xs">{entry.error}</p> : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function stateTone(state: AddonSourceRefreshState): 'ok' | 'info' | 'danger' {
  if (state === 'ready') {
    return 'ok';
  }
  if (state === 'failed') {
    return 'danger';
  }
  return 'info';
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${Math.round(size / (1024 * 1024))} MB`;
}
