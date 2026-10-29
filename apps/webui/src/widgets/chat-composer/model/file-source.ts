import type { ProjectFileEntry } from '@harnesys/studio-shared';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useProjects } from '@/entities/project';
import { useSelectedAgent, useThreadEvents } from '@/features/desk';
import { getActiveOrgId } from '@/shared/api/active-org';
import { listSourceFilesTree, sourceFilesTreeQueryKey } from '@/shared/api/files';
import { getSourceLocation, sourceLocationQueryKey } from '@/shared/api/source-location';
import { isValidEntityRef } from './entity-kinds';
export type FileOptionSource = 'upload' | 'attachment' | 'source';
export interface FileOption {
  ref: string;
  source: FileOptionSource;
  sourceName?: string;
  abs?: string;
}
export interface ComposerFileOptions {
  options: FileOption[];
  loading: boolean;
}
export function useComposerFileOptions(
  threadId: string | null,
  pendingNames: string[],
): ComposerFileOptions {
  const agent = useSelectedAgent();
  const events = useThreadEvents(threadId);
  const sharedSourceIds = agent?.sharedSourceIds ?? [];
  const orgId = getActiveOrgId();
  const projects = useProjects().data ?? [];
  const sourceNameById = new Map(projects.map((project) => [project.id, project.name]));
  const trees = useQueries({
    queries: sharedSourceIds.map((sourceId) => ({
      queryKey: sourceFilesTreeQueryKey(sourceId),
      queryFn: () => listSourceFilesTree(sourceId),
      enabled: Boolean(orgId),
      staleTime: 60000,
    })),
  });
  const locations = useQueries({
    queries: sharedSourceIds.map((sourceId) => ({
      queryKey: sourceLocationQueryKey(sourceId),
      queryFn: () => getSourceLocation(sourceId),
      enabled: Boolean(orgId),
      staleTime: 600000,
    })),
  });
  const absRootBySourceId = new Map<string, string>();
  sharedSourceIds.forEach((sourceId, index) => {
    const root = locations[index]?.data?.absoluteRoot;
    if (root) {
      absRootBySourceId.set(sourceId, root);
    }
  });
  const options = useMemo<FileOption[]>(() => {
    const seen = new Set<string>();
    const next: FileOption[] = [];
    const push = (ref: string, source: FileOptionSource, sourceName?: string, abs?: string) => {
      const key = `${source}:${ref}`;
      if (!ref || !isValidEntityRef('file', ref) || seen.has(key)) {
        return;
      }
      seen.add(key);
      next.push({ ref, source, sourceName, ...(abs ? { abs } : {}) });
    };
    for (const name of pendingNames) {
      push(name, 'upload');
    }
    for (const event of events) {
      if (event.type !== 'user') {
        continue;
      }
      for (const attachment of event.attachments ?? []) {
        push(attachment.name, 'attachment');
      }
    }
    sharedSourceIds.forEach((sourceId, index) => {
      const sourceName = sourceNameById.get(sourceId);
      const absRoot = absRootBySourceId.get(sourceId);
      for (const path of filePathsFromTree(trees[index]?.data ?? [])) {
        push(
          sourceName ? `${sourceName}/${path}` : path,
          'source',
          sourceName,
          absRoot ? `${absRoot}/${path}` : undefined,
        );
      }
    });
    return next;
  }, [pendingNames, events, trees, sharedSourceIds, sourceNameById, absRootBySourceId]);
  return { options, loading: trees.some((tree) => tree.isPending) };
}
function filePathsFromTree(entries: ProjectFileEntry[]): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'file') {
      continue;
    }
    if (entry.path.split('/').some((segment) => segment.startsWith('.'))) {
      continue;
    }
    out.push(entry.path);
  }
  return out;
}
