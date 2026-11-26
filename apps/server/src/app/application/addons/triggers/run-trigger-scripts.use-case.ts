import { Inject, Injectable, Logger } from '@harnesys/brix';
import { type HookRunStatus, type TriggerGateVerdict, type TriggerPost } from '@harnesys/contracts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerScriptRunRepositoryPort } from '../../../domain/addons/ports/trigger-script-run-repository.port.ts';
import { RunCwdResolverPort } from '../../../domain/thread/run-cwd.port.ts';
import {
  harnessEnv,
  type PostContext,
  parseContext,
  parsePost,
  stdinDoc,
  summaryOf,
  type TriggerRunStatus,
  tailOf,
} from './trigger-script-harness.ts';
import {
  decideAgentless,
  decidePreScript,
  evaluateGate,
  postScriptApplies,
  scriptStatusOf,
  workspaceMissingOutcome,
} from './trigger-script-policy.ts';
import {
  TriggerScriptProcessPort,
  type TriggerScriptProcessResult,
} from './trigger-script-process.port.ts';
import {
  type JobScriptRunOutcome,
  type PostIdentity,
  type PreScriptRunOutcome,
  type RegisterPostScriptInput,
  type RunBase,
  type RunJobScriptInput,
  type RunPostNowInput,
  type RunPostScriptInput,
  type RunPreScriptInput,
} from './trigger-script-types.ts';

export type { TriggerRunStatus } from './trigger-script-harness.ts';
export type {
  JobScriptRunOutcome,
  PreScriptRunOutcome,
  RegisterPostScriptInput,
  RunJobScriptInput,
  RunPostNowInput,
  RunPostScriptInput,
  RunPreScriptInput,
  TriggerScriptContext,
} from './trigger-script-types.ts';

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
      stdin: stdinDoc('pre', input, cwd),
      env: harnessEnv('pre', input, cwd),
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
      const actual = scriptStatusOf(result);
      const detail = actual === 'ok' ? undefined : `onError=${input.pre.onError}`;
      this.recordRun(base, result, gateVerdict, actual, detail);
      return {
        proceed: true,
        cwd,
        ...(decision.note === undefined ? {} : { note: decision.note }),
      };
    }
    this.recordRun(base, result, gateVerdict, decision.status, decision.reason);
    return { proceed: false, cwd, reason: decision.reason };
  }

  async runJob(input: RunJobScriptInput): Promise<JobScriptRunOutcome> {
    const cwd = this.cwdResolver.resolve({ orgId: input.orgId, threadId: input.threadId });
    const base: RunBase = {
      orgId: input.orgId,
      instanceId: input.instanceId,
      addonId: input.addonId,
      stage: 'pre',
      runId: null,
      cwd: cwd ?? '',
    };
    if (cwd === null) {
      this.recordUnavailable(base, 'failed', 'job script skipped: workspace unavailable');
      return {
        decision: decideAgentless({
          mode: input.mode,
          ...(input.escalate === undefined ? {} : { escalate: input.escalate }),
          result: {
            exitCode: null,
            stdout: '',
            stderr: '',
            timedOut: false,
            aborted: false,
            spawnError: 'workspace unavailable',
          },
        }),
        cwd: null,
      };
    }
    const result = await this.process.run({
      script: input.pre.script,
      cwd,
      stdin: stdinDoc('pre', input, cwd),
      env: harnessEnv('pre', input, cwd),
    });
    const gate = input.mode === 'conditional' ? input.escalate?.gate : undefined;
    const gateVerdict = gate === undefined ? 'not-applied' : evaluateGate(gate, result);
    const decision = decideAgentless({
      mode: input.mode,
      ...(input.escalate === undefined ? {} : { escalate: input.escalate }),
      result,
    });
    this.recordRun(base, result, gateVerdict, scriptStatusOf(result));
    return { decision, cwd };
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

  runPostNow(input: RunPostNowInput): void {
    const { context, post, runStatus } = input;
    const identity: PostIdentity = {
      orgId: context.orgId,
      instanceId: context.instanceId,
      addonId: context.addonId,
    };
    if (input.cwd === null) {
      this.recordUnavailable(
        { ...identity, stage: 'post', runId: null, cwd: '' },
        'skipped',
        'post skipped: workspace unavailable',
      );
      return;
    }
    if (!postScriptApplies(post.when, runStatus)) {
      return;
    }
    if (this.triggers.find(context.orgId, context.instanceId) === null) {
      return;
    }
    void this.executePost(
      {
        ...identity,
        triggerId: context.triggerId,
        threadId: context.threadId,
        agentId: context.agentId,
        ...(context.payload === undefined ? {} : { payload: context.payload }),
        firedAt: context.firedAt,
      },
      post,
      input.cwd,
      null,
      runStatus,
    ).catch((error: unknown) => {
      this.logger.warn(
        {
          orgId: identity.orgId,
          instanceId: identity.instanceId,
          error: error instanceof Error ? error.message : String(error),
        },
        'post trigger script crashed',
      );
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
    await this.executePost(
      {
        orgId: pending.orgId,
        instanceId: pending.instanceId,
        addonId: pending.addonId,
        ...parseContext(pending.contextJson),
      },
      post,
      pending.cwd,
      pending.runId,
      input.runStatus,
    );
  }

  private async executePost(
    context: PostContext & PostIdentity,
    post: TriggerPost,
    cwd: string,
    runId: string | null,
    runStatus: TriggerRunStatus,
  ): Promise<void> {
    const result = await this.process.run({
      script: post.script,
      cwd,
      stdin: stdinDoc('post', context, cwd, {
        ...(runId === null ? {} : { id: runId }),
        status: runStatus,
      }),
      env: harnessEnv('post', context, cwd, runId ?? undefined),
    });
    const status = scriptStatusOf(result);
    this.recordRun(
      {
        orgId: context.orgId,
        instanceId: context.instanceId,
        addonId: context.addonId,
        stage: 'post',
        runId,
        cwd,
      },
      result,
      'not-applied',
      status,
    );
    if (status !== 'ok') {
      this.logger.warn(
        {
          orgId: context.orgId,
          instanceId: context.instanceId,
          runId,
          status,
          exitCode: result.exitCode,
        },
        'post trigger script did not succeed',
      );
      return;
    }
    this.logger.debug(
      { orgId: context.orgId, instanceId: context.instanceId, runId },
      'post trigger script finished',
    );
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
