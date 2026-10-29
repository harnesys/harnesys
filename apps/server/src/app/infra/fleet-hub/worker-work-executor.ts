import { Injectable, Logger } from '@harnesys/brix';
import type { OrgNodeIdentity, TaskEnvelope } from '@harnesys/contracts';
import type { SessionEvent } from 'harnesys';
import { OrgExecutionReplicaPort } from '../../domain/fleet/org-execution-replica.port.ts';
import { KnowledgeSearchPort } from '../../domain/knowledge/knowledge-search.port.ts';
import { KnowledgeStorePort } from '../../domain/knowledge/knowledge-store.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { WorkspaceContainerPort } from '../../domain/process-runtime/workspace-container.port.ts';
import { SourceSkillsPort } from '../../domain/skills/source-skills.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import {
  deletePlacedRunRecord,
  readPlacedRunRecord,
  writePlacedRunRecord,
} from './placed-run-record.ts';
import { rejectPlacedRun } from './reject-placed-run.ts';
import { RelayIssueTrackerPort } from './relay-issue-tracker.port.ts';
import {
  createSnapshotAgentRegistry,
  createSnapshotFileRules,
  createSnapshotModelPort,
  createSnapshotOrgSettings,
  createSnapshotProviderPort,
  createSnapshotSourceLocation,
  createSnapshotSourceRegistry,
} from './snapshot-registry.ts';
import { resumePlacedRun } from './work-executor.resume.ts';
import {
  executePlacedRun,
  type PlacedAskResume,
  type PlaceRunHandle,
  type PlaceRunInput,
  type WorkExecutorDeps,
} from './work-executor.ts';
import { notifyWorkerRunFailed } from './work-executor.util.ts';

@Injectable()
export class WorkerWorkExecutor {
  private readonly log: Logger;
  private readonly active = new Map<string, PlaceRunHandle>();

  constructor(
    private readonly replica: OrgExecutionReplicaPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly containers: WorkspaceContainerPort,
    private readonly knowledgeSearch: KnowledgeSearchPort,
    private readonly knowledgeStore: KnowledgeStorePort,
    private readonly plugins: PluginRuntimePort,
    private readonly sourceSkills: SourceSkillsPort,
    logger: Logger,
  ) {
    this.log = logger.child('worker-work-executor');
  }

  place(input: PlaceRunInput): void {
    const snapshot = this.replica.get(input.identity.orgId);
    if (!snapshot) {
      this.log.warn(
        { orgId: input.identity.orgId, runId: input.envelope.runId },
        'RUN_PLACE refused: no compatible org execution snapshot',
      );
      rejectPlacedRun(input, 'org execution snapshot missing on worker');
      return;
    }
    if (!this.replica.isReadyForRevision(input.identity.orgId, input.envelope.configRevision)) {
      this.log.warn(
        {
          orgId: input.identity.orgId,
          runId: input.envelope.runId,
          configRevision: input.envelope.configRevision,
          accepted: this.replica.acceptedRevision(input.identity.orgId),
        },
        'RUN_PLACE refused: snapshot revision mismatch',
      );
      rejectPlacedRun(
        input,
        `snapshot revision mismatch: need ${input.envelope.configRevision}, accepted ${this.replica.acceptedRevision(input.identity.orgId) ?? 'none'}`,
      );
      return;
    }
    const existing = this.active.get(input.envelope.runId);
    if (existing) {
      existing.cancel();
    }
    const runId = input.envelope.runId;
    writePlacedRunRecord(this.layout, input.identity.orgId, input.envelope);
    const handle = executePlacedRun(this.depsFor(input.identity, input.envelope), input, () => {
      if (this.active.get(runId) === handle) {
        this.active.delete(runId);
      }
      deletePlacedRunRecord(this.layout, input.identity.orgId, runId);
    });
    this.active.set(runId, handle);
  }

  private depsFor(identity: OrgNodeIdentity, envelope: TaskEnvelope): WorkExecutorDeps {
    const snapshot = this.replica.get(identity.orgId);
    if (!snapshot) {
      throw new Error('org execution snapshot missing on worker');
    }
    const agents = createSnapshotAgentRegistry(snapshot);
    const providers = createSnapshotProviderPort(snapshot);
    const models = createSnapshotModelPort(snapshot);
    const sources = createSnapshotSourceRegistry(snapshot);
    const sourceLocation = createSnapshotSourceLocation(
      sources,
      this.materializations,
      this.layout,
    );
    const orgSettings = createSnapshotOrgSettings(snapshot);
    return {
      agents,
      providers,
      models,
      sources,
      sourceLocation,
      layout: this.layout,
      machineConfig: this.machineConfig,
      containers: this.containers,
      fileRules: createSnapshotFileRules(snapshot),
      knowledge: {
        search: this.knowledgeSearch,
        store: this.knowledgeStore,
        sources,
      },
      plugins: this.plugins,
      sourceSkills: this.sourceSkills,
      orgSettings,
      issueTracker: new RelayIssueTrackerPort({
        relayUrl: identity.relayUrl,
        orgId: identity.orgId,
        token: identity.token,
        runId: envelope.runId,
      }),
      logger: this.log,
    };
  }

