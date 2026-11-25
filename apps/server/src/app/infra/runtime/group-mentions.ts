import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { SessionEvent } from 'harnesys';
import type { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import {
  type ResponderMember,
  resolveMentionedAgentIds,
} from '../../domain/thread/responder-policy.ts';
import type { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { allowsMentions } from '../../domain/thread/thread-policy.ts';
import type { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runEventsTable, runsTable } from '../org-sqlite/schema/index.ts';
import {
  enqueueThreadMessage,
  listUndeliveredThreadMessages,
} from '../org-sqlite/thread-message-queue.store.ts';

export const AGENT_MENTION_ORIGIN = 'agent-mention';

export interface AgentMentionDeps {
  orgId: string;
  db: OrgSqliteDb;
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
  agents: AgentRegistryPort;
}

export interface AgentMentionRun {
  runId: string;
  threadId: string;
}

interface RunSender {
  agentId: string | null;
  parentRunId: string | null;
}

export interface MentionTargetState {
  pending: ReadonlySet<string>;
  hasTakenTurn: (agentId: string) => boolean;
}

export function selectMentionTarget(
  mentioned: readonly string[],
  senderAgentId: string,
  state: MentionTargetState,
): string | undefined {
  return mentioned.find(
    (agentId) =>
      agentId !== senderAgentId && !state.pending.has(agentId) && !state.hasTakenTurn(agentId),
  );
}

export function handleAgentMentions(
  deps: AgentMentionDeps,
  run: AgentMentionRun,
  events: readonly SessionEvent[],
): boolean {
  const sender = runSender(deps.db, run.runId);
  if (sender === undefined || sender.agentId === null || sender.parentRunId !== null) {
    return false;
  }
  const answer = lastCompletedAnswer(events);
  if (answer === undefined) {
    return false;
  }
  const thread = deps.threads.findById(deps.orgId, run.threadId);
  if (thread?.kind !== 'group' || !allowsMentions(thread.policy)) {
    return false;
  }
  const mentioned = resolveMentionedAgentIds(
    answer.text,
    agentThreadMembers(deps, thread.id),
  ).filter((agentId) => agentId !== sender.agentId);
  if (mentioned.length === 0) {
    return false;
  }
  const afterSeq = lastHumanMessageSeq(deps.db, thread.id);
  const pending = pendingReplyTargets(deps.db, thread.id);
  const target = selectMentionTarget(mentioned, sender.agentId, {
    pending,
    hasTakenTurn: (agentId) => spokeSince(deps.db, thread.id, agentId, afterSeq),
  });
  if (target === undefined) {
    return false;
  }
  const enqueued = enqueueThreadMessage(deps.db, {
    threadId: thread.id,
    threadSeq: answer.threadSeq,
    text: answer.text,
    threadScoped: false,
    targetAgentIds: [target],
    origin: AGENT_MENTION_ORIGIN,
    clientEventId: `${AGENT_MENTION_ORIGIN}:${thread.id}:${answer.threadSeq}:${target}`,
  });
  return enqueued.itemIds.length > 0;
}

export function agentThreadMembers(
  deps: Pick<AgentMentionDeps, 'orgId' | 'threadAgents' | 'agents'>,
  threadId: string,
): ResponderMember[] {
  return deps.threadAgents.listByThread(deps.orgId, threadId).map((row) => ({
    id: row.agentId,
    name: deps.agents.findById(deps.orgId, row.agentId)?.name ?? row.agentId,
  }));
}

function runSender(db: OrgSqliteDb, runId: string): RunSender | undefined {
  return db
    .select({ agentId: runsTable.agentId, parentRunId: runsTable.parentRunId })
    .from(runsTable)
    .where(eq(runsTable.runId, runId))
    .get();
}

function lastCompletedAnswer(
  events: readonly SessionEvent[],
): { text: string; threadSeq: number } | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== 'run.completed' || event.threadSeq === undefined) {
      continue;
    }
    const text = typeof event.text === 'string' ? event.text.trim() : '';
    if (text.length === 0) {
      return undefined;
    }
    return { text, threadSeq: event.threadSeq };
  }
  return undefined;
}

function lastHumanMessageSeq(db: OrgSqliteDb, threadId: string): number {
  const row = db
    .select({ value: sql<number | null>`MAX(${runEventsTable.threadSeq})` })
    .from(runEventsTable)
    .where(and(eq(runEventsTable.threadId, threadId), eq(runEventsTable.type, 'user')))
    .get();
  return row?.value ?? 0;
}

function pendingReplyTargets(db: OrgSqliteDb, threadId: string): Set<string> {
  const targets = new Set<string>();
  for (const item of listUndeliveredThreadMessages(db, threadId)) {
    if (item.targetAgentId !== null) {
      targets.add(item.targetAgentId);
    }
  }
  return targets;
}

function spokeSince(
  db: OrgSqliteDb,
  threadId: string,
  agentId: string,
  afterThreadSeq: number,
): boolean {
  const row = db
    .select({ runId: runEventsTable.runId })
    .from(runEventsTable)
    .innerJoin(runsTable, eq(runsTable.runId, runEventsTable.runId))
    .where(
      and(
        eq(runEventsTable.threadId, threadId),
        eq(runEventsTable.type, 'run.started'),
        gt(runEventsTable.threadSeq, afterThreadSeq),
        isNull(runsTable.parentRunId),
        eq(runsTable.agentId, agentId),
      ),
    )
    .limit(1)
    .get();
  return row !== undefined;
}
