import { Inject, Injectable, Logger } from '@harnesys/brix';
import {
  type HookRunStatus,
  type TriggerGateVerdict,
  type TriggerPost,
  TriggerPostSchema,
  type TriggerPre,
} from '@harnesys/contracts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import type { TriggerScriptPendingPost } from '../../../domain/addons/ports/trigger-script-run-repository.port.ts';
import { TriggerScriptRunRepositoryPort } from '../../../domain/addons/ports/trigger-script-run-repository.port.ts';
import { RunCwdResolverPort } from '../../../domain/thread/run-cwd.port.ts';
import {
  decidePreScript,
  evaluateGate,
  type PreScriptSkipReason,
  postScriptApplies,
  type ScriptResultFacts,
  scriptStatusOf,
  workspaceMissingOutcome,
} from './trigger-script-policy.ts';
import {
  TriggerScriptProcessPort,
  type TriggerScriptProcessResult,
} from './trigger-script-process.port.ts';

const TAIL_MAX = 2000;

export type TriggerRunStatus = 'completed' | 'failed' | 'cancelled';

export interface TriggerScriptContext {
  orgId: string;
  addonId: string;
  instanceId: string;
  triggerId: string;
  threadId: string;
  agentId: string;
  payload?: unknown;
  firedAt: string;
}

export interface RunPreScriptInput extends TriggerScriptContext {
  pre: TriggerPre;
}

export interface PreScriptRunOutcome {
  proceed: boolean;
  cwd: string | null;
  reason?: PreScriptSkipReason;
  note?: string;
}

export interface RegisterPostScriptInput {
  context: TriggerScriptContext;
  post: TriggerPost;
  runId: string;
  cwd: string | null;
}

export interface RunPostScriptInput {
  pending: TriggerScriptPendingPost;
  runStatus: TriggerRunStatus;
}

interface RunBase {
  orgId: string;
  instanceId: string;
  addonId: string;
  stage: 'pre' | 'post';
  runId: string | null;
  cwd: string;
}

interface PostContext {
  triggerId?: string;
  threadId?: string;
  agentId?: string;
  payload?: unknown;
  firedAt?: string;
}

