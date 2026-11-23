import type {
  ThreadSummary as ContractThreadSummary,
  ThreadArtifactsResponse,
  ThreadHistoryPage,
  ThreadSubtreeResponse,
} from '@harnesys/contracts';
import type { SessionEvent, ThreadSummary } from '@harnesys/studio-shared';
import { apiJson } from './client';
import { requireOrgId, threadsBase, toStudioSummary } from './threads';

export interface ThreadHistoryOptions {
  beforeThreadSeq?: number;
  fromThreadSeq?: number;
  toThreadSeq?: number;
  aroundThreadSeq?: number;
  limitRuns?: number;
}

export interface RunSubtreeResult {
  events: SessionEvent[];
  outputTruncated?: boolean;
}

function historyQuery(options?: ThreadHistoryOptions): string {
  if (options === undefined) {
    return '';
  }
  const params = new URLSearchParams();
  if (options.beforeThreadSeq !== undefined) {
    params.set('beforeThreadSeq', String(options.beforeThreadSeq));
  }
  if (options.fromThreadSeq !== undefined) {
    params.set('fromThreadSeq', String(options.fromThreadSeq));
  }
  if (options.toThreadSeq !== undefined) {
    params.set('toThreadSeq', String(options.toThreadSeq));
  }
  if (options.aroundThreadSeq !== undefined) {
    params.set('aroundThreadSeq', String(options.aroundThreadSeq));
  }
  if (options.limitRuns !== undefined) {
    params.set('limitRuns', String(options.limitRuns));
  }
  const query = params.toString();
  return query.length === 0 ? '' : `?${query}`;
}

export function getThreadHistory(
  id: string,
  options?: ThreadHistoryOptions,
): Promise<ThreadHistoryPage> {
  const orgId = requireOrgId();
  const path = `${threadsBase(orgId)}/${encodeURIComponent(id)}/history${historyQuery(options)}`;
  return apiJson<ThreadHistoryPage>(path);
}

export function getThreadSummary(id: string): Promise<ThreadSummary> {
  const orgId = requireOrgId();
  const base = `${threadsBase(orgId)}/${encodeURIComponent(id)}`;
  return apiJson<ContractThreadSummary>(`${base}/summary`).then(toStudioSummary);
}

export function getRunSubtree(id: string, runId: string): Promise<RunSubtreeResult> {
  const orgId = requireOrgId();
  return apiJson<ThreadSubtreeResponse>(
    `${threadsBase(orgId)}/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/subtree`,
  ).then((response) => ({
    events: response.events as SessionEvent[],
    ...(response.outputTruncated ? { outputTruncated: true } : {}),
  }));
}

export function getThreadArtifacts(id: string): Promise<ThreadArtifactsResponse> {
  const orgId = requireOrgId();
  return apiJson<ThreadArtifactsResponse>(
    `${threadsBase(orgId)}/${encodeURIComponent(id)}/artifacts`,
  );
}
