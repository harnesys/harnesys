import { Controller, Get, Param, Query } from '@harnesys/brix';
import type {
  ThreadArtifactsResponse,
  ThreadHistoryPage,
  ThreadHistoryQuery,
  ThreadSubtreeResponse,
  ThreadSummary,
} from '@harnesys/contracts';
import { ThreadHistoryQuerySchema } from '@harnesys/contracts';
import { GetRunSubtreeUseCase } from '../../application/threads/get-run-subtree.use-case.ts';
import { GetThreadHistoryUseCase } from '../../application/threads/get-thread-history.use-case.ts';
import { GetThreadSummaryUseCase } from '../../application/threads/get-thread-summary.use-case.ts';
import { ListRunArtifactsUseCase } from '../../application/threads/list-run-artifacts.use-case.ts';
import type { Principal } from '../../domain/identity/principal.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';

@Controller('orgs/:orgId/threads')
export class ThreadHistoryController {
  constructor(
    private readonly getThreadHistory: GetThreadHistoryUseCase,
    private readonly getThreadSummary: GetThreadSummaryUseCase,
    private readonly getRunSubtree: GetRunSubtreeUseCase,
    private readonly listRunArtifacts: ListRunArtifactsUseCase,
  ) {}

  @Get(':threadId/history')
  history(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @Query(ThreadHistoryQuerySchema) query: ThreadHistoryQuery,
    @SessionPrincipal() principal: Principal,
  ): Promise<ThreadHistoryPage> {
    return this.getThreadHistory.execute({
      orgId,
      threadId,
      ...(query.beforeThreadSeq === undefined ? {} : { beforeThreadSeq: query.beforeThreadSeq }),
      ...(query.fromThreadSeq === undefined ? {} : { fromThreadSeq: query.fromThreadSeq }),
      ...(query.toThreadSeq === undefined ? {} : { toThreadSeq: query.toThreadSeq }),
      ...(query.aroundThreadSeq === undefined ? {} : { aroundThreadSeq: query.aroundThreadSeq }),
      ...(query.limitRuns === undefined ? {} : { limitRuns: query.limitRuns }),
      ...(principal.kind === 'user' ? { userId: principal.userId } : {}),
    });
  }

  @Get(':threadId/summary')
  summary(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @SessionPrincipal() principal: Principal,
  ): Promise<ThreadSummary> {
    return this.getThreadSummary.execute({
      orgId,
      threadId,
      ...(principal.kind === 'user' ? { userId: principal.userId } : {}),
    });
  }

  @Get(':threadId/runs/:runId/subtree')
  subtree(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @Param('runId') runId: string,
  ): Promise<ThreadSubtreeResponse> {
    return this.getRunSubtree.execute({ orgId, threadId, runId });
  }

  @Get(':threadId/artifacts')
  artifacts(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
  ): Promise<ThreadArtifactsResponse> {
    return this.listRunArtifacts.execute({ orgId, threadId });
  }
}
