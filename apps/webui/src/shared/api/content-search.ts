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
  dir?: string;
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
  if (params.dir) {
    qs.set('dir', params.dir);
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

export interface ContentReplaceTarget {
  sourceId: string;
  path: string;
  line?: number;
  column?: number;
}

export interface ReplaceContentParams {
  q: string;
  replacement: string;
  targets?: ContentReplaceTarget[];
  sourceId?: string;
  dir?: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  mask?: string;
  dryRun?: boolean;
}

export interface ContentReplaceFile {
  sourceId: string;
  path: string;
  replaced: number;
}

export interface ContentReplaceResponse {
  fileCount: number;
  matchCount: number;
  files: ContentReplaceFile[];
  truncated: boolean;
  dryRun: boolean;
  errors: ContentSearchError[];
}

export function replaceContent(
  orgId: string,
  params: ReplaceContentParams,
): Promise<ContentReplaceResponse> {
  const body: Record<string, unknown> = {
    q: params.q,
    replacement: params.replacement,
  };
  if (params.sourceId) {
    body.sourceId = params.sourceId;
  }
  if (params.dir) {
    body.dir = params.dir;
  }
  if (params.caseSensitive) {
    body.caseSensitive = true;
  }
  if (params.wholeWord) {
    body.wholeWord = true;
  }
  if (params.regex) {
    body.regex = true;
  }
  if (params.mask) {
    body.mask = params.mask;
  }
  if (params.dryRun) {
    body.dryRun = true;
  }
  if (params.targets) {
    body.targets = params.targets;
  }
  return apiJson<ContentReplaceResponse>(`/api/orgs/${encodeURIComponent(orgId)}/content/replace`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
