import type {
  RunArtifact,
  ThreadAttachment,
  ThreadFileEntry,
  ThreadFilesTreeResponse,
} from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { type ThreadWorktreeBinding, useThreadWorktreeStore } from '@/entities/thread';
import { useSelectedThread } from '@/features/desk';
import { useOpenFile } from '@/features/ide';
import type { FileRef } from '@/features/open-file';
import { getThreadArtifacts, listThreadAttachments, listThreadFiles } from '@/shared/api';
import { type ContentEntry, type ContentTreeResponse, listContentTree } from '@/shared/api/content';
import { FolderTypeIcon } from '@/shared/ui/icons';
import { FileCard, fileCardStat } from './file-card';
import { RowLeading } from './row-leading';

export function FilesPane() {
  const thread = useSelectedThread();
  const openFile = useOpenFile();
  if (!thread) {
    return <PaneHint text="Select a thread to see its files and workspace." />;
  }
  return (
    <div className="flex flex-col gap-5">
      <ThreadFilesSection threadId={thread.id} />
      <ThreadSandboxSection orgId={thread.orgId} threadId={thread.id} />
      <WorkspaceSection orgId={thread.orgId} threadId={thread.id} onOpenFile={openFile} />
    </div>
  );
}

interface ThreadFileRow {
  attachmentId: string;
  name: string;
  mediaType: string;
  sizeBytes?: number;
}