  resumeAsk(
    command: {
      runId: string;
      askId: string;
      action: 'respond' | 'reject';
      payload?: unknown;
      note?: string;
      clientEventId?: string;
      threadId?: string;
      relayLastSeq?: number;
      leaseEpoch?: number;
    },
    ctx: ResumeAskContext,
  ): Promise<void> {
    const handle = this.active.get(command.runId);
    if (handle) {
      return handle.resumeAsk(toPlacedResume(command));
    }
    return this.rebuildAndResume(command, ctx);
  }

  private rebuildAndResume(
    command: {
      runId: string;
      askId: string;
      action: 'respond' | 'reject';
      payload?: unknown;
      note?: string;
      clientEventId?: string;
      relayLastSeq?: number;
      leaseEpoch?: number;
    },
    ctx: ResumeAskContext,
  ): Promise<void> {
    const orgId = ctx.identity.orgId;
    const envelope = readPlacedRunRecord(this.layout, orgId, command.runId);
    const relayLastSeq = command.relayLastSeq ?? 0;
    const leaseEpoch = command.leaseEpoch ?? envelope?.leaseEpoch ?? 0;
    const persistEvents =
      ctx.persistEvents === undefined
        ? undefined
        : (events: SessionEvent[]) => ctx.persistEvents?.(command.runId, leaseEpoch, events);
    if (
      !envelope ||
      !this.replica.get(orgId) ||
      !this.replica.isReadyForRevision(orgId, envelope.configRevision)
    ) {
      this.log.warn(
        { orgId, runId: command.runId, askId: command.askId },
        'WORK_ASK_RESUME cannot rebuild: placement record or snapshot missing',
      );
      notifyWorkerRunFailed({
        runId: command.runId,
        leaseEpoch,
        relayLastSeq,
        reason: 'worker cannot restore the run: placement record or snapshot missing',
        sendFrame: ctx.sendFrame,
        ...(persistEvents ? { persistEvents } : {}),
      });
      return Promise.resolve();
    }
    const handle = resumePlacedRun(
      this.depsFor(ctx.identity, envelope),
      {
        identity: ctx.identity,
        envelope,
        resume: toPlacedResume(command),
        sendFrame: ctx.sendFrame,
        ...(persistEvents ? { persistEvents } : {}),
        relayLastSeq,
        leaseEpoch,
      },
      () => {
        if (this.active.get(command.runId) === handle) {
          this.active.delete(command.runId);
        }
      },
    );
    this.active.set(command.runId, handle);
    return Promise.resolve();
  }

  cancel(runId: string): void {
    const handle = this.active.get(runId);
    if (!handle) {
      return;
    }
    handle.cancel();
    this.active.delete(runId);
  }

  resumeApproval(command: {
    approvalId: string;
    runId: string;
    interruptId: string;
    decision: 'approve' | 'approve_once' | 'deny';
    scope?: 'once' | 'run' | 'always';
  }): void {
    this.log.info(
      {
        runId: command.runId,
        approvalId: command.approvalId,
        interruptId: command.interruptId,
        decision: command.decision,
      },
      'APPROVAL_RESUME received on worker',
    );
  }

  expireRun(runId: string): void {
    this.cancel(runId);
  }
}

export interface ResumeAskContext {
  identity: OrgNodeIdentity;
  sendFrame: (payload: string) => void;
  persistEvents?: (runId: string, leaseEpoch: number, events: SessionEvent[]) => void;
}

function toPlacedResume(command: {
  askId: string;
  action: 'respond' | 'reject';
  payload?: unknown;
  note?: string;
  clientEventId?: string;
}): PlacedAskResume {
  return command.action === 'reject'
    ? {
        action: 'reject',
        askId: command.askId,
        note: command.note,
        clientEventId: command.clientEventId,
      }
    : {
        action: 'respond',
        askId: command.askId,
        payload: command.payload,
        clientEventId: command.clientEventId,
      };
}
