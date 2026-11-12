import { Injectable } from '@harnesys/brix';
import { AddonError, protocolMap } from '@harnesys/sdk';
import { z } from 'zod';
import { RunDispatchPort } from '../../../../application/addons/run-dispatch.port.ts';
import { CancelRunUseCase } from '../../../../application/threads/cancel-run.use-case.ts';
import { CompactThreadUseCase } from '../../../../application/threads/compact-thread.use-case.ts';
import { CreateThreadUseCase } from '../../../../application/threads/create-thread.use-case.ts';
import { ListThreadRunsUseCase } from '../../../../application/threads/list-thread-runs.use-case.ts';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { MinuteQuota } from '../../../../domain/addons/rate-limit.ts';
import { ClockPort } from '../../../../domain/apps/ports/clock.port.ts';
import type { CompactThreadResult } from '../../../../domain/thread/local-executor.port.ts';
import type { RunSummaryRecord } from '../../../../domain/thread/run-lifecycle-reader.port.ts';
import { ThreadNotFoundException } from '../../../../domain/thread/thread.error.ts';
import { serviceMethod } from '../method.ts';

const DISPATCH_PER_MINUTE = 60;
const RUNS_LIMITS = { timeoutMs: 10000 };
const COMPACT_PER_MINUTE = 6;
const COMPACT_LIMITS = { timeoutMs: 30000 };

const ThreadsCreateParamsSchema = protocolMap['threads.create'].params.extend({
  agentId: z.string().uuid(),
});

@Injectable()
export class RunsHostService implements HostServiceModule {
  readonly namespace = 'runs';
  readonly methods: readonly HostMethodSpec[];
  private readonly quota: MinuteQuota;
  private readonly compactQuota: MinuteQuota;

  constructor(
    private readonly dispatchPort: RunDispatchPort,
    private readonly createThread: CreateThreadUseCase,
    private readonly cancelRun: CancelRunUseCase,
    clock: ClockPort,
    private readonly listRuns: ListThreadRunsUseCase,
    private readonly compactThread: CompactThreadUseCase,
  ) {
    this.quota = new MinuteQuota(clock);
    this.compactQuota = new MinuteQuota(clock);
    this.methods = [
      serviceMethod('runs.dispatch', RUNS_LIMITS, (ctx, params) => this.dispatch(ctx, params)),
      serviceMethod('runs.cancel', RUNS_LIMITS, (ctx, params) => this.cancel(ctx, params)),
      {
        name: 'threads.create',
        params: ThreadsCreateParamsSchema,
        result: protocolMap['threads.create'].result,
        permission: protocolMap['threads.create'].permission,
        limits: undefined,
        handle: (ctx, params) => this.create(ctx, params as { title?: string; agentId: string }),
      },
      serviceMethod('runs.list', RUNS_LIMITS, (ctx, params) => this.list(ctx, params)),
      serviceMethod('threads.compact', COMPACT_LIMITS, (ctx, params) => this.compact(ctx, params)),
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

  private async cancel(
    ctx: HostCallContext,
    params: { threadId: string; runId: string },
  ): Promise<{ ok: true }> {
    try {
      return await this.cancelRun.execute({
        orgId: ctx.orgId,
        threadId: params.threadId,
        runId: params.runId,
      });
    } catch (error) {
      if (error instanceof ThreadNotFoundException) {
        throw new AddonError('not_found', { detail: error.message });
      }
      throw error;
    }
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

  private async list(
    ctx: HostCallContext,
    params: { threadId: string; status?: string },
  ): Promise<{
    runs: Array<{
      runId: string;
      status: string;
      startedAt: string | null;
      agentId: string | null;
    }>;
  }> {
    let rows: RunSummaryRecord[];
    try {
      rows = await this.listRuns.execute({
        orgId: ctx.orgId,
        threadId: params.threadId,
        status: params.status,
      });
    } catch (error) {
      if (error instanceof ThreadNotFoundException) {
        throw new AddonError('not_found', { detail: error.message });
      }
      throw error;
    }
    return {
      runs: rows.map((row) => ({
        runId: row.runId,
        status: row.status,
        startedAt: row.createdAt,
        agentId: row.agentId,
      })),
    };
  }

  private async compact(
    ctx: HostCallContext,
    params: { threadId: string },
  ): Promise<CompactThreadResult> {
    if (!this.compactQuota.tryConsume(`compact:${ctx.orgId}:${ctx.addonId}`, COMPACT_PER_MINUTE)) {
      throw new AddonError('quota_exceeded', {
        detail: `threads.compact quota exceeded (${COMPACT_PER_MINUTE} per minute)`,
        retryable: true,
      });
    }
    try {
      return await this.compactThread.execute({
        orgId: ctx.orgId,
        threadId: params.threadId,
      });
    } catch (error) {
      if (error instanceof ThreadNotFoundException) {
        throw new AddonError('not_found', { detail: error.message });
      }
      throw error;
    }
  }
}
