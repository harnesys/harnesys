import type {
  AddIssueCommentBody,
  AddIssueDependencyBody,
  AddIssueSourceAttachmentBody,
  GetIssueResponse,
  IssueAttachmentPublic,
  IssueCommentPublic,
  ListIssueCommentsResponse,
} from '@harnesys/contracts';
import { getActiveOrgId } from './active-org';
import { ApiError, apiJson, apiUrl } from './client';
import { authenticatedFetch } from './session';

function requireOrgId(orgId?: string): string {
  const resolved = orgId ?? getActiveOrgId();
  if (!resolved) {
    throw new ApiError(400, 'No active organization');
  }
  return resolved;
}

function issueBase(orgId: string, issueId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/issues/${encodeURIComponent(issueId)}`;
}

export function getIssueDetail(orgId: string, issueId: string): Promise<GetIssueResponse> {
  return apiJson<GetIssueResponse>(issueBase(requireOrgId(orgId), issueId));
}

export function listIssueComments(
  orgId: string,
  issueId: string,
): Promise<ListIssueCommentsResponse> {
  return apiJson<ListIssueCommentsResponse>(`${issueBase(requireOrgId(orgId), issueId)}/comments`);
}

export function addIssueComment(
  orgId: string,
  issueId: string,
  body: AddIssueCommentBody,
): Promise<IssueCommentPublic[]> {
  return apiJson<ListIssueCommentsResponse>(`${issueBase(requireOrgId(orgId), issueId)}/comments`, {
    method: 'POST',
    body: JSON.stringify(body),
  }).then((res) => res.items);
}

export function addIssueDependency(
  orgId: string,
  issueId: string,
  body: AddIssueDependencyBody,
): Promise<void> {
  return apiJson<void>(`${issueBase(requireOrgId(orgId), issueId)}/dependencies`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function removeIssueDependency(
  orgId: string,
  issueId: string,
  dependsOnIssueId: string,
): Promise<void> {
  return apiJson<void>(
    `${issueBase(requireOrgId(orgId), issueId)}/dependencies/${encodeURIComponent(dependsOnIssueId)}`,
    { method: 'DELETE' },
  );
}

export function uploadIssueAttachment(
  orgId: string,
  issueId: string,
  file: File,
): Promise<IssueAttachmentPublic> {
  const body = new FormData();
  body.append('file', file);
  return apiJson<IssueAttachmentPublic>(`${issueBase(requireOrgId(orgId), issueId)}/attachments`, {
    method: 'POST',
    body,
  });
}

export function addIssueSourceAttachment(
  orgId: string,
  issueId: string,
  body: AddIssueSourceAttachmentBody,
): Promise<IssueAttachmentPublic> {
  return apiJson<IssueAttachmentPublic>(
    `${issueBase(requireOrgId(orgId), issueId)}/attachments/source`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function deleteIssueAttachment(
  orgId: string,
  issueId: string,
  attachmentId: string,
): Promise<void> {
  return apiJson<void>(
    `${issueBase(requireOrgId(orgId), issueId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: 'DELETE' },
  );
}

export async function loadIssueAttachment(
  orgId: string,
  issueId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const url = apiUrl(
    `${issueBase(requireOrgId(orgId), issueId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  const response = await authenticatedFetch(url, { signal });
  if (!response.ok) {
    throw new Error(`failed to load attachment (${response.status})`);
  }
  return response.blob();
}
