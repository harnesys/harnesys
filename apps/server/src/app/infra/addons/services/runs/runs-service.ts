import { Injectable } from '@harnesys/brix';
import { AddonError, protocolMap } from '@harnesys/sdk';
import { z } from 'zod';
import { RunDispatchPort } from '../../../../application/addons/run-dispatch.port.ts';
import { CreateThreadUseCase } from '../../../../application/threads/create-thread.use-case.ts';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { ClockPort } from '../../../../domain/apps/ports/clock.port.ts';
import { MinuteQuota } from '../../dispatcher/rate-limit.ts';
import { serviceMethod } from '../method.ts';

const DISPATCH_PER_MINUTE = 60;
const RUNS_LIMITS = { timeoutMs: 10000 };

const ThreadsCreateParamsSchema = protocolMap['threads.create'].params.extend({
  agentId: z.string().uuid(),
});

@Injectable()
export class RunsHostService implements HostServiceModule {
  readonly namespace = 'runs';
  readonly methods: readonly HostMethodSpec[];
  private readonly quota: MinuteQuota;

  constructor(
    private readonly dispatchPort: RunDispatchPort,
    private readonly createThread: CreateThreadUseCase,
    clock: ClockPort,
  ) {
    this.quota = new MinuteQuota(clock);
    this.methods = [
      serviceMethod('runs.dispatch', RUNS_LIMITS, (ctx, params) => this.dispatch(ctx, params)),
      {
        name: 'threads.create',
        params: ThreadsCreateParamsSchema,
        result: protocolMap['threads.create'].result,
        permission: protocolMap['threads.create'].permission,
        limits: undefined,
        handle: (ctx, params) => this.create(ctx, params as { title?: string; agentId: string }),
      },
    ];
  }

  private async dispatch(
    ctx: HostCallContext,
    params: { threadId?: string; agentId?: string; input: string },
  ): Promise<{ runId: string }> {
    if (!params.threadId || !params.agentId) {
      throw new AddonError('invalid_params', { detail: 'threadId and agentId are required' });
    }
    if (!this.quota.tryConsume(`runs:${ctx.orgId}:${ctx.addonId}`, DISPATCH_PER_MINUTE)) {
      throw new AddonError('quota_exceeded', {
        detail: `runs.dispatch quota exceeded (${DISPATCH_PER_MINUTE} per minute)`,
        retryable: true,
      });
    }
    const result = await this.dispatchPort.dispatch({
      orgId: ctx.orgId,
      threadId: params.threadId,
      agentId: params.agentId,
      text: params.input,
      correlationId: ctx.correlationId,
      signal: ctx.signal,
    });
    if (result.outcome === 'suppressed') {
      throw new AddonError('conflict', { detail: 'dispatch suppressed' });
    }
    if (result.outcome === 'busy') {
      throw new AddonError('rate_limited', { detail: 'dispatch busy', retryable: true });
    }
    if (result.outcome === 'failed') {
      throw new AddonError('internal', { detail: 'dispatch failed' });
    }
    return { runId: result.runId ?? ctx.correlationId };
  }

  private async create(
    ctx: HostCallContext,
    params: { title?: string; agentId: string },
  ): Promise<{ threadId: string }> {
    const thread = await this.createThread.execute({
      orgId: ctx.orgId,
      body: {
        agentId: params.agentId,
        title: params.title,
      },
    });
    return { threadId: thread.id };
  }
}
