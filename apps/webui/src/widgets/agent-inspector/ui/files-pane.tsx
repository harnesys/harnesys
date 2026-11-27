import type { RunArtifact, ThreadAttachment } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { type ThreadWorktreeBinding, useThreadWorktreeStore } from '@/entities/thread';
import { syncThreadFiles, useSelectedThread } from '@/features/desk';
import { useOpenFile } from '@/features/ide';
import type { FileRef } from '@/features/open-file';
import { getThreadArtifacts, listThreadAttachments } from '@/shared/api';
import { type ContentEntry, type ContentTreeResponse, listContentTree } from '@/shared/api/content';
import { FileCard, fileCardStat } from './file-card';
import { EntryIcon, PaneHint, SectionLabel } from './pane-parts';
import { RowLeading } from './row-leading';
import { ThreadTreeSection } from './thread-file-tree';

export function FilesPane() {
  const thread = useSelectedThread();
  const openFile = useOpenFile();
  const queryClient = useQueryClient();
  const orgId = thread?.orgId;
  useEffect(() => {
    if (!orgId) {
      return;
    }
    return syncThreadFiles(orgId, queryClient);
  }, [orgId, queryClient]);
  if (!thread) {
    return <PaneHint text="Select a thread to see its files and workspace." />;
  }
  return (
    <div className="flex flex-col gap-5">
      <ThreadTreeSection
        orgId={thread.orgId}
        threadId={thread.id}
        label="Files"
        subPath=""
        emptyText="No files in this thread's working directory yet."
      />
      <ThreadAttachmentsSection threadId={thread.id} />
      <ThreadTreeSection
        orgId={thread.orgId}
        threadId={thread.id}
        label="Tool Outputs"
        subPath="tool-outputs"
        emptyText="No tool outputs spilled yet."
      />
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

function ThreadAttachmentsSection({ threadId }: { threadId: string }) {
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
        <PaneHint text="No attachments in this thread yet." />
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