@Injectable()
export class RunTriggerScriptsUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly process: TriggerScriptProcessPort,
    private readonly cwdResolver: RunCwdResolverPort,
    private readonly runs: TriggerScriptRunRepositoryPort,
    private readonly triggers: TriggerInstanceRepositoryPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addon-trigger-scripts');
  }

  resolveCwd(input: { orgId: string; threadId: string }): string | null {
    return this.cwdResolver.resolve(input);
  }

  async runPre(input: RunPreScriptInput): Promise<PreScriptRunOutcome> {
    const cwd = this.cwdResolver.resolve({ orgId: input.orgId, threadId: input.threadId });
    if (cwd === null) {
      const decision = workspaceMissingOutcome(input.pre);
      this.recordUnavailable(
        {
          orgId: input.orgId,
          instanceId: input.instanceId,
          addonId: input.addonId,
          stage: 'pre',
          runId: null,
          cwd: '',
        },
        decision.kind === 'skip' ? decision.status : 'failed',
        'pre skipped: workspace unavailable',
      );
      return { proceed: false, cwd: null, reason: 'workspace-unavailable' };
    }
    const result = await this.process.run({
      script: input.pre.script,
      cwd,
      stdin: this.stdin('pre', input, cwd),
      env: this.harnessEnv('pre', input, cwd),
    });
    const gateVerdict = input.pre.gate ? evaluateGate(input.pre.gate, result) : 'not-applied';
    const decision = decidePreScript({ pre: input.pre, result, gateVerdict });
    const base: RunBase = {
      orgId: input.orgId,
      instanceId: input.instanceId,
      addonId: input.addonId,
      stage: 'pre',
      runId: null,
      cwd,
    };
    if (decision.kind === 'run') {
      this.recordRun(base, result, gateVerdict, 'ok');
      return {
        proceed: true,
        cwd,
        ...(decision.note === undefined ? {} : { note: decision.note }),
      };
    }
    this.recordRun(base, result, gateVerdict, decision.status, decision.reason);
    return { proceed: false, cwd, reason: decision.reason };
  }

  registerPost(input: RegisterPostScriptInput): void {
    const base: RunBase = {
      orgId: input.context.orgId,
      instanceId: input.context.instanceId,
      addonId: input.context.addonId,
      stage: 'post',
      runId: input.runId,
      cwd: input.cwd ?? '',
    };
    if (input.cwd === null) {
      this.recordUnavailable(base, 'skipped', 'post skipped: workspace unavailable');
      return;
    }
    this.runs.savePending({
      orgId: input.context.orgId,
      instanceId: input.context.instanceId,
      addonId: input.context.addonId,
      runId: input.runId,
      cwd: input.cwd,
      postJson: JSON.stringify(input.post),
      contextJson: JSON.stringify({
        triggerId: input.context.triggerId,
        threadId: input.context.threadId,
        agentId: input.context.agentId,
        ...(input.context.payload === undefined ? {} : { payload: input.context.payload }),
        firedAt: input.context.firedAt,
      } satisfies PostContext),
      createdAt: new Date().toISOString(),
    });
  }

  async runPost(input: RunPostScriptInput): Promise<void> {
    const pending = input.pending;
    const post = parsePost(pending.postJson);
    if (post === undefined || !postScriptApplies(post.when, input.runStatus)) {
      return;
    }
    if (this.triggers.find(pending.orgId, pending.instanceId) === null) {
      return;
    }
    const context = parseContext(pending.contextJson);
    const result = await this.process.run({
      script: post.script,
      cwd: pending.cwd,
      stdin: this.stdin('post', context, pending.cwd, {
        id: pending.runId,
        status: input.runStatus,
      }),
      env: this.harnessEnv('post', context, pending.cwd, pending.runId),
    });
    const status = scriptStatusOf(result);
    this.recordRun(
      {
        orgId: pending.orgId,
        instanceId: pending.instanceId,
        addonId: pending.addonId,
        stage: 'post',
        runId: pending.runId,
        cwd: pending.cwd,
      },
      result,
      'not-applied',
      status,
    );
    if (status !== 'ok') {
      this.logger.warn(
        {
          orgId: pending.orgId,
          instanceId: pending.instanceId,
          runId: pending.runId,
          status,
          exitCode: result.exitCode,
        },
        'post trigger script did not succeed',
      );
      return;
    }
    this.logger.debug(
      { orgId: pending.orgId, instanceId: pending.instanceId, runId: pending.runId },
      'post trigger script finished',
    );
  }

  private harnessEnv(
    stage: 'pre' | 'post',
    context: TriggerScriptContext | PostContext,
    cwd: string,
    runId?: string,
  ): Record<string, string> {
    return {
      HARNESYS_STAGE: stage,
      HARNESYS_WORKSPACE: cwd,
      ...(context.triggerId === undefined ? {} : { HARNESYS_TRIGGER_ID: context.triggerId }),
      ...(runId === undefined ? {} : { HARNESYS_RUN_ID: runId }),
    };
  }

  private stdin(
    stage: 'pre' | 'post',
    context: TriggerScriptContext | PostContext,
    cwd: string,
    run?: { id: string; status: TriggerRunStatus },
  ): string {
    const doc: Record<string, unknown> = {
      kind: 'trigger-script',
      stage,
      workspace: cwd,
      triggerId: context.triggerId,
      threadId: context.threadId,
      agentId: context.agentId,
      firedAt: context.firedAt,
      ...(context.payload === undefined ? {} : { payload: context.payload }),
      ...(run === undefined ? {} : { run }),
    };
    try {
      return JSON.stringify(doc);
    } catch {
      return JSON.stringify({ ...doc, payload: null });
    }
  }

  private recordRun(
    base: RunBase,
    result: TriggerScriptProcessResult,
    gateVerdict: TriggerGateVerdict,
    status: HookRunStatus,
    detail?: string,
  ): void {
    this.runs.record({
      ...base,
      status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      gateVerdict,
      summary: summaryOf(base.stage, status, result, detail),
      stdout: tailOf(result.stdout),
      stderr: tailOf(result.stderr),
      createdAt: new Date().toISOString(),
    });
  }

  private recordUnavailable(base: RunBase, status: HookRunStatus, summary: string): void {
    this.runs.record({
      ...base,
      status,
      exitCode: null,
      durationMs: 0,
      gateVerdict: null,
      summary,
      stdout: '',
      stderr: '',
      createdAt: new Date().toISOString(),
    });
  }
}

function summaryOf(
  stage: 'pre' | 'post',
  status: HookRunStatus,
  result: ScriptResultFacts,
  detail?: string,
): string {
  if (result.spawnError !== undefined) {
    return `${stage} failed to start: ${result.spawnError}`;
  }
  if (result.timedOut) {
    return `${stage} timed out`;
  }
  if (detail !== undefined) {
    return `${stage} ${status}: ${detail}`;
  }
  if (status === 'ok') {
    return `${stage} passed`;
  }
  const exit = result.exitCode === null ? 'signal' : String(result.exitCode);
  return `${stage} ${status} (exit ${exit})`;
}

function tailOf(value: string): string {
  return value.length <= TAIL_MAX ? value : value.slice(value.length - TAIL_MAX);
}

function parsePost(json: string): TriggerPost | undefined {
  try {
    const parsed = TriggerPostSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function parseContext(json: string): PostContext {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as PostContext)
      : {};
  } catch {
    return {};
  }
}
