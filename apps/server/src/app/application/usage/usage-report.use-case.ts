import { Injectable } from '@harnesys/brix';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import type { UsageReport, UsageReportRequest } from '../../domain/usage/usage-port.ts';
import { UsagePort } from '../../domain/usage/usage-port.ts';

@Injectable()
export class UsageReportUseCase {
  constructor(
    private readonly port: UsagePort,
    private readonly orgSettings: OrgSettingsPort,
  ) {}

  execute(request: UsageReportRequest): UsageReport {
    return this.port.report(request.orgId, {
      ...request,
      timezone: request.timezone ?? this.orgSettings.get(request.orgId).timezone,
    });
  }
}
