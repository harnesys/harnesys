import type { Source } from '@harnesys/contracts';
import { useState } from 'react';
import {
  type AddonSourceRefreshResult,
  type AddonSourceRefreshState,
  detachOrgAddonSource,
  refreshOrgAddonSource,
} from '@/shared/api/addon-sources';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { Button } from '@/shared/ui/button';
import { RowChip, RowItem } from '@/shared/ui/capability-rows';

interface KnowledgeSourceSourcesProps {
  orgId: string;
  addonId: string;
  sources: Source[];
  onChanged: () => Promise<void>;
}

interface RefreshEntry {
  result?: AddonSourceRefreshResult;
  error?: string;
}

export function KnowledgeSourceSources({
  orgId,
  addonId,
  sources,
  onChanged,
}: KnowledgeSourceSourcesProps) {
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshEntries, setRefreshEntries] = useState<Record<string, RefreshEntry>>({});
  const [detachTarget, setDetachTarget] = useState<Source | null>(null);
  const [detachPending, setDetachPending] = useState(false);
  const [detachError, setDetachError] = useState<string | null>(null);

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

  const detach = async () => {
    if (!detachTarget) {
      return;
    }
    setDetachPending(true);
    setDetachError(null);
    try {
      await detachOrgAddonSource(orgId, addonId, detachTarget.id);
      setRefreshEntries((current) => {
        const next = { ...current };
        delete next[detachTarget.id];
        return next;
      });
      setDetachTarget(null);
      await onChanged();
    } catch (err) {
      setDetachError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetachPending(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        Mounted sources
      </span>
      {sources.length === 0 ? (
        <RowItem title="Nothing mounted yet" />
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
                <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{source.name}</span>
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
                  aria-label={`Refresh ${source.name}`}
                  onClick={() => void refresh(source)}
                >
                  {pending ? 'Refreshing...' : 'Refresh'}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  aria-label={`Detach ${source.name}`}
                  onClick={() => {
                    setDetachError(null);
                    setDetachTarget(source);
                  }}
                >
                  Detach
                </Button>
              </div>
              {entry?.error ? <p className="text-destructive text-xs">{entry.error}</p> : null}
            </div>
          );
        })
      )}

      <AlertDialog
        open={detachTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDetachTarget(null);
          }
        }}
      >
        <AlertDialogContent size="sm" data-testid="detach-addon-source-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Detach {detachTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The mounted folder and its indexed knowledge are removed from this org. The original
              folder stays in the drive.
            </AlertDialogDescription>
            {detachError ? <p className="text-destructive text-xs">{detachError}</p> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDetachTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={detachPending}
              onClick={() => void detach()}
            >
              {detachPending ? 'Detaching...' : 'Detach source'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
