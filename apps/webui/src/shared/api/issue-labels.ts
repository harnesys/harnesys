import type {
  CreateIssueLabelBody,
  ListIssueLabelsResponse,
  UpdateIssueLabelBody,
} from '@harnesys/contracts';
import type { IssueLabelRecord } from '@harnesys/studio-shared';
import { getActiveOrgId } from './active-org';
import { ApiError, apiJson } from './client';

export type CreateIssueLabelInput = CreateIssueLabelBody;

function requireOrgId(orgId?: string): string {
  const resolved = orgId ?? getActiveOrgId();
  if (!resolved) {
    throw new ApiError(400, 'No active organization');
  }
  return resolved;
}

function labelsBase(orgId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/labels`;
}

function toLabels(res: ListIssueLabelsResponse): IssueLabelRecord[] {
  return res.items;
}

export async function listIssueLabels(orgId?: string): Promise<IssueLabelRecord[]> {
  const res = await apiJson<ListIssueLabelsResponse>(labelsBase(requireOrgId(orgId)));
  return toLabels(res);
}

export function createIssueLabel(
  orgId: string,
  body: CreateIssueLabelInput,
): Promise<IssueLabelRecord[]> {
  return apiJson<ListIssueLabelsResponse>(labelsBase(requireOrgId(orgId)), {
    method: 'POST',
    body: JSON.stringify(body),
  }).then(toLabels);
}

export function updateIssueLabel(
  orgId: string,
  labelId: string,
  body: UpdateIssueLabelBody,
): Promise<IssueLabelRecord[]> {
  return apiJson<ListIssueLabelsResponse>(
    `${labelsBase(requireOrgId(orgId))}/${encodeURIComponent(labelId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  ).then(toLabels);
}

export async function deleteIssueLabel(orgId: string, labelId: string): Promise<void> {
  await apiJson<void>(`${labelsBase(requireOrgId(orgId))}/${encodeURIComponent(labelId)}`, {
    method: 'DELETE',
  });
}
