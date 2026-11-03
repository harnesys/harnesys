import type { TaskEnvelope } from '@harnesys/contracts';
import { createRunEventFeed, InMemoryRunEventStore, InMemoryRunLifecycleStore } from 'harnesys';
import type { PlaceRunInput } from './work-executor.compose.ts';
import { startEventForwarder } from './work-executor.util.ts';

export async function startPlacedForwarder(args: {
  input: PlaceRunInput;
  envelope: TaskEnvelope;
  agentName: string;
  events: InMemoryRunEventStore;
  lifecycle: InMemoryRunLifecycleStore;
  feed: ReturnType<typeof createRunEventFeed>;
  sendFrame: (payload: string) => void;
  active: { cancelled: boolean };
}): Promise<{ stop(): void }> {
  const { input, envelope, agentName, events, lifecycle, feed, sendFrame, active } = args;
  const attachments =
    envelope.attachments.length > 0 && input.fetchAttachments
      ? await input.fetchAttachments(envelope.attachments)
      : [];
  await lifecycle.create(
    {
      runId: envelope.runId,
      threadId: envelope.threadId,
      agentId: envelope.agentId,
      agentName,
      attribution: envelope.attribution,
    },
    [
      {
        type: 'user',
        text: envelope.inputText ?? '',
        ...(envelope.effort ? { effort: envelope.effort } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
      },
    ],
  );
  const baseSeq = applyRelayBaseSeq(events, lifecycle, envelope);
  return startEventForwarder({
    feed,
    runId: envelope.runId,
    leaseEpoch: envelope.leaseEpoch,
    fromSeq: baseSeq,
    sendFrame,
    isCancelled: () => active.cancelled,
    ...(input.persistEvents ? { persistEvents: input.persistEvents } : {}),
  });
}

function applyRelayBaseSeq(
  events: InMemoryRunEventStore,
  lifecycle: InMemoryRunLifecycleStore,
  envelope: { runId: string; relayLastSeq?: number },
): number {
  const baseSeq = envelope.relayLastSeq ?? 0;
  if (baseSeq > 0) {
    events.nextSeq.set(envelope.runId, baseSeq);
    const stored = lifecycle.runs.get(envelope.runId);
    if (stored) {
      stored.lastSeq = baseSeq;
    }
  }
  return baseSeq;
}

export async function parkRestoredRun(input: {
  lifecycle: InMemoryRunLifecycleStore;
  events: InMemoryRunEventStore;
  envelope: TaskEnvelope;
  agentName: string;
  askId: string;
  relayLastSeq: number;
}): Promise<void> {
  const { lifecycle, events, envelope, agentName, askId, relayLastSeq } = input;
  events.nextSeq.set(envelope.runId, relayLastSeq);
  const created = await lifecycle.create({
    runId: envelope.runId,
    threadId: envelope.threadId,
    agentId: envelope.agentId,
    agentName,
    attribution: envelope.attribution,
  });
  const record = lifecycle.runs.get(envelope.runId);
  if (record) {
    record.lastSeq = relayLastSeq;
  }
  await lifecycle.transition(envelope.runId, created.leaseEpoch, {
    from: 'queued',
    to: 'needs_input',
    interruptId: askId,
    events: [],
  });
}
