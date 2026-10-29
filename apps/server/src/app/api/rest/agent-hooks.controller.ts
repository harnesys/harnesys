import { Body, Controller, Get, Param, Post, Query } from '@harnesys/brix';
import type {
  HookRunListQuery,
  HookRunListResponse,
  HookTestRequest,
  HookTestResponse,
} from '@harnesys/contracts';
import { HookRunListQuerySchema, HookTestRequestSchema } from '@harnesys/contracts';
import { ListHookRunsUseCase } from '../../application/hooks/list-hook-runs.use-case.ts';
import { TestAgentHookUseCase } from '../../application/hooks/test-agent-hook.use-case.ts';

@Controller('orgs/:orgId/agents/:agentId')
export class AgentHooksController {
  constructor(
    private readonly listHookRuns: ListHookRunsUseCase,
    private readonly testHook: TestAgentHookUseCase,
  ) {}

  @Get('hook-runs')
  runs(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Query(HookRunListQuerySchema) query: HookRunListQuery,
  ): HookRunListResponse {
    return this.listHookRuns.execute({ orgId, agentId, limit: query.limit });
  }

  @Post('hooks/test')
  test(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Body(HookTestRequestSchema) body: HookTestRequest,
  ): Promise<HookTestResponse> {
    return this.testHook.execute({ orgId, agentId, body });
  }
}
