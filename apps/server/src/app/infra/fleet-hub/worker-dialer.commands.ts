import type { Logger } from '@harnesys/brix';
import type { NodeIdentityStore } from '../../domain/fleet/node-identity-store.port.ts';
import type { PendingRunEventPort } from '../../domain/fleet/pending-run-event.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import type { WorkerContentHandler } from '../content/worker-content.handler.ts';
import {
  isApprovalResumeCommand,
  isNodeRemovedCommand,
  isOrgDeletedCommand,
  isRunPlaceCommand,
  isSourceAttachCommand,
  isSourceMaterializeCommand,
  isSourceRefreshCommand,
  isSourceWorktreeCreateCommand,
  isSourceWorktreeRemoveCommand,
  isWorkAskResumeCommand,
  isWorkCancelCommand,
} from './worker-dialer.guards.ts';
import type { WorkerMaterializeDeps } from './worker-dialer.materialize.ts';
import {
  runSourceAttach,
  runSourceMaterialize,
  runSourceRefresh,
} from './worker-dialer.materialize.ts';
import { placeWorkerRun } from './worker-dialer.place-run.ts';
import type { DialerSession } from './worker-dialer.session.ts';
import { persistRunEventBatch } from './worker-dialer.sync.ts';
import { isHttpProxyCommand, sendWorkerProxyResult } from './worker-dialer.util.ts';
import {
  runSourceWorktreeCreate,
  runSourceWorktreeRemove,
  type WorkerWorktreeDeps,
} from './worker-dialer.worktree.ts';
import type { WorkerWorkExecutor } from './worker-work-executor.ts';

export function handleWorkerCommand(input: {
  session: DialerSession;
  frame: Record<string, unknown>;
  log: Logger;
  contentHandler: WorkerContentHandler;
  workExecutor: WorkerWorkExecutor;
  pendingEvents: PendingRunEventPort;
  layout: HostFsLayoutPort;
  store: OrgMachineStore;
  identities: NodeIdentityStore;
  onOrgDropped: (orgId: string) => void;
  matDeps: WorkerMaterializeDeps;
  worktreeDeps: WorkerWorktreeDeps;
  onCloudMaterialized: () => void;
}): void {
  const { session, frame } = input;
  if (typeof frame.commandId !== 'string') {
    return;
  }
  if (isHttpProxyCommand(frame.command)) {
    void sendWorkerProxyResult(
      session.identity.orgId,
      session.socket,
      frame.command,
      (orgId, raw) => input.contentHandler.handle(orgId, raw),
      (message) => input.log.warn({ err: message }, 'worker content proxy failed'),
    );
  } else if (isRunPlaceCommand(frame.command)) {
    placeWorkerRun({
      session,
      envelope: frame.command.envelope,
      log: input.log,
      workExecutor: input.workExecutor,
      pendingEvents: input.pendingEvents,
      layout: input.layout,
    });
  } else if (isWorkCancelCommand(frame.command)) {
    input.workExecutor.cancel(frame.command.runId);
  } else if (isWorkAskResumeCommand(frame.command)) {
    const command = frame.command;
    void input.workExecutor
      .resumeAsk(command, {
        identity: input.session.identity,
        sendFrame: (payload) => {
          try {
            input.session.socket?.send(payload);
          } catch {
            // ignore
          }
        },
        persistEvents: (runId, leaseEpoch, events) => {
          persistRunEventBatch({
            pending: input.pendingEvents,
            orgId: input.session.identity.orgId,
            runId,
            leaseEpoch,
            attribution: null,
            events,
          });
        },
      })
      .catch((err: unknown) => {
        input.log.warn({ err, runId: command.runId }, 'WORK_ASK_RESUME failed');
      });
  } else if (isApprovalResumeCommand(frame.command)) {
    input.workExecutor.resumeApproval(frame.command);
  } else if (isSourceMaterializeCommand(frame.command)) {
    void runSourceMaterialize(input.matDeps, session, frame.command).finally(
      input.onCloudMaterialized,
    );
  } else if (isSourceAttachCommand(frame.command)) {
    runSourceAttach(input.matDeps, session, frame.command);
  } else if (isSourceRefreshCommand(frame.command)) {
    void runSourceRefresh(input.matDeps, session, frame.command).finally(input.onCloudMaterialized);
  } else if (isSourceWorktreeCreateCommand(frame.command)) {
    void runSourceWorktreeCreate(input.worktreeDeps, session, frame.command);
  } else if (isSourceWorktreeRemoveCommand(frame.command)) {
    void runSourceWorktreeRemove(input.worktreeDeps, session, frame.command);
  } else if (isNodeRemovedCommand(frame.command) || isOrgDeletedCommand(frame.command)) {
    dropLocalOrg({
      orgId: frame.command.orgId,
      store: input.store,
      identities: input.identities,
      layout: input.layout,
      onOrgDropped: input.onOrgDropped,
    });
  }
  try {
    session.socket?.send(JSON.stringify({ kind: 'COMMAND_ACK', commandId: frame.commandId }));
  } catch {
    // ignore
  }
}

function dropLocalOrg(input: {
  orgId: string;
  store: OrgMachineStore;
  identities: NodeIdentityStore;
  layout: HostFsLayoutPort;
  onOrgDropped: (orgId: string) => void;
}): void {
  input.onOrgDropped(input.orgId);
  if (input.store.get(input.orgId)) {
    input.store.remove(input.orgId);
  }
  input.identities.remove(input.orgId);
  input.layout.removeOrgDir(input.orgId);
  input.layout.removeOrgDataDir(input.orgId);
}
