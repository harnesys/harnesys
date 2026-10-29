import type { TaskEnvelope } from '@harnesys/contracts';
import { createRunEventFeed, InMemoryRunEventStore, InMemoryRunLifecycleStore } from 'harnesys';
import type { PlaceRunInput } from './work-executor.compose.ts';
import { startEventForwarder } from './work-executor.util.ts';

export async function startPlacedForwarder(args: {
  input: PlaceRunInput;
  envelope: TaskEnvelope;
  events: InMemoryRunEventStore;
  lifecycle: InMemoryRunLifecycleStore;
  feed: ReturnType<typeof createRunEventFeed>;
  sendFrame: (payload: string) => void;
  active: { cancelled: boolean };
}): Promise<{ stop(): void }> {
  const { input, envelope, events, lifecycle, feed, sendFrame, active } = args;
  const attachments =
    envelope.attachments.length > 0 && input.fetchAttachments
      ? await input.fetchAttachments(envelope.attachments)
      : [];
  await lifecycle.create(
    { runId: envelope.runId, threadId: envelope.threadId, attribution: envelope.attribution },
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
