import { Injectable } from '@harnesys/brix';
import type { OrgSettings, ToolchainSettings } from '@harnesys/contracts';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';
import { nextCronRunAt } from '../schedules/cron-next.ts';
import { toDeskScheduleEvent } from '../schedules/schedule.helpers.ts';

export interface SetOrgSettingsRequest {
  orgId: string;
  patch: Partial<OrgSettings>;
}

@Injectable()
export class SetOrgSettingsUseCase {
  constructor(
    private readonly orgSettings: OrgSettingsPort,
    private readonly schedules: ScheduleRepositoryPort,
    private readonly deskEvents: DeskEventsPort,
    private readonly toolchain: ToolchainPort,
    private readonly lsp: LspPort,
  ) {}

  execute(request: SetOrgSettingsRequest): OrgSettings {
    const before = this.orgSettings.get(request.orgId);
    const after = this.orgSettings.set(request.orgId, request.patch);
    if (after.timezone !== before.timezone) {
      this.reschedule(request.orgId, after.timezone);
    }
    if (hasToolchainChanged(before.toolchain, after.toolchain)) {
      this.toolchain.invalidate(request.orgId);
      this.lsp.invalidateOrg(request.orgId);
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
      const updated = this.schedules.update(orgId, schedule.id, { nextRunAt });
      this.deskEvents.emit(orgId, toDeskScheduleEvent(updated));
    }
  }
}

function hasToolchainChanged(before: ToolchainSettings, after: ToolchainSettings): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}
