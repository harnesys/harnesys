import { GitBranchIcon } from 'lucide-react';
import { useState } from 'react';
import { type AddonSourceEntry, attachOrgAddonSource } from '@/shared/api/addon-sources';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { type AddonSourcePickerProps, useAddonSourceBrowse } from './use-addon-source-browse';

interface GitAddonSourcePickerProps extends AddonSourcePickerProps {
  accountId: string | undefined;
}

export function GitAddonSourcePicker({
  orgId,
  addonId,
  kind,
  accountId,
  onChanged,
}: GitAddonSourcePickerProps) {
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  const browse = useAddonSourceBrowse(orgId, addonId, kind, accountId, undefined);
  const entries = browse.data?.entries ?? [];
  const attachName = nameDraft?.trim() ?? '';

  const attach = async (entry: AddonSourceEntry) => {
    setPendingEntryId(entry.id);
    setAttachError(null);
    try {
      await attachOrgAddonSource(orgId, addonId, kind.id, {
        folderId: entry.id,
        ...(attachName ? { name: attachName } : {}),
        ...(accountId ? { accountId } : {}),
      });
      setNameDraft(null);
      await onChanged();
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingEntryId(null);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {browse.isError ? (
        <SettingsErrorBanner
          message={browse.error instanceof Error ? browse.error.message : String(browse.error)}
          onRetry={() => void browse.refetch()}
          testId={`addon-source-kind-browse-error-${kind.id}`}
        />
      ) : null}
      {browse.isPending ? (
        <p className="px-1 text-muted-foreground text-xs" role="status">
          Loading...
        </p>
      ) : null}
      {!browse.isPending && entries.length === 0 ? (
        <p className="px-1 text-muted-foreground text-xs">No repositories available</p>
      ) : null}
      <div className="h-[260px] min-w-0 flex-col overflow-y-auto">
        <GitSourceEntries
          entries={entries}
          kindId={kind.id}
          pendingEntryId={pendingEntryId}
          onAttach={(entry) => void attach(entry)}
        />
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 border-border/40 border-t pt-2">
        <Input
          value={nameDraft ?? ''}
          onChange={(event) => setNameDraft(event.target.value)}
          placeholder="Source name (optional)"
          aria-label="Source name"
          className="h-7 max-w-56 text-[13px]"
        />
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

interface GitSourceEntriesProps {
  entries: AddonSourceEntry[];
  kindId: string;
  pendingEntryId: string | null;
  onAttach: (entry: AddonSourceEntry) => void;
}

function GitSourceEntries({ entries, kindId, pendingEntryId, onAttach }: GitSourceEntriesProps) {
  return (
    <>
      {entries.map((entry) => (
        <div key={entry.id} className="flex min-w-0 items-center gap-2 px-1 py-1">
          <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[13px]">{entry.name}</span>
          <Button
            type="button"
            size="sm"
            disabled={pendingEntryId !== null}
            aria-label={`Attach ${entry.name}`}
            onClick={() => onAttach(entry)}
            data-testid={`addon-source-kind-attach-${kindId}-${entry.id}`}
          >
            {pendingEntryId === entry.id ? 'Attaching...' : 'Attach'}
          </Button>
        </div>
      ))}
    </>
  );
}
