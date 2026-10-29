import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@harnesys/brix';
import type {
  AcceptedRunResponse,
  CancelRunResponse,
  CreateThreadBody,
  ListThreadsResponse,
  RejectRunBody,
  RespondRunBody,
  RespondRunResponse,
  RetryRunResponse,
  SendThreadRunBody,
  StreamRunEventsQuery,
  ThreadPublic,
  ThreadSummary,
  UpdateThreadBindingBody,
} from '@harnesys/contracts';
import {
  CreateThreadBodySchema,
  RejectRunBodySchema,
  RespondRunBodySchema,
  SendThreadRunBodySchema,
  StreamRunEventsQuerySchema,
  UpdateThreadBindingBodySchema,
} from '@harnesys/contracts';
import type { ThreadPlanRecord } from '@harnesys/studio-shared';
import { CancelRunUseCase } from '../../application/threads/cancel-run.use-case.ts';
import { CreateThreadUseCase } from '../../application/threads/create-thread.use-case.ts';
import { DeleteThreadUseCase } from '../../application/threads/delete-thread.use-case.ts';
import { DeleteThreadEventUseCase } from '../../application/threads/delete-thread-event.use-case.ts';
import { DeleteThreadPlanUseCase } from '../../application/threads/delete-thread-plan.use-case.ts';
import { GetThreadUseCase } from '../../application/threads/get-thread.use-case.ts';
import { GetThreadPlanUseCase } from '../../application/threads/get-thread-plan.use-case.ts';
import { ListThreadsUseCase } from '../../application/threads/list-threads.use-case.ts';
import { MarkThreadReadUseCase } from '../../application/threads/mark-thread-read.use-case.ts';
import { RespondRunUseCase } from '../../application/threads/respond-run.use-case.ts';
import { RetryRunUseCase } from '../../application/threads/retry-run.use-case.ts';
import { userRunStart } from '../../application/threads/run-attribution.ts';
import { SendThreadRunUseCase } from '../../application/threads/send-thread-run.use-case.ts';
import { StreamRunEventsUseCase } from '../../application/threads/stream-run-events.use-case.ts';
import { UpdateThreadBindingUseCase } from '../../application/threads/update-thread-binding.use-case.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';
import { streamRunSse } from './thread-run-sse.ts';

@Controller('orgs/:orgId/threads')
export class ThreadsController {
  constructor(
    private readonly listThreads: ListThreadsUseCase,
    private readonly getThread: GetThreadUseCase,
    private readonly createThread: CreateThreadUseCase,
    private readonly sendThreadRun: SendThreadRunUseCase,
    private readonly cancelRun: CancelRunUseCase,
    private readonly respondRun: RespondRunUseCase,
    private readonly retryRun: RetryRunUseCase,
    private readonly markThreadRead: MarkThreadReadUseCase,
    private readonly getThreadPlan: GetThreadPlanUseCase,
    private readonly deleteThreadPlan: DeleteThreadPlanUseCase,
    private readonly streamRunEvents: StreamRunEventsUseCase,
    private readonly deleteThread: DeleteThreadUseCase,
    private readonly deleteThreadEvent: DeleteThreadEventUseCase,
    private readonly updateThreadBinding: UpdateThreadBindingUseCase,
    private readonly executor: LocalExecutorPort,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): Promise<ListThreadsResponse> {
    return this.listThreads.execute({ orgId });
  }

  @Post()
  @HttpCode(201)
  async create(
    @Param('orgId') orgId: string,
    @Body(CreateThreadBodySchema) body: CreateThreadBody,
  ): Promise<ThreadPublic> {
    return this.createThread.execute({ orgId, body });
  }

  @Get(':threadId')
  get(@Param('orgId') orgId: string, @Param('threadId') threadId: string): Promise<ThreadPublic> {
    return this.getThread.execute({ orgId, threadId });
  }

  @Patch(':threadId/binding')
  updateBinding(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @Body(UpdateThreadBindingBodySchema) body: UpdateThreadBindingBody,
  ): ThreadSummary {
    return this.updateThreadBinding.execute({ orgId, threadId, body });
  }

  @Get(':threadId/plan')
  plan(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
  ): Promise<ThreadPlanRecord | null> {
    return this.getThreadPlan.execute({ orgId, threadId });
  }

  @Delete(':threadId/plan')
  @HttpCode(204)
  async deletePlan(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
  ): Promise<void> {
    await this.deleteThreadPlan.execute({ orgId, threadId });
  }

  @Delete(':threadId')
  @HttpCode(204)
  async remove(@Param('orgId') orgId: string, @Param('threadId') threadId: string): Promise<void> {
    await this.deleteThread.execute({ orgId, threadId });
  }

  @Delete(':threadId/runs/:runId/events/:seq')
  @HttpCode(200)
  removeEvent(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @Param('runId') runId: string,
    @Param('seq') seq: string,
  ): Promise<ThreadPublic> {
    return this.deleteThreadEvent.execute({ orgId, threadId, runId, seq: Number(seq) });
  }

  @Post(':threadId/runs')
  @HttpCode(202)
  sendRun(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @SessionPrincipal() principal: Principal,
    @Body(SendThreadRunBodySchema) body: SendThreadRunBody,
  ): Promise<AcceptedRunResponse> {
    return this.sendThreadRun.execute({
      orgId,
      threadId,
      body,
      attribution: userRunStart(principal),
    });
  }

  @Post(':threadId/send')
  @HttpCode(202)
  sendAlias(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @SessionPrincipal() principal: Principal,
    @Body(SendThreadRunBodySchema) body: SendThreadRunBody,
  ): Promise<AcceptedRunResponse> {
    return this.sendThreadRun.execute({
      orgId,
      threadId,
      body,
      attribution: userRunStart(principal),
    });
  }

  @Post(':threadId/runs/:runId/cancel')
  @HttpCode(200)
  cancel(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @Param('runId') runId: string,
  ): Promise<CancelRunResponse> {
    return this.cancelRun.execute({ orgId, threadId, runId });
  }

  @Post(':threadId/runs/:runId/retry')
  @HttpCode(200)
  retry(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @Param('runId') runId: string,
  ): Promise<RetryRunResponse> {
    return this.retryRun.execute({ orgId, threadId, runId });
  }

  @Post(':threadId/read')
  @HttpCode(200)
  read(@Param('orgId') orgId: string, @Param('threadId') threadId: string): Promise<ThreadPublic> {
    return this.markThreadRead.execute({ orgId, threadId });
  }

  @Post(':threadId/runs/:runId/respond')
  @HttpCode(200)
  respond(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @Param('runId') runId: string,
    @Body(RespondRunBodySchema) body: RespondRunBody,
  ): Promise<RespondRunResponse> {
    return this.respondRun.execute({ orgId, threadId, runId, body });
  }

  @Post(':threadId/runs/:runId/reject')
  @HttpCode(200)
  reject(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @Param('runId') runId: string,
    @Body(RejectRunBodySchema) body: RejectRunBody,
  ): Promise<RespondRunResponse> {
    return this.respondRun.reject({ orgId, threadId, runId, body });
  }

  @Get(':threadId/runs/:runId/events')
  async events(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @Param('runId') runId: string,
    @Query(StreamRunEventsQuerySchema) query: StreamRunEventsQuery,
  ): Promise<Response> {
    const iterable = await this.streamRunEvents.execute({
      orgId,
      threadId,
      runId,
      fromSeq: query.fromSeq,
    });
    const lifecycle = await this.executor.lifecycle(orgId);
    return streamRunSse(runId, iterable, lifecycle);
  }
}
