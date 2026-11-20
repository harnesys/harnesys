import { Injectable } from '@harnesys/brix';
import type { UsageIssuesReport, UsageIssuesReportRequest } from '../../domain/usage/usage-port.ts';
import { clampRunsLimit, UsagePort } from '../../domain/usage/usage-port.ts';

@Injectable()
export class UsageIssuesReportUseCase {
  constructor(private readonly port: UsagePort) {}

  execute(request: UsageIssuesReportRequest): UsageIssuesReport {
    return this.port.issuesReport(request.orgId, {
      orgId: request.orgId,
      ...(request.from ? { from: request.from } : {}),
      ...(request.to ? { to: request.to } : {}),
      limit: clampRunsLimit(request.limit),
    });
  }
}
