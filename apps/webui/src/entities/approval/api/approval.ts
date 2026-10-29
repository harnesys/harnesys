import type {
  ApprovalDecisionScope,
  ApprovalKind,
  ApprovalOption,
  ApprovalPublic,
  ApprovalRule,
  ApprovalStatus,
  ApprovalSurface,
  DecideApprovalResponse,
  ListApprovalsResponse,
} from '@harnesys/contracts';
import { apiJson } from '@/shared/api/client';

export type InboxApprovalRecord = ApprovalPublic;

export interface InboxDecideInput {
  decision: ApprovalOption;
  surface: ApprovalSurface;
  note?: string;
  rule?: ApprovalRule;
  extend?: number;
  scope?: ApprovalDecisionScope;
}

export type InboxDecideResponse = DecideApprovalResponse;

function approvalsBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/approvals`;
}

export function listInbox(
  orgId: string,
  params: { status?: ApprovalStatus } = {},
): Promise<ListApprovalsResponse> {
  const search = new URLSearchParams();
  if (params.status) {
    search.set('status', params.status);
  }
  const query = search.toString();
  return apiJson<ListApprovalsResponse>(`${approvalsBase(orgId)}${query ? `?${query}` : ''}`);
}

export function getInboxApproval(orgId: string, id: string) {
  return apiJson<InboxApprovalRecord>(`${approvalsBase(orgId)}/${encodeURIComponent(id)}`);
}

export function decideInbox(orgId: string, id: string, body: InboxDecideInput) {
  return apiJson<InboxDecideResponse>(`${approvalsBase(orgId)}/${encodeURIComponent(id)}/decide`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export const inboxQueryKey = ['inbox'] as const;

export function inboxQueryKeyFor(orgId: string, status?: ApprovalStatus) {
  return status === undefined
    ? ([...inboxQueryKey, orgId] as const)
    : ([...inboxQueryKey, orgId, status] as const);
}

export type { ApprovalKind, ApprovalOption, ApprovalStatus, ApprovalSurface };
