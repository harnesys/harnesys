import type { ProjectFileEntry } from '@harnesys/studio-shared';
import { PlusIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { listSourceFiles } from '@/shared/api/files';
import { listSources, type Source } from '@/shared/api/sources';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { addIssueSourceAttachmentAction } from '../../model/issue-detail-actions';
import {
  PickerEntries,
  type PickerEntry,
  SourceBreadcrumb,
  sortEntries,
} from './source-picker-parts';

export function SourceFilePicker({
  orgId,
  issueId,
  onPicked,
}: {
  orgId: string;
  issueId: string;
  onPicked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourceId, setSourceId] = useState('');
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<ProjectFileEntry[] | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    let active = true;
    listSources(orgId)
      .then((res) => {
        if (active) {
          setSources(res.sources);
          setSourcesLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setSourcesLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  useEffect(() => {
    if (!open || !sourceId) {
      return;
    }
    const seq = ++requestSeq.current;
    setEntries(null);
    listSourceFiles(sourceId, path)
      .then((res) => {
        if (seq === requestSeq.current) {
          setEntries(res);
        }
      })
      .catch(() => {
        if (seq === requestSeq.current) {
          setEntries([]);
        }
      });
  }, [open, sourceId, path]);

  const rootEntries = useMemo(
    () =>
      [...sources]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((source): PickerEntry => ({ key: source.id, name: source.name, isDir: true })),
    [sources],
  );

  const folderEntries = useMemo(
    () =>
      sortEntries(entries ?? []).map(
        (entry): PickerEntry => ({
          key: entry.path,
          name: entry.name,
          isDir: entry.kind === 'dir',
          entry,
        }),
      ),
    [entries],
  );

  const toRoot = (): void => {
    requestSeq.current += 1;
    setSourceId('');
    setPath('');
    setEntries(null);
  };

  const back = (): void => {
    if (!path) {
      toRoot();
      return;
    }
    const trimmed = path.replace(/\/+$/, '');
    const index = trimmed.lastIndexOf('/');
    setPath(index === -1 ? '' : trimmed.slice(0, index));
  };

  const pick = (item: PickerEntry): void => {
    if (item.isDir) {
      if (item.entry) {
        setPath(item.key);
      } else {
        setSourceId(item.key);
        setPath('');
      }
      return;
    }
    void attachFile(item.entry);
  };

  const attachFile = async (entry: ProjectFileEntry | undefined): Promise<void> => {
    if (!entry) {
      return;
    }
    setPendingPath(entry.path);
    const ok = await addIssueSourceAttachmentAction(orgId, issueId, sourceId, entry.path);
    setPendingPath(null);
    if (ok) {
      onPicked();
    }
  };

  const pathSegments = path ? path.split('/').filter(Boolean) : [];
  const atRoot = !sourceId;
  const sourceName = sources.find((source) => source.id === sourceId)?.name ?? sourceId;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            data-testid="issue-attach-sources-btn"
          >
            <PlusIcon className="size-3.5" />
            From sources
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={4} className="flex w-80 flex-col gap-1.5 p-2">
        {!atRoot ? (
          <SourceBreadcrumb
            sourceName={sourceName}
            pathSegments={pathSegments}
            onBack={back}
            onEnter={setPath}
            onRoot={toRoot}
          />
        ) : null}
        <div
          className="max-h-64 min-h-24 space-y-0.5 overflow-y-auto"
          data-testid="issue-attach-source-entries"
        >
          {atRoot ? (
            <PickerEntries
              items={sourcesLoading ? null : rootEntries}
              emptyText="No sources attached to the org."
              pendingPath={null}
              onPick={pick}
            />
          ) : (
            <PickerEntries
              items={entries === null ? null : folderEntries}
              emptyText="Empty folder"
              pendingPath={pendingPath}
              onPick={pick}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
