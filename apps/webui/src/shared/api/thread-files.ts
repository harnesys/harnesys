import type {
  ThreadAttachment as ContractThreadAttachment,
  ListThreadAttachmentsResponse,
  ThreadFilesTreeResponse,
} from '@harnesys/contracts';
import type { ThreadAttachment } from '@harnesys/studio-shared';
import { getActiveOrgId } from './active-org';
import { ApiError, apiJson, apiUrl } from './client';
import { authenticatedFetch } from './session';

export function listThreadAttachments(threadId: string): Promise<ContractThreadAttachment[]> {
  return apiJson<ListThreadAttachmentsResponse>(
    `/api/threads/${encodeURIComponent(threadId)}/attachments`,
  ).then((res) => res.items);
}

function threadsBase(orgId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/threads`;
}

export function listThreadFiles(
  orgId: string | undefined,
  threadId: string,
  subPath: string,
): Promise<ThreadFilesTreeResponse> {
  const org = orgId ?? getActiveOrgId();
  if (!org) {
    throw new ApiError(400, 'No active organization');
  }
  const qs = new URLSearchParams({ subPath });
  return apiJson<ThreadFilesTreeResponse>(
    `${threadsBase(org)}/${encodeURIComponent(threadId)}/files?${qs.toString()}`,
  );
}

export async function loadThreadFileContent(
  threadId: string,
  path: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('active org required');
  }
  const qs = new URLSearchParams({ path });
  const url = apiUrl(
    `${threadsBase(orgId)}/${encodeURIComponent(threadId)}/files/content?${qs.toString()}`,
  );
  const response = await authenticatedFetch(url, {
    signal,
    headers: { 'X-Org-Id': orgId },
  });
  if (!response.ok) {
    throw new Error(`failed to load file (${response.status})`);
  }
  return response.blob();
}

export function threadFileQueryKey(
  threadId: string,
  path: string,
): readonly ['thread-file-content', string, string] {
  return ['thread-file-content', threadId, path];
}

export async function readThreadFileText(threadId: string, path: string): Promise<string> {
  const blob = await loadThreadFileContent(threadId, path);
  return blob.text();
}

export function writeThreadFileContent(
  threadId: string,
  path: string,
  content: string,
): Promise<{ path: string; etag: string }> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('active org required');
  }
  const qs = new URLSearchParams({ path });
  return apiJson<{ path: string; etag: string }>(
    `${threadsBase(orgId)}/${encodeURIComponent(threadId)}/files/content?${qs.toString()}`,
    {
      method: 'PUT',
      headers: { 'X-Org-Id': orgId },
      body: JSON.stringify({ content, encoding: 'utf-8' }),
    },
  );
}

export function threadAttachmentQueryKey(
  threadId: string,
  attachmentId: string,
): readonly ['thread-attachment-blob', string, string] {
  return ['thread-attachment-blob', threadId, attachmentId];
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
