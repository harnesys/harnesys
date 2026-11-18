import { useQuery } from '@tanstack/react-query';
import {
  type ContentReplaceTarget,
  type ContentSearchFile,
  type ContentSearchMatch,
  type ContentSearchResponse,
  searchContent,
} from '@/shared/api/content-search';

export const ALL_SOURCES = 'all';

export interface FindInFilesInput {
  orgId: string;
  q: string;
  sourceId: string;
  dir: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  mask: string;
}

export interface FindHit {
  sourceId: string;
  path: string;
  name: string;
  match: ContentSearchMatch;
}

export function findInFilesQueryKey(input: FindInFilesInput) {
  return [
    'find-in-files',
    input.orgId,
    input.q,
    input.sourceId,
    input.dir,
    input.caseSensitive,
    input.wholeWord,
    input.regex,
    input.mask,
  ] as const;
}

export function useFindInFilesSearch(input: FindInFilesInput) {
  return useQuery<ContentSearchResponse>({
    queryKey: findInFilesQueryKey(input),
    queryFn: () =>
      searchContent(input.orgId, {
        q: input.q,
        ...(input.sourceId === ALL_SOURCES ? {} : { sourceId: input.sourceId }),
        ...(input.dir.length > 0 ? { dir: input.dir } : {}),
        caseSensitive: input.caseSensitive,
        wholeWord: input.wholeWord,
        regex: input.regex,
        ...(input.mask.length > 0 ? { mask: input.mask } : {}),
      }),
    enabled: input.orgId.length > 0 && input.q.length > 0,
    staleTime: 30_000,
  });
}

export function flattenHits(files: ContentSearchFile[] | undefined): FindHit[] {
  const hits: FindHit[] = [];
  for (const file of files ?? []) {
    for (const match of file.matches) {
      hits.push({
        sourceId: file.sourceId,
        path: file.path,
        name: file.name,
        match,
      });
    }
  }
  return hits;
}

export function visibleFiles(
  files: ContentSearchFile[],
  replacedKeys: Set<string>,
): ContentSearchFile[] {
  return files
    .map((file) => ({
      ...file,
      matches: file.matches.filter(
        (match) => !replacedKeys.has(matchKey(file.sourceId, file.path, match.line, match.column)),
      ),
    }))
    .filter((file) => file.matches.length > 0);
}

export function matchKey(sourceId: string, path: string, line: number, column: number): string {
  return `${sourceId}:${path}:${line}:${column}`;
}

export function targetKey(target: ContentReplaceTarget): string {
  return matchKey(target.sourceId, target.path, target.line ?? 0, target.column ?? 0);
}

export function hitTarget(hit: FindHit): ContentReplaceTarget {
  return {
    sourceId: hit.sourceId,
    path: hit.path,
    line: hit.match.line,
    column: hit.match.column,
    matchText: hit.match.text.slice(hit.match.start, hit.match.end),
  };
}

export function visibleTargets(
  hits: FindHit[],
  truncated: boolean,
): ContentReplaceTarget[] | undefined {
  if (truncated || hits.length === 0) {
    return undefined;
  }
  return hits.map(hitTarget);
}
