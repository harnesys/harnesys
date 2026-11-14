import { type OrgSettings, OrgSettingsSchema } from '@harnesys/contracts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';

export class FakeOrgSettings extends OrgSettingsPort {
  timezone = 'UTC';
  private readonly items = new Map<string, OrgSettings>();

  get(orgId: string): OrgSettings {
    const stored = this.items.get(orgId);
    if (stored) {
      return stored;
    }
    return OrgSettingsSchema.parse({ timezone: this.timezone });
  }

  set(orgId: string, patch: Partial<OrgSettings>): OrgSettings {
    const next = OrgSettingsSchema.parse({ ...this.get(orgId), ...patch });
    this.items.set(orgId, next);
    return next;
  }
}
