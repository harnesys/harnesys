import type { ContentReplaceSourceResult, ContentSearchSourceResult } from '@harnesys/contracts';
import type {
  ContentReplaceRequest,
  ContentSearchOptions,
} from '../../domain/content/org-content.port.ts';
import type { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import { proxyWorkerJson } from './worker-content-proxy.ts';

export interface ProxySearchInput {
  proxy: FleetContentProxyPort;
  hostId: string;
  sourceId: string;
  query: string;
  options: ContentSearchOptions;
  worktreeId?: string;
}

export interface ProxyReplaceInput {
  proxy: FleetContentProxyPort;
  hostId: string;
  sourceId: string;
  request: ContentReplaceRequest;
  worktreeId?: string;
}

export function proxySearch(input: ProxySearchInput): Promise<ContentSearchSourceResult> {
  const { proxy, hostId, sourceId, query, options, worktreeId } = input;
  return proxyWorkerJson<ContentSearchSourceResult>(proxy, hostId, {
    op: 'search',
    sourceId,
    relPath: options.dir ?? '',
    query,
    caseSensitive: options.caseSensitive,
    wholeWord: options.wholeWord,
    regex: options.regex,
    mask: options.mask.join(','),
    limit: options.limit,
    ...(worktreeId ? { worktreeId } : {}),
  });
}

export function proxyReplace(input: ProxyReplaceInput): Promise<ContentReplaceSourceResult> {
  const { proxy, hostId, sourceId, request, worktreeId } = input;
  const options = request.options;
  return proxyWorkerJson<ContentReplaceSourceResult>(proxy, hostId, {
    op: 'replace',
    sourceId,
    relPath: options.dir ?? '',
    query: request.query,
    replacement: request.replacement,
    caseSensitive: options.caseSensitive,
    wholeWord: options.wholeWord,
    regex: options.regex,
    mask: options.mask.join(','),
    dryRun: options.dryRun,
    ...(options.targets ? { targets: options.targets } : {}),
    ...(worktreeId ? { worktreeId } : {}),
  });
}
