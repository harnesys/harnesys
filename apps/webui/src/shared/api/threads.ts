import type {
  AcceptedRunResponse as ContractAcceptedRun,
  ThreadSummary as ContractThreadSummary,
  CreateThreadBody,
  ListThreadsResponse,
  ThreadPublic,
} from '@harnesys/contracts';
import type {
  AcceptedRunResponse,
  SessionEvent,
  ThreadAttachment,
  ThreadPlanRecord,
  ThreadRecord,
  ThreadSummary,
} from '@harnesys/studio-shared';
import { getActiveOrgId } from './active-org';
import { ApiError, apiJson, apiUrl } from './client';
import { authenticatedFetch } from './session';

export interface CreateThreadInput {
  title?: string;
  agentId?: string;
  originAgentId?: string;
  kind?: 'chat' | 'schedule' | 'webhook' | 'issue' | 'connector';
  parentThreadId?: string;
  forkAt?: string;
}

function requireOrgId(): string {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new ApiError(400, 'No active organization');
  }
  return orgId;
}

function threadsBase(orgId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/threads`;
}

function toStudioSummary(record: ContractThreadSummary): ThreadSummary {
  return {
    id: record.id,
    title: record.title,
    agentId: record.agentId,
    originAgentId: record.originAgentId,
    agentName: record.agentName,
    projectId: record.orgId,
    kind: record.kind,
    issueId: record.issueId ?? null,
    parentThreadId: record.parentThreadId,
    forkAt: record.forkAt,
    inheritedEventCount: 0,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastReadAt: record.lastReadAt,
    unread: record.unread,
    pinned: record.pinned,
    runMode: record.runMode,
    runProfileId: record.runProfileId,
    runDirectory: record.runDirectory,
    bindingLocked: record.bindingLocked,
    activeRun: record.activeRun,
    lastError: record.lastError ?? null,
  };
}

function toStudioRecord(record: ThreadPublic): ThreadRecord {
  return {
    ...toStudioSummary(record),
    inheritedEventCount: record.inheritedEventCount,
    events: record.events as SessionEvent[],
  };
}

export function listThreads(orgId: string): Promise<ThreadSummary[]> {
  const resolved = getActiveOrgId() ?? orgId;
  return apiJson<ListThreadsResponse>(threadsBase(resolved)).then((res) =>
    res.items.map(toStudioSummary),
  );
}

export function getThread(id: string): Promise<ThreadRecord> {
  const orgId = requireOrgId();
  return apiJson<ThreadPublic>(`${threadsBase(orgId)}/${encodeURIComponent(id)}`).then(
    toStudioRecord,
  );
}

export function createThreadRecord(body: CreateThreadInput): Promise<ThreadRecord> {
  const orgId = requireOrgId();
  if (!body.agentId) {
    throw new ApiError(400, 'agentId is required');
  }
  const payload: CreateThreadBody = {
    agentId: body.agentId,
    ...(body.title ? { title: body.title } : {}),
    ...(body.kind ? { kind: body.kind } : {}),
    ...(body.parentThreadId ? { parentThreadId: body.parentThreadId } : {}),
    ...(body.forkAt ? { forkAt: body.forkAt } : {}),
  };
  return apiJson<ThreadPublic>(threadsBase(orgId), {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then(toStudioRecord);
}

export function uploadThreadAttachment(threadId: string, file: File): Promise<ThreadAttachment> {
  const body = new FormData();
  body.append('file', file);
  return apiJson<ThreadAttachment>(`/api/threads/${threadId}/attachments`, {
    method: 'POST',
    body,
  });
}

export async function loadThreadAttachment(
  threadId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('active org required');
  }
  const url = apiUrl(`/api/threads/${threadId}/attachments/${attachmentId}`);
  const response = await authenticatedFetch(url, {
    signal,
    headers: { 'X-Org-Id': orgId },
  });
  if (!response.ok) {
    throw new Error(`failed to load attachment (${response.status})`);
  }
  return response.blob();
}

export interface SendThreadRunOptions {
  id: string;
  text: string;
  effort?: string;
  attachmentIds?: string[];
  mode?: string;
  skills?: string[];
  clientEventId?: string;
  sourceId?: string;
  worktreeId?: string;
}

export function sendThreadRun(options: SendThreadRunOptions): Promise<AcceptedRunResponse> {
  const orgId = requireOrgId();
  const { id, text, effort, mode, skills, clientEventId, attachmentIds, sourceId, worktreeId } =
    options;
  return apiJson<ContractAcceptedRun>(`${threadsBase(orgId)}/${encodeURIComponent(id)}/runs`, {
    method: 'POST',
    body: JSON.stringify({
      text,
      effort,
      mode,
      clientEventId,
      ...(skills?.length ? { skills } : {}),
      ...(attachmentIds?.length ? { attachmentIds } : {}),
      ...(sourceId && worktreeId ? { sourceId, worktreeId } : {}),
    }),
  }).then((accepted) => ({
    runId: accepted.runId,
    status: accepted.status,
  }));
}
export function getThreadPlan(threadId: string): Promise<ThreadPlanRecord | null> {
  const orgId = requireOrgId();
  return apiJson<ThreadPlanRecord | null>(
    `${threadsBase(orgId)}/${encodeURIComponent(threadId)}/plan`,
  );
}

export function deleteThreadPlan(threadId: string): Promise<void> {
  const orgId = requireOrgId();
  return apiJson<void>(`${threadsBase(orgId)}/${encodeURIComponent(threadId)}/plan`, {
    method: 'DELETE',
  });
}

export interface RespondRunOptions {
  clientEventId?: string;
}

export function respondToRun(
  threadId: string,
  runId: string,
  body: { askId: string; payload: unknown; clientEventId?: string },
): Promise<void> {
  const orgId = requireOrgId();
  return apiJson<void>(
    `${threadsBase(orgId)}/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/respond`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function rejectRun(
  threadId: string,
  runId: string,
  body: { askId: string; note?: string; clientEventId?: string },
): Promise<void> {
  const orgId = requireOrgId();
  return apiJson<void>(
    `${threadsBase(orgId)}/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/reject`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export interface RetryRunResponse {
  runId: string;
}

export function retryRun(threadId: string, runId: string): Promise<RetryRunResponse> {
  const orgId = requireOrgId();
  return apiJson<RetryRunResponse>(
    `${threadsBase(orgId)}/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/retry`,
    { method: 'POST' },
  );
}

export async function compactThreadStream(id: string, signal?: AbortSignal): Promise<Response> {
  const url = apiUrl(`/api/threads/${id}/compact`);
  const headers = new Headers({ Accept: 'text/event-stream' });
  const orgId = getActiveOrgId();
  if (orgId) {
    headers.set('X-Org-Id', orgId);
  }
  const response = await authenticatedFetch(url, { method: 'POST', headers, signal });
  if (!response.ok) {
    let message = response.statusText || 'Compact failed';
    try {
      const body = (await response.json()) as {
        error?: string;
      };
      if (body.error) {
        message = body.error;
      }
    } catch {}
    throw new ApiError(response.status, message);
  }
  return response;
}

export async function getRunEventsStream(
  threadId: string,
  runId: string,
  fromSeq?: number,
  signal?: AbortSignal,
): Promise<Response> {
  const orgId = requireOrgId();
  const qs = fromSeq != null ? `?fromSeq=${fromSeq}` : '';
  const url = apiUrl(
    `${threadsBase(orgId)}/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/events${qs}`,
  );
  const headers = new Headers({ Accept: 'text/event-stream' });
  headers.set('X-Org-Id', orgId);
  const response = await authenticatedFetch(url, { method: 'GET', headers, signal });
  if (!response.ok) {
    let message = response.statusText || 'Stream connection failed';
    try {
      const body = (await response.json()) as {
        error?: string;
      };
      if (body.error) {
        message = body.error;
      }
    } catch {}
    throw new ApiError(response.status, message);
  }
  return response;
}

export function cancelRun(threadId: string, runId: string): Promise<void> {
  const orgId = requireOrgId();
  return apiJson<void>(
    `${threadsBase(orgId)}/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/cancel`,
    { method: 'POST' },
  );
}

export function markThreadRead(id: string): Promise<ThreadRecord> {
  const orgId = requireOrgId();
  return apiJson<ThreadRecord>(`${threadsBase(orgId)}/${encodeURIComponent(id)}/read`, {
    method: 'POST',
  });
}

export function setThreadPinned(id: string, pinned: boolean): Promise<ThreadRecord> {
  return getThread(id).then((record) => ({ ...record, pinned }));
}

export interface UpdateThreadBindingInput {
  runProfileId?: string | null;
  runDirectory?: string | null;
}

export function updateThreadBinding(
  threadId: string,
  body: UpdateThreadBindingInput,
): Promise<ThreadSummary> {
  const orgId = requireOrgId();
  return apiJson<ContractThreadSummary>(
    `${threadsBase(orgId)}/${encodeURIComponent(threadId)}/binding`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  ).then(toStudioSummary);
}

export function deleteThreadRecord(id: string): Promise<void> {
  const orgId = requireOrgId();
  return apiJson<void>(`${threadsBase(orgId)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function deleteThreadUserEvent(
  threadId: string,
  runId: string,
  seq: number,
): Promise<ThreadRecord> {
  const orgId = requireOrgId();
  return apiJson<ThreadPublic>(
    `${threadsBase(orgId)}/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/events/${encodeURIComponent(String(seq))}`,
    { method: 'DELETE' },
  ).then(toStudioRecord);
}