function mergeThreadFiles(
  uploads: ThreadAttachment[] | undefined,
  artifacts: RunArtifact[] | undefined,
): ThreadFileRow[] {
  const byId = new Map<string, ThreadFileRow>();
  for (const upload of uploads ?? []) {
    byId.set(upload.id, {
      attachmentId: upload.id,
      name: upload.name,
      mediaType: upload.mediaType,
      sizeBytes: upload.sizeBytes,
    });
  }
  for (const artifact of artifacts ?? []) {
    if (byId.has(artifact.attachmentId)) {
      continue;
    }
    byId.set(artifact.attachmentId, {
      attachmentId: artifact.attachmentId,
      name: artifact.name,
      mediaType: artifact.mediaType,
      sizeBytes: artifact.sizeBytes,
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function ThreadFilesSection({ threadId }: { threadId: string }) {
  const openFile = useOpenFile();
  const uploadsQuery = useQuery({
    queryKey: ['thread-attachments', threadId],
    queryFn: () => listThreadAttachments(threadId),
  });
  const artifactsQuery = useQuery({
    queryKey: ['thread-artifacts', threadId],
    queryFn: () => getThreadArtifacts(threadId),
  });
  const files = mergeThreadFiles(uploadsQuery.data, artifactsQuery.data?.items);
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Attachments</SectionLabel>
      {files.length === 0 ? (
        <PaneHint text="No files in this thread yet." />
      ) : (
        <div className="flex flex-col gap-1.5">
          {files.map((file) => (
            <FileCard
              key={file.attachmentId}
              testId="thread-file-row"
              name={file.name}
              stat={fileCardStat(file.name, file.mediaType, file.sizeBytes)}
              leading={
                <RowLeading
                  threadId={threadId}
                  name={file.name}
                  mediaType={file.mediaType}
                  attachmentId={file.attachmentId}
                />
              }
              onClick={() =>
                openFile({
                  source: 'thread-attachment',
                  threadId,
                  attachmentId: file.attachmentId,
                  name: file.name,
                  mediaType: file.mediaType,
                })
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ThreadSandboxSection({ orgId, threadId }: { orgId?: string; threadId: string }) {
  const treeQuery = useQuery({
    queryKey: ['thread-files', orgId, threadId, 'sandbox'],
    queryFn: () => listThreadFiles(orgId, threadId, 'sandbox'),
    enabled: Boolean(orgId),
  });
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Sandbox</SectionLabel>
      {sandboxBody(orgId, threadId, treeQuery)}
    </section>
  );
}

function sandboxBody(
  orgId: string | undefined,
  threadId: string,
  query: { isPending: boolean; isError: boolean; data?: ThreadFilesTreeResponse },
) {
  if (!orgId || query.isPending) {
    return <PaneHint text="Loading files…" />;
  }
  if (query.isError) {
    return <PaneHint text="Could not list sandbox files." />;
  }
  if (!query.data) {
    return <PaneHint text="Loading files…" />;
  }
  if (query.data.entries.length === 0) {
    return <PaneHint text="Sandbox is empty." />;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {query.data.entries.map((entry) => (
        <ThreadSandboxEntry
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

function ThreadSandboxEntry({
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
            <ThreadSandboxEntry
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

function WorkspaceSection({
  orgId,
  threadId,
  onOpenFile,
}: {
  orgId?: string;
  threadId: string;
  onOpenFile: (target: FileRef) => void;
}) {
  const binding = useThreadWorktreeStore((state) => state.get(threadId));
  const workspaceRef = binding?.workspaceRef;
  const ready = Boolean(orgId && workspaceRef);
  const treeQuery = useQuery({
    queryKey: ['workspace-files', orgId, workspaceRef?.sourceId, workspaceRef?.worktreeId],
    queryFn: () =>
      listContentTree(orgId ?? '', workspaceRef?.sourceId ?? '', '', {
        worktreeId: workspaceRef?.worktreeId,
      }),
    enabled: ready,
  });
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Workspace</SectionLabel>
      {workspaceBody(orgId, binding, treeQuery, onOpenFile)}
    </section>
  );
}

function workspaceBody(
  orgId: string | undefined,
  binding: ThreadWorktreeBinding | undefined,
  query: { isPending: boolean; isError: boolean; data?: ContentTreeResponse },
  onOpenFile: (target: FileRef) => void,
) {
  if (!binding) {
    return <PaneHint text="No workspace is bound to this thread." />;
  }
  const { sourceId, worktreeId } = binding.workspaceRef;
  if (query.isPending) {
    return <PaneHint text="Loading files…" />;
  }
  if (query.isError) {
    return <PaneHint text="Could not list workspace files." />;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {(query.data?.entries ?? []).map((entry) => (
        <WorkspaceEntry
          key={entry.path}
          orgId={orgId ?? ''}
          sourceId={sourceId}
          worktreeId={worktreeId}
          entry={entry}
          depth={0}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}

function WorkspaceEntry({
  orgId,
  sourceId,
  worktreeId,
  entry,
  depth,
  onOpenFile,
}: {
  orgId: string;
  sourceId: string;
  worktreeId: string;
  entry: ContentEntry;
  depth: number;
  onOpenFile: (target: FileRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const isDir = entry.type === 'dir';
  const childrenQuery = useQuery({
    queryKey: ['workspace-files', orgId, sourceId, worktreeId, entry.path],
    queryFn: () => listContentTree(orgId, sourceId, entry.path, { worktreeId }),
    enabled: isDir && open,
  });
  return (
    <div>
      <FileCard
        name={entry.name}
        stat={isDir ? undefined : fileCardStat(entry.name, undefined, entry.size)}
        depth={depth}
        leading={
          isDir ? (
            <EntryIcon open={open} />
          ) : (
            <RowLeading
              orgId={orgId}
              sourceId={sourceId}
              worktreeId={worktreeId}
              name={entry.name}
              path={entry.path}
            />
          )
        }
        onClick={() =>
          isDir
            ? setOpen((value) => !value)
            : onOpenFile({
                source: 'project',
                projectId: sourceId,
                path: entry.path,
                worktreeId,
              })
        }
      />
      {isDir && open
        ? (childrenQuery.data?.entries ?? []).map((child) => (
            <WorkspaceEntry
              key={child.path}
              orgId={orgId}
              sourceId={sourceId}
              worktreeId={worktreeId}
              entry={child}
              depth={depth + 1}
              onOpenFile={onOpenFile}
            />
          ))
        : null}
    </div>
  );
}

function EntryIcon({ open }: { open: boolean }) {
  return <FolderTypeIcon open={open} size="xl" />;
}

function dirCardStat(count: number | undefined): string {
  if (count === undefined) {
    return '';
  }
  return count === 1 ? '1 item' : `${count} items`;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="font-medium text-[10px] text-muted-foreground/70 uppercase tracking-wider">
      {children}
    </div>
  );
}

function PaneHint({ text }: { text: string }) {
  return <div className="text-muted-foreground/70 text-xs">{text}</div>;
}
