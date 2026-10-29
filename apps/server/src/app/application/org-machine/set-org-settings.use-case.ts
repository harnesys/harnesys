import { Injectable } from '@harnesys/brix';
import type { OrgSettings } from '@harnesys/contracts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { nextCronRunAt } from '../schedules/cron-next.ts';

export interface SetOrgSettingsRequest {
  orgId: string;
  patch: Partial<OrgSettings>;
}

@Injectable()
export class SetOrgSettingsUseCase {
  constructor(
    private readonly orgSettings: OrgSettingsPort,
    private readonly schedules: ScheduleRepositoryPort,
  ) {}

  execute(request: SetOrgSettingsRequest): OrgSettings {
    const before = this.orgSettings.get(request.orgId).timezone;
    const after = this.orgSettings.set(request.orgId, request.patch);
    if (after.timezone !== before) {
      this.reschedule(request.orgId, after.timezone);
    }
    return after;
  }

  private reschedule(orgId: string, timezone: string): void {
    for (const schedule of this.schedules.listByOrg(orgId)) {
      let nextRunAt: string;
      try {
        nextRunAt = nextCronRunAt(schedule.cron, new Date(), timezone);
      } catch {
        continue;
      }
      this.schedules.update(orgId, schedule.id, { nextRunAt });
    }
  }
}
