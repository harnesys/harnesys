import type { ThreadFileEntry, ThreadFilesTreeResponse } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useOpenFile } from '@/features/ide';
import { listThreadFiles } from '@/shared/api';
import { FileCard, fileCardStat } from './file-card';
import { EntryIcon, PaneHint, SectionLabel } from './pane-parts';
import { RowLeading } from './row-leading';

export function ThreadTreeSection({
  orgId,
  threadId,
  label,
  subPath,
  emptyText,
}: {
  orgId?: string;
  threadId: string;
  label: string;
  subPath: string;
  emptyText: string;
}) {
  const treeQuery = useQuery({
    queryKey: ['thread-files', orgId, threadId, subPath],
    queryFn: () => listThreadFiles(orgId, threadId, subPath),
    enabled: Boolean(orgId),
  });
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{label}</SectionLabel>
      {treeBody(orgId, threadId, treeQuery, emptyText)}
    </section>
  );
}

function treeBody(
  orgId: string | undefined,
  threadId: string,
  query: { isPending: boolean; isError: boolean; data?: ThreadFilesTreeResponse },
  emptyText: string,
) {
  if (!orgId || query.isPending) {
    return <PaneHint text="Loading files…" />;
  }
  if (query.isError) {
    return <PaneHint text="Could not list thread files." />;
  }
  if (!query.data) {
    return <PaneHint text="Loading files…" />;
  }
  if (query.data.entries.length === 0) {
    return <PaneHint text={emptyText} />;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {query.data.entries.map((entry) => (
        <ThreadTreeEntry
          key={entry.path}
          orgId={orgId}
          threadId={threadId}
          entry={entry}
          depth={0}
        />
      ))}
    </div>
  );
}

function ThreadTreeEntry({
  orgId,
  threadId,
  entry,
  depth,
}: {
  orgId: string;
  threadId: string;
  entry: ThreadFileEntry;
  depth: number;
}) {
  const openFile = useOpenFile();
  const [open, setOpen] = useState(false);
  const isDir = entry.type === 'dir';
  const childrenQuery = useQuery({
    queryKey: ['thread-files', orgId, threadId, entry.path],
    queryFn: () => listThreadFiles(orgId, threadId, entry.path),
    enabled: isDir && open,
  });
  return (
    <div>
      <FileCard
        name={entry.name}
        stat={isDir ? dirCardStat(entry.count) : fileCardStat(entry.name, undefined, entry.size)}
        depth={depth}
        leading={
          isDir ? (
            <EntryIcon open={open} />
          ) : (
            <RowLeading threadId={threadId} name={entry.name} path={entry.path} />
          )
        }
        onClick={() =>
          isDir
            ? setOpen((value) => !value)
            : openFile({ source: 'thread-sandbox', threadId, path: entry.path })
        }
      />
      {isDir && open
        ? (childrenQuery.data?.entries ?? []).map((child) => (
            <ThreadTreeEntry
              key={child.path}
              orgId={orgId}
              threadId={threadId}
              entry={child}
              depth={depth + 1}
            />
          ))
        : null}
    </div>
  );
}

function dirCardStat(count: number | undefined): string {
  if (count === undefined) {
    return '';
  }
  return count === 1 ? '1 item' : `${count} items`;
}
