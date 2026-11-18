import { useQuery } from '@tanstack/react-query';
import {
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
