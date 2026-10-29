import { Injectable, Logger } from '@harnesys/brix';
import type {
  ApprovalDecisionScope,
  ApprovalOption,
  ApprovalRule,
  DecideApprovalBody,
  DecideApprovalResponse,
} from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ApprovalNotFoundException } from '../../domain/approval/approval.error.ts';
import type { ApprovalRecord, ApprovalResumePlan } from '../../domain/approval/approval.ts';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import type { EventClaimRecord } from '../../domain/fleet/event-claim.port.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import {
  persistFileDecision,
  persistShellDecision,
  scopePersistsRule,
  targetAgentIdOf,
} from './persist-decision.ts';
import { shellRulePatternsOf } from './persist-shell-rule.ts';

export interface DecideApprovalRequest {
  orgId: string;
  approvalId: string;
  body: DecideApprovalBody;
}

type ResumeDecision = 'approve' | 'approve_once' | 'deny' | 'close';

interface ApprovalResumeInput {
  row: ApprovalRecord;
  plan: ApprovalResumePlan;
  note?: string;
}

export function resumeDecisionOf(decision: ApprovalOption): ResumeDecision {
  return decision === 'block_path' ? 'deny' : decision;
}

export function resumePayloadOf(
  decision: ApprovalOption,
  extend?: number,
  scope?: ApprovalDecisionScope,
): Record<string, unknown> {
  if (decision === 'close') {
    return { approved: true, close: true };
  }
  return {
    approved: true,
    ...(extend === undefined ? {} : { extend }),
    ...(scope === undefined ? {} : { scope }),
  };
}

export function extensionOf(body: DecideApprovalBody, decided: ApprovalRecord): number | undefined {
  if (body.decision === 'close') {
    return undefined;
  }
  if (body.extend !== undefined) {
    return body.extend;
  }
  return decided.context.budget?.defaultExtend;
}

@Injectable()
export class DecideApprovalUseCase {
  private readonly log: Logger;

  constructor(
    private readonly store: ApprovalStorePort,
    private readonly events: ApprovalEventsPort,
    private readonly executor: LocalExecutorPort,
    private readonly claims: EventClaimPort,
    private readonly commands: NodeCommandQueuePort,
    private readonly agents: AgentRegistryPort,
    private readonly modes: ModePresetRegistryPort,
    private readonly fileRules: FileAccessRulePort,
    private readonly machineConfig: MachineConfigPort,
    private readonly sourceLocation: SourceLocationPort,
    logger: Logger,
  ) {
    this.log = logger.child('decide-approval');
  }

  async execute(request: DecideApprovalRequest): Promise<DecideApprovalResponse> {
    const row = this.store.get(request.orgId, request.approvalId);
    if (!row) {
      throw new ApprovalNotFoundException(request.approvalId);
    }
    const decision = request.body.decision;
    const rule =
      decision === 'approve' || decision === 'block_path' ? request.body.rule : undefined;
    if (rule && rule.kind !== 'file-path') {
      shellRulePatternsOf(rule);
    }
    const extend = extensionOf(request.body, row);
    const scope = request.body.scope ?? (decision === 'approve_once' ? 'once' : undefined);
    const plan: ApprovalResumePlan = {
      decision: resumeDecisionOf(decision),
      ...(extend === undefined ? {} : { extend }),
      ...(scope === undefined ? {} : { scope }),
    };
    const result = this.store.decide(request.orgId, {
      approvalId: request.approvalId,
      decision,
      surface: request.body.surface,
      resume: plan,
      ...(request.body.note === undefined ? {} : { note: request.body.note }),
    });
    if (!result.winner) {
      return { winner: false, status: result.status, resumed: false, resumeState: 'decided' };
    }
    const decided = this.store.get(request.orgId, request.approvalId) ?? row;
    this.persistRule(request.orgId, decided, decision, rule, scope);
    this.events.emit(request.orgId, { type: 'decided', approval: decided });
    const resumeState = await this.resume(request.orgId, {
      row: decided,
      plan,
      note: request.body.note,
    });
    return { winner: true, status: result.status, resumed: resumeState === 'applied', resumeState };
  }

  private persistRule(
    orgId: string,
    decided: ApprovalRecord,
    decision: ApprovalOption,
    rule: ApprovalRule | undefined,
    scope: ApprovalDecisionScope | undefined,
  ): void {
    const deps = {
      orgId,
      agents: this.agents,
      modes: this.modes,
      fileRules: this.fileRules,
      machineConfig: this.machineConfig,
      sourceLocation: this.sourceLocation,
    };
    const agentId = targetAgentIdOf(decided.context.delegated, decided.agentId);
    const file = decided.context.file;
    if (decision === 'block_path') {
      if (!file) {
        return;
      }
      persistFileDecision(deps, { agentId, file, blockPath: true, rule, scope });
      return;
    }
    if (decision !== 'approve' || !scopePersistsRule(scope, rule)) {
      return;
    }
    if (file) {
      persistFileDecision(deps, { agentId, file, blockPath: false, rule, scope });
      return;
    }
    if (rule && rule.kind !== 'file-path') {
      persistShellDecision(deps, { agentId, rule });
    }
  }

  private async resume(orgId: string, input: ApprovalResumeInput): Promise<'decided' | 'applied'> {
    const claim = this.claims.findByRun(orgId, input.row.runId);
    if (claim !== null) {
      if (claimAlive(claim)) {
        this.enqueueRemoteResume(orgId, input, claim.nodeId);
      }
      return 'decided';
    }
    return this.resumeLocal(orgId, input);
  }

  private enqueueRemoteResume(orgId: string, input: ApprovalResumeInput, nodeId: string): void {
    const { row, plan, note } = input;
    this.commands.enqueue(orgId, nodeId, {
      type: 'APPROVAL_RESUME',
      approvalId: row.id,
      runId: row.runId,
      interruptId: row.interruptId,
      decision: plan.decision,
      ...(plan.extend === undefined ? {} : { extend: plan.extend }),
      ...(plan.scope === undefined ? {} : { scope: plan.scope }),
      ...(note === undefined ? {} : { note }),
    });
  }

  private async resumeLocal(
    orgId: string,
    input: ApprovalResumeInput,
  ): Promise<'decided' | 'applied'> {
    const { row, plan, note } = input;
    if (!row.threadId) {
      return 'decided';
    }
    try {
      const session = await this.executor.sessionFor(orgId, row.threadId);
      if (plan.decision === 'deny') {
        await session.reject(row.runId, row.interruptId, { note });
      } else {
        await session.respond(
          row.runId,
          row.interruptId,
          resumePayloadOf(plan.decision, plan.extend, plan.scope),
        );
      }
      this.store.markResumeApplied(orgId, row.id);
      return 'applied';
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'unknown';
      this.log.warn(
        { err, orgId, runId: row.runId, interruptId: row.interruptId, code },
        `approval resume failed: run ${row.runId} did not accept decision '${plan.decision}' (${code})`,
      );
      return 'decided';
    }
  }
}

function claimAlive(claim: EventClaimRecord): boolean {
  return claim.doneAt === null && claim.leaseUntil > new Date().toISOString();
}
