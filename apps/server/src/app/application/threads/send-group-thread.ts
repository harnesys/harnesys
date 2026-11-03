import type { AcceptedRunResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import type { OrgAudit } from '../../domain/fleet/org-audit.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { resolveResponders } from '../../domain/thread/responder-policy.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { allowsMentions } from '../../domain/thread/thread-policy.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { type OrgSqliteDb, withOrgSqlite } from '../../infra/org-sqlite/org-sqlite-session.ts';
import { enqueueThreadMessage } from '../../infra/org-sqlite/thread-message-queue.store.ts';
import { attributedRun, auditRunStart } from './run-attribution.ts';
import { resolveAttachmentsOf } from './send-thread-attachments.ts';
import type { SendThreadRunRequest } from './send-thread-run.use-case.ts';

export interface GroupSendDeps {
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
  agents: AgentRegistryPort;
  attachments: AttachmentRepositoryPort;
  users: UserRepository;
  executor: LocalExecutorPort;
  audit: OrgAudit;
  layout: HostFsLayoutPort;
}

export async function sendGroupThread(
  deps: GroupSendDeps,
  request: SendThreadRunRequest,
  thread: ThreadRecord,
): Promise<AcceptedRunResponse> {
  const members = deps.threadAgents.listByThread(request.orgId, thread.id).map((row) => ({
    id: row.agentId,
    name: deps.agents.findById(request.orgId, row.agentId)?.name ?? row.agentId,
  }));
  const responders = resolveResponders({
    text: request.body.text ?? '',
    explicitAgentId: request.body.agentId ?? null,
    members,
    autoReplyAgentId: thread.autoReplyAgentId,
    allowMentions: allowsMentions(thread.policy),
  });
  const attachments = resolveAttachmentsOf(
    deps.attachments,
    request.orgId,
    thread.id,
    request.body.attachmentIds,
  );
  const actorId = request.attribution.startedByUserId;
  const author = actorId
    ? {
        provider: 'app',
        providerUserId: actorId,
        displayName: deps.users.findById(actorId)?.name ?? actorId,
      }
    : null;
  const enqueued = withOrgSqlite(deps.layout, request.orgId, (db) =>
    db.transaction(
      (tx) =>
        enqueueThreadMessage(tx as OrgSqliteDb, {
          threadId: thread.id,
          text: request.body.text ?? '',
          ...(attachments.length > 0 ? { attachments } : {}),
          ...(request.body.origin ? { origin: request.body.origin } : {}),
          ...(request.body.clientEventId ? { clientEventId: request.body.clientEventId } : {}),
          ...(author ? { author } : {}),
          targetAgentIds: responders,
          threadScoped: true,
        }),
      { behavior: 'immediate' },
    ),
  );
  if (enqueued.duplicate) {
    return { runId: '', threadId: thread.id, status: 'ignored' };
  }
  deps.threads.touch(request.orgId, thread.id);
  if (responders.length === 0) {
    return { runId: '', threadId: thread.id, status: 'ignored' };
  }
  const drained = await deps.executor.drainMessageQueue(request.orgId, thread.id);
  const runId = drained.status === 'delivered' ? drained.runId : '';
  if (runId) {
    auditRunStart(deps.audit, {
      orgId: request.orgId,
      runId,
      attribution: attributedRun(request.attribution, null),
      triggerId: request.trigger?.id ?? thread.id,
    });
  }
  return { runId, threadId: thread.id, status: 'queued' };
}
