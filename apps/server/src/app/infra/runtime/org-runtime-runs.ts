import type { AcceptedRunResponse } from '@harnesys/contracts';
import type {
  Attachment,
  PendingSessionEvent,
  RunAttribution,
  RunLifecycleStore,
  SessionHandle,
} from 'harnesys';
import type { RunIsolation } from '../../domain/fleet/placement.ts';
import type { RunTriggerKind } from '../../domain/thread/prepare-runtime-input.ts';
import {
  RunConflictException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import type { ThreadBinding } from './workspace-target.ts';

export interface SendThreadMessageInput {
  threadId: string;
  text?: string;
  effort?: string;
  attachments?: Attachment[];
  skills?: string[];
  clientEventId?: string;
  origin?: string;
  correlationId?: string;
  directory?: string;
  sourceId?: string;
  worktreeId?: string;
  isolation?: RunIsolation;
  triggerKind?: RunTriggerKind;
  branch?: string;
  attribution?: RunAttribution;
}

export interface RunControlDeps {
  lifecycle: RunLifecycleStore;
  requestedSkills: Map<string, string[]>;
  worktreeBindings: Map<string, ThreadBinding>;
  sessionFor: (threadId: string) => Promise<SessionHandle>;
  kick: () => void;
  abortRun?: (runId: string) => void;
}

export async function sendThreadMessage(
  deps: RunControlDeps,
  input: SendThreadMessageInput,
): Promise<AcceptedRunResponse> {
  const handle = await deps.sessionFor(input.threadId);
  const clientEventId = input.clientEventId ?? crypto.randomUUID();
  deps.requestedSkills.set(input.threadId, input.skills ?? []);
  syncThreadBinding(deps.worktreeBindings, input);
  const { runId } = await handle.send(
    {
      text: input.text,
      effort: input.effort,
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.attribution ? { attribution: input.attribution } : {}),
    },
    {
      clientEventId,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    },
  );
  return { runId, threadId: input.threadId, status: 'queued' as const };
}

function bindingFor(input: SendThreadMessageInput): ThreadBinding | null {
  if (input.directory) {
    return directoryBinding(input);
  }
  if (input.sourceId && input.worktreeId) {
    return worktreeSourceBinding(input);
  }
  if (input.sourceId && input.isolation?.mode === 'container') {
    return containerSourceBinding(input);
  }
  if (input.triggerKind) {
    return triggerSourceBinding(input);
  }
  return null;
}

function directoryBinding(input: SendThreadMessageInput): ThreadBinding {
  return {
    directory: input.directory,
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
    ...(input.isolation ? { isolation: input.isolation } : {}),
    ...(input.triggerKind ? { triggerKind: input.triggerKind } : {}),
  };
}

function worktreeSourceBinding(input: SendThreadMessageInput): ThreadBinding {
  return {
    sourceId: input.sourceId,
    worktreeId: input.worktreeId,
    ...(input.isolation ? { isolation: input.isolation } : {}),
    ...(input.triggerKind ? { triggerKind: input.triggerKind } : {}),
  };
}

function containerSourceBinding(input: SendThreadMessageInput): ThreadBinding {
  return {
    sourceId: input.sourceId,
    isolation: input.isolation,
    ...(input.triggerKind ? { triggerKind: input.triggerKind } : {}),
  };
}

function triggerSourceBinding(input: SendThreadMessageInput): ThreadBinding {
  return {
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.branch ? { branch: input.branch } : {}),
    triggerKind: input.triggerKind,
  };
}

function syncThreadBinding(
  bindings: Map<string, ThreadBinding>,
  input: SendThreadMessageInput,
): void {
  const binding = bindingFor(input);
  if (binding !== null) {
    bindings.set(input.threadId, binding);
  } else {
    bindings.delete(input.threadId);
  }
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
