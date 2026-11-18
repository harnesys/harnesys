import { apiJson } from './client';

export interface ContentSearchMatch {
  line: number;
  column: number;
  text: string;
  start: number;
  end: number;
}

export interface ContentSearchFile {
  sourceId: string;
  path: string;
  name: string;
  matches: ContentSearchMatch[];
}

export interface ContentSearchError {
  sourceId: string;
  sourceName: string;
  message: string;
}

export interface ContentSearchResponse {
  fileCount: number;
  matchCount: number;
  files: ContentSearchFile[];
  truncated: boolean;
  errors: ContentSearchError[];
}

export interface SearchContentParams {
  q: string;
  sourceId?: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  mask?: string;
  limit?: number;
}

export function searchContent(
  orgId: string,
  params: SearchContentParams,
): Promise<ContentSearchResponse> {
  const qs = new URLSearchParams({ q: params.q });
  if (params.sourceId) {
    qs.set('sourceId', params.sourceId);
  }
  if (params.caseSensitive) {
    qs.set('caseSensitive', 'true');
  }
  if (params.wholeWord) {
    qs.set('wholeWord', 'true');
  }
  if (params.regex) {
    qs.set('regex', 'true');
  }
  if (params.mask) {
    qs.set('mask', params.mask);
  }
  if (params.limit !== undefined) {
    qs.set('limit', String(params.limit));
  }
  return apiJson<ContentSearchResponse>(
    `/api/orgs/${encodeURIComponent(orgId)}/content/search?${qs.toString()}`,
  );
}
