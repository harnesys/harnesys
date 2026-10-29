import type {
  CreateWebhookResponse as ContractCreateWebhookResponse,
  CreateWebhookBody,
  ListWebhooksResponse,
  UpdateWebhookBody,
  WebhookPublic,
} from '@harnesys/contracts';
import type {
  CreateWebhookResponse,
  SessionEvent,
  WebhookRecord,
  WebhookStatus,
} from '@harnesys/studio-shared';
import { getActiveOrgId } from './active-org';
import { ApiError, apiJson } from './client';

export interface CreateWebhookInput {
  name: string;
  targetAgentId: string;
  detail?: string;
  threadId?: string;
}

export interface UpdateWebhookInput {
  name?: string;
  status?: WebhookStatus;
  targetAgentId?: string;
  detail?: string;
  threadId?: string;
}

function requireOrgId(orgId?: string): string {
  const resolved = orgId ?? getActiveOrgId();
  if (!resolved) {
    throw new ApiError(400, 'No active organization');
  }
  return resolved;
}

function webhooksBase(orgId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/webhooks`;
}

function toStudioWebhook(record: WebhookPublic): WebhookRecord {
  return {
    id: record.id,
    projectId: record.orgId,
    name: record.name,
    status: record.status,
    targetAgentId: record.targetAgentId,
    detail: record.detail,
    endpoint: record.endpoint,
    threadId: record.threadId,
    lastFiredAt: record.lastFiredAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toStudioCreateResponse(res: ContractCreateWebhookResponse): CreateWebhookResponse {
  return {
    webhook: toStudioWebhook(res.webhook),
    thread: {
      id: res.thread.id,
      title: res.thread.title,
      agentId: res.thread.agentId,
      originAgentId: res.thread.originAgentId,
      agentName: res.thread.agentName,
      projectId: res.thread.orgId,
      kind: res.thread.kind,
      issueId: res.thread.issueId,
      parentThreadId: res.thread.parentThreadId,
      forkAt: res.thread.forkAt,
      inheritedEventCount: res.thread.inheritedEventCount,
      createdAt: res.thread.createdAt,
      updatedAt: res.thread.updatedAt,
      lastReadAt: res.thread.lastReadAt,
      unread: res.thread.unread,
      pinned: res.thread.pinned,
      runMode: res.thread.runMode,
      runProfileId: res.thread.runProfileId,
      runDirectory: res.thread.runDirectory,
      bindingLocked: res.thread.bindingLocked,
      events: res.thread.events as SessionEvent[],
      activeRun: res.thread.activeRun,
    },
  };
}

export function listWebhooks(orgId?: string): Promise<WebhookRecord[]> {
  const resolved = requireOrgId(orgId);
  return apiJson<ListWebhooksResponse>(webhooksBase(resolved)).then((res) =>
    res.items.map(toStudioWebhook),
  );
}

export function createWebhookRecord(orgId: string, body: CreateWebhookInput) {
  const resolved = requireOrgId(orgId);
  const payload: CreateWebhookBody = {
    name: body.name,
    targetAgentId: body.targetAgentId,
    detail: body.detail,
    threadId: body.threadId,
  };
  return apiJson<ContractCreateWebhookResponse>(webhooksBase(resolved), {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then(toStudioCreateResponse);
}

export function updateWebhookRecord(orgId: string, webhookId: string, body: UpdateWebhookInput) {
  const resolved = requireOrgId(orgId);
  const payload: UpdateWebhookBody = {
    name: body.name,
    status: body.status,
    targetAgentId: body.targetAgentId,
    detail: body.detail,
    threadId: body.threadId,
  };
  return apiJson<WebhookPublic>(`${webhooksBase(resolved)}/${encodeURIComponent(webhookId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then(toStudioWebhook);
}

export function deleteWebhookRecord(orgId: string, webhookId: string) {
  const resolved = requireOrgId(orgId);
  return apiJson<void>(`${webhooksBase(resolved)}/${encodeURIComponent(webhookId)}`, {
    method: 'DELETE',
  });
}
