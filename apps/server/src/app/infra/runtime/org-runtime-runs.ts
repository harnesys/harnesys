import type { RunAcceptedResponse, RunEnvironment } from '@harnesys/contracts';
import type {
  Attachment,
  PendingSessionEvent,
  RunAttribution,
  RunLifecycleStore,
  SessionHandle,
} from 'harnesys';
import type { RunIsolation } from '../../domain/fleet/placement.ts';
import {
  RunConflictException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';

export interface SendThreadMessageInput {
  threadId: string;
  text?: string;
  effort?: string;
  mode?: string;
  attachments?: Attachment[];
  skills?: string[];
  clientEventId?: string;
  origin?: string;
  correlationId?: string;
  environment?: RunEnvironment;
  isolation?: RunIsolation;
  branch?: string;
  attribution?: RunAttribution;
  agentId: string;
  triggerThreadSeq?: number;
}

export interface RunControlDeps {
  lifecycle: RunLifecycleStore;
  requestedSkills: Map<string, string[]>;
  requestedModes: Map<string, string | undefined>;
  sessionFor: (threadId: string, agentId: string) => Promise<SessionHandle>;
  kick: () => void;
  abortRun?: (runId: string) => void;
}

export async function sendThreadMessage(
  deps: RunControlDeps,
  input: SendThreadMessageInput,
): Promise<RunAcceptedResponse> {
  const handle = await deps.sessionFor(input.threadId, input.agentId);
  const clientEventId = input.clientEventId ?? crypto.randomUUID();
  deps.requestedSkills.set(input.threadId, input.skills ?? []);
  deps.requestedModes.set(input.threadId, input.mode);
  const { runId } = await handle.send(
    {
      text: input.text,
      effort: input.effort,
      ...(input.environment ? { environmentJson: JSON.stringify(input.environment) } : {}),
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.attribution ? { attribution: input.attribution } : {}),
    },
    {
      clientEventId,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.triggerThreadSeq !== undefined ? { triggerThreadSeq: input.triggerThreadSeq } : {}),
    },
  );
  return { runId, threadId: input.threadId, status: 'queued' as const };
}

export async function cancelThreadRun(deps: RunControlDeps, runId: string): Promise<void> {
  const rec = await deps.lifecycle.get(runId);
  if (!rec) {
    throw new ThreadValidationException(`run not found: ${runId}`);
  }
  deps.abortRun?.(runId);
  const cancelled = {
    type: 'run.cancelled',
    reason: 'run cancelled',
  } as PendingSessionEvent;
  await deps.lifecycle.transition(runId, rec.leaseEpoch, {
    from: rec.status,
    to: 'cancelled',
    events: [cancelled],
  });
}

export async function retryThreadRun(
  deps: RunControlDeps,
  runId: string,
): Promise<{ runId: string }> {
  const rec = await deps.lifecycle.get(runId);
  if (!rec) {
    throw new ThreadValidationException(`run not found: ${runId}`);
  }
  if (rec.status === 'needs_input') {
    throw new RunConflictException(`run has pending ask: ${runId}`, { runId });
  }
  if (rec.status === 'running') {
    const expired = rec.leaseExpiresAt !== undefined && rec.leaseExpiresAt < Date.now();
    if (!expired) {
      throw new RunConflictException(`run lease held: ${runId}`, { runId });
    }
  }
  await deps.lifecycle.transition(runId, rec.leaseEpoch, {
    from: rec.status,
    to: 'queued',
    advanceAttempt: true,
    interruptId: null,
    waitFireAt: null,
    events: [],
  });
  deps.kick();
  return { runId };
}
