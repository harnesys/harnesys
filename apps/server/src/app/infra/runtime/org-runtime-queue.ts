import type { AcceptedRunResponse } from '@harnesys/contracts';
import type { RunLifecycleStore, SessionHandle, SteerMessage } from 'harnesys';
import type { ThreadQueueDrainResult } from '../../domain/thread/local-executor.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import {
  headQueuedThreadMessage,
  listUndeliveredThreadMessages,
  markThreadMessageDelivered,
  type QueuedThreadMessage,
} from '../org-sqlite/thread-message-queue.store.ts';
import type { SendThreadMessageInput } from './org-runtime-runs.ts';
import { sendThreadMessage } from './org-runtime-runs.ts';
import type { ThreadBinding } from './workspace-target.ts';

export interface ThreadQueueDrainerDeps {
  db: OrgSqliteDb;
  lifecycle: Pick<RunLifecycleStore, 'activeByThread'>;
  send: (input: SendThreadMessageInput) => Promise<AcceptedRunResponse>;
}

export interface ThreadQueueRuntimeDeps {
  db: OrgSqliteDb;
  lifecycle: RunLifecycleStore;
  sessionFor: (threadId: string) => Promise<SessionHandle>;
  requestedSkills: Map<string, string[]>;
  worktreeBindings: Map<string, ThreadBinding>;
  kick: () => void;
}

export function createThreadQueueDrainer(
  runtime: ThreadQueueRuntimeDeps,
): (threadId: string) => Promise<ThreadQueueDrainResult> {
  const inflight = new Map<string, Promise<ThreadQueueDrainResult>>();
  return (threadId) => {
    const existing = inflight.get(threadId);
    if (existing) {
      return existing;
    }
    const pending = drainThreadMessageQueue(
      {
        db: runtime.db,
        lifecycle: runtime.lifecycle,
        send: (input) =>
          sendThreadMessage(
            {
              lifecycle: runtime.lifecycle,
              requestedSkills: runtime.requestedSkills,
              worktreeBindings: runtime.worktreeBindings,
              sessionFor: runtime.sessionFor,
              kick: runtime.kick,
            },
            input,
          ),
      },
      threadId,
    ).finally(() => inflight.delete(threadId));
    inflight.set(threadId, pending);
    return pending;
  };
}

export async function drainThreadMessageQueue(
  deps: ThreadQueueDrainerDeps,
  threadId: string,
): Promise<ThreadQueueDrainResult> {
  const head = headQueuedThreadMessage(deps.db, threadId);
  if (head === null) {
    return { status: 'empty' };
  }
  const active = await deps.lifecycle.activeByThread(threadId);
  if (active !== null) {
    return active.status === 'needs_input'
      ? { status: 'busy', reason: 'pending_ask' }
      : { status: 'busy' };
  }
  const run = await deliverQueuedThreadMessage(deps, head);
  if (run === null) {
    return { status: 'busy' };
  }
  return { status: 'delivered', runId: run };
}

async function deliverQueuedThreadMessage(
  deps: ThreadQueueDrainerDeps,
  item: QueuedThreadMessage,
): Promise<string | null> {
  try {
    const accepted = await deps.send({
      threadId: item.threadId,
      text: item.text,
      ...(item.attachments ? { attachments: item.attachments } : {}),
      ...(item.origin ? { origin: item.origin } : {}),
      ...(item.clientEventId ? { clientEventId: item.clientEventId } : {}),
    });
    markThreadMessageDelivered(deps.db, item.itemId, new Date().toISOString());
    return accepted.runId;
  } catch (error) {
    if (isThreadBusyError(error)) {
      return null;
    }
    throw error;
  }
}

function isThreadBusyError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'thread_busy';
}

export interface SteeringChannel {
  steer: (threadId: string) => Promise<SteerMessage[]>;
  ack: (itemIds: string[]) => Promise<void>;
}

export function createSteeringChannel(db: OrgSqliteDb): SteeringChannel {
  return {
    steer: (threadId) => {
      const items = listUndeliveredThreadMessages(db, threadId);
      return Promise.resolve(items.map(steerMessageOf));
    },
    ack: (itemIds) => {
      const now = new Date().toISOString();
      for (const itemId of itemIds) {
        markThreadMessageDelivered(db, itemId, now);
      }
      return Promise.resolve();
    },
  };
}

function steerMessageOf(item: QueuedThreadMessage): SteerMessage {
  return {
    itemId: item.itemId,
    text: item.text,
    ...(item.attachments && item.attachments.length > 0 ? { attachments: item.attachments } : {}),
    ...(item.origin ? { origin: item.origin } : {}),
    ...(item.clientEventId ? { clientEventId: item.clientEventId } : {}),
  };
}
