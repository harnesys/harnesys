import { HardDriveIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { listSources, type Source } from '@/shared/api/sources';
import { FolderTypeIcon } from '@/shared/ui/icons';

interface SourcesListProps {
  onSelect?: (source: Source) => void;
  selectedSourceId?: string | null;
}

export function SourcesList({ onSelect, selectedSourceId }: SourcesListProps) {
  const { orgId } = useParams();
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setSources([]);
      return;
    }
    let cancelled = false;
    listSources(orgId)
      .then((res) => {
        if (!cancelled) {
          setSources(res.sources);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'failed to load sources');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!orgId) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1" data-testid="sources-list">
      <div className="px-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Sources
      </div>
      {error ? <p className="px-2.5 text-destructive text-xs">{error}</p> : null}
      {sources.map((source) => {
        const selected = source.id === selectedSourceId;
        return (
          <button
            key={source.id}
            type="button"
            data-testid={`source-item-${source.id}`}
            className={
              selected
                ? 'flex items-center gap-2 rounded-md bg-sidebar-accent px-2.5 py-1.5 text-left text-sidebar-accent-foreground text-sm'
                : 'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sidebar-foreground text-sm hover:bg-sidebar-accent'
            }
            onClick={() => onSelect?.(source)}
          >
            {source.managed ? (
              <HardDriveIcon className="size-3.5 shrink-0 opacity-70" />
            ) : (
              <FolderTypeIcon className="opacity-70" size="xs" />
            )}
            <span className="truncate">{source.name}</span>
          </button>
        );
      })}
      {sources.length === 0 && !error ? (
        <p className="px-2.5 text-muted-foreground text-xs">No sources yet</p>
      ) : null}
    </div>
  );
}
