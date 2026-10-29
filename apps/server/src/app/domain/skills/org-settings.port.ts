import type { OrgSettings } from '@harnesys/contracts';

export abstract class OrgSettingsPort {
  abstract get(orgId: string): OrgSettings;
  abstract set(orgId: string, patch: Partial<OrgSettings>): OrgSettings;
}
