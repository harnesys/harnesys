import { Body, Controller, Delete, Get, Param, Put, Query } from '@harnesys/brix';
import { DeletePriceOverrideUseCase } from '../../application/usage/delete-price-override.use-case.ts';
import { ListPriceOverridesUseCase } from '../../application/usage/list-price-overrides.use-case.ts';
import { RunUsageUseCase } from '../../application/usage/run-usage.use-case.ts';
import { SetPriceOverrideUseCase } from '../../application/usage/set-price-override.use-case.ts';
import { UsageReportUseCase } from '../../application/usage/usage-report.use-case.ts';
import { UsageRunsReportUseCase } from '../../application/usage/usage-runs-report.use-case.ts';
import type { UsageReport } from '../../domain/usage/usage-port.ts';
import {
  type PriceOverrideBody,
  PriceOverrideBodySchema,
  type UsageQuery,
  UsageQuerySchema,
  type UsageRunsQuery,
  UsageRunsQuerySchema,
} from './usage.schema.ts';

@Controller('orgs/:orgId/usage')
export class UsageController {
  constructor(
    private readonly report: UsageReportUseCase,
    private readonly runs: UsageRunsReportUseCase,
    private readonly runUsageUseCase: RunUsageUseCase,
    private readonly setPriceOverride: SetPriceOverrideUseCase,
    private readonly listPriceOverrides: ListPriceOverridesUseCase,
    private readonly deletePriceOverride: DeletePriceOverrideUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string, @Query(UsageQuerySchema) query: UsageQuery): UsageReport {
    return this.report.execute({
      orgId,
      groupBy: query.groupBy,
      from: query.from,
      to: query.to,
      agents: query.agents
        ?.split(',')
        .map((agentId) => agentId.trim())
        .filter((agentId) => agentId.length > 0),
    });
  }

  @Get('runs')
  listRuns(@Param('orgId') orgId: string, @Query(UsageRunsQuerySchema) query: UsageRunsQuery) {
    return this.runs.execute({
      orgId,
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
    });
  }

  @Get('runs/:runId')
  runUsage(@Param('orgId') orgId: string, @Param('runId') runId: string) {
    return this.runUsageUseCase.execute(orgId, runId);
  }

  @Put('price-overrides')
  setPrice(
    @Param('orgId') orgId: string,
    @Body(PriceOverrideBodySchema) body: PriceOverrideBody,
  ): { modelId: string; inputPer1M: number; outputPer1M: number } {
    const price = this.setPriceOverride.execute({
      orgId,
      modelId: body.modelId,
      inputPer1M: body.inputPer1M,
      outputPer1M: body.outputPer1M,
    });
    return { modelId: body.modelId, ...price };
  }

  @Get('price-overrides')
  listPrices(@Param('orgId') orgId: string): {
    overrides: { modelId: string; inputPer1M: number; outputPer1M: number }[];
  } {
    const overrides = this.listPriceOverrides.execute({ orgId });
    return {
      overrides: overrides.map((override) => ({
        modelId: override.modelId,
        inputPer1M: override.inputPer1M,
        outputPer1M: override.outputPer1M,
      })),
    };
  }

  @Delete('price-overrides/:modelId')
  removePrice(
    @Param('orgId') orgId: string,
    @Param('modelId') modelId: string,
  ): { removed: boolean } {
    return { removed: this.deletePriceOverride.execute({ orgId, modelId }) };
  }
}
