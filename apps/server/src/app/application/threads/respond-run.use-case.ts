import { Injectable } from '@harnesys/brix';
import {
  type ApprovalDecisionScope,
  type ApprovalRule,
  ApprovalRuleSchema,
  type RejectRunBody,
  type RespondRunBody,
  type RespondRunResponse,
} from '@harnesys/contracts';
import type { RunRecord } from 'harnesys';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import type { WorkerCommand } from '../../domain/fleet/worker-command.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import {
  RunConflictException,
  RunNotFoundException,
  ThreadNotFoundException,
} from '../../domain/thread/thread.error.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import {
  persistFileDecision,
  persistShellDecision,
  scopePersistsRule,
  targetAgentIdOf,
} from '../approvals/persist-decision.ts';

export interface RespondRunRequest {
  orgId: string;
  threadId: string;
  runId: string;
  body: RespondRunBody;
}

export interface RejectRunRequest {
  orgId: string;
  threadId: string;
  runId: string;
  body: RejectRunBody;
}

@Injectable()
export class RespondRunUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly executor: LocalExecutorPort,
    private readonly claims: EventClaimPort,
    private readonly hub: FleetHubPort,
    private readonly agents: AgentRegistryPort,
    private readonly modes: ModePresetRegistryPort,
    private readonly approvalStore: ApprovalStorePort,
    private readonly approvalEvents: ApprovalEventsPort,
    private readonly fileRules: FileAccessRulePort,
    private readonly machineConfig: MachineConfigPort,
    private readonly sourceLocation: SourceLocationPort,
  ) {}

  async execute(request: RespondRunRequest): Promise<RespondRunResponse> {
    const asserted = await this.assertRun(request);
    this.persistApprovedRule(asserted.thread, request);
    if (
      this.routeRemote(request.orgId, request.runId, asserted.rec, {
        askId: request.body.askId,
        action: 'respond',
        payload: request.body.payload,
        clientEventId: request.body.clientEventId,
      })
    ) {
      this.closeApprovalFromRespond(
        request.orgId,
        request.runId,
        request.body.askId,
        request.body.payload,
      );
      return { ok: true };
    }
    const session = await this.executor.sessionFor(request.orgId, request.threadId);
    try {
      await session.respond(request.runId, request.body.askId, request.body.payload, {
        clientEventId: request.body.clientEventId,
      });
    } catch (error) {
      throw mapRunError(request.runId, error);
    }
    this.closeApprovalFromRespond(
      request.orgId,
      request.runId,
      request.body.askId,
      request.body.payload,
    );
    return { ok: true };
  }

  async reject(request: RejectRunRequest): Promise<RespondRunResponse> {
    const asserted = await this.assertRun(request);
    if (
      this.routeRemote(request.orgId, request.runId, asserted.rec, {
        askId: request.body.askId,
        action: 'reject',
        note: request.body.note,
        clientEventId: request.body.clientEventId,
      })
    ) {
      this.closeApprovalFromReject(request.orgId, request.runId, request.body.askId);
      return { ok: true };
    }
    const session = await this.executor.sessionFor(request.orgId, request.threadId);
    try {
      await session.reject(request.runId, request.body.askId, {
        note: request.body.note,
        clientEventId: request.body.clientEventId,
      });
    } catch (error) {
      throw mapRunError(request.runId, error);
    }
    this.closeApprovalFromReject(request.orgId, request.runId, request.body.askId);
    return { ok: true };
  }

  private closeApprovalFromRespond(
    orgId: string,
    runId: string,
    askId: string,
    payload: unknown,
  ): void {
    const row = this.approvalStore.getByRunInterrupt(orgId, runId, askId);
    if (!row) {
      return;
    }
    const decision = resolveDecisionFromPayload(payload);
    if (decision === null) {
      return;
    }
    const result = this.approvalStore.decide(orgId, {
      approvalId: row.id,
      decision,
      surface: 'web',
    });
    if (result.winner) {
      const decided = this.approvalStore.get(orgId, row.id) ?? row;
      this.approvalEvents.emit(orgId, { type: 'decided', approval: decided });
    }
  }

  private closeApprovalFromReject(orgId: string, runId: string, askId: string): void {
    const row = this.approvalStore.getByRunInterrupt(orgId, runId, askId);
    if (!row) {
      return;
    }
    const result = this.approvalStore.decide(orgId, {
      approvalId: row.id,
      decision: 'deny',
      surface: 'web',
    });
    if (result.winner) {
      const decided = this.approvalStore.get(orgId, row.id) ?? row;
      this.approvalEvents.emit(orgId, { type: 'decided', approval: decided });
    }
  }

  private async assertRun(
    request: RespondRunRequest | RejectRunRequest,
  ): Promise<{ thread: ThreadRecord; rec: RunRecord }> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const lifecycle = await this.executor.lifecycle(request.orgId);
    const rec = await lifecycle.get(request.runId);
    if (!rec || rec.threadId !== request.threadId) {
      throw new RunNotFoundException(request.runId);
    }
    return { thread, rec };
  }

  private persistApprovedRule(thread: ThreadRecord, request: RespondRunRequest): void {
    const payload = request.body.payload;
    if (!isRecord(payload)) {
      return;
    }
    const blockPath = payload.approved === false && payload.blockPath === true;
    if (payload.approved !== true && !blockPath) {
      return;
    }
    const parsed = ApprovalRuleSchema.safeParse(payload.rule);
    const rule: ApprovalRule | undefined = parsed.success ? parsed.data : undefined;
    const scope = decisionScopeOf(payload.scope);
    if (!scopePersistsRule(scope, rule)) {
      return;
    }
    const orgId = request.orgId;
    const row = this.approvalStore.getByRunInterrupt(orgId, request.runId, request.body.askId);
    const agentId = targetAgentIdOf(row?.context.delegated, thread.agentId);
    const deps = {
      orgId,
      agents: this.agents,
      modes: this.modes,
      fileRules: this.fileRules,
      machineConfig: this.machineConfig,
      sourceLocation: this.sourceLocation,
    };
    const file = row?.kind === 'file_access' ? row.context.file : undefined;
    if (file) {
      persistFileDecision(deps, { agentId, file, blockPath, rule, scope });
      return;
    }
    if (payload.approved !== true) {
      return;
    }
    if (rule && rule.kind !== 'file-path') {
      persistShellDecision(deps, { agentId, rule });
    }
  }

  private routeRemote(
    orgId: string,
    runId: string,
    rec: RunRecord,
    resume: {
      askId: string;
      action: 'respond' | 'reject';
      payload?: unknown;
      note?: string;
      clientEventId?: string;
    },
  ): boolean {
    const claim = this.claims.findByRun(orgId, runId);
    const now = new Date().toISOString();
    if (!claim || claim.doneAt !== null || claim.leaseUntil <= now) {
      return false;
    }
    const command: WorkerCommand = {
      type: 'WORK_ASK_RESUME',
      runId,
      askId: resume.askId,
      action: resume.action,
      threadId: rec.threadId,
      relayLastSeq: rec.lastSeq,
      leaseEpoch: claim.leaseEpoch,
      ...(resume.action === 'respond' ? { payload: resume.payload } : { note: resume.note }),
      ...(resume.clientEventId !== undefined ? { clientEventId: resume.clientEventId } : {}),
    };
    this.hub.routeCommand(claim.nodeId, command);
    return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const DECISION_SCOPES: ReadonlySet<string> = new Set(['once', 'run', 'always']);

function decisionScopeOf(value: unknown): ApprovalDecisionScope | undefined {
  return typeof value === 'string' && DECISION_SCOPES.has(value)
    ? (value as ApprovalDecisionScope)
    : undefined;
}

function resolveDecisionFromPayload(
  payload: unknown,
): 'approve' | 'approve_once' | 'deny' | 'block_path' | null {
  if (!isRecord(payload)) {
    return null;
  }
  if (payload.approved === true) {
    const hasRule = isRecord(payload.rule) && typeof payload.rule.kind === 'string';
    return hasRule ? 'approve' : 'approve_once';
  }
  if (payload.approved === false) {
    return payload.blockPath === true ? 'block_path' : 'deny';
  }
  return null;
}

function mapRunError(runId: string, error: unknown): Error {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'unknown_run' || code === 'unknown_interrupt') {
    return new RunNotFoundException(runId);
  }
  if (code === 'already_resumed' || code === 'run_terminal' || code === 'lease_stale') {
    return new RunConflictException((error as Error).message, { runId });
  }
  return error instanceof Error ? error : new RunConflictException('resume failed', { runId });
}
