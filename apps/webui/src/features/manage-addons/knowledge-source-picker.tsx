import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon, FileIcon, FolderIcon } from 'lucide-react';
import { Fragment, useState } from 'react';
import {
  type AddonSourceEntry,
  type AddonSourceKind,
  attachOrgAddonSource,
  browseOrgAddonSourceKind,
} from '@/shared/api/addon-sources';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/ui/breadcrumb';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';

interface KnowledgeSourcePickerProps {
  orgId: string;
  addonId: string;
  kind: AddonSourceKind;
  accountId?: string;
  onChanged: () => Promise<void>;
}

interface BrowsePathEntry {
  id: string;
  name: string;
}

export function KnowledgeSourcePicker({
  orgId,
  addonId,
  kind,
  accountId,
  onChanged,
}: KnowledgeSourcePickerProps) {
  const [path, setPath] = useState<BrowsePathEntry[]>([]);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [attachPending, setAttachPending] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const rootLabel = kind.rootTitle ?? 'Root';
  const folderId = path.length > 0 ? path[path.length - 1].id : undefined;
  const currentName = path.length > 0 ? (path[path.length - 1]?.name ?? '') : rootLabel;
  const attachName = nameDraft ?? currentName;
  const canAttachRoot = kind.supportsRootMount === true;

  const browse = useQuery({
    queryKey: [
      'addon-source-kind-browse',
      orgId,
      addonId,
      kind.id,
      accountId ?? '',
      folderId ?? 'root',
    ] as const,
    queryFn: () =>
      browseOrgAddonSourceKind(orgId, addonId, kind.id, {
        ...(folderId ? { folderId } : {}),
        ...(accountId ? { accountId } : {}),
      }),
  });

  const entries = browse.data?.entries ?? [];

  const descend = (entry: AddonSourceEntry) => {
    setNameDraft(null);
    setPath((current) => [...current, { id: entry.id, name: entry.name }]);
  };

  const jump = (index: number) => {
    setNameDraft(null);
    setPath((current) => current.slice(0, index + 1));
  };

  const attach = async () => {
    setAttachPending(true);
    setAttachError(null);
    try {
      await attachOrgAddonSource(orgId, addonId, kind.id, {
        folderId: folderId ?? 'root',
        ...(attachName.trim() ? { name: attachName.trim() } : {}),
        ...(accountId ? { accountId } : {}),
      });
      setNameDraft(null);
      await onChanged();
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttachPending(false);
    }
  };

  const attachDisabled = attachPending || (path.length === 0 && !canAttachRoot);
  const attachLabel = attachPending ? 'Attaching...' : attachTargetLabel(path.length === 0);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Breadcrumb className="min-w-0">
        <BreadcrumbList>
          <BreadcrumbItem>
            {path.length === 0 ? (
              <BreadcrumbPage>{rootLabel}</BreadcrumbPage>
            ) : (
              <button
                type="button"
                aria-label={`Go to ${rootLabel}`}
                className="transition-colors hover:text-foreground"
                onClick={() => {
                  setNameDraft(null);
                  setPath([]);
                }}
              >
                {rootLabel}
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
                    aria-label={`Go to ${part.name}`}
                    className="transition-colors hover:text-foreground"
                    onClick={() => jump(index)}
                  >
                    {part.name}
                  </button>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      {browse.isError ? (
        <SettingsErrorBanner
          message={browse.error instanceof Error ? browse.error.message : String(browse.error)}
          onRetry={() => void browse.refetch()}
          testId={`addon-source-kind-browse-error-${kind.id}`}
        />
      ) : null}
      {browse.isPending ? (
        <p className="px-1 text-muted-foreground text-xs" role="status">
          Loading folder...
        </p>
      ) : null}
      {!browse.isPending && entries.length === 0 ? (
        <p className="px-1 text-muted-foreground text-xs">This folder is empty</p>
      ) : null}
      <div className="h-[260px] min-w-0 flex-col overflow-y-auto">
        {entries.map((entry) =>
          entry.kind === 'folder' ? (
            <button
              key={entry.id}
              type="button"
              aria-label={`Open folder ${entry.name}`}
              className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/40"
              onClick={() => descend(entry)}
              data-testid={`addon-source-folder-${entry.id}`}
            >
              <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[13px]">{entry.name}</span>
              <ChevronRightIcon
                className="size-3.5 shrink-0 text-muted-foreground/50"
                aria-hidden
              />
            </button>
          ) : (
            <div key={entry.id} className="flex min-w-0 items-center gap-2 px-1 py-1">
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
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
          onChange={(event) => setNameDraft(event.target.value)}
          placeholder="Source name (optional)"
          aria-label="Source name"
          className="h-7 max-w-56 text-[13px]"
        />
        <Button
          type="button"
          size="sm"
          disabled={attachDisabled}
          onClick={() => void attach()}
          data-testid={`addon-source-kind-connect-${kind.id}`}
        >
          {attachLabel}
        </Button>
        {path.length === 0 && !canAttachRoot ? (
          <span className="text-muted-foreground text-xs">
            Open a folder to attach it; this drive cannot be mounted as a whole.
          </span>
        ) : null}
      </div>
      {attachError ? (
        <SettingsErrorBanner
          message={attachError}
          testId={`addon-source-kind-attach-error-${kind.id}`}
        />
      ) : null}
    </div>
  );
}

function attachTargetLabel(atRoot: boolean): string {
  if (atRoot) {
    return 'Attach entire drive';
  }
  return 'Attach current folder';
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
