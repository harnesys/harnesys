import type {
  CapabilityScope,
  WebhookCreatedRecord,
  WebhookCreatedThread,
  WebhookCreateInput,
  WebhookPort,
  WebhookRecord,
  WebhookUpdateInput,
} from 'harnesys';
import { insertAgentThread } from '../../../application/threads/thread.helpers.ts';
import {
  toDeskWebhookDeletedEvent,
  toDeskWebhookEvent,
  webhookEndpointFor,
} from '../../../application/webhooks/webhook.helpers.ts';
import { AgentNotFoundException } from '../../../domain/agent/agent.error.ts';
import { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import { DeskEventsPort } from '../../../domain/desk/desk-events.port.ts';
import type { ThreadRecord } from '../../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../../domain/thread/thread-repository.port.ts';
import {
  WebhookNotFoundException,
  WebhookValidationException,
} from '../../../domain/webhook/webhook.error.ts';
import type {
  WebhookRecord as ServerWebhookRecord,
  WebhookPatch,
} from '../../../domain/webhook/webhook.ts';
import { WebhookRepositoryPort } from '../../../domain/webhook/webhook-repository.port.ts';

export interface OrgWebhookPortDeps {
  webhooks: WebhookRepositoryPort;
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
  agents: AgentRegistryPort;
  deskEvents?: DeskEventsPort;
}

export class OrgWebhookPort implements WebhookPort {
  constructor(private readonly deps: OrgWebhookPortDeps) {}

  list(scope: CapabilityScope): Promise<WebhookRecord[]> {
    return Promise.resolve(this.deps.webhooks.listByOrg(scope.orgId).map(toPortRecord));
  }

  create(scope: CapabilityScope, input: WebhookCreateInput): Promise<WebhookCreatedRecord> {
    const name = input.name.trim();
    if (!name) {
      throw new WebhookValidationException('webhook name cannot be empty');
    }
    const agentId = input.targetAgentId?.trim() || scope.agentId;
    const agent = this.deps.agents.findById(scope.orgId, agentId);
    if (!agent || agent.status === 'archived') {
      throw new AgentNotFoundException(agentId);
    }
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const thread = insertAgentThread(
      { threads: this.deps.threads, threadAgents: this.deps.threadAgents },
      {
        id: crypto.randomUUID(),
        orgId: scope.orgId,
        title: name,
        kind: 'webhook',
        parentThreadId: null,
        forkAt: null,
        inheritedEventCount: 0,
        metadata: {},
        runProfileId: null,
        runDirectory: null,
        createdAt: now,
        updatedAt: now,
        lastReadAt: now,
      },
      agent.id,
    );
    const webhook = this.deps.webhooks.insert({
      id,
      orgId: scope.orgId,
      name,
      status: input.status ?? 'active',
      targetAgentId: agent.id,
      detail: input.detail?.trim() || '',
      endpoint: webhookEndpointFor(scope.orgId, id),
      mode: input.mode ?? null,
      threadId: thread.id,
      lastFiredAt: null,
      createdByUserId: null,
      createdAt: now,
      updatedAt: now,
    });
    this.deps.deskEvents?.emit(scope.orgId, toDeskWebhookEvent(webhook));
    return Promise.resolve({
      webhook: toPortRecord(webhook),
      thread: toPortThread(thread, agent.id, agent.name),
    });
  }

  update(
    scope: CapabilityScope,
    id: string,
    patchInput: WebhookUpdateInput,
  ): Promise<WebhookRecord> {
    const current = this.requireWebhook(scope.orgId, id);
    const patch = buildWebhookPatch(this.deps.agents, scope.orgId, patchInput);
    const updated = this.deps.webhooks.update(scope.orgId, current.id, patch);
    if (patch.name !== undefined && patch.name !== current.name) {
      this.deps.threads.patch(scope.orgId, updated.threadId, { title: patch.name });
    }
    this.deps.deskEvents?.emit(scope.orgId, toDeskWebhookEvent(updated));
    return Promise.resolve(toPortRecord(updated));
  }

  remove(scope: CapabilityScope, id: string): Promise<void> {
    const current = this.requireWebhook(scope.orgId, id);
    this.deps.webhooks.delete(scope.orgId, current.id);
    const thread = this.deps.threads.findById(scope.orgId, current.threadId);
    if (thread?.kind === 'webhook') {
      this.deps.threads.delete(scope.orgId, thread.id);
    }
    this.deps.deskEvents?.emit(scope.orgId, toDeskWebhookDeletedEvent(current.id));
    return Promise.resolve();
  }

  private requireWebhook(orgId: string, id: string): ServerWebhookRecord {
    const current = this.deps.webhooks.findById(orgId, id);
    if (!current) {
      throw new WebhookNotFoundException(id);
    }
    return current;
  }
}

function buildWebhookPatch(
  agents: AgentRegistryPort,
  orgId: string,
  patchInput: WebhookUpdateInput,
): WebhookPatch {
  const patch: WebhookPatch = { updatedAt: new Date().toISOString() };
  applyPatchName(patch, patchInput.name);
  applyPatchStatus(patch, patchInput);
  applyPatchAgent(patch, agents, orgId, patchInput.targetAgentId);
  applyPatchDetail(patch, patchInput.detail);
  if (patchInput.mode !== undefined) {
    patch.mode = patchInput.mode;
  }
  return patch;
}

function applyPatchName(patch: WebhookPatch, name: string | undefined): void {
  if (name === undefined) {
    return;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new WebhookValidationException('webhook name cannot be empty');
  }
  patch.name = trimmed;
}

function applyPatchStatus(patch: WebhookPatch, patchInput: WebhookUpdateInput): void {
  if (patchInput.status !== undefined) {
    patch.status = patchInput.status;
  }
}

function applyPatchAgent(
  patch: WebhookPatch,
  agents: AgentRegistryPort,
  orgId: string,
  targetAgentId: string | undefined,
): void {
  if (targetAgentId === undefined) {
    return;
  }
  const agent = agents.findById(orgId, targetAgentId);
  if (!agent || agent.status === 'archived') {
    throw new AgentNotFoundException(targetAgentId);
  }
  patch.targetAgentId = agent.id;
}

function applyPatchDetail(patch: WebhookPatch, detail: string | undefined): void {
  if (detail !== undefined) {
    patch.detail = detail.trim();
  }
}

function toPortRecord(row: ServerWebhookRecord): WebhookRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    status: row.status,
    targetAgentId: row.targetAgentId,
    detail: row.detail,
    endpoint: row.endpoint || webhookEndpointFor(row.orgId, row.id),
    mode: row.mode,
    threadId: row.threadId,
    lastFiredAt: row.lastFiredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPortThread(
  thread: ThreadRecord,
  agentId: string,
  agentName: string,
): WebhookCreatedThread {
  return {
    id: thread.id,
    title: thread.title,
    agentId,
    agentName,
    orgId: thread.orgId,
    kind: thread.kind,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    lastReadAt: thread.lastReadAt,
    unread: false,
    events: [],
    activeRun: null,
  };
}
