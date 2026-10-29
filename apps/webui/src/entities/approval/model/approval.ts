import type { ApprovalKind, ApprovalStatus } from '@harnesys/contracts';
import { APPROVAL_PARK_SOURCES } from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import {
  type InboxApprovalRecord,
  inboxQueryKey,
  inboxQueryKeyFor,
  listInbox,
} from '../api/approval';

export function inboxQuery(orgId: string, status?: ApprovalStatus) {
  return queryOptions({
    queryKey: inboxQueryKeyFor(orgId, status),
    queryFn: () => listInbox(orgId, status ? { status } : {}),
    enabled: Boolean(orgId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function inboxPendingQuery(orgId: string) {
  return queryOptions({
    queryKey: [...inboxQueryKey, orgId, 'pending'] as const,
    queryFn: () => listInbox(orgId, { status: 'pending' }),
    enabled: Boolean(orgId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

const KIND_LABELS: Record<ApprovalKind, string> = {
  tool: 'Tool',
  spend: 'Spend',
  memory: 'Memory',
  question: 'Question',
  file_access: 'File access',
};

export function kindLabel(kind: ApprovalKind): string {
  return KIND_LABELS[kind] ?? kind;
}

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  cancelled: 'Cancelled',
  superseded: 'Superseded',
};

export function statusLabel(status: ApprovalStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function statusTone(status: ApprovalStatus): 'wait' | 'ok' | 'danger' | 'warn' | 'off' {
  switch (status) {
    case 'pending':
      return 'wait';
    case 'approved':
      return 'ok';
    case 'denied':
      return 'danger';
    case 'cancelled':
      return 'warn';
    default:
      return 'off';
  }
}

export function parksRun(approval: InboxApprovalRecord): boolean {
  return (
    approval.status === 'pending' &&
    approval.threadId !== null &&
    (APPROVAL_PARK_SOURCES as readonly string[]).includes(approval.context.source)
  );
}

export type { InboxApprovalRecord };
