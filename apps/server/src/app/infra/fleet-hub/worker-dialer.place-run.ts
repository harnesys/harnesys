import type { Logger } from '@harnesys/brix';
import type { TaskEnvelope } from '@harnesys/contracts';
import type { SessionEvent } from 'harnesys';
import type { PendingRunEventPort } from '../../domain/fleet/pending-run-event.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { PlaceRunInput } from './work-executor.compose.ts';
import type { DialerSession } from './worker-dialer.session.ts';
import { fetchRunAttachments, persistRunEventBatch } from './worker-dialer.sync.ts';
import type { WorkerWorkExecutor } from './worker-work-executor.ts';

export function placeWorkerRun(input: {
  session: DialerSession;
  envelope: TaskEnvelope;
  log: Logger;
  workExecutor: WorkerWorkExecutor;
  pendingEvents: PendingRunEventPort;
  layout: HostFsLayoutPort;
}): void {
  if (!input.session.snapshotReady) {
    const pending = input.session.pendingPlaces;
    const without = pending.filter((item) => item.runId !== input.envelope.runId);
    without.push(input.envelope);
    input.session.pendingPlaces = without;
    input.log.info(
      { orgId: input.session.identity.orgId, runId: input.envelope.runId },
      'RUN_PLACE deferred until snapshot accepted',
    );
    return;
  }
  input.log.info(
    { orgId: input.session.identity.orgId, runId: input.envelope.runId },
    'received RUN_PLACE',
  );
  input.workExecutor.place(buildPlaceInput(input, input.envelope));
}

export function flushDeferredPlaces(input: {
  session: DialerSession;
  log: Logger;
  workExecutor: WorkerWorkExecutor;
  pendingEvents: PendingRunEventPort;
  layout: HostFsLayoutPort;
}): void {
  if (!input.session.snapshotReady || input.session.pendingPlaces.length === 0) {
    return;
  }
  const queued = input.session.pendingPlaces;
  input.session.pendingPlaces = [];
  for (const envelope of queued) {
    input.log.info(
      { orgId: input.session.identity.orgId, runId: envelope.runId },
      'flushing deferred RUN_PLACE',
    );
    input.workExecutor.place(buildPlaceInput(input, envelope));
  }
}

function buildPlaceInput(
  input: {
    session: DialerSession;
    pendingEvents: PendingRunEventPort;
    layout: HostFsLayoutPort;
  },
  envelope: TaskEnvelope,
): PlaceRunInput {
  return {
    identity: input.session.identity,
    envelope,
    sendFrame: (payload) => {
      try {
        input.session.socket?.send(payload);
      } catch {
        // ignore
      }
    },
    persistEvents: (events: SessionEvent[]) => {
      persistRunEventBatch({
        pending: input.pendingEvents,
        orgId: input.session.identity.orgId,
        runId: envelope.runId,
        leaseEpoch: envelope.leaseEpoch,
        attribution: envelope.attribution ?? null,
        events,
      });
    },
    fetchAttachments: (metas) =>
      fetchRunAttachments({
        identity: input.session.identity,
        threadId: envelope.threadId,
        runId: envelope.runId,
        metas,
        layout: input.layout,
      }),
  };
}
