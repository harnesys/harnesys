import { Injectable } from '@harnesys/brix';
import { UsagePort } from '../../domain/usage/usage-port.ts';

export interface RunUsage {
  runId: string;
  tokens: number;
  costUsd: number;
}

@Injectable()
export class RunUsageUseCase {
  constructor(private readonly usage: UsagePort) {}

  execute(orgId: string, runId: string): RunUsage {
    return {
      runId,
      tokens: this.usage.sumRunTokens(orgId, runId),
      costUsd: this.usage.sumCostUsdByRunIds(orgId, [runId]),
    };
  }
}
