import { Injectable } from '@harnesys/brix';
import type { UsageRunsReport, UsageRunsReportRequest } from '../../domain/usage/usage-port.ts';
import { clampRunsLimit, UsagePort } from '../../domain/usage/usage-port.ts';

@Injectable()
export class UsageRunsReportUseCase {
  constructor(private readonly port: UsagePort) {}

  execute(request: UsageRunsReportRequest): UsageRunsReport {
    return this.port.runsReport(request.orgId, {
      orgId: request.orgId,
      ...(request.from ? { from: request.from } : {}),
      ...(request.to ? { to: request.to } : {}),
      limit: clampRunsLimit(request.limit),
    });
  }
}
